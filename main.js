// file: utils.ts
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
/** The name "utils" tells it all. */
var utils = new /** @class */ (function () {
    function Utils() {
        // Time & formatting utils:
        this.Timer = /** @class */ (function () {
            function class_1(callback) {
                this.callback = callback;
            }
            class_1.prototype.timeout = function (time) {
                var handle = setTimeout(this.callback, time);
                this.cancelFunc = function () { return window.clearTimeout(handle); };
            };
            class_1.prototype.interval = function (time) {
                var handle = setInterval(this.callback, time);
                this.cancelFunc = function () { return window.clearInterval(handle); };
            };
            class_1.prototype.tryCancel = function () {
                if (this.cancelFunc)
                    this.cancelFunc();
            };
            return class_1;
        }());
    }
    Utils.prototype.strPadLeft = function (str, len, ch) {
        if (ch === void 0) { ch = ' '; }
        while (str.length < len) {
            str = ch + str;
        }
        return str;
    };
    Utils.prototype.formatTime = function (sec) {
        if (isNaN(sec))
            return '--:--';
        var sec = Math.floor(sec);
        var min = Math.floor(sec / 60);
        sec %= 60;
        return this.strPadLeft(min.toString(), 2, '0') + ':' + this.strPadLeft(sec.toString(), 2, '0');
    };
    Utils.prototype.numLimit = function (num, min, max) {
        return (num < min || typeof num != 'number' || isNaN(num)) ? min :
            (num > max) ? max : num;
    };
    Utils.prototype.createName = function (nameFunc, existsFunc) {
        for (var num = 0;; num++) {
            var str = nameFunc(num);
            if (!existsFunc(str))
                return str;
        }
    };
    Utils.prototype.sleepAsync = function (time) {
        return new Promise(function (resolve) {
            setTimeout(resolve, time);
        });
    };
    /** Remove all childs from the node */
    Utils.prototype.clearChilds = function (node) {
        while (node.lastChild)
            node.removeChild(node.lastChild);
    };
    /** Remove all childs from the node (if needed) and append one (if present) */
    Utils.prototype.replaceChild = function (node, newChild) {
        this.clearChilds(node);
        if (newChild)
            node.appendChild(newChild);
    };
    /** Add or remove a classname for the element
     * @param force - true -> add; false -> remove; undefined -> toggle.
     */
    Utils.prototype.toggleClass = function (element, clsName, force) {
        if (force === undefined)
            force = !element.classList.contains(clsName);
        if (force)
            element.classList.add(clsName);
        else
            element.classList.remove(clsName);
    };
    Utils.prototype.arrayRemove = function (array, val) {
        for (var i = 0; i < array.length; i++) {
            if (array[i] === val) {
                array.splice(i, 1);
                i--;
            }
        }
    };
    Utils.prototype.arrayMap = function (arr, func) {
        var e_1, _a;
        if (arr instanceof Array)
            return arr.map(func);
        var idx = 0;
        var ret = new Array(arr.length);
        try {
            for (var arr_1 = __values(arr), arr_1_1 = arr_1.next(); !arr_1_1.done; arr_1_1 = arr_1.next()) {
                var item = arr_1_1.value;
                ret[idx] = (func(item, idx));
                idx++;
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (arr_1_1 && !arr_1_1.done && (_a = arr_1.return)) _a.call(arr_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return ret;
    };
    Utils.prototype.arrayForeach = function (arr, func) {
        var e_2, _a;
        var idx = 0;
        try {
            for (var arr_2 = __values(arr), arr_2_1 = arr_2.next(); !arr_2_1.done; arr_2_1 = arr_2.next()) {
                var item = arr_2_1.value;
                func(item, idx++);
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (arr_2_1 && !arr_2_1.done && (_a = arr_2.return)) _a.call(arr_2);
            }
            finally { if (e_2) throw e_2.error; }
        }
    };
    return Utils;
}());
utils.buildDOM = (function () {
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
    var buildDomCore = function (obj, ttl) {
        if (ttl-- < 0)
            throw new Error('ran out of TTL');
        if (typeof (obj) === 'string')
            return document.createTextNode(obj);
        if (Node && obj instanceof Node)
            return obj;
        var node = createElementFromTag(obj.tag);
        for (var key in obj) {
            if (key != 'tag' && obj.hasOwnProperty(key)) {
                var val = obj[key];
                if (key == 'child') {
                    if (val instanceof Array) {
                        val.forEach(function (x) {
                            node.appendChild(buildDomCore(x, ttl));
                        });
                    }
                    else {
                        node.appendChild(buildDomCore(val, ttl));
                    }
                }
                else {
                    node[key] = val;
                }
            }
        }
        return node;
    };
    return function (obj) {
        return buildDomCore(obj, 32);
    };
})();
var SettingItem = /** @class */ (function () {
    function SettingItem(key, type, initial) {
        this.key = key;
        this.type = typeof type == 'string' ? SettingItem.types[type] : type;
        var str = key ? localStorage.getItem(key) : null;
        this.set(str ? this.type.deserilize(str) : initial, true);
    }
    SettingItem.prototype.render = function (fn, dontRaiseNow) {
        if (!dontRaiseNow)
            fn(this.data);
        var oldFn = this.onRender;
        var newFn = fn;
        if (oldFn)
            fn = function (x) { oldFn(x); newFn(x); };
        this.onRender = fn;
        return this;
    };
    ;
    SettingItem.prototype.bindToBtn = function (btn, prefix) {
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
    };
    ;
    SettingItem.prototype.set = function (data, dontSave) {
        this.data = data;
        this.onRender && this.onRender(data);
        if (!dontSave && this.key)
            localStorage.setItem(this.key, this.type.serialize(data));
    };
    ;
    SettingItem.prototype.get = function () {
        return this.data;
    };
    ;
    SettingItem.prototype.toggle = function () {
        if (this.type !== SettingItem.types.bool)
            throw new Error('only for bool type');
        this.set((!this.data));
    };
    ;
    SettingItem.prototype.loop = function (arr) {
        var curData = this.data;
        var oldIndex = arr.findIndex(function (x) { return x == curData; });
        var newData = arr[(oldIndex + 1) % arr.length];
        this.set(newData);
    };
    ;
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
    return SettingItem;
}());
var ItemActiveHelper = /** @class */ (function () {
    function ItemActiveHelper() {
        this.funcSetActive = function (item, val) { return item.toggleClass('active', val); };
    }
    ItemActiveHelper.prototype.set = function (item) {
        if (this.current)
            this.funcSetActive(this.current, false);
        this.current = item;
        if (this.current)
            this.funcSetActive(this.current, true);
    };
    return ItemActiveHelper;
}());
var Callbacks = /** @class */ (function () {
    function Callbacks() {
        this.list = [];
    }
    Callbacks.prototype.invoke = function () {
        this.list.forEach(function (x) { return x(); });
    };
    Callbacks.prototype.add = function (callback) {
        this.list.push(callback);
    };
    Callbacks.prototype.remove = function (callback) {
        utils.arrayRemove(this.list, callback);
    };
    return Callbacks;
}());
// file: viewlib.ts
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var View = /** @class */ (function () {
    function View(dom) {
        if (dom)
            this._dom = utils.buildDOM(dom);
    }
    Object.defineProperty(View.prototype, "dom", {
        get: function () {
            this.ensureDom();
            return this._dom;
        },
        enumerable: true,
        configurable: true
    });
    View.prototype.ensureDom = function () {
        if (!this._dom) {
            this._dom = utils.buildDOM(this.createDom());
            this.postCreateDom(this._dom);
        }
    };
    View.prototype.createDom = function () {
        return document.createElement('div');
    };
    /** Will be called when the dom is created */
    View.prototype.postCreateDom = function (element) {
    };
    View.prototype.toggleClass = function (clsName, force) {
        utils.toggleClass(this.dom, clsName, force);
    };
    View.getDOM = function (view) {
        if (!view)
            throw new Error('view is undefined or null');
        if (view instanceof View)
            return view.dom;
        if (view instanceof HTMLElement)
            return view;
        console.error('getDOM(): unknown type: ', view);
        throw new Error('Cannot get DOM: unknown type');
    };
    return View;
}());
/** DragManager is used to help exchange infomation between views */
var dragManager = new /** @class */ (function () {
    function DragManager() {
    }
    Object.defineProperty(DragManager.prototype, "currentItem", {
        get: function () { return this._currentItem; },
        enumerable: true,
        configurable: true
    });
    ;
    DragManager.prototype.start = function (item) {
        this._currentItem = item;
    };
    DragManager.prototype.end = function (item) {
        this._currentItem = null;
    };
    return DragManager;
}());
var ListViewItem = /** @class */ (function (_super) {
    __extends(ListViewItem, _super);
    function ListViewItem() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Object.defineProperty(ListViewItem.prototype, "listview", {
        get: function () { return this._listView; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ListViewItem.prototype, "position", {
        get: function () { return this._position; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ListViewItem.prototype, "dragData", {
        get: function () { return this.dom.textContent; },
        enumerable: true,
        configurable: true
    });
    ListViewItem.prototype.postCreateDom = function (element) {
        var _this = this;
        _super.prototype.postCreateDom.call(this, element);
        this.dom.addEventListener('click', function () {
            var _a, _b, _c;
            (_c = (_a = _this._listView) === null || _a === void 0 ? void 0 : (_b = _a).onItemClicked) === null || _c === void 0 ? void 0 : _c.call(_b, _this);
        });
        this.dom.addEventListener('dragstart', function (ev) {
            var _a;
            if (!((_a = _this._listView) === null || _a === void 0 ? void 0 : _a.dragging))
                return;
            dragManager.start(_this);
            ev.dataTransfer.setData('text/plain', _this.dragData);
            _this.dom.style.opacity = '.5';
        });
        this.dom.addEventListener('dragend', function (ev) {
            dragManager.end(_this);
            ev.preventDefault();
            _this.dom.style.opacity = null;
        });
        this.dom.addEventListener('dragover', function (ev) {
            _this.dragHanlder(ev, false);
        });
        // https://stackoverflow.com/questions/7110353
        var enterctr = 0;
        this.dom.addEventListener('dragenter', function (ev) {
            if (!enterctr++)
                _this.toggleClass('dragover', true);
        });
        this.dom.addEventListener('dragleave', function (ev) {
            if (!--enterctr)
                _this.toggleClass('dragover', false);
        });
        this.dom.addEventListener('drop', function (ev) {
            _this.toggleClass('dragover', false);
            _this.dragHanlder(ev, true);
        });
    };
    ListViewItem.prototype.dragHanlder = function (ev, drop) {
        var item = dragManager.currentItem;
        if (item instanceof ListViewItem) {
            if (item.listview === this.listview) {
                ev.preventDefault();
                if (!drop) {
                    ev.dataTransfer.dropEffect = 'move';
                }
                else {
                    if (item === this)
                        return;
                    this.listview.move(item, this.position);
                }
            }
            else {
                if (this.listview.onDragover) {
                    var arg = {
                        source: item, target: this,
                        event: ev, drop: drop,
                        accept: false
                    };
                    this.listview.onDragover(arg);
                    if (drop || arg.accept)
                        ev.preventDefault();
                }
            }
        }
    };
    ;
    return ListViewItem;
}(View));
var ListView = /** @class */ (function (_super) {
    __extends(ListView, _super);
    function ListView(container) {
        var _this = _super.call(this, container) || this;
        _this.items = [];
        /**
         * Allow user to drag an item.
         */
        _this.dragging = false;
        /**
         * Allow user to drag an item and change its position.
         */
        _this.moveByDragging = false;
        return _this;
    }
    ListView.prototype.add = function (item, pos) {
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
            for (var i = pos; i < this.items.length; i++) {
                this.items[i]._position = i;
            }
        }
        if (this.dragging)
            item.dom.draggable = true;
    };
    ListView.prototype.remove = function (item) {
        item = this._ensureItem(item);
        item.dom.remove();
        this.items.splice(item._position, 1);
        var pos = item.position;
        item._listView = item._position = null;
        for (var i = pos; i < this.items.length; i++) {
            this.items[i]._position = i;
        }
    };
    ListView.prototype.move = function (item, newpos) {
        item = this._ensureItem(item);
        this.remove(item);
        this.add(item, newpos);
        this.onItemMoved(item, item.position);
    };
    ListView.prototype.clear = function () {
        utils.clearChilds(this.dom);
        this.items = [];
    };
    ListView.prototype[Symbol.iterator] = function () { return this.items[Symbol.iterator](); };
    Object.defineProperty(ListView.prototype, "length", {
        get: function () { return this.items.length; },
        enumerable: true,
        configurable: true
    });
    ListView.prototype.get = function (idx) {
        return this.items[idx];
    };
    ListView.prototype.map = function (func) { return utils.arrayMap(this, func); };
    ListView.prototype._ensureItem = function (item) {
        if (typeof item === 'number')
            item = this.get(item);
        else if (!item)
            throw new Error('item is null or undefined.');
        else if (item._listView !== this)
            throw new Error('the item is not in this listview.');
        return item;
    };
    ListView.prototype.ReplaceChild = function (dom) {
        this.clear();
        this.dom.appendChild(View.getDOM(dom));
    };
    return ListView;
}(View));
var Section = /** @class */ (function (_super) {
    __extends(Section, _super);
    function Section(arg) {
        var _this = _super.call(this) || this;
        _this.ensureDom();
        if (arg) {
            if (arg.title)
                _this.setTitle(arg.title);
            if (arg.content)
                _this.setContent(arg.content);
            if (arg.actions)
                arg.actions.forEach(function (x) { return _this.addAction(x); });
        }
        return _this;
    }
    Section.prototype.createDom = function () {
        return {
            tag: 'div.section',
            child: [
                {
                    tag: 'div.section-header',
                    child: [
                        this.titleDom = utils.buildDOM({ tag: 'span.section-title' })
                    ]
                }
                // content element(s) here
            ]
        };
    };
    Section.prototype.setTitle = function (text) {
        this.titleDom.textContent = text;
    };
    Section.prototype.setContent = function (view) {
        var dom = this.dom;
        var firstChild = dom.firstChild;
        while (dom.lastChild !== firstChild)
            dom.removeChild(dom.lastChild);
        dom.appendChild(View.getDOM(view));
    };
    Section.prototype.addAction = function (arg) {
        this.titleDom.parentElement.appendChild(utils.buildDOM({
            tag: 'div.section-action.clickable',
            textContent: arg.text,
            onclick: arg.onclick
        }));
    };
    return Section;
}(View));
var LoadingIndicator = /** @class */ (function (_super) {
    __extends(LoadingIndicator, _super);
    function LoadingIndicator(arg) {
        var _this = _super.call(this) || this;
        _this._status = 'running';
        _this.reset();
        if (arg) {
            if (arg.status)
                _this.state = arg.status;
            if (arg.content)
                _this.content = arg.content;
            if (arg.onclick)
                _this.onclick = arg.onclick;
        }
        return _this;
    }
    Object.defineProperty(LoadingIndicator.prototype, "state", {
        get: function () { return this._status; },
        set: function (val) {
            this._status = val;
            this.toggleClass('running', val == 'running');
            this.toggleClass('error', val == 'error');
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(LoadingIndicator.prototype, "content", {
        get: function () { return this._text; },
        set: function (val) { this._text = val; this.dom.firstChild.firstChild.textContent = val; },
        enumerable: true,
        configurable: true
    });
    LoadingIndicator.prototype.reset = function () {
        this.state = 'running';
        this.content = 'Loading';
        this.onclick = null;
    };
    LoadingIndicator.prototype.error = function (err, retry) {
        this.state = 'error';
        this.content = 'Oh no! Something just goes wrong:\n' + err;
        if (retry) {
            this.content += '\n[Click here to retry]';
        }
        this.onclick = retry;
    };
    LoadingIndicator.prototype.createDom = function () {
        var _this = this;
        this._dom = utils.buildDOM({
            tag: 'div.loading-indicator',
            child: [{
                    tag: 'div.loading-indicator-inner',
                    child: [{
                            tag: 'div.loading-indicator-text'
                        }]
                }],
            onclick: function (e) { return _this.onclick && _this.onclick(e); }
        });
        return this._dom;
    };
    return LoadingIndicator;
}(View));
// TODO: class ContextMenu
// file: main.ts
// TypeScript 3.7 is required.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
// Why do we need to use React and Vue.js? ;)
/// <reference path="utils.ts" />
/// <reference path="apidef.d.ts" />
/// <reference path="viewlib.ts" />
var settings = {
    apiBaseUrl: 'api/',
    debug: true,
    apiDebugDelay: 300,
};
/** 常驻 UI 元素操作 */
var ui = new /** @class */ (function () {
    function class_2() {
        this.bottomBar = new /** @class */ (function () {
            function class_3() {
                this.container = document.getElementById("bottombar");
                this.btnPin = document.getElementById('btnPin');
                this.pinned = true;
            }
            class_3.prototype.setPinned = function (val) {
                val = (val !== null && val !== void 0 ? val : !this.pinned);
                this.pinned = val;
                utils.toggleClass(document.body, 'bottompinned', val);
                this.btnPin.textContent = val ? 'Unpin' : 'Pin';
                if (val)
                    this.toggle(true);
            };
            class_3.prototype.toggle = function (state) {
                utils.toggleClass(this.container, 'show', state);
            };
            class_3.prototype.init = function () {
                var _this = this;
                var bar = this.container;
                var hideTimer = new utils.Timer(function () {
                    _this.toggle(false);
                });
                bar.addEventListener('mouseenter', function () {
                    hideTimer.tryCancel();
                    _this.toggle(true);
                });
                bar.addEventListener('mouseleave', function () {
                    hideTimer.tryCancel();
                    if (!_this.pinned)
                        hideTimer.timeout(200);
                });
                this.siPin = new SettingItem('mcloud-bottompin', 'bool', false)
                    .render(function (x) { return _this.setPinned(x); })
                    .bindToBtn(this.btnPin, ['', '']);
                // this.btnPin.addEventListener('click', () => this.setPinned());
            };
            return class_3;
        }());
        this.playerControl = new /** @class */ (function () {
            function class_4() {
                this.progbar = document.getElementById('progressbar');
                this.fill = document.getElementById('progressbar-fill');
                this.labelCur = document.getElementById('progressbar-label-cur');
                this.labelTotal = document.getElementById('progressbar-label-total');
            }
            class_4.prototype.setProg = function (cur, total) {
                var prog = cur / total;
                prog = utils.numLimit(prog, 0, 1);
                this.fill.style.width = (prog * 100) + '%';
                this.labelCur.textContent = utils.formatTime(cur);
                this.labelTotal.textContent = utils.formatTime(total);
            };
            class_4.prototype.setProgressChangedCallback = function (cb) {
                var _this = this;
                var call = function (e) { cb(utils.numLimit(e.offsetX / _this.progbar.clientWidth, 0, 1)); };
                this.progbar.addEventListener('mousedown', function (e) {
                    if (e.buttons == 1)
                        call(e);
                });
                this.progbar.addEventListener('mousemove', function (e) {
                    if (e.buttons == 1)
                        call(e);
                });
            };
            return class_4;
        }());
        this.trackinfo = new /** @class */ (function () {
            function class_5() {
                this.element = document.getElementById('bottombar-trackinfo');
            }
            class_5.prototype.setTrack = function (track) {
                if (track) {
                    utils.replaceChild(this.element, utils.buildDOM({
                        tag: 'span',
                        child: [
                            // 'Now Playing: ',
                            { tag: 'span.name', textContent: track.name },
                            { tag: 'span.artist', textContent: track.artist },
                        ]
                    }));
                }
                else {
                    this.element.textContent = "";
                }
            };
            return class_5;
        }());
        this.sidebarList = new /** @class */ (function () {
            function class_6() {
                this.container = document.getElementById('sidebar-list');
                this.currentActive = new ItemActiveHelper();
            }
            class_6.prototype.setActive = function (item) {
                this.currentActive.set(item);
            };
            return class_6;
        }());
        this.content = new /** @class */ (function () {
            function class_7() {
                this.container = document.getElementById('content-outer');
            }
            class_7.prototype.removeCurrent = function () {
                var cur = this.current;
                if (!cur)
                    return;
                if (cur.onRemove)
                    cur.onRemove();
                if (cur.dom)
                    this.container.removeChild(cur.dom);
            };
            class_7.prototype.setCurrent = function (arg) {
                this.removeCurrent();
                if (arg.onShow)
                    arg.onShow();
                this.container.appendChild(arg.dom);
                this.current = arg;
            };
            return class_7;
        }());
    }
    return class_2;
}()); // ui
ui.bottomBar.init();
/** 播放器核心：控制播放逻辑 */
var playerCore = new /** @class */ (function () {
    function PlayerCore() {
        var _this = this;
        this.onTrackChanged = new Callbacks();
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', function () { return _this.updateProgress(); });
        this.audio.addEventListener('canplay', function () { return _this.updateProgress(); });
        this.audio.addEventListener('error', function (e) {
            console.log(e);
        });
        this.audio.addEventListener('ended', function () {
            _this.next();
        });
        ui.playerControl.setProgressChangedCallback(function (x) {
            _this.audio.currentTime = x * _this.audio.duration;
        });
        var ctx = new AudioContext();
        var analyzer = ctx.createAnalyser();
    }
    Object.defineProperty(PlayerCore.prototype, "isPlaying", {
        get: function () { return this.audio.duration && !this.audio.paused; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PlayerCore.prototype, "isPaused", {
        get: function () { return this.audio.paused; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PlayerCore.prototype, "canPlay", {
        get: function () { return this.audio.readyState >= 2; },
        enumerable: true,
        configurable: true
    });
    PlayerCore.prototype.next = function () {
        var _a, _b, _c;
        var nextTrack = (_c = (_b = (_a = this.track) === null || _a === void 0 ? void 0 : _a._bind) === null || _b === void 0 ? void 0 : _b.list) === null || _c === void 0 ? void 0 : _c.getNextTrack(this.track);
        if (nextTrack)
            this.playTrack(nextTrack);
        else
            this.setTrack(null);
    };
    PlayerCore.prototype.updateProgress = function () {
        ui.playerControl.setProg(this.audio.currentTime, this.audio.duration);
    };
    PlayerCore.prototype.loadUrl = function (src) {
        this.audio.src = src;
    };
    PlayerCore.prototype.setTrack = function (track) {
        this.track = track;
        ui.trackinfo.setTrack(track);
        this.onTrackChanged.invoke();
        this.loadUrl(track ? track.url : "");
    };
    PlayerCore.prototype.playTrack = function (track) {
        if (track === this.track)
            return;
        this.setTrack(track);
        this.play();
    };
    PlayerCore.prototype.play = function () {
        this.audio.play();
    };
    PlayerCore.prototype.pause = function () {
        this.audio.pause();
    };
    return PlayerCore;
}());
/** API 操作 */
var api = new /** @class */ (function () {
    function class_8() {
        this.debugSleep = settings.debug ? settings.apiDebugDelay : 0;
    }
    Object.defineProperty(class_8.prototype, "baseUrl", {
        get: function () { return settings.apiBaseUrl; },
        enumerable: true,
        configurable: true
    });
    class_8.prototype._fetch = function (input, init) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.debugSleep) return [3 /*break*/, 2];
                        return [4 /*yield*/, utils.sleepAsync(this.debugSleep * (Math.random() + 1))];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, fetch(input, init)];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    class_8.prototype.getJson = function (path, options) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var resp;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        options = options || {};
                        return [4 /*yield*/, this._fetch(this.baseUrl + path)];
                    case 1:
                        resp = _b.sent();
                        if (options.status !== false && resp.status != (_a = options.status, (_a !== null && _a !== void 0 ? _a : 200)))
                            throw new Error('HTTP status ' + resp.status);
                        return [4 /*yield*/, resp.json()];
                    case 2: return [2 /*return*/, _b.sent()];
                }
            });
        });
    };
    class_8.prototype.postJson = function (arg) {
        return __awaiter(this, void 0, void 0, function () {
            var resp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._fetch(this.baseUrl + arg.path, {
                            body: JSON.stringify(arg.method),
                            method: arg.method
                        })];
                    case 1:
                        resp = _a.sent();
                        return [4 /*yield*/, resp.json()];
                    case 2: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    class_8.prototype.getListAsync = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getJson('lists/' + id)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    class_8.prototype.getListIndexAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getJson('lists/index')];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    class_8.prototype.putListAsync = function (list, creating) {
        if (creating === void 0) { creating = false; }
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.postJson({
                            path: 'lists/' + list.id,
                            method: creating ? 'POST' : 'PUT',
                            obj: list,
                        })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    return class_8;
}());
var trackStore = new /** @class */ (function () {
    function TrackStore() {
    }
    return TrackStore;
}());
var TrackList = /** @class */ (function () {
    function TrackList() {
        this.tracks = [];
        this.curActive = new ItemActiveHelper();
    }
    TrackList.prototype.loadInfo = function (info) {
        this.id = info.id;
        this.apiid = this.id > 0 ? this.id : 0;
        this.name = info.name;
    };
    TrackList.prototype.loadFromGetResult = function (obj) {
        var e_3, _a;
        this.loadInfo(obj);
        try {
            for (var _b = __values(obj.tracks), _c = _b.next(); !_c.done; _c = _b.next()) {
                var t = _c.value;
                this.addTrack(t);
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_3) throw e_3.error; }
        }
        return this;
    };
    TrackList.prototype.addTrack = function (t) {
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
    };
    TrackList.prototype.loadEmpty = function () {
        return this.fetching = Promise.resolve();
    };
    TrackList.prototype.loadFromApi = function (arg) {
        var _a;
        return this.fetching = (_a = this.fetching, (_a !== null && _a !== void 0 ? _a : this.fetchForce(arg)));
    };
    TrackList.prototype.fetchForce = function (arg) {
        return __awaiter(this, void 0, void 0, function () {
            var func, obj, err_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (arg === undefined)
                            arg = this.apiid;
                        if (typeof arg == 'number')
                            func = function () { return api.getListAsync(arg); };
                        else
                            func = arg;
                        this.loadIndicator = new LoadingIndicator();
                        this.updateView();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, func()];
                    case 2:
                        obj = _a.sent();
                        this.loadFromGetResult(obj);
                        this.loadIndicator = null;
                        return [3 /*break*/, 4];
                    case 3:
                        err_1 = _a.sent();
                        this.loadIndicator.error(err_1, function () { return _this.fetchForce(arg); });
                        throw err_1;
                    case 4:
                        this.updateView();
                        return [2 /*return*/];
                }
            });
        });
    };
    TrackList.prototype.createView = function () {
        var _this = this;
        if (!this.contentView) {
            var cb_1 = function () { return _this.trackChanged(); };
            this.contentView = {
                dom: utils.buildDOM({ tag: 'div.tracklist' }),
                onShow: function () {
                    var lv = _this.listView = _this.listView || new ListView(_this.contentView.dom);
                    lv.dragging = true;
                    lv.moveByDragging = true;
                    lv.onItemMoved = function (item, from) {
                        _this.tracks = _this.listView.map(function (lvi) {
                            lvi.track._bind.position = lvi.position;
                            lvi.updatePos();
                            return lvi.track;
                        });
                    };
                    _this.contentView.dom = lv.dom;
                    playerCore.onTrackChanged.add(cb_1);
                    _this.updateView();
                },
                onRemove: function () {
                    playerCore.onTrackChanged.remove(cb_1);
                    _this.listView = null;
                }
            };
            // this.updateView();
        }
        return this.contentView;
    };
    TrackList.prototype.getNextTrack = function (track) {
        var _a, _b;
        if (((_a = track._bind) === null || _a === void 0 ? void 0 : _a.list) === this) {
            return _b = this.tracks[track._bind.position + 1], (_b !== null && _b !== void 0 ? _b : null);
        }
        return null;
    };
    TrackList.prototype.trackChanged = function () {
        var _a;
        var track = playerCore.track;
        var item = (((_a = track) === null || _a === void 0 ? void 0 : _a._bind.list) === this) ? this.listView.get(track._bind.position) : null;
        this.curActive.set(item);
    };
    TrackList.prototype.updateView = function () {
        var e_4, _a;
        var listView = this.listView;
        if (!listView)
            return;
        if (this.loadIndicator) {
            listView.ReplaceChild(this.loadIndicator);
            return;
        }
        if (this.tracks.length === 0) {
            listView.ReplaceChild(new LoadingIndicator({ status: 'normal', content: '(Empty)' }));
            return;
        }
        // Well... currently, we just rebuild the DOM.
        listView.clear();
        var playing = playerCore.track;
        try {
            for (var _b = __values(this.tracks), _c = _b.next(); !_c.done; _c = _b.next()) {
                var t = _c.value;
                var item = new TrackViewItem(t);
                if (playing
                    && ((playing._bind.list !== this && t.id === playing.id)
                        || playing._bind.list === this && playing._bind.position === t._bind.position))
                    this.curActive.set(item);
                listView.add(item);
            }
        }
        catch (e_4_1) { e_4 = { error: e_4_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_4) throw e_4.error; }
        }
    };
    return TrackList;
}());
var TrackViewItem = /** @class */ (function (_super) {
    __extends(TrackViewItem, _super);
    function TrackViewItem(item) {
        var _this = _super.call(this) || this;
        _this.track = item;
        return _this;
    }
    Object.defineProperty(TrackViewItem.prototype, "dragData", {
        get: function () { return this.track.name + " - " + this.track.artist; },
        enumerable: true,
        configurable: true
    });
    TrackViewItem.prototype.createDom = function () {
        var track = this.track;
        return {
            tag: 'div.item.trackitem.no-selection',
            child: [
                { tag: 'span.pos', textContent: (track._bind.position + 1).toString() },
                { tag: 'span.name', textContent: track.name },
                { tag: 'span.artist', textContent: track.artist },
            ],
            onclick: function () { playerCore.playTrack(track); },
            draggable: true,
            _item: this
        };
    };
    TrackViewItem.prototype.updatePos = function () {
        this.dom.querySelector('.pos').textContent = (this.track._bind.position + 1).toString();
    };
    return TrackViewItem;
}(ListViewItem));
var ListIndex = /** @class */ (function () {
    function ListIndex() {
        var _this = this;
        this.lists = [];
        this.loadedList = {};
        this.loadIndicator = new LoadingIndicator();
        this.nextId = -100;
        this.listView = new ListView();
        this.listView.dragging = true;
        this.listView.moveByDragging = true;
        this.listView.onItemMoved = function (item, from) {
            _this.lists = _this.listView.map(function (x) { return x.listInfo; });
        };
        this.listView.onDragover = function (arg) {
            var src = arg.source;
            if (src instanceof TrackViewItem) {
                arg.accept = true;
                arg.event.dataTransfer.dropEffect = 'copy';
                if (arg.drop) {
                    var listinfo = arg.target.listInfo;
                    var list = _this.getList(listinfo.id);
                    if (list.fetching)
                        list.fetching.then(function (r) {
                            list.addTrack(src.track);
                        }).catch(function (err) {
                            console.error('error adding track:', err);
                        });
                }
            }
        };
        this.listView.onItemClicked = function (item) {
            if (ui.sidebarList.currentActive.current === item)
                return;
            ui.sidebarList.setActive(item);
            _this.showTracklist(item.listInfo.id);
        };
        this.section = new Section({
            title: 'Playlists',
            content: this.listView,
            actions: [{
                    text: '➕',
                    onclick: function () {
                        _this.newTracklist();
                    }
                }]
        });
    }
    ListIndex.prototype.init = function () {
        ui.sidebarList.container.appendChild(this.section.dom);
        listIndex.fetch();
    };
    /** Fetch lists from API and update the view */
    ListIndex.prototype.fetch = function () {
        return __awaiter(this, void 0, void 0, function () {
            var index, _a, _b, item, err_2;
            var e_5, _c;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        this.loadIndicator.reset();
                        this.listView.ReplaceChild(this.loadIndicator.dom);
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, api.getListIndexAsync()];
                    case 2:
                        index = _d.sent();
                        this.listView.clear();
                        try {
                            for (_a = __values(index.lists), _b = _a.next(); !_b.done; _b = _a.next()) {
                                item = _b.value;
                                this.addListInfo(item);
                            }
                        }
                        catch (e_5_1) { e_5 = { error: e_5_1 }; }
                        finally {
                            try {
                                if (_b && !_b.done && (_c = _a.return)) _c.call(_a);
                            }
                            finally { if (e_5) throw e_5.error; }
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        err_2 = _d.sent();
                        this.loadIndicator.error(err_2, function () { return _this.fetch(); });
                        return [3 /*break*/, 4];
                    case 4:
                        if (this.lists.length > 0)
                            this.listView.onItemClicked(this.listView.get(0));
                        return [2 /*return*/];
                }
            });
        });
    };
    ListIndex.prototype.addListInfo = function (listinfo) {
        this.lists.push(listinfo);
        this.listView.add(new ListIndexViewItem(this, listinfo));
    };
    ListIndex.prototype.getListInfo = function (id) {
        var e_6, _a;
        try {
            for (var _b = __values(this.lists), _c = _b.next(); !_c.done; _c = _b.next()) {
                var l = _c.value;
                if (l.id === id)
                    return l;
            }
        }
        catch (e_6_1) { e_6 = { error: e_6_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_6) throw e_6.error; }
        }
    };
    ListIndex.prototype.getList = function (id) {
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
    };
    ListIndex.prototype.showTracklist = function (id) {
        var list = this.getList(id);
        ui.content.setCurrent(list.createView());
    };
    /**
     * Create a Tracklist with an temporary local ID (negative number).
     * It should be sync to server and get a real ID later.
     */
    ListIndex.prototype.newTracklist = function () {
        var _this = this;
        var id = this.nextId--;
        var list = {
            id: id,
            name: utils.createName(function (x) { return x ? "New Playlist (" + (x + 1) + ")" : 'New Playlist'; }, function (x) { return !!_this.lists.find(function (l) { return l.name == x; }); })
        };
        this.addListInfo(list);
    };
    return ListIndex;
}());
var ListIndexViewItem = /** @class */ (function (_super) {
    __extends(ListIndexViewItem, _super);
    function ListIndexViewItem(index, listInfo) {
        var _this = _super.call(this) || this;
        _this.index = index;
        _this.listInfo = listInfo;
        return _this;
    }
    ListIndexViewItem.prototype.createDom = function () {
        return {
            tag: 'div.item.no-selection',
            textContent: this.listInfo.name,
        };
    };
    return ListIndexViewItem;
}(ListViewItem));
document.addEventListener('drop', function (ev) {
    ev.preventDefault();
});
var listIndex = new ListIndex();
listIndex.init();
var userState = new /** @class */ (function () {
    function UserState() {
    }
    return UserState;
}());
//# sourceMappingURL=main.js.map