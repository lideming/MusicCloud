// file: PlayerCore.ts

import { Track } from "./Track";
import { Callbacks, Action, SettingItem, utils, CancelToken } from "./utils";
import { I } from "./I18n";
import { api } from "./Api";
import { Toast } from "./viewlib";
import { Api } from "./apidef";
import { Timer } from "./utils";
import { ui } from "./UI";

export const playerCore = new class PlayerCore {
    audio: HTMLAudioElement;
    track: Track | null = null;
    trackProfile: Api.TrackFile | null = null;
    audioLoaded = false;
    onTrackChanged = new Callbacks<Action>();

    siPlayer = new SettingItem('mcloud-player', 'json', {
        loopMode: 'list-loop' as PlayingLoopMode,
        volume: 1,
        preferBitrate: 256
    });
    get loopMode() { return this.siPlayer.data.loopMode; }
    set loopMode(val) {
        this.siPlayer.data.loopMode = val;
        this.siPlayer.save();
        this.onLoopModeChanged.invoke();
    }
    onLoopModeChanged = new Callbacks<Action>();

    get preferBitrate() { return this.siPlayer.data.preferBitrate; }

    private _state: 'none' | 'playing' | 'paused' | 'stalled' = 'none';
    get state() { return this._state; }
    set state(val) {
        if (val === this._state) return;
        console.info(`[PlayerCore] state '${this._state}' -> '${val}'`);
        this._state = val;
        this.onStateChanged.invoke();
    }
    onStateChanged = new Callbacks<Action>();

    _loadRetryCount = 0;
    _loadRetryTimer = new Timer(() => {
        this.play();
    });

    get currentTime() { return this.audio?.currentTime; }
    set currentTime(val) { this.audio.currentTime = val; }
    get duration() {
        if (this.audio && this.audioLoaded && this.audio.readyState >= HTMLMediaElement.HAVE_METADATA)
            return this.audio.duration;
        else
            return this.track?.length;
    }
    onProgressChanged = new Callbacks<Action>();

    get volume() { return this.audio?.volume ?? 1; }
    set volume(val) {
        this.audio.volume = val;
        if (val !== this.siPlayer.data.volume) {
            this.siPlayer.data.volume = val;
            this.siPlayer.save();
        }
    }
    onVolumeChanged = new Callbacks<Action>();

    get playbackRate() { return this.audio.playbackRate; }

    get isPlaying() { return !!this.audio.duration && !this.audio.paused; }
    get isPaused() { return this.audio.paused; }
    get canPlay() { return this.audio.readyState >= 2; }
    init() {
        // migration
        var siLoop = new SettingItem<PlayingLoopMode>('mcloud-loop', 'str', null!);
        if (siLoop.data !== null) {
            this.loopMode = siLoop.data;
            siLoop.remove();
        }

        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', () => this.onProgressChanged.invoke());
        this.audio.addEventListener('canplay', () => {
            this._loadRetryCount = 0;
            this.onProgressChanged.invoke();
        });
        this.audio.addEventListener('seeking', () => {
            if (!this.audio.paused)
                this.state = 'stalled';
        });
        this.audio.addEventListener('stalled', () => {
            if (!this.audio.paused)
                this.state = 'stalled';
        });
        this.audio.addEventListener('play', () => {
            this.state = 'stalled';
        });
        this.audio.addEventListener('playing', () => {
            this.state = 'playing';
        });
        this.audio.addEventListener('pause', () => {
            this.state = 'paused';
        });
        this.audio.addEventListener('error', (e) => {
            console.error('[PlayerCore] audio error', e);
            var wasPlaying = this.state !== 'paused' && this.state !== 'stalled';
            this.state = 'paused';
            this.audioLoaded = false;
            if (this.track && this.track.url) {
                let msg = I`Player error:` + '\n' + (e.message || I`Unknown error.`);
                if (wasPlaying && this._loadRetryCount++ < 3) {
                    msg += '\n' + I`Retry after ${3} sec...`;
                    this._loadRetryTimer.timeout(3000);
                }
                Toast.show(msg, 3000);
                if (!ui.isVisible() && ui.notification.isEnabledFor('nowPlaying')) {
                    ui.notification.show(I`Music Cloud`, {
                        body: msg,
                        requireInteraction: false
                    });
                }
            }
        });
        this.audio.addEventListener('ended', () => {
            this.next();
        });
        this.audio.addEventListener('volumechange', () => this.onVolumeChanged.invoke());
        this.audio.volume = this.siPlayer.data.volume;
    }
    prev() { return this.next(-1); }
    next(offset?: number) {
        var nextTrack = this.getNextTrack(offset);
        if (nextTrack)
            this.playTrack(nextTrack, true);
        else
            this.setTrack(null);
    }

    getNextTrack(offset?: number) {
        return this.track?._bind?.list?.getNextTrack(this.track, this.loopMode, offset);
    }

    loadUrl(src: string | null) {
        // Getting `this.audio.src` is very slow when a blob is loaded,
        // so we add this property:
        this.audioLoaded = !!src;
        if (src) {
            this.audio.src = src;
        } else {
            this.audio.pause();
            this.audio.removeAttribute('src');
        }
        this.audio.load();
    }
    async setTrack(track: Track | null, playNow = false) {
        console.info('[PlayerCore] set track: '
            + (track ? `id ${track.id}: ${track.name} - ${track.artist}` : '(null)'));
        var oldTrack = this.track;
        this.track = track;
        this._loadRetryTimer.tryCancel();
        if (oldTrack !== track
            && (oldTrack?.url !== track?.url
                || (track?.blob && track.blob !== oldTrack?.blob))) {
            if (playNow && track) {
                await this.loadTrack(track);
            } else {
                this.loadUrl(null);
            }
        }
        this.state = !track ? 'none' : playNow ? 'stalled' : 'paused';
        this.onTrackChanged.invoke();
        this.onProgressChanged.invoke();
        if (playNow && track) await this.playTrack(track);
    }
    async playTrack(track: Track, forceStart?: boolean) {
        if (track !== this.track) {
            await this.setTrack(track, true);
            return;
        }
        if (forceStart) this.audio.currentTime = 0;
        await this.play();
    }
    private _loadct: CancelToken;
    private async loadTrack(track: Track) {
        this._loadct?.cancel();
        var ct = this._loadct = new CancelToken();
        if (track.blob) {
            this.loadUrl(null); // unload current track before await
            var dataurl = await utils.readBlobAsDataUrl(track.blob);
            ct.throwIfCancelled();
            this.trackProfile = null;
            this.loadUrl(dataurl);
        } else {
            let cur = { profile: '', bitrate: 0, size: track.size } as Api.TrackFile;
            var prefer = this.preferBitrate;
            if (prefer && track.files) {
                track.files.forEach(f => {
                    if (!cur.bitrate || Math.abs(cur.bitrate - prefer) > Math.abs(f.bitrate - prefer)) {
                        cur = f;
                    }
                });
            }
            let url: string;
            if (cur.size == -1) {
                this.loadUrl(null); // unload current track before await
                url = await track.requestFileUrl(cur);
                ct.throwIfCancelled();
            } else {
                url = await track.requestFileUrl(cur);
            }
            this.trackProfile = cur;
            this.loadUrl(api.processUrl(url));
        }
    }
    async play() {
        await this.ensureLoaded();
        try {
            this.audio.play();
        } catch (error) {
            console.error('audio.play() error', error);
            this.state = 'none';
        }
    }
    async ensureLoaded() {
        var track = this.track;
        if (track && !this.audioLoaded)
            await this.loadTrack(track!);
    }
    pause() {
        this.audio.pause();
    }
};

