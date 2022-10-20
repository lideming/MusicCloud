import { ContextMenu, fadeout, FadeoutResult, Ref, Timer } from "@yuuza/webfx";
import { api } from "../API/Api";
import {
  playerCore,
  PlayingLoopMode,
  playingLoopModes,
} from "../Player/PlayerCore";
import { ui } from "./UI";
import {
  BuildDomExpr,
  Callbacks,
  formatDuration,
  InputStateTracker,
  jsx,
  listenPointerEvents,
  numLimit,
  TextView,
  ToolTip,
  View,
} from "./viewlib";
import play from "../../resources/play.svg";
import pause from "../../resources/pause.svg";
import prev from "../../resources/prev.svg";
import next from "../../resources/next.svg";
import order_seq from "../../resources/order_seq.svg";
import order_random from "../../resources/order_random.svg";
import order_repeat from "../../resources/order_repeat.svg";
import order_repeat_1 from "../../resources/order_repeat_1.svg";
import volume from "../../resources/volume.svg";
import expand from "../../resources/expand.svg";
import type { Track } from "../Track/Track";
import { router } from "./Router";
import { Line, Lyrics, parse } from "../Lyrics/Lyrics";
import { LineView } from "../Lyrics/LyricsView";
import { I, i18n } from "../I18n/I18n";

const loopModeToIcon: Record<PlayingLoopMode, string> = {
  "list-seq": order_seq,
  "list-loop": order_repeat,
  "list-shuffle": order_random,
  "track-loop": order_repeat_1,
};

export class BottomBar extends View {
  trackImg = new View<HTMLImageElement>(
    (
      <img
        class="trackpic clickable"
        onclick={() => router.nav("nowplaying")}
        src=""
      />
    )
  );
  progressBar = new ProgressBar();
  btnPlay = new PlayButton();
  btnPrev = new ControlButton({ icon: prev, title: () => I`prev_track` });
  btnNext = new ControlButton({ icon: next, title: () => I`next_track` });
  btnOrder = new ControlButton({
    icon: order_random,
    title: () => i18n.get("loopmode_" + this.loopMode),
  });
  btnVolume = new VolumeButton();
  btnGroup = new ControlButton({ icon: order_random, title: () => I`Next in group` });
  trackInfo = new TextView(
    (
      <span
        class="track-info clickable"
        onclick={() => router.nav("nowplaying")}
        hidden={() => !this.track}
      >
        <span class="name">{() => this.track?.name}</span>
        <span class="artist">{() => this.track?.artist}</span>
      </span>
    )
  );
  lyrics = new SimpleLyricsView();
  btnFullscreen = new ControlButton({
    icon: expand,
    title: () => I`Fullscreen`,
  });

  track?: Track;
  loopMode: PlayingLoopMode = "list-seq";

  createDom() {
    return (
      <div class="bottombar no-lyrics">
        {this.trackImg}
        <div class="control-split-h">
          {this.progressBar}
          <div class="bottom-controls">
            {this.trackInfo}
            {this.btnOrder}
            {this.btnPrev}
            {this.btnPlay}
            {this.btnNext}
            {this.btnVolume}
            {this.lyrics}
            {this.btnFullscreen}
            {this.btnGroup}
          </div>
        </div>
      </div>
    );
  }

