// file: UI.ts

import { ListView, ListViewItem, Dialog, ToastsContainer, TextView, View, DialogParent, MessageBox, Overlay, ItemActiveHelper, dragManager, EditableHelper, ContainerView } from "./viewlib";

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
            text: () => this.text,
            onclick: (e) => this.onclick?.(e)
        };
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

export class ContentView extends View {
    dom: HTMLElement;
    onShow() { }
    onDomInserted() { }
    onRemove() {
        this._shownEvents?.removeAll();
    }
    contentViewState?: ContentViewState;

    _shownEvents: EventRegistrations;
    get shownEvents() { return this._shownEvents ? this._shownEvents : (this._shownEvents = new EventRegistrations()); }
}

export class ContentHeader extends View {
    catalog: string;
    title: string;
    titleEditable = false;
    editHelper: EditableHelper;
    get domdict(): { catalog?: HTMLSpanElement; title?: HTMLSpanElement; } {
        return this.domctx.dict;
    }
    actions = new ContainerView({ tag: 'div.actions' });
    onTitleEdit: (title: string) => void;
    constructor(init?: Partial<ContentHeader>) {
        super();
        if (init) utils.objectApply(this, init);
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'div.content-header',
            child: [
                this.titlebar.dom
            ]
        };
    }
    titlebar = new View({
        tag: 'div.titlebar.clearfix',
        child: [
            { tag: 'span.catalog', text: () => this.catalog, hidden: () => !this.catalog },
            {
                tag: 'span.title', text: () => this.title, _key: 'title',
                update: (domdict) => {
                    utils.toggleClass(domdict, 'editable', !!this.titleEditable);
                    if (this.titleEditable) domdict.title = I`Click to edit`;
                    else domdict.removeAttribute('title');
                },
                onclick: async (ev) => {
                    if (!this.titleEditable) return;
                    this.editHelper = this.editHelper || new EditableHelper(this.domdict.title);
                    if (this.editHelper.editing) return;
                    var newName = await this.editHelper.startEditAsync();
                    if (newName !== this.editHelper.beforeEdit && newName != '') {
                        this.onTitleEdit(newName);
                    }
                    this.updateDom();
                }
            },
            this.actions.dom
        ]
    });
    updateDom() {
        super.updateDom();
        this.titlebar.updateDom();
    }
}

export class ActionBtn extends TextView {
    onclick: Action = null;
    constructor(init?: Partial<ActionBtn>) {
        super();
        utils.objectApply(this, init);
    }
    createDom() {
        return { tag: 'span.action.clickable.no-selection' };
    }
    postCreateDom() {
        super.postCreateDom();
        this.dom.addEventListener('click', () => this.onclick?.());
    }
}

import { router } from "./Router";
import { SettingItem, utils, Action, BuildDomExpr, Func, Callbacks, Timer, EventRegistrations } from "./utils";
import { I18n, i18n, I } from "./I18n";
import { Track } from "./Track";
import { user } from "./User";
import { playerCore, PlayingLoopMode, playingLoopModes } from "./PlayerCore";
import { uploads } from "./Uploads";

