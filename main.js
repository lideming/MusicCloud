var helpers = new /** @class */ (function () {
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
        var sec = Math.floor(sec);
        var min = Math.floor(sec / 60);
        sec %= 60;
        return this.strPaddingLeft(min.toString(), 2, '0') + ':' + this.strPaddingLeft(sec.toString(), 2, '0');
    };
    class_1.prototype.numLimit = function (num, min, max) {
        return (num < min || typeof num != 'number' || isNaN(num)) ? min :
            (num > max) ? max : num;
    };
    return class_1;
}());
var ui = {
    bottomBar: new /** @class */ (function () {
        function class_3() {
            this.container = document.getElementById("bottombar");
            this.autoHide = true;
        }
        class_3.prototype.toggle = function (state) {
            helpers.toggleClass(this.container, 'show', state);
        };
        class_3.prototype.init = function () {
            var _this = this;
            var bar = this.container;
            var hideTimer = new helpers.Timer(function () {
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
            prog = helpers.numLimit(prog, 0, 1);
            this.fill.style.width = (prog * 100) + '%';
            this.labelCur.textContent = helpers.formatTime(cur);
            this.labelTotal.textContent = helpers.formatTime(total);
        };
        class_4.prototype.setProgressChangedCallback = function (cb) {
            var _this = this;
            var call = function (e) { cb(helpers.numLimit(e.offsetX / _this.container.clientWidth, 0, 1)); };
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
    }())
};
ui.bottomBar.init();
var PlayerCore = /** @class */ (function () {
    function PlayerCore() {
        var _this = this;
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', function () { return _this.updateProgress(); });
        this.audio.addEventListener('canplay', function () { return _this.updateProgress(); });
        ui.progressBar.setProgressChangedCallback(function (x) {
            _this.audio.currentTime = x * _this.audio.duration;
        });
        var ctx = new AudioContext();
        var analyzer = ctx.createAnalyser();
    }
    PlayerCore.prototype.updateProgress = function () {
        ui.progressBar.setProg(this.audio.currentTime, this.audio.duration);
    };
    PlayerCore.prototype.loadUrl = function (src) {
        this.audio.src = src;
    };
    PlayerCore.prototype.playUrl = function (src) {
        this.loadUrl(src);
        this.audio.play();
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
playerCore.loadUrl('test.mp3');
