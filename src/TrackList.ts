// file: TrackList.ts

import { utils, I, ItemActiveHelper, AsyncFunc, Action, BuildDomExpr } from "./utils";
import { Dialog, LabeledInput, TabBtn, LoadingIndicator, ListView, ListViewItem, ContextMenu, MenuItem, MenuLinkItem, MenuInfoItem, View, EditableHelper, Toast } from "./viewlib";
import { ListContentView } from "./ListContentView";
import { user } from "./User";
import { Api } from "./apidef";
import { api } from "./Api";
import { listIndex } from "./main";
import { ContentView } from "./UI";
import { playerCore, PlayingLoopMode } from "./PlayerCore";
import { router } from "./Router";


/** A track binding with list */
export class Track implements Api.Track {
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
    updateFromApiTrack(t: Api.Track) {
        if (this.id !== t.id) throw new Error('Bad track id');
        utils.objectApply(this, t, ['id', 'name', 'artist', 'url']);
    }
    startEdit() {
        var dialog = new class extends Dialog {
            width = '500px';
            trackId: number;
            inputName = new LabeledInput({ label: I`Name` });
            inputArtist = new LabeledInput({ label: I`Artist` });
            btnSave = new TabBtn({ text: I`Save`, right: true });
            autoFocus = this.inputName.input;
            constructor() {
                super();
                [this.inputName, this.inputArtist].forEach(x => this.addContent(x));
                this.addBtn(this.btnSave);
                this.btnSave.onClick.add(() => this.save());
                this.dom.addEventListener('keydown', (ev) => {
                    if (ev.keyCode == 13) {
                        ev.preventDefault();
                        this.save();
                    }
                });
            }
            fillInfo(t: Api.Track) {
                this.trackId = t.id;
                this.title = I`Track ID` + ' ' + t.id;
                this.inputName.updateWith({ value: t.name });
                this.inputArtist.updateWith({ value: t.artist });
                this.updateDom();
            }
            async save() {
                this.btnSave.updateWith({ clickable: false, text: I`Saving...` });
                try {
                    var newinfo = await api.postJson({
                        method: 'PUT', path: 'tracks/' + this.trackId,
                        obj: {
                            id: this.trackId,
                            name: this.inputName.value,
                            artist: this.inputArtist.value
                        }
                    }) as Api.Track;
                    if (newinfo.id != this.trackId) throw new Error('Bad ID in response');
                    api.onTrackInfoChanged.invoke(newinfo);
                    this.close();
                } catch (error) {
                    this.btnSave.updateWith({ clickable: false, text: I`Error` });
                    await utils.sleepAsync(3000);
                }
                this.btnSave.updateWith({ clickable: true, text: I`Save` });
            }
        };
        dialog.fillInfo(this);
        dialog.show();
    }
}

export class TrackList {
    info: Api.TrackListInfo;
    id: number;
    apiid: number;
    name: string;
    tracks: Track[] = [];
    fetching: Promise<void>;
    posting: Promise<void>;

    canEdit = true;

    /** Available when loading */
    loadIndicator: LoadingIndicator;
    setLoadIndicator(li: LoadingIndicator) {
        this.loadIndicator = li;
        if (this.contentView) this.contentView.useLoadingIndicator(li);
    }

    /** Available when the view is created */
    contentView: TrackListView;
    listView: ListView<TrackViewItem>;

