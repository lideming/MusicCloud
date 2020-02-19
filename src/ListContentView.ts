// file: ListContentView.ts

import { ListViewItem, ListView, LoadingIndicator, View } from "./viewlib";
import { ContentHeader, ActionBtn } from "./tracklist";
import { utils, I } from "./utils";
import { ContentView } from "./UI";

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


export class ListContentView implements ContentView {
    dom: HTMLElement;

    header: ContentHeader;
    refreshBtn: ActionBtn;
    selectBtn: ActionBtn;

    listView: ListView<ListViewItem>;
    loadingIndicator: LoadingIndicator;
    emptyIndicator: LoadingIndicator;

    get rendered() { return !!this.listView; }


    private _canMultiSelect: boolean;
    public get canMultiSelect(): boolean { return this._canMultiSelect; }
    public set canMultiSelect(v: boolean) {
        this._canMultiSelect = v;
        if (this.selectBtn) this.selectBtn.hidden = !this.canMultiSelect;
    }


    ensureRendered() {
        if (!this.listView) {
            this.dom = this.dom || utils.buildDOM({ tag: 'div' });
            this.appendHeader();
            this.appendListView();
        }
    }

    title: string;
    protected createHeader(): ContentHeader {
        return new ContentHeader({ title: this.title });
    }

    protected appendHeader() {
        this.header = this.createHeader();
        this.header.actions.addView(this.refreshBtn = new ActionBtn({ text: I`Refresh` }));
        this.header.actions.addView(this.selectBtn = new ActionBtn({ text: I`Select` }));
        this.selectBtn.hidden = !this.canMultiSelect;
        this.selectBtn.onclick = () => {
            this.listView.selectionHelper.enabled = !this.listView.selectionHelper.enabled;
            this.selectBtn.text = this.listView.selectionHelper.enabled ? I`Cancel` : I`Select`;
        };
        this.dom.appendView(this.header);
    }

    protected appendListView() {
        this.listView = new ListView({ tag: 'div' });
        this.dom.appendView(this.listView);
    }

    onShow() {
        this.ensureRendered();
    }
    onRemove() {
    }

    useLoadingIndicator(li: LoadingIndicator) {
        if (li !== this.loadingIndicator) {
            if (this.loadingIndicator && this.rendered) this.loadingIndicator.dom.remove();
            if (li && this.rendered) this.insertLoadingIndicator(li);
            this.loadingIndicator = li;
        }
        this.updateView();
    }

    protected insertLoadingIndicator(li: LoadingIndicator) {
        this.dom.insertBefore(li.dom, this.listView.dom);
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

    async loadingAction(func: () => Promise<void>) {
        var li = this.loadingIndicator || new LoadingIndicator();
        this.useLoadingIndicator(li);
        try {
            await func();
        } catch (error) {
            li.error(error, () => this.loadingAction(func));
            throw error;
        }
        this.useLoadingIndicator(null);
    }
};