// file: ListIndex.ts

import { ListView, Section, LoadingIndicator, ContextMenu, MenuItem, MenuInfoItem, Toast, i18n, jsx, jsxBuild, SectionAction, clearChildren, createName, objectApply, appendView } from "../Infra/viewlib";
import { BuildDomExpr } from "../Infra/utils";
import { I } from "../I18n/I18n";
import { TrackList, TrackViewItem, TrackListView } from "./TrackList";
import { user } from "../API/User";
import { Api } from "../API/apidef";
import { router } from "../Infra/Router";
import { ui } from "../Infra/UI";
import { SidebarItem, setScrollableShadow, CopyMenuItem, Icon } from "../Infra/ui-views";
import { playerCore } from "../Player/PlayerCore";
import { api } from "../API/Api";
import { uploads } from "./Uploads";
import svgAudio from "../../resources/audiotrack-24px.svg";
import svgAdd from "../../resources/add-24px.svg";

export class ListIndex {
    loadedList: { [x: number]: TrackList; } = {};
    listView: ListView<ListIndexViewItem>;
    section: Section;
    loadIndicator = new LoadingIndicator();
    playing: TrackList | null = null;
    constructor() {
        this.listView = new ListView({ tag: 'ul' });
        this.listView.dragging = true;
        this.listView.moveByDragging = true;
        this.listView.onItemMoved = (item, from) => {
            this.putUser();
        };
        this.listView.onDragover = (arg) => {
            const src = arg.source;
            const data = arg.event.dataTransfer;
            if (!data) return;
            if (src instanceof TrackViewItem) {
                arg.accept = true;
                data.dropEffect = 'copy';
                if (arg.drop) {
                    const list = this.getList(arg.target.listInfo.id);
                    list.fetch().then(r => {
                        for (const item of arg.sourceItems as TrackViewItem[]) {
                            list.addTrack(item.track.toApiTrack(), arg.event.altKey ? undefined : 0);
                        }
                        return list.put();
                    }).catch(err => {
                        console.error('[ListIndex] error adding track:', err);
                    });
                }
            } else if (data.files.length > 0) {
                data.effectAllowed = 'copy';
                arg.accept = true;
                if (arg.drop) {
                    const list = this.getList(arg.target.listInfo.id);
                    for (let i = 0; i < data.files.length; i++) {
                        const file = data.files[i];
                        uploads.uploadFile(file).then(async track => {
                            if (!track) return;
                            await list.fetch();
                            list.addTrack(track.toApiTrack(), arg.event.altKey ? undefined : 0);
                            await list.put();
                        }).catch(err => {
                            console.error('[ListIndex] error adding track:', err);
                        });
                    }
                }
            }
        };
        this.listView.onItemClicked = (item) => {
            if (ui.sidebarList.currentActive.current === item) {
                item.contentView?.onSidebarItemReactived();
                return;
            }
            ui.sidebarList.setActive(item);
            this.showTracklist(item.listInfo.id);
        };
    }
    private putUser() {
        user.setListids(this.listView.map(l => l.listInfo.id));
    }

    init() {
        playerCore.onTrackChanged.add(() => {
            var curPlaying = playerCore.track?._bind?.list ?? null;
            if (curPlaying != this.playing) {
                if (curPlaying?.id) this.getViewItem(curPlaying.id)?.updateWith({ playing: true });
                if (this.playing?.id) this.getViewItem(this.playing.id)?.updateWith({ playing: false });
                this.playing = curPlaying;
            }
        });
        api.onTrackInfoChanged.add((newer: Api.Track) => {
            for (const id in this.loadedList) {
                if (this.loadedList.hasOwnProperty(id)) {
                    const list = this.loadedList[id];
                    list.tracks.forEach(t => {
                        if (t.id === newer.id) {
                            list.updateTrackInfo(t, newer);
                        }
                    });
                }
            }
        });
        api.onTrackDeleted.add((deleted) => {
            for (const id in this.loadedList) {
                if (this.loadedList.hasOwnProperty(id)) {
                    const list = this.loadedList[id];
                    list.tracks.forEach(t => {
                        if (t.id === deleted.id) {
                            list.remove(t, false);
                        }
                    });
                }
            }
        });
        this.section = new Section({
            title: () => I`Playlists`,
            content: this.listView
        });
        const icon = new Icon({ icon: svgAdd });
        icon.dom.style.fontSize = '1.4em';
        this.section.addAction(jsxBuild<SectionAction>(jsx(SectionAction, {
            onActive: () => {
                this.newTracklist();
            }
        }, [icon])));
        ui.sidebarList.container.appendView(this.section);
        ui.sidebar.dom.addEventListener('scroll', (ev) => {
            if (ev.eventPhase === Event.AT_TARGET) {
                var dom = this.section.headerView.dom;
                setScrollableShadow(dom, dom.offsetTop + dom.offsetHeight - this.listView.dom.offsetTop);
            }
        }, { passive: true });
        this.listView.scrollBox = ui.sidebar.dom;
        router.addRoute({
            path: ['list'],
            onNav: async (arg) => {
                await user.waitLogin(false);
                var id = window.parseInt(arg.remaining[0]);
                var list = this.getList(id);
                var content = list.createView();
                ui.content.setCurrent(content);
                var item = this.getViewItem(id);
                ui.sidebarList.setActive(item);
                if (!item) {
                    await list.fetch();
                    item = this.addListInfo(list.info!);
                    if (user.state == 'logged')
                        this.putUser();
                }
                item.contentView = content;
            }
        });
        router.addRoute({
            path: [''],
            onNav: async (arg) => {
                if (await user.waitLogin(false)) {
                    if (this.listView.length > 0)
                        router.nav(['list', this.listView.get(0).listInfo.id.toString()], { pushState: false });
                }
            }
        });
    }
    setIndex(index: Api.TrackListIndex | null) {
        this.listView.clear();
        for (const item of index?.lists ?? []) {
            this.addListInfo(item);
        }
    }
    addListInfo(listinfo: Api.TrackListInfo) {
        var item = new ListIndexViewItem({
            index: this, listInfo: listinfo,
            playing: listinfo.id === playerCore.track?._bind?.list?.id
        });
        this.listView.add(item);
        var curContent = ui.content.current;
        if (curContent instanceof TrackListView && curContent.list?.id === listinfo.id)
            ui.sidebarList.setActive(item);
        return item;
    }
    getListInfo(id: number) {
        return this.getViewItem(id)?.listInfo;
    }
    getList(id: number) {
        var list = this.loadedList[id];
        if (!list) {
            list = new TrackList();
            const listInfo = this.getListInfo(id);
            if (listInfo) {
                list.loadInfo(listInfo);
                if (!list.apiid) list.loadEmpty();
            } else {
                list.loadApiId(id);
            }
            this.loadedList[id] = list;
        }
        return list;
    }
    getViewItem(id: number) {
        return this.listView.find(lvi => lvi.listInfo.id === id);
    }
    showTracklist(id: number) {
        router.nav(['list', id.toString()]);
    }
    onInfoChanged(id: number, info: Api.TrackListInfo) {
        var lvi = this.getViewItem(id);
        if (lvi) {
            objectApply(lvi.listInfo, info);
            lvi.updateDom();
        }
    }

