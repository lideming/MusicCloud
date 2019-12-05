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

    Timer = class {
        callback: () => void;
        cancelFunc: () => void;
        constructor(callback: () => void) {
            this.callback = callback;
        }
        timeout(time) {
            var handle = setTimeout(this.callback, time);
            this.cancelFunc = () => window.clearTimeout(handle);
        }
        interval(time) {
            var handle = setInterval(this.callback, time);
            this.cancelFunc = () => window.clearInterval(handle);
        }
        tryCancel() {
            if (this.cancelFunc) this.cancelFunc();
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
    buildDOM: (tree: BuildDomExpr, ctx?: BuildDOMCtx) => BuildDomReturn;

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
};


// Some interesting types:
type Action<T = void> = (arg: T) => void;
type Func<TRet> = () => TRet;
type AsyncFunc<T> = Func<Promise<T>>;


// BuildDOM types & implementation:
type BuildDomExpr = BuildDomTag | BuildDomNode | HTMLElement | Node;

type BuildDomTag = string;

type BuildDomReturn = HTMLElement | Text | Node;

interface BuildDomNode {
    tag?: BuildDomTag;
    child?: BuildDomExpr[] | BuildDomExpr;
    _ctx?: BuildDOMCtx;
    _key?:string;
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

    return function (obj: BuildDomExpr, ctx: BuildDOMCtx): BuildDomReturn {
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