  bindPlayer(player: typeof playerCore) {
    const updatePrevNext = () => {
      this.btnPrev.disabled = !player.getNextTrack(-1);
      this.btnNext.disabled = !player.getNextTrack(1);
    };
    player.onTrackChanged.add(() => {
      if (player.track?.thumburl)
        this.trackImg.dom.src = api.processUrl(player.track?.thumburl)!;
      this.trackImg.toggleClass("noimg", !player.track?.thumburl);
      this.track = player.track!;
      updatePrevNext();
      this.btnFullscreen.hidden = !player.isVideo;
      this.btnGroup.hidden = !player.track?.groupId;
      this.trackInfo.updateDom();
    })();
    player.onStateChanged.add(() => {
      this.btnPlay.setAction(player.isPlaying ? "pause" : "play");
    });
    player.onLoopModeChanged.add(() => {
      this.loopMode = player.loopMode;
      this.btnOrder.icon = loopModeToIcon[player.loopMode];
      this.btnOrder.updateDom();
      updatePrevNext();
    })();
    this.progressBar.bindPlayer(player);
    this.btnVolume.bindPlayer(player);
    this.lyrics.bindPlayer(player);
    this.lyrics.onLyricsChanged.add(() => {
      const hasLyrics = !!this.lyrics.lyrics?.lines?.length;
      this.toggleClass("has-lyrics", hasLyrics);
      this.toggleClass("no-lyrics", !hasLyrics);
    });

    this.btnPlay.onActive.add((e) => {
      e.preventDefault();
      player.isPlaying ? player.pause() : player.play();
    });
    this.btnNext.onActive.add((e) => {
      e.preventDefault();
      player.next();
    });
    this.btnPrev.onActive.add((e) => {
      e.preventDefault();
      player.prev();
    });
    this.btnOrder.onActive.add((e) => {
      e.preventDefault();
      const modes = playingLoopModes;
      player.loopMode =
        modes[(modes.indexOf(player.loopMode) + 1) % modes.length];
    });
    this.btnFullscreen.onActive.add((e) => {
      e.preventDefault();
      router.nav("nowplaying");
      ui.sidebar.toggleHide(true);
      document.documentElement.requestFullscreen();
    });
    this.btnGroup.onActive.add((e) => {
      e.preventDefault();
      const current = playerCore.track!;
      playerCore.track!.getGroup().then((group) => {
        let next =
          group.tracks[
            (group.tracks.findIndex((x) => x.id == current.id) + 1) %
              group.tracks.length
          ];
        // TODO: import Track won't run because of circular deps
        const Track = Object.getPrototypeOf(current).constructor;
        const nextTrack =
          current._bind?.list?.tracks.find((x) => x.id === next.id) ??
          new Track({ infoObj: next, _bind: current._bind });
        const time = playerCore.currentTime;
        playerCore.setTrack(nextTrack, time);
      });
    });
  }
}

class ControlButton extends View {
  title: () => string = () => "";
  constructor({ icon, title }: { icon: string; title: () => string }) {
    super(<div class="control-btn clickable"></div>);
    this.icon = icon;
    this.title = title;
  }
  set icon(val: string) {
    this.dom.innerHTML = val;
  }
  set disabled(val: boolean) {
    this.toggleClass("disabled", val);
  }
  override updateDom() {
    super.updateDom();
    this.dom.title = this.title?.() ?? "";
  }
}

class PlayButton extends ControlButton {
  constructor() {
    super({
      icon: play,
      title: () => (this._action == "play" ? I`Play` : I`Pause`),
    });
    this.toggleClass("play-btn", true);
  }
  _action: "play" | "pause";
  setAction(action: "play" | "pause") {
    this._action = action;
    this.dom.innerHTML = action == "play" ? play : pause;
    this.updateDom();
  }
}

class ProgressBar extends View {
  refCurrentTime = new Ref<HTMLElement>();
  refTotalTime = new Ref<HTMLElement>();
  refBackground = new Ref<HTMLElement>();
  refFill = new Ref<HTMLElement>();
  loudnessMap = new LoudnessMap();
  createDom() {
    return (
      <div class="progress-bar">
        <span ref={this.refCurrentTime} class="time">
          --:--
        </span>
        <div ref={this.refBackground} class="background">
          <div ref={this.refFill} class="fill"></div>
          {this.loudnessMap}
        </div>
        <span ref={this.refTotalTime} class="time">
          --:--
        </span>
      </div>
    );
  }
  bindPlayer(player: typeof playerCore) {
    player.onTrackChanged.add(() => {
      this.refTotalTime.value!.textContent = formatDuration(
        player.track?.length
      );
      this.loudnessMap.updateLoudnessMap(player);
    });
    player.onProgressChanged.add(() => {
      this.refCurrentTime.value!.textContent = formatDuration(
        player.currentTime
      );
      this.refFill.value!.style.width = `${numLimit(
        (player.currentTime / (player.track?.length ?? 0)) * 100,
        0,
        100
      )}%`;
    });
    listenPointerEvents(this.refBackground.value!, (e) => {
      e.ev.preventDefault();
      if (e.action == "up") return;
      const rect = this.refBackground.value!.getBoundingClientRect();
      player.currentTime =
        ((e.point.clientX - rect.left) / rect.width) * player.duration!;
      if (e.action == "down") {
        return "track";
      }
    });
  }
}

class LoudnessMap extends View<HTMLCanvasElement> {
  createDom() {
    return <canvas class="loudness-map" height="32" width="1024" />;
  }

