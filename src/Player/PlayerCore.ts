// file: PlayerCore.ts

import { Track } from "../Track/Track";
import {
  Callbacks,
  Action,
  SettingItem,
  CancelToken,
  Ref,
  isIOS,
} from "../ui/utils/view";
import { I } from "../I18n/I18n";
import { api } from "../API/Api";
import { Toast } from "../ui/utils/view";
import { Api } from "../API/apidef";
import { Timer } from "../ui/utils/view";
import { ui } from "../ui/core/UI";
import { playerFX } from "./PlayerFX";

export const playerCore = new (class PlayerCore {
  audio: HTMLAudioElement | HTMLVideoElement;
  track: Track | null = null;
  trackProfile: Api.TrackFile | null = null;
  trackChangedReason: "" | "restore" = "";
  audioLoaded = false;
  objectUrl: string | null = null;
  onTrackChanged = new Callbacks<Action>();

  siPlayer = new SettingItem("mcloud-player", "json", {
    loopMode: "list-loop" as PlayingLoopMode,
    volume: 1,
    preferBitrate: 256,
    loudnessNormalization: true,
  });
  get loopMode() {
    return this.siPlayer.data.loopMode;
  }
  set loopMode(val) {
    this.siPlayer.data.loopMode = val;
    this.siPlayer.save();
    this.onLoopModeChanged.invoke();
  }
  onLoopModeChanged = new Callbacks<Action>();

  get preferBitrate() {
    return this.siPlayer.data.preferBitrate;
  }

  stateRef: Ref<"none" | "playing" | "paused" | "stalled"> = new Ref("none");
  get state() {
    return this.stateRef.value!;
  }
  set state(val) {
    if (val === this.stateRef.value) return;
    console.info(`[PlayerCore] state '${this.stateRef.value}' -> '${val}'`);
    this.stateRef.value = val;
    this.onStateChanged.invoke();
  }
  onStateChanged = new Callbacks<Action>();
  onAudioCreated = new Callbacks<Action>();

  _loadRetryCount = 0;
  _loadRetryTimer = new Timer(() => {
    this.play();
  });

  get currentTime() {
    return this.audio?.currentTime;
  }
  set currentTime(val) {
    this.audio.currentTime = val;
    this.onProgressChanged.invoke();
  }
  get duration() {
    if (
      this.audio &&
      this.audioLoaded &&
      this.audio.readyState >= HTMLMediaElement.HAVE_METADATA
    )
      return this.audio.duration;
    else return this.track?.length;
  }
  onProgressChanged = new Callbacks<Action>();

  get isVideo() {
    return this.track?.type == "video";
  }

  private _volume = new Ref(1);
  get volume() {
    return this._volume.value!;
  }
  set volume(val) {
    this._volume.value = val;
  }
  onVolumeChanged = new Callbacks<Action>();

  normalizingGain = new Ref(1);
  effectiveGain = Ref.computed(
    () => Math.pow(this.volume, 1.5) * this.normalizingGain.value!,
  );

  volumeByGainNode = false;

  get playbackRate() {
    return this.audio.playbackRate;
  }

  get isPlaying() {
    return ["stalled", "playing"].includes(this.state);
  }
  get isPaused() {
    return this.audio.paused;
  }
  get canPlay() {
    return this.audio.readyState >= 2;
  }
  init() {
    // migration
    var siLoop = new SettingItem<PlayingLoopMode>("mcloud-loop", "str", null!);
    if (siLoop.data !== null) {
      this.loopMode = siLoop.data;
      siLoop.remove();
    }

    this.audio = document.createElement("video");
    this.initAudio();

    api.onTrackInfoChanged.add((newTrack) => {
      if (newTrack.id && newTrack.id === this.track?.id) {
        this.track.infoObj = newTrack;
      }
    });
  }
  initAudio() {
    this.audio.crossOrigin = "anonymous";
    this.audio.setAttribute("webkit-playsinline", "");
    this.audio.setAttribute("playsinline", "");
    this.audio.addEventListener("timeupdate", () => {
      this.onProgressChanged.invoke();
      this.checkPreload();
    });
    this.audio.addEventListener("canplay", () => {
      this._loadRetryCount = 0;
      this.onProgressChanged.invoke();
    });
    this.audio.addEventListener("waiting", () => {
      if (!this.audio.paused) this.state = "stalled";
    });
    this.audio.addEventListener("play", () => {
      this.state = "stalled";
    });
    this.audio.addEventListener("playing", () => {
      this.state = "playing";
    });
    this.audio.addEventListener("pause", () => {
      this.state = "paused";
    });
    this.audio.addEventListener("error", (e: ErrorEvent) => {
      console.error("[PlayerCore] audio error", e);
      var wasPlaying = this.state !== "paused" && this.state !== "stalled";
      if (this.track && this.track.url) {
        let msg = I`Player error:` + "\n" + (e.message || I`Unknown error.`);
        if (
          wasPlaying &&
          this.state != "playing" &&
          this._loadRetryCount++ < 3
        ) {
          msg += "\n" + I`Retry after ${3} sec...`;
          this._loadRetryTimer.timeout(3000);
        }
        Toast.show(msg, 3000);
        if (!ui.isVisible.value && ui.notification.isEnabledFor("nowPlaying")) {
          ui.notification.show(I`Music Cloud`, {
            body: msg,
            requireInteraction: false,
          });
        }
      }
    });
    this.audio.addEventListener("ended", () => {
      this.next();
    });
    this.audio.addEventListener("volumechange", () =>
      this.onVolumeChanged.invoke(),
    );

    // audio.volume doesn't work in iOS
    this.volumeByGainNode = isIOS;

    this._volume.onChanged.add((ref) => {
      this.siPlayer.data.volume = ref.value!;
      this.siPlayer.save();
      this.onVolumeChanged.invoke();
    });
    this.effectiveGain.onChanged.add((ref) => {
      if (this.volumeByGainNode) {
        if (playerFX.webAudioInited) {
          playerFX.gainNode.gain.value = ref.value!;
        }
      } else {
        this.audio.volume = ref.value!;
      }
    });

    this.volume = this.siPlayer.data.volume;
    this.onAudioCreated.invoke();
  }
  prev() {
    return this.next(-1);
  }
  next(offset?: number) {
    var nextTrack = this.getNextTrack(offset);
    if (nextTrack) this.playTrack(nextTrack, true);
  }

  getNextTrack(offset?: number) {
    return this.track?._bind?.list?.getNextTrack(
      this.track,
      this.loopMode,
      offset,
    );
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
      this.audio.load();
    } else {
      this.audio.pause();
      // this.audio.removeAttribute("src");
    }
  }
  async setTrack(
    track: Track | null,
    playNow: boolean | number = false,
    reason: "restore" | "" = "",
  ) {
    console.info(
      "[PlayerCore] set track: " +
        (track ? `id ${track.id}: ${track.name} - ${track.artist}` : "(null)"),
    );
    var oldTrack = this.track;
    this.track = track;
    this._loadRetryTimer.tryCancel();
    var sameTrack =
      oldTrack === track ||
      (track?.url && oldTrack?.url === track?.url) ||
      (track?.blob && track.blob === oldTrack?.blob);
    if (!sameTrack) {
      if (playNow !== false && track) {
        await this.loadTrack(track);
      } else {
        this.loadUrl(null);
      }
      this.currentTime = typeof playNow === "number" ? playNow : 0;
      this.state = !track ? "none" : playNow !== false ? "stalled" : "paused";
    }
    this.trackChangedReason = reason;
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
    var ct = (this._loadct = new CancelToken());
    if (track.blob) {
      this.loadUrl(null); // unload current track before await
      ct.throwIfCancelled();
      this.trackProfile = null;
      this.loadUrl(track.blob);
    } else {
      const file = this.decideFileFromTrack(track);
      let url: string;
      if (file.size == -1) {
        this.loadUrl(null); // unload current track before await
        url = await track.requestFileUrl(file);
        ct.throwIfCancelled();
      } else {
        url = await track.requestFileUrl(file);
      }
      this.trackProfile = file;
      this.loadUrl(api.processUrl(url));
    }
  }
  decideFileFromTrack(track: Track) {
    let cur = { profile: "", bitrate: 0, size: track.size } as Api.TrackFile;
    if (track.type == "video") {
      cur = track.files![0];
    } else {
      var prefer = this.preferBitrate;
      if (prefer && track.files) {
        track.files.forEach((f) => {
          if (
            !cur.bitrate ||
            Math.abs(cur.bitrate - prefer) > Math.abs(f.bitrate - prefer)
          ) {
            cur = f;
          }
        });
      }
    }
    return cur;
  }
  async play() {
    this.state = "stalled";
    await this.ensureLoaded();
    if (this.volumeByGainNode && !playerFX.webAudioInited) {
      playerFX.initWebAudio();
      playerFX.gainNode.gain.value = this.effectiveGain.value!;
    }
    try {
      this.audio.play();
    } catch (error) {
      console.error("audio.play() error", error);
      this.state = "none";
    }
  }
  async ensureLoaded() {
    if (this.track) {
      await Promise.all([
        this.computeNormalizingGain(),
        !this.audioLoaded && this.loadTrack(this.track!),
      ]);
    }
  }
  async computeNormalizingGain() {
    if (this.siPlayer.data.loudnessNormalization === false) {
      this.normalizingGain.value = 1;
      return;
    }
    const data = await this.track?.getLoudnessMap();
    if (!data || data.length < 10) {
      this.normalizingGain.value = 1;
      return;
    }
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length;
    const sorted = data.slice().sort();
    const trackGain = sorted[Math.floor(sorted.length * (90 / 100))];
    const trackDb = Math.log10(trackGain / 128) * 10;
    const targetDb = -7;
    const gain = Math.pow(10, (targetDb - trackDb) / 10);
    console.info("[PlayerCore] computed normalizing gain", this.track?.name, {
      avg,
      trackGain,
      trackDb,
      gain,
    });
    this.normalizingGain.value = Math.min(1, gain);
  }
  pause() {
    this.audio.pause();
  }

  preloadedTrack: Track | null = null;
  checkPreload() {
    if (
      this.currentTime &&
      this.duration &&
      this.currentTime >= this.duration - 20
    ) {
      const nextTrack = this.getNextTrack(1);
      if (
        nextTrack &&
        nextTrack !== this.track &&
        nextTrack !== this.preloadedTrack
      ) {
        this.preloadedTrack = nextTrack;
        console.info(`[PlayerCore] preload starting for ${nextTrack.name}`);
        const timeBegin = performance.now();
        nextTrack.preload().then(() => {
          const dur = performance.now() - timeBegin;
          console.info(`[PlayerCore] preload finished in ${dur}ms`);
        });
      }
    }
  }
})();

