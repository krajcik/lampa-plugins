(function (root) {
    'use strict';
    var VERSION = '0.1.3';
    var API = 'https://imdb.home.lurno.ru/rating/';
    var CACHE = 'krajcik_interface_ratings_cache';
    var DAY = 86400000;
    function score(value) {
        if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value.trim()))) return null;
        var number = Number(value);
        return Number.isFinite(number) && number >= 1 && number <= 10 ? number.toFixed(1) : null;
    }
    function imdb(value) { return typeof value === 'string' && /^tt\d{5,12}$/.test(value) ? value : ''; }
    function identity(data) {
        if (!data || data.media_type === 'person' || data.media_type === 'collection' || data.profile_path || data.known_for_department || data.episode_number !== undefined) return null;
        var id = imdb(data.imdb_id) || imdb(data.external_ids && data.external_ids.imdb_id) || imdb(data.id);
        if ((!data.source || ['tmdb', 'cub'].includes(data.source)) && /^\d+$/.test(String(data.id || '')) && (data.title || data.name || data.original_title || data.original_name)) {
            var type = data.media_type === 'tv' || data.first_air_date || data.original_name ? 'tv' : 'movie';
            return { key: type + ':' + data.id, type: type, id: data.id, imdb: id };
        }
        return id ? { key: 'imdb:' + id, imdb: id } : null;
    }
    function englishTitle(data) {
        if (!data) return '';
        var original = data.original_title || data.original_name;
        var alternatives = data.alternative_titles || {};
        var titles = alternatives.titles || alternatives.results || [];
        var us = Array.isArray(titles) && titles.find(function (item) { return item && item.iso_3166_1 === 'US' && typeof item.title === 'string'; });
        var title = data.original_language === 'en' ? original : us && us.title;
        if (!title && !data.original_language && Array.isArray(data.origin_country) && data.origin_country.includes('US')) title = original;
        if (typeof title !== 'string') return '';
        title = title.replace(/\s+/g, ' ').trim();
        return title.toLowerCase() === String(data.title || data.name || '').trim().toLowerCase() ? '' : title;
    }
    if (typeof module !== 'undefined' && module.exports) { module.exports = { score: score, imdb: imdb, identity: identity, englishTitle: englishTitle }; return; }
    if (!root.Lampa || root.krajcik_interface) return;
    var L = root.Lampa;
    root.krajcik_interface = { version: VERSION };
    function start() {
        if (root.krajcik_interface.started) return;
        root.krajcik_interface.started = true;
        var cache = L.Storage.get(CACHE, {}), pending = new Map(), queue = [], active = 0, saving;
        var targets = new WeakMap(), observed = new Set();
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.target.isConnected) { observer.unobserve(entry.target); observed.delete(entry.target); }
                else if (entry.isIntersecting) poster(entry.target);
            });
        });
        if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
        function read(key) {
            var item = cache[key];
            return item && typeof item.at === 'number' && item.at <= Date.now() && Date.now() - item.at < Math.min(Number(item.ttl) || 0, DAY) && (item.rating === null || score(item.rating)) && (item.kp === null || score(item.kp)) ? item : null;
        }
        Object.keys(cache).forEach(function (key) { if (!read(key)) delete cache[key]; });
        function remember(key, rating, kp, id, ttl) {
            cache[key] = { rating: rating, kp: kp, imdb: id, at: Date.now(), ttl: ttl };
            if (id) cache['imdb:' + id] = cache[key];
            clearTimeout(saving);
            saving = setTimeout(function () {
                var keys = Object.keys(cache).sort(function (a, b) { return cache[b].at - cache[a].at; });
                keys.slice(500).forEach(function (key) { delete cache[key]; });
                L.Storage.set(CACHE, cache);
            }, 250);
        }
        function inView(node) {
            var page = node.closest('.activity');
            if (page && !page.classList.contains('activity--active') || getComputedStyle(node).visibility === 'hidden') return false;
            var box = node.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
        }
        function alive(target) { return target.node.isConnected && targets.get(target.node) === target && (target.full || inView(target.node)); }
        function draw(target, rating, kp) {
            if (!alive(target)) return;
            rating = target.rating || rating; kp = target.kp || kp;
            if (!rating && !kp) return;
            if (target.full) {
                [['imdb', rating], ['kp', kp]].forEach(function (item) {
                    var badge = target.node.querySelector('.rate--' + item[0]);
                    if (!badge || !item[1]) return;
                    badge.classList.remove('hide');
                    badge.querySelector('div').textContent = item[1];
                });
            } else {
                var view = target.node.querySelector('.card__view');
                if (!view) return;
                var badge = view.querySelector('.krajcik-interface-ratings');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'card__vote krajcik-interface-ratings';
                    view.appendChild(badge);
                }
                badge.textContent = '';
                [['imdb', 'IMDb', rating], ['kp', 'КП', kp]].forEach(function (item) {
                    if (!item[2]) return;
                    var pill = document.createElement('span');
                    pill.className = 'krajcik-interface-' + item[0];
                    pill.textContent = item[1] + ' ' + item[2];
                    pill.setAttribute('aria-label', item[1] + ': ' + item[2] + ' из 10');
                    badge.appendChild(pill);
                });
            }
        }
        function pump() {
            while (active < 2 && queue.length) {
                var job = queue.shift();
                if (!job.targets.some(alive)) { pending.delete(job.key); continue; }
                active++;
                (function (job) {
                    var net = new L.Reguest(), done = false;
                    var timeout = setTimeout(function () { finish(null, false); }, 15000);
                    function finish(rating, known) {
                        if (done) return;
                        done = true; clearTimeout(timeout); net.clear();
                        remember(job.key, rating, job.kp, job.imdb, !known || job.metadataFailed ? 60000 : rating && job.kp ? DAY : 3600000);
                        job.targets.forEach(function (target) { draw(target, rating, job.kp); });
                        pending.delete(job.key); active--; pump();
                    }
                    function fetchRating(id) {
                        if (done) return;
                        job.imdb = imdb(id);
                        if (job.rating) return finish(job.rating, true);
                        if (!job.imdb) return finish(null, true);
                        var cached = read('imdb:' + job.imdb);
                        if (cached && cached.rating) { job.kp = job.kp || cached.kp; return finish(cached.rating, true); }
                        if (!job.targets.some(alive)) return finish(null, false);
                        net.timeout(8000);
                        net.native(API + job.imdb, function (data) {
                            if (!data || data.id !== job.imdb || !(data.rating === null || score(data.rating))) return finish(null, false);
                            finish(score(data.rating), true);
                        }, function () { finish(null, false); });
                    }
                    function resolveId() {
                        if (done) return;
                        if (job.imdb) fetchRating(job.imdb);
                        else L.Api.sources.tmdb.external_ids({ type: job.type, id: job.id }, function (data) { fetchRating(data && data.imdb_id); }, function () { finish(job.rating, false); });
                    }
                    if (job.type && !job.kp) {
                        net.timeout(5000);
                        net.native('https://tmdb.' + L.Manifest.cub_domain + '/3/' + job.type + '/' + job.id + '?api_key=' + encodeURIComponent(L.TMDB.key()), function (data) {
                            if (done) return;
                            var found = imdb(data && (data.imdb_id || data.external_ids && data.external_ids.imdb_id));
                            if (!data || String(data.id) !== String(job.id) || job.imdb && found && job.imdb !== found) { job.metadataFailed = true; return resolveId(); }
                            job.kp = score(data.kp_rating) || job.kp;
                            job.rating = score(data.imdb_rating) || job.rating;
                            fetchRating(job.imdb || found);
                        }, function () { job.metadataFailed = true; resolveId(); });
                    } else resolveId();
                })(job);
            }
        }
        function attach(node, data, full) {
            if (!node || !node.isConnected || (!full && node.classList.contains('card--collection'))) return;
            var id = identity(data);
            if (!id) return;
            if (full) {
                var head = node.querySelector('.full-start-new__head');
                if (head) {
                    var oldTitle = head.querySelector('.krajcik-interface-original');
                    if (oldTitle) oldTitle.remove();
                    var title = englishTitle(data);
                    if (title) {
                        var label = document.createElement('span');
                        label.className = 'krajcik-interface-original';
                        label.textContent = title;
                        label.title = title;
                        head.appendChild(label);
                    }
                }
            }
            var target = { node: node, key: id.key, full: full, rating: score(data.imdb_rating), kp: score(data.kp_rating) };
            targets.set(node, target);
            if (!full) {
                node.classList.add('krajcik-interface-poster');
                node.classList.toggle('krajcik-interface-community', !!(data.cub_hundred_fire || data.cub_hundred_rating));
                var old = node.querySelector('.krajcik-interface-ratings');
                if (old) old.remove();
            }
            var cached = read(id.key);
            draw(target, target.rating, target.kp);
            if (target.rating && target.kp) { remember(id.key, target.rating, target.kp, id.imdb, DAY); return; }
            if (cached) return draw(target, cached.rating, cached.kp);
            var job = pending.get(id.key);
            if (!job) {
                job = Object.assign({ targets: [], rating: target.rating, kp: target.kp }, id);
                pending.set(id.key, job); queue.push(job);
            }
            job.targets.push(target);
            pump();
        }
        function poster(node) {
            if (!node || !node.classList || !node.classList.contains('card')) return;
            if (!identity(node.card_data) || node.classList.contains('card--collection')) {
                targets.delete(node);
                node.classList.remove('krajcik-interface-poster', 'krajcik-interface-community');
                var badge = node.querySelector('.krajcik-interface-ratings');
                if (badge) badge.remove();
                return;
            }
            attach(node, node.card_data, false);
        }
        function watch(node) {
            if (!node || !node.classList || !node.classList.contains('card')) return;
            if (!identity(node.card_data) || node.classList.contains('card--collection')) { observer.unobserve(node); observed.delete(node); return poster(node); }
            if (!observed.has(node)) { observed.add(node); observer.observe(node); }
            if (observed.size > 256) prune();
            if (inView(node)) poster(node);
        }
        function prune() {
            observed.forEach(function (node) { if (!node.isConnected) { observer.unobserve(node); observed.delete(node); } });
        }
        var style = document.createElement('style');
        style.textContent = '.krajcik-interface .full-start__rate.rate--tmdb{display:none!important}' +
            '.krajcik-interface .full-start-new__body{align-items:flex-start}' +
            '.krajcik-interface .full-start-new__right{min-width:0}' +
            '.krajcik-interface .full-start-new .original_title{display:none!important}' +
            '.krajcik-interface .full-start-new__head{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.krajcik-interface-original{margin-left:.7em;opacity:.7}' +
            '.krajcik-interface-poster:not(.krajcik-interface-community) .card__view>.card__vote:not(.krajcik-interface-ratings){display:none!important}' +
            '.card__vote.krajcik-interface-ratings{pointer-events:none;white-space:nowrap;display:flex;flex-direction:column;align-items:flex-end;gap:.2em;background:none;padding:0;left:auto;right:.3em;bottom:.3em;font-size:1.3em;line-height:1.2}' +
            '.krajcik-interface-ratings>span{background:rgba(0,0,0,.5);border-radius:1em;padding:.2em .4em}' +
            '.krajcik-interface-poster .card__view .myshows-poster-rating{top:auto!important;left:auto!important;right:.3em!important;bottom:.3em!important;background:rgba(0,0,0,.5)!important;font-size:1.3em!important;line-height:1.2!important;padding:.2em .4em!important;border-radius:1em}' +
            '.krajcik-interface-poster .card__view:has(.myshows-poster-rating) .krajcik-interface-ratings{bottom:2.1em}' +
            '.krajcik-interface-community .krajcik-interface-ratings{bottom:2.1em}' +
            '.krajcik-interface-community .card__view .myshows-poster-rating{bottom:2.1em!important}' +
            '.krajcik-interface-community .card__view:has(.myshows-poster-rating) .krajcik-interface-ratings{bottom:3.9em}';
        document.head.appendChild(style);
        document.body.classList.add('krajcik-interface');
        document.addEventListener('visible', function (event) { watch(event.target); }, true);
        root.Lampa.Listener.follow('activity', function (event) {
            prune();
            if (event.type === 'start' || event.type === 'archive') observed.forEach(function (node) { if (inView(node)) poster(node); });
        });
        root.Lampa.Listener.follow('full', function (event) {
            if (event.type === 'complite' && event.data && event.data.movie) attach(event.body[0] || event.body, event.data.movie, true);
        });
        document.querySelectorAll('.card.layer--visible').forEach(watch);
        L.Manifest.plugins = { type: 'other', version: VERSION, name: 'Интерфейс · рейтинги', description: 'IMDb и Кинопоиск вместо TMDB на постерах и в карточке фильма или сериала.' };
    }
    if (root.appready) start();
    else root.Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})(typeof window !== 'undefined' ? window : globalThis);
