// file: viewlib.ts

type ViewArg = View | HTMLElement;

class View {
    constructor(dom?: BuildDomExpr) {
        if (dom) this._dom = utils.buildDOM(dom) as HTMLElement;
    }
    protected _dom: HTMLElement;
    public get domCreated() { return !!this._dom; }
    public get dom() {
        this.ensureDom();
        return this._dom;
    }
    public get hidden() { return this.dom.hidden; }
    public set hidden(val: boolean) { this.dom.hidden = val; }
    public ensureDom() {
        if (!this._dom) {
            this._dom = utils.buildDOM(this.createDom()) as HTMLElement;
            this.postCreateDom();
            this.updateDom();
        }
    }
    protected createDom(): BuildDomExpr {
        return document.createElement('div');
    }
    /** Will be called when the dom is created */
    protected postCreateDom() {
    }
    /** Will be called when the dom is created, after postCreateDom() */
    public updateDom() {
    }
    /** Assign key-values and call `updateDom()` */
    updateWith(kv: Partial<this>) {
        utils.objectApply(this, kv);
        this.updateDom();
    }
    toggleClass(clsName: string, force?: boolean) {
        utils.toggleClass(this.dom, clsName, force);
    }
    appendView(view: View) { return this.dom.appendView(view); }
    static getDOM(view: HTMLElement | View): HTMLElement {
        if (!view) throw new Error('view is undefined or null');
        if (view instanceof View) return view.dom;
        if (view instanceof HTMLElement) return view;
        console.error('getDOM(): unknown type: ', view);
        throw new Error('Cannot get DOM: unknown type');
    }
}

interface Node {
    appendView(view: View);
}

Node.prototype.appendView = function (this: Node, view: View) {
    this.appendChild(view.dom);
};

/** DragManager is used to help exchange information between views */
var dragManager = new class DragManager {
    /** The item being dragged */
    _currentItem: any;
    get currentItem() { return this._currentItem; };
    start(item: any) {
        this._currentItem = item;
        console.log('drag start', item);
    }
    end(item: any) {
        this._currentItem = null;
        console.log('drag end');
    }
};

abstract class ListViewItem extends View {
    _listView: ListView;
    _position: number;
    get listview() { return this._listView; }
    get position() { return this._position; }

    get dragData() { return this.dom.textContent; }

    onDragover: ListView['onDragover'];
    onContextMenu: ListView['onContextMenu'];

    dragging?: boolean;

    remove() {
        if (!this._listView) return;
        this._listView.remove(this);
    }

