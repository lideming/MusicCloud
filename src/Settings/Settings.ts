import { Callbacks, SettingItem } from "../Infra/utils";

export type RendererMode = "dom" | "canvas";

export const settings = {
  renderer: new (class {
    private preference = new SettingItem<RendererMode>(
      "mcloud-renderer", "str", "canvas",
    );
    onChanged = new Callbacks<() => void>();

    get current(): RendererMode {
      return this.preference.data === "dom" ? "dom" : "canvas";
    }

    set(mode: RendererMode) {
      if (mode === this.current) return;
      this.preference.set(mode);
      this.onChanged.invoke();
    }
  })(),
  defaultApiBaseUrl: "api/",
  apiBaseUrl: "",
  debug: true,
  apiDebugDelay: 0,
  showDownloadOptions: true,
  showDiscussion: true,
  showNotes: true,

  init() {
    var server = localStorage.getItem("mcloud-server");
    this.apiBaseUrl = server || this.defaultApiBaseUrl;
  },
};
