// file: viewlib.ts

import { BuildDomExpr, utils, Action, I, Callbacks, BuildDomNode, Timer, BuildDOMCtx } from "./utils";
import { i18n } from "./I18n";

export type ViewArg = View | HTMLElement;

export class View {
    constructor(dom?: BuildDomExpr) {
        if (dom) this.domExprCreated(dom);
    }

    public parentView?: ContainerView<View>;
    public _position?: number;
    get position() { return this._position; }

    domctx = new BuildDOMCtx();
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
            var r = this.createDom();
            this.domExprCreated(r);
        }
    }
    private domExprCreated(r: BuildDomExpr) {
        this._dom = utils.buildDOM(r, this.domctx) as HTMLElement;
        this.postCreateDom();
        this.updateDom();
    }
    protected createDom(): BuildDomExpr {
        return document.createElement('div');
    }
    /** Will be called when the dom is created */
    protected postCreateDom() {
    }
    /** Will be called when the dom is created, after postCreateDom() */
    public updateDom() {
        this.domctx.update();
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
    getDOM() { return this.dom; }
}

declare global {
    interface Node {
        appendView(view: View);
    }
    interface HTMLElement {
        getDOM(): HTMLElement;
    }
}

HTMLElement.prototype.getDOM = function () { return this; };

Node.prototype.appendView = function (this: Node, view: View) {
    this.appendChild(view.dom);
};

export class ContainerView<T extends View> extends View {
    items: T[] = [];
    appendView(view: T) {
        this.addView(view as any);
    }
    addView(view: T, pos?: number) {
        const items = this.items;
        if (view.parentView) throw new Error('the view is already in a container view');
        view.parentView = this;
        if (pos === undefined) {
            view._position = items.length;
            items.push(view);
            this.dom.appendChild(view.dom);
        } else {
            items.splice(pos, 0, view);
            this.dom.insertBefore(view.dom, items[pos + 1]?.dom);
            for (let i = pos; i < items.length; i++) {
                items[i]._position = i;
            }
        }
    }
    removeView(view: T | number) {
        view = this._ensureItem(view);
        view.dom.remove();
        this.items.splice(view._position, 1);
        var pos = view._position;
        view.parentView = view._position = null;
        for (let i = pos; i < this.items.length; i++) {
            this.items[i]._position = i;
        }
    }
    removeAllView() {
        while (this.length) this.removeView(this.length - 1);
    }
    updateChildrenDom() {
        for (const item of this.items) {
            item.updateDom();
        }
    }
    protected _ensureItem(item: T | number) {
        if (typeof item === 'number') item = this.items[item];
        else if (!item) throw new Error('item is null or undefined.');
        else if (item.parentView !== this) throw new Error('the item is not in this listview.');
        return item;
    }

    [Symbol.iterator]() { return this.items[Symbol.iterator](); }
    get length() { return this.items.length; }
    get(idx: number) {
        return this.items[idx];
    }
    map<TRet>(func: (lvi: T) => TRet) { return utils.arrayMap(this, func); }
    find(func: (lvi: T, idx: number) => any) { return utils.arrayFind(this, func); }
    forEach(func: (lvi: T, idx: number) => void) { return utils.arrayForeach(this, func); }
}

/** DragManager is used to help exchange information between views */
export var dragManager = new class DragManager {
    /** The item being dragged */
    _currentItem: any;
    _currentArray: any[];
    get currentItem() { return this._currentItem ?? this._currentArray?.[0] ?? null; };
    get currentArray() {
        if (this._currentItem) return [this._currentItem];
        return this._currentArray;
    }
    onDragStart = new Callbacks();
    onDragEnd = new Callbacks();
    start(item: any) {
        this._currentItem = item;
        console.log('drag start', item);
        this.onDragStart.invoke();
    }
    startArray(arr: any[]) {
        this._currentArray = arr;
        console.log('drag start array', arr);
        this.onDragStart.invoke();
    }
    end() {
        this._currentItem = null;
        console.log('drag end');
        this.onDragEnd.invoke();
    }
};

export abstract class ListViewItem extends View implements ISelectable {
    _position: number;
    get listview() { return this.parentView as ListView<this>; }
    get selectionHelper() { return this.listview.selectionHelper; }

    get dragData() { return this.dom.textContent; }

