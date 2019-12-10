// file: tracklist.ts
/// <reference path="main.ts" />


/** A track binding with list */
interface Track extends Api.Track {
    _bind?: {
        position?: number;
        list?: TrackList;
    };
}

class TrackList {
    info: Api.TrackListInfo;
    id: number;
    apiid: number;
    name: string;
    tracks: Track[] = [];
    contentView: ContentView;
    fetching: Promise<void>;
    curActive = new ItemActiveHelper<TrackViewItem>();
    /** Available when loading */
    loadIndicator: LoadingIndicator;
    /** Available when the view is created */
    listView: ListView<TrackViewItem>;

    loadInfo(info: Api.TrackListInfo) {
        this.id = info.id;
        this.apiid = this.id > 0 ? this.id : 0;
        this.name = info.name;
    }
    loadFromGetResult(obj: Api.TrackListGet) {
        this.loadInfo(obj);
        for (const t of obj.tracks) {
            this.addTrack(t);
        }
        return this;
    }
    addTrack(t: Api.Track) {
        var track: Track = {
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
    loadFromApi(arg?: number | (AsyncFunc<Api.TrackListGet>)) {
        return this.fetching = this.fetching ?? this.fetchForce(arg);
    }
    async postToUser() {
        var obj: Api.TrackListPut = {
            id: 0,
            name: this.name,
            trackids: this.tracks.map(t => t.id)
        };
        var resp: Api.TrackListPutResult = await api.postJson({
            path: 'users/me/lists/new',
            method: 'POST',
            obj: obj
        });
        this.apiid = resp.id;
    }
    async put() {
        var obj: Api.TrackListPut = {
            id: this.apiid,
            name: this.name,
            trackids: this.tracks.map(t => t.id)
        };
        var resp: Api.TrackListPutResult = await api.postJson({
            path: 'lists/' + this.apiid,
            method: 'PUT',
            obj: obj
        });
    }
    async fetchForce(arg: number | (AsyncFunc<Api.TrackListGet>)) {
        var func: AsyncFunc<Api.TrackListGet>;
        if (arg === undefined) arg = this.apiid;
        if (typeof arg == 'number') func = () => api.getListAsync(arg as number);
        else func = arg;
        this.loadIndicator = new LoadingIndicator();
        this.updateView();
        try {
            var obj = await func();
            this.loadFromGetResult(obj);
            this.loadIndicator = null;
        } catch (err) {
            this.loadIndicator.error(err, () => this.fetchForce(arg));
            throw err;
        }
        this.updateView();
    }
    async rename(newName: string) {
        this.name = newName;
        listIndex.onrename(this.id, newName);
        await this.put();
    }
    createView(): ContentView {
        if (!this.contentView) {
            let cb = () => this.trackChanged();
            this.contentView = {
                dom: utils.buildDOM({ tag: 'div.tracklist' }) as HTMLElement,
                onShow: () => {
                    var lv = this.listView = this.listView || new ListView(this.contentView.dom);
                    lv.dragging = true;
                    lv.moveByDragging = true;
                    lv.onItemMoved = (item, from) => {
                        this.tracks = this.listView.map(lvi => {
                            lvi.track._bind.position = lvi.position;
                            lvi.updatePos();
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
    getNextTrack(track: Track): Track {
        if (track._bind?.list === this) {
            return this.tracks[track._bind.position + 1] ?? null;
        }
        return null;
    }
    private trackChanged() {
        var track = playerCore.track;
        var item = (track?._bind.list === this) ? this.listView.get(track._bind.position) : null;
        this.curActive.set(item);
    }
    private updateView() {
        var listView = this.listView;
        if (!listView) return;
        listView.clear();
        listView.dom.appendChild(this.buildHeader());
        if (this.loadIndicator) {
            listView.dom.appendChild(this.loadIndicator.dom);
            return;
        }
        if (this.tracks.length === 0) {
            listView.dom.appendChild(new LoadingIndicator({ status: 'normal', content: '(Empty)' }).dom);
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
    private buildHeader() {
        return utils.buildDOM({
            tag: 'div.content-header',
            child: [
                { tag: 'span.catalog', textContent: 'Tracklist' },
                {
                    tag: 'span.title', textContent: this.name, onclick: (ev) => {
                        var span = ev.target as HTMLSpanElement;
                        var beforeEdit = span.textContent;
                        if (span.isContentEditable) return;
                        span.contentEditable = 'true';
                        span.focus();
                        var stopEdit = () => {
                            span.contentEditable = 'false';
                            events.forEach(x => x.remove());
                            if (span.textContent !== beforeEdit) {
                                this.rename(span.textContent);
                            }
                        };
                        var events = [
                            utils.addEvent(span, 'keydown', (evv) => {
                                if (evv.keyCode == 13) {
                                    stopEdit();
                                    evv.preventDefault();
                                }
                            }),
                            utils.addEvent(span, 'focusout', (evv) => { stopEdit(); }),
                            utils.addEvent(span, 'input', (evv) => {
                                // in case user paste an image
                                for (var next, node = span.firstChild; node; node = next) {
                                    next = node.nextSibling;
                                    if (node.nodeType !== Node.TEXT_NODE)
                                        node.remove();
                                }
                            })
                        ];
                    }
                },
            ]
        });
    }
}

class TrackViewItem extends ListViewItem {
    track: Track;
    dom: HTMLDivElement;
    constructor(item: Track) {
        super();
        this.track = item;
    }
    get dragData() { return `${this.track.name} - ${this.track.artist}`; }
    createDom() {
        var track = this.track;
        return {
            tag: 'div.item.trackitem.no-selection',
            child: [
                { tag: 'span.pos', textContent: (track._bind.position + 1).toString() },
                { tag: 'span.name', textContent: track.name },
                { tag: 'span.artist', textContent: track.artist },
            ],
            onclick: () => { playerCore.playTrack(track); },
            draggable: true,
            _item: this
        };
    }
    updatePos() {
        this.dom.querySelector('.pos').textContent = (this.track._bind.position + 1).toString();
    }
}