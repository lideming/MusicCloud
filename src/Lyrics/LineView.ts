import { ContainerView, buildDOM } from "../Infra/viewlib";
import { Line } from "./Lyrics";
import { LyricsViewContext } from "./LyricsView";
import { SpanView } from "./SpanView";


export class LineView extends ContainerView<SpanView> {
    line: Line;
    get spans() { return this.items; }
    currentIndex = 0;
    context?: LyricsViewContext;
    constructor(line: Line, context?: LyricsViewContext) {
        super({ tag: 'p.line' });
        this.context = context;
        this.line = line;
        this.line.spans!.forEach(s => {
            this.addView(new SpanView(s, this));
        });
        if (this.context?.enableTranslation && this.line.translation) {
            const lyrics = context?.lyrics;
            var tlang = lyrics && (lyrics.translationLang || lyrics.lang);
            this.dom.appendChild(buildDOM({
                tag: 'div.trans',
                lang: tlang,
                text: this.line.translation
            }));
        }
    }
    setCurrentTime(time: number) {
        const items = this.items; // assume it's sorted
        let i = this.currentIndex;
        while (1) {
            if (i < items.length && items[i].startTime! <= time) {
                items[i].toggleClass('active', true);
                i++;
            } else if (i > 0 && items[i - 1].startTime! > time) {
                items[i - 1].toggleClass('active', false);
                i--;
            } else
                break;
        }
        this.currentIndex = i;
    }
}
