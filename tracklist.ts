// file: tracklist.ts
/// <reference path="main.ts" />


/** A track binding with list */
class Track implements Api.Track {
    id: number;
    name: string;
    artist: string;
    url: string;
    _bind?: {
        position?: number;
        list?: TrackList;
    };
    constructor(init: Partial<Track>) {
        utils.objectApply(this, init);
    }
    toString() {
        return `${I`Track ID`}: ${this.id}\r\n${I`Name`}: ${this.name}\r\n${I`Artist`}: ${this.artist}`;
    }
    toApiTrack(): Api.Track {
        return utils.objectApply<Api.Track>({} as any, this, ['id', 'artist', 'name', 'url']) as any;
    }
}

class TrackList {
    info: Api.TrackListInfo;
    id: number;
    apiid: number;
    name: string;
    tracks: Track[] = [];
    contentView: ContentView;
    fetching: Promise<void>;
    posting: Promise<void>;
    curActive = new ItemActiveHelper<TrackViewItem>();
    /** Available when loading */
    loadIndicator: LoadingIndicator;
    /** Available when the view is created */
    listView: ListView<TrackViewItem>;
    header: ContentHeader;
    canEdit = true;

    loadInfo(info: Api.TrackListInfo) {
        this.id = info.id;
        this.apiid = this.id > 0 ? this.id : undefined;
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
        var track: Track = new Track({
            ...t,
            _bind: {
                list: this,
                position: this.tracks.length
            }
        });
        this.tracks.push(track);
        if (this.listView) {
            this.listView.add(this.createViewItem(track));
        }
        return track;
    }
    loadEmpty() {
        return this.fetching = Promise.resolve();
    }
    loadFromApi(arg?: number | (AsyncFunc<Api.TrackListGet>)) {
        return this.fetching = this.fetching ?? this.fetchForce(arg);
    }
    postToUser() {
        return this.posting = this.posting || this._post();
    }
    async _post() {
        await user.waitLogin();
        if (this.apiid !== undefined) throw new Error('cannot post: apiid exists');
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
        await user.waitLogin();
        if (this.fetching) await this.fetching;
        if (this.posting) await this.posting;
        if (this.apiid === undefined) throw new Error('cannot put: no apiid');
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
    async fetchForce(arg: number | AsyncFunc<Api.TrackListGet>) {
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
        if (this.header) this.header.updateWith({ title: this.name });
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
                    if (this.canEdit) lv.moveByDragging = true;
                    lv.onItemMoved = () => this.updateTracksFromListView();
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
    getNextTrack(track: Track, loopMode: PlayingLoopMode, offset?: number): Track {
        offset = offset ?? 1;
        var bind = track._bind;
        if (bind?.list !== this) return null;
        if (loopMode == 'list-seq') {
            return this.tracks[bind.position + offset] ?? null;
        } else if (loopMode == 'list-loop') {
            return this.tracks[utils.mod(bind.position + offset, this.tracks.length)] ?? null;
        } else if (loopMode == 'track-loop') {
            return track;
        } else {
            console.warn('unknown loopMode', loopMode);
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
        if (this.buildHeader)
            listView.dom.appendChild((this.header || (this.header = this.buildHeader())).dom);
        if (this.loadIndicator) {
            listView.dom.appendChild(this.loadIndicator.dom);
            return;
        }
        if (this.tracks.length === 0) {
            listView.dom.appendChild(new LoadingIndicator({ state: 'normal', content: I`(Empty)` }).dom);
            return;
        }
        // Well... currently, we just rebuild the DOM.
        var playing = playerCore.track;
        for (const t of this.tracks) {
            let item = this.createViewItem(t);
            if (playing
                && ((playing._bind?.list !== this && t.id === playing.id)
                    || (playing._bind?.list === this && playing._bind.position === t._bind.position)))
                this.curActive.set(item);
            listView.add(item);
        }
    }
    private updateTracksFromListView() {
        this.tracks = this.listView.map(lvi => {
            lvi.track._bind.position = lvi.position;
            lvi.updateDom();
            return lvi.track;
        });
    }
    protected onRemoveItem(lvi: TrackViewItem) {
        this.listView.remove(lvi);
        lvi.track._bind = null;
        this.updateTracksFromListView();
        this.put();
    }
    protected createViewItem(t: Track) {
        var view = new TrackViewItem(t);
        if (this.canEdit) {
            view.onRemove = (item) => this.onRemoveItem(item);
        }
        return view;
    }
    protected buildHeader() {
        return new ContentHeader({
            catalog: I`Playlist`,
            title: this.name,
            titleEditable: !!this.rename,
            onTitleEdit: (newName) => this.rename(newName)
        });
    }
}

class TrackViewItem extends ListViewItem {
    track: Track;
    dom: HTMLDivElement;
    /** When undefined, the item is not removable */
    onRemove?: Action<TrackViewItem>;
    private dompos: HTMLElement;
    constructor(item: Track) {
        super();
        this.track = item;
    }
    get dragData() { return `${this.track.name} - ${this.track.artist}`; }
    createDom(): BuildDomExpr {
        var track = this.track;
        return {
            _ctx: this,
            tag: 'div.item.trackitem.no-selection',
            child: [
                { tag: 'span.pos', textContent: '', _key: 'dompos' },
                { tag: 'span.name', textContent: track.name },
                { tag: 'span.artist', textContent: track.artist },
            ],
            onclick: () => { playerCore.playTrack(track); },
            oncontextmenu: (ev) => {
                ev.preventDefault();
                var m = new ContextMenu();
                m.add(new MenuItem({ text: I`Comments` }));
                if (this.onRemove) m.add(new MenuItem({
                    text: I`Remove`,
                    onclick: () => this.onRemove?.(this)
                }));
                m.dom.appendChild(utils.buildDOM({
                    tag: 'div.menu-info',
                    textContent: track.toString()
                }));
                m.show({ x: ev.pageX, y: ev.pageY });
            },
            draggable: true,
            _item: this
        };
    }
    updateDom() {
        this.dompos.textContent = this.track._bind ? (this.track._bind.position + 1).toString() : '';
    }
}

class ContentHeader extends View {
    catalog: string;
    title: string;
    titleEditable = false;
    domctx: { catalog?: HTMLSpanElement; title?: HTMLSpanElement; } = {};
    onTitleEdit: (title: string) => void;
    constructor(init?: Partial<ContentHeader>) {
        super();
        if (init) utils.objectApply(this, init);
    }
    createDom() {
        var editHelper: EditableHelper;
        return utils.buildDOM({
            _ctx: this.domctx,
            tag: 'div.content-header',
            child: [
                { tag: 'span.catalog', textContent: this.catalog, _key: 'catalog' },
                {
                    tag: 'span.title', textContent: this.title, _key: 'title',
                    onclick: (ev) => {
                        if (!this.titleEditable) return;
                        editHelper = editHelper || new EditableHelper(this.domctx.title);
                        if (editHelper.editing) return;
                        editHelper.startEdit((newName) => {
                            if (newName !== editHelper.beforeEdit && newName != '') {
                                this.onTitleEdit(newName);
                            }
                            this.updateDom();
                        });
                    }
                },
            ]
        });
    }
    updateDom() {
        this.domctx.catalog.textContent = this.catalog;
        this.domctx.catalog.style.display = this.catalog ? '' : 'none';
        this.domctx.title.textContent = this.title;
        utils.toggleClass(this.domctx.title, 'editable', !!this.titleEditable);
        if (this.titleEditable) this.domctx.title.title = I`Click to edit`;
        else this.domctx.title.removeAttribute('title');
    }
}