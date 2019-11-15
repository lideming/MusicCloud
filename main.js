var utils = new /** @class */ (function () {
    function class_1() {
        this.Timer = /** @class */ (function () {
            function class_2(callback) {
                this.callback = callback;
            }
            class_2.prototype.timeout = function (time) {
                var handle = setTimeout(this.callback, time);
                this.cancelFunc = function () { return window.clearTimeout(handle); };
            };
            class_2.prototype.interval = function (time) {
                var handle = setInterval(this.callback, time);
                this.cancelFunc = function () { return window.clearInterval(handle); };
            };
            class_2.prototype.tryCancel = function () {
                if (this.cancelFunc)
                    this.cancelFunc();
            };
            return class_2;
        }());
    }
    class_1.prototype.toggleClass = function (element, clsName, force) {
        if (force === undefined)
            force = !element.classList.contains(clsName);
        if (force)
            element.classList.add(clsName);
        else
            element.classList.remove(clsName);
    };
    class_1.prototype.strPaddingLeft = function (str, len, ch) {
        if (ch === void 0) { ch = ' '; }
        while (str.length < len) {
            str = ch + str;
        }
        return str;
    };
    class_1.prototype.formatTime = function (sec) {
        if (isNaN(sec))
            return '--:--';
        var sec = Math.floor(sec);
        var min = Math.floor(sec / 60);
        sec %= 60;
        return this.strPaddingLeft(min.toString(), 2, '0') + ':' + this.strPaddingLeft(sec.toString(), 2, '0');
    };
    class_1.prototype.numLimit = function (num, min, max) {
        return (num < min || typeof num != 'number' || isNaN(num)) ? min :
            (num > max) ? max : num;
    };
    class_1.prototype.clearChilds = function (node) {
        while (node.lastChild)
            node.removeChild(node.lastChild);
    };
    class_1.prototype.replaceChild = function (node, newChild) {
        this.clearChilds(node);
        if (newChild)
            node.appendChild(newChild);
    };
    return class_1;
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
/// <reference path="utils.ts" />
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
var ui = {
    bottomBar: new /** @class */ (function () {
        function class_3() {
            this.container = document.getElementById("bottombar");
            this.autoHide = true;
        }
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
                if (_this.autoHide)
                    hideTimer.timeout(200);
            });
        };
        return class_3;
    }()),
    progressBar: new /** @class */ (function () {
        function class_4() {
            this.container = document.getElementById('progressbar');
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
            var call = function (e) { cb(utils.numLimit(e.offsetX / _this.container.clientWidth, 0, 1)); };
            this.container.addEventListener('mousedown', function (e) {
                if (e.buttons == 1)
                    call(e);
            });
            this.container.addEventListener('mousemove', function (e) {
                if (e.buttons == 1)
                    call(e);
            });
        };
        return class_4;
    }()),
    trackinfo: new /** @class */ (function () {
        function class_5() {
            this.element = document.getElementById('bottombar-trackinfo');
        }
        class_5.prototype.setTrack = function (track) {
            if (track) {
                utils.replaceChild(this.element, utils.buildDOM({
                    tag: 'span',
                    child: [
                        'Now Playing: ',
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
    }()),
    content: new /** @class */ (function () {
        function class_6() {
            this.container = document.getElementById('content-outer');
        }
        class_6.prototype.removeCurrent = function () {
            var cur = this.current;
            if (!cur)
                return;
            if (cur.onRemove)
                cur.onRemove();
            if (cur.element)
                this.container.removeChild(cur.element);
        };
        class_6.prototype.setContent = function (arg) {
            this.removeCurrent();
            this.container.appendChild(arg.element);
            if (arg.onShow)
                arg.onShow();
            this.current = arg;
        };
        return class_6;
    }())
};
ui.bottomBar.init();
var PlayerCore = /** @class */ (function () {
    function PlayerCore() {
        var _this = this;
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', function () { return _this.updateProgress(); });
        this.audio.addEventListener('canplay', function () { return _this.updateProgress(); });
        this.audio.addEventListener('error', function (e) {
            console.log(e);
        });
        this.audio.addEventListener('ended', function () {
            _this.next();
        });
        ui.progressBar.setProgressChangedCallback(function (x) {
            _this.audio.currentTime = x * _this.audio.duration;
        });
        var ctx = new AudioContext();
        var analyzer = ctx.createAnalyser();
    }
    PlayerCore.prototype.next = function () {
        if (this.track._bind && this.track._bind.next)
            this.playTrack(this.track._bind.next);
        else
            this.setTrack(null);
    };
    PlayerCore.prototype.updateProgress = function () {
        ui.progressBar.setProg(this.audio.currentTime, this.audio.duration);
    };
    PlayerCore.prototype.loadUrl = function (src) {
        this.audio.src = src;
    };
    PlayerCore.prototype.setTrack = function (track) {
        this.track = track;
        ui.trackinfo.setTrack(track);
        if (this.onTrackChanged)
            this.onTrackChanged();
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
var playerCore = new PlayerCore();
var api = new /** @class */ (function () {
    function class_7() {
        this.baseUrl = 'api/';
    }
    class_7.prototype.getJson = function (path) {
        return __awaiter(this, void 0, void 0, function () {
            var resp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fetch(this.baseUrl + path)];
                    case 1:
                        resp = _a.sent();
                        return [4 /*yield*/, resp.json()];
                    case 2: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    class_7.prototype.getListAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, new TrackList().fetch('list')];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return class_7;
}());
var TrackList = /** @class */ (function () {
    function TrackList() {
    }
    TrackList.prototype.loadFromObj = function (obj) {
        this.name = obj.name;
        this.tracks = obj.tracks;
        var i = 0;
        var lastItem;
        for (var _i = 0, _a = this.tracks; _i < _a.length; _i++) {
            var item = _a[_i];
            item._bind = { location: i++, list: this };
            if (lastItem)
                lastItem._bind.next = item;
            lastItem = item;
        }
        return this;
    };
    TrackList.prototype.fetch = function (path) {
        var _this = this;
        return this.fetching = (function () { return __awaiter(_this, void 0, void 0, function () {
            var obj;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, api.getJson(path)];
                    case 1:
                        obj = _a.sent();
                        this.loadFromObj(obj);
                        if (this.contentView)
                            this.renderCore();
                        return [2 /*return*/];
                }
            });
        }); })();
    };
    TrackList.prototype.render = function (forceRerender) {
        var _this = this;
        if (!this.contentView || forceRerender) {
            if (!this.contentView) {
                this.contentView = {
                    element: utils.buildDOM({ tag: 'div.tracklist' }),
                    onShow: function () {
                        playerCore.onTrackChanged = function () { return _this.trackChanged(); };
                    },
                    onRemove: function () { }
                };
            }
            this.renderCore();
        }
        return this.contentView;
    };
    TrackList.prototype.getViewItem = function (pos) {
        return this.viewItems ? this.viewItems[pos] : null;
    };
    TrackList.prototype.trackChanged = function () {
        var track = playerCore.track;
        if (this.curActive)
            this.curActive.setActive(false);
        this.curActive = null;
        if (!track || track._bind.list !== this)
            return;
        var item = this.getViewItem(track._bind.location);
        item.setActive(true);
        this.curActive = item;
    };
    TrackList.prototype.renderCore = function () {
        var box = this.contentView.element;
        if (this.tracks) {
            utils.clearChilds(box);
            this.viewItems = [];
            for (var _i = 0, _a = this.tracks; _i < _a.length; _i++) {
                var t = _a[_i];
                var item = new TrackViewItem(t);
                this.viewItems.push(item);
                box.appendChild(item.dom);
            }
        }
        else {
            box.textContent = "Loading...";
        }
        return box;
    };
    return TrackList;
}());
var TrackViewItem = /** @class */ (function () {
    function TrackViewItem(item) {
        this.track = item;
        this.dom = utils.buildDOM({
            tag: 'div.item.trackitem',
            child: [
                { tag: 'span.name', textContent: item.name },
                { tag: 'span.artist', textContent: item.artist },
            ],
            onclick: function () {
                playerCore.playTrack(item);
            },
            _item: this
        });
    }
    TrackViewItem.prototype.setActive = function (active) {
        utils.toggleClass(this.dom, 'active', active);
    };
    return TrackViewItem;
}());
var list = new TrackList();
list.fetch('list');
ui.content.setContent(list.render());
