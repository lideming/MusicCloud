/*! *************************************************
    Copyright (c) 2020 lideming

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
************************************************* */

// file: main.ts
// TypeScript is required.

// Why do we need React and Vue.js? ;)
// Update: We have webfx now.

import { injectCss, Toast, ToastsContainer } from "./Infra/viewlib";
import { ui } from "./Infra/UI";
import { playerCore } from "./Player/PlayerCore";
import { api } from "./API/Api";
import { user } from "./API/User";
import { listIndex } from "./Track/ListIndex";
import { uploads } from "./Track/Uploads";
import { discussion, notes, comments } from "./Comments/Discussion";
import { router } from "./Infra/Router";
import { settingsUI } from "./Settings/SettingsUI";
import { msgcli } from "./API/MessageClient";
import { nowPlaying } from "./Track/NowPlaying";
import { listenTogether } from "./Player/ListenTogether";
import { search } from "./Track/Search";
import * as Lyrics from "./Lyrics/Lyrics";
import { lyricsEdit } from "./Lyrics/LyricsEdit";
import { appVersion } from "./Settings/AppVersion";
import { settings } from "./Settings/Settings";
import { playerFX } from "./Player/PlayerFX";
import { serviceWorkerClient } from "./ServiceWorker/client";
import { infoProvider } from "./Overlay/infoProvider";

import * as webfx from "@yuuza/webfx";

import style from "../style.css";

export const app = window['app'] = {
    webfx,
    settings, settingsUI,
    ui, api, playerCore, router, listIndex, user, uploads, discussion, notes, nowPlaying, lyricsEdit, playerFX,
    Toast, ToastsContainer, Lyrics,
    msgcli,
    init() {
        console.time('[Main] app.init()');
        settings.init();
        app.checkMode();
        app.injectStyle();
        playerCore.init();
        ui.init();
        playerFX.init();
        user.init();
        uploads.init();
        search.init();
        discussion.init();
        notes.init();
        nowPlaying.init();
        listenTogether.init();
        comments.init();
        listIndex.init();
        msgcli.init();
        router.init();
        appVersion.showUpdatedToast();
        serviceWorkerClient.init();
        infoProvider.bindToPlayer(playerCore);
        console.timeEnd('[Main] app.init()');
    },
    checkMode() {
        if (localStorage.getItem("mcloud-dev") == "1") {
            webfx.startBlockingDetect();
        }
    },
    injectStyle() {
        webfx.injectWebfxCss();
        injectCss(style, { tag: 'style#mcloud-injected-style' });
    }
};

app.init();

window['preload'].jsOk();
