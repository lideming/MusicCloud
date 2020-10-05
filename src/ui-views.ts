// file: ui-views.ts
import { ListViewItem, TextView, View, EditableHelper, ContainerView } from "./viewlib";
import { utils, BuildDomExpr, Func, EventRegistrations, Action } from "./utils";
import { I } from "./I18n";

export class SidebarItem extends ListViewItem {
    text: string;
    get onclick() { return this.onactive; }
    set onclick(val) { this.onactive = val; }
    constructor(init?: Partial<SidebarItem>) {
        super();
        utils.objectApply(this, init);
    }
    protected createDom(): BuildDomExpr {
        return {
            tag: 'li.item.no-selection',
            tabIndex: 0,
            text: () => this.text
        };
    }
    bindContentView(viewFunc: Func<ContentView>) {
        // implement in UI.ts
        return this;
    }
}

export class ContentView extends View {
    dom: HTMLElement;

    private _isVisible = false;
    public get isVisible() { return this._isVisible; }

    onShow() {
        this._isVisible = true;
    }
    onDomInserted() { }
    onRemove() {
        this._isVisible = false;
        this._shownEvents?.removeAll();
    }

    _shownEvents: EventRegistrations | null = null;
    get shownEvents() { return this._shownEvents ? this._shownEvents : (this._shownEvents = new EventRegistrations()); }
}

export class ContentHeader extends View {
    catalog: string;
    title: string;
    titleEditable = false;
    editHelper: EditableHelper;
    actions = new ContainerView<ActionBtn>({ tag: 'div.actions' });
    scrollbox: HTMLElement | null = null;
    scrollboxScrollHandler: Action<Event> | null = null;
    onTitleEdit: (title: string) => void;
    constructor(init?: Partial<ContentHeader>) {
        super();
        if (init) utils.objectApply(this, init);
        this.titleView.onactive = async () => {
            if (!this.titleEditable) return;
            this.editHelper = this.editHelper || new EditableHelper(this.titleView.dom);
            if (this.editHelper.editing) return;
            var newName = await this.editHelper.startEditAsync();
            if (newName !== this.editHelper.beforeEdit && newName != '') {
                this.onTitleEdit(newName);
            }
            this.updateDom();
        };
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'div.content-header',
            child: [
                this.titlebar
            ]
        };
    }
    bindScrollBox(scrollbox: HTMLElement) {
        if (this.scrollbox) {
            this.scrollbox.removeEventListener('scroll', this.scrollboxScrollHandler!);
            this.scrollboxScrollHandler = null;
        }
        this.scrollbox = scrollbox;
        scrollbox?.addEventListener('scroll', this.scrollboxScrollHandler = (ev) => {
            if (ev.eventPhase == Event.AT_TARGET) {
                this.onScrollboxScroll();
            }
        });
    }
    onScrollboxScroll() {
        setScrollableShadow(this.dom, this.scrollbox?.scrollTop ?? 0);
    }
    titleView = new View({
        tag: 'span.title.no-selection', text: () => this.title,
        update: (dom) => {
            utils.toggleClass(dom, 'editable', !!this.titleEditable);
            if (this.titleEditable) dom.title = I`Click to edit`;
            else dom.removeAttribute('title');
            dom.tabIndex = this.titleEditable ? 0 : -1;
        }
    });
    titlebar = new View({
        tag: 'div.titlebar.clearfix',
        child: [
            { tag: 'span.catalog.no-selection', text: () => this.catalog, hidden: () => !this.catalog },
            this.titleView,
            this.actions
        ]
    });

    updateDom() {
        super.updateDom();
        this.titlebar.updateDom();
        this.titleView.updateDom();
    }
}

export class ActionBtn extends TextView {
    get onclick() { return this.onactive; }
    set onclick(val) { this.onactive = val; }
    get active() { return this.dom.classList.contains('active'); }
    set active(val) { this.toggleClass('active', val); }
    constructor(init?: Partial<ActionBtn>) {
        super();
        utils.objectApply(this, init);
    }
    createDom(): BuildDomExpr {
        return { tag: 'span.action.clickable.no-selection', tabIndex: 0 };
    }
}

export function setScrollableShadow(dom: HTMLElement, position: number) {
    dom.style.boxShadow = `0 0 ${utils.numLimit(Math.log(position) * 2, 0, 10)}px var(--color-shadow)`;
}
