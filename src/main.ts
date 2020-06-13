// file: main.ts
// TypeScript 3.7 is required.

// Why do we need to use React and Vue.js? ;)

//@ts-ignore
const __createBinding = globalThis.__createBinding = Object.create ? (function(o, m, k, k2?) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
});

globalThis.__awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
	function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	return new (P || (P = Promise))(function (resolve, reject) {
		function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
		function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
		function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
		step((generator = generator.apply(thisArg, _arguments || [])).next());
	});
};
globalThis.__exportStar = function(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) __createBinding(exports, m, p);
};

console.time('main init');

export var settings = {
    apiBaseUrl: 'api/',
    // apiBaseUrl: 'http://127.0.0.1:50074/api/',
    // apiBaseUrl: 'http://127.0.0.1:5000/api/',
    debug: true,
    apiDebugDelay: 0,
};

console.time('modules importing');

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
import Lyrics = require("./Lyrics");
import { lyricsEdit } from "./LyricsEdit";

console.timeEnd('modules importing');

var app = window['app'] = {
    settings, settingsUI,
    ui, api, playerCore, router, listIndex, user, uploads, discussion, notes, nowPlaying, lyricsEdit,
    Toast, ToastsContainer, Lyrics,
    msgcli,
    init() {
        console.time('app.init()');
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
        console.timeEnd('app.init()');
    }
};

app.init();

window['preload'].jsOk();

console.timeEnd('main init');
