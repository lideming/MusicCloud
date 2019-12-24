// file: ListIndex.ts
/// <reference path="main.ts" />

class ListIndex {
    loadedList: { [x: number]: TrackList; } = {};
    listView: ListView<ListIndexViewItem>;
    section: Section;
    loadIndicator = new LoadingIndicator();
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
        ui.sidebarList.container.appendView(this.section);
        // listIndex.fetch();
    }
    /** Fetch lists from API and update the view */
    async fetch() {
        this.loadIndicator.reset();
        this.listView.ReplaceChild(this.loadIndicator.dom);
        try {
            var index = await api.getListIndexAsync();
            this.setIndex(index);
        } catch (err) {
            this.loadIndicator.error(err, () => this.fetch());
        }
        if (this.listView.length > 0) this.listView.onItemClicked(this.listView.get(0));
    }
    setIndex(index: Api.TrackListIndex) {
        this.listView.clear();
        for (const item of index.lists) {
            this.addListInfo(item);
        }
        if (this.listView.length > 0 && !ui.content.current) this.listView.onItemClicked(this.listView.get(0));
    }
    addListInfo(listinfo: Api.TrackListInfo) {
        this.listView.add(new ListIndexViewItem(this, listinfo));
    }
    getListInfo(id: number) {
        for (const l of this.listView) {
            if (l.listInfo.id === id) return l.listInfo;
        }
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
    showTracklist(id: number) {
        var list = this.getList(id);
        ui.content.setCurrent(list.createView());
    }
    onrename(id: number, newName: string) {
        var lvi = this.listView.find(lvi => lvi.listInfo.id == id);
        lvi.listInfo.name = newName;
        lvi.updateDom();
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

class ListIndexViewItem extends ListViewItem {
    index: ListIndex;
    listInfo: Api.TrackListInfo;
    constructor(index: ListIndex, listInfo: Api.TrackListInfo) {
        super();
        this.index = index;
        this.listInfo = listInfo;
    }
    protected createDom(): BuildDomExpr {
        return {
            tag: 'div.item.no-selection',
            oncontextmenu: (e) => {
                e.preventDefault();
                var m = new ContextMenu([
                    new MenuInfoItem({ text: I`List ID` + ': ' + this.listInfo.id })
                ]);
                m.show({ ev: e });
            }
        };
    }
    updateDom() {
        this.dom.textContent = this.listInfo.name;
    }
}
