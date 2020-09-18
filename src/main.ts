// file: main.ts
// TypeScript is required.

// Why do we need React and Vue.js? ;)

import { Toast, ToastsContainer } from "./viewlib";
import { ui } from "./UI";
import { playerCore } from "./PlayerCore";
import { api } from "./Api";
import { user } from "./User";
import { listIndex } from "./ListIndex";
import { uploads } from "./Uploads";
import { discussion, notes, comments } from "./Discussion";
import { router } from "./Router";
import { settingsUI } from "./SettingsUI";
import { msgcli } from "./MessageClient";
import { nowPlaying } from "./NowPlaying";
import { search } from "./Search";
import * as Lyrics from "./Lyrics";
import { lyricsEdit } from "./LyricsEdit";
import { appVersion } from "./AppVersion";
import { settings } from "./Settings";
import { utils } from "./utils";

import * as webfx from "@yuuza/webfx";

import style from "../style.css";

export const app = window['app'] = {
    webfx,
    settings, settingsUI,
    ui, api, playerCore, router, listIndex, user, uploads, discussion, notes, nowPlaying, lyricsEdit,
    Toast, ToastsContainer, Lyrics,
    msgcli,
    init() {
        console.time('[Main] app.init()');
        app.injectStyle();
        ui.init();
        playerCore.init();
        user.init();
        uploads.init();
        search.init();
        discussion.init();
        notes.init();
        nowPlaying.init();
        comments.init();
        listIndex.init();
        msgcli.init();
        router.init();
        appVersion.showUpdatedToast();
        console.timeEnd('[Main] app.init()');
    },
    injectStyle() {
        document.head.appendChild(utils.buildDOM({ tag: 'style#mc-style', text: style }));
    }
};

app.init();

window['preload'].jsOk();
