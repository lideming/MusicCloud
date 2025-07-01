const desktopApi = window["_mcDesktop"] as
  | import("../../Electron/rendererPreload").McDesktopType
  | undefined;

export { desktopApi };