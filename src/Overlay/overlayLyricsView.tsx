import {
  View,
  Callbacks,
  jsx,
  Timer,
  FadeoutResult,
  fadeout,
} from "@yuuza/webfx";
import { Api } from "../API/apidef";
import { Lyrics, Line, parse } from "../Lyrics/Lyrics";
import { LineView } from "../Lyrics/LineView";

export class OverlayLyricsView extends View {
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
      // TODO
    });
  }
  trackChanged(track: Api.Track) {
    if (!track) {
      this.lyrics = null;
      this.fadeoutCurrentLineView();
      this.onLyricsChanged.invoke();
      return;
    }
    this.fadeoutCurrentLineView();
    if (track.lyrics) {
      this.lyrics = parse(track.lyrics);
      this.onLyricsChanged.invoke();
    } else {
      this.lyrics = null;
      if (track) {
        this.lineView = new LineView({
          spans: [
            {
              text: `${track.name} - ${track.artist}`,
              ruby: null,
              startTime: null,
              timeStamp: null,
            },
          ],
        } as any);
        this.addView(this.lineView);
      }
    }
  }

  timeUpdated(time: number) {
    if (!this.lyrics) return;
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
        this.lineView = new LineView(line, { enableTranslation: true });
        this.addView(this.lineView);
      }
    }
    if (this.lineView) {
      this.lineView.toggleClass(
        "active",
        this.lineView.line.startTime! <= timeForSpan
      );
      this.lineView.setCurrentTime(timeForSpan);
    }
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
