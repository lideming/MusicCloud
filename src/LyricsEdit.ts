import { Track } from './Track';
import { ContentView, ContentHeader, SidebarItem, ui, ActionBtn } from './UI';
import { I } from './I18n';
import { BuildDomExpr, Timer } from './utils';
import { LyricsView, SpanView, LineView } from './LyricsView';
import { router } from './Router';
import { Span, Lyrics, serialize } from './Lyrics';
import { playerCore } from './PlayerCore';
import { utils } from '@yuuza/webfx/lib/utils';

export var lyricsEdit = new class {
    sidebarItem: SidebarItem;
    view: LyricsEditContentView;
    startEdit(track: Track, lyrics: string) {
        if (!this.view) {
            this.sidebarItem = new SidebarItem({ text: I`Edit Lyrics` });
            this.view = new LyricsEditContentView();
            ui.sidebarList.addFeatureItem(this.sidebarItem);
            router.addRoute({
                path: ['lyricsEdit'],
                contentView: () => this.view,
                sidebarItem: () => this.sidebarItem
            });
        }
        this.sidebarItem.hidden = false;
        this.view.setTrack(track, lyrics);
        router.nav('lyricsEdit');
    }
};

class LyricsEditContentView extends ContentView {
    header = new ContentHeader({ title: I`Edit Lyrics` });
    lyricsView = new EditableLyricsView();
    track: Track | null = null;
    lyricsString: string | null = null;

    constructor() {
        super();
        this.header.actions.addView(new ActionBtn({
            text: I`Discard`,
            onclick: () => {
                this.close();
            }
        }));
        this.header.actions.addView(new ActionBtn({
            text: I`Done`,
            onclick: () => {
                this.lyricsString = serialize(this.lyricsView.lyrics);
                this.close();
            }
        }));
    }

    close() {
        lyricsEdit.sidebarItem.hidden = true;
        window.history.back();
        var trackDialog = this.track!.startEdit();
        trackDialog.inputLyrics.value = this.lyricsString!;
    }

    createDom(): BuildDomExpr {
        return {
            tag: 'div.lyricsedit',
            child: [
                this.header,
                this.lyricsView
            ]
        };
    }
    setTrack(track: Track, lyrics: string) {
        this.track = track;
        this.lyricsString = lyrics;
        this.lyricsView.setLyrics(lyrics);
    }
    lyricsScrollPos: number = 0;
    onShow() {
        this.ensureDom();
        this.shownEvents.add(playerCore.onProgressChanged, this.onProgressChanged);
    }
    onDomInserted() {
        if (this.isTrackPlaying()) this.lyricsView.setCurrentTime(playerCore.currentTime);
        if (this.lyricsScrollPos) {
            this.lyricsView.dom.scrollTop = this.lyricsScrollPos;
        }
        requestAnimationFrame(this.onResize);
        window.addEventListener('resize', this.onResize);
    }
    onRemove() {
        super.onRemove();
        window.removeEventListener('resize', this.onResize);
        this.timer.tryCancel();
        this.lyricsScrollPos = this.lyricsView.dom.scrollTop;
    }
    timer = new Timer(() => this.onProgressChanged());
    lastTime = 0;
    lastChangedRealTime = 0;
    onProgressChanged = () => {
        if (!this.isTrackPlaying()) return;
        var time = playerCore.currentTime;
        var realTime = new Date().getTime();
        var timerOn = true;
        if (time != this.lastTime) {
            this.lastChangedRealTime = realTime;
            this.lyricsView.setCurrentTime(time, 'smooth');
        }
        if (realTime - this.lastChangedRealTime < 500) this.timer.timeout(16);
    };
    private isTrackPlaying() {
        return playerCore.track && playerCore.track === this.track && playerCore.track.id === this.track.id;
    }

    centerLyrics() {
        if (playerCore.state === 'playing')
            this.lyricsView.setCurrentTime(playerCore.currentTime, 'force');
    }
    onResize = () => {
        this.lyricsView.resize();
        this.centerLyrics();
    };
}

class EditableLyricsView extends LyricsView {
    nextSpans: SpanView[] = [];
    constructor() {
        super();
        this.onLyricsChanged.add(() => {
            this.lines.forEach(l => {
                if (l.spans?.length) {
                    let firstSpan = l.spans[0].span;
                    if (!firstSpan.timeStamp) {
                        firstSpan.timeStamp = { time: -1, beats: null, beatsDiv: null };
                    }
                    l.spans.forEach(s => {
                        s.timeStamp && s.toggleClass('ts', true);
                    });
                }
            });
            this.setNextSpans(this.getSpans());
        });
        this.onSpanClick.add((s) => {
            playerCore.currentTime = utils.numLimit(s.span.startTime! - 3, 0, Infinity);
            this.setNextSpans(this.getSpans(s, 'here'));
        });
        this.dom.addEventListener('keydown', (ev) => {
            if (ev.code == 'ArrowRight' || ev.code == 'F' || ev.code == 'D') {
                ev.preventDefault();
                if (this.nextSpans.length) {
                    const now = playerCore.currentTime;
                    this.nextSpans[0].timeStamp!.time = now;
                    this.nextSpans.forEach(s => {
                        s.startTime = now;
                    });
                    if (this.nextSpans[0].position === 0) {
                        this.nextSpans[0].lineView.line.startTime = now;
                    }
                }
                let spans = this.getSpans(null, 'forward');
                if (spans.length) this.setNextSpans(spans);
            } else if (ev.code == 'ArrowLeft') {
                ev.preventDefault();
                let spans = this.getSpans(null, 'backward');
                if (spans.length) this.setNextSpans(spans);
            }
        });
        this.toggleClass('edit', true);
    }
    getSpans(span?: SpanView | null, go?: 'here' | 'forward' | 'backward') {
        if (!span) {
            if (this.nextSpans.length) {
                span = this.nextSpans[go === 'backward' ? 0 : this.nextSpans.length - 1];
            } else {
                span = this.lines.get(0).spans[0];
            }
        }
        var colPos = span.position!;
        var line = span.lineView!;

        if (go == null || go === 'here') {
            while (line.spans && !line.spans[colPos].timeStamp) {
                if (colPos-- === 0) {
                    line = this.lines.get(line.position! - 1);
                    colPos = line.length - 1;
                }
            }
        } else if (go === 'forward') {
            do {
                if (line && ++colPos === line.length) {
                    line = this.lines.get(line.position! + 1);
                    colPos = 0;
                }
            } while (line && (line.spans && !line.spans[colPos].timeStamp));
        } else if (go === 'backward') {
            do {
                if (line && colPos-- === 0) {
                    line = this.lines.get(line.position! - 1);
                    colPos = line.length - 1;
                }
            } while (line && (line.spans && !line.spans[colPos].timeStamp));
        }

        var spans: SpanView[] = [];
        if (line) {
            do {
                spans.push(line.spans[colPos]);
                colPos++;
            } while (colPos < line.length && !line.spans[colPos].timeStamp);
        }
        return spans;
    }
    setNextSpans(spans: SpanView[]) {
        while (this.nextSpans.length) {
            this.nextSpans.pop()!.isNext = false;
        }
        spans.forEach(s => {
            s.isNext = true;
            this.nextSpans.push(s);
        });
    }
}