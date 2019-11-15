/// <reference path="utils.ts" />

var ui = {
    bottomBar: new class {
        container: HTMLElement = document.getElementById("bottombar");
        autoHide = true;

        toggle(state?: boolean) {
            utils.toggleClass(this.container, 'show', state);
        }
        init() {
            var bar = this.container;
            var hideTimer = new utils.Timer(() => {
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
            prog = utils.numLimit(prog, 0, 1);
            this.fill.style.width = (prog * 100) + '%';
            this.labelCur.textContent = utils.formatTime(cur);
            this.labelTotal.textContent = utils.formatTime(total);
        }
        setProgressChangedCallback(cb: (percent: number) => void) {
            var call = (e) => { cb(utils.numLimit(e.offsetX / this.container.clientWidth, 0, 1)); }
            this.container.addEventListener('mousedown', (e) => {
                if (e.buttons == 1) call(e);
            });
            this.container.addEventListener('mousemove', (e) => {
                if (e.buttons == 1) call(e);
            });
        }
    },
    trackinfo: new class {
        element = document.getElementById('bottombar-trackinfo');
        setTrack(track: Track) {
            this.element.textContent = `Now playing: ${track.artist} - ${track.name}`;
        }
    },
    content: new class {
        container = document.getElementById('content-outer');
        current: ContentView;
        removeCurrent() {
            const cur = this.current;
            if (!cur) return;
            if (cur.onRemove) cur.onRemove();
            if (cur.element) this.container.removeChild(cur.element);
        }
        setContent(arg: ContentView) {
            this.removeCurrent();
            this.container.appendChild(arg.element);
            this.current = arg;
        }
    }
};

interface ContentView {
    element: HTMLElement,
    onRemove?: Action
}

ui.bottomBar.init();

class PlayerCore {
    audio: HTMLAudioElement;
    track: Track;
    constructor() {
        this.audio = document.createElement('audio');
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('canplay', () => this.updateProgress());
        this.audio.addEventListener('error', (e) => {
            console.log(e);
        });
        this.audio.addEventListener('ended', () => {
            this.next();
        });
        ui.progressBar.setProgressChangedCallback((x) => {
            this.audio.currentTime = x * this.audio.duration;
        });
        var ctx = new AudioContext();
        var analyzer = ctx.createAnalyser();
    }
    next() {
        if (this.track._bind && this.track._bind.next)
            this.playTrack(this.track._bind.next);
    }
    updateProgress() {
        ui.progressBar.setProg(this.audio.currentTime, this.audio.duration);
    }
    loadUrl(src: string) {
        this.audio.src = src;
    }
    playUrl(src: string) {
        this.loadUrl(src);
        this.audio.play();
    }
    playTrack(track: Track) {
        this.track = track;
        ui.trackinfo.setTrack(track);
        this.playUrl(track.url);
    }
    play() {
        this.audio.play();
    }
    pause() {
        this.audio.pause();
    }
}

var playerCore = new PlayerCore();

var api = new class {
    baseUrl = 'api/';
    async getJson(path): Promise<any> {
        var resp = await fetch(this.baseUrl + path);
        return await resp.json();
    }
    async getListAsync(): Promise<TrackList> {
        await new TrackList().fetch('list');
        return
    }
}

interface Track {
    id: number;
    name: string;
    artist: string;
    url: string;
    _bind?: {
        location?: number;
        list?: TrackList;
        next?: Track;
    };
}

class TrackList {
    name: string;
    tracks: Track[];
    view: ContentView;
    fetching: Promise<any>;
    fromObj(obj) {
        this.name = obj.name;
        this.tracks = obj.tracks;
        var i = 0;
        var lastItem: Track;
        for (const item of this.tracks) {
            item._bind = { location: i++, list: this };
            if (lastItem) lastItem._bind.next = item;
            lastItem = item;
        }
        return this;
    }
    fetch(path): Promise<void> {
        return this.fetching = (async () => {
            var obj = await api.getJson(path);
            this.fromObj(obj);
            if (this.view) this.renderCore();
        })();
    }
    render(forceRerender?: boolean): ContentView {
        if (!this.view || forceRerender) {
            if (!this.view)
                this.view = { element: utils.buildDOM({ tag: 'div.tracklist' }) as HTMLDivElement };
            this.renderCore();
        }
        return this.view;
    }
    private renderCore() {
        var box = this.view.element as HTMLDivElement;
        if (this.tracks) {
            utils.clearChilds(box);
            for (const item of this.tracks) {
                let ele: HTMLDivElement;
                box.appendChild(ele = utils.buildDOM({
                    tag: 'div.item',
                    textContent: item.name,
                    onclick: () => {
                        playerCore.playTrack(item);
                    }
                }) as HTMLDivElement);
            }
        } else {
            box.textContent = "Loading...";
        }
        return box;
    }
}

var list = new TrackList();
list.fetch('list');
ui.content.setContent(list.render());