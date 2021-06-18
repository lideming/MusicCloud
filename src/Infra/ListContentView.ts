// file: ListContentView.ts

import { View, ListViewItem, ListView, LazyListView, LoadingIndicator, buildDOM } from "./viewlib";
import { I } from "../I18n/I18n";
import { ContentView, ContentHeader, ActionBtn } from "./ui-views";

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
        super.postCreateDom();
        this.dataList.forEach(data => this.add(this.createListViewItem(data)));
    }
}


export class ListContentView extends ContentView {
    //@ts-expect-error
    dom: HTMLElement;

    header: ContentHeader;
    refreshBtn: ActionBtn;
    selectAllBtn: ActionBtn;
    selectBtn: ActionBtn;

    scrollBox: View;
    listView: LazyListView<ListViewItem>;
    loadingIndicator: LoadingIndicator | null;
    emptyIndicator: LoadingIndicator;

    _scrollPos = 0;

    get rendered() { return this.domCreated; }

    private _canMultiSelect: boolean;
    public get canMultiSelect(): boolean { return this._canMultiSelect; }
    public set canMultiSelect(v: boolean) {
        this._canMultiSelect = v;
        if (this.selectBtn) this.selectBtn.hidden = !this.canMultiSelect;
        if (this.listView) this.listView.selectionHelper.ctrlForceSelect = this.canMultiSelect;
    }

    createDom() {
        return buildDOM({ tag: 'div.listcontentview' });
    }

    postCreateDom() {
        super.postCreateDom();
        this.appendHeader();
        this.appendScrollBox();
    }

    title: string;
    protected createHeader(): ContentHeader {
        return new ContentHeader({ title: this.title });
    }

    protected appendHeader() {
        this.header = this.createHeader();
        this.header.actions.addView(this.refreshBtn = new ActionBtn({ text: I`Refresh` }));
        this.header.actions.addView(this.selectAllBtn = new ActionBtn({ text: I`Select all` }));
        this.header.actions.addView(this.selectBtn = new ActionBtn({ text: I`Select` }));
        this.selectBtn.onActive.add(() => {
            this.listView.selectionHelper.enabled = !this.listView.selectionHelper.enabled;
        });
        this.selectAllBtn.onActive.add(() => {
            this.listView.forEach(x => this.listView.selectionHelper.toggleItemSelection(x, true));
        });
        this.appendView(this.header);
    }

    protected appendScrollBox() {
        this.scrollBox = this.createScrollBox();
        this.appendView(this.scrollBox);
        this.appendListView();
    }

    protected createScrollBox() {
        var scrollbox = new View({ tag: 'div.scrollbox' });
        this.header.bindScrollBox(scrollbox.dom);
        return scrollbox;
    }

    protected appendListView() {
        this.listView = new LazyListView({ tag: 'ul.listview' });
        this.listView.lazy = true;
        this.listView.selectionHelper.onEnabledChanged.add(() => {
            this.selectBtn.hidden = !this.canMultiSelect && !this.listView.selectionHelper.enabled;
            this.selectBtn.text = this.listView.selectionHelper.enabled ? I`Cancel` : I`Select`;
            this.selectAllBtn.hidden = !this.listView.selectionHelper.enabled;
        })();
        this.listView.selectionHelper.ctrlForceSelect = this.canMultiSelect;
        this.listView.scrollBox = this.scrollBox.dom;
        this.scrollBox.appendView(this.listView);
    }

    onShow() {
        super.onShow();
        this.ensureDom();
        this.listView.unload();
    }
    onDomInserted() {
        super.onDomInserted();
        this.listView.ensureLoaded(50);
        if (this.scrollBox && this._scrollPos) {
            this.listView.dom.style.minHeight = (this._scrollPos + this.scrollBox.dom.offsetHeight) + 'px';
            this.scrollBox.dom.scrollTop = this._scrollPos;
        }
        this.listView.slowlyLoad(-1, 30, true).then(() => {
            this.listView.dom.style.minHeight = '';
        });
        this.header.onScrollboxScroll();
    }
    onRemove() {
        if (this.scrollBox) {
            this._scrollPos = this.scrollBox.dom.scrollTop;
        }
        this.listView.stopLoading();
        super.onRemove();
    }

    useLoadingIndicator(li: LoadingIndicator | null) {
        if (li !== this.loadingIndicator) {
            if (this.rendered) {
                if (this.loadingIndicator) this.loadingIndicator.dom.remove();
                if (li) this.insertLoadingIndicator(li);
            }
            this.loadingIndicator = li;
        }
        this.updateView();
    }

    protected insertLoadingIndicator(li: LoadingIndicator) {
        this.scrollBox.dom.insertBefore(li.dom, this.listView.dom);
    }

    updateView() {
        if (!this.rendered) return;
        if (this.listView.length === 0) {
            if (!this.loadingIndicator) {
                this.emptyIndicator = this.emptyIndicator || new LoadingIndicator({ state: 'normal', content: I`(Empty)` });
                this.useLoadingIndicator(this.emptyIndicator);
            }
        } else {
            if (this.emptyIndicator && this.loadingIndicator === this.emptyIndicator) {
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
