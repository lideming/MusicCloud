// file: PlayerCore.ts

import { Track } from "./TrackList";
import { ui } from "./UI";
import { Callbacks, Action } from "./utils";
import { api } from "./Api";

/** 播放器核心：控制播放逻辑 */
export var playerCore = new class PlayerCore {
    audio: HTMLAudioElement;
    track: Track;
    loopMode: PlayingLoopMode = 'list-loop';
    onTrackChanged = new Callbacks<Action>();
    get isPlaying() { return this.audio.duration && !this.audio.paused; }
    get isPaused() { return this.audio.paused; }
    get canPlay() { return this.audio.readyState >= 2; }
    constructor() {
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('canplay', () => this.updateProgress());
        this.audio.addEventListener('seeking', () => {
            if (!this.audio.paused)
                ui.playerControl.setState('stalled');
        });
        this.audio.addEventListener('stalled', () => {
            ui.playerControl.setState('stalled');
        });
        this.audio.addEventListener('play', () => {
            ui.playerControl.setState('playing');
        });
        this.audio.addEventListener('playing', () => {
            ui.playerControl.setState('playing');
        });
        this.audio.addEventListener('pause', () => {
            ui.playerControl.setState('paused');
        });
        this.audio.addEventListener('error', (e) => {
            console.log(e);
            ui.playerControl.setState('paused');
        });
        this.audio.addEventListener('ended', () => {
            this.next();
        });
        ui.playerControl.onProgressChanged((x) => {
            this.audio.currentTime = x * this.audio.duration;
        });
        ui.playerControl.onPlayButtonClicked(() => {
            var state = ui.playerControl.state;
            if (state === 'paused') this.play();
            else this.pause();
        });
    }
    prev() { return this.next(-1); }
    next(offset?: number) {
        var nextTrack = this.track?._bind?.list?.getNextTrack(this.track, this.loopMode, offset);
        if (nextTrack)
            this.playTrack(nextTrack);
        else
            this.setTrack(null);
    }
    updateProgress() {
        ui.playerControl.setProg(this.audio.currentTime, this.audio.duration);
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
        ui.trackinfo.setTrack(track);
        this.onTrackChanged.invoke();
        if (oldTrack?.url !== this.track?.url)
            this.loadUrl(track ? api.processUrl(track.url) : null);
    }
    playTrack(track: Track) {
        if (track === this.track) return;
        this.setTrack(track);
        this.play();
    }
    play() {
        this.audio.play();
    }
    pause() {
        this.audio.pause();
    }
};

export type PlayingLoopMode = 'list-seq' | 'list-loop' | 'track-loop';

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