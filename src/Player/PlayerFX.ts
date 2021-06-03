import { Dialog, Func, View } from "../Infra/viewlib";
import { playerCore } from "./PlayerCore";

export const playerFX = new class PlayerFX {
    ctx: AudioContext;
    source: MediaElementAudioSourceNode;
    analyser: AnalyserNode;
    get webAudioInited() { return !!this.ctx; }
    init() {
    }
    initWebAudio() {
        if (this.webAudioInited) return;
        this.ctx = new AudioContext();
        this.source = this.ctx.createMediaElementSource(playerCore.audio);
        chainNodes(
            this.source,
            [
                () => {
                    this.analyser = this.ctx.createAnalyser();
                    this.analyser.fftSize = 8192;
                    return this.analyser;
                },
                this.ctx.destination
            ]
        );
    }
    showUI(ev?: MouseEvent) {
        this.initWebAudio();
        new FXDialog().show(ev);
    }
};

const WIDTH = 800;
const HEIGHT = 600;

class FXDialog extends Dialog {
    canvas = new View<HTMLCanvasElement>({ tag: 'canvas', height: HEIGHT, width: WIDTH });
    constructor() {
        super();
        this.width = '830px';
        this.addContent(this.canvas);
        this.overlay.setFlags({ clickThrough: true });
    }
    postCreateDom() {
        super.postCreateDom();

        const ctx = this.canvas.dom.getContext('2d')!;
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

            const buf = imgBuffer;
            for (let y = 0; y < history.length; y++) {
                for (let x = 0; x < WIDTH; x++) {
                    const val = history[y][x];
                    const bufIdx = 4 * ((x) + WIDTH * (HEIGHT - y - 1));
                    buf[bufIdx + 0] = buf[bufIdx + 1] = buf[bufIdx + 2] = val;
                    buf[bufIdx + 3] = 255;
                }
            }

            ctx.putImageData(imgData, 0, 0);
        };

        requestAnimationFrame(update);
    }
}

function chainNodes(source: AudioNode, nodes: (AudioNode | Func<AudioNode>)[]) {
    let last = source;
    for (let node of nodes) {
        if (typeof node == 'function') {
            node = node();
            if (!node) continue;
        }
        last.connect(node);
        last = node;
    }
}