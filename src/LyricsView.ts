import { View, ContainerView, ItemActiveHelper } from "./viewlib";
import { BuildDomExpr, utils } from "./utils";
import { parse, Parsed, Line } from "./Lyrics";


export class LyricsView extends View {
    lyrics = new ContainerView<LineView>({ tag: 'div.lyrics' });
    curLine = new ItemActiveHelper<LineView>();
    createDom(): BuildDomExpr {
        return {
            tag: 'div.lyricsview',
            child: [
                this.lyrics.dom
            ]
        };
    }
    setLyrics(lyrics: string | Parsed) {
        if (typeof lyrics === 'string') lyrics = parse(lyrics);
        this.lyrics.removeAllView();
        lyrics.lines.forEach(l => {
            this.lyrics.addView(new LineView(l));
        });
    }
    setCurrentTime(time: number, scroll?: true | 'smooth') {
        var line: LineView;
        this.lyrics.forEach(x => {
            if (x.line.startTime && x.line.startTime <= time) line = x;
        });
        var prev = this.curLine.current;
        this.curLine.set(line);
        if (scroll && line && prev !== line) {
            line.dom.scrollIntoView({
                behavior: scroll === 'smooth' ? 'smooth' : undefined,
                block: 'center'
            });
        }
    }
}

class LineView extends View {
    line: Line;
    spans: HTMLSpanElement[];
    constructor(line: Line) {
        super();
        this.line = line;
        this.spans = this.line.spans.map(s => {
            if (!s.ruby) {
                return utils.buildDOM({
                    tag: 'span.span', text: s.text
                });
            } else {
                return utils.buildDOM({
                    tag: 'span.span',
                    child: {
                        tag: 'ruby',
                        child: [
                            s.text,
                            { tag: 'rp', text: '(' },
                            { tag: 'rt', text: s.ruby },
                            { tag: 'rp', text: ')' }
                        ]
                    }
                });
            }
        });
    }
    createDom() {
        return {
            tag: 'p.line',
            child: this.spans
        };
    }
}