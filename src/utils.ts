// file: utils.ts

import { i18n, I } from "./I18n";

export { i18n, I };

const _object_assign = Object.assign;
const _object_hasOwnProperty = Object.prototype.hasOwnProperty;

/** The name "utils" tells it all. */
export var utils = new class Utils {

    // Time & formatting utils:

    strPadLeft(str: string, len: number, ch: string = ' ') {
        while (str.length < len) {
            str = ch + str;
        }
        return str;
    }

    formatTime(sec: number) {
        if (typeof sec !== 'number' || isNaN(sec)) return '--:--';
        var sec = Math.round(sec);
        var min = Math.floor(sec / 60);
        sec %= 60;
        return this.strPadLeft(min.toString(), 2, '0') + ':' + this.strPadLeft(sec.toString(), 2, '0');
    }

    fileSizeUnits = ['B', 'KB', 'MB', 'GB'];
    formatFileSize(size: number) {
        if (typeof size !== "number" || isNaN(size)) return 'NaN';
        var unit = 0;
        while (unit < this.fileSizeUnits.length - 1 && size >= 1024) {
            unit++;
            size /= 1024;
        }
        return size.toFixed(2) + ' ' + this.fileSizeUnits[unit];
    }

    formatDateTime(date: Date) {
        var now = new Date();
        var sameday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
        return sameday ? date.toLocaleTimeString() : date.toLocaleString();
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


    Timer: typeof Timer;

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

    /** Remove all children from the node */
    clearChildren(node: Node) {
        while (node.lastChild) node.removeChild(node.lastChild);
    }

    /** Remove all children from the node (if needed) and append one (if present) */
    replaceChild(node: Node, newChild?: Node) {
        this.clearChildren(node);
        if (newChild) node.appendChild(newChild);
    }

    /** Add or remove a classname for the element
     * @param force - true -> add; false -> remove; undefined -> toggle.
     */
    toggleClass(element: HTMLElement, clsName: string, force?: boolean) {
        var clsList = element.classList;
        if (clsList.toggle) return clsList.toggle(clsName, force);
        if (force === undefined) force = !clsList.contains(clsName);
        if (force) clsList.add(clsName);
        else clsList.remove(clsName);
        return force;
    }

    /** Fade out the element and remove it */
    fadeout(element: HTMLElement) {
        element.classList.add('fading-out');
        var cb: Action = null;
        var end = () => {
            if (!end) return; // use a random variable as flag ;)
            end = null;
            element.removeEventListener('transitionend', onTransitionend);
            element.classList.remove('fading-out');
            element.remove();
            cb && cb();
        };
        var onTransitionend = function (e: TransitionEvent) {
            if (e.eventPhase === Event.AT_TARGET) end();
        };
        element.addEventListener('transitionend', onTransitionend);
        setTimeout(end, 350); // failsafe
        return {
            get finished() { return !end; },
            onFinished(callback: Action) {
                if (!end) callback();
                else cb = callback;
            },
            cancel() { end?.(); }
        };
    }

    listenPointerEvents(element: HTMLElement, callback: (e: PtrEvent) => void | 'track') {
        element.addEventListener('mousedown', function (e) {
            if (callback({ type: 'mouse', ev: e, point: e, action: 'down' }) === 'track') {
                var mousemove = function (e: MouseEvent) {
                    callback({ type: 'mouse', ev: e, point: e, action: 'move' });
                };
                var mouseup = function (e: MouseEvent) {
                    document.removeEventListener('mousemove', mousemove, true);
                    document.removeEventListener('mouseup', mouseup, true);
                    callback({ type: 'mouse', ev: e, point: e, action: 'up' });
                };
                document.addEventListener('mousemove', mousemove, true);
                document.addEventListener('mouseup', mouseup, true);
            }
        });
        var touchDown = false;
        element.addEventListener('touchstart', function (e) {
            var ct = e.changedTouches[0];
            var ret = callback({
                type: 'touch', touch: 'start', ev: e, point: ct,
                action: touchDown ? 'move' : 'down'
            });
            if (!touchDown && ret === 'track') {
                touchDown = true;
                var touchmove = function (e: TouchEvent) {
                    var ct = e.changedTouches[0];
                    callback({ type: 'touch', touch: 'move', ev: e, point: ct, action: 'move' });
                };
                var touchend = function (e: TouchEvent) {
                    if (e.touches.length === 0) {
                        touchDown = false;
                        element.removeEventListener('touchmove', touchmove);
                        element.removeEventListener('touchend', touchend);
                    }
                    var ct = e.changedTouches[0];
                    callback({
                        type: 'touch', touch: 'end', ev: e, point: ct,
                        action: touchDown ? 'move' : 'up'
                    });
                };
                element.addEventListener('touchmove', touchmove);
                element.addEventListener('touchend', touchend);
            }
        });
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

    arrayInsert<T>(array: T[], val: T, pos?: number) {
        if (pos === undefined) array.push(val);
        else array.splice(pos, 0, val);
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

    arraySum<T>(arr: Iterable<T>, func: (item: T) => number) {
        var sum = 0;
        this.arrayForeach(arr, (x) => {
            var val = func(x);
            if (val) sum += val;
        });
        return sum;
    }

    objectApply<T>(obj: Partial<T>, kv?: Partial<T>, keys?: Array<keyof T>) {
        if (kv) {
            if (!keys) return _object_assign(obj, kv);
            for (const key in kv as any) {
                if (_object_hasOwnProperty.call(kv, key) && (!keys || keys.indexOf(key as any) >= 0)) {
                    const val = kv[key];
                    obj[key] = val;
                }
            }
        }
        return obj;
    }

    mod(a: number, b: number): number {
        if (a < 0) a = b + a;
        return a % b;
    }

    readBlobAsDataUrl(blob: Blob) {
        return new Promise<string>((resolve, reject) => {
            var reader = new FileReader();
            reader.onload = (ev) => {
                resolve(reader.result as string);
            };
            reader.onerror = (ev) => reject();
            reader.readAsDataURL(blob);
        });
    }
};

Array.prototype.remove = function (item) {
    utils.arrayRemove(this, item);
};

declare global {
    interface Array<T> {
        /**
         * (Extension method) remove the specified item from array.
         * @param item The item to be removed from array
         */
        remove(item: T): void;
    }
}

export class Timer {
    callback: () => void;
    cancelFunc: (() => void) | undefined;
    constructor(callback: () => void) {
        this.callback = callback;
        this.cancelFunc = undefined;
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
}
utils.Timer = Timer;

export type PtrEvent = ({
    type: 'mouse';
    ev: MouseEvent;
} | {
    type: 'touch';
    touch: 'start' | 'move' | 'end';
    ev: TouchEvent;
}) & {
    action: 'down' | 'move' | 'up';
    point: MouseEvent | Touch;
};


// Some interesting function types:
export type AnyFunc = (...args: any) => any;
export type Action<T = void> = (arg: T) => void;
export type Func<TRet> = () => TRet;
export type AsyncFunc<T> = Func<Promise<T>>;

export type FuncOrVal<T> = T | Func<T>;


// BuildDOM types & implementation:
export type BuildDomExpr = string | BuildDomNode | HTMLElement | Node | IDOM;

export interface IDOM {
    getDOM(): HTMLElement;
}

export type BuildDomTag = string;

export type BuildDomReturn = HTMLElement | Text | Node;

export interface BuildDomNode {
    tag?: BuildDomTag;
    child?: BuildDomExpr[] | BuildDomExpr;
    text?: FuncOrVal<string>;
    hidden?: FuncOrVal<boolean>;
    init?: Action<HTMLElement>;
    update?: Action<HTMLElement>;
    _ctx?: BuildDOMCtx | {};
    _key?: string;
    [key: string]: any;
}

export class BuildDOMCtx {
    dict: Record<string, HTMLElement>;
    actions: BuildDOMUpdateAction[];
    constructor(dict?: BuildDOMCtx['dict'] | {}) {
        this.dict = dict ?? {};
    }
    static EnsureCtx(ctxOrDict: BuildDOMCtx | {}, origctx: BuildDOMCtx): BuildDOMCtx {
        var ctx: BuildDOMCtx;
        if (ctxOrDict instanceof BuildDOMCtx) ctx = ctxOrDict;
        else ctx = new BuildDOMCtx(ctxOrDict);
        if (origctx) {
            if (!origctx.actions) origctx.actions = [];
            ctx.actions = origctx.actions;
        }
        return ctx;
    }
    setDict(key: string, node: HTMLElement) {
        if (!this.dict) this.dict = {};
        this.dict[key] = node;
    }
    addUpdateAction(action: BuildDOMUpdateAction) {
        if (!this.actions) this.actions = [];
        this.actions.push(action);
        // BuildDOMCtx.executeAction(action);
    }
    update() {
        if (!this.actions) return;
        for (const a of this.actions) {
            BuildDOMCtx.executeAction(a);
        }
    }
    static executeAction(a: BuildDOMUpdateAction) {
        switch (a[0]) {
            case 'text':
                a[1].textContent = a[2]();
                break;
            case 'hidden':
                a[1].hidden = a[2]();
                break;
            case 'update':
                a[2](a[1]);
                break;
            default:
                console.warn('unknown action', a);
                break;
        }
    }
}

type BuildDOMUpdateAction =
    ['text', Node, Func<string>]
    | ['hidden', HTMLElement, Func<boolean>]
    | ['update', HTMLElement, Action<HTMLElement>];

utils.buildDOM = (() => {
    var createElementFromTag = function (tag: BuildDomTag): HTMLElement {
        var reg = /[#\.^]?[\w\-]+/y;
        var match;
        var ele;
        while (match = reg.exec(tag)) {
            var val = match[0];
            var ch = val[0];
            if (ch === '.') {
                ele.classList.add(val.substr(1));
            } else if (ch === '#') {
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
        if (obj['getDOM']) return obj['getDOM']();
        var node = createElementFromTag((obj as BuildDomNode).tag);
        if (obj['_ctx']) ctx = BuildDOMCtx.EnsureCtx(obj['_ctx'], ctx);
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                var val = obj[key];
                if (key === 'child') {
                    if (val instanceof Array) {
                        val.forEach(function (x) {
                            node.appendChild(buildDomCore(x, ttl, ctx));
                        });
                    } else {
                        node.appendChild(buildDomCore(val, ttl, ctx));
                    }
                } else if (key === '_key') {
                    ctx.setDict(val, node);
                } else if (key === 'text') {
                    if (typeof val === 'function') {
                        ctx.addUpdateAction(['text', node, val]);
                    } else {
                        node.textContent = val;
                    }
                } else if (key === 'hidden' && typeof val === 'function') {
                    ctx.addUpdateAction(['hidden', node, val]);
                } else if (key === 'update' && typeof val === 'function') {
                    ctx.addUpdateAction(['update', node, val]);
                } else if (key === 'init') {
                    // no-op
                } else {
                    node[key] = val;
                }
            }
            const init = obj['init'];
            if (init) init(node);
        }

        return node;
    };

    return function (obj: BuildDomExpr, ctx: BuildDOMCtx): any {
        return buildDomCore(obj, 32, ctx);
    };
})();


export class SettingItem<T> {
    key: string;
    type: SiType<T>;
    data: T;
    isInitial: boolean;
    onRender: (obj: T) => void;
    constructor(key: string, type: 'bool' | 'str' | 'json' | SiType<T>, initial: T) {
        this.key = key;
        type = this.type = typeof type === 'string' ? SettingItem.types[type] : type;
        if (!type || !type.serialize || !type.deserialize) throw new Error("invalid 'type' arugment");
        this.readFromStorage(initial);
    }
    readFromStorage(initial: T) {
        var str = this.key ? localStorage.getItem(this.key) : null;
        this.isInitial = !str;
        this.set(str ? this.type.deserialize(str) : initial, true);
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
        this.isInitial = false;
        localStorage.setItem(this.key, this.type.serialize(this.data));
    }
    set(data: T, dontSave?: boolean) {
        this.data = data;
        this.isInitial = false;
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
        var oldIndex = arr.findIndex(function (x) { return x === curData; });
        var newData = arr[(oldIndex + 1) % arr.length];
        this.set(newData);
    };

    static types = {
        bool: {
            serialize: function (data) { return data ? 'true' : 'false'; },
            deserialize: function (str) { return str === 'true' ? true : str === 'false' ? false : undefined; }
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
}

interface SiType<T> {
    serialize: (obj: T) => string;
    deserialize: (str: string) => T;
}

export class Callbacks<T extends AnyFunc = Action> {
    list = [] as T[];
    invoke(...args: Parameters<T>) {
        this.list.forEach((x) => x.apply(this, args));
    }
    add(callback: T) {
        this.list.push(callback);
        return callback;
    }
    remove(callback: T) {
        this.list.remove(callback);
    }
}

export class Lazy<T> {
    private _func: Func<T>;
    private _value: T;
    get computed() { return !this._func; }
    get rawValue() { return this._value; }
    get value() {
        if (this._func) {
            this._value = this._func();
            this._func = undefined;
        }
        return this._value;
    }
    constructor(func: Func<T>) {
        if (typeof func != 'function') throw new Error('func is not a function');
        this._func = func;
        this._value = undefined;
    }
}

export class Semaphore {
    queue = new Array<Action>();
    maxCount = 1;
    runningCount = 0;
    constructor(init: Partial<Semaphore>) {
        utils.objectApply(this, init);
    }
    enter(): Promise<any> {
        if (this.runningCount === this.maxCount) {
            var resolve: Action;
            var prom = new Promise((res) => { resolve = res; });
            this.queue.push(resolve);
            return prom;
        } else {
            this.runningCount++;
            return Promise.resolve();
        }
    }
    exit() {
        if (this.runningCount === this.maxCount && this.queue.length) {
            if (window.queueMicrotask) {
                window.queueMicrotask(this.queue.shift() as any);
            } else {
                setTimeout(this.queue.shift(), 0);
            }
        } else {
            this.runningCount--;
        }
    }
    async run(func: () => Promise<any>) {
        await this.enter();
        try {
            await func();
        } finally {
            this.exit();
        }
    }
}

/** Just like CancellationToken[Source] on .NET */
export class CancelToken {
    cancelled = false;
    onCancelled = new Callbacks();
    cancel() {
        if (this.cancelled) return;
        this.cancelled = true;
        this.onCancelled.invoke();
    }
    throwIfCancelled() {
        if (this.cancelled)
            throw new Error("operation cancelled.");
    }
}

export interface IId {
    id: keyof any;
}

export class DataUpdatingHelper<T extends IId, TData extends IId = T> {
    items: Iterable<T>;
    update(newData: Iterable<TData>) {
        const oldData = this.items;
        var dataDict: Record<keyof any, TData> = {};
        for (const n of newData) {
            dataDict[this.dataSelectId(n)] = n;
        }
        var itemDict: Record<any, T> = {};
        var removed: T[] = [];
        for (const d of oldData) {
            const id = this.selectId(d);
            if (dataDict[id] !== undefined) {
                itemDict[id] = d;
            } else {
                removed.push(d);
            }
        }
        for (let i = removed.length - 1; i >= 0; i--)
            this.removeItem(removed[i]);
        var pos = 0;
        for (const n of newData) {
            const d = itemDict[this.dataSelectId(n)];
            if (d !== undefined) {
                this.updateItem(d, n);
            } else {
                this.addItem(n, pos);
            }
            pos++;
        }
    }
    protected selectId(obj: T): any { return obj.id; }
    protected dataSelectId(obj: TData): any { return obj.id; }
    addItem(obj: TData, pos: number) { }
    updateItem(old: T, data: TData) { }
    removeItem(obj: T) { }
}

export class EventRegistrations {
    list: { event: Callbacks; func: AnyFunc; }[] = [];
    add<T extends AnyFunc>(event: Callbacks<T>, func: T) {
        this.list.push({ event, func });
        event.add(func);
        return func;
    }
    removeAll() {
        while (this.list.length) {
            var r = this.list.pop();
            r.event.remove(r.func);
        }
    }
}