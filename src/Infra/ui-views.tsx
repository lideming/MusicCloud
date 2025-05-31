// file: ui-views.ts
import {
  ListViewItem,
  TextView,
  View,
  EditableHelper,
  ContainerView,
  InputView,
  MenuItem,
  ObjectInit,
  numLimit,
  objectInit,
  toggleClass,
  ListView,
  FuncOrVal,
} from "./viewlib";
import {
  BuildDomExpr,
  Func,
  EventRegistrations,
  Action,
  Ref,
  jsx,
} from "./utils";
import { I } from "../I18n/I18n";
import svgSettings from "../../resources/settings-24px.svg";
import { settingsUI } from "../Settings/SettingsUI";
import { ui } from "./UI";
import { ContextMenu, fadeout, FadeoutResult } from "@yuuza/webfx";
import { router } from "./Router";

export class MainContainer extends View {
  sidebar = new Sidebar();
  sidebarToggle = new SidebarToggle();
  contentOuter = new View(<main id="content-outer"></main>);
  createDom() {
    return (
      <div id="main-container" class="no-transition">
        {this.sidebar}
        {this.contentOuter}
        {this.sidebarToggle}
      </div>
    );
  }
}

export class Sidebar extends View {
  header = new View(
    (
      <div id="sidebar-header">
        {new View(<div style="flex: 1"></div>)}
        <SettingsBtn />
      </div>
    ),
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

export class SidebarItem extends ListViewItem {
  _text: FuncOrVal<string> = "";
  get text() {
    return getFuncVal(this._text);
  }
  set text(val: FuncOrVal<string>) {
    this._text = val;
  }
  contentView: ContentView | null = null;
  constructor(init?: ObjectInit<SidebarItem>) {
    super();
    objectInit(this, init);
  }
  protected createDom(): BuildDomExpr {
    return {
      tag: "li.item.no-selection",
      tabIndex: 0,
      text: () => getFuncVal(this.text),
    };
  }
  routerPath: string[] | null = null;
  getRouterMenuItems() {
    return this.routerPath
      ? [
          new MenuItem({
            text: "Open popup",
            onActive: () => {
              router.nav([...this.routerPath!], { popup: true });
            },
          }),
        ]
      : [];
  }
  getMenuItems(): MenuItem[] {
    return [...this.getRouterMenuItems()];
  }
  onContextMenu = (item, ev) => {
    ev.preventDefault();
    ui.showContextMenuForItem([this], new ContextMenu(this.getMenuItems()), {
      ev: ev,
    });
  };
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
  public get isVisible() {
    return this._isVisible;
  }

  get contentViewTitle() {
    return "";
  }

  _lastRenderedLanguage = "";

  postCreateDom() {
    super.postCreateDom();
    this.toggleClass("contentview", true);
  }

  // ContentView lifecycle methods:
  onShow() {
    this._isVisible = true;
    if (this.domCreated && this._lastRenderedLanguage != ui.lang.curLang) {
      this.updateAll();
    }
  }
  onDomInserted() {}
  onShowing() {}
  updateDom() {
    super.updateDom();
    this._lastRenderedLanguage = ui.lang.curLang;
  }
  onHiding() {}
  onRemove() {
    this._isVisible = false;
    this._shownEvents?.removeAll();
  }
  onDomRemoved() {}
  onSidebarItemReactived() {}

  fadeIn() {
    this._fadeout?.cancel();
    this.onShowing();
  }

  _fadeout: FadeoutResult | null = null;
  fadeOut() {
    this.onHiding();
    this._fadeout = fadeout(this.dom, { remove: false }).onFinished(() => {
      this.onRemove();
      this.removeFromParent();
      this.onDomRemoved();
    });
  }

  _shownEvents: EventRegistrations | null = null;
  get shownEvents() {
    return this._shownEvents
      ? this._shownEvents
      : (this._shownEvents = new EventRegistrations());
  }
}

export class ContentHeader extends View {
  catalog: FuncOrVal<string>;
  title: FuncOrVal<string>;
  titleEditable = false;
  editHelper: EditableHelper;
  actions = new ContainerView<ActionBtn>({ tag: "div.actions" });
  scrollbox: HTMLElement | null = null;
  scrollboxScrollHandler: Action<Event> | null = null;
  onTitleEdit: (title: string) => void;
  constructor(init?: ObjectInit<ContentHeader>) {
    super();
    if (init) objectInit(this, init);
    this.titleView.onActive.add(async () => {
      if (!this.titleEditable) return;
      this.editHelper =
        this.editHelper || new EditableHelper(this.titleView.dom);
      if (this.editHelper.editing) return;
      var newName = await this.editHelper.startEditAsync();
      if (newName !== this.editHelper.beforeEdit && newName != "") {
        this.onTitleEdit(newName);
      }
      this.updateDom();
    });
  }
  createDom(): BuildDomExpr {
    return {
      tag: "div.content-header",
      child: [this.titlebar],
    };
  }
  bindScrollBox(scrollbox: HTMLElement) {
    if (this.scrollbox) {
      this.scrollbox.removeEventListener(
        "scroll",
        this.scrollboxScrollHandler!,
      );
      this.scrollboxScrollHandler = null;
    }
    this.scrollbox = scrollbox;
    scrollbox?.addEventListener(
      "scroll",
      (this.scrollboxScrollHandler = (ev) => {
        if (ev.eventPhase == Event.AT_TARGET) {
          this.onScrollboxScroll();
        }
      }),
      { passive: true },
    );
  }
  onScrollboxScroll() {
    setScrollableShadow(this.dom, this.scrollbox?.scrollTop ?? 0);
  }
  titleView = new View({
    tag: "span.title.no-selection",
    text: () => getFuncVal(this.title),
    update: (dom) => {
      toggleClass(dom, "editable", !!this.titleEditable);
      if (this.titleEditable) dom.title = I`Click to edit`;
      else dom.removeAttribute("title");
      dom.tabIndex = this.titleEditable ? 0 : -1;
    },
  });
  titlebar = new View({
    tag: "div.titlebar.clearfix",
    child: [
      {
        tag: "span.catalog.no-selection",
        text: () => getFuncVal(this.catalog),
        hidden: () => !this.catalog,
      },
      this.titleView,
      this.actions,
    ],
  });

  updateDom() {
    super.updateDom();
    this.titlebar.updateDom();
    this.titleView.updateDom();
  }
}

function getFuncVal<T>(val: FuncOrVal<T>) {
  return typeof val == "function" ? (val as any)() : val;
}

export class ActionBtn extends TextView {
  get active() {
    return this.dom.classList.contains("active");
  }
  set active(val) {
    this.toggleClass("active", val);
  }
  constructor(init?: ObjectInit<ActionBtn>) {
    super();
    objectInit(this, init);
  }
  createDom(): BuildDomExpr {
    return { tag: "span.action.clickable.no-selection", tabIndex: 0 };
  }
}

export function setScrollableShadow(dom: HTMLElement, position: number) {
  dom.style.boxShadow = `0 0 ${numLimit(
    Math.log(position) * 2,
    0,
    10,
  )}px var(--color-light-shadow)`;
}

export class CopyMenuItem extends MenuItem {
  textToCopy: string;
  constructor(init: ObjectInit<CopyMenuItem>) {
    super(init);
    this.onActive.add(() => {
      const inputView = new InputView();
      this.addView(inputView);
      inputView.value = this.textToCopy;
      (inputView.dom as HTMLInputElement).select();
      document.execCommand("copy");
      this.removeView(inputView);
    });
  }
}

export class Icon extends View {
  get icon() {
    return this.dom.innerHTML;
  }
  set icon(val) {
    this.dom.innerHTML = val;
  }
  constructor(init?: ObjectInit<Icon>) {
    super({ tag: "span.icon" });
    objectInit(this, init);
  }
}

class SidebarToggle extends View {
  createDom(): BuildDomExpr {
    return {
      tag: "div.sidebar-toggle.clickable.no-selection",
      child: {
        tag: "div.logo",
        text: "M",
      },
      onclick: (ev) => {
        ui.sidebar.toggleHide();
      },
      ondragover: (ev) => {
        ui.sidebar.toggleHide(false);
      },
    };
  }
}
