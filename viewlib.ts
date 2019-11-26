// file: viewlib.ts

class View {
    protected _dom: HTMLElement
    public get dom() {
        return this._dom = this._dom || this.createDom();
    }
    protected createDom(): HTMLElement {
        return document.createElement('div');
    }
    toggleClass(clsName: string, force?: boolean) {
        utils.toggleClass(this.dom, clsName, force);
    }
}

abstract class ListViewItem extends View {
}

class ListView<T extends ListViewItem> {
    container: HTMLElement;
    items: T[];
    onItemClicked: (item: T) => void;
    constructor(container: BuildDomExpr) {
        this.container = utils.buildDOM(container) as HTMLElement;
        this.items = [];
    }
    add(item: T) {
        item.dom.addEventListener('click', () => {
            if (this.onItemClicked) this.onItemClicked(item);
        });
        this.container.appendChild(item.dom);
        this.items.push(item);
    }
    clear() {
        utils.clearChilds(this.container);
        this.items = [];
    }
    get(idx: number) {
        return this.items[idx];
    }
    clearAndReplaceDom(dom: Node) {
        this.clear();
        this.container.appendChild(dom);
    }
}