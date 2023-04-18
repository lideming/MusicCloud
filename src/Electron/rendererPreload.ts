import { contextBridge, ipcRenderer } from "electron";

const mcDesktop = {
  getState() {
    return ipcRenderer.invoke("get_state");
  },
  toggleDesktopLyrics(shown?: boolean) {
    return ipcRenderer.invoke("toggle_desktop_lyrics", shown);
  },
};

export type McDesktopType = typeof mcDesktop;

contextBridge.exposeInMainWorld("_mcDesktop", mcDesktop);