    async removeList(id: number) {
        if (id < 0) {
            id = await this.getList(id).getRealId();
        }
        await api.delete({
            path: 'my/lists/' + id
        });
        this.getViewItem(id)?.remove();
        const curContent = ui.content.current;
        if (curContent instanceof TrackListView && curContent.list.id === id) {
            ui.content.setCurrent(null);
        }
    }

    private nextId = -100;
    private _toastLogin: Toast;
    /** 
     * Create a Tracklist with an temporary local ID (negative number).
     * It should be sync to server and get a real ID later.
     */
    async newTracklist() {
        if (!await user.waitLogin(false)) {
            this._toastLogin = this._toastLogin || new Toast({ text: I`Login to create playlists.` });
            this._toastLogin.show(3000);
            return;
        }
        var id = this.nextId--;
        var list: Api.TrackListInfo = {
            id,
            owner: user.id,
            name: createName(
                (x) => x ? I`New Playlist (${x + 1})` : I`New Playlist`,
                (x) => !!this.listView.find((l) => l.listInfo.name === x)),
            visibility: 0,
            version: 0
        };
        this.addListInfo(list);
        var listview = this.getList(id);
        listview.postToUser().then(() => {
            list.id = listview.apiid!;
        }, (err) => {
            Toast.show(I`Failed to create playlist "${list.name}".` + '\n' + err, 5000);
        });
    }
}

export class ListIndexViewItem extends SidebarItem {
    index: ListIndex;
    listInfo: Api.TrackListInfo;
    playing = false;
    constructor(init: Partial<ListIndexViewItem>) {
        super({});
        objectApply(this, init);
    }
    protected createDom(): BuildDomExpr {
        return {
            tag: 'li.item.indexitem.no-selection',
            tabIndex: 0,
            child: [
                { _id: 'tag', tag: 'span.tag' },
                { tag: 'span.name.flex-1', text: () => this.listInfo?.name ?? this.text },
                {
                    tag: 'span.state',
                    update: (dom) => {
                        var icon = this.playing ? new Icon({ icon: svgAudio }) : null;
                        clearChildren(dom);
                        if (icon) dom.appendChild(icon.dom);
                        dom.hidden = !icon;
                    },
                }
            ]
        };
    }
    updateDom() {
        super.updateDom();
        var domtag = this.getDomById('tag')!;
        var tagText = (!this.listInfo || this.listInfo.visibility == 0) ? "" :
            (this.listInfo.owner == user.id && this.listInfo.visibility == 1) ? I`my_visibility_1` :
                this.listInfo.ownerName;
        domtag.textContent = tagText;
        domtag.style.display = tagText ? 'block' : 'none';
        this.dom.style.paddingTop = tagText ? '6px' : '';
        this.dom.style.paddingBottom = tagText ? '20px' : '';
    }
    onContextMenu = (item: ListIndexViewItem, ev: MouseEvent) => {
        var m = new ContextMenu();
        if (this.index && this.listInfo) {
            if (this.listInfo.visibility == 1) {
                m.add(new CopyMenuItem({
                    text: I`Copy link`,
                    textToCopy: api.appBaseUrl + '#list/' + this.listInfo.id
                }));
            }
            if (this.listInfo.owner == user.id) {
                const targetVisibility = this.listInfo.visibility ? 0 : 1;
                m.add(new MenuItem({
                    text: i18n.get('make_it_visibility_' + targetVisibility),
                    onActive: () => {
                        const list = this.index.getList(item.listInfo.id);
                        list.info!.visibility = targetVisibility;
                        list.onInfoChanged();
                        list.put();
                    }
                }));
            }
            m.add(new MenuItem({
                text: I`Remove`, cls: 'dangerous',
                onActive: () => {
                    this.index.removeList(this.listInfo.id);
                }
            }));
        }
        if (this.listInfo) m.add(new MenuInfoItem({
            text: I`List ID` + ': ' + this.listInfo.id
        }));
        if (m.length) {
            ev.preventDefault();
            ui.showContextMenuForItem([item], m, { ev: ev });
        }
    };
}

export const listIndex = new ListIndex();