  async updateLoudnessMap(player: typeof playerCore) {
    const track = player.track;
    var louds = await track?._loudmap;
    if (track && !louds) {
      if (this.dom) {
        const ctx = this.dom.getContext("2d")!;
        const { width, height } = this.dom;
        ctx.clearRect(0, 0, width, height);
      }
      track._loudmap = (async () => {
        var resp = (await api.get(
          `tracks/${track.id}/loudnessmap`
        )) as Response;
        if (!resp.ok) return null;
        var ab = await resp.arrayBuffer();
        return (track._loudmap = new Uint8Array(ab));
      })();
      louds = await track._loudmap;
    }
    if (player.track !== track) return;
    if (louds && louds.length > 20) {
      const [width, height] = [Math.min(1024, louds.length / 4), 32];
      this.dom.width = width;
      const smoothWindow = 2;
      const scale = louds.length / (width + (smoothWindow - 1));
      const scaleY = (height / 256) * (256 / Math.log(256));
      const ctx = this.dom.getContext("2d")!;
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      let peakAvgs: number[] = [];
      for (let i = 0; i < width + (smoothWindow - 1); i += 1) {
        const begin = Math.floor(i * scale);
        const end = Math.floor(i * scale + scale);
        let sum = 0;
        for (let i = begin; i < end; i++) {
          sum += louds[i];
        }
        peakAvgs.push(sum / scale);
      }

      peakAvgs = this.smooth(peakAvgs);

      // scale after log()
      const tmp = [...peakAvgs].filter((x) => x > 0).sort((a, b) => a - b);
      const low = Math.log(tmp[Math.floor(tmp.length * 0.02)]) * scaleY;
      const high = Math.log(tmp[Math.floor(tmp.length * 0.99)]) * scaleY;
      const scaleY2 = (height * (0.95 - 0.2)) / (high - low);
      const offsetY2 = height * 0.2 - low * scaleY2;

      ctx.moveTo(-1, height);
      for (let i = 0; i < width; i++) {
        let y = peakAvgs[i];
        if (y <= 0) y = 0;
        else {
          y = Math.log(y);
          y = y * scaleY;
          y *= scaleY2;
          y += offsetY2;
        }
        ctx.lineTo(i, height - y);
        ctx.lineTo(i + 1, height - y);
      }
      ctx.lineTo(width, height);
      ctx.fillStyle = "white";
      ctx.fill();
      this.hidden = false;
    } else {
      this.hidden = true;
    }
  }

  smooth(arr: number[]) {
    var val = arr[0];
    var r: number[] = [];
    for (let i = 1; i < arr.length; i++) {
      var cur = arr[i];
      val += (cur - val) * 0.25;
      if (Math.abs(val) < 1) val = 0;
      r.push(val);
    }
    console.info({ arr, r });
    return r;
  }
}

class ProgressButton extends View {
  fill = new View({
    tag: "div.btn-fill",
  });
  textSpan = new TextView({ tag: "span.text" });

  get text() {
    return this.textSpan.text;
  }
  set text(val) {
    this.textSpan.text = val;
  }

  private _progress: number;
  public get progress(): number {
    return this._progress;
  }
  public set progress(v: number) {
    this.fill.dom.style.width = v * 100 + "%";
    this._progress = v;
  }

  constructor(dom?: BuildDomExpr) {
    super(dom ?? { tag: "div.btn" });
    this.dom.classList.add("btn-progress");
    this.appendView(this.fill);
    this.appendView(this.textSpan);
  }
}

class VolumeButton extends ProgressButton {
  onChanging = new Callbacks<(delta: number) => void>();
  tipView = new ToolTip();
  InputStateTracker: InputStateTracker;
  get state() {
    return this.InputStateTracker.state;
  }

  get progress() {
    return super.progress;
  }
  set progress(val: number) {
    super.progress = val;
    this.updateTip();
    this.toggleClass("full-volume", this.progress == 1);
  }

