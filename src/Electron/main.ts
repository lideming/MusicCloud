import { app, BrowserWindow, ipcMain } from "electron";
import { getResourcePath } from "./utils";

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

function openMainWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: getResourcePath("electron.preload.js"),
    },
  });
  mainWindow = win;
  win.menuBarVisible = false;
  win.loadFile("index.html");
  mainWindow.on("closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

function openOverlayWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 50,
    alwaysOnTop: true,
    webPreferences: {
      preload: getResourcePath("electron.preload.js"),
    },
    show: false,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    titleBarStyle: "hidden",
  });
  overlayWindow = win;
  win.setAlwaysOnTop(true, "status");
  win.loadFile("overlay.html");
  win.showInactive();
}

app.whenReady().then(() => {
  console.info("electron app ready");
  // openOverlayWindow();
  openMainWindow();
  app.on("activate", () => {
    if (
      BrowserWindow.getAllWindows()
        .filter((x) => x != overlayWindow)
        .length === 0
    ) {
      openMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
});

ipcMain.handle("toggle_desktop_lyrics", (ev, shown?: boolean) => {
  const currentShown = overlayWindow !== null;
  if (shown === currentShown) return;
  if (shown === undefined) {
    shown = !currentShown;
  }
  if (shown) {
    openOverlayWindow();
  } else {
    overlayWindow?.close();
    overlayWindow = null;
  }
});

ipcMain.handle("get_state", (ev) => {
  return {
    desktopLyrics: overlayWindow !== null,
  };
});
