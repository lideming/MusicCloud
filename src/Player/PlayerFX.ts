import { Dialog, Ref, Timer, View } from "../Infra/viewlib";
import { ui } from "../Infra/UI";
import { playerCore } from "./PlayerCore";

export const playerFX = new (class PlayerFX {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  gainNode: GainNode;
  get webAudioInited() {
    return !!this.ctx;
  }
  init() {}
  initWebAudio() {
    if (this.webAudioInited) return;
    console.info("[PlayerFX] switching to WebAudio");
    this.ctx = new AudioContext({ latencyHint: "playback" });
    this.source = this.ctx.createMediaElementSource(playerCore.audio);
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = playerCore.volumeByGainNode
      ? Math.pow(playerCore.volume, 1.5) * playerCore.normalizingGain.value!
      : 1;
    this.source.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);

    // iOS background playing fix
    let lastHiddenTime = -Infinity;
    Ref.effect(() => {
      if (!ui.isVisible.value) {
        lastHiddenTime = performance.now();
      }
    });
    this.ctx.addEventListener("statechange", () => {
      console.info("[PlayerFX] audio ctx state", this.ctx.state);
      if (
        this.ctx.state === ("interrupted" as any) &&
        (playerCore.state === "playing" || playerCore.state === "stalled") &&
        !ui.isVisible.value &&
        performance.now() - lastHiddenTime < 1000
      ) {
        console.info("[PlayerFX] try resuming");
        this.resumeWebAudio();
      }
    });
    playerCore.onStateChanged.add(() => {
      if (playerCore.state === "playing") {
        this.resumeWebAudio();
      } else if (
        playerCore.state === "paused" &&
        this.ctx.state === "running"
      ) {
        this.suspendTimer.timeout(1000); // wait for fading effect
      }
    });
  }
  resumeWebAudio() {
    this.suspendTimer.tryCancel();
    if (this.ctx.state !== "running") {
      void this.ctx.resume().catch((error) =>
        console.warn("[PlayerFX] unable to resume WebAudio", error),
      );
    }
  }
  initAnalyser() {
    this.initWebAudio();
    if (this.analyser) return;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.gainNode.connect(this.analyser);
  }
  suspendTimer = new Timer(() => this.ctx.suspend());
  showUI(ev?: MouseEvent) {
    this.initAnalyser();
    new FXDialog().show(ev);
  }
})();

const WIDTH = 800;
const HEIGHT = 300;

class FXDialog extends Dialog {
  title = "WebAudio";
  canvas = new View<HTMLCanvasElement>({
    tag: "canvas",
    height: HEIGHT,
    width: WIDTH,
  });
  constructor() {
    super();
    this.width = "830px";
    this.addContent(this.canvas);
    this.overlay.setFlags({ clickThrough: true });
  }
  postCreateDom() {
    super.postCreateDom();

    const ctx = this.canvas.dom.getContext("2d")!;
    const analyser = playerFX.analyser;
    const samples = new Float32Array(analyser.fftSize);

    const update = () => {
      if (!this.shown) return;
      requestAnimationFrame(update);
      analyser.getFloatTimeDomainData(samples);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.strokeStyle = "red";
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = (i / (samples.length - 1)) * WIDTH;
        const y = ((1 - samples[i]) * HEIGHT) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    requestAnimationFrame(update);
  }
}
