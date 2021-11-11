// file: ui-views.ts
import { ListViewItem, TextView, View, EditableHelper, ContainerView, InputView, MenuItem, ObjectInit, numLimit, objectInit, toggleClass, ListView, FuncOrVal, } from "./viewlib";
import { BuildDomExpr, Func, EventRegistrations, Action, Ref, jsx } from "./utils";
import { I } from "../I18n/I18n";
import svgSettings from "../../resources/settings-24px.svg";
import { settingsUI } from "../Settings/SettingsUI";
import { ui } from "./UI";
import { fadeout, FadeoutResult } from "@yuuza/webfx";

export class MainContainer extends View {
    sidebar = new Sidebar();
    contentOuter = new View(
        <main id="content-outer">
            {new View({ tag: 'div.content-bg-overlay' })}
        </main>
    );
    createDom() {
        return (
            <div id="main-container" class="no-transition">
                {this.sidebar}
                {this.contentOuter}
            </div>
        );
    }
}

export class Sidebar extends View {
    header = new View(
        <div id="sidebar-header">
            {new View(<div style="flex: 1"></div>)}
            <SettingsBtn />
        </div>
    );
    features = new ListView(<div id="sidebar-features"></div>);
    list = new View(<div id="sidebar-list"></div>);
    createDom() {
        return (
            <nav id="sidebar" class="no-selection">
                {this.header}
                {this.features}
                {this.list}
            </nav>
        );
    }
}

export class BottomBar extends View {
    progressBar = new View(
        <div class="btn-progress" id="progressbar">
            <div class="btn-fill" id="progressbar-fill"></div>
        </div>
    );
    createDom() {
        return (
            <div id="bottombar">
                <div id="progress-outer">
                    <div class="no-selection" id="progressbar-label-cur">--:--</div>
                    <div class="no-selection" id="progressbar-label-total">--:--</div>
                </div>
                {this.progressBar}
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
    _text: FuncOrVal<string> = '';
    get text() { return getFuncVal(this._text); }
    set text(val: FuncOrVal<string>) { this._text = val; }
    contentView: ContentView | null = null;
    constructor(init?: ObjectInit<SidebarItem>) {
        super();
        objectInit(this, init);
    }
    protected createDom(): BuildDomExpr {
        return {
            tag: 'li.item.no-selection',
            tabIndex: 0,
            text: () => getFuncVal(this.text)
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
            <div class="item" id="settings-btn" tabIndex="0">
                <Icon icon={svgSettings} />
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

    _lastRenderedLanguage = '';

    postCreateDom() {
        super.postCreateDom();
        this.toggleClass('contentview', true);
    }
    onShow() {
        this._isVisible = true;
        if (this.domCreated && this._lastRenderedLanguage != ui.lang.curLang) {
            this.updateAll();
        }
    }
    onDomInserted() { }
    updateDom() {
        super.updateDom();
        this._lastRenderedLanguage = ui.lang.curLang;
    }
    onRemove() {
        this._isVisible = false;
        this._shownEvents?.removeAll();
    }
    onDomRemoved() { }
    onSidebarItemReactived() { }

    fadeIn() {
        this._fadeout?.cancel();
    }

    _fadeout: FadeoutResult | null = null;
    fadeOut() {
        this._fadeout = fadeout(this.dom, { remove: false }).onFinished(() => {
            this.onRemove();
            this.removeFromParent();
            this.onDomRemoved();
        });
    }

    _shownEvents: EventRegistrations | null = null;
    get shownEvents() { return this._shownEvents ? this._shownEvents : (this._shownEvents = new EventRegistrations()); }
}

export class ContentHeader extends View {
    catalog: FuncOrVal<string>;
    title: FuncOrVal<string>;
    titleEditable = false;
    editHelper: EditableHelper;
    actions = new ContainerView<ActionBtn>({ tag: 'div.actions' });
    scrollbox: HTMLElement | null = null;
    scrollboxScrollHandler: Action<Event> | null = null;
    onTitleEdit: (title: string) => void;
    constructor(init?: ObjectInit<ContentHeader>) {
        super();
        if (init) objectInit(this, init);
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
        }, { passive: true });
    }
    onScrollboxScroll() {
        setScrollableShadow(this.dom, this.scrollbox?.scrollTop ?? 0);
    }
    titleView = new View({
        tag: 'span.title.no-selection', text: () => getFuncVal(this.title),
        update: (dom) => {
            toggleClass(dom, 'editable', !!this.titleEditable);
            if (this.titleEditable) dom.title = I`Click to edit`;
            else dom.removeAttribute('title');
            dom.tabIndex = this.titleEditable ? 0 : -1;
        }
    });
    titlebar = new View({
        tag: 'div.titlebar.clearfix',
        child: [
            { tag: 'span.catalog.no-selection', text: () => getFuncVal(this.catalog), hidden: () => !this.catalog },
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

function getFuncVal<T>(val: FuncOrVal<T>) {
    return typeof val == 'function' ? (val as any)() : val;
}

export class ActionBtn extends TextView {
    get active() { return this.dom.classList.contains('active'); }
    set active(val) { this.toggleClass('active', val); }
    constructor(init?: ObjectInit<ActionBtn>) {
        super();
        objectInit(this, init);
    }
    createDom(): BuildDomExpr {
        return { tag: 'span.action.clickable.no-selection', tabIndex: 0 };
    }
}

export function setScrollableShadow(dom: HTMLElement, position: number) {
    dom.style.boxShadow = `0 0 ${numLimit(Math.log(position) * 2, 0, 10)}px var(--color-light-shadow)`;
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
        objectInit(this, init);
    }
}