    onDragover: ListView['onDragover'];
    onContextMenu: ListView['onContextMenu'];

    dragging?: boolean;

    private _selected: boolean;
    public get selected(): boolean { return this._selected; }
    public set selected(v: boolean) {
        this._selected = v;
        this.domCreated && this.updateDom();
        this.onSelectedChanged.invoke();
    }
    onSelectedChanged = new Callbacks();


    remove() {
        if (!this.listview) return;
        this.listview.remove(this);
    }

    protected postCreateDom() {
        super.postCreateDom();
        this.dom.addEventListener('click', (ev) => {
            if (this.listview?.selectionHelper.handleItemClicked(this, ev)) return;
            this.listview?.onItemClicked?.(this);
        });
        this.dom.addEventListener('contextmenu', (ev) => {
            (this.onContextMenu ?? this.listview?.onContextMenu)?.(this, ev);
        });
        this.dom.addEventListener('dragstart', (ev) => {
            if (!(this.dragging ?? this.listview?.dragging)) {
                ev.preventDefault();
                return;
            }
            var arr: ListViewItem[] = [];
            if (this.selected) {
                arr = [...this.selectionHelper.selectedItems];
                arr.sort((a, b) => a.position - b.position); // remove this line to get a new feature!
            } else {
                arr = [this];
            }
            dragManager.startArray(arr);
            ev.dataTransfer.setData('text/plain', arr.map(x => x.dragData).join('\r\n'));
            arr.forEach(x => x.dom.style.opacity = '.5');
        });
        this.dom.addEventListener('dragend', (ev) => {
            var arr = dragManager.currentArray as ListViewItem[];
            dragManager.end();
            ev.preventDefault();
            arr.forEach(x => x.dom.style.opacity = '');
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
        var items = dragManager.currentArray;
        var drop = type === 'drop';
        if (item instanceof ListViewItem) {
            var arg: DragArg<ListViewItem> = {
                source: item, target: this,
                sourceItems: items,
                event: ev, drop: drop,
                accept: false
            };
            if (this.listview?.moveByDragging && item.listview === this.listview) {
                ev.preventDefault();
                if (!drop) {
                    ev.dataTransfer.dropEffect = 'move';
                    arg.accept = (items.indexOf(this) === -1) ? 'move' : true;
                    if (arg.accept === 'move' && this.position > item.position) arg.accept = 'move-after';
                } else {
                    if (items.indexOf(this) === -1) {
                        if (this.position >= item.position) items = [...items].reverse();
                        for (const it of items) {
                            if (it !== this) {
                                this.listview.move(it, this.position);
                            }
                        }
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
    sourceItems: ListViewItem[],
    accept: boolean | 'move' | 'move-after', event: DragEvent;
}

export class ListView<T extends ListViewItem = ListViewItem> extends ContainerView<T> implements Iterable<T> {
    // private items: Array<T> = [];
    onItemClicked: (item: T) => void;
    /**
     * Allow user to drag an item.
     */
    dragging = false;
    /**
     * Allow user to drag an item and change its position.
     */
    moveByDragging = false;

    selectionHelper = new SelectionHelper<T>();

    onItemMoved: (item: T, from: number) => void;
    /** 
     * When an item from another list is dragover or drop
     */
    onDragover: (arg: DragArg<T>) => void;
    onContextMenu: (item: ListViewItem, ev: MouseEvent) => void;
    constructor(container?: BuildDomExpr) {
        super(container);
        this.selectionHelper.itemProvider = this.get.bind(this);
    }
    add(item: T, pos?: number) {
        this.addView(item, pos);
        if (this.dragging) item.dom.draggable = true;
    }
    remove(item: T | number, keepSelected?: boolean) {
        item = this._ensureItem(item);
        if (!keepSelected && item.selected) this.selectionHelper.toggleItemSelection(item);
        this.removeView(item);
    }
    move(item: T | number, newpos: number) {
        item = this._ensureItem(item);
        this.remove(item, true);
        this.add(item, newpos);
        this.onItemMoved(item, item.position);
    }
    /** Remove all items */
    removeAll() {
        while (this.length) this.remove(this.length - 1);
    }
    /** Remove all items and all DOM children */
    clear() {
        this.removeAll();
        utils.clearChildren(this.dom);
    }
    ReplaceChild(dom: ViewArg) {
        this.clear();
        this.dom.appendChild(dom.getDOM());
    }
}

export interface ISelectable {
    selected: boolean;
    position: number;
}

export class SelectionHelper<TItem extends ISelectable> {
    _enabled: boolean;
    get enabled() { return this._enabled; }
    set enabled(val) {
        if (val == !!this._enabled) return;
        this._enabled = val;
        while (this.selectedItems.length)
            this.toggleItemSelection(this.selectedItems[0], false);
        this.lastToggledItem = null;
        this.onEnabledChanged.invoke();
    }
    onEnabledChanged = new Callbacks();

    itemProvider: (pos: number) => TItem;

    ctrlForceSelect = false;

    selectedItems = [] as TItem[];
    onSelectedItemsChanged = new Callbacks<(action: 'add' | 'remove', item: TItem) => void>();
    get count() { return this.selectedItems.length; }

    /** For shift-click */
    lastToggledItem: TItem;

    /** Returns true if it's handled by the helper. */
    handleItemClicked(item: TItem, ev: MouseEvent): boolean {
        if (!this.enabled) {
            if (!this.ctrlForceSelect || !ev.ctrlKey) return false;
            this.enabled = true;
        }
        if (ev.shiftKey && this.lastToggledItem) {
            var toSelect = !!this.lastToggledItem.selected;
            var start = item.position, end = this.lastToggledItem.position;
            if (start > end) [start, end] = [end, start];
            for (let i = start; i <= end; i++) {
                this.toggleItemSelection(this.itemProvider(i), toSelect);
            }
            this.lastToggledItem = item;
        } else {
            this.toggleItemSelection(item);
        }
        return true;
    }

    toggleItemSelection(item: TItem, force?: boolean) {
        if (force !== undefined && force === !!item.selected) return;
        if (item.selected) {
            item.selected = false;
            this.selectedItems.remove(item);
            this.onSelectedItemsChanged.invoke('remove', item);
        } else {
            item.selected = true;
            this.selectedItems.push(item);
            this.onSelectedItemsChanged.invoke('add', item);
        }
        this.lastToggledItem = item;
        if (this.count === 0 && this.ctrlForceSelect) this.enabled = false;
    }
}

export class ItemActiveHelper<T extends View> {
    funcSetActive = (item: T, val: boolean) => item.toggleClass('active', val);
    current: T;
    constructor(init?: Partial<ItemActiveHelper<T>>) {
        utils.objectApply(this, init);
    }
    set(item: T) {
        if (this.current) this.funcSetActive(this.current, false);
        this.current = item;
        if (this.current) this.funcSetActive(this.current, true);
    }
}

type SectionActionOptions = { text: string, onclick: Action; };

export class Section extends View {
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
        dom.appendChild(view.getDOM());
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

export class LoadingIndicator extends View {
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

export class Overlay extends View {
    createDom() {
        return { tag: 'div.overlay' };
    }
    setCenterChild(centerChild: boolean) {
        this.toggleClass('centerchild', centerChild);
        return this;
    }
    setNoBg(nobg: boolean) {
        this.toggleClass('nobg', nobg);
        return this;
    }
}

export class EditableHelper {
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
    startEditAsync() {
        return new Promise<string>((resolve) => this.startEdit(resolve));
    }
}

export class MenuItem extends ListViewItem {
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
                if (this.parentView instanceof ContextMenu) {
                    if (!this.parentView.keepOpen) this.parentView.close();
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

export class MenuLinkItem extends MenuItem {
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

export class MenuInfoItem extends MenuItem {
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


export class ContextMenu extends ListView {
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

export class Dialog extends View {
    overlay: Overlay;
    domheader: HTMLElement;
    content = new ContainerView({ tag: 'div.dialog-content' });
    shown = false;

    btnTitle = new TabBtn({ active: true, clickable: false });
    btnClose = new TabBtn({ text: I`Close`, right: true });

    title = 'Dialog';
    width = '300px';
    allowClose = true;
    showCloseButton = true;
    onShown = new Callbacks<Action>();
    onClose = new Callbacks<Action>();
    autoFocus: View;

    static defaultParent: DialogParent;

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
                this.content.dom
            ]
        };
    }
    postCreateDom() {
        super.postCreateDom();
        this.addBtn(this.btnTitle);
        this.addBtn(this.btnClose);
        this.overlay = new Overlay().setCenterChild(true).setNoBg(true);
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
        this.domheader.addEventListener('mousedown', (ev) => {
            if (ev.target !== this.domheader && ev.target !== this.btnTitle.dom) return;
            ev.preventDefault();
            const { x: sX, y: sY } = this.getOffset();
            const sPageX = ev.pageX, sPageY = ev.pageY;
            var mousemove = (ev) => {
                const rect = this.overlay.dom.getBoundingClientRect();
                var pageX = utils.numLimit(ev.pageX, rect.left, rect.right);
                var pageY = utils.numLimit(ev.pageY, rect.top, rect.bottom);;
                this.setOffset(sX + pageX - sPageX, sY + pageY - sPageY);
            };
            var mouseup = (ev) => {
                document.removeEventListener('mousemove', mousemove);
                document.removeEventListener('mouseup', mouseup);
            };
            document.addEventListener('mousemove', mousemove);
            document.addEventListener('mouseup', mouseup);
        });
    }
    updateDom() {
        this.btnTitle.updateWith({ text: this.title });
        this.btnTitle.hidden = !this.title;
        this.dom.style.width = this.width;
        this.btnClose.hidden = !(this.allowClose && this.showCloseButton);
    }
    addBtn(btn: TabBtn) {
        this.ensureDom();
        this.domheader.insertBefore(btn.dom, this.domheader.lastChild);
    }
    addContent(view: ViewArg, replace?: boolean) {
        this.ensureDom();
        if (replace) this.content.removeAllView();
        this.content.appendView(view instanceof View ? view : new View(view));
    }
    setOffset(x: number, y: number) {
        this.dom.style.left = x ? x + 'px' : '';
        this.dom.style.top = y ? y + 'px' : '';
    }
    getOffset() {
        var x = this.dom.style.left ? parseFloat(this.dom.style.left) : 0;
        var y = this.dom.style.top ? parseFloat(this.dom.style.top) : 0;
        return { x, y };
    }
    show() {
        if (this.shown) return;
        this.shown = true;
        this._cancelFadeout?.();
        this.ensureDom();
        Dialog.defaultParent.onDialogShowing(this);
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
        Dialog.defaultParent.onDialogClosing(this);
    }
    waitClose(): Promise<void> {
        return new Promise((resolve) => {
            var cb = this.onClose.add(() => {
                this.onClose.remove(cb);
                resolve();
            });
        });
    }
}

export class DialogParent extends View {
    bgOverlay = new Overlay();
    dialogCount = 0;
    _cancelFadeout: Action;

    constructor(dom?: BuildDomExpr) {
        super(dom ?? document.body);
    }
    onDialogShowing(dialog: Dialog) {
        if (this.dialogCount++ === 0) {
            this._cancelFadeout?.();
            this.appendView(this.bgOverlay);
        }
        this.appendView(dialog.overlay);
    }
    onDialogClosing(dialog: Dialog) {
        if (--this.dialogCount === 0) {
            this._cancelFadeout = utils.fadeout(this.bgOverlay.dom).cancel;
        }
    }
}

export class TabBtn extends View {
    text: string;
    clickable = true;
    active = false;
    right = false;
    onclick: Action;
    onClick = new Callbacks<Action>();
    constructor(init?: Partial<TabBtn>) {
        super();
        utils.objectApply(this, init);
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'span.tab.no-selection',
            tabIndex: 0,
            onclick: () => {
                this.onclick?.();
                this.onClick.invoke();
            }
        };
    }
    updateDom() {
        this.dom.textContent = this.text;
        this.toggleClass('clickable', this.clickable);
        this.toggleClass('active', this.active);
        this.dom.style.float = this.right ? 'right' : 'left';
    }
}

export class InputView extends View {
    dom: HTMLInputElement;
    multiline: boolean;
    type = 'text';
    placeholder = '';
    get value() { return this.dom.value; }
    set value(val) { this.dom.value = val; }
    constructor(init?: Partial<InputView>) {
        super();
        utils.objectApply(this, init);
    }
    createDom() {
        return this.multiline ? { tag: 'textarea.input-text' } : { tag: 'input.input-text' };
    }
    updateDom() {
        super.updateDom();
        if (!this.multiline) this.dom.type = this.type;
        this.dom.placeholder = this.placeholder;
    }
}

export class TextView extends View {
    get text() { return this.dom.textContent; }
    set text(val) { this.dom.textContent = val; }
}

export class ButtonView extends TextView {
    disabled: boolean = false;
    onclick: Action;
    type: 'normal' | 'big';
    constructor(init?: Partial<ButtonView>) {
        super();
        utils.objectApply(this, init);
        this.updateDom();
    }
    createDom(): BuildDomExpr {
        return { tag: 'div.btn', tabIndex: 0 };
    }
    postCreateDom() {
        super.postCreateDom();
        this.dom.addEventListener('click', () => this.onclick?.());
    }
    updateDom() {
        super.updateDom();
        this.toggleClass('disabled', this.disabled);
        this.toggleClass('btn-big', this.type === 'big');
    }
}

export class LabeledInput extends View {
    label: string;
    type = 'text';
    input = new InputView();
    get dominput(): HTMLInputElement { return this.input.dom as any; }
    get value() { return this.dominput.value; }
    set value(val) { this.dominput.value = val; }
    constructor(init?: Partial<LabeledInput>) {
        super();
        utils.objectApply(this, init);
    }
    createDom(): BuildDomExpr {
        return {
            _ctx: this,
            tag: 'div.labeled-input',
            child: [
                { tag: 'div.input-label', text: () => this.label },
                this.input.dom
            ]
        };
    }
    updateDom() {
        super.updateDom();
        this.input.type = this.type;
        this.input.domCreated && this.input.updateDom();
    }
}

export class ToastsContainer extends View {
    static default: ToastsContainer = new ToastsContainer();
    parentDom: HTMLElement;
    toasts: Toast[] = [];
    createDom() {
        return { tag: 'div.toasts-container' };
    }
    addToast(toast: Toast) {
        if (this.toasts.length === 0)
            this.show();
        this.toasts.push(toast);
    }
    removeToast(toast: Toast) {
        this.toasts.remove(toast);
        if (this.toasts.length === 0)
            this.remove();
    }
    show() {
        var parent = this.parentDom || document.body;
        parent.appendChild(this.dom);
    }
    remove() {
        this.dom.remove();
    }
}

export class Toast extends View {
    text: string;
    container: ToastsContainer;
    shown = false;
    timer = new Timer(() => this.close());
    constructor(init?: Partial<Toast>) {
        super();
        utils.objectApply(this, init);
        if (!this.container) this.container = ToastsContainer.default;
    }
    show(timeout?: number) {
        if (!this.shown) {
            this.container.addToast(this);
            this.container.appendView(this);
            this.shown = true;
        }
        if (timeout) this.timer.timeout(timeout);
        else this.timer.tryCancel();
    }
    close() {
        if (!this.shown) return;
        this.shown = false;
        utils.fadeout(this.dom)
            .onFinished(() => this.container.removeToast(this));
    }
    createDom() {
        return { tag: 'div.toast' };
    }
    updateDom() {
        this.dom.textContent = this.text;
    }
    static show(text: string, timeout?: number) {
        var toast = new Toast({ text });
        toast.show(timeout);
        return toast;
    }
}

export class MessageBox extends Dialog {
    allowClose = false;
    title = 'Message';
    result: 'none' | 'no' | 'yes' | 'ok' | 'cancel' = 'none';
    addResultBtns(results: this['result'][]) {
        for (const r of results) {
            this.addBtnWithResult(new TabBtn({ text: i18n.get('msgbox_' + r), right: true }), r);
        }
        return this;
    }
    setTitle(title: string) {
        this.title = title;
        if (this.domCreated) this.updateDom();
        return this;
    }
    addText(text: string) {
        this.addContent(new TextView({ tag: 'div.messagebox-text', textContent: text }));
        return this;
    }
    allowCloseWithResult(result: this['result'], showCloseButton?: boolean) {
        this.result = result;
        this.allowClose = true;
        this.showCloseButton = !!showCloseButton;
        if (this.domCreated) this.updateDom();
        return this;
    }
    addBtnWithResult(btn: TabBtn, result: this['result']) {
        btn.onClick.add(() => { this.result = result; this.close(); });
        this.addBtn(btn);
        return this;
    }
    async showAndWaitResult() {
        this.show();
        await this.waitClose();
        return this.result;
    }
}