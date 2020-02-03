// file: PlayerCore.ts

import { Track } from "./TrackList";
import { Callbacks, Action, SettingItem } from "./utils";
import { api } from "./Api";

/** 播放器核心：控制播放逻辑 */
export var playerCore = new class PlayerCore {
    audio: HTMLAudioElement;
    track: Track;
    onTrackChanged = new Callbacks<Action>();

    siLoopMode = new SettingItem<PlayingLoopMode>('mcloud-loop', 'str', 'list-loop');
    get loopMode() { return this.siLoopMode.data; }
    set loopMode(val) {
        this.siLoopMode.set(val);
        this.onLoopModeChanged.invoke();
    }
    onLoopModeChanged = new Callbacks<Action>();

    private _state: 'none' | 'playing' | 'paused' | 'stalled' = 'none';
    get state() { return this._state; }
    set state(val) {
        this._state = val;
        this.onStateChanged.invoke();
    }
    onStateChanged = new Callbacks<Action>();

    get currentTime() { return this.audio.currentTime; }
    set currentTime(val) { this.audio.currentTime = val; }
    get duration() { return this.audio.duration; }
    onProgressChanged = new Callbacks<Action>();

    get volume() { return this.audio?.volume ?? 1; }
    set volume(val) { this.audio.volume = val; }
    onVolumeChanged = new Callbacks<Action>();

    get isPlaying() { return this.audio.duration && !this.audio.paused; }
    get isPaused() { return this.audio.paused; }
    get canPlay() { return this.audio.readyState >= 2; }
    init() {
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
        });
        this.audio.addEventListener('ended', () => {
            this.next();
        });
        this.audio.addEventListener('volumechange', () => this.onVolumeChanged.invoke());
    }
    prev() { return this.next(-1); }
    next(offset?: number) {
        var nextTrack = this.track?._bind?.list?.getNextTrack(this.track, this.loopMode, offset);
        if (nextTrack)
            this.playTrack(nextTrack, true);
        else
            this.setTrack(null);
    }
    loadUrl(src: string) {
        if (src) {
            this.audio.src = src;
        } else {
            this.audio.pause();
            this.audio.removeAttribute('src');
        }
        this.audio.load();
    }
    setTrack(track: Track) {
        var oldTrack = this.track;
        this.track = track;
        this.onTrackChanged.invoke();
        if (oldTrack?.url !== this.track?.url)
            this.loadUrl(track ? api.processUrl(track.url) : null);
        this.state = !track ? 'none' : this.audio.paused ? 'paused' : 'playing';
    }
    playTrack(track: Track, forceStart?: boolean) {
        if (track !== this.track) this.setTrack(track);
        if (forceStart) this.audio.currentTime = 0;
        this.play();
    }
    play() {
        this.audio.play();
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