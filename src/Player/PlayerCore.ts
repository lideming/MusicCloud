// file: PlayerCore.ts

import { Track } from "../Track/Track";
import { Callbacks, Action, SettingItem, CancelToken } from "../Infra/utils";
import { I } from "../I18n/I18n";
import { api } from "../API/Api";
import { Toast } from "../Infra/viewlib";
import { Api } from "../API/apidef";
import { Timer } from "../Infra/utils";
import { ui } from "../Infra/UI";

export const playerCore = new class PlayerCore {
    audio: HTMLAudioElement | HTMLVideoElement;
    track: Track | null = null;
    trackProfile: Api.TrackFile | null = null;
    audioLoaded = false;
    objectUrl: string | null = null;
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
    onAudioCreated = new Callbacks<Action>();

    _loadRetryCount = 0;
    _loadRetryTimer = new Timer(() => {
        this.play();
    });

    get currentTime() { return this.audio?.currentTime; }
    set currentTime(val) {
        this.audio.currentTime = val;
        this.onProgressChanged.invoke();
    }
    get duration() {
        if (this.audio && this.audioLoaded && this.audio.readyState >= HTMLMediaElement.HAVE_METADATA)
            return this.audio.duration;
        else
            return this.track?.length;
    }
    onProgressChanged = new Callbacks<Action>();

    get isVideo() { return this.track?.type == "video"; }

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

    get isPlaying() { return this.audio && !!this.audio.duration && !this.audio.paused; }
    get isPaused() { return this.audio.paused; }
    get canPlay() { return this.audio.readyState >= 2; }
    init() {
        // migration
        var siLoop = new SettingItem<PlayingLoopMode>('mcloud-loop', 'str', null!);
        if (siLoop.data !== null) {
            this.loopMode = siLoop.data;
            siLoop.remove();
        }

        this.audio = document.createElement('video');
        this.initAudio();

        api.onTrackInfoChanged.add((newTrack) => {
            if (newTrack.id && newTrack.id === this.track?.id) {
                this.track.infoObj = newTrack;
            }
        });
    }
    initAudio() {
        this.audio.crossOrigin = 'anonymous';
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
            if (this.track && this.track.url) {
                let msg = I`Player error:` + '\n' + (e.message || I`Unknown error.`);
                if (wasPlaying && this.state != 'playing' && this._loadRetryCount++ < 3) {
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
        this.onAudioCreated.invoke();
    }
    prev() { return this.next(-1); }
    next(offset?: number) {
        var nextTrack = this.getNextTrack(offset);
        if (nextTrack)
            this.playTrack(nextTrack, true);
    }

    getNextTrack(offset?: number) {
        return this.track?._bind?.list?.getNextTrack(this.track, this.loopMode, offset);
    }

    loadUrl(src: Blob | string | null) {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }

        this.audioLoaded = !!src;
        if (src) {
            if (src instanceof Blob) {
                src = this.objectUrl = URL.createObjectURL(src);
            }
            this.audio.src = src;
        } else {
            this.audio.pause();
            this.audio.removeAttribute('src');
        }
        this.audio.load();
    }
    async setTrack(track: Track | null, playNow: boolean | number = false) {
        console.info('[PlayerCore] set track: '
            + (track ? `id ${track.id}: ${track.name} - ${track.artist}` : '(null)'));
        var oldTrack = this.track;
        this.track = track;
        this._loadRetryTimer.tryCancel();
        var sameTrack = oldTrack === track
            || (track?.url && oldTrack?.url === track?.url)
                || (track?.blob && track.blob === oldTrack?.blob);
        if (!sameTrack) {
            if (playNow !== false && track) {
                await this.loadTrack(track);
            } else {
                this.loadUrl(null);
            }
            this.currentTime = typeof playNow === 'number' ? playNow : 0;
            this.state = !track ? 'none' : (playNow !== false) ? 'stalled' : 'paused';
        }
        this.onTrackChanged.invoke();
        if (playNow !== false && track) await this.playTrack(track);
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
            ct.throwIfCancelled();
            this.trackProfile = null;
            this.loadUrl(track.blob);
        } else {
            let cur = { profile: '', bitrate: 0, size: track.size } as Api.TrackFile;
            if (track.type == 'video') {
                cur = track.files![0];
            } else {
                var prefer = this.preferBitrate;
                if (prefer && track.files) {
                    track.files.forEach(f => {
                        if (!cur.bitrate || Math.abs(cur.bitrate - prefer) > Math.abs(f.bitrate - prefer)) {
                            cur = f;
                        }
                    });
                }
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

if (navigator['mediaSession']) {
    let mediaSession = navigator['mediaSession'];
    playerCore.onTrackChanged.add(() => {
        try {
            var track = playerCore.track;
            if (!track) return;
            mediaSession.metadata = new MediaMetadata({
                title: track?.name,
                artist: track?.artist,
                artwork: !track?.picurl ? [] : [
                    { src: api.processUrl(track?.picurl) }
                ]
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
