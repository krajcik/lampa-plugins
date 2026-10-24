import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location('imdb_ratings', Path(__file__).parents[1] / 'services/imdb-ratings.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)
GOOD = b'tconst\taverageRating\tnumVotes\ntt0816692\t8.7\t1000\ntt0944947\t9.2\t2000\n'


class RatingsTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'ratings.sqlite'
        service.build_database(self.path, io.BytesIO(GOOD))

    def test_exact_id_and_missing_rating(self):
        self.assertEqual(service.lookup(self.path, 'tt0816692')['rating'], 8.7)
        self.assertIsNone(service.lookup(self.path, 'tt0000000')['rating'])
        with self.assertRaises(ValueError):
            service.lookup(self.path, "tt0816692' OR 1=1")

    def test_failed_refresh_keeps_previous_database(self):
        for bad in [b'wrong\theader\n', GOOD.splitlines(keepends=True)[0], GOOD + b'tt1234567\tNaN\t10\n', GOOD + b'tt1234567\t8.0\t0\n']:
            with self.assertRaises((ValueError, sqlite3.Error)):
                service.build_database(self.path, io.BytesIO(bad))
            self.assertEqual(service.lookup(self.path, 'tt0816692')['rating'], 8.7)
        self.assertEqual(list(self.path.parent.glob('.ratings-*')), [])

    def test_http_contract_and_unavailable_database(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), service.handler(self.path))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        url = 'http://127.0.0.1:' + str(server.server_port)
        with urllib.request.urlopen(url + '/health') as response:
            health = json.load(response)
            self.assertTrue(health['ready'])
            self.assertIsInstance(health['updated_at'], int)
        with urllib.request.urlopen(url + '/rating/tt0944947') as response:
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], '*')
            self.assertEqual(json.load(response), {'id': 'tt0944947', 'rating': 9.2, 'votes': 2000})
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(url + '/rating/../../etc/passwd')
        self.assertEqual(error.exception.code, 404)
        error.exception.close()
        self.path.unlink()
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(url + '/rating/tt0944947')
        self.assertEqual(error.exception.code, 503)
        error.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(url + '/health')
        self.assertEqual(error.exception.code, 503)
        error.exception.close()


if __name__ == '__main__':
    unittest.main()
