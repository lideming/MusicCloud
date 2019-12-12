// file: utils.ts
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
    }
    /** Fade out the element and remove it */
    fadeout(element) {
        element.style.transition = 'opacity .3s';
        element.style.opacity = '0';
        var end = () => {
            if (!end)
                return; // use a random variable as flag ;)
            end = null;
            element.style.transition = null;
            element.style.opacity = null;
            element.remove();
        };
        element.addEventListener('transitionend', end);
        setTimeout(end, 500); // failsafe
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
    objectApply(obj, kv) {
        for (const key in kv) {
            if (kv.hasOwnProperty(key)) {
                const val = kv[key];
                obj[key] = val;
            }
        }
        return obj;
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
    invoke() {
        this.list.forEach((x) => x());
    }
    add(callback) {
        this.list.push(callback);
    }
    remove(callback) {
        utils.arrayRemove(this.list, callback);
    }
}
/** I18n helper class */
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
    ["Drag files to this zone...", "拖放文件到此处..."],
    ["Music Cloud", "Music Cloud"]
]`));
// file: viewlib.ts
class View {
    constructor(dom) {
        if (dom)
            this._dom = utils.buildDOM(dom);
    }
    get dom() {
        this.ensureDom();
        return this._dom;
    }
    ensureDom() {
        if (!this._dom) {
            this._dom = utils.buildDOM(this.createDom());
            this.postCreateDom(this._dom);
            this.updateDom();
        }
    }
    createDom() {
        return document.createElement('div');
    }
    /** Will be called when the dom is created */
    postCreateDom(element) {
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
/** DragManager is used to help exchange infomation between views */
var dragManager = new class DragManager {
    get currentItem() { return this._currentItem; }
    ;
    start(item) {
        this._currentItem = item;
    }
    end(item) {
        this._currentItem = null;
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
    postCreateDom(element) {
        super.postCreateDom(element);
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
// TODO: class ContextMenu
// file: user.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/// <reference path="main.ts" />
var user = new class User {
    constructor() {
        this.siLogin = new SettingItem('mcloud-login', 'json', {
            id: -1,
            username: null,
            passwd: null
        });
        this.uishown = false;
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
        }
    }
    initUI() {
        var overlay = this.uioverlay = new Overlay().setCenterChild(true);
        var domctx = this.uictx = new BuildDOMCtx();
        var registering = false;
        var toggle = (ev) => {
            var _a, _b;
            if ((_b = (_a = ev.target) === null || _a === void 0 ? void 0 : _a.classList) === null || _b === void 0 ? void 0 : _b.contains('active'))
                return;
            registering = !registering;
            domctx.passwd2_label.hidden = domctx.passwd2.hidden = !registering;
            var activingTitle = registering ? domctx.title2 : domctx.title;
            domctx.btn.textContent = activingTitle.textContent;
            utils.toggleClass(domctx.title, 'active', !registering);
            utils.toggleClass(domctx.title2, 'active', registering);
        };
        var dialog = utils.buildDOM({
            _ctx: domctx,
            _key: 'dialog',
            tag: 'div.dialog',
            style: 'width: 300px',
            child: [{
                    tag: 'div.dialog-title',
                    child: [
                        {
                            tag: 'span.clickable.no-selection.tab.active', textContent: I `Login`, _key: 'title',
                            onclick: toggle
                        },
                        {
                            tag: 'span.clickable.no-selection.tab', textContent: I `Create account`, _key: 'title2',
                            onclick: toggle
                        },
                        {
                            tag: 'div.clickable.no-selection', style: 'float: right; color: gray;',
                            textContent: I `Close`, onclick: () => {
                                this.closeUI();
                            }
                        }
                    ]
                }, {
                    tag: 'div.dialog-content',
                    child: [
                        { tag: 'div.input-label', textContent: I `Username:` },
                        { tag: 'input.input-text', type: 'text', _key: 'user' },
                        { tag: 'div.input-label', textContent: I `Password:` },
                        { tag: 'input.input-text', type: 'password', _key: 'passwd' },
                        { tag: 'div.input-label', textContent: I `Confirm password:`, _key: 'passwd2_label' },
                        { tag: 'input.input-text', type: 'password', _key: 'passwd2' },
                        { tag: 'div.input-label', style: 'white-space: pre-wrap; color: red;', _key: 'status' },
                        { tag: 'div.btn#login-btn', textContent: I `Login`, tabIndex: 0, _key: 'btn' }
                    ]
                }]
        });
        domctx.passwd2_label.hidden = domctx.passwd2.hidden = true;
        overlay.dom.addEventListener('mousedown', (ev) => {
            if (ev.button === 0 && ev.target === overlay.dom)
                this.closeUI();
        });
        overlay.dom.appendChild(dialog);
        var domuser = domctx.user, dompasswd = domctx.passwd, dompasswd2 = domctx.passwd2, domstatus = domctx.status, dombtn = domctx.btn;
        overlay.dom.addEventListener('keydown', (ev) => {
            if (ev.keyCode == 27) { // ESC
                this.closeUI();
                ev.preventDefault();
            }
            else if (ev.keyCode == 13) { // Enter
                btnClick();
                ev.preventDefault();
            }
        });
        dombtn.addEventListener('click', (ev) => {
            btnClick();
        });
        var btnClick = () => {
            if (dombtn.classList.contains('disabled'))
                return;
            var precheckErr = [];
            if (!domuser.value)
                precheckErr.push(I `Please input the username!`);
            if (!dompasswd.value)
                precheckErr.push(I `Please input the password!`);
            else if (registering && dompasswd.value !== dompasswd2.value)
                precheckErr.push(I `Password confirmation does not match!`);
            domstatus.textContent = precheckErr.join('\r\n');
            if (precheckErr.length) {
                return;
            }
            (() => __awaiter(this, void 0, void 0, function* () {
                domstatus.textContent = I `Requesting...`;
                utils.toggleClass(dombtn, 'disabled', true);
                var info = { username: domuser.value, passwd: dompasswd.value };
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
    }
    loginUI() {
        if (this.uishown)
            return;
        this.uishown = true;
        if (!this.uioverlay)
            this.initUI();
        ui.mainContainer.dom.appendChild(this.uioverlay.dom);
        this.uictx.user.focus();
    }
    closeUI() {
        if (!this.uishown)
            return;
        this.uishown = false;
        utils.fadeout(this.uioverlay.dom);
    }
    getBasicAuth(info) {
        return info.username + ':' + info.passwd;
    }
    login(info) {
        return __awaiter(this, void 0, void 0, function* () {
            this.setState('logging');
            // try GET `api/users/me` using the new info
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
        });
    }
    register(info) {
        return __awaiter(this, void 0, void 0, function* () {
            this.setState('logging');
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
        });
    }
    handleLoginResult(info) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (!info.username)
                throw new Error(I `iNTernEL eRRoR`);
            var switchingUser = ((_a = this.info) === null || _a === void 0 ? void 0 : _a.username) && this.info.username != info.username;
            this.info.id = info.id;
            this.info.username = info.username;
            this.info.passwd = info.passwd;
            this.siLogin.save();
            // something is dirty
            if (switchingUser)
                window.location.reload();
            api.defaultBasicAuth = this.getBasicAuth(this.info);
            ui.sidebarLogin.update();
            listIndex.setIndex(info);
            this.setState('logged');
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
};
// file: tracklist.ts
/// <reference path="main.ts" />
class TrackList {
    constructor() {
        this.tracks = [];
        this.curActive = new ItemActiveHelper();
        this.canMove = true;
    }
    loadInfo(info) {
        this.id = info.id;
        this.apiid = this.id > 0 ? this.id : undefined;
        this.name = info.name;
    }
    loadFromGetResult(obj) {
        this.loadInfo(obj);
        for (const t of obj.tracks) {
            this.addTrack(t);
        }
        return this;
    }
    addTrack(t) {
        var track = {
            artist: t.artist, id: t.id, name: t.name, url: t.url,
            _bind: {
                list: this,
                position: this.tracks.length
            }
        };
        this.tracks.push(track);
        if (this.listView) {
            this.listView.add(new TrackViewItem(track));
        }
        return track;
    }
    loadEmpty() {
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
    put() {
        return __awaiter(this, void 0, void 0, function* () {
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
            this.loadIndicator = new LoadingIndicator();
            this.updateView();
            try {
                var obj = yield func();
                this.loadFromGetResult(obj);
                this.loadIndicator = null;
            }
            catch (err) {
                this.loadIndicator.error(err, () => this.fetchForce(arg));
                throw err;
            }
            this.updateView();
        });
    }
    rename(newName) {
        return __awaiter(this, void 0, void 0, function* () {
            this.name = newName;
            if (this.header)
                this.header.updateWith({ title: this.name });
            listIndex.onrename(this.id, newName);
            yield this.put();
        });
    }
    createView() {
        if (!this.contentView) {
            let cb = () => this.trackChanged();
            this.contentView = {
                dom: utils.buildDOM({ tag: 'div.tracklist' }),
                onShow: () => {
                    var lv = this.listView = this.listView || new ListView(this.contentView.dom);
                    lv.dragging = true;
                    if (this.canMove)
                        lv.moveByDragging = true;
                    lv.onItemMoved = (item, from) => {
                        this.tracks = this.listView.map(lvi => {
                            lvi.track._bind.position = lvi.position;
                            lvi.updateDom();
                            return lvi.track;
                        });
                    };
                    this.contentView.dom = lv.dom;
                    playerCore.onTrackChanged.add(cb);
                    this.updateView();
                },
                onRemove: () => {
                    playerCore.onTrackChanged.remove(cb);
                    this.listView = null;
                }
            };
            // this.updateView();
        }
        return this.contentView;
    }
    getNextTrack(track) {
        var _a, _b;
        if (((_a = track._bind) === null || _a === void 0 ? void 0 : _a.list) === this) {
            return _b = this.tracks[track._bind.position + 1], (_b !== null && _b !== void 0 ? _b : null);
        }
        return null;
    }
    trackChanged() {
        var _a;
        var track = playerCore.track;
        var item = (((_a = track) === null || _a === void 0 ? void 0 : _a._bind.list) === this) ? this.listView.get(track._bind.position) : null;
        this.curActive.set(item);
    }
    updateView() {
        var listView = this.listView;
        if (!listView)
            return;
        listView.clear();
        if (this.buildHeader)
            listView.dom.appendChild((this.header || (this.header = this.buildHeader())).dom);
        if (this.loadIndicator) {
            listView.dom.appendChild(this.loadIndicator.dom);
            return;
        }
        if (this.tracks.length === 0) {
            listView.dom.appendChild(new LoadingIndicator({ state: 'normal', content: I `(Empty)` }).dom);
            return;
        }
        // Well... currently, we just rebuild the DOM.
        var playing = playerCore.track;
        for (const t of this.tracks) {
            let item = new TrackViewItem(t);
            if (playing
                && ((playing._bind.list !== this && t.id === playing.id)
                    || playing._bind.list === this && playing._bind.position === t._bind.position))
                this.curActive.set(item);
            listView.add(item);
        }
    }
    buildHeader() {
        return new ContentHeader({
            catalog: I `Playlist`,
            title: this.name,
            titleEditable: !!this.rename,
            onTitleEdit: (newName) => this.rename(newName)
        });
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
                { tag: 'span.name', textContent: track.name },
                { tag: 'span.artist', textContent: track.artist },
            ],
            onclick: () => { playerCore.playTrack(track); },
            draggable: true,
            _item: this
        };
    }
    updateDom() {
        this.dompos.textContent = this.track._bind ? (this.track._bind.position + 1).toString() : '';
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
// file: listindex.ts
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
                            list.addTrack(src.track);
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
        ui.sidebarList.container.appendChild(this.section.dom);
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
    }
    addListInfo(listinfo) {
        this.listView.add(new ListIndexViewItem(this, listinfo));
    }
    getListInfo(id) {
        for (const l of this.listView) {
            if (l.listInfo.id === id)
                return l.listInfo;
        }
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
    showTracklist(id) {
        var list = this.getList(id);
        ui.content.setCurrent(list.createView());
    }
    onrename(id, newName) {
        var lvi = this.listView.find(lvi => lvi.listInfo.id == id);
        lvi.listInfo.name = newName;
        lvi.updateDom();
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
class ListIndexViewItem extends ListViewItem {
    constructor(index, listInfo) {
        super();
        this.index = index;
        this.listInfo = listInfo;
    }
    createDom() {
        return { tag: 'div.item.no-selection' };
    }
    updateDom() {
        this.dom.textContent = this.listInfo.name;
    }
}
// file: uploads.ts
var uploads = new class {
    constructor() {
        this.tracks = [];
        this.state = false;
        this.sidebarItem = new class extends ListViewItem {
            createDom() {
                return {
                    tag: 'div.item.no-selection',
                    textContent: I `My Uploads`,
                    onclick: (ev) => {
                        ui.sidebarList.setActive(uploads.sidebarItem);
                        ui.content.setCurrent(uploads.view);
                    }
                };
            }
        };
        this.view = new class {
            get rendered() { return !!this.listView; }
            ensureDom() {
                if (!this.dom) {
                    this.listView = new ListView({ tag: 'div.tracklist' });
                    this.dom = this.listView.dom;
                    this.header = new ContentHeader({ title: I `My Uploads` });
                    this.dom.appendView(this.header);
                    this.uploadArea = new UploadArea({ onfile: (file) => uploads.uploadFile(file) });
                    this.dom.appendView(this.uploadArea);
                    if (!uploads.state)
                        uploads.fetch();
                }
            }
            onShow() {
                this.ensureDom();
            }
            onRemove() {
            }
            useLoadingIndicator(li) {
                if (this.loadingIndicator && this.rendered)
                    this.loadingIndicator.dom.remove();
                if (li && this.rendered) {
                    this.dom.insertBefore(li.dom, this.uploadArea.dom.nextSibling);
                }
                this.loadingIndicator = li;
                // if (this.rendered) this.updateView();
            }
            addTrack(t) {
                var lvi = new UploadViewItem(t);
                lvi.dragging = true;
                this.listView.add(lvi);
                this.updateView();
            }
            updateView() {
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
        };
    }
    init() {
        ui.sidebarList.container.insertBefore(this.sidebarItem.dom, ui.sidebarList.container.firstChild);
    }
    fetch() {
        return __awaiter(this, void 0, void 0, function* () {
            this.state = 'fetching';
            var li = new LoadingIndicator();
            this.view.useLoadingIndicator(li);
            this.tracks = (yield api.getJson('my/uploads'))['tracks'];
            this.tracks.reverse();
            this.state = 'fetched';
            this.view.useLoadingIndicator(null);
            this.view.updateView();
            if (this.view.rendered)
                this.tracks.forEach(t => this.view.addTrack(t));
        });
    }
    uploadFile(file) {
        return __awaiter(this, void 0, void 0, function* () {
            var track = {
                id: undefined, url: undefined,
                artist: 'Unknown', name: file.name
            };
            this.tracks.push(track);
            var jsonBlob = new Blob([JSON.stringify(track)]);
            var finalBlob = new Blob([
                BlockFormat.encodeBlock(jsonBlob),
                BlockFormat.encodeBlock(file)
            ]);
            var resp = yield api.postJson({
                path: 'tracks/newfile',
                method: 'POST',
                mode: 'raw',
                obj: finalBlob
            });
        });
    }
};
class UploadViewItem extends TrackViewItem {
    constructor(track) {
        super(track);
    }
}
class UploadArea extends View {
    constructor(init) {
        super();
        utils.objectApply(this, init);
    }
    createDom() {
        return {
            tag: 'div.upload-area',
            child: [
                { tag: 'div.text.no-selection', textContent: I `Drag files to this zone...` }
            ]
        };
    }
    postCreateDom() {
        this.dom.addEventListener('dragover', (ev) => {
            if (ev.dataTransfer.types.indexOf('Files') >= 0) {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'copy';
            }
        });
        this.dom.addEventListener('drop', (ev) => {
            var _a, _b;
            ev.preventDefault();
            if (ev.dataTransfer.types.indexOf('Files') >= 0) {
                var files = ev.dataTransfer.files;
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    console.log('drop file', { name: file.name, size: file.size });
                    (_b = (_a = this).onfile) === null || _b === void 0 ? void 0 : _b.call(_a, file);
                }
            }
        });
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
// file: main.ts
// TypeScript 3.7 is required.
// Why do we need to use React and Vue.js? ;)
/// <reference path="utils.ts" />
/// <reference path="apidef.d.ts" />
/// <reference path="viewlib.ts" />
/// <reference path="user.ts" />
/// <reference path="tracklist.ts" />
/// <reference path="listindex.ts" />
/// <reference path="uploads.ts" />
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
                utils.toggleClass(this.container, 'show', state);
                if (!this.pinned && hideTimeout)
                    this.hideTimer.timeout(hideTimeout);
            }
            init() {
                var bar = this.container;
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
                    if (e.buttons == 1)
                        call(e);
                });
                this.progbar.addEventListener('mousemove', (e) => {
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
                this.currentActive = new ItemActiveHelper();
            }
            setActive(item) {
                this.currentActive.set(item);
            }
        };
        this.content = new class {
            constructor() {
                this.container = document.getElementById('content-outer');
            }
            removeCurrent() {
                const cur = this.current;
                if (!cur)
                    return;
                if (cur.onRemove)
                    cur.onRemove();
                if (cur.dom)
                    this.container.removeChild(cur.dom);
            }
            setCurrent(arg) {
                this.removeCurrent();
                if (arg.onShow)
                    arg.onShow();
                if (arg.dom)
                    this.container.appendChild(arg.dom);
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
        var ctx = new AudioContext();
        var analyzer = ctx.createAnalyser();
    }
    get isPlaying() { return this.audio.duration && !this.audio.paused; }
    get isPaused() { return this.audio.paused; }
    get canPlay() { return this.audio.readyState >= 2; }
    next() {
        var _a, _b, _c;
        var nextTrack = (_c = (_b = (_a = this.track) === null || _a === void 0 ? void 0 : _a._bind) === null || _b === void 0 ? void 0 : _b.list) === null || _c === void 0 ? void 0 : _c.getNextTrack(this.track);
        if (nextTrack)
            this.playTrack(nextTrack);
        else
            this.setTrack(null);
    }
    updateProgress() {
        ui.playerControl.setProg(this.audio.currentTime, this.audio.duration);
    }
    loadUrl(src) {
        this.audio.src = src;
    }
    setTrack(track) {
        this.track = track;
        ui.trackinfo.setTrack(track);
        this.onTrackChanged.invoke();
        this.loadUrl(track ? api.processUrl(track.url) : "");
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
    }
    get baseUrl() { return settings.apiBaseUrl; }
    _fetch(input, init) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.debugSleep)
                yield utils.sleepAsync(this.debugSleep * (Math.random() + 1));
            return yield fetch(input, init);
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
                body = JSON.stringify(body);
            else if (arg.mode === 'raw')
                void 0; // noop
            else
                throw new Error('Unknown arg.mode');
            var headers = this.getHeaders(arg);
            if (arg.mode === 'json')
                headers['Content-Type'] = 'application/json';
            var resp = yield this._fetch(this.baseUrl + arg.path, {
                body: body,
                method: (_a = arg.method, (_a !== null && _a !== void 0 ? _a : 'POST')),
                headers: headers
            });
            return yield resp.json();
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
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'))
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
ui.init();
var listIndex = new ListIndex();
listIndex.init();
user.init();
uploads.init();
