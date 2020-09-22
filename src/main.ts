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