/** 常驻 UI 元素操作 */
export const ui = new class {
    init() {
        this.lang.init();
        this.sidebar.init();
        this.bottomBar.init();
        this.trackinfo.init();
        this.playerControl.init();
        this.sidebarLogin.init();
        Dialog.defaultParent = new DialogParent(this.mainContainer.dom);
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
            var files = ev.dataTransfer.files;
            if (files.length) {
                new MessageBox().setTitle(I`Question`)
                    .addText(files.length == 1
                        ? I`Did you mean to upload 1 file?`
                        : I`Did you mean to upload ${files.length} files?`)
                    .addResultBtns(['no', 'yes'])
                    .allowCloseWithResult('no')
                    .showAndWaitResult()
                    .then(r => {
                        if (r === 'yes') {
                            if (router.currentStr !== 'uploads') router.nav('uploads');
                            for (let i = 0; i < files.length; i++) {
                                const file = files[i];
                                uploads.uploadFile(file);
                            }
                        }
                    });
            }
        });
    }
    endPreload() {
        setTimeout(() => {
            ui.mainContainer.dom.classList.remove('no-transition');
            utils.fadeout(document.getElementById('preload-overlay'));
        }, 1);
    }
    theme = new class {
        current: 'light' | 'dark' = 'light';
        timer = new Timer(() => utils.toggleClass(document.body, 'changing-theme', false));
        private rendered = false;
        siTheme = new SettingItem<this['current']>('mcloud-theme', 'str', 'light')
            .render((theme) => {
                if (this.current !== theme) {
                    this.current = theme;
                    if (this.rendered) utils.toggleClass(document.body, 'changing-theme', true);
                    utils.toggleClass(document.body, 'dark', theme === 'dark');
                    if (this.rendered) this.timer.timeout(500);
                }
                this.rendered = true;
            });
        set(theme: this['current']) {
            this.siTheme.set(theme);
        }
    };
    lang = new class {
        availableLangs = ['en', 'zh'];
        siLang = new SettingItem('mcloud-lang', 'str', '');
        curLang: string;
        init() {
            this.siLang.render((lang) => {
                if (!lang) lang = I18n.detectLanguage(this.availableLangs);
                this.curLang = lang;
                i18n.curLang = lang;
                document.body.lang = lang;
                console.log(`Current language: '${i18n.curLang}' - '${I`English`}'`);
                i18n.renderElements(document.querySelectorAll('.i18ne'));
            });
        }
        setLang(lang: string, reload?: boolean) {
            this.siLang.set(lang ?? '');
            if (reload === undefined || reload) window.location.reload();
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
        btnLoop = new TextView(document.getElementById('btn-loop'));
        btnVolume: VolumeButton;

        state: typeof playerCore['state'];

        init() {
            this.setState('none');
            this.btnLoop.dom.addEventListener('click', () => {
                var modes = playingLoopModes;
                var next = modes[(modes.indexOf(playerCore.loopMode) + 1) % modes.length];
                playerCore.loopMode = next;
            });
            playerCore.onLoopModeChanged.add(() => this.setLoopMode(playerCore.loopMode))();
            playerCore.onStateChanged.add(() => {
                this.setState(playerCore.state);
                this.setProg(playerCore.currentTime, playerCore.duration);
            })();
            playerCore.onProgressChanged.add(() => this.setProg(playerCore.currentTime, playerCore.duration));
            this.onProgressSeeking((percent) => {
                playerCore.currentTime = percent * playerCore.duration;
            });
            this.onPlayButtonClicked(() => {
                var state = playerCore.state;
                if (state === 'paused') playerCore.play();
                else playerCore.pause();
            });
            this.btnVolume = new VolumeButton(document.getElementById('btn-volume'));
            this.btnVolume.text = I`Volume`;
            this.btnVolume.bindToPlayer();
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
        setLoopMode(str: PlayingLoopMode) {
            this.btnLoop.hidden = false;
            this.btnLoop.text = i18n.get('loopmode_' + str);
        }
        onPlayButtonClicked(cb: () => void) {
            this.btnPlay.dom.addEventListener('click', cb);
        }
        onProgressSeeking(cb: (percent: number) => void) {
            var call = (offsetX) => { cb(utils.numLimit(offsetX / this.progbar.clientWidth, 0, 1)); };
            utils.listenPointerEvents(this.progbar, (e) => {
                e.ev.preventDefault();
                if (e.action != 'move') {
                    utils.toggleClass(this.progbar, 'btn-down', e.action == 'down');
                }
                if (ui.bottomBar.shown && !ui.bottomBar.inTransition)
                    if ((e.type === 'mouse' && e.ev.buttons == 1)
                        || e.type === 'touch') {
                        call(e.point.pageX - this.progbar.getBoundingClientRect().left);
                    }
            });
        }
    };
    trackinfo = new class {
        element = document.getElementById('bottombar-trackinfo');
        init() {
            playerCore.onTrackChanged.add(() => this.setTrack(playerCore.track));
        }
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
    sidebar = new class {
        dom = document.getElementById('sidebar');
        btnShow: SidebarToggle;
        overlay?: Overlay;
        _float = false;
        get float() { return this._float; }
        _hide = false;
        get hide() { return this._hide && this._float; }
        init() {
            this.toggleHide(true);
            this.checkWidth();
            window.addEventListener('resize', () => this.checkWidth());
            router.onNavCompleted.add(() => {
                this.toggleHide(true);
            });
            dragManager.onDragStart.add(() => {
                utils.toggleClass(this.dom, 'peek', true);
            });
            dragManager.onDragEnd.add(() => {
                utils.toggleClass(this.dom, 'peek', false);
            });
            this.dom.addEventListener('dragover', () => this.toggleHide(false));
        }
        checkWidth() {
            var width = window.innerWidth;
            this.toggleFloat(width < 800);
        }
        toggleFloat(float?) {
            if (float !== undefined && !!float == this._float) return;
            this._float = utils.toggleClass(document.body, 'float-sidebar', float);
            if (this._float) {
                this.btnShow = this.btnShow || new SidebarToggle();
                this.dom.parentElement.appendChild(this.btnShow.dom);
            } else {
                this.btnShow.dom.remove();
            }
            this.updateOverlay();
        }
        toggleHide(hide?) {
            this._hide = utils.toggleClass(this.dom, 'hide', hide);
            this.updateOverlay();
        }
        updateOverlay() {
            var showOverlay = this.float && !this.hide;
            if (showOverlay != !!this.overlay) {
                if (showOverlay) {
                    this.overlay = new Overlay({
                        tag: 'div.overlay', style: 'z-index: 99;',
                        onclick: () => this.toggleHide(true),
                        ondragover: () => this.toggleHide(true)
                    });
                    ui.mainContainer.dom.appendView(this.overlay);
                } else {
                    utils.fadeout(this.overlay.dom);
                    this.overlay = null;
                }
            }
        }
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

        features = document.getElementById('sidebar-features');
        featuresListview = new ListView(this.features);

        currentActive = new ItemActiveHelper<ListViewItem>();

        setActive(item: ListViewItem) {
            this.currentActive.set(item);
        }
        addItem(item: ListViewItem) {
            this.listview.add(item);
        }
        addFeatureItem(item: ListViewItem) {
            this.featuresListview.add(item);
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
            cur.onRemove();
            if (cur.dom) this.container.removeChild(cur.dom);
        }
        setCurrent(arg: ContentView) {
            if (arg === this.current) return;
            this.removeCurrent();
            if (arg) {
                arg.onShow();
                if (arg.dom) {
                    this.container.appendChild(arg.dom);
                    arg.onDomInserted();
                }
                if (!arg.contentViewState) arg.contentViewState = { scrollTop: 0 };
                this.container.scrollTop = arg.contentViewState.scrollTop;
            }
            this.current = arg;
        }
    };
}; // ui


interface ContentViewState {
    scrollTop: number;
}

class ProgressButton extends View {
    fill = new View({
        tag: 'div.btn-fill'
    });
    textSpan = new TextView({ tag: 'span.text' });

    get text() { return this.textSpan.text; }
    set text(val) { this.textSpan.text = val; }

    private _progress: number;
    public get progress(): number { return this._progress; }
    public set progress(v: number) {
        this.fill.dom.style.width = (v * 100) + '%';
        this._progress = v;
    }

    constructor(dom?: BuildDomExpr) {
        super(dom ?? { tag: 'div.btn' });
        this.dom.classList.add('btn-progress');
        this.dom.appendView(this.fill);
        this.dom.appendView(this.textSpan);
    }
}

class VolumeButton extends ProgressButton {
    onChanging = new Callbacks<(delta: number) => void>();
    tip = '\n' + I`(Scroll whell or drag to adjust volume)`;

    constructor(dom?: HTMLElement) {
        super(dom);
        dom.addEventListener('wheel', (ev) => {
            ev.preventDefault();
            var delta = Math.sign(ev.deltaY) * -0.1;
            this.onChanging.invoke(delta);
        });
        var startX: number;
        utils.listenPointerEvents(this.dom, (e) => {
            if (e.type == 'mouse' && e.action == 'down' && e.ev.buttons != 1) return;
            e.ev.preventDefault();
            if (e.action == 'down') {
                startX = e.point.pageX;
                this.dom.classList.add('btn-down');
                this.fill.dom.style.transition = 'none';
            } else if (e.action == 'move') {
                var deltaX = e.point.pageX - startX;
                startX = e.point.pageX;
                this.onChanging.invoke(deltaX * 0.01);
            } else if (e.action == 'up') {
                this.dom.classList.remove('btn-down');
                this.fill.dom.style.transition = '';
            }
        });
    }
    bindToPlayer() {
        playerCore.onVolumeChanged.add(() => {
            this.progress = playerCore.volume;
            this.dom.title = I`Volume` + ' ' + Math.floor(this.progress * 100) + '%' + this.tip;
        })();
        this.onChanging.add((x) => {
            var r = utils.numLimit(playerCore.volume + x, 0, 1);
            playerCore.volume = r;
            this.tip = '';
        });
    }
}

class SidebarToggle extends View {
    createDom(): BuildDomExpr {
        return {
            tag: 'div.sidebar-toggle.clickable.no-selection', text: 'M',
            onclick: (ev) => {
                ui.sidebar.toggleHide();
            },
            ondragover: (ev) => {
                ui.sidebar.toggleHide(false);
            }
        };
    }
}