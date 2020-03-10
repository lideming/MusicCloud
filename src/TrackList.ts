// file: TrackList.ts

import { utils, I, Action, BuildDomExpr, DataUpdatingHelper } from "./utils";
import { Dialog, LabeledInput, TabBtn, LoadingIndicator, ListView, ListViewItem, ContextMenu, MenuItem, MenuLinkItem, MenuInfoItem, View, EditableHelper, Toast, ContainerView, TextView, ItemActiveHelper } from "./viewlib";
import { ListContentView } from "./ListContentView";
import { user } from "./User";
import { Api } from "./apidef";
import { api } from "./Api";
import { listIndex } from "./main";
import { ContentView } from "./UI";
import { playerCore, PlayingLoopMode } from "./PlayerCore";
import { router } from "./Router";


/** A track binding with list */
export class Track {
    infoObj: Api.Track;
    get id(): number { return this.infoObj.id; }
    get name() { return this.infoObj.name; }
    get artist() { return this.infoObj.artist; }
    get url() { return this.infoObj.url; }
    get files() { return this.infoObj.files; }
    get length() { return this.infoObj.length; }
    get size() { return this.infoObj.size; }
    get displayName() { return this.artist + ' - ' + this.name; }
    blob?: Blob;
    _bind?: {
        position?: number;
        list?: TrackList;
    };
    get canEdit() { return true; }
    constructor(init: Partial<Track>) {
        utils.objectApply(this, init);
    }
    toString() {
        return `${I`Track ID`}: ${this.id}\r\n${I`Name`}: ${this.name}\r\n${I`Artist`}: ${this.artist}`;
    }
    toApiTrack(): Api.Track {
        return utils.objectApply<Api.Track>({} as any, this, ['id', 'artist', 'name', 'url', 'size']) as any;
    }
    getExtensionName() {
        return /\.([\w\-_]{1,6})$/.exec(this.url)?.[1];
    }
    updateFromApiTrack(t: Api.Track) {
        if (this.id !== t.id) throw new Error('Bad track id');
        // utils.objectApply(this, t, ['id', 'name', 'artist', 'url', 'size']);
        this.infoObj = t;
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
                    var newinfo = await api.put({
                        path: 'tracks/' + this.trackId,
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
    async requestFileUrl(file: Api.TrackFile) {
        if (!file.url) {
            var toast = Toast.show(I`Converting "${this.displayName}"...`);
            try {
                file.url = (await api.get(file.urlurl))['url'];
                toast.close();
            } catch (error) {
                toast.updateWith({ text: I`Error converting "${this.displayName}".` + '\n' + error });
                toast.show(3000);
            }
        }
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
        const thiz = this;
        new class extends DataUpdatingHelper<Track, Api.Track>{
            items = thiz.tracks;
            addItem(data: Api.Track, pos: number) { thiz.addTrack_NoUpdating(data, pos); }
            updateItem(item: Track, data: Api.Track) { item.updateFromApiTrack(data); }
            removeItem(item: Track) { thiz.remove_NoUpdating(item); }
        }().update(obj.tracks);
        this.updateTracksState();
        this.contentView?.updateView();
        return this;
    }
    addTrack(t: Api.Track, pos?: number) {
        var track: Track = this.addTrack_NoUpdating(t, pos);
        if (pos !== undefined && pos !== this.tracks.length - 1) this.updateTracksState();
        return track;
    }
    private addTrack_NoUpdating(t: Api.Track, pos: number) {
        var track: Track = new Track({
            infoObj: t,
            _bind: {
                list: this,
                position: this.tracks.length
            }
        });
        utils.arrayInsert(this.tracks, track, pos);
        if (this.contentView)
            this.contentView.addItem(track, pos);
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
        var resp: Api.TrackListPutResult = await api.post({
            path: 'users/me/lists/new',
            obj: obj
        });
        this.apiid = resp.id;
    }
    async getRealId() {
        if (this.apiid) return this.apiid;
        await this.postToUser();
        return this.apiid;
    }
    put() {
        if (this.putDelaying) return this.putDelaying;
        this.putDelaying = this.putCore();
    }
    putDelaying: Promise<void> = null;
    putInProgress: Promise<void> = null;
    private async putCore() {
        try {
            if (this.putInProgress) await this.putInProgress;
            await utils.sleepAsync(10);
            await user.waitLogin(true);
            if (this.fetching) await this.fetching;
            if (this.posting) await this.posting;
            if (this.apiid === undefined) throw new Error('cannot put: no apiid');
        } catch (error) {
            this.putDelaying = null;
            console.error(error);
        }
        try {
            [this.putInProgress, this.putDelaying] = [this.putDelaying, null];
            var obj: Api.TrackListPut = {
                id: this.apiid,
                name: this.name,
                trackids: this.tracks.map(t => t.id)
            };
            var resp: Api.TrackListPutResult = await api.put({
                path: 'lists/' + this.apiid,
                obj: obj
            });
        } catch (error) {
            console.error('list put() failed', this, error);
            Toast.show(I`Failed to sync playlist "${this.name}".` + '\n' + error, 3000);
            throw error;
        } finally {
            this.putInProgress = null;
        }
    }
    async fetchImpl() {
        this.setLoadIndicator(new LoadingIndicator());
        try {
            var obj = await api.getListAsync(this.apiid);
            this.loadFromGetResult(obj);
            this.setLoadIndicator(null);
        } catch (err) {
            this.loadIndicator.error(err, () => this.fetch(true));
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
        return this.contentView = this.contentView || new TrackListView(this);
    }
    getNextTrack(track: Track, loopMode: PlayingLoopMode, offset?: number): Track {
        offset = offset ?? 1;
        var bind = track._bind;
        var position = bind.position;
        if (bind?.list !== this) return null;
        if (this.listView)
            position = position ?? this.listView.find(x => x.track === track)?.position
                ?? this.listView.find(x => x.track.id === track.id)?.position;
        position = position ?? this.tracks.indexOf(track);
        if (position == null || position < 0) position = this.tracks.findIndex(x => x.id === track.id);
        if (position == null || position < 0) return null;
        if (loopMode == 'list-seq') {
            return this.tracks[position + offset] ?? null;
        } else if (loopMode == 'list-loop') {
            return this.tracks[utils.mod(position + offset, this.tracks.length)] ?? null;
        } else if (loopMode == 'track-loop') {
            return track;
        } else {
            console.warn('unknown loopMode', loopMode);
        }
        return null;
    }
    updateTracksFromListView() {
        this.updateTracksState();
        this.put();
    }
    private updateTracksState() {
        if (this.listView) {
            // if the listview exists, update `this.tracks` as well as the DOM.
            this.tracks = this.listView.map(lvi => {
                lvi.track._bind.position = lvi.position;
                lvi.updateDom();
                return lvi.track;
            });
        } else {
            this.tracks.forEach((t, i) => t._bind.position = i);
        }
    }

    updateTrackInfo(track: Track, newInfo: Api.Track) {
        track.updateFromApiTrack(newInfo);
        this.listView.get(track._bind.position).updateDom();
    }
    remove(track: Track, put?: boolean) {
        this.remove_NoUpdating(track);
        this.updateTracksState();
        this.contentView?.updateView();
        if (put === undefined || put) this.put();
    }

    private remove_NoUpdating(track: Track) {
        var pos = track._bind.position;
        track._bind = null;
        this.tracks.splice(pos, 1);
        if (this.listView)
            this.listView.remove(pos);
    }
}

export class TrackListView extends ListContentView {
    list: TrackList;
    listView: ListView<TrackViewItem>;
    curPlaying = new ItemActiveHelper<TrackViewItem>({
        funcSetActive: function (item, val) { item.updateWith({ playing: val }); }
    });
    canMultiSelect = true;
    trackActionHandler: TrackActionHandler<TrackViewItem> = {};
    constructor(list: TrackList) {
        super();
        this.list = list;
        if (this.list.canEdit) {
            this.trackActionHandler.onTrackRemove = (items) =>
                items.forEach(x => this.list.remove(x.track));
        }
    }
    createHeader() {
        return new ContentHeader({
            catalog: I`Playlist`,
            title: this.list.name,
            titleEditable: !!this.list.rename,
            onTitleEdit: (newName) => this.list.rename(newName)
        });
    }
    protected appendHeader() {
        super.appendHeader();
        this.refreshBtn.onclick = () => {
            this.list.fetch(true);
        };
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
        lv.dom.classList.add('tracklistview');
        this.list.listView = lv;
        lv.dragging = true;
        if (this.list.canEdit) lv.moveByDragging = true;
        lv.onItemMoved = () => this.list.updateTracksFromListView();
        lv.onItemClicked = (item) => playerCore.playTrack(item.track);
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
        view.actionHandler = this.trackActionHandler;
        return view;
    }
    protected updateCurPlaying(item?: TrackViewItem) {
        var playing = playerCore.track;
        if (item === undefined) {
            item = (playing?._bind?.list === this.list && playing._bind.position != undefined) ? this.listView.get(playing._bind.position) :
                (playing && this.listView.find(x => x.track === playing))
                ?? this.listView.find(x => x.track.id === playing.id);
            this.curPlaying.set(item);
        } else if (playing) {
            var track = item.track;
            if ((playing._bind?.list === this.list && track === playing)
                || (!this.curPlaying && track.id === playing.id)) {
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
    actionHandler: TrackActionHandler<this>;
    noPos: boolean;
    playing: boolean;
    constructor(item: Track) {
        super();
        this.track = item;
    }
    get dragData() { return `${this.track.name} - ${this.track.artist}`; }
    createDom(): BuildDomExpr {
        var track = this.track;
        return {
            tag: 'div.item.trackitem.no-selection',
            child: [
                {
                    tag: 'span.pos', update: (dompos) => {
                        if (this.playing) {
                            dompos.textContent = '🎵';
                        } else if (!this.noPos) {
                            dompos.textContent = this.track._bind.position !== undefined
                                ? (this.track._bind.position + 1).toString() : '';
                        }
                        dompos.hidden = this.noPos && !this.playing;
                    }
                },
                { tag: 'span.name', text: () => this.track.name },
                { tag: 'span.artist', text: () => this.track.artist },
                { tag: 'span.duration', text: () => utils.formatTime(this.track.length) },
            ],
            draggable: true,
            _item: this
        };
    }
    updateDom() {
        super.updateDom();
        this.toggleClass('selected', !!this.selected);
    }
    onContextMenu = (item: TrackViewItem, ev: MouseEvent) => {
        ev.preventDefault();
        var selected: TrackViewItem[] = this.selected ? this.selectionHelper.selectedItems : [this];
        var m = new ContextMenu();
        if (item.track.id) m.add(new MenuItem({
            text: I`Comments`, onclick: () => {
                router.nav(['track-comments', item.track.id.toString()]);
            }
        }));
        if (this.track.url) {
            var ext = this.track.getExtensionName();
            ext = ext ? (ext.toUpperCase() + ', ') : '';
            var fileSize = utils.formatFileSize(this.track.size);
            var files = [...(this.track.files ?? [])];
            files.sort((a, b) => b.bitrate - a.bitrate);
            if (!files.find(f => f.url === this.track.url))
                m.add(new MenuLinkItem({
                    text: I`Download` + ' (' + ext + fileSize + ')',
                    link: api.processUrl(this.track.url),
                    download: this.track.artist + ' - ' + this.track.name + '.' + ext
                }));
            files.forEach(f => {
                var format = f.format?.toUpperCase();
                if (f.url) m.add(new MenuLinkItem({
                    text: I`Download` + ' (' + format + ', ' + f.bitrate + ' Kbps)',
                    link: api.processUrl(f.url),
                    download: this.track.artist + ' - ' + this.track.name + '.' + format
                }));
                else if (f.urlurl) m.add(new MenuItem({
                    text: I`Convert` + ' (' + format + ', ' + f.bitrate + ' Kbps)',
                    onclick: () => {
                        this.track.requestFileUrl(f);
                    }
                }));
            });
        }
        if (this.track.canEdit) m.add(new MenuItem({
            text: I`Edit`,
            onclick: () => this.track.startEdit()
        }));
        if (this.actionHandler.onTrackRemove) m.add(new MenuItem({
            text: I`Remove`, cls: 'dangerous',
            onclick: () => this.actionHandler.onTrackRemove?.([this])
        }));
        if (this.actionHandler.onTrackRemove && this.selected && this.selectionHelper.count > 1)
            m.add(new MenuItem({
                text: I`Remove ${this.selectionHelper.count} tracks`, cls: 'dangerous',
                onclick: () => {
                    this.actionHandler.onTrackRemove?.([...this.selectionHelper.selectedItems]);
                }
            }));
        m.add(new MenuInfoItem({
            text: I`Track ID` + ': ' +
                selected.map(x => x.track.id).join(', ') + '\n'
                + I`Duration` + ': ' +
                utils.formatTime(utils.arraySum(selected, x => x.track.length)) + '\n'
                + I`Size` + ': ' +
                utils.formatFileSize(utils.arraySum(selected, x => x.track.size))
        }));
        m.show({ ev: ev });
    };
}

export interface TrackActionHandler<T> {
    /** When undefined, the item is not removable */
    onTrackRemove?(arr: T[]);
}

export class ContentHeader extends View {
    catalog: string;
    title: string;
    titleEditable = false;
    get domdict(): { catalog?: HTMLSpanElement; title?: HTMLSpanElement; } {
        return this.domctx.dict;
    }
    actions = new ContainerView({ tag: 'div.actions' });
    onTitleEdit: (title: string) => void;
    constructor(init?: Partial<ContentHeader>) {
        super();
        if (init) utils.objectApply(this, init);
    }
    createDom(): BuildDomExpr {
        var editHelper: EditableHelper;
        return {
            tag: 'div.content-header.clearfix',
            child: [
                { tag: 'span.catalog', text: () => this.catalog, hidden: () => !this.catalog },
                {
                    tag: 'span.title', text: () => this.title, _key: 'title',
                    update: (domdict) => {
                        utils.toggleClass(domdict, 'editable', !!this.titleEditable);
                        if (this.titleEditable) domdict.title = I`Click to edit`;
                        else domdict.removeAttribute('title');
                    },
                    onclick: async (ev) => {
                        if (!this.titleEditable) return;
                        editHelper = editHelper || new EditableHelper(this.domdict.title);
                        if (editHelper.editing) return;
                        var newName = await editHelper.startEditAsync();
                        if (newName !== editHelper.beforeEdit && newName != '') {
                            this.onTitleEdit(newName);
                        }
                        this.updateDom();
                    }
                },
                this.actions.dom
            ]
        };
    }
}

export class ActionBtn extends TextView {
    onclick: Action;
    constructor(init?: Partial<ActionBtn>) {
        super();
        utils.objectApply(this, init);
    }
    createDom() {
        return { tag: 'span.action.clickable.no-selection' };
    }
    postCreateDom() {
        super.postCreateDom();
        this.dom.addEventListener('click', () => this.onclick?.());
    }
}