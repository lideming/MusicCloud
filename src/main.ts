// file: main.ts
// TypeScript 3.7 is required.

// Why do we need to use React and Vue.js? ;)

export var settings = {
    apiBaseUrl: 'api/',
    // apiBaseUrl: 'http://127.0.0.1:50074/api/',
    // apiBaseUrl: 'http://127.0.0.1:5000/api/',
    debug: true,
    apiDebugDelay: 0,
};

import { Toast, ToastsContainer } from "./viewlib";
import { ui } from "./UI";
import { playerCore } from "./PlayerCore";
import { api } from "./Api";
import { user } from "./User";
import { ListIndex } from "./ListIndex";
import { uploads } from "./Uploads";
import { discussion, notes, comments } from "./Discussion";
import { router } from "./Router";
import { settingsUI } from "./SettingsUI";
import { msgcli } from "./MessageClient"

ui.init();
playerCore.init();

export var listIndex = new ListIndex();

var app = window['app'] = {
    settings, settingsUI,
    ui, api, playerCore, router, listIndex, user, uploads, discussion, notes,
    Toast, ToastsContainer,
    msgcli,
    init() {
        user.init();
        uploads.init();
        discussion.init();
        notes.init();
        comments.init();
        listIndex.init();
        msgcli.init();
        router.init();
    }
};

app.init();

window['preload'].jsOk();
