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
            if (track) {
                utils.replaceChild(this.element, utils.buildDOM({
                    tag: 'span',
                    child: [
                        'Now Playing: ',
                        { tag: 'span.name', textContent: track.name },
                        { tag: 'span.artist', textContent: track.artist },
                    ]
                }));
            } else {
                this.element.textContent = "";
            }
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
            if (arg.onShow) arg.onShow();
            this.current = arg;
        }
    }
};

interface ContentView {
    element: HTMLElement,
    onShow?: Action,
    onRemove?: Action
}

ui.bottomBar.init();

class PlayerCore {
    audio: HTMLAudioElement;
    track: Track;
    onTrackChanged: Action;
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
        else
            this.setTrack(null);
    }
    updateProgress() {
        ui.progressBar.setProg(this.audio.currentTime, this.audio.duration);
    }
    loadUrl(src: string) {
        this.audio.src = src;
    }
    setTrack(track: Track) {
        this.track = track;
        ui.trackinfo.setTrack(track);
        if (this.onTrackChanged) this.onTrackChanged();
        this.loadUrl(track ? track.url : "");
    }
    playTrack(track: Track) {
        if (track === this.track) return;
        this.setTrack(track);
        this.play();
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
    viewItems: TrackViewItem[];
    contentView: ContentView;
    fetching: Promise<any>;
    private curActive: TrackViewItem;

    loadFromObj(obj) {
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
            this.loadFromObj(obj);
            if (this.contentView) this.renderCore();
        })();
    }
    render(forceRerender?: boolean): ContentView {
        if (!this.contentView || forceRerender) {
            if (!this.contentView) {
                this.contentView = {
                    element: utils.buildDOM({ tag: 'div.tracklist' }) as HTMLDivElement,
                    onShow: () => {
                        playerCore.onTrackChanged = () => this.trackChanged();
                    },
                    onRemove: () => { }
                };
            }
            this.renderCore();
        }
        return this.contentView;
    }
    private getViewItem(pos: number) {
        return this.viewItems ? this.viewItems[pos] : null;
    }
    private trackChanged() {
        var track = playerCore.track;
        if (this.curActive)
            this.curActive.setActive(false);
        this.curActive = null;
        if (!track || track._bind.list !== this) return;
        var item = this.getViewItem(track._bind.location);
        item.setActive(true);
        this.curActive = item;
    }
    private renderCore() {
        var box = this.contentView.element as HTMLDivElement;
        if (this.tracks) {
            utils.clearChilds(box);
            this.viewItems = [];
            for (const t of this.tracks) {
                let item = new TrackViewItem(t);
                this.viewItems.push(item);
                box.appendChild(item.dom);
            }
        } else {
            box.textContent = "Loading...";
        }
        return box;
    }
}

class TrackViewItem {
    track: Track;
    dom: HTMLDivElement;
    constructor(item: Track) {
        this.track = item;
        this.dom = utils.buildDOM({
            tag: 'div.item.trackitem',
            child: [
                { tag: 'span.name', textContent: item.name },
                { tag: 'span.artist', textContent: item.artist },
            ],
            onclick: () => {
                playerCore.playTrack(item);
            },
            _item: this
        }) as HTMLDivElement
    }
    setActive(active: boolean) {
        utils.toggleClass(this.dom, 'active', active);
    }
}

var list = new TrackList();
list.fetch('list');
ui.content.setContent(list.render());