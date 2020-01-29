// file: UI.ts

import { router } from "./Router";
import { SettingItem, utils, ItemActiveHelper, Action, BuildDomExpr, Func } from "./utils";
import { I18n, i18n, I } from "./I18n";
import { Track } from "./TrackList";
import { user } from "./User";
import { ListView, ListViewItem, Dialog, ToastsContainer, TextView } from "./viewlib";


/** 常驻 UI 元素操作 */
export var ui = new class {
    init() {
        this.lang.init();
        this.bottomBar.init();
        this.playerControl.init();
        this.sidebarLogin.init();
        Dialog.defaultParent = this.mainContainer.dom;
        ToastsContainer.default.parentDom = this.mainContainer.dom;
        router.addRoute({
            path: ['home'],
            onNav: () => {
                ui.content.setCurrent(null);
                ui.sidebarList.currentActive.set(null);
            }
        });
        document.addEventListener('dragover', (ev) => {
            ev.preventDefault();
        });
        document.addEventListener('drop', (ev) => {
            ev.preventDefault();
        });
    }
    lang = new class {
        availableLangs = ['en', 'zh'];
        siLang = new SettingItem('mcloud-lang', 'str', I18n.detectLanguage(this.availableLangs));
        init() {
            this.siLang.render((lang) => {
                i18n.curLang = lang;
                document.body.lang = lang;
            });
            console.log(`Current language: '${i18n.curLang}' - '${I`English`}'`);
            i18n.renderElements(document.querySelectorAll('.i18ne'));
        }
        setLang(lang: string) {
            this.siLang.set(lang);
            window.location.reload();
        }
    };
    bottomBar = new class {
        container: HTMLElement = document.getElementById("bottombar");
        btnPin: HTMLElement = document.getElementById('btnPin');
        siPin: SettingItem<boolean>;
        private pinned = true;
        hideTimer = new utils.Timer(() => { this.toggle(false); });
        shown = false;
        inTransition = false;
        setPinned(val?: boolean) {
            val = val ?? !this.pinned;
            this.pinned = val;
            utils.toggleClass(document.body, 'bottompinned', val);
            this.btnPin.textContent = val ? I`Unpin` : I`Pin`;
            if (val) this.toggle(true);
        }
        toggle(state?: boolean, hideTimeout?: number) {
            this.shown = utils.toggleClass(this.container, 'show', state);
            if (!this.pinned && hideTimeout) this.hideTimer.timeout(hideTimeout);
        }
        init() {
            var bar = this.container;
            bar.addEventListener('transitionstart', (e) => {
                if (e.target === bar && e.propertyName == 'transform') this.inTransition = true;
            });
            bar.addEventListener('transitionend', (e) => {
                if (e.target === bar && e.propertyName == 'transform') this.inTransition = false;
            });
            bar.addEventListener('transitioncancel', (e) => {
                if (e.target === bar && e.propertyName == 'transform') this.inTransition = false;
            });
            bar.addEventListener('mouseenter', () => {
                this.hideTimer.tryCancel();
                this.toggle(true);
            });
            bar.addEventListener('mouseleave', () => {
                this.hideTimer.tryCancel();
                if (!this.pinned) this.hideTimer.timeout(200);
            });
            this.siPin = new SettingItem('mcloud-bottompin', 'bool', false)
                .render(x => this.setPinned(x))
                .bindToBtn(this.btnPin, ['', '']);
            // this.btnPin.addEventListener('click', () => this.setPinned());
        }
    };
    playerControl = new class {
        progbar = document.getElementById('progressbar');
        fill = document.getElementById('progressbar-fill');
        labelCur = document.getElementById('progressbar-label-cur');
        labelTotal = document.getElementById('progressbar-label-total');
        btnPlay = new TextView(document.getElementById('btn-play'));
        state: 'none' | 'playing' | 'paused' | 'stalled';
        init() {
            this.setState('none');
        }
        setState(state: this['state']) {
            var btn = this.btnPlay;
            if (state === 'none') {
                btn.text = I`Play`; btn.toggleClass('disabled', true);
            } else if (state === 'paused') {
                btn.text = I`Play`; btn.toggleClass('disabled', false);
            } else if (state === 'playing') {
                btn.text = I`Pause`; btn.toggleClass('disabled', false);
            } else if (state === 'stalled') {
                btn.text = I`Pause...`; btn.toggleClass('disabled', false);
            } else {
                throw new Error("invalid state value: " + state);
            }
            this.state = state;
        }
        setProg(cur: number, total: number) {
            var prog = cur / total;
            prog = utils.numLimit(prog, 0, 1);
            this.fill.style.width = (prog * 100) + '%';
            this.labelCur.textContent = utils.formatTime(cur);
            this.labelTotal.textContent = utils.formatTime(total);
        }
        onPlayButtonClicked(cb: () => void) {
            this.btnPlay.dom.addEventListener('click', cb);
        }
        onProgressChanged(cb: (percent: number) => void) {
            var call = (e) => { cb(utils.numLimit(e.offsetX / this.progbar.clientWidth, 0, 1)); };
            this.progbar.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (ui.bottomBar.shown && !ui.bottomBar.inTransition)
                    if (e.buttons == 1) call(e);
            });
            this.progbar.addEventListener('mousemove', (e) => {
                if (ui.bottomBar.shown && !ui.bottomBar.inTransition)
                    if (e.buttons == 1) call(e);
            });
        }
    };
    trackinfo = new class {
        element = document.getElementById('bottombar-trackinfo');
        setTrack(track: Track) {
            if (track) {
                utils.replaceChild(this.element, utils.buildDOM({
                    tag: 'span',
                    child: [
                        // 'Now Playing: ',
                        { tag: 'span.name', textContent: track.name },
                        { tag: 'span.artist', textContent: track.artist },
                    ]
                }));
                ui.bottomBar.toggle(true, 5000);
            } else {
                this.element.textContent = "";
            }
        }
    };
    mainContainer = new class {
        dom = document.getElementById('main-container');
    };
    sidebarLogin = new class {
        container = document.getElementById('sidebar-login');
        loginState = document.getElementById('login-state');
        init() {
            this.loginState.addEventListener('click', (ev) => {
                user.openUI();
            });
        }
        update() {
            var text = this.loginState.textContent;
            var username = user.pendingInfo?.username ?? user.info.username;
            if (username) {
                text = username;
                if (user.state == 'logging') text += I` (logging in...)`;
                if (user.state == 'error') text += I` (error!)`;
                if (user.state == 'none') text += I` (not logged in)`;
            } else {
                if (user.state == 'logging') text = I`(logging...)`;
                else text = I`Guest (click to login)`;
            }
            this.loginState.textContent = text;
        }
    };
    sidebarList = new class {
        container = document.getElementById('sidebar-list');
        listview = new ListView(this.container);
        currentActive = new ItemActiveHelper<ListViewItem>();
        setActive(item: ListViewItem) {
            this.currentActive.set(item);
        }
        addItem(item: ListViewItem | string) {
            if (typeof item == 'string') item = new SidebarItem({ text: item });
            this.listview.add(item);
        }
    };
    content = new class {
        container = document.getElementById('content-outer');
        current: ContentView = null;
        removeCurrent() {
            const cur = this.current;
            this.current = null;
            if (!cur) return;
            cur.contentViewState.scrollTop = this.container.scrollTop;
            if (cur.onRemove) cur.onRemove();
            if (cur.dom) this.container.removeChild(cur.dom);
        }
        setCurrent(arg: ContentView) {
            if (arg === this.current) return;
            this.removeCurrent();
            if (arg) {
                if (arg.onShow) arg.onShow();
                if (arg.dom) this.container.appendChild(arg.dom);
                if (!arg.contentViewState) arg.contentViewState = { scrollTop: 0 };
                this.container.scrollTop = arg.contentViewState.scrollTop;
            }
            this.current = arg;
        }
    };
}; // ui

export interface ContentView {
    dom: HTMLElement;
    onShow?: Action;
    onRemove?: Action;
    contentViewState?: ContentViewState;
}

interface ContentViewState {
    scrollTop: number;
}

export class SidebarItem extends ListViewItem {
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