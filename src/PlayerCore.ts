// file: PlayerCore.ts

import { Track } from "./Track";
import { Callbacks, Action, SettingItem, I, utils, CancelToken } from "./utils";
import { api } from "./Api";
import { Toast } from "./viewlib";
import { Api } from "./apidef";

/** 播放器核心：控制播放逻辑 */
export var playerCore = new class PlayerCore {
    audio: HTMLAudioElement;
    track: Track | null;
    audioLoaded = false;
    onTrackChanged = new Callbacks<Action>();

    siPlayer = new SettingItem('mcloud-player', 'json', {
        loopMode: 'list-loop' as PlayingLoopMode,
        volume: 1,
        preferBitrate: 0
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
        this._state = val;
        this.onStateChanged.invoke();
    }
    onStateChanged = new Callbacks<Action>();

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

    get isPlaying() { return this.audio.duration && !this.audio.paused; }
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
        this.audio.addEventListener('canplay', () => this.onProgressChanged.invoke());
        this.audio.addEventListener('seeking', () => {
            if (!this.audio.paused)
                this.state = 'stalled';
        });
        this.audio.addEventListener('stalled', () => {
            this.state = 'stalled';
        });
        this.audio.addEventListener('play', () => {
            this.state = 'playing';
        });
        this.audio.addEventListener('playing', () => {
            this.state = 'playing';
        });
        this.audio.addEventListener('pause', () => {
            this.state = 'paused';
        });
        this.audio.addEventListener('error', (e) => {
            console.log(e);
            this.state = 'paused';
            if (this.audioLoaded) {
                Toast.show(I`Player error:` + '\n' + e.message, 3000);
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
        var nextTrack = this.track?._bind?.list?.getNextTrack(this.track, this.loopMode, offset);
        if (nextTrack)
            this.playTrack(nextTrack, true);
        else
            this.setTrack(null);
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
    async setTrack(track: Track | null, loadNow = false) {
        var oldTrack = this.track;
        this.track = track;
        if (oldTrack !== track
                && (oldTrack?.url !== track?.url
                || (track?.blob && track.blob !== oldTrack?.blob))) {
            if (loadNow && track) {
                await this.loadTrack(track);
            } else {
                this.loadUrl(null);
            }
        }
        this.state = !track ? 'none' : this.audio.paused ? 'paused' : 'playing';
        this.onTrackChanged.invoke();
        this.onProgressChanged.invoke();
    }
    async playTrack(track: Track, forceStart?: boolean) {
        if (track !== this.track) await this.setTrack(track, true);
        if (forceStart) this.audio.currentTime = 0;
        await this.play();
    }
    private _loadct: CancelToken;
    private async loadTrack(track: Track) {
        this._loadct?.cancel();
        var ct = this._loadct = new CancelToken();
        if (track.blob) {
            var dataurl = await utils.readBlobAsDataUrl(track.blob);
            ct.throwIfCancelled();
            this.loadUrl(dataurl);
        } else {
            let cur = { url: track.url, bitrate: 0 } as Api.TrackFile;
            var prefer = this.preferBitrate;
            if (prefer && track.files) {
                track.files.forEach(f => {
                    if (!cur.bitrate || Math.abs(cur.bitrate - prefer) > Math.abs(f.bitrate - prefer)) {
                        cur = f;
                    }
                });
            }
            if (!cur.url) {
                await track.requestFileUrl(cur);
                ct.throwIfCancelled();
            }
            this.loadUrl(api.processUrl(cur.url!));
        }
    }
    async play() {
        await this.ensureLoaded();
        this.audio.play();
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

export const playingLoopModes = ['list-seq', 'list-loop', 'track-loop'] as const;

export type PlayingLoopMode = typeof playingLoopModes[number];

// Media Session API
// https://developers.google.com/web/updates/2017/02/media-session
declare var MediaMetadata: any;
if (navigator['mediaSession']) {
    let mediaSession = navigator['mediaSession'];
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