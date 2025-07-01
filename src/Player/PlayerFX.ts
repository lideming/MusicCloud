import { Dialog, Func, Ref, Timer, View } from "../ui/utils/view";
import { ui } from "../ui/core/UI";
import { playerCore } from "./PlayerCore";

export const playerFX = new (class PlayerFX {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  gainNode: GainNode;
  lastBuffers: Array<Array<Float32Array>> = []; // [history blocks (from old to new)][channel][sample index] -> sample value
  get webAudioInited() {
    return !!this.ctx;
  }
  init() {}
  async initWebAudio() {
    if (this.webAudioInited) return;
    console.info("[PlayerFX] switching to WebAudio");
    this.ctx = new AudioContext({ latencyHint: "playback" });
    this.source = this.ctx.createMediaElementSource(playerCore.audio);
    chainNodes(this.source, [
      () => {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 8192;
        return this.analyser;
      },
      (this.gainNode = this.ctx.createGain()),
      this.ctx.destination,
    ]);

    // iOS background playing fix
    let lastHiddenTime = -Infinity;
    Ref.effect(() => {
      if (!ui.isVisible.value) {
        lastHiddenTime = performance.now();
      }
    })
    this.ctx.addEventListener("statechange", (e) => {
      console.info("[PlayerFX] audio ctx state", this.ctx.state);
      if (
        this.ctx.state === ("interrupted" as any) &&
        playerCore.state === "playing" &&
        !ui.isVisible.value &&
        performance.now() - lastHiddenTime < 300
      ) {
        console.info("[PlayerFX] try resuming");
        this.ctx.resume();
      }
    });
    playerCore.onStateChanged.add(() => {
      if (playerCore.state === "playing") {
        this.suspendTimer.tryCancel();
        if (this.ctx.state !== "running") {
          this.ctx.resume();
        }
      } else if (
        playerCore.state === "paused" &&
        this.ctx.state === "running"
      ) {
        this.suspendTimer.timeout(1000); // wait for fading effect
      }
    });

    const audioModule = () => {
      //@ts-ignore
      class AudioCollector extends (AudioWorkletProcessor as any) {
        process(inputs, outputs, parameters) {
          this.port.postMessage([...inputs[0]]);
          return true;
        }
      }

      //@ts-ignore
      registerProcessor("audio-collector", AudioCollector);
    };

    await this.ctx.audioWorklet.addModule(
      URL.createObjectURL(
        new Blob([`(${audioModule.toString()})()`], {
          type: "application/javascript",
        }),
      ),
    );

    const workletNode = new AudioWorkletNode(this.ctx, "audio-collector");
    this.gainNode.connect(workletNode);
    workletNode.port.onmessage = (ev) => {
      this.lastBuffers.push(ev.data);
      if (this.lastBuffers.length > 10) {
        this.lastBuffers.shift();
      }
    };
  }
  suspendTimer = new Timer(() => this.ctx.suspend());
  showUI(ev?: MouseEvent) {
    this.initWebAudio();
    new FXDialog().show(ev);
  }
})();

const WIDTH = 800;
const HEIGHT = 300;

const lines = true;

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
    const imgData = ctx.createImageData(WIDTH, HEIGHT);
    const imgBuffer = imgData.data;

    const history: Uint8Array[] = [];

    console.info(history);

    const update = () => {
      if (!this.shown) return;
      requestAnimationFrame(update);
      const analyzer = playerFX.analyser;
      const freq = new Uint8Array(WIDTH);

      analyzer.getByteFrequencyData(freq);

      history.unshift(freq);
      if (history.length > HEIGHT) history.pop();

      const buffers = playerFX.lastBuffers;
      if (!buffers.length) return;
      const totalSamples = buffers.reduce((a, b) => a + b[0].length, 0);

      if (lines) {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        for (let ch = 0; ch < 2; ch++) {
          let bufferIndex = 0;
          let sampleIndex = 0;
          ctx.strokeStyle = ch ? "blue" : "red";
          ctx.beginPath();
          for (let i = 0; i < totalSamples; i++) {
            const sample = buffers[bufferIndex][ch][sampleIndex];
            const x = (i / totalSamples) * WIDTH;
            const y = Math.floor((sample / 2) * HEIGHT + HEIGHT / 2);
            if (!bufferIndex && !sampleIndex) {
              ctx.moveTo(x, y);
            }
            ctx.lineTo(x, y);
            // buf[bufIdx + 3] = 255;
            if (sampleIndex + 1 < buffers[bufferIndex][ch].length) {
              sampleIndex++;
            } else if (bufferIndex + 1 < buffers.length) {
              bufferIndex++;
              sampleIndex = 0;
            } else {
              break;
            }
          }
          ctx.stroke();
        }
      } else {
        const buf = imgBuffer;
        for (let i = 0; i < buf.length; i++) {
          buf[i] = 255;
        }
        for (let ch = 0; ch < 2; ch++) {
          let bufferIndex = 0;
          let sampleIndex = 0;
          for (let x = 0; x < WIDTH; x++) {
            const sample = buffers[bufferIndex][ch][sampleIndex];
            const y = Math.floor((sample / 2) * HEIGHT + HEIGHT / 2);
            const bufIdx = 4 * (x + WIDTH * (HEIGHT - y - 1));
            buf[bufIdx + 1] -= 127;
            buf[bufIdx + (ch ? 0 : 2)] = 0;
            // buf[bufIdx + 3] = 255;
            if (sampleIndex + 1 < buffers[bufferIndex][ch].length) {
              sampleIndex++;
            } else if (bufferIndex + 1 < buffers.length) {
              bufferIndex++;
              sampleIndex = 0;
            } else {
              break;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
      }
    };

    requestAnimationFrame(update);
  }
}

function chainNodes(source: AudioNode, nodes: (AudioNode | Func<AudioNode>)[]) {
  let last = source;
  for (let node of nodes) {
    if (typeof node == "function") {
      node = node();
      if (!node) continue;
    }
    last.connect(node);
    last = node;
  }
}
