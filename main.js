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
/** The name "utils" tells it all. */
var utils = new class Utils {
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
    /** Remove all childs from the node */
    clearChilds(node) {
        while (node.lastChild)
            node.removeChild(node.lastChild);
    }
    /** Remove all childs from the node (if needed) and append one (if present) */
    replaceChild(node, newChild) {
        this.clearChilds(node);
        if (newChild)
            node.appendChild(newChild);
    }
    /** Add or remove a classname for the element
     * @param force - true -> add; false -> remove; undefined -> toggle.
     */
    toggleClass(element, clsName, force) {
        if (force === undefined)
            force = !element.classList.contains(clsName);
        if (force)
            element.classList.add(clsName);
        else
            element.classList.remove(clsName);
        return force;
    }
    /** Fade out the element and remove it */
    fadeout(element) {
        element.classList.add('fading-out');
        var end = () => {
            if (!end)
                return; // use a random variable as flag ;)
            end = null;
            element.classList.remove('fading-out');
            element.remove();
        };
        element.addEventListener('transitionend', end);
        setTimeout(end, 350); // failsafe
        return {
            get finished() { return !end; },
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
utils.buildDOM = (() => {
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
        this.set(str ? this.type.deserilize(str) : initial, true);
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
SettingItem.types = {
    bool: {
        serialize: function (data) { return data ? 'true' : 'false'; },
        deserilize: function (str) { return str == 'true' ? true : str == 'false' ? false : undefined; }
    },
    str: {
        serialize: function (x) { return x; },
        deserilize: function (x) { return x; }
    },
    json: {
        serialize: function (x) { return JSON.stringify(x); },
        deserilize: function (x) { return JSON.parse(x); }
    }
};
class ItemActiveHelper {
    constructor() {
        this.funcSetActive = (item, val) => item.toggleClass('active', val);
    }
    set(item) {
        if (this.current)
            this.funcSetActive(this.current, false);
        this.current = item;
        if (this.current)
            this.funcSetActive(this.current, true);
    }
}
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
        utils.arrayRemove(this.list, callback);
    }
}
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
class Semaphore {
    constructor(init) {
        this.queue = new Array();
        this.maxCount = 1;
        this.runningCount = 0;
        utils.objectApply(this, init);
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
var i18n = new I18n();
function I(literals, ...placeholders) {
    if (placeholders.length == 0) {
        return i18n.get(literals[0]);
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
    var r = i18n.get(formatString);
    for (var i = 0; i < placeholders.length; i++) {
        r = r.replace('{' + i + '}', placeholders[i]);
    }
    return r;
}
// Use JSON.parse(a_big_json) for faster JavaScript runtime parsing
i18n.add2dArray(JSON.parse(`[
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
    ["Username:", "用户名："],
    ["Password:", "密码："],
    ["Confirm password:", "确认密码："],
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
    ["Music Cloud", "Music Cloud"]
]`));
i18n.add2dArray([
    ["_key_", "en", "zh"],
    ["uploads_pending", "Pending", "队列中"],
    ["uploads_uploading", "Uploading", "上传中"],
    ["uploads_error", "Error", "错误"],
    ["uploads_done", "Done", "完成"],
    ["prev_track", "Prev", "上一首"],
    ["next_track", "Next", "下一首"],
]);
// file: viewlib.ts
class View {
    constructor(dom) {
        if (dom)
            this._dom = utils.buildDOM(dom);
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
            this._dom = utils.buildDOM(this.createDom());
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
        utils.objectApply(this, kv);
        this.updateDom();
    }
    toggleClass(clsName, force) {
        utils.toggleClass(this.dom, clsName, force);
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
Node.prototype.appendView = function (view) {
    this.appendChild(view.dom);
};
/** DragManager is used to help exchange information between views */
var dragManager = new class DragManager {
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
        this.dom.addEventListener('dragstart', (ev) => {
            var _a, _b;
            if (!(_a = this.dragging, (_a !== null && _a !== void 0 ? _a : (_b = this._listView) === null || _b === void 0 ? void 0 : _b.dragging)))
                return;
            dragManager.start(this);
            ev.dataTransfer.setData('text/plain', this.dragData);
            this.dom.style.opacity = '.5';
        });
        this.dom.addEventListener('dragend', (ev) => {
            dragManager.end(this);
            ev.preventDefault();
            this.dom.style.opacity = null;
        });
        this.dom.addEventListener('dragover', (ev) => {
            this.dragHanlder(ev, 'dragover');
        });
        this.dom.addEventListener('dragenter', (ev) => {
            this.dragHanlder(ev, 'dragenter');
        });
        this.dom.addEventListener('dragleave', (ev) => {
            this.dragHanlder(ev, 'dragleave');
        });
        this.dom.addEventListener('drop', (ev) => {
            this.dragHanlder(ev, 'drop');
        });
    }
    dragHanlder(ev, type) {
        var _a, _b, _c;
        var item = dragManager.currentItem;
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
                    this.dragoverPlaceholder = utils.buildDOM({ tag: 'div.dragover-placeholder' });
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
    /** Remove all items and all DOM childs */
    clear() {
        utils.clearChilds(this.dom);
        this.items = [];
    }
    [Symbol.iterator]() { return this.items[Symbol.iterator](); }
    get length() { return this.items.length; }
    get(idx) {
        return this.items[idx];
    }
    map(func) { return utils.arrayMap(this, func); }
    find(func) { return utils.arrayFind(this, func); }
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
        this.titleDom.parentElement.appendChild(utils.buildDOM({
            tag: 'div.section-action.clickable',
            textContent: arg.text,
            onclick: arg.onclick
        }));
    }
}
class LoadingIndicator extends View {
    constructor(init) {
        super();
        this._status = 'running';
        if (init)
            utils.objectApply(this, init);
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
        this.content = I `Loading`;
        this.onclick = null;
    }
    error(err, retry) {
        this.state = 'error';
        this.content = I `Oh no! Something just goes wrong:` + '\r\n' + err;
        if (retry) {
            this.content += '\r\n' + I `[Click here to retry]`;
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
class Overlay extends View {
    createDom() {
        return { tag: 'div.overlay' };
    }
    setCenterChild(centerChild) {
        this.toggleClass('centerchild', centerChild);
        return this;
    }
}
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
        utils.toggleClass(ele, 'editing', true);
        var input = utils.buildDOM({
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
            utils.toggleClass(ele, 'editing', false);
            events.forEach(x => x.remove());
            input.remove();
            (_b = (_a = this).onComplete) === null || _b === void 0 ? void 0 : _b.call(_a, input.value);
            (_c = onComplete) === null || _c === void 0 ? void 0 : _c(input.value);
        };
        var events = [
            utils.addEvent(input, 'keydown', (evv) => {
                if (evv.keyCode == 13) {
                    stopEdit();
                    evv.preventDefault();
                }
            }),
            utils.addEvent(input, 'focusout', (evv) => { stopEdit(); }),
        ];
    }
}
class MenuItem extends ListViewItem {
    constructor(init) {
        super();
        this.cls = 'normal';
        utils.objectApply(this, init);
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
class MenuLinkItem extends MenuItem {
    constructor(init) {
        super(init);
        utils.objectApply(this, init);
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
    }
}
class MenuInfoItem extends MenuItem {
    constructor(init) {
        super(init);
        utils.objectApply(this, init);
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
class ContextMenu extends ListView {
    constructor(items) {
        var _a;
        super({ tag: 'div.context-menu', tabIndex: '0' });
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
                this.overlay.dom.addEventListener('mousedown', () => this.close());
            }
            document.body.appendChild(this.overlay.dom);
        }
        document.body.appendChild(this.dom);
        this.dom.focus();
        this.dom.addEventListener('focusout', (e) => !this.dom.contains(e.relatedTarget) && this.close());
        this.dom.style.left = arg.x + 'px';
        this.dom.style.top = arg.y + 'px';
    }
    close() {
        if (this._visible) {
            this._visible = false;
            if (this.overlay)
                utils.fadeout(this.overlay.dom);
            utils.fadeout(this.dom);
        }
    }
}
class SidebarItem extends ListViewItem {
    constructor(init) {
        super();
        utils.objectApply(this, init);
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
            ui.content.setCurrent(view);
            ui.sidebarList.setActive(this);
        };
        return this;
    }
}
class Dialog extends View {
    constructor() {
        super();
        this.shown = false;
        this.btnTitle = new TabBtn({ active: true, clickable: false });
        this.btnClose = new TabBtn({ text: I `Close`, right: true });
        this.title = 'Dialog';
        this.width = '300px';
        this.allowClose = true;
        this.onShown = new Callbacks();
        this.onClose = new Callbacks();
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
            if (this.allowClose && ev.button === 0 && ev.target === this.overlay.dom)
                this.close();
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
            utils.clearChilds(this.domcontent);
        this.domcontent.appendChild(View.getDOM(view));
    }
    show() {
        var _a, _b;
        if (this.shown)
            return;
        this.shown = true;
        (_b = (_a = this)._cancelFadeout) === null || _b === void 0 ? void 0 : _b.call(_a);
        this.ensureDom();
        ui.mainContainer.dom.appendView(this.overlay);
        this.dom.focus();
        this.onShown.invoke();
    }
    close() {
        if (!this.shown)
            return;
        this.shown = false;
        this.onClose.invoke();
        this._cancelFadeout = utils.fadeout(this.overlay.dom).cancel;
    }
}
class TabBtn extends View {
    constructor(init) {
        super();
        this.clickable = true;
        this.active = false;
        this.right = false;
        this.onClick = new Callbacks();
        utils.objectApply(this, init);
    }
    createDom() {
        return {
            tag: 'span.tab.no-selection',
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
class LabeledInput extends View {
    constructor(init) {
        super();
        this.type = 'text';
        this.ensureDom();
        utils.objectApply(this, init);
        this.updateDom();
    }
    get value() { return this.dominput.value; }
    set value(val) { this.dominput.value = val; }
    createDom() {
        return {
            _ctx: this,
            tag: 'div',
            child: [
                { tag: 'div.input-label', _key: 'domlabel' },
                { tag: 'input.input-text', _key: 'dominput' }
            ]
        };
    }
    updateDom() {
        this.domlabel.textContent = this.label;
        this.dominput.type = this.type;
    }
}
// file: ListContentView.ts
/// <reference path="main.ts" />
class DataBackedListViewItem extends ListViewItem {
    constructor(data) {
        super();
        this.data = data;
    }
}
class DataBackedListView extends ListView {
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
            this.dom = this.dom || utils.buildDOM({ tag: 'div' });
            this.appendHeader();
            this.appendListView();
        }
    }
    createHeader() {
        return new ContentHeader({ title: this.title });
    }
    appendHeader() {
        this.header = this.createHeader();
        this.dom.appendView(this.header);
    }
    appendListView() {
        this.listView = new ListView({ tag: 'div' });
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
                this.emptyIndicator = this.emptyIndicator || new LoadingIndicator({ state: 'normal', content: I `(Empty)` });
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
            var li = this.loadingIndicator || new LoadingIndicator();
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
;
// file: User.ts
/// <reference path="main.ts" />
var user = new class User {
    constructor() {
        this.siLogin = new SettingItem('mcloud-login', 'json', {
            id: -1,
            username: null,
            passwd: null
        });
        this.uishown = false;
        this.onSwitchedUser = new Callbacks();
    }
    get info() { return this.siLogin.data; }
    setState(state) {
        this.state = state;
        ui.sidebarLogin.update();
    }
    init() {
        if (this.info.username) {
            this.login(this.info);
        }
        else {
            this.setState('none');
            this.loginUI();
        }
    }
    initUI() {
        var domctx = this.uictx = new BuildDOMCtx();
        var registering = false;
        var dig = this.uidialog = new Dialog();
        dig.title = '';
        var tabLogin = new TabBtn({ text: I `Login`, active: true });
        var tabCreate = new TabBtn({ text: I `Create account` });
        [tabLogin, tabCreate].forEach(x => {
            dig.addBtn(x);
            x.onClick.add(() => toggle(x));
        });
        var inputUser = new LabeledInput({ label: I `Username:` });
        var inputPasswd = new LabeledInput({ label: I `Password:`, type: 'password' });
        var inputPasswd2 = new LabeledInput({ label: I `Confirm password:`, type: 'password' });
        [inputUser, inputPasswd, inputPasswd2].forEach(x => dig.addContent(x));
        dig.addContent(utils.buildDOM({
            tag: 'div', _ctx: domctx,
            child: [
                { tag: 'div.input-label', style: 'white-space: pre-wrap; color: red;', _key: 'status' },
                { tag: 'div.btn#login-btn', textContent: I `Login`, tabIndex: 0, _key: 'btn' }
            ]
        }));
        var domstatus = domctx.status, dombtn = domctx.btn;
        dig.dom.addEventListener('keydown', (ev) => {
            if (ev.keyCode == 13) { // Enter
                btnClick();
                ev.preventDefault();
            }
        });
        dig.onShown.add(() => inputUser.dom.focus());
        var btnClick = () => {
            if (dombtn.classList.contains('disabled'))
                return;
            var precheckErr = [];
            if (!inputUser.value)
                precheckErr.push(I `Please input the username!`);
            if (!inputPasswd.value)
                precheckErr.push(I `Please input the password!`);
            else if (registering && inputPasswd.value !== inputPasswd2.value)
                precheckErr.push(I `Password confirmation does not match!`);
            domstatus.textContent = precheckErr.join('\r\n');
            if (precheckErr.length) {
                return;
            }
            (() => __awaiter(this, void 0, void 0, function* () {
                domstatus.textContent = I `Requesting...`;
                utils.toggleClass(dombtn, 'disabled', true);
                var info = { username: inputUser.value, passwd: inputPasswd.value };
                try {
                    this.pendingInfo = info;
                    if (registering) {
                        yield this.register(info);
                    }
                    else {
                        yield this.login(info);
                    }
                    domstatus.textContent = '';
                    this.closeUI();
                }
                catch (e) {
                    domstatus.textContent = e;
                    // fallback to previous login info
                    if (this.info.username) {
                        yield this.login(this.info);
                        domstatus.textContent += '\r\n' + I `Logged in with previous working account.`;
                    }
                }
                finally {
                    this.pendingInfo = null;
                    utils.toggleClass(dombtn, 'disabled', false);
                }
            }))();
        };
        dombtn.addEventListener('click', btnClick);
        var toggle = (btn) => {
            if (btn.active)
                return;
            registering = !registering;
            inputPasswd2.hidden = !registering;
            domctx.btn.textContent = btn.text;
            tabLogin.updateWith({ active: !registering });
            tabCreate.updateWith({ active: registering });
        };
        inputPasswd2.hidden = true;
    }
    loginUI() {
        if (!this.uidialog)
            this.initUI();
        this.uidialog.show();
    }
    closeUI() {
        this.uidialog.close();
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
                    var resp = yield api.getJson('users/me', {
                        basicAuth: this.getBasicAuth(info)
                    });
                }
                catch (err) {
                    this.setState('error');
                    if (err.message == 'user_not_found')
                        throw new Error(I `Username or password is not correct.`);
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
                var resp = yield api.postJson({
                    method: 'POST',
                    path: 'users/new',
                    obj: info
                });
                if (resp.error) {
                    this.setState('error');
                    if (resp.error == 'dup_user')
                        throw new Error(I `A user with the same username exists`);
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
                throw new Error(I `iNTernEL eRRoR`);
            var switchingUser = this.info.username != info.username;
            this.info.id = info.id;
            this.info.username = info.username;
            this.info.passwd = info.passwd;
            this.siLogin.save();
            // // something is dirty
            // if (switchingUser) window.location.reload();
            api.defaultBasicAuth = this.getBasicAuth(this.info);
            ui.sidebarLogin.update();
            listIndex.setIndex(info);
            this.setState('logged');
            this.loggingin = null;
            this.onSwitchedUser.invoke();
        });
    }
    setListids(listids) {
        return __awaiter(this, void 0, void 0, function* () {
            var obj = {
                id: this.info.id,
                username: this.info.username,
                listids: listids
            };
            yield api.postJson({
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
// file: TrackList.ts
/// <reference path="main.ts" />
/** A track binding with list */
class Track {
    constructor(init) {
        utils.objectApply(this, init);
    }
    toString() {
        return `${I `Track ID`}: ${this.id}\r\n${I `Name`}: ${this.name}\r\n${I `Artist`}: ${this.artist}`;
    }
    toApiTrack() {
        return utils.objectApply({}, this, ['id', 'artist', 'name', 'url']);
    }
    updateFromApiTrack(t) {
        if (this.id !== t.id)
            throw new Error('Bad track id');
        utils.objectApply(this, t, ['id', 'name', 'artist', 'url']);
    }
    startEdit() {
        var dialog = new class extends Dialog {
            constructor() {
                super();
                this.width = '500px';
                this.inputName = new LabeledInput({ label: I `Name` });
                this.inputArtist = new LabeledInput({ label: I `Artist` });
                this.btnSave = new TabBtn({ text: I `Save`, right: true });
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
                this.title = I `Track ID` + ' ' + t.id;
                this.inputName.updateWith({ value: t.name });
                this.inputArtist.updateWith({ value: t.artist });
                this.updateDom();
            }
            save() {
                return __awaiter(this, void 0, void 0, function* () {
                    this.btnSave.updateWith({ clickable: false, text: I `Saving...` });
                    try {
                        var newinfo = yield api.postJson({
                            method: 'PUT', path: 'tracks/' + this.trackId,
                            obj: {
                                id: this.trackId,
                                name: this.inputName.value,
                                artist: this.inputArtist.value
                            }
                        });
                        if (newinfo.id != this.trackId)
                            throw new Error('Bad ID in response');
                        api.onTrackInfoChanged.invoke(newinfo);
                        this.close();
                    }
                    catch (error) {
                        this.btnSave.updateWith({ clickable: false, text: I `Error` });
                        yield utils.sleepAsync(3000);
                    }
                    this.btnSave.updateWith({ clickable: true, text: I `Save` });
                });
            }
        };
        dialog.fillInfo(this);
        dialog.show();
    }
}
class TrackList {
    constructor() {
        this.tracks = [];
        this.curActive = new ItemActiveHelper();
        this.canEdit = true;
        this.trackChanged = () => {
            var _a;
            var track = playerCore.track;
            var item = (((_a = track) === null || _a === void 0 ? void 0 : _a._bind.list) === this) ? this.listView.get(track._bind.position) : null;
            this.curActive.set(item);
        };
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
        if (this.listView) {
            this.listView.add(this.createViewItem(track));
            this.contentView.updateView();
        }
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
            yield user.waitLogin();
            if (this.apiid !== undefined)
                throw new Error('cannot post: apiid exists');
            var obj = {
                id: 0,
                name: this.name,
                trackids: this.tracks.map(t => t.id)
            };
            var resp = yield api.postJson({
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
            yield user.waitLogin();
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
            var resp = yield api.postJson({
                path: 'lists/' + this.apiid,
                method: 'PUT',
                obj: obj
            });
        });
    }
    fetchForce(arg) {
        return __awaiter(this, void 0, void 0, function* () {
            var func;
            if (arg === undefined)
                arg = this.apiid;
            if (typeof arg == 'number')
                func = () => api.getListAsync(arg);
            else
                func = arg;
            this.setLoadIndicator(new LoadingIndicator());
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
            listIndex.onrename(this.id, newName);
            yield this.put();
        });
    }
    createView() {
        var list = this;
        return this.contentView = this.contentView || new class extends ListContentView {
            createHeader() {
                return new ContentHeader({
                    catalog: I `Playlist`,
                    title: list.name,
                    titleEditable: !!list.rename,
                    onTitleEdit: (newName) => list.rename(newName)
                });
            }
            onShow() {
                super.onShow();
                playerCore.onTrackChanged.add(list.trackChanged);
                this.updateItems();
            }
            onRemove() {
                super.onRemove();
                playerCore.onTrackChanged.remove(list.trackChanged);
            }
            appendListView() {
                super.appendListView();
                var lv = this.listView;
                list.listView = lv;
                lv.dragging = true;
                if (list.canEdit)
                    lv.moveByDragging = true;
                lv.onItemMoved = () => list.updateTracksFromListView();
                list.tracks.forEach(t => this.listView.add(list.createViewItem(t)));
                this.updateItems();
                this.useLoadingIndicator(list.loadIndicator);
                this.updateView();
            }
            updateItems() {
                var _a, _b;
                // update active state of items
                list.curActive.set(null);
                var playing = playerCore.track;
                for (const lvi of this.listView) {
                    const t = lvi.track;
                    if (playing
                        && ((((_a = playing._bind) === null || _a === void 0 ? void 0 : _a.list) !== list && t.id === playing.id)
                            || (((_b = playing._bind) === null || _b === void 0 ? void 0 : _b.list) === list && playing._bind.position === t._bind.position)))
                        list.curActive.set(lvi);
                }
            }
        };
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
            return _c = this.tracks[utils.mod(bind.position + offset, this.tracks.length)], (_c !== null && _c !== void 0 ? _c : null);
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
        if (this.listView)
            this.listView.remove(pos);
        (_a = this.contentView) === null || _a === void 0 ? void 0 : _a.updateView();
        this.put();
    }
    createViewItem(t) {
        var view = new TrackViewItem(t);
        if (this.canEdit) {
            view.onRemove = (item) => this.remove(item.track);
        }
        return view;
    }
}
class TrackViewItem extends ListViewItem {
    constructor(item) {
        super();
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
            onclick: () => { playerCore.playTrack(track); },
            oncontextmenu: (ev) => {
                ev.preventDefault();
                var m = new ContextMenu();
                m.add(new MenuItem({ text: I `Comments` }));
                if (this.track.url)
                    m.add(new MenuLinkItem({
                        text: I `Download`,
                        link: api.processUrl(this.track.url)
                    }));
                m.add(new MenuItem({
                    text: I `Edit`,
                    onclick: () => this.track.startEdit()
                }));
                if (this.onRemove)
                    m.add(new MenuItem({
                        text: I `Remove`, cls: 'dangerous',
                        onclick: () => { var _a, _b; return (_b = (_a = this).onRemove) === null || _b === void 0 ? void 0 : _b.call(_a, this); }
                    }));
                m.add(new MenuInfoItem({ text: I `Track ID` + ': ' + track.id }));
                m.show({ ev: ev });
            },
            draggable: true,
            _item: this
        };
    }
    updateDom() {
        this.domname.textContent = this.track.name;
        this.domartist.textContent = this.track.artist;
        if (!this.noPos) {
            this.dompos.textContent = this.track._bind ? (this.track._bind.position + 1).toString() : '';
        }
        else {
            this.dompos.hidden = true;
        }
    }
}
class ContentHeader extends View {
    constructor(init) {
        super();
        this.titleEditable = false;
        this.domctx = {};
        if (init)
            utils.objectApply(this, init);
    }
    createDom() {
        var editHelper;
        return utils.buildDOM({
            _ctx: this.domctx,
            tag: 'div.content-header',
            child: [
                { tag: 'span.catalog', textContent: this.catalog, _key: 'catalog' },
                {
                    tag: 'span.title', textContent: this.title, _key: 'title',
                    onclick: (ev) => {
                        if (!this.titleEditable)
                            return;
                        editHelper = editHelper || new EditableHelper(this.domctx.title);
                        if (editHelper.editing)
                            return;
                        editHelper.startEdit((newName) => {
                            if (newName !== editHelper.beforeEdit && newName != '') {
                                this.onTitleEdit(newName);
                            }
                            this.updateDom();
                        });
                    }
                },
            ]
        });
    }
    updateDom() {
        this.domctx.catalog.textContent = this.catalog;
        this.domctx.catalog.style.display = this.catalog ? '' : 'none';
        this.domctx.title.textContent = this.title;
        utils.toggleClass(this.domctx.title, 'editable', !!this.titleEditable);
        if (this.titleEditable)
            this.domctx.title.title = I `Click to edit`;
        else
            this.domctx.title.removeAttribute('title');
    }
}
// file: ListIndex.ts
/// <reference path="main.ts" />
class ListIndex {
    constructor() {
        this.loadedList = {};
        this.loadIndicator = new LoadingIndicator();
        this.nextId = -100;
        this.listView = new ListView();
        this.listView.dragging = true;
        this.listView.moveByDragging = true;
        this.listView.onItemMoved = (item, from) => {
            user.setListids(this.listView.map(l => l.listInfo.id));
        };
        this.listView.onDragover = (arg) => {
            var src = arg.source;
            if (src instanceof TrackViewItem) {
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
            if (ui.sidebarList.currentActive.current === item)
                return;
            ui.sidebarList.setActive(item);
            this.showTracklist(item.listInfo.id);
        };
        this.section = new Section({
            title: I `Playlists`,
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
        playerCore.onTrackChanged.add(() => {
            var _a, _b, _c, _d;
            var curPlaying = (_b = (_a = playerCore.track) === null || _a === void 0 ? void 0 : _a._bind) === null || _b === void 0 ? void 0 : _b.list;
            if (curPlaying != this.playing) {
                if (curPlaying)
                    (_c = this.getViewItem(curPlaying.id)) === null || _c === void 0 ? void 0 : _c.updateWith({ playing: true });
                if (this.playing)
                    (_d = this.getViewItem(this.playing.id)) === null || _d === void 0 ? void 0 : _d.updateWith({ playing: false });
                this.playing = curPlaying;
            }
        });
        api.onTrackInfoChanged.add((newer) => {
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
        ui.sidebarList.container.appendView(this.section);
        // listIndex.fetch();
    }
    /** Fetch lists from API and update the view */
    fetch() {
        return __awaiter(this, void 0, void 0, function* () {
            this.loadIndicator.reset();
            this.listView.ReplaceChild(this.loadIndicator.dom);
            try {
                var index = yield api.getListIndexAsync();
                this.setIndex(index);
            }
            catch (err) {
                this.loadIndicator.error(err, () => this.fetch());
            }
            if (this.listView.length > 0)
                this.listView.onItemClicked(this.listView.get(0));
        });
    }
    setIndex(index) {
        this.listView.clear();
        for (const item of index.lists) {
            this.addListInfo(item);
        }
        if (this.listView.length > 0 && !ui.content.current)
            this.listView.onItemClicked(this.listView.get(0));
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
            list = new TrackList();
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
        var list = this.getList(id);
        ui.content.setCurrent(list.createView());
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
            yield api.postJson({
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
        var id = this.nextId--;
        var list = {
            id,
            name: utils.createName((x) => x ? I `New Playlist (${x + 1})` : I `New Playlist`, (x) => !!this.listView.find((l) => l.listInfo.name == x))
        };
        this.addListInfo(list);
        var listview = this.getList(id);
        listview.postToUser().then(() => {
            list.id = listview.apiid;
        });
    }
}
class ListIndexViewItem extends SidebarItem {
    constructor(init) {
        super({});
        this.playing = false;
        utils.objectApply(this, init);
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
            onclick: (ev) => { var _a, _b; return (_b = (_a = this).onclick) === null || _b === void 0 ? void 0 : _b.call(_a, ev); },
            oncontextmenu: (e) => {
                var m = new ContextMenu();
                if (this.index && this.listInfo)
                    m.add(new MenuItem({
                        text: I `Remove`, cls: 'dangerous',
                        onclick: () => {
                            this.index.removeList(this.listInfo.id);
                        }
                    }));
                if (this.listInfo)
                    m.add(new MenuInfoItem({
                        text: I `List ID` + ': ' + this.listInfo.id
                    }));
                if (m.length) {
                    e.preventDefault();
                    m.show({ ev: e });
                }
            }
        };
    }
    updateDom() {
        var _a, _b;
        this.domname.textContent = (_b = (_a = this.listInfo) === null || _a === void 0 ? void 0 : _a.name, (_b !== null && _b !== void 0 ? _b : this.text));
        this.domstate.textContent = this.playing ? "🎵" : "";
        this.domstate.hidden = !this.domstate.textContent;
    }
}
// file: Uploads.ts
class UploadTrack extends Track {
    constructor(init) {
        super(init);
    }
}
var uploads = new class {
    constructor() {
        this.tracks = [];
        this.state = false;
        this.uploadSemaphore = new Semaphore({ maxCount: 2 });
        this.view = new class extends ListContentView {
            constructor() {
                super(...arguments);
                this.playing = new ItemActiveHelper();
                this.updatePlaying = (item) => {
                    if (item === undefined) {
                        if (playerCore.track)
                            this.playing.set(this.listView.find(lvi => lvi.track.id === playerCore.track.id));
                        else
                            this.playing.set(null);
                    }
                    else {
                        if (playerCore.track && item.track.id === playerCore.track.id)
                            this.playing.set(item);
                    }
                };
            }
            appendHeader() {
                this.title = I `My Uploads`;
                super.appendHeader();
                this.uploadArea = new UploadArea({ onfile: (file) => uploads.uploadFile(file) });
                this.dom.appendView(this.uploadArea);
            }
            appendListView() {
                super.appendListView();
                uploads.tracks.forEach(t => this.addTrack(t));
                if (!uploads.state)
                    uploads.fetch();
            }
            addTrack(t, pos) {
                var lvi = new UploadViewItem(t);
                this.listView.add(lvi, pos);
                this.updatePlaying(lvi);
                this.updateView();
            }
            onShow() {
                super.onShow();
                this.updatePlaying();
                playerCore.onTrackChanged.add(this.updatePlaying);
            }
            onRemove() {
                super.onRemove();
                playerCore.onTrackChanged.remove(this.updatePlaying);
            }
        };
    }
    init() {
        this.sidebarItem = new ListIndexViewItem({ text: I `My Uploads` })
            .bindContentView(() => this.view);
        ui.sidebarList.addItem(this.sidebarItem);
        user.onSwitchedUser.add(() => {
            if (this.state != false) {
                this.tracks = [];
                this.state = false;
                if (this.view.rendered) {
                    this.view.listView.removeAll();
                    this.view.updateView();
                }
                setTimeout(() => this.fetch(), 1);
            }
        });
        playerCore.onTrackChanged.add(() => {
            this.sidebarItem.updateWith({ playing: !!this.tracks.find(x => x === playerCore.track) });
        });
        api.onTrackInfoChanged.add((newer) => {
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
            this.view.addTrack(t, 0);
    }
    appendTrack(t) {
        this.tracks.push(t);
        if (this.view.rendered)
            this.view.addTrack(t);
    }
    fetch() {
        return __awaiter(this, void 0, void 0, function* () {
            this.state = 'fetching';
            var li = new LoadingIndicator();
            this.view.useLoadingIndicator(li);
            try {
                yield user.waitLogin(true);
                var fetched = (yield api.getJson('my/uploads'))['tracks']
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
                var resp = yield api.postJson({
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
class UploadViewItem extends TrackViewItem {
    constructor(track) {
        super(track);
        this.noPos = true;
        track._upload.view = this;
    }
    postCreateDom() {
        super.postCreateDom();
        this.dom.classList.add('uploads-item');
        this.dom.appendChild(this.domstate = utils.buildDOM({ tag: 'span.uploads-state' }));
    }
    updateDom() {
        super.updateDom();
        var newState = this.track._upload.state;
        if (this._lastUploadState != newState) {
            if (this._lastUploadState)
                this.dom.classList.remove('state-' + this._lastUploadState);
            if (newState)
                this.dom.classList.add('state-' + newState);
            this.domstate.textContent = i18n.get('uploads_' + newState);
            this.dragging = newState == 'done';
        }
    }
}
class UploadArea extends View {
    constructor(init) {
        super();
        utils.objectApply(this, init);
    }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.upload-area',
            child: [
                { tag: 'div.text.no-selection', textContent: I `Click here to select files to upload` },
                { tag: 'div.text.no-selection', textContent: I `or drag files to this zone...` },
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
// file: discussion.ts
/// <reference path="main.ts" />
var discussion = new class {
    constructor() {
        this.view = new Lazy(() => new class extends ListContentView {
            createHeader() {
                return new ContentHeader({
                    title: I `Discussion`
                });
            }
            appendListView() {
                super.appendListView();
                this.useLoadingIndicator(new LoadingIndicator({
                    state: 'normal',
                    content: '(This feature is a work in progress)'
                }));
            }
        });
    }
    init() {
        this.sidebarItem = new SidebarItem({ text: I `Discussion` }).bindContentView(() => this.view.value);
        ui.sidebarList.addItem(this.sidebarItem);
    }
};
var notes = new class {
    constructor() {
        this.lazyView = new Lazy(() => new class extends ListContentView {
            createHeader() {
                return new ContentHeader({
                    title: I `Notes`
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
                    notes.post(content);
                };
            }
            appendListView() {
                super.appendListView();
                if (!notes.state)
                    notes.fetch();
            }
        });
        this.state = false;
    }
    init() {
        this.sidebarItem = new SidebarItem({ text: I `Notes` }).bindContentView(() => this.view);
        ui.sidebarList.addItem(this.sidebarItem);
        user.onSwitchedUser.add(() => {
            if (this.state)
                this.fetch();
        });
    }
    get view() { return this.lazyView.value; }
    fetch() {
        return __awaiter(this, void 0, void 0, function* () {
            this.state = 'fetching';
            var li = new LoadingIndicator();
            this.view.useLoadingIndicator(li);
            try {
                yield user.waitLogin(true);
                var resp = yield api.getJson('my/notes?reverse=1');
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
            this.ioAction(() => api.postJson({
                method: 'DELETE',
                path: 'my/notes/' + comm.comment.id,
                obj: undefined
            }));
        };
        return this.view.listView.add(comm);
    }
    ioAction(func) {
        return __awaiter(this, void 0, void 0, function* () {
            var li = new LoadingIndicator({ content: I `Submitting` });
            this.view.useLoadingIndicator(li);
            yield li.action(() => __awaiter(this, void 0, void 0, function* () {
                yield func();
                yield this.fetch();
            }));
        });
    }
    post(content) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ioAction(() => api.postJson({
                method: 'POST',
                path: 'my/notes/new',
                obj: {
                    content: content
                }
            }));
        });
    }
};
class CommentViewItem extends ListViewItem {
    constructor(comment) {
        super();
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
    postCreateDom() {
        this.dom.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            var m = new ContextMenu([
                new MenuInfoItem({ text: I `Comment ID` + ': ' + this.comment.id })
            ]);
            if (this.onremove) {
                m.add(new MenuItem({ text: I `Remove`, cls: 'dangerous', onclick: () => { this.onremove(this); } }), 0);
            }
            if (this.onedit) {
                m.add(new MenuItem({ text: I `Edit`, onclick: () => { this.onedit(this); } }), 0);
            }
            m.show({ ev: ev });
        });
    }
    updateDom() {
        this.domusername.textContent = this.comment.username;
        this.domcontent.textContent = this.comment.content;
    }
}
class CommentEditor extends View {
    get content() { this.ensureDom(); return this.domcontent.value; }
    set content(val) { this.ensureDom(); this.domcontent.value = val; }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.comment-editor',
            child: [
                { tag: 'textarea.content', _key: 'domcontent' },
                { tag: 'div.btn.submit', textContent: I `Submit`, _key: 'domsubmit' }
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
// file: main.ts
// TypeScript 3.7 is required.
// Why do we need to use React and Vue.js? ;)
/// <reference path="utils.ts" />
/// <reference path="viewlib.ts" />
/// <reference path="ListContentView.ts" />
/// <reference path="apidef.d.ts" />
/// <reference path="user.ts" />
/// <reference path="tracklist.ts" />
/// <reference path="listindex.ts" />
/// <reference path="uploads.ts" />
/// <reference path="discussion.ts" />
var settings = {
    apiBaseUrl: 'api/',
    // apiBaseUrl: 'http://127.0.0.1:50074/api/',
    // apiBaseUrl: 'http://127.0.0.1:5000/api/',
    debug: true,
    apiDebugDelay: 0,
};
/** 常驻 UI 元素操作 */
var ui = new class {
    constructor() {
        this.lang = new class {
            constructor() {
                this.availableLangs = ['en', 'zh'];
                this.siLang = new SettingItem('mcloud-lang', 'str', I18n.detectLanguage(this.availableLangs));
            }
            init() {
                this.siLang.render((lang) => {
                    i18n.curLang = lang;
                    document.body.lang = lang;
                });
                console.log(`Current language: '${i18n.curLang}' - '${I `English`}'`);
                i18n.renderElements(document.querySelectorAll('.i18ne'));
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
                this.hideTimer = new utils.Timer(() => { this.toggle(false); });
                this.shown = false;
                this.inTransition = false;
            }
            setPinned(val) {
                val = (val !== null && val !== void 0 ? val : !this.pinned);
                this.pinned = val;
                utils.toggleClass(document.body, 'bottompinned', val);
                this.btnPin.textContent = val ? I `Unpin` : I `Pin`;
                if (val)
                    this.toggle(true);
            }
            toggle(state, hideTimeout) {
                this.shown = utils.toggleClass(this.container, 'show', state);
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
                this.siPin = new SettingItem('mcloud-bottompin', 'bool', false)
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
                prog = utils.numLimit(prog, 0, 1);
                this.fill.style.width = (prog * 100) + '%';
                this.labelCur.textContent = utils.formatTime(cur);
                this.labelTotal.textContent = utils.formatTime(total);
            }
            setProgressChangedCallback(cb) {
                var call = (e) => { cb(utils.numLimit(e.offsetX / this.progbar.clientWidth, 0, 1)); };
                this.progbar.addEventListener('mousedown', (e) => {
                    if (ui.bottomBar.shown && !ui.bottomBar.inTransition)
                        if (e.buttons == 1)
                            call(e);
                });
                this.progbar.addEventListener('mousemove', (e) => {
                    if (ui.bottomBar.shown && !ui.bottomBar.inTransition)
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
                    utils.replaceChild(this.element, utils.buildDOM({
                        tag: 'span',
                        child: [
                            // 'Now Playing: ',
                            { tag: 'span.name', textContent: track.name },
                            { tag: 'span.artist', textContent: track.artist },
                        ]
                    }));
                    ui.bottomBar.toggle(true, 5000);
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
                    user.loginUI();
                });
            }
            update() {
                var _a, _b;
                var text = this.loginState.textContent;
                var username = (_b = (_a = user.pendingInfo) === null || _a === void 0 ? void 0 : _a.username, (_b !== null && _b !== void 0 ? _b : user.info.username));
                if (username) {
                    text = username;
                    if (user.state == 'logging')
                        text += I ` (logging in...)`;
                    if (user.state == 'error')
                        text += I ` (error!)`;
                    if (user.state == 'none')
                        text += I ` (not logged in)`;
                }
                else {
                    if (user.state == 'logging')
                        text = I `(logging...)`;
                    else
                        text = I `Guest (click to login)`;
                }
                this.loginState.textContent = text;
            }
        };
        this.sidebarList = new class {
            constructor() {
                this.container = document.getElementById('sidebar-list');
                this.listview = new ListView(this.container);
                this.currentActive = new ItemActiveHelper();
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
                if (arg.onShow)
                    arg.onShow();
                if (arg.dom)
                    this.container.appendChild(arg.dom);
                if (!arg.contentViewState)
                    arg.contentViewState = { scrollTop: 0 };
                this.container.scrollTop = arg.contentViewState.scrollTop;
                this.current = arg;
            }
        };
    }
    init() {
        this.lang.init();
        this.bottomBar.init();
        this.sidebarLogin.init();
    }
}; // ui
/** 播放器核心：控制播放逻辑 */
var playerCore = new class PlayerCore {
    constructor() {
        this.loopMode = 'list-loop';
        this.onTrackChanged = new Callbacks();
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('canplay', () => this.updateProgress());
        this.audio.addEventListener('error', (e) => {
            console.log(e);
        });
        this.audio.addEventListener('ended', () => {
            this.next();
        });
        ui.playerControl.setProgressChangedCallback((x) => {
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
        ui.playerControl.setProg(this.audio.currentTime, this.audio.duration);
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
        ui.trackinfo.setTrack(track);
        this.onTrackChanged.invoke();
        if (((_a = oldTrack) === null || _a === void 0 ? void 0 : _a.url) !== this.track.url)
            this.loadUrl(track ? api.processUrl(track.url) : null);
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
/** API 操作 */
var api = new class {
    constructor() {
        this.debugSleep = settings.debug ? settings.apiDebugDelay : 0;
        this.onTrackInfoChanged = new Callbacks();
    }
    get baseUrl() { return settings.apiBaseUrl; }
    _fetch(input, init) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.debugSleep)
                yield utils.sleepAsync(this.debugSleep * (Math.random() + 1));
            return yield fetch(input, Object.assign({ credentials: 'same-origin' }, init));
        });
    }
    getHeaders(arg) {
        var _a;
        arg = arg || {};
        var headers = {};
        var basicAuth = (_a = arg.basicAuth, (_a !== null && _a !== void 0 ? _a : this.defaultBasicAuth));
        if (basicAuth)
            headers['Authorization'] = 'Basic ' + utils.base64EncodeUtf8(basicAuth);
        return headers;
    }
    getJson(path, options) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            options = options || {};
            var resp = yield this._fetch(this.baseUrl + path, {
                headers: Object.assign({}, this.getHeaders(options))
            });
            if (options.status !== false && resp.status != (_a = options.status, (_a !== null && _a !== void 0 ? _a : 200))) {
                if (resp.status === 450) {
                    try {
                        var resperr = (yield resp.json()).error;
                    }
                    catch (_b) { }
                    if (resperr)
                        throw new Error(resperr);
                }
                throw new Error('HTTP status ' + resp.status);
            }
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
            var contentType = resp.headers.get('Content-Type');
            if (contentType && /^application\/json;?/.test(contentType))
                return yield resp.json();
            return null;
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
var trackStore = new class TrackStore {
};
document.addEventListener('dragover', (ev) => {
    ev.preventDefault();
});
document.addEventListener('drop', (ev) => {
    ev.preventDefault();
});
if (navigator['mediaSession']) {
    let mediaSession = navigator['mediaSession'];
    playerCore.onTrackChanged.add(() => {
        var _a, _b;
        try {
            var track = playerCore.track;
            if (!track)
                return;
            mediaSession.metadata = new MediaMetadata({
                title: (_a = track) === null || _a === void 0 ? void 0 : _a.name,
                artist: (_b = track) === null || _b === void 0 ? void 0 : _b.artist
            });
        }
        catch (_c) { }
    });
    mediaSession.setActionHandler('play', () => playerCore.play());
    mediaSession.setActionHandler('pause', () => playerCore.pause());
    mediaSession.setActionHandler('previoustrack', () => playerCore.prev());
    mediaSession.setActionHandler('nexttrack', () => playerCore.next());
}
window.addEventListener('beforeunload', (ev) => {
    if (!playerCore.track || playerCore.audio.paused)
        return;
    ev.preventDefault();
    return ev.returnValue = 'The player is running. Are you sure to leave?';
});
ui.init();
var listIndex = new ListIndex();
user.init();
uploads.init();
discussion.init();
notes.init();
listIndex.init();
