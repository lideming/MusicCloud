// file: viewlib.ts

type ViewArg = View | HTMLElement;

class View {
    constructor(dom?: BuildDomExpr) {
        if (dom) this._dom = utils.buildDOM(dom) as HTMLElement;
    }
    protected _dom: HTMLElement;
    public get dom() {
        this.ensureDom();
        return this._dom;
    }
    public ensureDom() {
        if (!this._dom) {
            this._dom = utils.buildDOM(this.createDom()) as HTMLElement;
            this.postCreateDom(this._dom);
            this.updateDom();
        }
    }
    protected createDom(): BuildDomExpr {
        return document.createElement('div');
    }
    /** Will be called when the dom is created */
    protected postCreateDom(element: HTMLElement) {
    }
    /** Will be called when the dom is created, after postCreateDom() */
    public updateDom() {
    }
    toggleClass(clsName: string, force?: boolean) {
        utils.toggleClass(this.dom, clsName, force);
    }
    static getDOM(view: HTMLElement | View): HTMLElement {
        if (!view) throw new Error('view is undefined or null');
        if (view instanceof View) return view.dom;
        if (view instanceof HTMLElement) return view;
        console.error('getDOM(): unknown type: ', view);
        throw new Error('Cannot get DOM: unknown type');
    }
}

/** DragManager is used to help exchange infomation between views */
var dragManager = new class DragManager {
    /** The item being draging */
    _currentItem: any;
    get currentItem() { return this._currentItem; };
    start(item: any) {
        this._currentItem = item;
    }
    end(item: any) {
        this._currentItem = null;
    }
};

abstract class ListViewItem extends View {
    _listView: ListView;
    _position: number;
    get listview() { return this._listView; }
    get position() { return this._position; }

    get dragData() { return this.dom.textContent; }

    protected postCreateDom(element: HTMLElement) {
        super.postCreateDom(element);
        this.dom.addEventListener('click', () => {
            this._listView?.onItemClicked?.(this);
        });
        this.dom.addEventListener('dragstart', (ev) => {
            if (!this._listView?.dragging) return;
            dragManager.start(this);
            ev.dataTransfer.setData('text/plain', this.dragData);
            this.dom.style.opacity = '.5';
        });
        this.dom.addEventListener('dragend', (ev) => {
            dragManager.end(this);
            ev.preventDefault();
            this.dom.style.opacity = null;
        });
        this.dom.addEventListener('dragover', (ev) => {
            this.dragHanlder(ev, 'dragover');
        });
        this.dom.addEventListener('dragenter', (ev) => {
            this.dragHanlder(ev, 'dragenter');
        });
        this.dom.addEventListener('dragleave', (ev) => {
            this.dragHanlder(ev, 'dragleave');
        });
        this.dom.addEventListener('drop', (ev) => {
            this.dragHanlder(ev, 'drop');
        });
    }
    // https://stackoverflow.com/questions/7110353
    private enterctr = 0;
    private dragoverPlaceholder: HTMLElement;
    dragHanlder(ev: DragEvent, type: string) {
        var item = dragManager.currentItem;
        var drop = type === 'drop';
        if (item instanceof ListViewItem) {
            var arg: DragArg<ListViewItem> = {
                source: item, target: this,
                event: ev, drop: drop,
                accept: false
            };
            if (item.listview === this.listview && this._listView?.moveByDragging) {
                ev.preventDefault();
                if (!drop) {
                    ev.dataTransfer.dropEffect = 'move';
                    arg.accept = item !== this ? 'move' : true;
                    if (arg.accept === 'move' && this.position > item.position) arg.accept = 'move-after';
                } else {
                    if (item !== this) {
                        this.listview.move(item, this.position);
                    }
                }
            }
            if (!arg.accept && this.listview.onDragover) {
                this.listview.onDragover(arg);
                if (drop || arg.accept) ev.preventDefault();
            }
        }
        if (type === 'dragenter' || type === 'dragleave' || drop) {
            if (type === 'dragenter') {
                this.enterctr++;
            } else if (type === 'dragleave') {
                this.enterctr--;
            } else {
                this.enterctr = 0;
            }
            let hover = this.enterctr > 0;
            this.toggleClass('dragover', hover);
            let placeholder = hover && (arg.accept === 'move' || arg.accept === 'move-after');
            if (placeholder != !!this.dragoverPlaceholder) {
                if (placeholder) {
                    this.dragoverPlaceholder = utils.buildDOM({ tag: 'div.dragover-placeholder' }) as HTMLElement;
                    var before = this.dom;
                    if (arg.accept === 'move-after') before = before.nextElementSibling as HTMLElement;
                    this.dom.parentElement.insertBefore(this.dragoverPlaceholder, before);
                } else {
                    this.dragoverPlaceholder.remove();
                    this.dragoverPlaceholder = null;
                }
            }
        }
    };
}

interface DragArg<T> {
    source: ListViewItem, target: T, drop: boolean,
    accept: boolean | 'move' | 'move-after', event: DragEvent;
}