  constructor(dom?: HTMLElement) {
    super(dom);
    this.addView(new View(<span innerHTML={volume} />));
    this.toggleClass("volume-btn", true);
    this.tipView.toggleClass("volume-tip", true);
    this.InputStateTracker = new InputStateTracker(this.dom);
    this.InputStateTracker.onChanged.add(() => this.updateTip());
    this.dom.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      var delta = ev.deltaY * -0.0005;
      this.onChanging.invoke(this.progress + delta);
    });
    var startX: number;
    var startVol: number;
    listenPointerEvents(this.dom, (e) => {
      if (e.type === "mouse" && e.action === "down" && e.ev.buttons != 1)
        return;
      e.ev.preventDefault();
      if (e.action === "down") {
        this.dom.focus();
        startX = e.point.pageX;
        startVol = this.progress;
        this.dom.classList.add("btn-down");
        this.fill.dom.style.transition = "none";
        return "track";
      } else if (e.action === "move") {
        var deltaX = e.point.pageX - startX;
        this.onChanging.invoke(startVol + deltaX * 0.01);
      } else if (e.action === "up") {
        if (e.ev.type == "touchcancel") this.onChanging.invoke(startVol);
        this.dom.classList.remove("btn-down");
        this.fill.dom.style.transition = "";
      }
      this.updateTip();
    });
    this.dom.addEventListener("click", (e) => {
      this.updateTip();
    });
    const mapKeyAdjustment = {
      ArrowUp: 0.05,
      ArrowDown: -0.05,
      ArrowRight: 0.01,
      ArrowLeft: -0.01,
    };
    this.dom.addEventListener("keydown", (e) => {
      var adj = mapKeyAdjustment[e.code] as number;
      if (adj) {
        e.preventDefault();
        this.onChanging.invoke(this.progress + adj);
      }
    });
  }

  private updateTip() {
    const percent = Math.floor(this.progress * 100);
    this.tipView.text = percent + "%";
    const showing =
      this.state.mouseIn ||
      this.state.mouseDown ||
      (this.state.focusIn && ui.usingKeyboardInput);
    if (showing == this.tipView.shown) {
    } else if (showing) {
      const rect = this.dom.getBoundingClientRect();
      const parent = this.parentView!.dom;
      const parentRect = parent.getBoundingClientRect();
      this.tipView.show({
        x: rect.left + rect.width / 2 - parentRect.left,
        y: rect.top - parentRect.top - 3,
        parent: parent,
      });
    } else {
      this.tipView.close({
        className: "animation-fading-out",
      });
    }
  }

  bindPlayer(player: typeof playerCore) {
    player.onVolumeChanged.add(() => {
      this.progress = player.volume;
    })();
    this.onChanging.add((x) => {
      var r = numLimit(x, 0, 1);
      r = Math.round(r * 100) / 100;
      player.volume = r;
    });
  }
}

class SimpleLyricsView extends View {
  lyrics: Lyrics | null = null;
  currentLine: Line | null = null;
  lineView: LineView | null = null;
  onLyricsChanged = new Callbacks<() => void>();
  createDom() {
    return <div class="lyrics clickable"></div>;
  }
  postCreateDom() {
    super.postCreateDom();
    this.onActive.add(() => {
      router.nav("nowplaying");
    });
  }
  bindPlayer(player: typeof playerCore) {
    const updateLyrics = async () => {
      const track = player.track;
      if (!track) {
        this.lyrics = null;
        this.fadeoutCurrentLineView();
        this.onLyricsChanged.invoke();
        return;
      }
      this.fadeoutCurrentLineView();
      const raw = await track.getLyrics();
      this.lyrics = parse(raw);
      this.onLyricsChanged.invoke();
    };

    player.onTrackChanged.add(updateLyrics);
    api.onTrackInfoChanged.add((newTrack) => {
      if (newTrack.id && newTrack.id === player.track?.id) {
        updateLyrics();
      }
    });

    const updateLine = () => {
      if (!this.lyrics) return;
      const time = player.currentTime;
      const timeForLine = time + 0.5;
      const timeForSpan = time + 0.1;
      let line: Line | null = null;
      for (const x of this.lyrics.lines) {
        if (x.startTime == null) continue;
        if (
          x.startTime > timeForLine &&
          line &&
          !(line.spans?.length == 1 && !line.spans[0].text)
        )
          break;
        line = x;
      }
      if (this.currentLine !== line) {
        this.currentLine = line;
        this.fadeoutCurrentLineView();
        if (line) {
          this.lineView = new LineView(line);
          this.addView(this.lineView);
        }
      }
      if (this.lineView) {
        this.lineView.setCurrentTime(timeForSpan);
      }
      timer.timeout(100);
    };

    const timer = new Timer(updateLine);

    player.onProgressChanged.add(() => {
      updateLine();
    });
  }
  currentFadingout: FadeoutResult | null = null;
  fadeoutCurrentLineView() {
    const view = this.lineView;
    if (view) {
      if (this.currentFadingout) {
        this.currentFadingout.cancel(true);
      }
      this.lineView = null;
      this.currentFadingout = fadeout(view.dom, { remove: false }).onFinished(
        () => {
          this.removeView(view);
          this.currentFadingout = null;
        }
      );
    }
  }
}
