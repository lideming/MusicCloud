import { View, buildDOM } from "../Infra/viewlib";
import { Span } from "./Lyrics";
import { LineView } from "./LineView";

export class SpanView extends View {
  span: Span;
  lineView: LineView;
  get timeStamp() {
    return this.span.timeStamp;
  }
  set timeStamp(val) {
    this.span.timeStamp = val;
  }
  get startTime() {
    return this.span.startTime;
  }
  set startTime(val) {
    this.span.startTime = val;
  }
  get isNext() {
    return this.dom.classList.contains("next");
  }
  set isNext(val) {
    this.toggleClass("next", val);
  }

  constructor(span: Span, lineView: LineView) {
    super();
    this.span = span;
    this.lineView = lineView;
  }
  createDom() {
    var s = this.span;
    return buildDOM({
      tag: "span.span",
      child: !s.ruby
        ? s.text
        : {
            tag: "ruby",
            child: [
              s.text,
              { tag: "rp", text: "(" },
              { tag: "rt", text: s.ruby },
              { tag: "rp", text: ")" },
            ],
          },
    });
  }
  postCreateDom() {
    super.postCreateDom();
    var startX, startY;
    this.dom.addEventListener("mousedown", (ev) => {
      startX = ev.offsetX;
      startY = ev.offsetY;
    });
    this.dom.addEventListener("click", (ev) => {
      if (
        Math.abs(ev.offsetX - startX) <= 3 &&
        Math.abs(ev.offsetY - startY) <= 3
      ) {
        ev.preventDefault();
        this.lineView.context?.onSpanClicked?.(this);
      }
    });
  }
}
