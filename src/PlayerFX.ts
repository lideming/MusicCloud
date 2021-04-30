import { Dialog, Func, View } from "./viewlib";
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
const HEIGHT = 1024;

class FXDialog extends Dialog {
    canvas = new View<HTMLCanvasElement>({tag: 'canvas', height: HEIGHT, width: WIDTH});
    constructor() {
        super();
        this.width = '830px';
        this.addContent(this.canvas);
    }
    postCreateDom() {
        super.postCreateDom();
        
        const ctx = this.canvas.dom.getContext('2d')!;
        const imgData = ctx.createImageData(WIDTH, HEIGHT);
        const imgBuffer = imgData.data;
        imgBuffer.fill(255);

        const history: Uint8Array[] = [];

        console.info(history);

        const update = () => {
            if (!this.shown) return;
            requestAnimationFrame(update);
            const analyzer = playerFX.analyser;
            const freq = new Uint8Array(HEIGHT);

            analyzer.getByteFrequencyData(freq);

            history.unshift(freq);
            if (history.length > WIDTH) history.pop();

            const buf = imgBuffer;
            for (let x = 0; x < history.length; x++) {
                for (let y = 0; y < HEIGHT; y++) {
                    const val = history[x][y];
                    const bufIdx = 4 * ((WIDTH - x - 1) + WIDTH * (HEIGHT - y - 1));
                    buf[bufIdx + 0] = buf[bufIdx + 1] = buf[bufIdx + 2] = val;
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