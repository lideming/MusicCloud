// file: ui-views.ts
import { ListViewItem, TextView, View, EditableHelper, ContainerView, InputView, MenuItem, ObjectInit, } from "./viewlib";
import { utils, BuildDomExpr, Func, EventRegistrations, Action, Ref, jsx } from "./utils";
import { I } from "./I18n";
import svgSettings from "../resources/settings-24px.svg";
import { settingsUI } from "./SettingsUI";

export class MainContainer extends View {
    createDom() {
        return (
            <div id="main-container" class="no-transition">
                <nav id="sidebar" class="no-selection">
                    <div id="sidebar-header">
                        <SettingsBtn />
                    </div>
                    <div id="sidebar-features">
                    </div>
                    <div id="sidebar-list">
                    </div>
                </nav>
                <main id="content-outer">
                </main>
            </div>
        );
    }
}

export class BottomBar extends View {
    createDom() {
        return (
            <div id="bottombar">
                <div id="progress-outer">
                    <div class="no-selection" id="progressbar-label-cur">--:--</div>
                    <div class="no-selection" id="progressbar-label-total">--:--</div>
                </div>
                <div class="btn-progress" id="progressbar">
                    <div class="btn-fill" id="progressbar-fill"></div>
                </div>
                <div id="bottombar-btns" class="flexbox-h">
                    <div id="btn-play" class="btn i18ne" tabindex="0">Play</div>
                    <div id="btn-prevtrack" class="btn i18ne" tabindex="0">prev_track</div>
                    <div id="btn-nexttrack" class="btn i18ne" tabindex="0">next_track</div>
                    <div id="btn-volume" class="btn" tabindex="0"></div>
                    <div id="btn-loop" class="btn" tabindex="0" hidden></div>
                    <div id="bottombar-trackinfo" class="flex-1"></div>
                    <div class="btn" id="btnPin" tabindex="0">Pin</div>
                </div>
            </div>
        );
    }
}

export class SidebarItem extends ListViewItem {
    text: string = '';
    contentView: ContentView | null = null;
    constructor(init?: ObjectInit<SidebarItem>) {
        super();
        utils.objectInit(this, init);
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

export class SettingsBtn extends View {
    createDom() {
        return (
            <div class="item" id="settings-btn">
                <Icon icon={svgSettings}/>
            </div>
        );
    }
    postCreateDom() {
        super.postCreateDom();
        this.onActive.add((e) => {
            settingsUI.openUI(e);
        });
    }
}

export class ContentView extends View {
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
    onDomRemoved() { }
    onSidebarItemReactived() { }

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
    constructor(init?: ObjectInit<ContentHeader>) {
        super();
        if (init) utils.objectInit(this, init);
        this.titleView.onActive.add(async () => {
            if (!this.titleEditable) return;
            this.editHelper = this.editHelper || new EditableHelper(this.titleView.dom);
            if (this.editHelper.editing) return;
            var newName = await this.editHelper.startEditAsync();
            if (newName !== this.editHelper.beforeEdit && newName != '') {
                this.onTitleEdit(newName);
            }
            this.updateDom();
        });
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
    get active() { return this.dom.classList.contains('active'); }
    set active(val) { this.toggleClass('active', val); }
    constructor(init?: ObjectInit<ActionBtn>) {
        super();
        utils.objectInit(this, init);
    }
    createDom(): BuildDomExpr {
        return { tag: 'span.action.clickable.no-selection', tabIndex: 0 };
    }
}

export function setScrollableShadow(dom: HTMLElement, position: number) {
    dom.style.boxShadow = `0 0 ${utils.numLimit(Math.log(position) * 2, 0, 10)}px var(--color-light-shadow)`;
}

export class CopyMenuItem extends MenuItem {
    textToCopy: string;
    private textView: InputView | null = null;
    constructor(init: ObjectInit<CopyMenuItem>) {
        super(init);
        this.onActive.add(() => {
            this.dom.textContent = "";
            if (!this.textView) {
                this.textView = new InputView();
                this.addChild(this.textView);
                this.textView.value = this.textToCopy;
            }
            (this.textView.dom as HTMLInputElement).select();
            document.execCommand('copy');
        });
    }
}

export class Icon extends View {
    get icon() { return this.dom.innerHTML; }
    set icon(val) { this.dom.innerHTML = val; }
    constructor(init?: ObjectInit<Icon>) {
        super({ tag: 'span.icon' });
        utils.objectInit(this, init);
    }
}
