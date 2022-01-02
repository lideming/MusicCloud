// file: TrackList.ts

import { BuildDomExpr, DataUpdatingHelper, ScrollAnimator } from "../Infra/utils";
import { I, i18n } from "../I18n/I18n";
import { LoadingIndicator, ListViewItem, ContextMenu, MenuItem, MenuLinkItem, MenuInfoItem, Toast, ItemActiveHelper, LazyListView, arrayInsert, arraySum, clearChildren, formatFileSize, formatTime, mod, objectApply, sleepAsync, toggleClass } from "../Infra/viewlib";
import { ListContentView } from "../Infra/ListContentView";
import { user } from "../API/User";
import { Api } from "../API/apidef";
import { api } from "../API/Api";
import { listIndex } from "./ListIndex";
import { playerCore, PlayingLoopMode } from "../Player/PlayerCore";
import { router } from "../Infra/Router";
import { Track } from "./Track";
import { ContentView, ContentHeader, CopyMenuItem, Icon } from "../Infra/ui-views";
import { ui } from "../Infra/UI";
import { msgcli } from "../API/MessageClient";
import svgPlayArrow from "../../resources/play_arrow-24px.svg";
import { settings } from "../Settings/Settings";

export class TrackList {
    info: Api.TrackListInfo | null = null;
    id: number | null = null;
    get apiid() { return this.info?.id ?? null; }
    get name() { return this.info?.name ?? null; }
    get version() { return this.info?.version ?? null; }
    tracks: Track[] = [];
    tracksSuffled: Track[] | null = null;
    fetching: Promise<void> | null = null;
    posting: Promise<void> | null = null;
    eventListening = false;

    get canEdit() { return user.info.id == this.info!.owner; }

    /** Available when loading */
    loadIndicator: LoadingIndicator | null;
    setLoadIndicator(li: LoadingIndicator | null) {
        this.loadIndicator = li;
        if (this.contentView) this.contentView.useLoadingIndicator(li);
    }

    /** Available when the view is created */
    contentView: TrackListView;
    listView: LazyListView<TrackViewItem>;

    loadInfo(info: Api.TrackListInfo) {
        this.id = info.id;
        this.info = objectApply(this.info ?? {}, info, ["id", "owner", "name", "version", "visibility"]) as typeof info;
        if (this.info.id < 0) this.info.id = 0;
        this.updateCanEdit();
    }
    updateCanEdit() {
        if (this.contentView)
            this.contentView.header.updateWith({ titleEditable: this.canEdit });
    }

    loadApiId(id: number) {
        this.loadInfo({
            id,
            owner: 0,
            name: "",
            version: 0,
            visibility: 0
        });
    }
    loadFromGetResult(obj: Api.TrackListGet) {
        this.loadInfo(obj);
        this.onInfoChanged();
        const thiz = this;
        if (this.listView) this.listView.lazy = true;
        if (!this.tracks) this.tracks = [];
        new class extends DataUpdatingHelper<Track, Api.Track>{
            items = thiz.tracks!;
            addItem(data: Api.Track, pos: number) { thiz.addTrack_NoUpdating(data, pos); }
            updateItem(item: Track, data: Api.Track) { item.updateFromApiTrack(data); }
            removeItem(item: Track) { thiz.remove_NoUpdating(item); }
        }().updateOrRebuildAll(obj.tracks);
        this.updateTracksState();
        this.contentView?.updateView();
        if (this.listView) this.listView.slowlyLoad(1, 30);
        return this;
    }
    addTrack(t: Api.Track, pos?: number) {
        var track: Track = this.addTrack_NoUpdating(t, pos);
        if (pos !== undefined && pos !== this.tracks.length - 1) this.updateTracksState();
        this.contentView?.updateView();
        return track;
    }
    private addTrack_NoUpdating(t: Api.Track, pos?: number) {
        var track: Track = new Track({
            infoObj: t,
            _bind: {
                list: this,
                position: this.tracks.length
            }
        });
        arrayInsert(this.tracks, track, pos);
        this.tracksSuffled?.push(track);
        this.contentView?.addItem(track, pos, false);
        return track;
    }

