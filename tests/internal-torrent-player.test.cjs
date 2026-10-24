const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const file of ['internal-torrent-player.source.js', 'internal-torrent-player.js']) {
    test(file + ': adds a persistent choice and routes only opted-in Android torrents', () => {
        let ready, create, registrations = 0, selected = 'android';
        const context = vm.createContext({
            window: { appready: false },
            Lampa: {
                Platform: { is: () => true },
                Params: { values: { player_torrent: { android: 'Android', custom: 'Custom' } } },
                Listener: { follow: (_, callback) => { ready = callback; } },
                Player: { listener: { follow: (_, callback) => { registrations++; create = callback; } } },
                Storage: { field: () => selected }
            }
        });
        const code = fs.readFileSync(require.resolve('../' + file), 'utf8');
        vm.runInContext(code, context);
        assert.equal(create, undefined);
        ready({ type: 'ready' });
        ready({ type: 'ready' });
        context.window.appready = true;
        vm.runInContext(code, context);
        assert.equal(registrations, 1);
        assert.equal(context.Lampa.Params.values.player_torrent.custom, 'Custom');
        assert.equal(context.Lampa.Params.values.player_torrent.inner, '#{settings_param_player_inner}');
        const external = { torrent_hash: 'hash' };
        create({ data: external });
        assert.equal(external.launch_player, undefined);
        selected = 'inner';
        create({});
        const ordinary = { url: 'https://example.invalid/video.mp4' };
        create({ data: ordinary });
        assert.equal(ordinary.launch_player, undefined);
        const explicit = { torrent_hash: 'hash', launch_player: 'android' };
        create({ data: explicit });
        assert.equal(explicit.launch_player, 'android');
        const torrent = { torrent_hash: 'hash' };
        create({ data: torrent });
        assert.equal(torrent.launch_player, 'inner');
        context.Lampa.Platform.is = () => false;
        context.window.krajcikInternalTorrentPlayer = false;
        vm.runInContext(code, context);
        assert.equal(registrations, 1);
    });
}
