import { Callbacks } from "@yuuza/webfx";
import { Action, numLimit, View } from "./viewlib";

export * from "@yuuza/webfx";

export class ScrollAnimator {
    constructor(readonly view: View) {
        this.view.dom.addEventListener('scroll', (e) => {
            if (e.target === view.dom) {
                if (this.scrollEventPending) {
                    this.scrollEventPending = false;
                } else {
                    this.onUserScroll.invoke(e);
                    this.cancel();
                }
            }
        });
    }
    duration = 300;
    private beginTime = -1;
    beginPos = 0;
    lastPos = 0;
    targetPos = 0;
    private _rafHandle = -1;
    posType: 'top' | 'center' = 'top';
    scrollEventPending = false; // position was changed by this animator
    onUserScroll = new Callbacks<Action<Event>>();
    get currentPos() {
        if (this.posType == 'center')
            return this.view.dom.scrollTop + this.view.dom.offsetHeight / 2;
        else
            return this.view.dom.scrollTop;
    };
    set currentPos(val: number) {
        var targetPos = val;
        if (this.posType == 'center') targetPos -= this.view.dom.offsetHeight / 2;
        if (this.view.dom.scrollTop != targetPos) {
            this.scrollEventPending = true;
            this.view.dom.scrollTop = targetPos;
        }
    }
    cancel() {
        if (this._rafHandle >= 0) {
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = -1;
        }
    }
    scrollTo(pos: number) {
        this.targetPos = pos;
        this.lastPos = this.beginPos = this.currentPos;
        if (this._rafHandle < 0) {
            this._startRaf();
        }
        this.beginTime = performance.now();
    }
    private _rafCallback = null as Action<number> | null;
    private _startRaf() {
        if (!this._rafCallback) {
            this._rafCallback = (now) => {
                if (this._render(now)) {
                    this._rafHandle = requestAnimationFrame(this._rafCallback!);
                } else {
                    this._rafHandle = -1;
                }
            };
        }
        this._rafHandle = requestAnimationFrame(this._rafCallback);
    }
    private _render(now: number): boolean {
        if (Math.abs(this.currentPos - this.lastPos) > 10) return false;

        const t = numLimit((now - this.beginTime) / this.duration, 0, 1);

        const pos = this.beginPos + (this.targetPos - this.beginPos) * this._easeInOutQuad(t);
        this.lastPos = pos;

        this.currentPos = pos;

        return t !== 1;
    }
    private _easeInOutQuad(t: number) {
        return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
}