    loadEmpty() {
        this.contentView?.updateView();
        return this.fetching = Promise.resolve();
    }
    /** Ensure the list is loaded */
    fetch(force?: boolean) {
        if (force) this.fetching = null;
        return this.fetching = this.fetching ?? this.fetchImpl();
    }
    postToUser() {
        return this.posting = this.posting || this._post();
    }
    async _post() {
        await user.waitLogin();
        if (this.apiid) throw new Error('cannot post: apiid exists');
        var obj = this.getTrackListPutInfo();
        var resp: Api.TrackListPutResult = await api.post({
            path: 'users/me/lists/new',
            obj: obj
        });
        this.info!.id = resp.id;
    }
    private getTrackListPutInfo(): Api.TrackListPut {
        return {
            ...this.info!,
            trackids: this.fetching ? this.tracks.map(t => t.id) : undefined,
        };
    }
    async getRealId(): Promise<number> {
        if (this.apiid) return this.apiid;
        await this.postToUser();
        return this.apiid!;
    }
    put() {
        if (this.putDelaying) return this.putDelaying;
        this.putDelaying = this.putCore();
    }
    putDelaying: Promise<void> | null = null;
    putInProgress: Promise<void> | null = null;
    private async putCore() {
        try {
            if (this.putInProgress) await this.putInProgress;
            await sleepAsync(10);
            await user.waitLogin(true);
            if (this.fetching) await this.fetching;
            if (this.posting) await this.posting;
            if (!this.apiid) throw new Error('cannot put: no apiid');
        } catch (error) {
            this.putDelaying = null;
            console.error('[TrackList] pre-put error', error);
        }
        const origVersion = this.info!.version;
        try {
            [this.putInProgress, this.putDelaying] = [this.putDelaying, null];
            var obj = this.getTrackListPutInfo();
            this.info!.version++;
            await api.put({
                path: 'lists/' + this.apiid,
                obj: obj
            });
        } catch (error) {
            this.info!.version = origVersion;
            console.error('[TrackList] put error', this, error);
            if (error instanceof Error && error.message == "list_changed") {
                Toast.show(I`Failed to sync playlist "${this.name}": the list was changed by other client. Please refresh and try again.` + '\n' + error, 3000);
            } else {
                Toast.show(I`Failed to sync playlist "${this.name}".` + '\n' + error, 3000);
                throw error;
            }
        } finally {
            this.putInProgress = null;
        }
    }
    async fetchImpl() {
        const li = new LoadingIndicator();
        this.setLoadIndicator(li);
        try {
            if (!this.apiid) throw new Error('Cannot fetch: no apiid');
            const obj = await api.getListAsync(this.apiid);
            this.loadFromGetResult(obj);
            this.setLoadIndicator(null);
        } catch (err) {
            li.error(err, () => this.fetch(true));
            throw err;
        }
        if (!this.eventListening && this.apiid != null) {
            msgcli.listenEvent("l-" + this.apiid, (data) => {
                console.info(data, this.version);
                if (typeof data.version == 'number' && data.version == this.version)
                    return;
                this.fetch(true);
            }, true);
        }
    }
    async rename(newName: string) {
        this.info!.name = newName;
        this.onInfoChanged();
        await this.put();
    }
    onInfoChanged() {
        var newName = this.name!;
        var header = this.contentView?.header;
        if (header) header.updateWith({ title: newName });
        listIndex.onInfoChanged(this.id!, this.info!);
    }