export const playingLoopModes = ['list-seq', 'list-loop', 'list-shuffle', 'track-loop'] as const;

export type PlayingLoopMode = typeof playingLoopModes[number];

// Media Session API
// https://developers.google.com/web/updates/2017/02/media-session
interface MediaSession {
    setActionHandler(
        type: 'play' | 'pause' | 'seekbackward' | 'seekforward'
            | 'seekto' | 'skipad' | 'previoustrack' | 'nexttrack',
        callback: Action
    ): void;
    metadata: any;
    playbackState: 'none' | 'paused' | 'playing';
    constructor;
};
declare var MediaMetadata;

if (navigator['mediaSession']) {
    let mediaSession = navigator['mediaSession'] as MediaSession;
    playerCore.onTrackChanged.add(() => {
        try {
            var track = playerCore.track;
            if (!track) return;
            mediaSession.metadata = new MediaMetadata({
                title: track?.name,
                artist: track?.artist
            });
        } catch { }
    });
    playerCore.onStateChanged.add(() => {
        try {
            mediaSession.playbackState =
                (playerCore.state === 'playing' || playerCore.state === 'stalled') ? 'playing' :
                    (playerCore.state === 'none') ? 'none' : 'paused';
        } catch { }
    });
    mediaSession.setActionHandler('play', () => playerCore.play());
    mediaSession.setActionHandler('pause', () => playerCore.pause());
    mediaSession.setActionHandler('previoustrack', () => playerCore.prev());
    mediaSession.setActionHandler('nexttrack', () => playerCore.next());
}

window.addEventListener('beforeunload', (ev) => {
    if (!playerCore.track || playerCore.audio.paused) return;
    ev.preventDefault();
    return ev.returnValue = 'The player is running. Are you sure to leave?';
});