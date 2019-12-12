// file: uploads.ts

var uploads = new class {
    tracks: Track[];
    get fetched() { return !!this.tracks; }
    init() {
        ui.sidebarList.container.insertBefore(this.sidebarItem.dom, ui.sidebarList.container.firstChild);
    }
    sidebarItem = new class extends ListViewItem {
        protected createDom(): BuildDomExpr {
            return {
                tag: 'div.item.no-selection',
                textContent: I`My Uploads`,
                onclick: (ev) => {
                    ui.sidebarList.setActive(uploads.sidebarItem);
                    ui.content.setCurrent(uploads.view);
                }
            };
        }
    };
    view = new class implements ContentView {
        dom: HTMLElement;
        header: ContentHeader;
        listView: ListView<UploadViewItem>;
        loadingIndicator: LoadingIndicator;
        emptyIndicator: LoadingIndicator;
        get rendered() { return !!this.listView; }
        onShow() {
            if (!this.dom) {
                this.listView = new ListView({ tag: 'div.tracklist' });
                this.dom = this.listView.dom;
                this.header = new ContentHeader({ title: I`My Uploads` });
                this.dom.appendChild(this.header.dom);
                if (!uploads.fetched) uploads.fetch();
            }
        }
        onRemove() {
        }
        useLoadingIndicator(li: LoadingIndicator) {
            if (this.loadingIndicator && this.rendered) this.loadingIndicator.dom.remove();
            if (li && this.rendered) {
                this.dom.insertBefore(li.dom, this.header.dom.nextSibling);
            }
            this.loadingIndicator = li;
            if (this.rendered) this.updateView();
        }
        addTrack(t: Track) {
            this.listView.add(new UploadViewItem(t));
            this.updateView();
        }
        updateView() {
            if (this.listView.length == 0) {
                if (!this.loadingIndicator) {
                    this.emptyIndicator = this.emptyIndicator || new LoadingIndicator({ state: 'normal', content: I`(Empty)` });
                    this.useLoadingIndicator(this.emptyIndicator);
                }
            } else {
                if (this.emptyIndicator && this.loadingIndicator == this.emptyIndicator) {
                    this.useLoadingIndicator(null);
                }
            }
        }
    };
    async fetch() {
        var li = new LoadingIndicator();
        this.view.useLoadingIndicator(li);
        this.tracks = (await api.getJson('my/uploads'))['tracks'];
        this.view.useLoadingIndicator(null);
        this.view.updateView();
        if (this.view.rendered) this.tracks.forEach(t => this.view.addTrack(t));
    }
};

class UploadViewItem extends TrackViewItem {
    constructor(track: Track) {
        super(track);
    }
}