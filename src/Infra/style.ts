import { getWebfxCss, injectCss, injectWebfxCss } from "./viewlib";
import style from "../../style.less";

export function injectStyle(options?: { parent?: Node }) {
  injectCss(getWebfxCss(), { ...options, tag: "style#mcloud-injected-style-webfx" });
  injectCss(style, { ...options, tag: "style#mcloud-injected-style-app" });
}