    createView(): ContentView {
        return this.contentView = this.contentView || new TrackListView(this);
    }
    getNextTrack(track: Track, loopMode: PlayingLoopMode, offset?: number): Track | null {
        offset = offset ?? 1;
        var bind = track._bind;
        if (!bind) return null;
        var position = bind.position;
        if (bind?.list !== this) return null;
        if (this.listView)
            position = position ?? this.listView.find(x => x.track === track)?.position
                ?? this.listView.find(x => x.track.id === track.id)?.position;
        position = position ?? this.tracks.indexOf(track);
        if (position == null || position < 0) position = this.tracks.findIndex(x => x.id === track.id);
        if (position == null || position < 0) return null;
        if (loopMode === 'list-seq') {
            return this.tracks[position + offset] ?? null;
        } else if (loopMode === 'list-loop') {
            return this.tracks[mod(position + offset, this.tracks.length)] ?? null;
        } else if (loopMode === 'list-shuffle') {
            if (!this.tracksSuffled) {
                this.tracksSuffled = this.tracks.slice(0);
                shuffleArray(this.tracksSuffled);
            }
            var suffled = this.tracksSuffled;
            position = suffled.indexOf(track);
            if (!position || position < 0) position = suffled.findIndex(x => x.id === track.id);
            return suffled[mod(position + offset, suffled.length)] ?? null;
        } else if (loopMode === 'track-loop') {
            return track;
        } else {
            console.warn('[TrackList] unknown loopMode', loopMode);
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
                lvi.track._bind!.position = lvi.position;
                lvi.updateDom();
                return lvi.track;
            });
        } else {
            this.tracks.forEach((t, i) => t._bind!.position = i);
        }
    }

    updateTrackInfo(track: Track, newInfo: Api.Track) {
        track.updateFromApiTrack(newInfo);
        if (this.listView) this.listView.get(track._bind!.position!).updateDom();
    }
    remove(track: Track, put?: boolean) {
        this.remove_NoUpdating(track);
        this.updateTracksState();
        this.contentView?.updateView();
        if (put === undefined || put) this.put();
    }

    private remove_NoUpdating(track: Track) {
        var pos = track._bind!.position;
        if (pos == null) return;
        track._bind = undefined;
        this.tracks.splice(pos, 1);
        this.tracksSuffled?.remove(track);
        if (this.listView)
            this.listView.remove(pos);
    }
}

export class TrackListView extends ListContentView {
    list: TrackList;
    listView: LazyListView<TrackViewItem>;
    curPlaying = new ItemActiveHelper<TrackViewItem>({
        funcSetActive: function (item, val) { item.updateWith({ playing: val }); }
    });
    trackActionHandler: TrackActionHandler<TrackViewItem> = {};
    currentTracking = false;
    scrollAnimator: ScrollAnimator | undefined = undefined;
    constructor(list: TrackList) {
        super();
        this.canMultiSelect = true;
        this.list = list;
        this.trackActionHandler.onTrackRemove = (items) =>
            items.forEach(x => this.list.remove(x.track));
        this.trackActionHandler.canRemove = (items) => this.list.canEdit;
    }
    createHeader() {
        return new ContentHeader({
            catalog: () => I`Playlist`,
            title: this.list.name ?? '',
            titleEditable: !!this.list.rename,
            onTitleEdit: (newName) => this.list.rename(newName)
        });
    }
    protected appendHeader() {
        super.appendHeader();
        this.refreshBtn.onActive.add(() => {
            this.list.fetch(true);
        });
    }
    onShow() {
        super.onShow();
        this.shownEvents.add(playerCore.onTrackChanged, this.trackChanged);
        this.shownEvents.add(user.onSwitchedUser, () => { this.list.updateCanEdit(); })();
        this.list.fetch();
        this.trackChanged();
    }
    onRemove() {
        super.onRemove();
    }
    onSidebarItemReactived() {
        this.centerCurrentTrack();
    }
    private centerCurrentTrack() {
        this.currentTracking = true;
        const current = this.curPlaying.current;
        if (current) {
            this.scrollAnimator?.scrollTo(current.dom.offsetTop + current.dom.offsetHeight / 2);
        }
    }
    protected appendListView() {
        super.appendListView();
        var lv = this.listView;
        lv.dom.classList.add('tracklistview');
        this.list.listView = lv;
        lv.dragging = true;
        if (this.list.canEdit) lv.moveByDragging = true;
        lv.onItemMoved = () => this.list.updateTracksFromListView();
        lv.onItemClicked = (item) => {
            this.currentTracking = true;
            if (item.track === playerCore.track && playerCore.isPlaying) {
                router.nav('nowplaying');
                return;
            }
            playerCore.playTrack(item.track);
            if (item.track.type == 'video') {
                router.nav('nowplaying');
            }
        };
        this.list.tracks.forEach(t => this.addItem(t, undefined, false));
        if (this.list.loadIndicator) this.useLoadingIndicator(this.list.loadIndicator);
        this.updateView();

        this.scrollAnimator = new ScrollAnimator(this.scrollBox);
        this.scrollAnimator.posType = 'center';
    }
    addItem(t: Track, pos?: number, updateView?: boolean) {
        var item = this.createViewItem(t);
        this.listView.add(item, pos);
        this.updateCurPlaying(item);
        if (updateView == null || updateView) this.updateView();
    }
    protected createViewItem(t: Track) {
        var view = new TrackViewItem(t);
        view.actionHandler = this.trackActionHandler;
        return view;
    }
    protected updateCurPlaying(item?: TrackViewItem) {
        const playing = playerCore.track;
        if (item === undefined) {
            if (playing) {
                const identical = (playing._bind?.list === this.list && playing._bind.position != undefined) ? this.listView.get(playing._bind.position) :
                    (playing && this.listView.find(x => x.track === playing))
                    ?? this.listView.find(x => x.track.id === playing.id);
                this.curPlaying.set(identical);
            } else {
                this.curPlaying.set(null);
            }
        } else if (playing) {
            const track = item.track;
            if (track === playing
                || (!this.curPlaying.current && track.id === playing.id)) {
                this.curPlaying.set(item);
            }
        }
    }
    private trackChanged = () => {
        this.updateCurPlaying();
        if (this.currentTracking) {
            this.centerCurrentTrack();
        }
    };
};

