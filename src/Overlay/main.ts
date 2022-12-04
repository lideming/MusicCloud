import { injectCss, injectWebfxCss, mountView, View } from "@yuuza/webfx";
import css from "../../style.css";
import { Api } from "../API/apidef";
import { OverlayLyricsView } from "./overlayLyricsView";

injectWebfxCss();
injectCss(css);

const channel = new BroadcastChannel("mc-player");

class OverlayView extends View {
  lyricsView = new OverlayLyricsView();
  createDom() {
    return {
      tag: "div.mc-overlay",
      child: [
        this.lyricsView,
      ],
    };
  }
}

const overlayView = new OverlayView();
const { lyricsView } = overlayView;
document.body.style.background = "none";
(document.body.style as any).webkitAppRegion = "drag";
mountView(document.body, overlayView);

let track: Api.Track | null = null;

channel.addEventListener("message", (ev) => {
  const { data } = ev;
  const { type } = data;
  if (type == "track") {
    track = data.track;
    lyricsView.trackChanged({ ...track! });
  } else if (type == "lyrics") {
    const { lyrics } = data;
    lyricsView.trackChanged({ ...track!, lyrics });
  } else if (type == "time") {
    const { time } = data;
    lyricsView.timeUpdated(time);
  }
});
