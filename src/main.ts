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

import { ui } from "./UI";
import { playerCore } from "./PlayerCore";
import { user } from "./User";
import { ListIndex } from "./ListIndex";
import { uploads } from "./Uploads";
import { discussion, notes } from "./Discussion";
import { router } from "./Router";

ui.init();

export var listIndex = new ListIndex();

var app = window['app'] = {
    ui, playerCore, router, listIndex, user, uploads, discussion, notes,
    init() {
        user.init();
        uploads.init();
        discussion.init();
        notes.init();
        listIndex.init();
        router.init();
    }
};

app.init();
