/** Internal Torrent Player 0.1.0 — Lampa 3.3.8, Android. */
(function () {
    'use strict';
    function install() {
        if (window.krajcikInternalTorrentPlayer || !Lampa.Platform.is('android')) return;
        window.krajcikInternalTorrentPlayer = true;
        Lampa.Params.values.player_torrent.inner = '#{settings_param_player_inner}';
        Lampa.Player.listener.follow('create', function (event) {
            if (event.data && event.data.torrent_hash && !event.data.launch_player && Lampa.Storage.field('player_torrent') === 'inner') {
                // Explicit runas() choices take precedence later in Player.play().
                event.data.launch_player = 'inner';
            }
        });
    }
    if (window.appready) install();
    else Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') install();
    });
}());
