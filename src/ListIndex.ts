// file: ListIndex.ts

import { ListView, Section, LoadingIndicator, ContextMenu, MenuItem, MenuInfoItem } from "./viewlib";
import { I, utils, BuildDomExpr } from "./utils";
import { TrackList, TrackViewItem } from "./tracklist";
import { user } from "./User";
import { Api } from "./apidef";
import { router } from "./Router";
import { ui, SidebarItem } from "./UI";
import { playerCore } from "./PlayerCore";
import { api } from "./Api";

export class ListIndex {
    loadedList: { [x: number]: TrackList; } = {};
    listView: ListView<ListIndexViewItem>;
    section: Section;
    loadIndicator = new LoadingIndicator();
    playing: TrackList;
    constructor() {
        this.listView = new ListView();
        this.listView.dragging = true;
        this.listView.moveByDragging = true;
        this.listView.onItemMoved = (item, from) => {
            user.setListids(this.listView.map(l => l.listInfo.id));
        };
        this.listView.onDragover = (arg) => {
            var src = arg.source;
            if (src instanceof TrackViewItem) {
                arg.accept = true;
                arg.event.dataTransfer.dropEffect = 'copy';
                if (arg.drop) {
                    var listinfo = arg.target.listInfo;
                    var list = this.getList(listinfo.id);
                    if (list.fetching) list.fetching.then(r => {
                        list.addTrack((src as TrackViewItem).track.toApiTrack());
                        return list.put();
                    }).catch(err => {
                        console.error('error adding track:', err);
                    });
                }
            }
        };
        this.listView.onItemClicked = (item) => {
            if (ui.sidebarList.currentActive.current === item) return;
            ui.sidebarList.setActive(item);
            this.showTracklist(item.listInfo.id);
        };
        this.section = new Section({
            title: I`Playlists`,
            content: this.listView,
            actions: [{
                text: '➕',
                onclick: () => {
                    this.newTracklist();
                }
            }]
        });
    }
    init() {
        playerCore.onTrackChanged.add(() => {
            var curPlaying = playerCore.track?._bind?.list;
            if (curPlaying != this.playing) {
                if (curPlaying) this.getViewItem(curPlaying.id)?.updateWith({ playing: true });
                if (this.playing) this.getViewItem(this.playing.id)?.updateWith({ playing: false });
                this.playing = curPlaying;
            }
        });
        api.onTrackInfoChanged.add((newer: Api.Track) => {
            for (const id in this.loadedList) {
                if (this.loadedList.hasOwnProperty(id)) {
                    const list = this.loadedList[id];
                    list.tracks.forEach(t => {
                        if (t.id === newer.id) {
                            t.updateFromApiTrack(newer);
                            list.listView.get(t._bind.position).updateDom();
                        }
                    });
                }
            }
        });
        ui.sidebarList.container.appendView(this.section);
        router.addRoute({
            path: ['list'],
            onNav: async (arg) => {
                await user.waitLogin(false);
                var id = window.parseInt(arg.remaining[0]);
                var list = this.getList(id);
                ui.content.setCurrent(list.createView());
                ui.sidebarList.setActive(this.getViewItem(id));
            }
        });
        router.addRoute({
            path: [''],
            onNav: async (arg) => {
                if (await user.waitLogin(false)) {
                    if (this.listView.length > 0)
                        router.nav(['list', this.listView.get(0).listInfo.id.toString()], false);
                }
            }
        });
    }
    setIndex(index: Api.TrackListIndex) {
        this.listView.clear();
        for (const item of index?.lists ?? []) {
            this.addListInfo(item);
        }
    }
    addListInfo(listinfo: Api.TrackListInfo) {
        this.listView.add(new ListIndexViewItem({ index: this, listInfo: listinfo }));
    }
    getListInfo(id: number) {
        return this.getViewItem(id)?.listInfo;
    }
    getList(id: number) {
        var list = this.loadedList[id];
        if (!list) {
            list = new TrackList();
            list.loadInfo(this.getListInfo(id));
            if (list.apiid) {
                list.loadFromApi();
            } else {
                list.loadEmpty();
            }
            this.loadedList[id] = list;
        }
        return list;
    }
    getViewItem(id: number) {
        return this.listView.find(lvi => lvi.listInfo.id == id);
    }
    showTracklist(id: number) {
        router.nav(['list', id.toString()]);
    }
    onrename(id: number, newName: string) {
        var lvi = this.getViewItem(id);
        lvi.listInfo.name = newName;
        lvi.updateDom();
    }

    async removeList(id: number) {
        if (id < 0) {
            id = await this.getList(id).getRealId();
        }
        await api.postJson({
            method: 'DELETE',
            path: 'my/lists/' + id,
            obj: null
        });
        this.getViewItem(id)?.remove();
    }

    private nextId = -100;
    /** 
     * Create a Tracklist with an temporary local ID (negative number).
     * It should be sync to server and get a real ID later.
     */
    newTracklist() {
        var id = this.nextId--;
        var list: Api.TrackListInfo = {
            id,
            name: utils.createName(
                (x) => x ? I`New Playlist (${x + 1})` : I`New Playlist`,
                (x) => !!this.listView.find((l) => l.listInfo.name == x))
        };
        this.addListInfo(list);
        var listview = this.getList(id);
        listview.postToUser().then(() => {
            list.id = listview.apiid;
        });
    }
}

export class ListIndexViewItem extends SidebarItem {
    index: ListIndex;
    listInfo: Api.TrackListInfo;
    playing = false;
    domname: HTMLSpanElement;
    domstate: HTMLSpanElement;
    constructor(init: Partial<ListIndexViewItem>) {
        super({});
        utils.objectApply(this, init);
    }
    protected createDom(): BuildDomExpr {
        return {
            _ctx: this,
            tag: 'div.item.no-selection',
            style: 'display: flex',
            child: [
                { tag: 'span.name.flex-1', _key: 'domname' },
                { tag: 'span.state', style: 'margin-left: .5em; font-size: 80%;', _key: 'domstate' }
            ],
            onclick: (ev) => this.onclick?.(ev)
        };
    }
    updateDom() {
        this.domname.textContent = this.listInfo?.name ?? this.text;
        this.domstate.textContent = this.playing ? "🎵" : "";
        this.domstate.hidden = !this.domstate.textContent;
    }
    onContextMenu = (item: ListIndexViewItem, ev: MouseEvent) => {
        var m = new ContextMenu();
        if (this.index && this.listInfo) m.add(new MenuItem({
            text: I`Remove`, cls: 'dangerous',
            onclick: () => {
                this.index.removeList(this.listInfo.id);
            }
        }));
        if (this.listInfo) m.add(new MenuInfoItem({
            text: I`List ID` + ': ' + this.listInfo.id
        }));
        if (m.length) {
            ev.preventDefault();
            m.show({ ev: ev });
        }
    };
}