export class TrackViewItem extends ListViewItem {
    track: Track;
    //@ts-expect-error
    dom: HTMLDivElement;
    actionHandler: TrackActionHandler<this> | null = null;
    noPos: boolean = false;
    playing: boolean = false;
    constructor(item: Track) {
        super();
        this.track = item;
    }
    get dragData() { return `${this.track.name} - ${this.track.artist}`; }
    createDom(): BuildDomExpr {
        return {
            tag: 'li.item.trackitem.no-selection',
            tabIndex: 0,
            child: [
                {
                    tag: 'div.picbox',
                    child: [
                        {
                            tag: 'img.pic',
                            loading: 'lazy',
                            height: 128,
                            width: 128,
                            update: (dompic: HTMLImageElement) => {
                                let bg = '';
                                if (this.track.thumburl) {
                                    bg = api.processUrl(this.track.thumburl) ?? '';
                                }
                                if (bg != dompic.src) dompic.src = bg;
                                toggleClass(dompic, "nopic", !bg);
                            },
                        },
                        {
                            tag: 'span.pos',
                            update: (dompos) => {
                                if (this.playing) {
                                    clearChildren(dompos);
                                    dompos.appendChild(new Icon({ icon: svgPlayArrow }).dom);
                                } else if (!this.noPos) {
                                    dompos.textContent = this.track._bind?.position != null
                                        ? (this.track._bind.position + 1).toString() : '';
                                }
                                toggleClass(dompos, "withpic", !!this.track.thumburl);
                                dompos.hidden = this.noPos && !this.playing;
                            }
                        }
                    ]
                },
                { tag: 'span.name', text: () => this.track.name },
                { tag: 'span.artist', text: () => this.track.artist },
                { tag: 'span.duration', text: () => formatTime(this.track.length) },
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
        var selected: this[] = (this.selected && this.selectionHelper) ? this.selectionHelper.selectedItems : [this];
        var m = new ContextMenu();
        if (selected.length == 1) {
            if (item.track.id && user.state != 'none' && user.serverOptions.trackCommentsEnabled !== false) m.add(new MenuItem({
                text: I`Comments`, onActive: () => {
                    router.nav(['track-comments', item.track.id.toString()]);
                }
            }));
            if (settings.showDownloadOptions && this.track.url) {
                var ext = this.track.getExtensionName();
                ext = ext ? (ext.toUpperCase() + ', ') : '';
                var fileSize = formatFileSize(this.track.size);
                var files = [...(this.track.files ?? [])];
                files.sort((a, b) => b.bitrate - a.bitrate);
                if (!files.find(f => f.profile === ''))
                    m.add(new MenuLinkItem({
                        text: I`Download` + ' (' + ext + fileSize + ')',
                        link: api.processUrl(this.track.url)!,
                        download: this.track.artist + ' - ' + this.track.name + '.' + ext
                    }));
                files.forEach(f => {
                    var format = f.format?.toUpperCase();
                    var url = this.track.getFileUrl(f);
                    if (url) m.add(new MenuLinkItem({
                        text: I`Download` + ' (' + format + ', ' + f.bitrate + ' Kbps)',
                        link: api.processUrl(url)!,
                        download: this.track.artist + ' - ' + this.track.name + '.' + format
                    }));
                    else if (this.track.canEdit) m.add(new MenuItem({
                        text: I`Convert` + ' (' + format + ', ' + f.bitrate + ' Kbps)',
                        onActive: () => {
                            this.track.requestFileUrl(f);
                        }
                    }));
                });
            }
            if (this.track.picurl) {
                m.add(new MenuLinkItem({
                    text: I`Show picture`,
                    link: api.processUrl(this.track.picurl)!,
                }));
            }
        }
        if (this.track.canEdit) [0, 1].forEach(visi => {
            var count = 0;
            for (const item of selected) {
                if (item.track.visibility != visi) count++;
            }
            if (!count) return;
            m.add(new MenuItem({
                text: i18n.get(
                    (count == 1) ?
                        'make_it_visibility_' + visi :
                        'make_{0}_visibility_' + visi,
                    [count]
                ),
                onActive: () => {
                    api.post({
                        path: 'tracks/visibility',
                        obj: {
                            trackids: selected.map(x => x.track.id),
                            visibility: visi
                        } as Api.VisibilityChange
                    }).then(r => {
                        selected.forEach(t => {
                            t.track.infoObj!.visibility = visi;
                            api.onTrackInfoChanged.invoke(t.track.infoObj!);
                        });
                    });
                }
            }));
        });
        if (selected.length == 1) {
            if (this.track.visibility == 1) m.add(new CopyMenuItem({
                text: I`Copy link`,
                textToCopy: api.appBaseUrl + '#track/' + this.track.id
            }));
            m.add(new MenuItem({
                text: this.track.canEdit ? I`Edit` : I`Details`,
                onActive: (ev) => this.track.startEdit(ev)
            }));
            if (this.actionHandler?.onTrackRemove && this.actionHandler?.canRemove?.([this]) != false) m.add(new MenuItem({
                text: I`Remove`, cls: 'dangerous',
                onActive: () => this.actionHandler!.onTrackRemove?.([this])
            }));
        }
        if (this.actionHandler?.onTrackRemove && selected.length > 1
            && this.actionHandler?.canRemove?.([...selected]) != false)
            m.add(new MenuItem({
                text: I`Remove ${selected.length} tracks`, cls: 'dangerous',
                onActive: () => {
                    this.actionHandler!.onTrackRemove?.([...selected]);
                }
            }));
        let infoText = I`Track ID` + ': ' +
            selected.map(x => x.track.id).join(', ') + '\n'
            + I`Duration` + ': ' +
            formatTime(arraySum(selected, x => x.track.length!)) + '\n'
            + I`Size` + ': ' +
            formatFileSize(arraySum(selected, x => x.track.size!));
        if (selected.length == 1) {
            const my = (this.track.owner == user.info.id) ? 'my_' : '';
            infoText += '\n' + i18n.get(my + 'visibility_' + selected[0].track.visibility);
        }
        m.add(new MenuInfoItem({ text: infoText }));
        ui.showContextMenuForItem(selected, m, { ev: ev });
    };
}

export interface TrackActionHandler<T> {
    /** When undefined, the item is not removable */
    onTrackRemove?(arr: T[]);
    canRemove?(arr: T[]): boolean;
}

/**
 * Randomize array in-place using Durstenfeld shuffle algorithm
 * @see https://stackoverflow.com/a/12646864
 */
function shuffleArray(array: any[]) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
