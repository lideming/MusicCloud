var helpers = new class {
    toggleClass(element: HTMLElement, clsName: string, force?: boolean) {
        if (force === undefined) force = !element.classList.contains(clsName);
        if (force) element.classList.add(clsName);
        else element.classList.remove(clsName);
    }
    strPaddingLeft(str: string, len: number, ch: string = ' ') {
        while (str.length < len) {
            str = ch + str;
        }
        return str;
    }
    formatTime(sec: number) {
        var sec = Math.floor(sec);
        var min = Math.floor(sec / 60);
        sec %= 60;
        return this.strPaddingLeft(min.toString(), 2, '0') + ':' + this.strPaddingLeft(sec.toString(), 2, '0');
    }
    numLimit(num:number, min: number, max: number) {
        return (num < min || typeof num != 'number' || isNaN(num)) ? min :
                (num > max) ? max : num;
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
    }
}

var ui = {
    bottomBar: new class {
        container: HTMLElement = document.getElementById("bottombar");
        autoHide = true;

        toggle(state?: boolean) {
            helpers.toggleClass(this.container, 'show', state);
        }
        init() {
            var bar = this.container;
            var hideTimer = new helpers.Timer(() => {
                this.toggle(false);
            });
            bar.addEventListener('mouseenter', () => {
                hideTimer.tryCancel();
                this.toggle(true);
            });
            bar.addEventListener('mouseleave', () => {
                hideTimer.tryCancel();
                if (this.autoHide) hideTimer.timeout(200);
            });
        }
    },
    progressBar: new class {
        container = document.getElementById('progressbar');
        fill = document.getElementById('progressbar-fill');
        labelCur = document.getElementById('progressbar-label-cur');
        labelTotal = document.getElementById('progressbar-label-total');

        setProg(cur: number, total: number) {
            var prog = cur / total;
            prog = helpers.numLimit(prog, 0, 1);
            this.fill.style.width = (prog * 100) + '%';
            this.labelCur.textContent = helpers.formatTime(cur);
            this.labelTotal.textContent = helpers.formatTime(total);
        }
        setProgressChangedCallback(cb: (percent: number) => void) {
            var call = (e) => { cb(helpers.numLimit(e.offsetX / this.container.clientWidth, 0, 1)); }
            this.container.addEventListener('mousedown', (e) => {
                if (e.buttons == 1) call(e);
            });
            this.container.addEventListener('mousemove', (e) => {
                if (e.buttons == 1) call(e);
            });
        }
    }
};

ui.bottomBar.init();

class PlayerCore {
    audio: HTMLAudioElement;
    constructor() {
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', (e) => {
            ui.progressBar.setProg(this.audio.currentTime, this.audio.duration);
        });
        ui.progressBar.setProgressChangedCallback((x) => {
            this.audio.currentTime = x * this.audio.duration;
        });
        var ctx = new AudioContext();
        var analyzer = ctx.createAnalyser();
    }
    loadUrl(src: string) {
        this.audio.src = src;
    }
    playUrl(src: string) {
        this.loadUrl(src);
        this.audio.play();
    }
    play() {
        this.audio.play();
    }
    pause() {
        this.audio.pause();
    }
}

var playerCore = new PlayerCore();
playerCore.loadUrl('test.mp3');