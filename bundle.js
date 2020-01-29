(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
// file: Api.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const main_1 = require("./main");
const utils_1 = require("./utils");
/** API 操作 */
exports.api = new class {
    constructor() {
        this.debugSleep = main_1.settings.debug ? main_1.settings.apiDebugDelay : 0;
        this.onTrackInfoChanged = new utils_1.Callbacks();
    }
    get baseUrl() { return main_1.settings.apiBaseUrl; }
    _fetch(input, init) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.debugSleep)
                yield utils_1.utils.sleepAsync(this.debugSleep * (Math.random() + 1));
            return yield fetch(input, Object.assign({ credentials: 'same-origin' }, init));
        });
    }
    getHeaders(arg) {
        var _a;
        arg = arg || {};
        var headers = {};
        var basicAuth = (_a = arg.basicAuth, (_a !== null && _a !== void 0 ? _a : this.defaultBasicAuth));
        if (basicAuth)
            headers['Authorization'] = 'Basic ' + utils_1.utils.base64EncodeUtf8(basicAuth);
        return headers;
    }
    getJson(path, options) {
        return __awaiter(this, void 0, void 0, function* () {
            options = options || {};
            var resp = yield this._fetch(this.baseUrl + path, {
                headers: Object.assign({}, this.getHeaders(options))
            });
            yield this.checkResp(options, resp);
            return yield resp.json();
        });
    }
    postJson(arg) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            var body = arg.obj;
            if (arg.mode === undefined)
                arg.mode = 'json';
            if (arg.mode === 'json')
                body = body !== undefined ? JSON.stringify(body) : undefined;
            else if (arg.mode === 'raw')
                void 0; // noop
            else
                throw new Error('Unknown arg.mode');
            var headers = this.getHeaders(arg);
            if (arg.mode === 'json')
                headers['Content-Type'] = 'application/json';
            headers = Object.assign(Object.assign({}, headers), arg.headers);
            var resp = yield this._fetch(this.baseUrl + arg.path, {
                body: body,
                method: (_a = arg.method, (_a !== null && _a !== void 0 ? _a : 'POST')),
                headers: headers
            });
            yield this.checkResp(arg, resp);
            var contentType = resp.headers.get('Content-Type');
            if (contentType && /^application\/json;?/.test(contentType))
                return yield resp.json();
            return null;
        });
    }
    checkResp(options, resp) {
        return __awaiter(this, void 0, void 0, function* () {
            if (options.status !== false &&
                ((options.status !== undefined && resp.status != options.status)
                    || resp.status >= 400)) {
                if (resp.status === 450) {
                    try {
                        var resperr = (yield resp.json()).error;
                    }
                    catch (_a) { }
                    if (resperr)
                        throw new Error(resperr);
                }
                throw new Error('HTTP status ' + resp.status);
            }
        });
    }
    getListAsync(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.getJson('lists/' + id);
        });
    }
    getListIndexAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.getJson('lists/index');
        });
    }
    putListAsync(list, creating = false) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.postJson({
                path: 'lists/' + list.id,
                method: creating ? 'POST' : 'PUT',
                obj: list,
            });
        });
    }
    processUrl(url) {
        if (url.match('^(https?:/)?/'))
            return url;
        return this.baseUrl + url;
    }
};

},{"./main":11,"./utils":13}],2:[function(require,module,exports){
"use strict";
// file: discussion.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const UI_1 = require("./UI");
const Api_1 = require("./Api");
const viewlib_1 = require("./viewlib");
const utils_1 = require("./utils");
const tracklist_1 = require("./tracklist");
const User_1 = require("./User");
const ListContentView_1 = require("./ListContentView");
const Router_1 = require("./Router");
exports.discussion = new class {
    constructor() {
        this.view = new utils_1.Lazy(() => new class extends ListContentView_1.ListContentView {
            createHeader() {
                return new tracklist_1.ContentHeader({
                    title: utils_1.I `Discussion`
                });
            }
            appendListView() {
                super.appendListView();
                this.useLoadingIndicator(new viewlib_1.LoadingIndicator({
                    state: 'normal',
                    content: '(This feature is a work in progress)'
                }));
            }
        });
    }
    init() {
        this.sidebarItem = new UI_1.SidebarItem({ text: utils_1.I `Discussion` });
        Router_1.router.addRoute({
            path: ['discussion'],
            sidebarItem: () => this.sidebarItem,
            contentView: () => this.view.value
        });
        UI_1.ui.sidebarList.addItem(this.sidebarItem);
    }
};
exports.notes = new class {
    constructor() {
        this.lazyView = new utils_1.Lazy(() => new class extends ListContentView_1.ListContentView {
            createHeader() {
                return new tracklist_1.ContentHeader({
                    title: utils_1.I `Notes`
                });
            }
            appendHeader() {
                super.appendHeader();
                this.dom.appendView(this.editorNew = new CommentEditor());
                this.editorNew.dom.classList.add('comment-editor-new');
                this.editorNew.onsubmit = (editor) => {
                    var content = editor.content;
                    editor.content = '';
                    if (content == '')
                        return;
                    exports.notes.post(content);
                };
            }
            appendListView() {
                super.appendListView();
                if (!exports.notes.state)
                    exports.notes.fetch();
            }
        });
        this.state = false;
    }
    init() {
        this.sidebarItem = new UI_1.SidebarItem({ text: utils_1.I `Notes` }).bindContentView(() => this.view);
        Router_1.router.addRoute({
            path: ['notes'],
            sidebarItem: () => this.sidebarItem,
            contentView: () => this.lazyView.value
        });
        UI_1.ui.sidebarList.addItem(this.sidebarItem);
        User_1.user.onSwitchedUser.add(() => {
            if (this.state && exports.notes.state !== 'waiting')
                this.fetch();
        });
    }
    get view() { return this.lazyView.value; }
    fetch() {
        return __awaiter(this, void 0, void 0, function* () {
            this.state = 'waiting';
            var li = new viewlib_1.LoadingIndicator();
            this.view.useLoadingIndicator(li);
            try {
                yield User_1.user.waitLogin(true);
                this.state = 'fetching';
                var resp = yield Api_1.api.getJson('my/notes?reverse=1');
                this.view.useLoadingIndicator(null);
            }
            catch (error) {
                this.state = 'error';
                li.error(error, () => this.fetch());
                throw error;
            }
            this.view.listView.clear();
            resp.comments.forEach(c => this.addItem(c));
            this.view.updateView();
            this.state = 'fetched';
        });
    }
    addItem(c) {
        const comm = new CommentViewItem(c);
        comm.onremove = () => {
            this.ioAction(() => Api_1.api.postJson({
                method: 'DELETE',
                path: 'my/notes/' + comm.comment.id,
                obj: undefined
            }));
        };
        return this.view.listView.add(comm);
    }
    ioAction(func) {
        return __awaiter(this, void 0, void 0, function* () {
            var li = new viewlib_1.LoadingIndicator({ content: utils_1.I `Submitting` });
            this.view.useLoadingIndicator(li);
            yield li.action(() => __awaiter(this, void 0, void 0, function* () {
                yield func();
                yield this.fetch();
            }));
        });
    }
    post(content) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ioAction(() => Api_1.api.postJson({
                method: 'POST',
                path: 'my/notes/new',
                obj: {
                    content: content
                }
            }));
        });
    }
};
class CommentViewItem extends viewlib_1.ListViewItem {
    constructor(comment) {
        super();
        this.onContextMenu = (item, ev) => {
            ev.preventDefault();
            var m = new viewlib_1.ContextMenu([
                new viewlib_1.MenuInfoItem({ text: utils_1.I `Comment ID` + ': ' + this.comment.id })
            ]);
            if (this.onremove) {
                m.add(new viewlib_1.MenuItem({ text: utils_1.I `Remove`, cls: 'dangerous', onclick: () => { this.onremove(this); } }), 0);
            }
            if (this.onedit) {
                m.add(new viewlib_1.MenuItem({ text: utils_1.I `Edit`, onclick: () => { this.onedit(this); } }), 0);
            }
            m.show({ ev: ev });
        };
        this.comment = comment;
    }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.item.comment.no-transform',
            child: [
                { tag: 'div.username', _key: 'domusername' },
                { tag: 'div.content', _key: 'domcontent' }
            ]
        };
    }
    updateDom() {
        this.domusername.textContent = this.comment.username;
        this.domcontent.textContent = this.comment.content;
    }
}
class CommentEditor extends viewlib_1.View {
    get content() { this.ensureDom(); return this.domcontent.value; }
    set content(val) { this.ensureDom(); this.domcontent.value = val; }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.comment-editor',
            child: [
                { tag: 'textarea.content', _key: 'domcontent' },
                { tag: 'div.btn.submit', textContent: utils_1.I `Submit`, _key: 'domsubmit' }
            ]
        };
    }
    postCreateDom() {
        this.domcontent.addEventListener('keydown', (ev) => {
            if (ev.ctrlKey && ev.keyCode == 13) {
                this.onsubmit(this);
            }
        });
        this.domsubmit.addEventListener('click', () => {
            this.onsubmit(this);
        });
    }
}

},{"./Api":1,"./ListContentView":4,"./Router":7,"./UI":8,"./User":10,"./tracklist":12,"./utils":13,"./viewlib":14}],3:[function(require,module,exports){
"use strict";
// file: I18n.ts
Object.defineProperty(exports, "__esModule", { value: true });
/** Internationalization (aka i18n) helper class */
class I18n {
    constructor() {
        this.data = {};
        this.curLang = 'en';
        this.missing = new Map();
    }
    /** Get i18n string for `key`, return `key` when not found. */
    get(key, arg) {
        return this.get2(key, arg) || key;
    }
    /** Get i18n string for `key`, return `null` when not found. */
    get2(key, arg, lang) {
        lang = lang || this.curLang;
        var langObj = this.data[lang];
        if (!langObj) {
            console.log('i18n missing lang: ' + lang);
            return null;
        }
        var r = langObj[key];
        if (!r) {
            if (!this.missing.has(key)) {
                this.missing.set(key, 1);
                console.log('i18n missing key: ' + key);
            }
            return null;
        }
        if (arg) {
            for (const key in arg) {
                if (arg.hasOwnProperty(key)) {
                    const val = arg[key];
                    r = r.replace('{' + key + '}', val);
                    // Note that it only replaces the first occurrence.
                }
            }
        }
        return r;
    }
    /** Fills data with an 2darray */
    add2dArray(array) {
        const langObjs = [];
        const langs = array[0];
        for (const lang of langs) {
            langObjs.push(this.data[lang] = this.data[lang] || {});
        }
        for (let i = 1; i < array.length; i++) {
            const line = array[i];
            const key = line[0];
            for (let j = 0; j < line.length; j++) {
                const val = line[j];
                langObjs[j][key] = val;
            }
        }
    }
    renderElements(elements) {
        console.log('i18n elements rendering');
        elements.forEach(x => {
            for (const node of x.childNodes) {
                if (node.nodeType == Node.TEXT_NODE) {
                    // console.log('node', node);
                    var r = this.get2(node.beforeI18n || node.textContent);
                    if (r) {
                        node.beforeI18n = node.beforeI18n || node.textContent;
                        node.textContent = r;
                    }
                    else {
                        if (node.beforeI18n) {
                            node.textContent = node.beforeI18n;
                        }
                        console.log('missing key for node', node);
                    }
                }
            }
        });
    }
    /**
     * Detect the best available language using
     * the user language preferences provided by the browser.
     * @param langs Available languages
     */
    static detectLanguage(langs) {
        var cur;
        var curIdx = -1;
        var languages = [];
        // ['en-US'] -> ['en-US', 'en']
        (navigator.languages || [navigator.language]).forEach(lang => {
            languages.push(lang);
            if (lang.indexOf('-') > 0)
                languages.push(lang.substr(0, lang.indexOf('-')));
        });
        langs.forEach((l) => {
            var idx = languages.indexOf(l);
            if (!cur || (idx !== -1 && idx < curIdx)) {
                cur = l;
                curIdx = idx;
            }
        });
        return cur;
    }
}
exports.I18n = I18n;
exports.i18n = new I18n();
function I(literals, ...placeholders) {
    if (placeholders.length == 0) {
        return exports.i18n.get(literals[0]);
    }
    // Generate format string from template string:
    var formatString = '';
    for (var i = 0; i < literals.length; i++) {
        var lit = literals[i];
        formatString += lit;
        if (i < placeholders.length) {
            formatString += '{' + i + '}';
        }
    }
    var r = exports.i18n.get(formatString);
    for (var i = 0; i < placeholders.length; i++) {
        r = r.replace('{' + i + '}', placeholders[i]);
    }
    return r;
}
exports.I = I;
// Use JSON.parse(a_big_json) for faster JavaScript runtime parsing
exports.i18n.add2dArray(JSON.parse(`[
    ["en", "zh"],
    ["English", "中文"],
    ["Pin", "固定"],
    ["Unpin", "浮动"],
    ["Pause", "暂停"],
    ["Play", "播放"],
    [" (logging in...)", " （登录中...）"],
    ["Guest (click to login)", "游客（点击登录）"],
    ["Login", "登录"],
    ["Create account", "创建账户"],
    ["Close", "关闭"],
    ["Username", "用户名"],
    ["Password", "密码"],
    ["Confirm password", "确认密码"],
    ["Requesting...", "请求中……"],
    [" (error!)", "（错误！）"],
    ["Username or password is not correct.", "用户名或密码不正确。"],
    ["Logged in with previous working account.", "已登录为之前的用户。"],
    ["Please input the username!", "请输入用户名！"],
    ["Please input the password!", "请输入密码！"],
    ["Password confirmation does not match!", "确认密码不相同！"],
    ["Playlist", "播放列表"],
    ["Playlists", "播放列表"],
    ["New Playlist", "新建播放列表"],
    ["New Playlist ({0})", "新播放列表（{0}）"],
    ["Click to edit", "点击编辑"],
    ["(Empty)", "（空）"],
    ["Loading", "加载中"],
    ["Oh no! Something just goes wrong:", "发生错误："],
    ["[Click here to retry]", "[点击重试]"],
    ["My Uploads", "我的上传"],
    ["Click here to select files to upload", "点此选择文件并上传"],
    ["or drag files to this zone...", "或拖放文件到此处..."],
    ["Comments", "评论"],
    ["Remove", "移除"],
    ["List ID", "列表 ID"],
    ["Track ID", "歌曲 ID"],
    ["Name", "名称"],
    ["Artist", "艺术家"],
    ["Discussion", "讨论区"],
    ["Notes", "便签"],
    ["Submit", "提交"],
    ["Submitting", "提交中"],
    ["Download", "下载"],
    ["Edit", "编辑"],
    ["Save", "保存"],
    ["User {0}", "用户 {0}"],
    ["You've logged in as \\"{0}\\".", "你已登录为 \\"{0}\\"。"],
    ["Switch user", "切换用户"],
    ["Logout", "注销"],
    ["Music Cloud", "Music Cloud"]
]`));
exports.i18n.add2dArray([
    ["_key_", "en", "zh"],
    ["uploads_pending", "Pending", "队列中"],
    ["uploads_uploading", "Uploading", "上传中"],
    ["uploads_error", "Error", "错误"],
    ["uploads_done", "Done", "完成"],
    ["prev_track", "Prev", "上一首"],
    ["next_track", "Next", "下一首"],
]);

},{}],4:[function(require,module,exports){
"use strict";
// file: ListContentView.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const viewlib_1 = require("./viewlib");
const tracklist_1 = require("./tracklist");
const utils_1 = require("./utils");
class DataBackedListViewItem extends viewlib_1.ListViewItem {
    constructor(data) {
        super();
        this.data = data;
    }
}
class DataBackedListView extends viewlib_1.ListView {
    constructor() {
        super(...arguments);
        /** Do NOT modify this array directly, use {add,remove}Data methods instead. */
        this.dataList = [];
    }
    addData(data) {
        this.dataList.push(data);
        if (this._dom)
            this.add(this.createListViewItem(data));
    }
    removeData(pos) {
        var [d] = this.dataList.splice(pos, 1);
        if (this._dom)
            this.remove(pos);
        return d;
    }
    createListViewItem(data) {
        return new DataBackedListViewItem(data);
    }
    postCreateDom() {
        this.dataList.forEach(data => this.add(this.createListViewItem(data)));
    }
}
class ListContentView {
    get rendered() { return !!this.listView; }
    ensureRendered() {
        if (!this.listView) {
            this.dom = this.dom || utils_1.utils.buildDOM({ tag: 'div' });
            this.appendHeader();
            this.appendListView();
        }
    }
    createHeader() {
        return new tracklist_1.ContentHeader({ title: this.title });
    }
    appendHeader() {
        this.header = this.createHeader();
        this.dom.appendView(this.header);
    }
    appendListView() {
        this.listView = new viewlib_1.ListView({ tag: 'div' });
        this.dom.appendView(this.listView);
    }
    onShow() {
        this.ensureRendered();
    }
    onRemove() {
    }
    useLoadingIndicator(li) {
        if (li !== this.loadingIndicator) {
            if (this.loadingIndicator && this.rendered)
                this.loadingIndicator.dom.remove();
            if (li && this.rendered)
                this.insertLoadingIndicator(li);
            this.loadingIndicator = li;
        }
        this.updateView();
    }
    insertLoadingIndicator(li) {
        this.dom.insertBefore(li.dom, this.listView.dom);
    }
    updateView() {
        if (!this.rendered)
            return;
        if (this.listView.length == 0) {
            if (!this.loadingIndicator) {
                this.emptyIndicator = this.emptyIndicator || new viewlib_1.LoadingIndicator({ state: 'normal', content: utils_1.I `(Empty)` });
                this.useLoadingIndicator(this.emptyIndicator);
            }
        }
        else {
            if (this.emptyIndicator && this.loadingIndicator == this.emptyIndicator) {
                this.useLoadingIndicator(null);
            }
        }
    }
    loadingAction(func) {
        return __awaiter(this, void 0, void 0, function* () {
            var li = this.loadingIndicator || new viewlib_1.LoadingIndicator();
            this.useLoadingIndicator(li);
            try {
                yield func();
            }
            catch (error) {
                li.error(error, () => this.loadingAction(func));
                throw error;
            }
            this.useLoadingIndicator(null);
        });
    }
}
exports.ListContentView = ListContentView;
;

},{"./tracklist":12,"./utils":13,"./viewlib":14}],5:[function(require,module,exports){
"use strict";
// file: ListIndex.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const viewlib_1 = require("./viewlib");
const utils_1 = require("./utils");
const tracklist_1 = require("./tracklist");
const User_1 = require("./User");
const Router_1 = require("./Router");
const UI_1 = require("./UI");
const PlayerCore_1 = require("./PlayerCore");
const Api_1 = require("./Api");
class ListIndex {
    constructor() {
        this.loadedList = {};
        this.loadIndicator = new viewlib_1.LoadingIndicator();
        this.nextId = -100;
        this.listView = new viewlib_1.ListView();
        this.listView.dragging = true;
        this.listView.moveByDragging = true;
        this.listView.onItemMoved = (item, from) => {
            User_1.user.setListids(this.listView.map(l => l.listInfo.id));
        };
        this.listView.onDragover = (arg) => {
            var src = arg.source;
            if (src instanceof tracklist_1.TrackViewItem) {
                arg.accept = true;
                arg.event.dataTransfer.dropEffect = 'copy';
                if (arg.drop) {
                    var listinfo = arg.target.listInfo;
                    var list = this.getList(listinfo.id);
                    if (list.fetching)
                        list.fetching.then(r => {
                            list.addTrack(src.track.toApiTrack());
                            return list.put();
                        }).catch(err => {
                            console.error('error adding track:', err);
                        });
                }
            }
        };
        this.listView.onItemClicked = (item) => {
            if (UI_1.ui.sidebarList.currentActive.current === item)
                return;
            UI_1.ui.sidebarList.setActive(item);
            this.showTracklist(item.listInfo.id);
        };
        this.section = new viewlib_1.Section({
            title: utils_1.I `Playlists`,
            content: this.listView,
            actions: [{
                    text: '➕',
                    onclick: () => {
                        this.newTracklist();
                    }
                }]
        });
    }
    init() {
        PlayerCore_1.playerCore.onTrackChanged.add(() => {
            var _a, _b, _c, _d;
            var curPlaying = (_b = (_a = PlayerCore_1.playerCore.track) === null || _a === void 0 ? void 0 : _a._bind) === null || _b === void 0 ? void 0 : _b.list;
            if (curPlaying != this.playing) {
                if (curPlaying)
                    (_c = this.getViewItem(curPlaying.id)) === null || _c === void 0 ? void 0 : _c.updateWith({ playing: true });
                if (this.playing)
                    (_d = this.getViewItem(this.playing.id)) === null || _d === void 0 ? void 0 : _d.updateWith({ playing: false });
                this.playing = curPlaying;
            }
        });
        Api_1.api.onTrackInfoChanged.add((newer) => {
            for (const id in this.loadedList) {
                if (this.loadedList.hasOwnProperty(id)) {
                    const list = this.loadedList[id];
                    list.tracks.forEach(t => {
                        if (t.id === newer.id) {
                            t.updateFromApiTrack(newer);
                            list.listView.get(t._bind.position).updateDom();
                        }
                    });
                }
            }
        });
        UI_1.ui.sidebarList.container.appendView(this.section);
        Router_1.router.addRoute({
            path: ['list'],
            onNav: (arg) => __awaiter(this, void 0, void 0, function* () {
                yield User_1.user.waitLogin(false);
                var id = window.parseInt(arg.remaining[0]);
                var list = this.getList(id);
                UI_1.ui.content.setCurrent(list.createView());
                UI_1.ui.sidebarList.setActive(this.getViewItem(id));
            })
        });
        Router_1.router.addRoute({
            path: [''],
            onNav: (arg) => __awaiter(this, void 0, void 0, function* () {
                if (yield User_1.user.waitLogin(false)) {
                    if (this.listView.length > 0)
                        Router_1.router.nav(['list', this.listView.get(0).listInfo.id.toString()], false);
                }
            })
        });
    }
    setIndex(index) {
        var _a, _b;
        this.listView.clear();
        for (const item of (_b = (_a = index) === null || _a === void 0 ? void 0 : _a.lists, (_b !== null && _b !== void 0 ? _b : []))) {
            this.addListInfo(item);
        }
    }
    addListInfo(listinfo) {
        this.listView.add(new ListIndexViewItem({ index: this, listInfo: listinfo }));
    }
    getListInfo(id) {
        var _a;
        return (_a = this.getViewItem(id)) === null || _a === void 0 ? void 0 : _a.listInfo;
    }
    getList(id) {
        var list = this.loadedList[id];
        if (!list) {
            list = new tracklist_1.TrackList();
            list.loadInfo(this.getListInfo(id));
            if (list.apiid) {
                list.loadFromApi();
            }
            else {
                list.loadEmpty();
            }
            this.loadedList[id] = list;
        }
        return list;
    }
    getViewItem(id) {
        return this.listView.find(lvi => lvi.listInfo.id == id);
    }
    showTracklist(id) {
        Router_1.router.nav(['list', id.toString()]);
    }
    onrename(id, newName) {
        var lvi = this.getViewItem(id);
        lvi.listInfo.name = newName;
        lvi.updateDom();
    }
    removeList(id) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (id < 0) {
                id = yield this.getList(id).getRealId();
            }
            yield Api_1.api.postJson({
                method: 'DELETE',
                path: 'my/lists/' + id,
                obj: null
            });
            (_a = this.getViewItem(id)) === null || _a === void 0 ? void 0 : _a.remove();
        });
    }
    /**
     * Create a Tracklist with an temporary local ID (negative number).
     * It should be sync to server and get a real ID later.
     */
    newTracklist() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(yield User_1.user.waitLogin(false))) {
                this._toastLogin = this._toastLogin || new viewlib_1.Toast({ text: utils_1.I `Login to create playlists!` });
                this._toastLogin.show(3000);
                return;
            }
            var id = this.nextId--;
            var list = {
                id,
                name: utils_1.utils.createName((x) => x ? utils_1.I `New Playlist (${x + 1})` : utils_1.I `New Playlist`, (x) => !!this.listView.find((l) => l.listInfo.name == x))
            };
            this.addListInfo(list);
            var listview = this.getList(id);
            listview.postToUser().then(() => {
                list.id = listview.apiid;
            }, (err) => {
                viewlib_1.Toast.show(utils_1.I `Failed to create playlist "${list.name}".` + '\n' + err, 5000);
            });
        });
    }
}
exports.ListIndex = ListIndex;
class ListIndexViewItem extends UI_1.SidebarItem {
    constructor(init) {
        super({});
        this.playing = false;
        this.onContextMenu = (item, ev) => {
            var m = new viewlib_1.ContextMenu();
            if (this.index && this.listInfo)
                m.add(new viewlib_1.MenuItem({
                    text: utils_1.I `Remove`, cls: 'dangerous',
                    onclick: () => {
                        this.index.removeList(this.listInfo.id);
                    }
                }));
            if (this.listInfo)
                m.add(new viewlib_1.MenuInfoItem({
                    text: utils_1.I `List ID` + ': ' + this.listInfo.id
                }));
            if (m.length) {
                ev.preventDefault();
                m.show({ ev: ev });
            }
        };
        utils_1.utils.objectApply(this, init);
    }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.item.no-selection',
            style: 'display: flex',
            child: [
                { tag: 'span.name.flex-1', _key: 'domname' },
                { tag: 'span.state', style: 'margin-left: .5em; font-size: 80%;', _key: 'domstate' }
            ],
            onclick: (ev) => { var _a, _b; return (_b = (_a = this).onclick) === null || _b === void 0 ? void 0 : _b.call(_a, ev); }
        };
    }
    updateDom() {
        var _a, _b;
        this.domname.textContent = (_b = (_a = this.listInfo) === null || _a === void 0 ? void 0 : _a.name, (_b !== null && _b !== void 0 ? _b : this.text));
        this.domstate.textContent = this.playing ? "🎵" : "";
        this.domstate.hidden = !this.domstate.textContent;
    }
}
exports.ListIndexViewItem = ListIndexViewItem;

},{"./Api":1,"./PlayerCore":6,"./Router":7,"./UI":8,"./User":10,"./tracklist":12,"./utils":13,"./viewlib":14}],6:[function(require,module,exports){
"use strict";
// file: PlayerCore.ts
Object.defineProperty(exports, "__esModule", { value: true });
const UI_1 = require("./UI");
const utils_1 = require("./utils");
const Api_1 = require("./Api");
/** 播放器核心：控制播放逻辑 */
exports.playerCore = new class PlayerCore {
    constructor() {
        this.loopMode = 'list-loop';
        this.onTrackChanged = new utils_1.Callbacks();
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('canplay', () => this.updateProgress());
        this.audio.addEventListener('error', (e) => {
            console.log(e);
        });
        this.audio.addEventListener('ended', () => {
            this.next();
        });
        UI_1.ui.playerControl.setProgressChangedCallback((x) => {
            this.audio.currentTime = x * this.audio.duration;
        });
    }
    get isPlaying() { return this.audio.duration && !this.audio.paused; }
    get isPaused() { return this.audio.paused; }
    get canPlay() { return this.audio.readyState >= 2; }
    prev() { return this.next(-1); }
    next(offset) {
        var _a, _b, _c;
        var nextTrack = (_c = (_b = (_a = this.track) === null || _a === void 0 ? void 0 : _a._bind) === null || _b === void 0 ? void 0 : _b.list) === null || _c === void 0 ? void 0 : _c.getNextTrack(this.track, this.loopMode, offset);
        if (nextTrack)
            this.playTrack(nextTrack);
        else
            this.setTrack(null);
    }
    updateProgress() {
        UI_1.ui.playerControl.setProg(this.audio.currentTime, this.audio.duration);
    }
    loadUrl(src) {
        if (src) {
            this.audio.src = src;
        }
        else {
            this.audio.pause();
            this.audio.removeAttribute('src');
        }
        this.audio.load();
    }
    setTrack(track) {
        var _a;
        var oldTrack = this.track;
        this.track = track;
        UI_1.ui.trackinfo.setTrack(track);
        this.onTrackChanged.invoke();
        if (((_a = oldTrack) === null || _a === void 0 ? void 0 : _a.url) !== this.track.url)
            this.loadUrl(track ? Api_1.api.processUrl(track.url) : null);
    }
    playTrack(track) {
        if (track === this.track)
            return;
        this.setTrack(track);
        this.play();
    }
    play() {
        this.audio.play();
    }
    pause() {
        this.audio.pause();
    }
};
if (navigator['mediaSession']) {
    let mediaSession = navigator['mediaSession'];
    exports.playerCore.onTrackChanged.add(() => {
        var _a, _b;
        try {
            var track = exports.playerCore.track;
            if (!track)
                return;
            mediaSession.metadata = new MediaMetadata({
                title: (_a = track) === null || _a === void 0 ? void 0 : _a.name,
                artist: (_b = track) === null || _b === void 0 ? void 0 : _b.artist
            });
        }
        catch (_c) { }
    });
    mediaSession.setActionHandler('play', () => exports.playerCore.play());
    mediaSession.setActionHandler('pause', () => exports.playerCore.pause());
    mediaSession.setActionHandler('previoustrack', () => exports.playerCore.prev());
    mediaSession.setActionHandler('nexttrack', () => exports.playerCore.next());
}
window.addEventListener('beforeunload', (ev) => {
    if (!exports.playerCore.track || exports.playerCore.audio.paused)
        return;
    ev.preventDefault();
    return ev.returnValue = 'The player is running. Are you sure to leave?';
});

},{"./Api":1,"./UI":8,"./utils":13}],7:[function(require,module,exports){
"use strict";
// file: Router.ts
Object.defineProperty(exports, "__esModule", { value: true });
const UI_1 = require("./UI");
exports.router = new class {
    constructor() {
        this.routes = [];
    }
    init() {
        window.addEventListener('popstate', (ev) => {
            this.navByLocation();
        });
        this.navByLocation();
    }
    navByLocation() {
        var hash = window.location.hash;
        this.nav(hash ? hash.substr(1) : '', false);
    }
    addRoute(arg) {
        this.routes.push(arg);
        if (arg.sidebarItem)
            arg.sidebarItem().onclick = () => {
                this.nav([...arg.path]);
            };
    }
    nav(path, pushState) {
        if (typeof path === 'string')
            path = parsePath(path);
        for (const r of this.routes) {
            if (match(path, r)) {
                if (r.contentView)
                    UI_1.ui.content.setCurrent(r.contentView());
                if (r.sidebarItem)
                    UI_1.ui.sidebarList.setActive(r.sidebarItem());
                if (r.onNav)
                    r.onNav({ path, remaining: path.slice(r.path.length) });
                break;
            }
        }
        var strPath = path.join('/');
        if (pushState === undefined || pushState) {
            window.history.pushState({}, strPath, '#' + strPath);
        }
    }
};
function match(path, route) {
    var rp = route.path;
    for (let i = 0; i < rp.length; i++) {
        if (path[i] !== rp[i])
            return false;
    }
    return true;
}
function parsePath(path) {
    return path.split('/');
}

},{"./UI":8}],8:[function(require,module,exports){
"use strict";
// file: UI.ts
Object.defineProperty(exports, "__esModule", { value: true });
const Router_1 = require("./Router");
const utils_1 = require("./utils");
const I18n_1 = require("./I18n");
const User_1 = require("./User");
const viewlib_1 = require("./viewlib");
/** 常驻 UI 元素操作 */
exports.ui = new class {
    constructor() {
        this.lang = new class {
            constructor() {
                this.availableLangs = ['en', 'zh'];
                this.siLang = new utils_1.SettingItem('mcloud-lang', 'str', I18n_1.I18n.detectLanguage(this.availableLangs));
            }
            init() {
                this.siLang.render((lang) => {
                    I18n_1.i18n.curLang = lang;
                    document.body.lang = lang;
                });
                console.log(`Current language: '${I18n_1.i18n.curLang}' - '${I18n_1.I `English`}'`);
                I18n_1.i18n.renderElements(document.querySelectorAll('.i18ne'));
            }
            setLang(lang) {
                this.siLang.set(lang);
                window.location.reload();
            }
        };
        this.bottomBar = new class {
            constructor() {
                this.container = document.getElementById("bottombar");
                this.btnPin = document.getElementById('btnPin');
                this.pinned = true;
                this.hideTimer = new utils_1.utils.Timer(() => { this.toggle(false); });
                this.shown = false;
                this.inTransition = false;
            }
            setPinned(val) {
                val = (val !== null && val !== void 0 ? val : !this.pinned);
                this.pinned = val;
                utils_1.utils.toggleClass(document.body, 'bottompinned', val);
                this.btnPin.textContent = val ? I18n_1.I `Unpin` : I18n_1.I `Pin`;
                if (val)
                    this.toggle(true);
            }
            toggle(state, hideTimeout) {
                this.shown = utils_1.utils.toggleClass(this.container, 'show', state);
                if (!this.pinned && hideTimeout)
                    this.hideTimer.timeout(hideTimeout);
            }
            init() {
                var bar = this.container;
                bar.addEventListener('transitionstart', (e) => {
                    if (e.target === bar && e.propertyName == 'transform')
                        this.inTransition = true;
                });
                bar.addEventListener('transitionend', (e) => {
                    if (e.target === bar && e.propertyName == 'transform')
                        this.inTransition = false;
                });
                bar.addEventListener('transitioncancel', (e) => {
                    if (e.target === bar && e.propertyName == 'transform')
                        this.inTransition = false;
                });
                bar.addEventListener('mouseenter', () => {
                    this.hideTimer.tryCancel();
                    this.toggle(true);
                });
                bar.addEventListener('mouseleave', () => {
                    this.hideTimer.tryCancel();
                    if (!this.pinned)
                        this.hideTimer.timeout(200);
                });
                this.siPin = new utils_1.SettingItem('mcloud-bottompin', 'bool', false)
                    .render(x => this.setPinned(x))
                    .bindToBtn(this.btnPin, ['', '']);
                // this.btnPin.addEventListener('click', () => this.setPinned());
            }
        };
        this.playerControl = new class {
            constructor() {
                this.progbar = document.getElementById('progressbar');
                this.fill = document.getElementById('progressbar-fill');
                this.labelCur = document.getElementById('progressbar-label-cur');
                this.labelTotal = document.getElementById('progressbar-label-total');
            }
            setProg(cur, total) {
                var prog = cur / total;
                prog = utils_1.utils.numLimit(prog, 0, 1);
                this.fill.style.width = (prog * 100) + '%';
                this.labelCur.textContent = utils_1.utils.formatTime(cur);
                this.labelTotal.textContent = utils_1.utils.formatTime(total);
            }
            setProgressChangedCallback(cb) {
                var call = (e) => { cb(utils_1.utils.numLimit(e.offsetX / this.progbar.clientWidth, 0, 1)); };
                this.progbar.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    if (exports.ui.bottomBar.shown && !exports.ui.bottomBar.inTransition)
                        if (e.buttons == 1)
                            call(e);
                });
                this.progbar.addEventListener('mousemove', (e) => {
                    if (exports.ui.bottomBar.shown && !exports.ui.bottomBar.inTransition)
                        if (e.buttons == 1)
                            call(e);
                });
            }
        };
        this.trackinfo = new class {
            constructor() {
                this.element = document.getElementById('bottombar-trackinfo');
            }
            setTrack(track) {
                if (track) {
                    utils_1.utils.replaceChild(this.element, utils_1.utils.buildDOM({
                        tag: 'span',
                        child: [
                            // 'Now Playing: ',
                            { tag: 'span.name', textContent: track.name },
                            { tag: 'span.artist', textContent: track.artist },
                        ]
                    }));
                    exports.ui.bottomBar.toggle(true, 5000);
                }
                else {
                    this.element.textContent = "";
                }
            }
        };
        this.mainContainer = new class {
            constructor() {
                this.dom = document.getElementById('main-container');
            }
        };
        this.sidebarLogin = new class {
            constructor() {
                this.container = document.getElementById('sidebar-login');
                this.loginState = document.getElementById('login-state');
            }
            init() {
                this.loginState.addEventListener('click', (ev) => {
                    User_1.user.openUI();
                });
            }
            update() {
                var _a, _b;
                var text = this.loginState.textContent;
                var username = (_b = (_a = User_1.user.pendingInfo) === null || _a === void 0 ? void 0 : _a.username, (_b !== null && _b !== void 0 ? _b : User_1.user.info.username));
                if (username) {
                    text = username;
                    if (User_1.user.state == 'logging')
                        text += I18n_1.I ` (logging in...)`;
                    if (User_1.user.state == 'error')
                        text += I18n_1.I ` (error!)`;
                    if (User_1.user.state == 'none')
                        text += I18n_1.I ` (not logged in)`;
                }
                else {
                    if (User_1.user.state == 'logging')
                        text = I18n_1.I `(logging...)`;
                    else
                        text = I18n_1.I `Guest (click to login)`;
                }
                this.loginState.textContent = text;
            }
        };
        this.sidebarList = new class {
            constructor() {
                this.container = document.getElementById('sidebar-list');
                this.listview = new viewlib_1.ListView(this.container);
                this.currentActive = new utils_1.ItemActiveHelper();
            }
            setActive(item) {
                this.currentActive.set(item);
            }
            addItem(item) {
                if (typeof item == 'string')
                    item = new SidebarItem({ text: item });
                this.listview.add(item);
            }
        };
        this.content = new class {
            constructor() {
                this.container = document.getElementById('content-outer');
                this.current = null;
            }
            removeCurrent() {
                const cur = this.current;
                this.current = null;
                if (!cur)
                    return;
                cur.contentViewState.scrollTop = this.container.scrollTop;
                if (cur.onRemove)
                    cur.onRemove();
                if (cur.dom)
                    this.container.removeChild(cur.dom);
            }
            setCurrent(arg) {
                if (arg === this.current)
                    return;
                this.removeCurrent();
                if (arg) {
                    if (arg.onShow)
                        arg.onShow();
                    if (arg.dom)
                        this.container.appendChild(arg.dom);
                    if (!arg.contentViewState)
                        arg.contentViewState = { scrollTop: 0 };
                    this.container.scrollTop = arg.contentViewState.scrollTop;
                }
                this.current = arg;
            }
        };
    }
    init() {
        this.lang.init();
        this.bottomBar.init();
        this.sidebarLogin.init();
        viewlib_1.Dialog.defaultParent = this.mainContainer.dom;
        viewlib_1.ToastsContainer.default.parentDom = this.mainContainer.dom;
        Router_1.router.addRoute({
            path: ['home'],
            onNav: () => {
                exports.ui.content.setCurrent(null);
                exports.ui.sidebarList.currentActive.set(null);
            }
        });
        document.addEventListener('dragover', (ev) => {
            ev.preventDefault();
        });
        document.addEventListener('drop', (ev) => {
            ev.preventDefault();
        });
    }
}; // ui
class SidebarItem extends viewlib_1.ListViewItem {
    constructor(init) {
        super();
        utils_1.utils.objectApply(this, init);
    }
    createDom() {
        return {
            tag: 'div.item.no-selection',
            onclick: (e) => { var _a, _b; return (_b = (_a = this).onclick) === null || _b === void 0 ? void 0 : _b.call(_a, e); }
        };
    }
    updateDom() {
        this.dom.textContent = this.text;
    }
    bindContentView(viewFunc) {
        var view;
        this.onclick = () => {
            if (!view)
                view = viewFunc();
            exports.ui.content.setCurrent(view);
            exports.ui.sidebarList.setActive(this);
        };
        return this;
    }
}
exports.SidebarItem = SidebarItem;

},{"./I18n":3,"./Router":7,"./User":10,"./utils":13,"./viewlib":14}],9:[function(require,module,exports){
"use strict";
// file: Uploads.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const tracklist_1 = require("./tracklist");
const utils_1 = require("./utils");
const ListIndex_1 = require("./ListIndex");
const User_1 = require("./User");
const viewlib_1 = require("./viewlib");
const Router_1 = require("./Router");
const I18n_1 = require("./I18n");
const PlayerCore_1 = require("./PlayerCore");
const UI_1 = require("./UI");
const Api_1 = require("./Api");
class UploadTrack extends tracklist_1.Track {
    constructor(init) {
        super(init);
    }
}
exports.uploads = new class extends tracklist_1.TrackList {
    constructor() {
        super(...arguments);
        this.tracks = [];
        this.state = false;
        this.canEdit = false;
        this.uploadSemaphore = new utils_1.Semaphore({ maxCount: 2 });
        this.view = new class extends tracklist_1.TrackListView {
            appendHeader() {
                this.title = I18n_1.I `My Uploads`;
                super.appendHeader();
                this.uploadArea = new UploadArea({ onfile: (file) => exports.uploads.uploadFile(file) });
                this.dom.appendView(this.uploadArea);
            }
            createHeader() {
                return new tracklist_1.ContentHeader({
                    title: this.title
                });
            }
            appendListView() {
                super.appendListView();
                if (!exports.uploads.state)
                    exports.uploads.fetch();
            }
            createViewItem(t) {
                return new UploadViewItem(t);
            }
        }(this);
    }
    init() {
        this.sidebarItem = new ListIndex_1.ListIndexViewItem({ text: I18n_1.I `My Uploads` });
        Router_1.router.addRoute({
            path: ['uploads'],
            sidebarItem: () => this.sidebarItem,
            contentView: () => this.view
        });
        UI_1.ui.sidebarList.addItem(this.sidebarItem);
        User_1.user.onSwitchedUser.add(() => {
            if (this.state !== false && this.state !== 'waiting') {
                this.tracks = [];
                this.state = false;
                if (this.view.rendered) {
                    this.view.listView.removeAll();
                    this.view.updateView();
                }
                setTimeout(() => this.fetch(), 1);
            }
        });
        PlayerCore_1.playerCore.onTrackChanged.add(() => {
            this.sidebarItem.updateWith({ playing: !!this.tracks.find(x => x === PlayerCore_1.playerCore.track) });
        });
        Api_1.api.onTrackInfoChanged.add((newer) => {
            this.tracks.forEach(t => {
                var _a;
                if (t.id === newer.id) {
                    t.updateFromApiTrack(newer);
                    (_a = t._upload.view) === null || _a === void 0 ? void 0 : _a.updateDom();
                }
            });
        });
    }
    prependTrack(t) {
        this.tracks.unshift(t);
        if (this.view.rendered)
            this.view.addItem(t, 0);
    }
    appendTrack(t) {
        this.tracks.push(t);
        if (this.view.rendered)
            this.view.addItem(t);
    }
    fetch() {
        return __awaiter(this, void 0, void 0, function* () {
            this.state = 'waiting';
            var li = new viewlib_1.LoadingIndicator();
            li.content = I18n_1.I `Logging in`;
            this.view.useLoadingIndicator(li);
            try {
                yield User_1.user.waitLogin(true);
                this.state = 'fetching';
                li.reset();
                var fetched = (yield Api_1.api.getJson('my/uploads'))['tracks']
                    .reverse()
                    .map(t => {
                    t._upload = { state: 'done' };
                    return new UploadTrack(t);
                });
                this.state = 'fetched';
            }
            catch (error) {
                li.error(error, () => this.fetch());
                return;
            }
            this.tracks = this.tracks.filter(t => {
                var _a;
                if (t._upload.state == 'done') {
                    (_a = t._upload.view) === null || _a === void 0 ? void 0 : _a.remove();
                    return false;
                }
                return true;
            });
            this.view.useLoadingIndicator(null);
            fetched.forEach(t => this.appendTrack(t));
            this.view.updateView();
        });
    }
    uploadFile(file) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            var apitrack = {
                id: undefined, url: undefined,
                artist: 'Unknown', name: file.name
            };
            var track = new UploadTrack(Object.assign(Object.assign({}, apitrack), { _upload: {
                    state: 'pending'
                } }));
            this.prependTrack(track);
            yield this.uploadSemaphore.enter();
            try {
                track._upload.state = 'uploading';
                (_a = track._upload.view) === null || _a === void 0 ? void 0 : _a.updateDom();
                var jsonBlob = new Blob([JSON.stringify(apitrack)]);
                var finalBlob = new Blob([
                    BlockFormat.encodeBlock(jsonBlob),
                    BlockFormat.encodeBlock(file)
                ]);
                var resp = yield Api_1.api.postJson({
                    path: 'tracks/newfile',
                    method: 'POST',
                    mode: 'raw',
                    obj: finalBlob,
                    headers: { 'Content-Type': 'application/x-mcloud-upload' }
                });
                track.id = resp.id;
                track.updateFromApiTrack(resp);
            }
            catch (err) {
                track._upload.state = 'error';
                (_b = track._upload.view) === null || _b === void 0 ? void 0 : _b.updateDom();
                throw err;
            }
            finally {
                this.uploadSemaphore.exit();
            }
            track._upload.state = 'done';
            (_c = track._upload.view) === null || _c === void 0 ? void 0 : _c.updateDom();
        });
    }
};
class UploadViewItem extends tracklist_1.TrackViewItem {
    constructor(track) {
        super(track);
        this.noPos = true;
        track._upload.view = this;
    }
    postCreateDom() {
        super.postCreateDom();
        this.dom.classList.add('uploads-item');
        this.dom.appendChild(this.domstate = utils_1.utils.buildDOM({ tag: 'span.uploads-state' }));
    }
    updateDom() {
        super.updateDom();
        var newState = this.track._upload.state;
        if (this._lastUploadState != newState) {
            if (this._lastUploadState)
                this.dom.classList.remove('state-' + this._lastUploadState);
            if (newState)
                this.dom.classList.add('state-' + newState);
            this.domstate.textContent = I18n_1.i18n.get('uploads_' + newState);
            this.dragging = newState == 'done';
        }
    }
}
class UploadArea extends viewlib_1.View {
    constructor(init) {
        super();
        utils_1.utils.objectApply(this, init);
    }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.upload-area.clickable',
            child: [
                { tag: 'div.text.no-selection', textContent: I18n_1.I `Click here to select files to upload` },
                { tag: 'div.text.no-selection', textContent: I18n_1.I `or drag files to this zone...` },
                {
                    tag: 'input', type: 'file', _key: 'domfile',
                    style: 'visibility: collapse; height: 0;',
                    accept: 'audio/*', multiple: true
                },
            ]
        };
    }
    postCreateDom() {
        this.domfile.addEventListener('change', (ev) => {
            this.handleFiles(this.domfile.files);
        });
        this.dom.addEventListener('click', (ev) => {
            this.domfile.click();
        });
        this.dom.addEventListener('dragover', (ev) => {
            if (ev.dataTransfer.types.indexOf('Files') >= 0) {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'copy';
            }
        });
        this.dom.addEventListener('drop', (ev) => {
            ev.preventDefault();
            if (ev.dataTransfer.types.indexOf('Files') >= 0) {
                this.handleFiles(ev.dataTransfer.files);
            }
        });
    }
    handleFiles(files) {
        var _a, _b;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log('drop file', { name: file.name, size: file.size });
            (_b = (_a = this).onfile) === null || _b === void 0 ? void 0 : _b.call(_a, file);
        }
    }
}
var BlockFormat = {
    encodeBlock(blob) {
        return new Blob([BlockFormat.encodeLen(blob.size), blob]);
    },
    encodeLen(len) {
        var str = '';
        for (var i = 0; i < 8; i++) {
            str = '0123456789aBcDeF'[(len >> (i * 4)) & 0x0f] + str;
        }
        str += '\r\n';
        return str;
    }
};

},{"./Api":1,"./I18n":3,"./ListIndex":5,"./PlayerCore":6,"./Router":7,"./UI":8,"./User":10,"./tracklist":12,"./utils":13,"./viewlib":14}],10:[function(require,module,exports){
"use strict";
// file: User.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const main_1 = require("./main");
const viewlib_1 = require("./viewlib");
const UI_1 = require("./UI");
const Api_1 = require("./Api");
exports.user = new class User {
    constructor() {
        this.siLogin = new utils_1.SettingItem('mcloud-login', 'json', {
            id: -1,
            username: null,
            passwd: null
        });
        this.onSwitchedUser = new utils_1.Callbacks();
    }
    get info() { return this.siLogin.data; }
    setState(state) {
        this.state = state;
        UI_1.ui.sidebarLogin.update();
    }
    init() {
        if (this.info.username) {
            this.login(this.info).then(null, (err) => {
                viewlib_1.Toast.show(utils_1.I `Failed to login.` + '\n' + err, 5000);
            });
        }
        else {
            this.setState('none');
            this.openUI();
        }
    }
    initLoginUI() {
        this.loginDialog = new LoginDialog();
    }
    openUI(login) {
        login = (login !== null && login !== void 0 ? login : this.state !== 'logged');
        if (login) {
            if (!this.loginDialog)
                this.loginDialog = new LoginDialog();
            this.loginDialog.show();
        }
        else {
            new MeDialog().show();
        }
    }
    closeUI() {
        var _a;
        (_a = this.loginDialog) === null || _a === void 0 ? void 0 : _a.close();
    }
    getBasicAuth(info) {
        return info.username + ':' + info.passwd;
    }
    login(info) {
        return __awaiter(this, void 0, void 0, function* () {
            this.setState('logging');
            // try GET `api/users/me` using the new info
            var promise = (() => __awaiter(this, void 0, void 0, function* () {
                try {
                    // thanks to the keyword `var` of JavaScript.
                    var resp = yield Api_1.api.getJson('users/me', {
                        basicAuth: this.getBasicAuth(info)
                    });
                }
                catch (err) {
                    this.setState('error');
                    if (err.message == 'user_not_found')
                        throw new Error(utils_1.I `Username or password is not correct.`);
                    throw err;
                }
                finally {
                    this.pendingInfo = null;
                }
                // fill the passwd because the server won't return it
                resp.passwd = info.passwd;
                yield this.handleLoginResult(resp);
            }))();
            this.loggingin = promise;
            yield promise;
        });
    }
    register(info) {
        return __awaiter(this, void 0, void 0, function* () {
            this.setState('logging');
            var promise = (() => __awaiter(this, void 0, void 0, function* () {
                var resp = yield Api_1.api.postJson({
                    method: 'POST',
                    path: 'users/new',
                    obj: info
                });
                if (resp.error) {
                    this.setState('error');
                    if (resp.error == 'dup_user')
                        throw new Error(utils_1.I `A user with the same username exists`);
                    throw new Error(resp.error);
                }
                // fill the passwd because the server won't return it
                resp.passwd = info.passwd;
                yield this.handleLoginResult(resp);
            }))();
            this.loggingin = promise;
            yield promise;
        });
    }
    handleLoginResult(info) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!info.username)
                throw new Error(utils_1.I `iNTernEL eRRoR`);
            var switchingUser = this.info.username != info.username;
            this.info.id = info.id;
            this.info.username = info.username;
            this.info.passwd = info.passwd;
            this.siLogin.save();
            var servermsg = info['servermsg'];
            if (servermsg)
                viewlib_1.Toast.show(utils_1.I `Server: ` + servermsg, 3000);
            Api_1.api.defaultBasicAuth = this.getBasicAuth(this.info);
            UI_1.ui.sidebarLogin.update();
            main_1.listIndex.setIndex(info);
            this.setState('logged');
            this.loggingin = null;
            this.onSwitchedUser.invoke();
        });
    }
    logout() {
        utils_1.utils.objectApply(this.info, { id: -1, username: null, passwd: null });
        this.siLogin.save();
        Api_1.api.defaultBasicAuth = undefined;
        UI_1.ui.content.setCurrent(null);
        main_1.listIndex.setIndex(null);
        this.setState('none');
        this.loggingin = null;
        this.onSwitchedUser.invoke();
    }
    setListids(listids) {
        return __awaiter(this, void 0, void 0, function* () {
            var obj = {
                id: this.info.id,
                username: this.info.username,
                listids: listids
            };
            yield Api_1.api.postJson({
                path: 'users/me',
                method: 'PUT',
                obj
            });
        });
    }
    /**
     * Wait until finished logging in. Returns true if sucessfully logged in.
     */
    waitLogin(throwOnFail) {
        return __awaiter(this, void 0, void 0, function* () {
            do {
                if (this.state == 'logged')
                    return true;
                if (this.state == 'logging') {
                    try {
                        yield this.loggingin;
                        if (this.state != 'logged')
                            break;
                        return true;
                    }
                    catch (_a) {
                        break;
                    }
                }
            } while (0);
            if (throwOnFail)
                throw new Error('No login');
            return false;
        });
    }
};
class LoginDialog extends viewlib_1.Dialog {
    constructor() {
        super();
        this.tabLogin = new viewlib_1.TabBtn({ text: utils_1.I `Login`, active: true });
        this.tabCreate = new viewlib_1.TabBtn({ text: utils_1.I `Create account` });
        this.inputUser = new viewlib_1.LabeledInput({ label: utils_1.I `Username` });
        this.inputPasswd = new viewlib_1.LabeledInput({ label: utils_1.I `Password`, type: 'password' });
        this.inputPasswd2 = new viewlib_1.LabeledInput({ label: utils_1.I `Confirm password`, type: 'password' });
        this.viewStatus = new viewlib_1.TextView({ tag: 'div.input-label', style: 'white-space: pre-wrap; color: red;' });
        this.btn = new viewlib_1.ButtonView({ text: utils_1.I `Login`, type: 'big' });
        this.isRegistering = false;
        var dig = this;
        dig.title = '';
        [this.tabLogin, this.tabCreate].forEach(x => {
            dig.addBtn(x);
            x.onClick.add(() => toggle(x));
        });
        [this.inputUser, this.inputPasswd, this.inputPasswd2].forEach(x => dig.addContent(x));
        dig.addContent(utils_1.utils.buildDOM({
            tag: 'div',
            child: [this.viewStatus.dom, this.btn.dom]
        }));
        dig.dom.addEventListener('keydown', (ev) => {
            if (ev.keyCode == 13) { // Enter
                this.btnClicked();
                ev.preventDefault();
            }
        });
        dig.autoFocus = this.inputUser.input;
        this.btn.toggleClass('bigbtn', true);
        this.btn.dom.addEventListener('click', () => this.btnClicked());
        var toggle = (btn) => {
            if (btn.active)
                return;
            this.isRegistering = !this.isRegistering;
            this.inputPasswd2.hidden = !this.isRegistering;
            this.btn.text = btn.text;
            this.tabLogin.updateWith({ active: !this.isRegistering });
            this.tabCreate.updateWith({ active: this.isRegistering });
        };
        this.inputPasswd2.hidden = true;
    }
    btnClicked() {
        if (this.btn.dom.classList.contains('disabled'))
            return;
        var precheckErr = [];
        if (!this.inputUser.value)
            precheckErr.push(utils_1.I `Please input the username!`);
        if (!this.inputPasswd.value)
            precheckErr.push(utils_1.I `Please input the password!`);
        else if (this.isRegistering && this.inputPasswd.value !== this.inputPasswd2.value)
            precheckErr.push(utils_1.I `Password confirmation does not match!`);
        this.viewStatus.dom.textContent = precheckErr.join('\r\n');
        if (precheckErr.length) {
            return;
        }
        (() => __awaiter(this, void 0, void 0, function* () {
            this.viewStatus.text = utils_1.I `Requesting...`;
            this.btn.updateWith({ disabled: true });
            var info = { username: this.inputUser.value, passwd: this.inputPasswd.value };
            try {
                exports.user.pendingInfo = info;
                if (this.isRegistering) {
                    yield exports.user.register(info);
                }
                else {
                    yield exports.user.login(info);
                }
                this.viewStatus.text = '';
                exports.user.closeUI();
            }
            catch (e) {
                this.viewStatus.text = e;
                // fallback to previous login info
                if (exports.user.info.username) {
                    yield exports.user.login(exports.user.info);
                    this.viewStatus.text += '\r\n' + utils_1.I `Logged in with previous working account.`;
                }
            }
            finally {
                exports.user.pendingInfo = null;
                this.btn.updateWith({ disabled: false });
            }
        }))();
    }
}
class MeDialog extends viewlib_1.Dialog {
    constructor() {
        super();
        this.btnSwitch = new viewlib_1.ButtonView({ text: utils_1.I `Switch user`, type: 'big' });
        this.btnLogout = new viewlib_1.ButtonView({ text: utils_1.I `Logout`, type: 'big' });
        var username = exports.user.info.username;
        this.title = utils_1.I `User ${username}`;
        this.addContent(new viewlib_1.View({ tag: 'div', textContent: utils_1.I `You've logged in as "${username}".` }));
        this.addContent(this.btnSwitch);
        this.addContent(this.btnLogout);
        this.btnSwitch.onclick = () => {
            exports.user.openUI(true);
            this.close();
        };
        this.btnLogout.onclick = () => {
            exports.user.logout();
            this.close();
        };
    }
}

},{"./Api":1,"./UI":8,"./main":11,"./utils":13,"./viewlib":14}],11:[function(require,module,exports){
"use strict";
// file: main.ts
// TypeScript 3.7 is required.
Object.defineProperty(exports, "__esModule", { value: true });
// Why do we need to use React and Vue.js? ;)
exports.settings = {
    apiBaseUrl: 'api/',
    // apiBaseUrl: 'http://127.0.0.1:50074/api/',
    // apiBaseUrl: 'http://127.0.0.1:5000/api/',
    debug: true,
    apiDebugDelay: 0,
};
const viewlib_1 = require("./viewlib");
const UI_1 = require("./UI");
const PlayerCore_1 = require("./PlayerCore");
const Api_1 = require("./Api");
const User_1 = require("./User");
const ListIndex_1 = require("./ListIndex");
const Uploads_1 = require("./Uploads");
const Discussion_1 = require("./Discussion");
const Router_1 = require("./Router");
UI_1.ui.init();
exports.listIndex = new ListIndex_1.ListIndex();
var app = window['app'] = {
    ui: UI_1.ui, api: Api_1.api, playerCore: PlayerCore_1.playerCore, router: Router_1.router, listIndex: exports.listIndex, user: User_1.user, uploads: Uploads_1.uploads, discussion: Discussion_1.discussion, notes: Discussion_1.notes,
    Toast: viewlib_1.Toast, ToastsContainer: viewlib_1.ToastsContainer,
    init() {
        User_1.user.init();
        Uploads_1.uploads.init();
        Discussion_1.discussion.init();
        Discussion_1.notes.init();
        exports.listIndex.init();
        Router_1.router.init();
    }
};
app.init();

},{"./Api":1,"./Discussion":2,"./ListIndex":5,"./PlayerCore":6,"./Router":7,"./UI":8,"./Uploads":9,"./User":10,"./viewlib":14}],12:[function(require,module,exports){
"use strict";
// file: TrackList.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const viewlib_1 = require("./viewlib");
const ListContentView_1 = require("./ListContentView");
const User_1 = require("./User");
const Api_1 = require("./Api");
const main_1 = require("./main");
const PlayerCore_1 = require("./PlayerCore");
/** A track binding with list */
class Track {
    constructor(init) {
        utils_1.utils.objectApply(this, init);
    }
    toString() {
        return `${utils_1.I `Track ID`}: ${this.id}\r\n${utils_1.I `Name`}: ${this.name}\r\n${utils_1.I `Artist`}: ${this.artist}`;
    }
    toApiTrack() {
        return utils_1.utils.objectApply({}, this, ['id', 'artist', 'name', 'url']);
    }
    updateFromApiTrack(t) {
        if (this.id !== t.id)
            throw new Error('Bad track id');
        utils_1.utils.objectApply(this, t, ['id', 'name', 'artist', 'url']);
    }
    startEdit() {
        var dialog = new class extends viewlib_1.Dialog {
            constructor() {
                super();
                this.width = '500px';
                this.inputName = new viewlib_1.LabeledInput({ label: utils_1.I `Name` });
                this.inputArtist = new viewlib_1.LabeledInput({ label: utils_1.I `Artist` });
                this.btnSave = new viewlib_1.TabBtn({ text: utils_1.I `Save`, right: true });
                this.autoFocus = this.inputName.input;
                [this.inputName, this.inputArtist].forEach(x => this.addContent(x));
                this.addBtn(this.btnSave);
                this.btnSave.onClick.add(() => this.save());
                this.dom.addEventListener('keydown', (ev) => {
                    if (ev.keyCode == 13) {
                        ev.preventDefault();
                        this.save();
                    }
                });
            }
            fillInfo(t) {
                this.trackId = t.id;
                this.title = utils_1.I `Track ID` + ' ' + t.id;
                this.inputName.updateWith({ value: t.name });
                this.inputArtist.updateWith({ value: t.artist });
                this.updateDom();
            }
            save() {
                return __awaiter(this, void 0, void 0, function* () {
                    this.btnSave.updateWith({ clickable: false, text: utils_1.I `Saving...` });
                    try {
                        var newinfo = yield Api_1.api.postJson({
                            method: 'PUT', path: 'tracks/' + this.trackId,
                            obj: {
                                id: this.trackId,
                                name: this.inputName.value,
                                artist: this.inputArtist.value
                            }
                        });
                        if (newinfo.id != this.trackId)
                            throw new Error('Bad ID in response');
                        Api_1.api.onTrackInfoChanged.invoke(newinfo);
                        this.close();
                    }
                    catch (error) {
                        this.btnSave.updateWith({ clickable: false, text: utils_1.I `Error` });
                        yield utils_1.utils.sleepAsync(3000);
                    }
                    this.btnSave.updateWith({ clickable: true, text: utils_1.I `Save` });
                });
            }
        };
        dialog.fillInfo(this);
        dialog.show();
    }
}
exports.Track = Track;
class TrackList {
    constructor() {
        this.tracks = [];
        this.canEdit = true;
    }
    setLoadIndicator(li) {
        this.loadIndicator = li;
        if (this.contentView)
            this.contentView.useLoadingIndicator(li);
    }
    loadInfo(info) {
        this.id = info.id;
        this.apiid = this.id > 0 ? this.id : undefined;
        this.name = info.name;
    }
    loadFromGetResult(obj) {
        var _a;
        this.loadInfo(obj);
        this.tracks.forEach(t => t._bind = null);
        this.tracks = [];
        (_a = this.listView) === null || _a === void 0 ? void 0 : _a.removeAll();
        for (const t of obj.tracks) {
            this.addTrack(t);
        }
        return this;
    }
    addTrack(t) {
        var track = new Track(Object.assign(Object.assign({}, t), { _bind: {
                list: this,
                position: this.tracks.length
            } }));
        this.tracks.push(track);
        if (this.contentView)
            this.contentView.addItem(track);
        return track;
    }
    loadEmpty() {
        var _a;
        (_a = this.contentView) === null || _a === void 0 ? void 0 : _a.updateView();
        return this.fetching = Promise.resolve();
    }
    loadFromApi(arg) {
        var _a;
        return this.fetching = (_a = this.fetching, (_a !== null && _a !== void 0 ? _a : this.fetchForce(arg)));
    }
    postToUser() {
        return this.posting = this.posting || this._post();
    }
    _post() {
        return __awaiter(this, void 0, void 0, function* () {
            yield User_1.user.waitLogin();
            if (this.apiid !== undefined)
                throw new Error('cannot post: apiid exists');
            var obj = {
                id: 0,
                name: this.name,
                trackids: this.tracks.map(t => t.id)
            };
            var resp = yield Api_1.api.postJson({
                path: 'users/me/lists/new',
                method: 'POST',
                obj: obj
            });
            this.apiid = resp.id;
        });
    }
    getRealId() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.apiid)
                return this.apiid;
            yield this.postToUser();
            return this.apiid;
        });
    }
    put() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield User_1.user.waitLogin(true);
                if (this.fetching)
                    yield this.fetching;
                if (this.posting)
                    yield this.posting;
                if (this.apiid === undefined)
                    throw new Error('cannot put: no apiid');
                var obj = {
                    id: this.apiid,
                    name: this.name,
                    trackids: this.tracks.map(t => t.id)
                };
                var resp = yield Api_1.api.postJson({
                    path: 'lists/' + this.apiid,
                    method: 'PUT',
                    obj: obj
                });
            }
            catch (error) {
                console.error('list put() failed', this, error);
                viewlib_1.Toast.show(utils_1.I `Failed to sync playlist "${this.name}".` + '\n' + error, 3000);
                throw error;
            }
        });
    }
    fetchForce(arg) {
        return __awaiter(this, void 0, void 0, function* () {
            var func;
            if (arg === undefined)
                arg = this.apiid;
            if (typeof arg == 'number')
                func = () => Api_1.api.getListAsync(arg);
            else
                func = arg;
            this.setLoadIndicator(new viewlib_1.LoadingIndicator());
            try {
                var obj = yield func();
                this.loadFromGetResult(obj);
                this.setLoadIndicator(null);
            }
            catch (err) {
                this.loadIndicator.error(err, () => this.fetchForce(arg));
                throw err;
            }
        });
    }
    rename(newName) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            this.name = newName;
            var header = (_a = this.contentView) === null || _a === void 0 ? void 0 : _a.header;
            if (header)
                header.updateWith({ title: this.name });
            main_1.listIndex.onrename(this.id, newName);
            yield this.put();
        });
    }
    createView() {
        var list = this;
        return this.contentView = this.contentView || new TrackListView(this);
    }
    getNextTrack(track, loopMode, offset) {
        var _a, _b, _c;
        offset = (offset !== null && offset !== void 0 ? offset : 1);
        var bind = track._bind;
        if (((_a = bind) === null || _a === void 0 ? void 0 : _a.list) !== this)
            return null;
        if (loopMode == 'list-seq') {
            return _b = this.tracks[bind.position + offset], (_b !== null && _b !== void 0 ? _b : null);
        }
        else if (loopMode == 'list-loop') {
            return _c = this.tracks[utils_1.utils.mod(bind.position + offset, this.tracks.length)], (_c !== null && _c !== void 0 ? _c : null);
        }
        else if (loopMode == 'track-loop') {
            return track;
        }
        else {
            console.warn('unknown loopMode', loopMode);
        }
        return null;
    }
    updateTracksFromListView() {
        this.tracks = this.listView.map(lvi => {
            lvi.track._bind.position = lvi.position;
            lvi.updateDom();
            return lvi.track;
        });
        this.put();
    }
    remove(track) {
        var _a;
        var pos = track._bind.position;
        track._bind = null;
        this.tracks.splice(pos, 1);
        if (this.listView) {
            this.listView.remove(pos);
            this.updateTracksFromListView();
        }
        else {
            this.tracks.forEach((t, i) => t._bind.position = i);
        }
        (_a = this.contentView) === null || _a === void 0 ? void 0 : _a.updateView();
        this.put();
    }
}
exports.TrackList = TrackList;
class TrackListView extends ListContentView_1.ListContentView {
    constructor(list) {
        super();
        this.curPlaying = new utils_1.ItemActiveHelper({
            funcSetActive: function (item, val) { item.updateWith({ playing: val }); }
        });
        this.trackChanged = () => {
            this.updateCurPlaying();
        };
        this.list = list;
    }
    createHeader() {
        return new ContentHeader({
            catalog: utils_1.I `Playlist`,
            title: this.list.name,
            titleEditable: !!this.list.rename,
            onTitleEdit: (newName) => this.list.rename(newName)
        });
    }
    onShow() {
        super.onShow();
        PlayerCore_1.playerCore.onTrackChanged.add(this.trackChanged);
        this.updateItems();
    }
    onRemove() {
        super.onRemove();
        PlayerCore_1.playerCore.onTrackChanged.remove(this.trackChanged);
    }
    appendListView() {
        super.appendListView();
        var lv = this.listView;
        this.list.listView = lv;
        lv.dragging = true;
        if (this.list.canEdit)
            lv.moveByDragging = true;
        lv.onItemMoved = () => this.list.updateTracksFromListView();
        this.list.tracks.forEach(t => this.addItem(t));
        this.updateItems();
        if (this.list.loadIndicator)
            this.useLoadingIndicator(this.list.loadIndicator);
        this.updateView();
    }
    updateItems() {
        // update active state of items
        this.trackChanged();
    }
    addItem(t, pos) {
        var item = this.createViewItem(t);
        this.listView.add(item, pos);
        this.updateCurPlaying(item);
        this.updateView();
    }
    createViewItem(t) {
        var view = new TrackViewItem(t);
        if (this.list.canEdit) {
            view.onRemove = (item) => this.list.remove(item.track);
        }
        return view;
    }
    updateCurPlaying(item) {
        var _a, _b, _c;
        var playing = PlayerCore_1.playerCore.track;
        if (item === undefined) {
            item = (((_b = (_a = playing) === null || _a === void 0 ? void 0 : _a._bind) === null || _b === void 0 ? void 0 : _b.list) === this.list) ? this.listView.get(playing._bind.position) :
                playing ? this.listView.find(x => x.track.id === playing.id) : null;
            this.curPlaying.set(item);
        }
        else if (playing) {
            var track = item.track;
            if ((((_c = playing._bind) === null || _c === void 0 ? void 0 : _c.list) === this.list && track === playing)
                || (track.id === playing.id)) {
                this.curPlaying.set(item);
            }
        }
    }
}
exports.TrackListView = TrackListView;
;
class TrackViewItem extends viewlib_1.ListViewItem {
    constructor(item) {
        super();
        this.onContextMenu = (item, ev) => {
            ev.preventDefault();
            var m = new viewlib_1.ContextMenu();
            m.add(new viewlib_1.MenuItem({ text: utils_1.I `Comments` }));
            if (this.track.url)
                m.add(new viewlib_1.MenuLinkItem({
                    text: utils_1.I `Download`,
                    link: Api_1.api.processUrl(this.track.url),
                    download: this.track.artist + ' - ' + this.track.name + '.mp3' // TODO
                }));
            m.add(new viewlib_1.MenuItem({
                text: utils_1.I `Edit`,
                onclick: () => this.track.startEdit()
            }));
            if (this.onRemove)
                m.add(new viewlib_1.MenuItem({
                    text: utils_1.I `Remove`, cls: 'dangerous',
                    onclick: () => { var _a, _b; return (_b = (_a = this).onRemove) === null || _b === void 0 ? void 0 : _b.call(_a, this); }
                }));
            m.add(new viewlib_1.MenuInfoItem({ text: utils_1.I `Track ID` + ': ' + this.track.id }));
            m.show({ ev: ev });
        };
        this.track = item;
    }
    get dragData() { return `${this.track.name} - ${this.track.artist}`; }
    createDom() {
        var track = this.track;
        return {
            _ctx: this,
            tag: 'div.item.trackitem.no-selection',
            child: [
                { tag: 'span.pos', textContent: '', _key: 'dompos' },
                { tag: 'span.name', _key: 'domname' },
                { tag: 'span.artist', _key: 'domartist' },
            ],
            onclick: () => { PlayerCore_1.playerCore.playTrack(track); },
            draggable: true,
            _item: this
        };
    }
    updateDom() {
        this.domname.textContent = this.track.name;
        this.domartist.textContent = this.track.artist;
        if (this.playing) {
            this.dompos.textContent = '🎵';
        }
        else if (!this.noPos) {
            this.dompos.textContent = this.track._bind ? (this.track._bind.position + 1).toString() : '';
        }
        this.dompos.hidden = this.noPos && !this.playing;
    }
}
exports.TrackViewItem = TrackViewItem;
class ContentHeader extends viewlib_1.View {
    constructor(init) {
        super();
        this.titleEditable = false;
        this.domctx = {};
        if (init)
            utils_1.utils.objectApply(this, init);
    }
    createDom() {
        var editHelper;
        return utils_1.utils.buildDOM({
            _ctx: this.domctx,
            tag: 'div.content-header',
            child: [
                { tag: 'span.catalog', textContent: this.catalog, _key: 'catalog' },
                {
                    tag: 'span.title', textContent: this.title, _key: 'title',
                    onclick: (ev) => __awaiter(this, void 0, void 0, function* () {
                        if (!this.titleEditable)
                            return;
                        editHelper = editHelper || new viewlib_1.EditableHelper(this.domctx.title);
                        if (editHelper.editing)
                            return;
                        var newName = yield editHelper.startEditAsync();
                        if (newName !== editHelper.beforeEdit && newName != '') {
                            this.onTitleEdit(newName);
                        }
                        this.updateDom();
                    })
                },
            ]
        });
    }
    updateDom() {
        this.domctx.catalog.textContent = this.catalog;
        this.domctx.catalog.style.display = this.catalog ? '' : 'none';
        this.domctx.title.textContent = this.title;
        utils_1.utils.toggleClass(this.domctx.title, 'editable', !!this.titleEditable);
        if (this.titleEditable)
            this.domctx.title.title = utils_1.I `Click to edit`;
        else
            this.domctx.title.removeAttribute('title');
    }
}
exports.ContentHeader = ContentHeader;

},{"./Api":1,"./ListContentView":4,"./PlayerCore":6,"./User":10,"./main":11,"./utils":13,"./viewlib":14}],13:[function(require,module,exports){
"use strict";
// file: utils.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const I18n_1 = require("./I18n");
exports.i18n = I18n_1.i18n;
exports.I = I18n_1.I;
/** The name "utils" tells it all. */
exports.utils = new class Utils {
    constructor() {
        // Time & formatting utils:
        this.Timer = class {
            constructor(callback) {
                this.callback = callback;
            }
            timeout(time) {
                this.tryCancel();
                var handle = setTimeout(this.callback, time);
                this.cancelFunc = () => window.clearTimeout(handle);
            }
            interval(time) {
                this.tryCancel();
                var handle = setInterval(this.callback, time);
                this.cancelFunc = () => window.clearInterval(handle);
            }
            tryCancel() {
                if (this.cancelFunc) {
                    this.cancelFunc();
                    this.cancelFunc = undefined;
                }
            }
        };
    }
    strPadLeft(str, len, ch = ' ') {
        while (str.length < len) {
            str = ch + str;
        }
        return str;
    }
    formatTime(sec) {
        if (isNaN(sec))
            return '--:--';
        var sec = Math.floor(sec);
        var min = Math.floor(sec / 60);
        sec %= 60;
        return this.strPadLeft(min.toString(), 2, '0') + ':' + this.strPadLeft(sec.toString(), 2, '0');
    }
    numLimit(num, min, max) {
        return (num < min || typeof num != 'number' || isNaN(num)) ? min :
            (num > max) ? max : num;
    }
    createName(nameFunc, existsFunc) {
        for (let num = 0;; num++) {
            let str = nameFunc(num);
            if (!existsFunc(str))
                return str;
        }
    }
    /**
     * btoa, but supports Unicode and uses UTF-8 encoding.
     * @see https://stackoverflow.com/questions/30106476
     */
    base64EncodeUtf8(str) {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) {
            return String.fromCharCode(('0x' + p1));
        }));
    }
    sleepAsync(time) {
        return new Promise((resolve) => {
            setTimeout(resolve, time);
        });
    }
    /** Remove all children from the node */
    clearChildren(node) {
        while (node.lastChild)
            node.removeChild(node.lastChild);
    }
    /** Remove all children from the node (if needed) and append one (if present) */
    replaceChild(node, newChild) {
        this.clearChildren(node);
        if (newChild)
            node.appendChild(newChild);
    }
    /** Add or remove a classname for the element
     * @param force - true -> add; false -> remove; undefined -> toggle.
     */
    toggleClass(element, clsName, force) {
        var clsList = element.classList;
        if (clsList.toggle)
            return clsList.toggle(clsName, force);
        if (force === undefined)
            force = !clsList.contains(clsName);
        if (force)
            clsList.add(clsName);
        else
            clsList.remove(clsName);
        return force;
    }
    /** Fade out the element and remove it */
    fadeout(element) {
        element.classList.add('fading-out');
        var cb = null;
        var end = () => {
            if (!end)
                return; // use a random variable as flag ;)
            end = null;
            element.classList.remove('fading-out');
            element.remove();
            cb && cb();
        };
        element.addEventListener('transitionend', end);
        setTimeout(end, 350); // failsafe
        return {
            get finished() { return !end; },
            onFinished(callback) {
                if (!end)
                    callback();
                else
                    cb = callback;
            },
            cancel() { var _a; (_a = end) === null || _a === void 0 ? void 0 : _a(); }
        };
    }
    addEvent(element, event, handler) {
        element.addEventListener(event, handler);
        return {
            remove: () => element.removeEventListener(event, handler)
        };
    }
    arrayRemove(array, val) {
        for (let i = 0; i < array.length; i++) {
            if (array[i] === val) {
                array.splice(i, 1);
                i--;
            }
        }
    }
    arrayMap(arr, func) {
        if (arr instanceof Array)
            return arr.map(func);
        var idx = 0;
        var ret = new Array(arr.length);
        for (var item of arr) {
            ret[idx] = (func(item, idx));
            idx++;
        }
        return ret;
    }
    arrayForeach(arr, func) {
        var idx = 0;
        for (var item of arr) {
            func(item, idx++);
        }
    }
    arrayFind(arr, func) {
        if (arr instanceof Array)
            return arr.find(func);
        var idx = 0;
        for (var item of arr) {
            if (func(item, idx++))
                return item;
        }
    }
    objectApply(obj, kv, keys) {
        if (kv) {
            for (const key in kv) {
                if (kv.hasOwnProperty(key) && (!keys || keys.indexOf(key) >= 0)) {
                    const val = kv[key];
                    obj[key] = val;
                }
            }
        }
        return obj;
    }
    mod(a, b) {
        if (a < 0)
            a = b + a;
        return a % b;
    }
};
class BuildDOMCtx {
}
exports.utils.buildDOM = (() => {
    var createElementFromTag = function (tag) {
        var reg = /[#\.^]?[\w\-]+/y;
        var match;
        var ele;
        while (match = reg.exec(tag)) {
            var val = match[0];
            var ch = val[0];
            if (ch == '.') {
                ele.classList.add(val.substr(1));
            }
            else if (ch == '#') {
                ele.id = val.substr(1);
            }
            else {
                if (ele)
                    throw new Error('unexpected multiple tags');
                ele = document.createElement(val);
            }
        }
        return ele;
    };
    var buildDomCore = function (obj, ttl, ctx) {
        if (ttl-- < 0)
            throw new Error('ran out of TTL');
        if (typeof (obj) === 'string') {
            return document.createTextNode(obj);
        }
        if (Node && obj instanceof Node)
            return obj;
        var node = createElementFromTag(obj.tag);
        if (obj['_ctx'])
            ctx = obj['_ctx'];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                var val = obj[key];
                if (key == 'child') {
                    if (val instanceof Array) {
                        val.forEach(function (x) {
                            node.appendChild(buildDomCore(x, ttl, ctx));
                        });
                    }
                    else {
                        node.appendChild(buildDomCore(val, ttl, ctx));
                    }
                }
                else if (key === '_key') {
                    if (ctx)
                        ctx[val] = node;
                }
                else {
                    node[key] = val;
                }
            }
        }
        return node;
    };
    return function (obj, ctx) {
        return buildDomCore(obj, 32, ctx);
    };
})();
class SettingItem {
    constructor(key, type, initial) {
        this.key = key;
        this.type = typeof type == 'string' ? SettingItem.types[type] : type;
        var str = key ? localStorage.getItem(key) : null;
        this.set(str ? this.type.deserialize(str) : initial, true);
    }
    render(fn, dontRaiseNow) {
        if (!dontRaiseNow)
            fn(this.data);
        var oldFn = this.onRender;
        var newFn = fn;
        if (oldFn)
            fn = function (x) { oldFn(x); newFn(x); };
        this.onRender = fn;
        return this;
    }
    ;
    bindToBtn(btn, prefix) {
        if (this.type !== SettingItem.types.bool)
            throw new Error('only for bool type');
        var span = document.createElement('span');
        btn.insertBefore(span, btn.firstChild);
        this.render(function (x) {
            btn.classList.toggle('disabled', !x);
            prefix = prefix || ["❌", "✅"];
            span.textContent = prefix[+x];
        });
        var thiz = this;
        btn.addEventListener('click', function () { thiz.toggle(); });
        return this;
    }
    ;
    remove() {
        localStorage.removeItem(this.key);
    }
    save() {
        localStorage.setItem(this.key, this.type.serialize(this.data));
    }
    set(data, dontSave) {
        this.data = data;
        this.onRender && this.onRender(data);
        if (!dontSave && this.key)
            this.save();
    }
    ;
    get() {
        return this.data;
    }
    ;
    toggle() {
        if (this.type !== SettingItem.types.bool)
            throw new Error('only for bool type');
        this.set((!this.data));
    }
    ;
    loop(arr) {
        var curData = this.data;
        var oldIndex = arr.findIndex(function (x) { return x == curData; });
        var newData = arr[(oldIndex + 1) % arr.length];
        this.set(newData);
    }
    ;
}
exports.SettingItem = SettingItem;
SettingItem.types = {
    bool: {
        serialize: function (data) { return data ? 'true' : 'false'; },
        deserialize: function (str) { return str == 'true' ? true : str == 'false' ? false : undefined; }
    },
    str: {
        serialize: function (x) { return x; },
        deserialize: function (x) { return x; }
    },
    json: {
        serialize: function (x) { return JSON.stringify(x); },
        deserialize: function (x) { return JSON.parse(x); }
    }
};
class ItemActiveHelper {
    constructor(init) {
        this.funcSetActive = (item, val) => item.toggleClass('active', val);
        exports.utils.objectApply(this, init);
    }
    set(item) {
        if (this.current)
            this.funcSetActive(this.current, false);
        this.current = item;
        if (this.current)
            this.funcSetActive(this.current, true);
    }
}
exports.ItemActiveHelper = ItemActiveHelper;
class Callbacks {
    constructor() {
        this.list = [];
    }
    invoke(...args) {
        this.list.forEach((x) => x(...args));
    }
    add(callback) {
        this.list.push(callback);
    }
    remove(callback) {
        exports.utils.arrayRemove(this.list, callback);
    }
}
exports.Callbacks = Callbacks;
class Lazy {
    constructor(func) {
        if (typeof func != 'function')
            throw new Error('func is not a function');
        this._func = func;
    }
    get computed() { return !this._func; }
    get rawValue() { return this._value; }
    get value() {
        if (this._func) {
            this._value = this._func();
            delete this._func;
        }
        return this._value;
    }
}
exports.Lazy = Lazy;
class Semaphore {
    constructor(init) {
        this.queue = new Array();
        this.maxCount = 1;
        this.runningCount = 0;
        exports.utils.objectApply(this, init);
    }
    enter() {
        if (this.runningCount == this.maxCount) {
            var resolve;
            var prom = new Promise((res) => { resolve = res; });
            this.queue.push(resolve);
            return prom;
        }
        else {
            this.runningCount++;
            return Promise.resolve();
        }
    }
    exit() {
        if (this.runningCount == this.maxCount && this.queue.length) {
            try {
                this.queue.shift()();
            }
            catch (_a) { }
        }
        else {
            this.runningCount--;
        }
    }
    run(func) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.enter();
            try {
                yield func();
            }
            finally {
                this.exit();
            }
        });
    }
}
exports.Semaphore = Semaphore;

},{"./I18n":3}],14:[function(require,module,exports){
"use strict";
// file: viewlib.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
class View {
    constructor(dom) {
        if (dom)
            this._dom = utils_1.utils.buildDOM(dom);
    }
    get domCreated() { return !!this._dom; }
    get dom() {
        this.ensureDom();
        return this._dom;
    }
    get hidden() { return this.dom.hidden; }
    set hidden(val) { this.dom.hidden = val; }
    ensureDom() {
        if (!this._dom) {
            this._dom = utils_1.utils.buildDOM(this.createDom());
            this.postCreateDom();
            this.updateDom();
        }
    }
    createDom() {
        return document.createElement('div');
    }
    /** Will be called when the dom is created */
    postCreateDom() {
    }
    /** Will be called when the dom is created, after postCreateDom() */
    updateDom() {
    }
    /** Assign key-values and call `updateDom()` */
    updateWith(kv) {
        utils_1.utils.objectApply(this, kv);
        this.updateDom();
    }
    toggleClass(clsName, force) {
        utils_1.utils.toggleClass(this.dom, clsName, force);
    }
    appendView(view) { return this.dom.appendView(view); }
    static getDOM(view) {
        if (!view)
            throw new Error('view is undefined or null');
        if (view instanceof View)
            return view.dom;
        if (view instanceof HTMLElement)
            return view;
        console.error('getDOM(): unknown type: ', view);
        throw new Error('Cannot get DOM: unknown type');
    }
}
exports.View = View;
Node.prototype.appendView = function (view) {
    this.appendChild(view.dom);
};
/** DragManager is used to help exchange information between views */
exports.dragManager = new class DragManager {
    get currentItem() { return this._currentItem; }
    ;
    start(item) {
        this._currentItem = item;
        console.log('drag start', item);
    }
    end(item) {
        this._currentItem = null;
        console.log('drag end');
    }
};
class ListViewItem extends View {
    constructor() {
        super(...arguments);
        // https://stackoverflow.com/questions/7110353
        this.enterctr = 0;
    }
    get listview() { return this._listView; }
    get position() { return this._position; }
    get dragData() { return this.dom.textContent; }
    remove() {
        if (!this._listView)
            return;
        this._listView.remove(this);
    }
    postCreateDom() {
        super.postCreateDom();
        this.dom.addEventListener('click', () => {
            var _a, _b, _c;
            (_c = (_a = this._listView) === null || _a === void 0 ? void 0 : (_b = _a).onItemClicked) === null || _c === void 0 ? void 0 : _c.call(_b, this);
        });
        this.dom.addEventListener('contextmenu', (ev) => {
            var _a, _b, _c;
            (_c = (_a = this.onContextMenu, (_a !== null && _a !== void 0 ? _a : (_b = this._listView) === null || _b === void 0 ? void 0 : _b.onContextMenu))) === null || _c === void 0 ? void 0 : _c(this, ev);
        });
        this.dom.addEventListener('dragstart', (ev) => {
            var _a, _b;
            if (!(_a = this.dragging, (_a !== null && _a !== void 0 ? _a : (_b = this._listView) === null || _b === void 0 ? void 0 : _b.dragging)))
                return;
            exports.dragManager.start(this);
            ev.dataTransfer.setData('text/plain', this.dragData);
            this.dom.style.opacity = '.5';
        });
        this.dom.addEventListener('dragend', (ev) => {
            exports.dragManager.end(this);
            ev.preventDefault();
            this.dom.style.opacity = null;
        });
        this.dom.addEventListener('dragover', (ev) => {
            this.dragHandler(ev, 'dragover');
        });
        this.dom.addEventListener('dragenter', (ev) => {
            this.dragHandler(ev, 'dragenter');
        });
        this.dom.addEventListener('dragleave', (ev) => {
            this.dragHandler(ev, 'dragleave');
        });
        this.dom.addEventListener('drop', (ev) => {
            this.dragHandler(ev, 'drop');
        });
    }
    dragHandler(ev, type) {
        var _a, _b, _c, _d, _e;
        var item = exports.dragManager.currentItem;
        var drop = type === 'drop';
        if (item instanceof ListViewItem) {
            var arg = {
                source: item, target: this,
                event: ev, drop: drop,
                accept: false
            };
            if (((_a = this._listView) === null || _a === void 0 ? void 0 : _a.moveByDragging) && item.listview === this.listview) {
                ev.preventDefault();
                if (!drop) {
                    ev.dataTransfer.dropEffect = 'move';
                    arg.accept = item !== this ? 'move' : true;
                    if (arg.accept === 'move' && this.position > item.position)
                        arg.accept = 'move-after';
                }
                else {
                    if (item !== this) {
                        this.listview.move(item, this.position);
                    }
                }
            }
            var onDragover = (_b = this.onDragover, (_b !== null && _b !== void 0 ? _b : (_c = this.listview) === null || _c === void 0 ? void 0 : _c.onDragover));
            if (!arg.accept && onDragover) {
                onDragover(arg);
                if (drop || arg.accept)
                    ev.preventDefault();
            }
            var onContextMenu = (_d = this.onContextMenu, (_d !== null && _d !== void 0 ? _d : (_e = this.listview) === null || _e === void 0 ? void 0 : _e.onContextMenu));
            if (!arg.accept && item === this && onContextMenu) {
                if (drop)
                    onContextMenu(this, ev);
                else
                    ev.preventDefault();
            }
        }
        if (type === 'dragenter' || type === 'dragleave' || drop) {
            if (type === 'dragenter') {
                this.enterctr++;
            }
            else if (type === 'dragleave') {
                this.enterctr--;
            }
            else {
                this.enterctr = 0;
            }
            let hover = this.enterctr > 0;
            this.toggleClass('dragover', hover);
            let placeholder = hover && !!arg && (arg.accept === 'move' || arg.accept === 'move-after');
            if (placeholder != !!this.dragoverPlaceholder) {
                if (placeholder) {
                    this.dragoverPlaceholder = utils_1.utils.buildDOM({ tag: 'div.dragover-placeholder' });
                    var before = this.dom;
                    if (arg.accept === 'move-after')
                        before = before.nextElementSibling;
                    this.dom.parentElement.insertBefore(this.dragoverPlaceholder, before);
                }
                else {
                    this.dragoverPlaceholder.remove();
                    this.dragoverPlaceholder = null;
                }
            }
        }
    }
    ;
}
exports.ListViewItem = ListViewItem;
class ListView extends View {
    constructor(container) {
        super(container);
        this.items = [];
        /**
         * Allow user to drag an item.
         */
        this.dragging = false;
        /**
         * Allow user to drag an item and change its position.
         */
        this.moveByDragging = false;
    }
    add(item, pos) {
        if (item._listView)
            throw new Error('the item is already in a listview');
        item._listView = this;
        if (pos === undefined || pos >= this.items.length) {
            this.dom.appendChild(item.dom);
            item._position = this.items.length;
            this.items.push(item);
        }
        else {
            this.dom.insertBefore(item.dom, this.get(pos).dom);
            this.items.splice(pos, 0, item);
            for (let i = pos; i < this.items.length; i++) {
                this.items[i]._position = i;
            }
        }
        if (this.dragging)
            item.dom.draggable = true;
    }
    remove(item) {
        item = this._ensureItem(item);
        item.dom.remove();
        this.items.splice(item._position, 1);
        var pos = item.position;
        item._listView = item._position = null;
        for (let i = pos; i < this.items.length; i++) {
            this.items[i]._position = i;
        }
    }
    move(item, newpos) {
        item = this._ensureItem(item);
        this.remove(item);
        this.add(item, newpos);
        this.onItemMoved(item, item.position);
    }
    /** Remove all items */
    removeAll() {
        while (this.length)
            this.remove(this.length - 1);
    }
    /** Remove all items and all DOM children */
    clear() {
        utils_1.utils.clearChildren(this.dom);
        this.items = [];
    }
    [Symbol.iterator]() { return this.items[Symbol.iterator](); }
    get length() { return this.items.length; }
    get(idx) {
        return this.items[idx];
    }
    map(func) { return utils_1.utils.arrayMap(this, func); }
    find(func) { return utils_1.utils.arrayFind(this, func); }
    _ensureItem(item) {
        if (typeof item === 'number')
            item = this.get(item);
        else if (!item)
            throw new Error('item is null or undefined.');
        else if (item._listView !== this)
            throw new Error('the item is not in this listview.');
        return item;
    }
    ReplaceChild(dom) {
        this.clear();
        this.dom.appendChild(View.getDOM(dom));
    }
}
exports.ListView = ListView;
class Section extends View {
    constructor(arg) {
        super();
        this.ensureDom();
        if (arg) {
            if (arg.title)
                this.setTitle(arg.title);
            if (arg.content)
                this.setContent(arg.content);
            if (arg.actions)
                arg.actions.forEach(x => this.addAction(x));
        }
    }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.section',
            child: [
                {
                    tag: 'div.section-header',
                    child: [
                        { tag: 'span.section-title', _key: 'titleDom' }
                    ]
                }
                // content element(s) here
            ]
        };
    }
    setTitle(text) {
        this.titleDom.textContent = text;
    }
    setContent(view) {
        var dom = this.dom;
        var firstChild = dom.firstChild;
        while (dom.lastChild !== firstChild)
            dom.removeChild(dom.lastChild);
        dom.appendChild(View.getDOM(view));
    }
    addAction(arg) {
        this.titleDom.parentElement.appendChild(utils_1.utils.buildDOM({
            tag: 'div.section-action.clickable',
            textContent: arg.text,
            onclick: arg.onclick
        }));
    }
}
exports.Section = Section;
class LoadingIndicator extends View {
    constructor(init) {
        super();
        this._status = 'running';
        if (init)
            utils_1.utils.objectApply(this, init);
    }
    get state() { return this._status; }
    set state(val) {
        this._status = val;
        ['running', 'error', 'normal'].forEach(x => this.toggleClass(x, val == x));
    }
    get content() { return this._text; }
    set content(val) { this._text = val; this.ensureDom(); this._textdom.textContent = val; }
    reset() {
        this.state = 'running';
        this.content = utils_1.I `Loading`;
        this.onclick = null;
    }
    error(err, retry) {
        this.state = 'error';
        this.content = utils_1.I `Oh no! Something just goes wrong:` + '\r\n' + err;
        if (retry) {
            this.content += '\r\n' + utils_1.I `[Click here to retry]`;
        }
        this.onclick = retry;
    }
    action(func) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield func();
            }
            catch (error) {
                this.error(error, () => this.action(func));
            }
        });
    }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.loading-indicator',
            child: [{
                    tag: 'div.loading-indicator-inner',
                    child: [{ tag: 'div.loading-indicator-text', _key: '_textdom' }]
                }],
            onclick: (e) => this.onclick && this.onclick(e)
        };
    }
    postCreateDom() {
        this.reset();
    }
}
exports.LoadingIndicator = LoadingIndicator;
class Overlay extends View {
    createDom() {
        return { tag: 'div.overlay' };
    }
    setCenterChild(centerChild) {
        this.toggleClass('centerchild', centerChild);
        return this;
    }
}
exports.Overlay = Overlay;
class EditableHelper {
    constructor(element) {
        this.editing = false;
        this.element = element;
    }
    startEdit(onComplete) {
        if (this.editing)
            return;
        this.editing = true;
        var ele = this.element;
        var beforeEdit = this.beforeEdit = ele.textContent;
        utils_1.utils.toggleClass(ele, 'editing', true);
        var input = utils_1.utils.buildDOM({
            tag: 'input', type: 'text', value: beforeEdit
        });
        while (ele.firstChild)
            ele.removeChild(ele.firstChild);
        ele.appendChild(input);
        input.select();
        input.focus();
        var stopEdit = () => {
            var _a, _b, _c;
            this.editing = false;
            utils_1.utils.toggleClass(ele, 'editing', false);
            events.forEach(x => x.remove());
            input.remove();
            (_b = (_a = this).onComplete) === null || _b === void 0 ? void 0 : _b.call(_a, input.value);
            (_c = onComplete) === null || _c === void 0 ? void 0 : _c(input.value);
        };
        var events = [
            utils_1.utils.addEvent(input, 'keydown', (evv) => {
                if (evv.keyCode == 13) {
                    stopEdit();
                    evv.preventDefault();
                }
            }),
            utils_1.utils.addEvent(input, 'focusout', (evv) => { stopEdit(); }),
        ];
    }
    startEditAsync() {
        return new Promise((resolve) => this.startEdit(resolve));
    }
}
exports.EditableHelper = EditableHelper;
class MenuItem extends ListViewItem {
    constructor(init) {
        super();
        this.cls = 'normal';
        utils_1.utils.objectApply(this, init);
    }
    createDom() {
        return {
            tag: 'div.item.no-selection',
            onclick: (ev) => {
                var _a, _b;
                if (this._listView instanceof ContextMenu) {
                    if (!this._listView.keepOpen)
                        this._listView.close();
                }
                (_b = (_a = this).onclick) === null || _b === void 0 ? void 0 : _b.call(_a, ev);
            }
        };
    }
    updateDom() {
        this.dom.textContent = this.text;
        if (this.cls !== this._lastcls) {
            if (this._lastcls)
                this.dom.classList.remove(this._lastcls);
            if (this.cls)
                this.dom.classList.add(this.cls);
        }
    }
}
exports.MenuItem = MenuItem;
class MenuLinkItem extends MenuItem {
    constructor(init) {
        super(init);
        utils_1.utils.objectApply(this, init);
    }
    createDom() {
        var dom = super.createDom();
        dom.tag = 'a.item.no-selection';
        dom.target = "_blank";
        return dom;
    }
    updateDom() {
        super.updateDom();
        this.dom.href = this.link;
        this.dom.download = this.download;
    }
}
exports.MenuLinkItem = MenuLinkItem;
class MenuInfoItem extends MenuItem {
    constructor(init) {
        super(init);
        utils_1.utils.objectApply(this, init);
    }
    createDom() {
        return {
            tag: 'div.menu-info'
        };
    }
    updateDom() {
        super.updateDom();
        this.dom.textContent = this.text;
    }
}
exports.MenuInfoItem = MenuInfoItem;
class ContextMenu extends ListView {
    constructor(items) {
        var _a;
        super({ tag: 'div.context-menu', tabIndex: 0 });
        this.keepOpen = false;
        this.useOverlay = true;
        this._visible = false;
        (_a = items) === null || _a === void 0 ? void 0 : _a.forEach(x => this.add(x));
    }
    get visible() { return this._visible; }
    ;
    show(arg) {
        if (arg.ev) {
            arg.x = arg.ev.pageX;
            arg.y = arg.ev.pageY;
        }
        this.close();
        this._visible = true;
        if (this.useOverlay) {
            if (!this.overlay) {
                this.overlay = new Overlay();
                this.overlay.dom.style.background = 'rgba(0, 0, 0, .1)';
                this.overlay.dom.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    this.close();
                });
            }
            document.body.appendChild(this.overlay.dom);
        }
        document.body.appendChild(this.dom);
        this.dom.focus();
        this.dom.addEventListener('focusout', (e) => !this.dom.contains(e.relatedTarget) && this.close());
        var width = this.dom.offsetWidth, height = this.dom.offsetHeight;
        if (arg.x + width > document.body.offsetWidth)
            arg.x -= width;
        if (arg.y + height > document.body.offsetHeight)
            arg.y -= height;
        if (arg.x < 0)
            arg.x = 0;
        if (arg.y < 0)
            arg.y = 0;
        this.dom.style.left = arg.x + 'px';
        this.dom.style.top = arg.y + 'px';
    }
    close() {
        if (this._visible) {
            this._visible = false;
            if (this.overlay)
                utils_1.utils.fadeout(this.overlay.dom);
            utils_1.utils.fadeout(this.dom);
        }
    }
}
exports.ContextMenu = ContextMenu;
class Dialog extends View {
    constructor() {
        super();
        this.shown = false;
        this.btnTitle = new TabBtn({ active: true, clickable: false });
        this.btnClose = new TabBtn({ text: utils_1.I `Close`, right: true });
        this.title = 'Dialog';
        this.width = '300px';
        this.allowClose = true;
        this.onShown = new utils_1.Callbacks();
        this.onClose = new utils_1.Callbacks();
        this.btnClose.onClick.add(() => this.allowClose && this.close());
    }
    createDom() {
        return {
            _ctx: this,
            _key: 'dialog',
            tag: 'div.dialog',
            child: [
                {
                    _key: 'domheader',
                    tag: 'div.dialog-title',
                    child: [
                        { tag: 'div', style: 'clear: both;' }
                    ]
                },
                { tag: 'div.dialog-content', _key: 'domcontent' }
            ]
        };
    }
    postCreateDom() {
        super.postCreateDom();
        this.addBtn(this.btnTitle);
        this.addBtn(this.btnClose);
        this.overlay = new Overlay().setCenterChild(true);
        this.overlay.dom.appendView(this);
        this.overlay.dom.addEventListener('mousedown', (ev) => {
            if (this.allowClose && ev.button === 0 && ev.target === this.overlay.dom) {
                ev.preventDefault();
                this.close();
            }
        });
        this.overlay.dom.addEventListener('keydown', (ev) => {
            if (this.allowClose && ev.keyCode == 27) { // ESC
                this.close();
                ev.preventDefault();
            }
        });
    }
    updateDom() {
        this.btnTitle.updateWith({ text: this.title });
        this.btnTitle.hidden = !this.title;
        this.dom.style.width = this.width;
        this.btnClose.hidden = !this.allowClose;
    }
    addBtn(btn) {
        this.ensureDom();
        this.domheader.insertBefore(btn.dom, this.domheader.lastChild);
    }
    addContent(view, replace) {
        this.ensureDom();
        if (replace)
            utils_1.utils.clearChildren(this.domcontent);
        this.domcontent.appendChild(View.getDOM(view));
    }
    show() {
        var _a, _b, _c, _d;
        if (this.shown)
            return;
        this.shown = true;
        (_b = (_a = this)._cancelFadeout) === null || _b === void 0 ? void 0 : _b.call(_a);
        this.ensureDom();
        (_c = Dialog.defaultParent, (_c !== null && _c !== void 0 ? _c : document.body)).appendView(this.overlay);
        this.dom.focus();
        (_d = this.autoFocus) === null || _d === void 0 ? void 0 : _d.dom.focus();
        this.onShown.invoke();
    }
    close() {
        if (!this.shown)
            return;
        this.shown = false;
        this.onClose.invoke();
        this._cancelFadeout = utils_1.utils.fadeout(this.overlay.dom).cancel;
    }
}
exports.Dialog = Dialog;
class TabBtn extends View {
    constructor(init) {
        super();
        this.clickable = true;
        this.active = false;
        this.right = false;
        this.onClick = new utils_1.Callbacks();
        utils_1.utils.objectApply(this, init);
    }
    createDom() {
        return {
            tag: 'span.tab.no-selection',
            tabIndex: 0,
            onclick: () => this.onClick.invoke()
        };
    }
    updateDom() {
        this.dom.textContent = this.text;
        this.toggleClass('clickable', this.clickable);
        this.toggleClass('active', this.active);
        this.dom.style.float = this.right ? 'right' : 'left';
    }
}
exports.TabBtn = TabBtn;
class InputView extends View {
    createDom() {
        return { tag: 'input.input-text', _key: 'dominput' };
    }
}
exports.InputView = InputView;
class TextView extends View {
    get text() { return this.dom.textContent; }
    set text(val) { this.dom.textContent = val; }
}
exports.TextView = TextView;
class ButtonView extends TextView {
    constructor(init) {
        super();
        this.disabled = false;
        utils_1.utils.objectApply(this, init);
        this.updateDom();
    }
    createDom() {
        return { tag: 'div.btn', tabIndex: 0 };
    }
    postCreateDom() {
        super.postCreateDom();
        this.dom.addEventListener('click', () => { var _a, _b; return (_b = (_a = this).onclick) === null || _b === void 0 ? void 0 : _b.call(_a); });
    }
    updateDom() {
        super.updateDom();
        this.toggleClass('disabled', this.disabled);
        this.toggleClass('btn-big', this.type === 'big');
    }
}
exports.ButtonView = ButtonView;
class LabeledInput extends View {
    constructor(init) {
        super();
        this.type = 'text';
        this.input = new InputView();
        this.ensureDom();
        utils_1.utils.objectApply(this, init);
        this.updateDom();
    }
    get dominput() { return this.input.dom; }
    get value() { return this.dominput.value; }
    set value(val) { this.dominput.value = val; }
    createDom() {
        return {
            _ctx: this,
            tag: 'div',
            child: [
                { tag: 'div.input-label', _key: 'domlabel' },
                this.input.dom
            ]
        };
    }
    updateDom() {
        this.domlabel.textContent = this.label;
        this.dominput.type = this.type;
    }
}
exports.LabeledInput = LabeledInput;
class ToastsContainer extends View {
    constructor() {
        super(...arguments);
        this.toasts = [];
    }
    createDom() {
        return { tag: 'div.toasts-container' };
    }
    addToast(toast) {
        if (this.toasts.length === 0)
            this.show();
        this.toasts.push(toast);
    }
    removeToast(toast) {
        utils_1.utils.arrayRemove(this.toasts, toast);
        if (this.toasts.length === 0)
            this.remove();
    }
    show() {
        var parent = this.parentDom || document.body;
        parent.appendChild(this.dom);
    }
    remove() {
        this.dom.remove();
    }
}
exports.ToastsContainer = ToastsContainer;
ToastsContainer.default = new ToastsContainer();
class Toast extends View {
    constructor(init) {
        super();
        this.shown = false;
        this.timer = new utils_1.utils.Timer(() => this.close());
        utils_1.utils.objectApply(this, init);
        if (!this.container)
            this.container = ToastsContainer.default;
    }
    show(timeout) {
        if (!this.shown) {
            this.container.addToast(this);
            this.container.appendView(this);
            this.shown = true;
        }
        if (timeout)
            this.timer.timeout(timeout);
        else
            this.timer.tryCancel();
    }
    close() {
        if (!this.shown)
            return;
        this.shown = false;
        utils_1.utils.fadeout(this.dom)
            .onFinished(() => this.container.removeToast(this));
    }
    createDom() {
        return { tag: 'div.toast' };
    }
    updateDom() {
        this.dom.textContent = this.text;
    }
    static show(text, timeout) {
        var toast = new Toast({ text });
        toast.show(timeout);
        return toast;
    }
}
exports.Toast = Toast;

},{"./utils":13}]},{},[11]);