class ListView<T extends ListViewItem = ListViewItem> extends View implements Iterable<T> {
    private items: Array<T> = [];
    onItemClicked: (item: T) => void;
    /**
     * Allow user to drag an item.
     */
    dragging = false;
    /**
     * Allow user to drag an item and change its position.
     */
    moveByDragging = false;
    onItemMoved: (item: T, from: number) => void;
    /** 
     * When an item from another list is dragover or drop
     */
    onDragover: (arg: DragArg<T>) => void;
    constructor(container?: BuildDomExpr) {
        super(container);
    }
    add(item: T, pos?: number) {
        if (item._listView) throw new Error('the item is already in a listview');
        item._listView = this;
        if (pos === undefined || pos >= this.items.length) {
            this.dom.appendChild(item.dom);
            item._position = this.items.length;
            this.items.push(item);
        } else {
            this.dom.insertBefore(item.dom, this.get(pos).dom);
            this.items.splice(pos, 0, item);
            for (let i = pos; i < this.items.length; i++) {
                this.items[i]._position = i;
            }
        }
        if (this.dragging) item.dom.draggable = true;
    }
    remove(item: T | number) {
        item = this._ensureItem(item);
        item.dom.remove();
        this.items.splice(item._position, 1);
        var pos = item.position;
        item._listView = item._position = null;
        for (let i = pos; i < this.items.length; i++) {
            this.items[i]._position = i;
        }
    }
    move(item: T | number, newpos: number) {
        item = this._ensureItem(item);
        this.remove(item);
        this.add(item, newpos);
        this.onItemMoved(item, item.position);
    }
    clear() {
        utils.clearChilds(this.dom);
        this.items = [];
    }
    [Symbol.iterator]() { return this.items[Symbol.iterator](); }
    get length() { return this.items.length; }
    get(idx: number) {
        return this.items[idx];
    }
    map<TRet>(func: (lvi: T) => TRet) { return utils.arrayMap(this, func); }
    find(func: (lvi: T, idx: number) => any) { return utils.arrayFind(this, func); }
    private _ensureItem(item: T | number) {
        if (typeof item === 'number') item = this.get(item);
        else if (!item) throw new Error('item is null or undefined.');
        else if (item._listView !== this) throw new Error('the item is not in this listview.');
        return item;
    }
    ReplaceChild(dom: ViewArg) {
        this.clear();
        this.dom.appendChild(View.getDOM(dom));
    }
}

type SectionActionOptions = { text: string, onclick: Action; };

class Section extends View {
    titleDom: HTMLSpanElement;
    constructor(arg?: { title?: string, content?: ViewArg, actions?: SectionActionOptions[]; }) {
        super();
        this.ensureDom();
        if (arg) {
            if (arg.title) this.setTitle(arg.title);
            if (arg.content) this.setContent(arg.content);
            if (arg.actions) arg.actions.forEach(x => this.addAction(x));
        }
    }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.section',
            child: [
                {
                    tag: 'div.section-header',
                    child: [
                        { tag: 'span.section-title', _key: 'titleDom' }
                    ]
                }
                // content element(s) here
            ]
        };
    }
    setTitle(text: string) {
        this.titleDom.textContent = text;
    }
    setContent(view: ViewArg) {
        var dom = this.dom;
        var firstChild = dom.firstChild;
        while (dom.lastChild !== firstChild) dom.removeChild(dom.lastChild);
        dom.appendChild(View.getDOM(view));
    }
    addAction(arg: SectionActionOptions) {
        this.titleDom.parentElement.appendChild(utils.buildDOM({
            tag: 'div.section-action.clickable',
            textContent: arg.text,
            onclick: arg.onclick
        }));
    }
}

type LoadingIndicatorState = 'normal' | 'running' | 'error';

class LoadingIndicator extends View {
    constructor(arg?: { status?: LoadingIndicatorState, content?: string, onclick?: Action<MouseEvent>; }) {
        super();
        if (arg) {
            if (arg.status) this.state = arg.status;
            if (arg.content) this.content = arg.content;
            if (arg.onclick) this.onclick = arg.onclick;
        }
    }
    private _status: LoadingIndicatorState = 'running';
    get state() { return this._status; }
    set state(val: LoadingIndicatorState) {
        this._status = val;
        ['running', 'error', 'normal'].forEach(x => this.toggleClass(x, val == x));
    }
    private _text: string;
    private _textdom: HTMLElement;
    get content() { return this._text; }
    set content(val: string) { this._text = val; this.ensureDom(); this._textdom.textContent = val; }
    onclick: (e: MouseEvent) => void;
    reset() {
        this.state = 'running';
        this.content = 'Loading';
        this.onclick = null;
    }
    error(err, retry: Action) {
        this.state = 'error';
        this.content = 'Oh no! Something just goes wrong:\n' + err;
        if (retry) {
            this.content += '\n[Click here to retry]';
        }
        this.onclick = retry as any;
    }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.loading-indicator',
            child: [{
                tag: 'div.loading-indicator-inner',
                child: [{ tag: 'div.loading-indicator-text', _key: '_textdom' }]
            }],
            onclick: (e) => this.onclick && this.onclick(e)
        };
    }
    postCreateDom() {
        this.reset();
    }
}

class Overlay extends View {
    createDom() {
        return { tag: 'div.overlay' };
    }
    setCenterChild(centerChild: boolean) {
        this.toggleClass('centerchild', centerChild);
        return this;
    }
}

// TODO: class ContextMenu
