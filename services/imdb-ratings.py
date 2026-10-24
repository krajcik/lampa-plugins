"""Private read-only IMDb ratings service. Uses only Python's standard library."""
import csv
from contextlib import closing
import gzip
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DATASET = 'https://datasets.imdbws.com/title.ratings.tsv.gz'
TITLE = re.compile(r'tt\d{5,12}\Z')


def build_database(path, stream):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.ratings-')
    os.close(fd)
    try:
        with closing(sqlite3.connect(temporary)) as db, db:
            db.execute('PRAGMA journal_mode=OFF')
            db.execute('CREATE TABLE ratings (id TEXT PRIMARY KEY, rating REAL, votes INTEGER)')
            reader = csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8'), delimiter='\t')
            if reader.fieldnames != ['tconst', 'averageRating', 'numVotes']:
                raise ValueError('Unexpected IMDb dataset header')

            def rows():
                for row in reader:
                    rating, votes = float(row['averageRating']), int(row['numVotes'])
                    if not TITLE.fullmatch(row['tconst']) or not 1 <= rating <= 10 or votes < 1:
                        raise ValueError('Invalid IMDb dataset row')
                    yield row['tconst'], rating, votes

            db.executemany('INSERT INTO ratings VALUES (?, ?, ?)', rows())
            count = db.execute('SELECT count(*) FROM ratings').fetchone()[0]
            if not count:
                raise ValueError('Empty IMDb dataset')
        os.replace(temporary, path)
        return count
    finally:
        Path(temporary).unlink(missing_ok=True)


def lookup(path, title):
    if not TITLE.fullmatch(title):
        raise ValueError('Invalid IMDb ID')
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)) as db:
        row = db.execute('SELECT rating, votes FROM ratings WHERE id=?', (title,)).fetchone()
    return {'id': title, 'rating': row[0] if row else None, 'votes': row[1] if row else 0}


def handler(database):
    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, body):
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store' if status != 200 else 'max-age=3600')
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            if self.path == '/health':
                try:
                    lookup(database, 'tt0000000')
                    self.reply(200, {'ready': True, 'updated_at': int(Path(database).stat().st_mtime)})
                except (OSError, sqlite3.Error):
                    self.reply(503, {'ready': False})
                return
            if not self.path.startswith('/rating/') or not TITLE.fullmatch(self.path[8:]):
                return self.reply(404, {'error': 'not found'})
            try:
                self.reply(200, lookup(database, self.path[8:]))
            except (OSError, sqlite3.Error):
                self.reply(503, {'error': 'ratings unavailable'})

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Accept, Content-Type, X-Requested-With')
            self.send_header('Content-Length', '0')
            self.end_headers()

        def log_message(self, *_args):
            pass

    return Handler


if __name__ == '__main__':
    database = Path(os.environ.get('IMDB_RATINGS_DB', '.local/imdb-ratings.sqlite'))
    if sys.argv[1:] == ['update']:
        with urllib.request.urlopen(DATASET, timeout=60) as response, gzip.GzipFile(fileobj=response) as data:
            print(json.dumps({'titles': build_database(database, data)}))
    elif sys.argv[1:]:
        raise SystemExit('Usage: python3 services/imdb-ratings.py [update]')
    else:
        ThreadingHTTPServer((os.environ.get('IMDB_RATINGS_HOST', '127.0.0.1'), int(os.environ.get('IMDB_RATINGS_PORT', '9120'))), handler(database)).serve_forever()