    protected postCreateDom() {
        super.postCreateDom();
        this.dom.addEventListener('click', () => {
            this._listView?.onItemClicked?.(this);
        });
        this.dom.addEventListener('contextmenu', (ev) => {
            (this.onContextMenu ?? this._listView?.onContextMenu)?.(this, ev);
        });
        this.dom.addEventListener('dragstart', (ev) => {
            if (!(this.dragging ?? this._listView?.dragging)) return;
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
            this.dragHandler(ev, 'dragover');
        });
        this.dom.addEventListener('dragenter', (ev) => {
            this.dragHandler(ev, 'dragenter');
        });
        this.dom.addEventListener('dragleave', (ev) => {
            this.dragHandler(ev, 'dragleave');
        });
        this.dom.addEventListener('drop', (ev) => {
            this.dragHandler(ev, 'drop');
        });
    }
    // https://stackoverflow.com/questions/7110353
    private enterctr = 0;
    private dragoverPlaceholder: HTMLElement;
    dragHandler(ev: DragEvent, type: string) {
        var item = dragManager.currentItem;
        var drop = type === 'drop';
        if (item instanceof ListViewItem) {
            var arg: DragArg<ListViewItem> = {
                source: item, target: this,
                event: ev, drop: drop,
                accept: false
            };
            if (this._listView?.moveByDragging && item.listview === this.listview) {
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
            var onDragover = this.onDragover ?? this.listview?.onDragover;
            if (!arg.accept && onDragover) {
                onDragover(arg);
                if (drop || arg.accept) ev.preventDefault();
            }
            var onContextMenu = this.onContextMenu ?? this.listview?.onContextMenu;
            if (!arg.accept && item === this && onContextMenu) {
                if (drop) onContextMenu(this, ev);
                else ev.preventDefault();
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
            let placeholder = hover && !!arg && (arg.accept === 'move' || arg.accept === 'move-after');
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
    onContextMenu: (item: ListViewItem, ev: MouseEvent) => void;
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
    /** Remove all items */
    removeAll() {
        while (this.length) this.remove(this.length - 1);
    }
    /** Remove all items and all DOM children */
    clear() {
        utils.clearChildren(this.dom);
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
    constructor(init?: Partial<LoadingIndicator>) {
        super();
        if (init) utils.objectApply(this, init);
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
        this.content = I`Loading`;
        this.onclick = null;
    }
    error(err, retry: Action) {
        this.state = 'error';
        this.content = I`Oh no! Something just goes wrong:` + '\r\n' + err;
        if (retry) {
            this.content += '\r\n' + I`[Click here to retry]`;
        }
        this.onclick = retry as any;
    }
    async action(func: () => Promise<void>) {
        try {
            await func();
        } catch (error) {
            this.error(error, () => this.action(func));
        }
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

class EditableHelper {
    editing = false;
    beforeEdit: string;
    element: HTMLElement;
    onComplete: (newName: string) => void;
    constructor(element: HTMLElement) {
        this.element = element;
    }
    startEdit(onComplete?: this['onComplete']) {
        if (this.editing) return;
        this.editing = true;
        var ele = this.element;
        var beforeEdit = this.beforeEdit = ele.textContent;
        utils.toggleClass(ele, 'editing', true);
        var input = utils.buildDOM({
            tag: 'input', type: 'text', value: beforeEdit
        }) as HTMLInputElement;
        while (ele.firstChild) ele.removeChild(ele.firstChild);
        ele.appendChild(input);
        input.select();
        input.focus();
        var stopEdit = () => {
            this.editing = false;
            utils.toggleClass(ele, 'editing', false);
            events.forEach(x => x.remove());
            input.remove();
            this.onComplete?.(input.value);
            onComplete?.(input.value);
        };
        var events = [
            utils.addEvent(input, 'keydown', (evv) => {
                if (evv.keyCode == 13) {
                    stopEdit();
                    evv.preventDefault();
                }
            }),
            utils.addEvent(input, 'focusout', (evv) => { stopEdit(); }),
        ];
    }
}

class MenuItem extends ListViewItem {
    text: string;
    cls: 'normal' | 'dangerous' = 'normal';
    onclick: (ev: Event) => void;
    constructor(init: Partial<MenuItem>) {
        super();
        utils.objectApply(this, init);
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'div.item.no-selection',
            onclick: (ev) => {
                if (this._listView instanceof ContextMenu) {
                    if (!this._listView.keepOpen) this._listView.close();
                }
                this.onclick?.(ev);
            }
        };
    }
    private _lastcls;
    updateDom() {
        this.dom.textContent = this.text;
        if (this.cls !== this._lastcls) {
            if (this._lastcls) this.dom.classList.remove(this._lastcls);
            if (this.cls) this.dom.classList.add(this.cls);
        }
    }
}

class MenuLinkItem extends MenuItem {
    link: string;
    download: string;
    constructor(init: Partial<MenuLinkItem>) {
        super(init);
        utils.objectApply(this, init);
    }
    createDom(): BuildDomExpr {
        var dom = super.createDom() as BuildDomNode;
        dom.tag = 'a.item.no-selection';
        dom.target = "_blank";
        return dom;
    }
    updateDom() {
        super.updateDom();
        (this.dom as HTMLAnchorElement).href = this.link;
        (this.dom as HTMLAnchorElement).download = this.download;
    }
}

class MenuInfoItem extends MenuItem {
    text: string;
    constructor(init: Partial<MenuInfoItem>) {
        super(init);
        utils.objectApply(this, init);
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'div.menu-info'
        };
    }
    updateDom() {
        super.updateDom();
        this.dom.textContent = this.text;
    }
}


class ContextMenu extends ListView {
    keepOpen = false;
    useOverlay = true;
    private _visible = false;
    get visible() { return this._visible; };
    overlay: Overlay;
    constructor(items?: MenuItem[]) {
        super({ tag: 'div.context-menu', tabIndex: 0 });
        items?.forEach(x => this.add(x));
    }
    show(arg: { x?: number, y?: number, ev?: MouseEvent; }) {
        if (arg.ev) { arg.x = arg.ev.pageX; arg.y = arg.ev.pageY; }
        this.close();
        this._visible = true;
        if (this.useOverlay) {
            if (!this.overlay) {
                this.overlay = new Overlay();
                this.overlay.dom.style.background = 'rgba(0, 0, 0, .1)';
                this.overlay.dom.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    this.close();
                });
            }
            document.body.appendChild(this.overlay.dom);
        }
        document.body.appendChild(this.dom);
        this.dom.focus();
        this.dom.addEventListener('focusout',
            (e) => !this.dom.contains(e.relatedTarget as HTMLElement) && this.close());
        var width = this.dom.offsetWidth, height = this.dom.offsetHeight;
        if (arg.x + width > document.body.offsetWidth) arg.x -= width;
        if (arg.y + height > document.body.offsetHeight) arg.y -= height;
        if (arg.x < 0) arg.x = 0;
        if (arg.y < 0) arg.y = 0;
        this.dom.style.left = arg.x + 'px';
        this.dom.style.top = arg.y + 'px';
    }
    close() {
        if (this._visible) {
            this._visible = false;
            if (this.overlay) utils.fadeout(this.overlay.dom);
            utils.fadeout(this.dom);
        }
    }
}

class SidebarItem extends ListViewItem {
    text: string;
    onclick: Action<Event>;
    constructor(init: Partial<SidebarItem>) {
        super();
        utils.objectApply(this, init);
    }
    protected createDom(): BuildDomExpr {
        return {
            tag: 'div.item.no-selection',
            onclick: (e) => this.onclick?.(e)
        };
    }
    updateDom() {
        this.dom.textContent = this.text;
    }
    bindContentView(viewFunc: Func<ContentView>) {
        var view: ContentView;
        this.onclick = () => {
            if (!view) view = viewFunc();
            ui.content.setCurrent(view);
            ui.sidebarList.setActive(this);
        };
        return this;
    }
}

class Dialog extends View {
    overlay: Overlay;
    domheader: HTMLElement;
    domcontent: HTMLElement;
    shown = false;

    btnTitle = new TabBtn({ active: true, clickable: false });
    btnClose = new TabBtn({ text: I`Close`, right: true });

    title = 'Dialog';
    width = '300px';
    allowClose = true;
    onShown = new Callbacks<Action>();
    onClose = new Callbacks<Action>();
    autoFocus: View;

    constructor() {
        super();
        this.btnClose.onClick.add(() => this.allowClose && this.close());
    }
    createDom(): BuildDomExpr {
        return {
            _ctx: this,
            _key: 'dialog',
            tag: 'div.dialog',
            child: [
                {
                    _key: 'domheader',
                    tag: 'div.dialog-title',
                    child: [
                        { tag: 'div', style: 'clear: both;' }
                    ]
                },
                { tag: 'div.dialog-content', _key: 'domcontent' }
            ]
        };
    }
    postCreateDom() {
        super.postCreateDom();
        this.addBtn(this.btnTitle);
        this.addBtn(this.btnClose);
        this.overlay = new Overlay().setCenterChild(true);
        this.overlay.dom.appendView(this);
        this.overlay.dom.addEventListener('mousedown', (ev) => {
            if (this.allowClose && ev.button === 0 && ev.target === this.overlay.dom) {
                ev.preventDefault();
                this.close();
            }
        });
        this.overlay.dom.addEventListener('keydown', (ev) => {
            if (this.allowClose && ev.keyCode == 27) { // ESC
                this.close();
                ev.preventDefault();
            }
        });
    }
    updateDom() {
        this.btnTitle.updateWith({ text: this.title });
        this.btnTitle.hidden = !this.title;
        this.dom.style.width = this.width;
        this.btnClose.hidden = !this.allowClose;
    }
    addBtn(btn: TabBtn) {
        this.ensureDom();
        this.domheader.insertBefore(btn.dom, this.domheader.lastChild);
    }
    addContent(view: ViewArg, replace?: boolean) {
        this.ensureDom();
        if (replace) utils.clearChildren(this.domcontent);
        this.domcontent.appendChild(View.getDOM(view));
    }
    show() {
        if (this.shown) return;
        this.shown = true;
        this._cancelFadeout?.();
        this.ensureDom();
        ui.mainContainer.dom.appendView(this.overlay);
        this.dom.focus();
        this.autoFocus?.dom.focus();
        this.onShown.invoke();
    }
    private _cancelFadeout: Action;
    close() {
        if (!this.shown) return;
        this.shown = false;
        this.onClose.invoke();
        this._cancelFadeout = utils.fadeout(this.overlay.dom).cancel;
    }
}

class TabBtn extends View {
    text: string;
    clickable = true;
    active = false;
    right = false;
    onClick = new Callbacks<Action>();
    constructor(init?: Partial<TabBtn>) {
        super();
        utils.objectApply(this, init);
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'span.tab.no-selection',
            tabIndex: 0,
            onclick: () => this.onClick.invoke()
        };
    }
    updateDom() {
        this.dom.textContent = this.text;
        this.toggleClass('clickable', this.clickable);
        this.toggleClass('active', this.active);
        this.dom.style.float = this.right ? 'right' : 'left';
    }
}

class InputView extends View {
    createDom() {
        return { tag: 'input.input-text', _key: 'dominput' };
    }
}

class LabeledInput extends View {
    label: string;
    type = 'text';
    input = new InputView();
    domlabel: HTMLElement;
    get dominput(): HTMLInputElement { return this.input.dom as any; }
    get value() { return this.dominput.value; }
    set value(val) { this.dominput.value = val; }
    constructor(init?: Partial<LabeledInput>) {
        super();
        this.ensureDom();
        utils.objectApply(this, init);
        this.updateDom();
    }
    createDom(): BuildDomExpr {
        return {
            _ctx: this,
            tag: 'div',
            child: [
                { tag: 'div.input-label', _key: 'domlabel' },
                this.input.dom
            ]
        };
    }
    updateDom() {
        this.domlabel.textContent = this.label;
        this.dominput.type = this.type;
    }
}