export const playingLoopModes = [
  "list-seq",
  "list-loop",
  "list-shuffle",
  "track-loop",
] as const;

export type PlayingLoopMode = (typeof playingLoopModes)[number];

export let syncMediaSession = () => {};

if (navigator.mediaSession) {
  const { mediaSession } = navigator;
  syncMediaSession = () => {
    mediaSession.setPositionState?.({
      position: playerCore.currentTime,
      duration: playerCore.duration,
      playbackRate: playerCore.state === 'playing' ? playerCore.playbackRate : 0,
    });
  };
  playerCore.onTrackChanged.add(() => {
    try {
      var track = playerCore.track;
      if (!track) return;
      syncMediaSession();
      mediaSession.metadata = new MediaMetadata({
        title: track?.name,
        artist: track?.artist,
        artwork: !track?.picurl ? [] : [{ src: api.processUrl(track?.picurl) }],
      });
    } catch {}
  });
  playerCore.onStateChanged.add(() => {
    try {
      mediaSession.playbackState =
        playerCore.state === "playing" || playerCore.state === "stalled"
          ? "playing"
          : playerCore.state === "none"
          ? "none"
          : "paused";
      syncMediaSession();
    } catch {}
  });
  mediaSession.setActionHandler("play", () => playerCore.play());
  mediaSession.setActionHandler("pause", () => playerCore.pause());
  mediaSession.setActionHandler("previoustrack", () => playerCore.prev());
  mediaSession.setActionHandler("nexttrack", () => playerCore.next());
}

window.addEventListener("beforeunload", (ev) => {
  if (!playerCore.track || playerCore.audio.paused) return;
  if (window["_mcDesktop"]) return;
  ev.preventDefault();
  return (ev.returnValue = "The player is running. Are you sure to leave?");
});
