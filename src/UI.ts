// file: UI.ts

import { ListView, ListViewItem, Dialog, ToastsContainer, TextView, View, DialogParent, MessageBox, Overlay, ItemActiveHelper, dragManager, ContextMenu } from "./viewlib";
import * as views from "./ui-views";

views.SidebarItem.prototype.bindContentView = function (viewFunc: Func<views.ContentView>) {
    var view: views.ContentView;
    this.onclick = () => {
        if (!view) view = viewFunc();
        ui.content.setCurrent(view);
        ui.sidebarList.setActive(this);
    };
    return this;
};

import { router } from "./Router";
import { SettingItem, utils, Action, BuildDomExpr, Func, Callbacks, Timer, EventRegistrations } from "./utils";
import { I18n, i18n, I } from "./I18n";
import { Track } from "./Track";
import { user } from "./User";
import { playerCore, PlayingLoopMode, playingLoopModes } from "./PlayerCore";
import { uploads } from "./Uploads";

export const ui = new class {
    usingKeyboardInput = false;
    init() {
        this.lang.init();
        this.sidebar.init();
        this.bottomBar.init();
        this.trackinfo.init();
        this.playerControl.init();
        this.sidebarLogin.init();
        this.windowTitle.reset();
        this.notification.init();
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
            if (ev.defaultPrevented) return;
            ev.preventDefault();
            const files = ev.dataTransfer?.files;
            if (files && files.length) {
                new MessageBox().setTitle(I`Question`)
                    .addText(files.length === 1
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
        document.addEventListener('keydown', (e) => {
            this.usingKeyboardInput = true;
            document.body.classList.add('keyboard-input');
        }, true);
        ['mousedown', 'touchstart'].forEach(evt =>
            document.addEventListener(evt, (e) => {
                this.usingKeyboardInput = false;
                document.body.classList.remove('keyboard-input');
            }, true)
        );
    }
    endPreload() {
        setTimeout(() => {
            ui.mainContainer.dom.classList.remove('no-transition');
            utils.fadeout(document.getElementById('preload-overlay')!);
        }, 1);
    }
    isVisible() {
        return !document['hidden'];
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
                    var meta = document.getElementById('meta-theme-color') as HTMLMetaElement;
                    meta.content = theme === 'dark' ? 'black' : '';
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
                console.info(`[UI] Current language: '${i18n.curLang}' - '${I`English`}'`);
                i18n.renderElements(document.querySelectorAll('.i18ne'));
            });
        }
        setLang(lang: string, reload?: boolean) {
            this.siLang.set(lang ?? '');
            if (reload === undefined || reload) window.location.reload();
        }
    };
    bottomBar = new class {
        container: HTMLElement = document.getElementById("bottombar")!;
        btnPin = new TextView(document.getElementById('btnPin')!);
        siPin: SettingItem<boolean>;
        private pinned = true;
        hideTimer = new utils.Timer(() => { this.toggle(false); });
        mouseInside = false;
        focusInside = false;
        shown = false;
        inTransition = false;
        setPinned(val?: boolean) {
            if (val === undefined) {
                this.siPin.toggle();
            } else if (val !== this.siPin.data) {
                this.siPin.set(val);
            } else {
                this.pinned = val;
                utils.toggleClass(document.body, 'bottompinned', val);
                this.btnPin.text = val ? I`Unpin` : I`Pin`;
                if (val) this.toggle(true);
            }
        }
        toggle(state?: boolean, hideTimeout?: number) {
            this.shown = utils.toggleClass(this.container, 'show', state);
            if (state && hideTimeout && !this.pinned) this.updateState(hideTimeout);
        }
        private updateState(timeout = 200) {
            var showing = this.pinned || this.mouseInside || (this.focusInside && ui.usingKeyboardInput);
            if (showing) {
                this.hideTimer.tryCancel();
                this.toggle(true);
            } else {
                this.hideTimer.tryCancel();
                if (!this.pinned) this.hideTimer.timeout(timeout);
            }
        }
        init() {
            var bar = this.container;
            bar.addEventListener('transitionstart', (e) => {
                if (e.target === bar && e.propertyName === 'transform') this.inTransition = true;
            });
            bar.addEventListener('transitionend', (e) => {
                if (e.target === bar && e.propertyName === 'transform') this.inTransition = false;
            });
            bar.addEventListener('transitioncancel', (e) => {
                if (e.target === bar && e.propertyName === 'transform') this.inTransition = false;
            });
            bar.addEventListener('mouseenter', () => {
                this.mouseInside = true;
                this.updateState();
            }, true);
            bar.addEventListener('mouseleave', (e) => {
                if (e.relatedTarget instanceof Node && bar.contains(e.relatedTarget))
                    return;
                this.mouseInside = false;
                this.updateState();
            }, true);
            bar.addEventListener('focusin', () => {
                this.focusInside = true;
                this.updateState();
            }, true);
            bar.addEventListener('focusout', (e) => {
                if (e.relatedTarget instanceof Node && bar.contains(e.relatedTarget))
                    return;
                this.focusInside = false;
                this.updateState();
            }, true);
            bar.addEventListener('keydown', (e) => {
                this.updateState();
            }, true);
            this.siPin = new SettingItem('mcloud-bottompin', 'bool', false);
            this.siPin.render(x => this.setPinned(x));
            this.btnPin.onactive = () => this.siPin.toggle();
        }
    };
    playerControl = new class {
        progbar = document.getElementById('progressbar')!;
        fill = document.getElementById('progressbar-fill')!;
        labelCur = document.getElementById('progressbar-label-cur')!;
        labelTotal = document.getElementById('progressbar-label-total')!;
        btnPlay = new TextView(document.getElementById('btn-play')!);
        btnLoop = new TextView(document.getElementById('btn-loop')!);
        btnPrev = new View(document.getElementById('btn-prevtrack')!);
        btnNext = new View(document.getElementById('btn-nexttrack')!);
        btnVolume: VolumeButton;

        state: typeof playerCore['state'];

        init() {
            this.setState('none');
            this.btnPlay.onactive = () => {
                var state = playerCore.state;
                if (state === 'paused') playerCore.play();
                else playerCore.pause();
            };
            this.btnLoop.onactive = () => {
                var modes = playingLoopModes;
                var next = modes[(modes.indexOf(playerCore.loopMode) + 1) % modes.length];
                playerCore.loopMode = next;
            };
            this.btnPrev.onactive = () => playerCore.prev();
            this.btnNext.onactive = () => playerCore.next();
            playerCore.onLoopModeChanged.add(() => this.setLoopMode(playerCore.loopMode))();
            playerCore.onStateChanged.add(() => {
                this.setState(playerCore.state);
                this.setProg(playerCore.currentTime, playerCore.duration);
            })();
            playerCore.onProgressChanged.add(() => this.setProg(playerCore.currentTime, playerCore.duration));
            this.onProgressSeeking((percent) => {
                playerCore.ensureLoaded().then(() => {
                    playerCore.currentTime = percent * playerCore.duration!;
                });
            });
            this.btnVolume = new VolumeButton(document.getElementById('btn-volume')!);
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
        setProg(cur: number | undefined, total: number | undefined) {
            var prog = cur! / total!;
            prog = utils.numLimit(prog, 0, 1);
            this.fill.style.width = (prog * 100) + '%';
            this.labelCur.textContent = utils.formatTime(cur!);
            this.labelTotal.textContent = utils.formatTime(total!);
        }
        setLoopMode(str: PlayingLoopMode) {
            this.btnLoop.hidden = false;
            this.btnLoop.text = i18n.get('loopmode_' + str);
        }
        onProgressSeeking(cb: (percent: number) => void) {
            var call = (offsetX) => { cb(utils.numLimit(offsetX / this.progbar.clientWidth, 0, 1)); };
            utils.listenPointerEvents(this.progbar, (e) => {
                e.ev.preventDefault();
                if (e.action != 'move') {
                    utils.toggleClass(this.progbar, 'btn-down', e.action === 'down');
                }
                if (ui.bottomBar.shown && !ui.bottomBar.inTransition)
                    if ((e.type === 'mouse' && e.ev.buttons === 1)
                        || e.type === 'touch') {
                        call(e.point.pageX - this.progbar.getBoundingClientRect().left);
                    }
                if (e.action === 'down') return 'track';
            });
        }
    };
    trackinfo = new class {
        element = document.getElementById('bottombar-trackinfo')!;
        init() {
            playerCore.onTrackChanged.add(() => this.setTrack(playerCore.track));
            this.element.addEventListener('click', (ev) => {
                if (router.current[0] != 'nowplaying')
                    router.nav('nowplaying');
            });
        }
        setTrack(track: Track | null) {
            ui.windowTitle.setFromTrack(track);
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
        dom = document.getElementById('main-container')!;
    };
    sidebar = new class {
        dom = document.getElementById('sidebar')!;
        btnShow: SidebarToggle;
        overlay: Overlay | null;
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
            if (float !== undefined && !!float === this._float) return;
            this._float = utils.toggleClass(document.body, 'float-sidebar', float);
            if (this._float) {
                this.btnShow = this.btnShow || new SidebarToggle();
                this.dom.parentElement!.appendChild(this.btnShow.dom);
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
                    utils.fadeout(this.overlay!.dom);
                    this.overlay = null;
                }
            }
        }
    };
    sidebarLogin = new class {
        container = document.getElementById('sidebar-login')!;
        loginState = new views.SidebarItem();
        init() {
            this.container.appendView(this.loginState);
            this.loginState.dom.id = 'login-state';
            this.loginState.onactive = (ev) => {
                user.openUI();
            };
        }
        update() {
            var text = this.loginState.text;
            var username = user.pendingInfo?.username ?? user.info.username;
            if (username) {
                text = username;
                if (user.state === 'logging') text += I` (logging in...)`;
                if (user.state === 'error') text += I` (error!)`;
                if (user.state === 'none') text += I` (not logged in)`;
            } else {
                if (user.state === 'logging') text = I`(logging...)`;
                else text = I`Guest (click to login)`;
            }
            this.loginState.updateWith({ text });
        }
    };
    sidebarList = new class {
        container = document.getElementById('sidebar-list')!;
        listview = new ListView(this.container);

        features = document.getElementById('sidebar-features')!;
        featuresListview = new ListView(this.features);

        currentActive = new ItemActiveHelper<ListViewItem>();

        setActive(item: ListViewItem | null) {
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
        container = document.getElementById('content-outer')!;
        current: views.ContentView | null = null;
        removeCurrent() {
            const cur = this.current;
            this.current = null;
            if (!cur) return;
            cur.onRemove();
            if (cur.dom) this.container.removeChild(cur.dom);
        }
        setCurrent(arg: views.ContentView | null) {
            if (arg === this.current) return;
            this.removeCurrent();
            if (arg) {
                arg.onShow();
                if (arg.dom) {
                    this.container.appendChild(arg.dom);
                    arg.onDomInserted();
                }
            }
            this.current = arg;
        }
    };
    windowTitle = new class {
        appName = I`Music Cloud`;
        reset() { this.setTitle(null); }
        setTitle(title: string | null) {
            if (title) title += ' - ' + this.appName;
            else title = this.appName;
            document.title = title;
        }
        setFromTrack(track: Track | null) {
            if (!track) this.setTitle(null);
            else this.setTitle(track.name + ' - ' + track.artist);
        }
    };
    notification = new class {
        siNotification = new SettingItem('mcloud-notif', 'json', {
            enabled: false,
            nowPlaying: true
        });
        lastNotif: Notification | null = null;
        get config() { return this.siNotification.data; }
        isEnabledFor(key: keyof this['config']) {
            return this.config.enabled && this.config[key as any];
        }
        browserSupport() { return ('Notification' in window); };
        checkPermission() { return (Notification.permission == 'granted'); }
        async requestPermission(): Promise<boolean> {
            if (!this.browserSupport()) return false;
            if (this.checkPermission()) return true;
            return await Notification.requestPermission() == 'granted';
        }
        show(title: string, options?: NotificationOptions, timeout = 5000) {
            console.info('[UI] notification', { title, options, timeout });
            if (this.lastNotif) this.lastNotif.close();
            var current = this.lastNotif = new Notification(title, options);
            if (timeout) {
                setTimeout(() => {
                    current.close();
                }, timeout);
            }
            return current;
        }
        init() {
            if (this.config.enabled && (!this.browserSupport() || !this.checkPermission())) {
                this.config.enabled = false;
                this.siNotification.save();
            }
            playerCore.onTrackChanged.add(() => {
                if (this.isEnabledFor('nowPlaying') && !ui.isVisible()
                    && this.config.nowPlaying && playerCore.state == 'playing') {
                    const track = playerCore.track!;
                    this.show(track.name, {
                        body: I`Artist` + ': ' + track?.artist,
                        requireInteraction: false
                    });
                }
            });
        }
        async enable() {
            if (this.browserSupport() && await this.requestPermission()) {
                this.config.enabled = true;
                this.siNotification.save();
            }
        }
    };

    showContextMenuForItem(items: ListViewItem[], menu: ContextMenu, ...args: Parameters<ContextMenu['show']>) {
        menu.show(...args);
        items.forEach(t => t.toggleClass('menu-shown', true));
        menu.onClose.add(() => {
            items.forEach(t => t.toggleClass('menu-shown', false));
        });
    }
}; // ui

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
        this.dom.addEventListener('wheel', (ev) => {
            ev.preventDefault();
            var delta = Math.sign(ev.deltaY) * -0.05;
            this.onChanging.invoke(delta);
        });
        var startX: number;
        utils.listenPointerEvents(this.dom, (e) => {
            if (e.type === 'mouse' && e.action === 'down' && e.ev.buttons != 1) return;
            e.ev.preventDefault();
            if (e.action === 'down') {
                this.dom.focus();
                startX = e.point.pageX;
                this.dom.classList.add('btn-down');
                this.fill.dom.style.transition = 'none';
                return 'track';
            } else if (e.action === 'move') {
                var deltaX = e.point.pageX - startX;
                startX = e.point.pageX;
                this.onChanging.invoke(deltaX * 0.01);
            } else if (e.action === 'up') {
                this.dom.classList.remove('btn-down');
                this.fill.dom.style.transition = '';
            }
        });
        const mapKeyAdjustment = {
            "ArrowUp": 0.05,
            "ArrowDown": -0.05,
            "ArrowRight": 0.01,
            "ArrowLeft": -0.01,
        };
        this.dom.addEventListener('keydown', (e) => {
            var adj = mapKeyAdjustment[e.code];
            if (adj) {
                e.preventDefault();
                this.onChanging.invoke(adj);
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
            r = Math.round(r * 100) / 100;
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