// file: utils.ts

/** The name "utils" tells it all. */
var utils = new class Utils {

    // Time & formatting utils:

    strPadLeft(str: string, len: number, ch: string = ' ') {
        while (str.length < len) {
            str = ch + str;
        }
        return str;
    }

    formatTime(sec: number) {
        if (isNaN(sec)) return '--:--';
        var sec = Math.floor(sec);
        var min = Math.floor(sec / 60);
        sec %= 60;
        return this.strPadLeft(min.toString(), 2, '0') + ':' + this.strPadLeft(sec.toString(), 2, '0');
    }

    numLimit(num: number, min: number, max: number) {
        return (num < min || typeof num != 'number' || isNaN(num)) ? min :
            (num > max) ? max : num;
    }

    createName(nameFunc: (num: number) => string, existsFunc: (str: string) => boolean) {
        for (let num = 0; ; num++) {
            let str = nameFunc(num);
            if (!existsFunc(str)) return str;
        }
    }

    /** 
     * btoa, but supports Unicode and uses UTF-8 encoding.
     * @see https://stackoverflow.com/questions/30106476
     */
    base64EncodeUtf8(str) {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
            function toSolidBytes(match, p1) {
                return String.fromCharCode(('0x' + p1) as any);
            }));
    }


    Timer = class {
        callback: () => void;
        cancelFunc: () => void;
        constructor(callback: () => void) {
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

    sleepAsync(time: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, time);
        });
    }

    /** 
     * Build a DOM tree from a JavaScript object.
     * @example utils.buildDOM({
            tag: 'div.item#firstitem',
            child: ['Name: ', { tag: 'span.name', textContent: name } ],
        })
     */
    buildDOM: <T extends BuildDomReturn = BuildDomReturn>(tree: BuildDomExpr, ctx?: BuildDOMCtx) => T;

    /** Remove all childs from the node */
    clearChilds(node: Node) {
        while (node.lastChild) node.removeChild(node.lastChild);
    }

    /** Remove all childs from the node (if needed) and append one (if present) */
    replaceChild(node: Node, newChild?: Node) {
        this.clearChilds(node);
        if (newChild) node.appendChild(newChild);
    }

    /** Add or remove a classname for the element
     * @param force - true -> add; false -> remove; undefined -> toggle.
     */
    toggleClass(element: HTMLElement, clsName: string, force?: boolean) {
        if (force === undefined) force = !element.classList.contains(clsName);
        if (force) element.classList.add(clsName);
        else element.classList.remove(clsName);
        return force;
    }

    /** Fade out the element and remove it */
    fadeout(element: HTMLElement) {
        element.classList.add('fading-out');
        var end = () => {
            if (!end) return; // use a random variable as flag ;)
            end = null;
            element.classList.remove('fading-out');
            element.remove();
        };
        element.addEventListener('transitionend', end);
        setTimeout(end, 350); // failsafe
    }

    addEvent<K extends keyof HTMLElementEventMap>(element: HTMLElement, event: K, handler: (ev: HTMLElementEventMap[K]) => any) {
        element.addEventListener(event, handler);
        return {
            remove: () => element.removeEventListener(event, handler)
        };
    }

    arrayRemove<T>(array: T[], val: T) {
        for (let i = 0; i < array.length; i++) {
            if (array[i] === val) {
                array.splice(i, 1);
                i--;
            }
        }
    }

    arrayMap<T, TRet>(arr: Iterable<T>, func: (item: T, idx: number) => TRet) {
        if (arr instanceof Array) return arr.map(func);
        var idx = 0;
        var ret = new Array<TRet>((arr as any).length);
        for (var item of arr) {
            ret[idx] = (func(item, idx));
            idx++;
        }
        return ret;
    }

    arrayForeach<T>(arr: Iterable<T>, func: (item: T, idx: number) => void) {
        var idx = 0;
        for (var item of arr) {
            func(item, idx++);
        }
    }

    arrayFind<T>(arr: Iterable<T>, func: (item: T, idx: number) => any): T {
        if (arr instanceof Array) return arr.find(func);
        var idx = 0;
        for (var item of arr) {
            if (func(item, idx++)) return item;
        }
    }

    objectApply<T>(obj: Partial<T>, kv: Partial<T>, keys?: Array<keyof T>) {
        for (const key in kv as any) {
            if (kv.hasOwnProperty(key) && (!keys || keys.indexOf(key as any) >= 0)) {
                const val = kv[key];
                obj[key] = val;
            }
        }
        return obj;
    }

    mod(a: number, b: number): number {
        if (a < 0) a = b + a;
        return a % b;
    }
};


// Some interesting types:
type Action<T = void> = (arg: T) => void;
type Func<TRet> = () => TRet;
type AsyncFunc<T> = Func<Promise<T>>;


// BuildDOM types & implementation:
type BuildDomExpr = string | BuildDomNode | HTMLElement | Node;

type BuildDomTag = string;

type BuildDomReturn = HTMLElement | Text | Node;

interface BuildDomNode {
    tag?: BuildDomTag;
    child?: BuildDomExpr[] | BuildDomExpr;
    _ctx?: BuildDOMCtx | {};
    _key?: string;
    [key: string]: any;
}

