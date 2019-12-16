// file: ListContentView.ts
/// <reference path="main.ts" />

class DataBackedListViewItem extends ListViewItem {
    data: any;
    constructor(data: any) {
        super();
        this.data = data;
    }
}

class DataBackedListView<T extends DataBackedListViewItem, TData> extends ListView<T> {
    /** Do NOT modify this array directly, use {add,remove}Data methods instead. */
    dataList: Array<TData> = [];

    addData(data: TData) {
        this.dataList.push(data);
        if (this._dom) this.add(this.createListViewItem(data));
    }

    removeData(pos: number) {
        var [d] = this.dataList.splice(pos, 1);
        if (this._dom) this.remove(pos);
        return d;
    }

    protected createListViewItem(data: TData): T {
        return new DataBackedListViewItem(data) as any;
    }

    protected postCreateDom() {
        this.dataList.forEach(data => this.add(this.createListViewItem(data)));
    }
}


class ListContentView implements ContentView {
    dom: HTMLElement;
    header: ContentHeader;
    listView: ListView<ListViewItem>;
    loadingIndicator: LoadingIndicator;
    emptyIndicator: LoadingIndicator;

    get rendered() { return !!this.listView; }

    ensureRendered() {
        if (!this.listView) {
            this.dom = this.dom || utils.buildDOM({ tag: 'div' });
            this.appendHeader();
            this.listView = new ListView({ tag: 'div' });
            this.dom.appendView(this.listView);
            this.listviewCreated();
        }
    }

    title: string;
    protected createHeader(): ContentHeader {
        return new ContentHeader({ title: this.title });
    }

    protected appendHeader() {
        this.header = this.createHeader();
        this.dom.appendView(this.header);
    }

    protected listviewCreated() {
    }

    onShow() {
        this.ensureRendered();
    }
    onRemove() {
    }

    useLoadingIndicator(li: LoadingIndicator) {
        if (this.loadingIndicator && this.rendered) this.loadingIndicator.dom.remove();
        if (li && this.rendered) this.insertLoadingIndicator(li);
        this.loadingIndicator = li;
        this.updateView();
    }

    protected insertLoadingIndicator(li: LoadingIndicator) {
        this.dom.insertBefore(li.dom, this.header.dom.nextSibling);
    }

    addTrack(t: UploadTrack, pos?: number) {
        var lvi = new UploadViewItem(t);
        lvi.dragging = true;
        this.listView.add(lvi, pos);
        this.updateView();
    }

    updateView() {
        if (!this.rendered) return;
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