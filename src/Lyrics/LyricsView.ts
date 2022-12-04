import { View, ContainerView, ItemActiveHelper, numLimit } from "../Infra/viewlib";
import { BuildDomExpr, Callbacks, Action, Timer, ScrollAnimator } from "../Infra/utils";
import { I } from "../I18n/I18n";
import { parse, Lyrics } from "./Lyrics";
import { playerCore } from "../Player/PlayerCore";
import { Track } from "../Track/Track";
import { LineView } from "./LineView";
import { SpanView } from "./SpanView";

export class LyricsView extends View {
    lines = new ContainerView<LineView>({ tag: 'div.lyrics' });
    lyrics: Lyrics | null = null;
    hasVisibleLyrics: boolean = false;
    track: Track | null = null;
    curLine = new ItemActiveHelper<LineView>();
    curTime = 0;
    scrollingTarget: LineView | null = null;
    onSpanClick = new Callbacks<Action<SpanView>>();
    onFontSizeChanged = new Callbacks<Action>();
    onLyricsChanged = new Callbacks<Action>();
    constructor() {
        super();
        this.setLyrics('');
        this.scrollAnimator.posType = 'center';
        this.scrollAnimator.onUserScroll.add(() => {
            this.setScrollingPause(5000);
        });
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'div.lyricsview',
            tabIndex: 0,
            child: [
                this.lines
            ]
        };
    }
    postCreateDom() {
        var startFontSize: number;
        var distance: number;
        this.dom.addEventListener('touchstart', (ev) => {
            if (ev.touches.length >= 2) {
                ev.preventDefault();
                startFontSize = this.scale;
                distance = dist(ev.touches[0], ev.touches[1]);
            }
        });
        this.dom.addEventListener('touchmove', (ev) => {
            if (ev.touches.length >= 2) {
                ev.preventDefault();
                var newdist = dist(ev.touches[0], ev.touches[1]);
                var scale = numLimit(startFontSize * newdist / distance, 20, 500);
                this.scale = scale;
            }
        });
        function dist(a: Touch, b: Touch) {
            var dx = a.screenX - b.screenX;
            var dy = a.screenY - b.screenY;
            return Math.sqrt(dx * dx + dy * dy);
        }
        this.dom.addEventListener('wheel', (ev) => {
            if (ev.ctrlKey && ev.deltaY) {
                ev.preventDefault();
                var scale = this.scale + (ev.deltaY > 0 ? -20 : 20);
                scale = numLimit(scale, 20, 500);
                this.scale = scale;
            }
        });
    }
    setLyrics(lyrics: string | Lyrics) {
        let msg = '';
        let parsed: Lyrics | null;
        try {
            if (typeof lyrics === 'string') parsed = parse(lyrics);
            else parsed = lyrics;
        } catch (error) {
            console.error('[Lyrics] parsing error', error);
            msg = I`Error parsing lyrics`;
            parsed = null;
        }

        this.lyrics = parsed;
        this.hasVisibleLyrics = false;
        this.curLine.set(null);
        this.lines.removeAllView();

        if (parsed?.lang) this.lines.dom.lang = parsed.lang;
        else this.lines.dom.removeAttribute('lang');

        const time = Date.now();

        const context: LyricsViewContext = {
            lyrics: parsed!,
            onSpanClicked: (span) => this.onSpanClick.invoke(span),
            enableTranslation: true,
        }

        if (parsed) {
            parsed.lines.forEach(l => {
                if (l.spans) {
                    this.lines.addView(new LineView(l, context));
                    this.hasVisibleLyrics = true;
                }
            });
        }

        if (!this.hasVisibleLyrics) {
            this.lines.addView(new LineView({
                orderTime: 0,
                spans: [
                    { text: msg || I`No lyrics` }
                ]
            } as any, context));
        }

        console.log(`[LyricsView] rendered ${[this.lines.length]} lines in ${Date.now() - time} ms`);

        this.onLyricsChanged.invoke();
        this.resize();
    }
    setCurrentTime(time: number, scroll?: boolean | 'smooth' | 'force') {
        if (!this.hasVisibleLyrics) return;
        if (!(time >= 0)) time = 0;
        this.curTime = time;
        var prev = this.curLine.current;
        var line = this.getLineByTime(time, prev);
        var laterLine = this.getLineByTime(time + this.scrollAnimator.duration / 1000 * 0.5 * playerCore.playbackRate, line);
        line?.setCurrentTime(time);
        this.curLine.set(line);
        if (scroll && scroll !== 'smooth' && line && (prev !== line || scroll === 'force')) {
            this.scrollAnimator.cancel();
            this.scrollAnimator.currentPos = line.dom.offsetTop + line.dom.offsetHeight / 2;
        } else if (scroll === 'smooth' && !this.isScrollingPaused()
            && laterLine !== this.scrollingTarget) {
            this.scrollingTarget = laterLine;
            this.scrollAnimator.duration = 300 / playerCore.playbackRate;
            if (laterLine) {
                this.scrollAnimator.scrollTo(laterLine.dom.offsetTop + laterLine.dom.offsetHeight / 2);
            } else {
                this.scrollAnimator.scrollTo(this.lines.get(0)?.dom.offsetTop ?? 0);
            }
        }
    }
    scrollAnimator = new ScrollAnimator(this);
    resize() {
        if (this.domCreated) {
            const boxHeight = this.dom.offsetHeight;
            const contentHeight = this.lines.dom.scrollHeight;
            if (contentHeight > boxHeight / 2) {
                this.lines.dom.style.margin = ((boxHeight - 1) / 2) + 'px 0';
            } else {
                this.lines.dom.style.margin = ((boxHeight - contentHeight - 1) / 2) + 'px 0';
            }
        }
        if (!this.isScrollingPaused())
            this.centerLyrics();
    }

    private _fontSize: number = 100;
    public get scale(): number {
        return this._fontSize;
    }
    public set scale(v: number) {
        this._fontSize = v;
        this.lines.dom.style.fontSize = v + '%';
        this.onFontSizeChanged.invoke();
    }

    scrollPos = 0;
    reset() {
        this.dom.scrollTop = this.scrollPos = 0;
    }
    onShow() {
        this.scrollAnimator.currentPos = this.scrollPos;
        if (this.isTrackPlaying()) this.setCurrentTime(playerCore.currentTime);
        requestAnimationFrame(this._resize);
        window.addEventListener('resize', this._resize);
    }
    onHide() {
        this.scrollPos = this.scrollAnimator.currentPos;
        window.removeEventListener('resize', this._resize);
        this.timer.tryCancel();
    }
    centerLyrics() {
        if (playerCore.state === 'playing' && this.isTrackPlaying())
            this.setCurrentTime(playerCore.currentTime, 'force');
    }
    private _resize = () => {
        this.resize();
    };
    timer = new Timer(() => this.onProgressChanged());
    lastChangedRealTime = 0;
    onProgressChanged = () => {
        if (!this.isTrackPlaying()) return;
        var time = playerCore.currentTime;
        var realTime = Date.now();
        if (time != this.curTime) {
            this.lastChangedRealTime = realTime;
            this.setCurrentTime(time, 'smooth');
        }
        if (realTime - this.lastChangedRealTime < 250) {
            if (!this.timer.cancelFunc) this.timer.interval(30);
        } else {
            this.timer.tryCancel();
        }
    };
    private isTrackPlaying() {
        return playerCore.track && playerCore.track === this.track && playerCore.track.id === this.track.id;
    }


    pauseScrollTime: number | null = null;
    isScrollingPaused() {
        return !!(this.pauseScrollTime && Date.now() < this.pauseScrollTime);
    }
    setScrollingPause(timeout: number | null) {
        if (timeout == null) {
            this.pauseScrollTime = null;
        } else {
            this.pauseScrollTime = Math.max(this.pauseScrollTime || 0, Date.now() + timeout);
            this.scrollingTarget = null;
        }
    }


    getLineByTime(time: number, hint?: LineView | null) {
        var line: LineView | null;
        if (hint && time >= hint.line.startTime!) {
            line = hint;
            for (let i = hint.position! + 1; i < this.lines.length; i++) {
                let x = this.lines.get(i);
                if (x.line.startTime != null) {
                    if (x.line.startTime <= time) {
                        line = x;
                    } else {
                        break;
                    }
                }
            }
        } else {
            line = null;
            this.lines.forEach(x => {
                if (x.line.startTime != null && x.line.startTime <= time) line = x;
            });
        }
        return line;
    }
}

export interface LyricsViewContext {
    lyrics: Lyrics;
    onSpanClicked: (span: SpanView) => void;
    enableTranslation: boolean;
}