    loadInfo(info: Api.TrackListInfo) {
        this.id = info.id;
        this.apiid = this.id > 0 ? this.id : undefined;
        this.name = info.name;
    }
    loadFromGetResult(obj: Api.TrackListGet) {
        this.loadInfo(obj);
        this.tracks.forEach(t => t._bind = null);
        this.tracks = [];
        this.listView?.removeAll();
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
        if (this.contentView) this.contentView.addItem(track);
        return track;
    }
    loadEmpty() {
        this.contentView?.updateView();
        return this.fetching = Promise.resolve();
    }
    fetch(force?: boolean) {
        if (force) this.fetching = null;
        return this.fetching = this.fetching ?? this.fetchImpl();
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
    async getRealId() {
        if (this.apiid) return this.apiid;
        await this.postToUser();
        return this.apiid;
    }
    async put() {
        try {
            await user.waitLogin(true);
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
        } catch (error) {
            console.error('list put() failed', this, error);
            Toast.show(I`Failed to sync playlist "${this.name}".` + '\n' + error, 3000);
            throw error;
        }
    }
    async fetchImpl() {
        this.setLoadIndicator(new LoadingIndicator());
        try {
            var obj = await api.getListAsync(this.apiid);
            this.loadFromGetResult(obj);
            this.setLoadIndicator(null);
        } catch (err) {
            this.loadIndicator.error(err, () => this.fetchImpl());
            throw err;
        }
    }
    async rename(newName: string) {
        this.name = newName;
        var header = this.contentView?.header;
        if (header) header.updateWith({ title: this.name });
        listIndex.onrename(this.id, newName);
        await this.put();
    }
    createView(): ContentView {
        var list = this;
        return this.contentView = this.contentView || new TrackListView(this);
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
    updateTracksFromListView() {
        this.tracks = this.listView.map(lvi => {
            lvi.track._bind.position = lvi.position;
            lvi.updateDom();
            return lvi.track;
        });
        this.put();
    }
    remove(track: Track) {
        var pos = track._bind.position;
        track._bind = null;
        this.tracks.splice(pos, 1);
        if (this.listView) {
            this.listView.remove(pos);
            this.updateTracksFromListView();
        } else {
            this.tracks.forEach((t, i) => t._bind.position = i);
        }
        this.contentView?.updateView();
        this.put();
    }
}

export class TrackListView extends ListContentView {
    list: TrackList;
    listView: ListView<TrackViewItem>;
    curPlaying = new ItemActiveHelper<TrackViewItem>({
        funcSetActive: function (item, val) { item.updateWith({ playing: val }); }
    });
    constructor(list: TrackList) {
        super();
        this.list = list;
    }
    createHeader() {
        return new ContentHeader({
            catalog: I`Playlist`,
            title: this.list.name,
            titleEditable: !!this.list.rename,
            onTitleEdit: (newName) => this.list.rename(newName)
        });
    }
    onShow() {
        super.onShow();
        playerCore.onTrackChanged.add(this.trackChanged);
        this.updateItems();
    }
    onRemove() {
        super.onRemove();
        playerCore.onTrackChanged.remove(this.trackChanged);
    }
    protected appendListView() {
        super.appendListView();
        var lv = this.listView;
        this.list.listView = lv;
        lv.dragging = true;
        if (this.list.canEdit) lv.moveByDragging = true;
        lv.onItemMoved = () => this.list.updateTracksFromListView();
        this.list.tracks.forEach(t => this.addItem(t));
        this.updateItems();
        if (this.list.loadIndicator) this.useLoadingIndicator(this.list.loadIndicator);
        this.updateView();
    }
    updateItems() {
        // update active state of items
        this.trackChanged();
    }
    addItem(t: Track, pos?: number) {
        var item = this.createViewItem(t);
        this.listView.add(item, pos);
        this.updateCurPlaying(item);
        this.updateView();
    }
    protected createViewItem(t: Track) {
        var view = new TrackViewItem(t);
        if (this.list.canEdit) {
            view.onRemove = (item) => this.list.remove(item.track);
        }
        return view;
    }
    protected updateCurPlaying(item?: TrackViewItem) {
        var playing = playerCore.track;
        if (item === undefined) {
            item = (playing?._bind?.list === this.list) ? this.listView.get(playing._bind.position) :
                playing ? this.listView.find(x => x.track.id === playing.id) : null;
            this.curPlaying.set(item);
        } else if (playing) {
            var track = item.track;
            if ((playing._bind?.list === this.list && track === playing)
                || (track.id === playing.id)) {
                this.curPlaying.set(item);
            }
        }
    }
    private trackChanged = () => {
        this.updateCurPlaying();
    };
};

export class TrackViewItem extends ListViewItem {
    track: Track;
    dom: HTMLDivElement;
    /** When undefined, the item is not removable */
    onRemove?: Action<TrackViewItem>;
    noPos: boolean;
    playing: boolean;
    private dompos: HTMLElement;
    private domname: HTMLElement;
    private domartist: HTMLElement;
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
                { tag: 'span.name', _key: 'domname' },
                { tag: 'span.artist', _key: 'domartist' },
            ],
            onclick: () => { playerCore.playTrack(track); },
            draggable: true,
            _item: this
        };
    }
    updateDom() {
        this.domname.textContent = this.track.name;
        this.domartist.textContent = this.track.artist;
        if (this.playing) {
            this.dompos.textContent = '🎵';
        } else if (!this.noPos) {
            this.dompos.textContent = this.track._bind ? (this.track._bind.position + 1).toString() : '';
        }
        this.dompos.hidden = this.noPos && !this.playing;
    }
    onContextMenu = (item: TrackViewItem, ev: MouseEvent) => {
        ev.preventDefault();
        var m = new ContextMenu();
        m.add(new MenuItem({
            text: I`Comments`, onclick: () => {
                router.nav(['track-comments', item.track.id.toString()]);
            }
        }));
        if (this.track.url) m.add(new MenuLinkItem({
            text: I`Download`,
            link: api.processUrl(this.track.url),
            download: this.track.artist + ' - ' + this.track.name + '.mp3' // TODO
        }));
        m.add(new MenuItem({
            text: I`Edit`,
            onclick: () => this.track.startEdit()
        }));
        if (this.onRemove) m.add(new MenuItem({
            text: I`Remove`, cls: 'dangerous',
            onclick: () => this.onRemove?.(this)
        }));
        m.add(new MenuInfoItem({ text: I`Track ID` + ': ' + this.track.id }));
        m.show({ ev: ev });
    };
}

export class ContentHeader extends View {
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
                    onclick: async (ev) => {
                        if (!this.titleEditable) return;
                        editHelper = editHelper || new EditableHelper(this.domctx.title);
                        if (editHelper.editing) return;
                        var newName = await editHelper.startEditAsync();
                        if (newName !== editHelper.beforeEdit && newName != '') {
                            this.onTitleEdit(newName);
                        }
                        this.updateDom();
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