class BuildDOMCtx {
    [name: string]: HTMLElement;
}

utils.buildDOM = (() => {
    var createElementFromTag = function (tag: BuildDomTag): HTMLElement {
        var reg = /[#\.^]?[\w\-]+/y;
        var match;
        var ele;
        while (match = reg.exec(tag)) {
            var val = match[0];
            var ch = val[0];
            if (ch == '.') {
                ele.classList.add(val.substr(1));
            } else if (ch == '#') {
                ele.id = val.substr(1);
            } else {
                if (ele) throw new Error('unexpected multiple tags');
                ele = document.createElement(val);
            }
        }
        return ele;
    };

    var buildDomCore = function (obj: BuildDomExpr, ttl: number, ctx: BuildDOMCtx): BuildDomReturn {
        if (ttl-- < 0) throw new Error('ran out of TTL');
        if (typeof (obj) === 'string') { return document.createTextNode(obj); }
        if (Node && obj instanceof Node) return obj as Node;
        var node = createElementFromTag((obj as BuildDomNode).tag);
        if (obj['_ctx']) ctx = obj['_ctx'];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                var val = obj[key];
                if (key == 'child') {
                    if (val instanceof Array) {
                        val.forEach(function (x) {
                            node.appendChild(buildDomCore(x, ttl, ctx));
                        });
                    } else {
                        node.appendChild(buildDomCore(val, ttl, ctx));
                    }
                } else if (key === '_key') {
                    if (ctx) ctx[val] = node;
                } else {
                    node[key] = val;
                }
            }
        }

        return node;
    };

    return function (obj: BuildDomExpr, ctx: BuildDOMCtx): any {
        return buildDomCore(obj, 32, ctx);
    };
})();


class SettingItem<T> {
    key: string;
    type: SiType<T>;
    data: T;
    onRender: (obj: T) => void;
    constructor(key: string, type: string | SiType<T>, initial: T) {
        this.key = key;
        this.type = typeof type == 'string' ? SettingItem.types[type] : type;
        var str = key ? localStorage.getItem(key) : null;
        this.set(str ? this.type.deserilize(str) : initial, true);
    }
    render(fn: (obj: T) => void, dontRaiseNow?: boolean) {
        if (!dontRaiseNow) fn(this.data);
        var oldFn = this.onRender;
        var newFn = fn;
        if (oldFn) fn = function (x) { oldFn(x); newFn(x); };
        this.onRender = fn;
        return this;
    };
    bindToBtn(btn: HTMLElement, prefix: string[]) {
        if (this.type as any !== SettingItem.types.bool) throw new Error('only for bool type');
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
    };
    remove() {
        localStorage.removeItem(this.key);
    }
    save() {
        localStorage.setItem(this.key, this.type.serialize(this.data));
    }
    set(data: T, dontSave?: boolean) {
        this.data = data;
        this.onRender && this.onRender(data);
        if (!dontSave && this.key) this.save();
    };
    get() {
        return this.data;
    };
    toggle() {
        if (this.type as any !== SettingItem.types.bool) throw new Error('only for bool type');
        this.set((!(this.data as any)) as any);
    };
    loop(arr) {
        var curData = this.data;
        var oldIndex = arr.findIndex(function (x) { return x == curData; });
        var newData = arr[(oldIndex + 1) % arr.length];
        this.set(newData);
    };

    static types = {
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
}

interface SiType<T> {
    serialize: (obj: T) => string;
    deserilize: (str: string) => T;
}

class ItemActiveHelper<T extends ListViewItem> {
    funcSetActive = (item: T, val: boolean) => item.toggleClass('active', val);
    current: T;
    set(item: T) {
        if (this.current) this.funcSetActive(this.current, false);
        this.current = item;
        if (this.current) this.funcSetActive(this.current, true);
    }
}

class Callbacks<T extends CallableFunction> {
    list = [] as T[];
    invoke() {
        this.list.forEach((x) => x());
    }
    add(callback: T) {
        this.list.push(callback);
    }
    remove(callback: T) {
        utils.arrayRemove(this.list, callback);
    }
}

interface I18nData {
    [lang: string]: {
        [key: string]: string;
    };
}

/** Internationalization (aka i18n) helper class */
class I18n {
    data: I18nData = {};
    curLang = 'en';
    missing = new Map<string, 1>();
    /** Get i18n string for `key`, return `key` when not found. */
    get(key, arg?: any[]): string {
        return this.get2(key, arg) || key;
    }
    /** Get i18n string for `key`, return `null` when not found. */
    get2(key, arg?: any[], lang?: string): string {
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
    add2dArray(array: [...string[][]]) {
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
                    } else {
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
    static detectLanguage(langs: string[]) {
        var cur: string;
        var curIdx = -1;
        var languages = [];

        // ['en-US'] -> ['en-US', 'en']
        (navigator.languages || [navigator.language]).forEach(lang => {
            languages.push(lang);
            if (lang.indexOf('-') > 0) languages.push(lang.substr(0, lang.indexOf('-')));
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

function I(literals: TemplateStringsArray, ...placeholders: any[]) {
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
    ["Comments", "评论"],
    ["Remove", "移除"],
    ["Track ID", "歌曲 ID"],
    ["Name", "名称"],
    ["Artist", "艺术家"],
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