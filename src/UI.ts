// file: UI.ts

import { ListView, ListViewItem, Dialog, ToastsContainer, TextView, View, DialogParent, MessageBox, Overlay, ItemActiveHelper, dragManager, ContextMenu, buildDOM, fadeout, formatTime, listenPointerEvents, numLimit, replaceChild, toggleClass } from "./viewlib";
import * as views from "./ui-views";
import { MainContainer, BottomBar } from "./ui-views";

views.SidebarItem.prototype.bindContentView = function (viewFunc: Func<views.ContentView>) {
    this.onActive.add(() => {
        if (!this.contentView) this.contentView = viewFunc();
        if (ui.content.current === this.contentView) {
            this.contentView.onSidebarItemReactived();
            return;
        }
        ui.content.setCurrent(this.contentView);
        ui.sidebarList.setActive(this);
    });
    return this;
};

const mainContainer = new MainContainer();
const bottomBar = new BottomBar();
document.body.insertBefore(mainContainer.dom, document.body.firstChild);
document.body.insertBefore(bottomBar.dom, mainContainer.dom.nextSibling);

import { router } from "./Router";
import { SettingItem, BuildDomExpr, Func, Callbacks, Timer, InputStateTracker, Toast, ToolTip } from "./utils";
import { I18n, i18n, I } from "./I18n";
import { Track } from "./Track";
import { user } from "./User";
import { playerCore, playingLoopModes } from "./PlayerCore";
import { uploads } from "./Uploads";

export const ui = new class {
    usingKeyboardInput = false;
    init() {
        this.addErrorListener();
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
        ToastsContainer.default.dom.style.position = 'absolote';
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
            }, { passive: true, capture: true })
        );
    }
    addErrorListener() {
        window.addEventListener("error", (e) => {
            Toast.show(I`Application Error:` + "\n" + e.error, 5000);
        });
    }
    endPreload() {
        setTimeout(() => {
            ui.mainContainer.dom.classList.remove('no-transition');
            fadeout(document.getElementById('preload-overlay')!);
        }, 1);
    }
    isVisible() {
        return !document['hidden'];
    }
    theme = new class {
        current: 'light' | 'dark' = 'light';
        timer = new Timer(() => toggleClass(document.body, 'changing-theme', false));
        private rendered = false;
        siTheme = new SettingItem<this['current']>('mcloud-theme', 'str', 'light')
            .render((theme) => {
                if (this.current !== theme) {
                    this.current = theme;
                    if (this.rendered) toggleClass(document.body, 'changing-theme', true);
                    toggleClass(document.body, 'dark', theme === 'dark');
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
            });
            i18n.renderElements(document.querySelectorAll('.i18ne'));
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
        InputStateTracker = new InputStateTracker(this.container);
        hideTimer = new Timer(() => { this.toggle(false); });
        shown = false;
        inTransition = false;
        setPinned(val?: boolean) {
            if (val === undefined) {
                this.siPin.toggle();
            } else if (val !== this.siPin.data) {
                this.siPin.set(val);
            } else {
                this.pinned = val;
                toggleClass(document.body, 'bottompinned', val);
                this.btnPin.text = val ? I`Unpin` : I`Pin`;
                if (val) this.toggle(true);
            }
        }
        toggle(state?: boolean, hideTimeout?: number) {
            this.shown = toggleClass(this.container, 'show', state);
            if (state && hideTimeout && !this.pinned) this.updateState(hideTimeout);
        }
        private updateState(timeout = 200) {
            var showing = this.pinned || this.InputStateTracker.state.mouseIn
                || this.InputStateTracker.state.mouseDown || (this.InputStateTracker.state.focusIn && ui.usingKeyboardInput);
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
            this.InputStateTracker.onChanged.add(() => this.updateState());
            bar.addEventListener('transitionstart', (e) => {
                if (e.target === bar && e.propertyName === 'transform') this.inTransition = true;
            });
            bar.addEventListener('transitionend', (e) => {
                if (e.target === bar && e.propertyName === 'transform') this.inTransition = false;
            });
            bar.addEventListener('transitioncancel', (e) => {
                if (e.target === bar && e.propertyName === 'transform') this.inTransition = false;
            });
            bar.addEventListener('keydown', (e) => {
                this.updateState();
            }, true);
            this.siPin = new SettingItem('mcloud-bottompin', 'bool', this.pinned);
            this.siPin.render(x => this.setPinned(x));
            this.btnPin.onActive.add(() => this.siPin.toggle());
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
            this.btnPlay.onActive.add(() => {
                var state = playerCore.state;
                if (state === 'paused') playerCore.play();
                else playerCore.pause();
            });
            this.btnLoop.onActive.add(() => {
                var modes = playingLoopModes;
                var next = modes[(modes.indexOf(playerCore.loopMode) + 1) % modes.length];
                playerCore.loopMode = next;
            });
            this.btnPrev.onActive.add(() => playerCore.prev());
            this.btnNext.onActive.add(() => playerCore.next());
            playerCore.onLoopModeChanged.add(() => this.updateLoopMode())();
            playerCore.onTrackChanged.add(() => this.updateLoopMode())();
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
            prog = numLimit(prog, 0, 1);
            this.fill.style.width = (prog * 100) + '%';
            this.labelCur.textContent = formatTime(cur!);
            this.labelTotal.textContent = formatTime(total!);
        }
        updateLoopMode() {
            this.btnLoop.hidden = false;
            this.btnLoop.text = i18n.get('loopmode_' + playerCore.loopMode);
            this.btnNext.toggleClass('disabled', !playerCore.getNextTrack(1));
            this.btnPrev.toggleClass('disabled', !playerCore.getNextTrack(-1));
        }
        onProgressSeeking(cb: (percent: number) => void) {
            var call = (offsetX) => { cb(numLimit(offsetX / this.progbar.clientWidth, 0, 1)); };
            listenPointerEvents(this.progbar, (e) => {
                e.ev.preventDefault();
                if (e.action != 'move') {
                    toggleClass(this.progbar, 'btn-down', e.action === 'down');
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
                replaceChild(this.element, buildDOM({
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
        btn: SidebarToggle;
        overlay: Overlay | null;
        private _float = false;
        get float() { return this._float; }
        private _hide = false;
        private _hideMobile = true;
        private _hideLarge = false;
        get hide() { return this._hide && this._float; }
        private _btnShown = false;
        get btnShown() { return this._btnShown; }
        private _isMobile = false;
        init() {
            this.toggleBtn(true);
            this.checkWidth();
            window.addEventListener('resize', () => this.checkWidth());
            router.onNavCompleted.add(() => {
                if (this.float) this.toggleHide(true);
            });
            dragManager.onDragStart.add(() => {
                toggleClass(this.dom, 'peek', true);
            });
            dragManager.onDragEnd.add(() => {
                toggleClass(this.dom, 'peek', false);
            });
            this.dom.addEventListener('dragover', () => this.toggleHide(false));
        }
        isMobile() {
            var width = window.innerWidth;
            return width < 800;
        }
        checkWidth() {
            const mobile = this.isMobile();
            if (mobile != this._isMobile) {
                this._isMobile = mobile;
                this.toggleHide(mobile ? (this._hideMobile || this._hideLarge) : (this._hideLarge && this._hideMobile));
            }
        }
        toggleFloat(float?) {
            if (float !== undefined && !!float === this._float) return;
            this._float = toggleClass(document.body, 'float-sidebar', float);
            this.updateOverlay();
        }
        toggleBtn(show: boolean) {
            if (show == this._btnShown) return;
            this._btnShown = show;
            if (show) {
                this.btn = this.btn || new SidebarToggle();
                this.dom.parentElement!.appendChild(this.btn.dom);
            } else {
                this.btn.dom.remove();
            }
        }

        toggleHide(hide?) {
            this._hide = toggleClass(this.dom, 'hide', hide);
            if (this.isMobile()) this._hideMobile = this._hide;
            else this._hideLarge = this._hide;
            this.toggleFloat(this.isMobile() || this._hide);
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
                    fadeout(this.overlay!.dom);
                    this.overlay = null;
                }
            }
        }
    };
    sidebarLogin = new class {
        container = document.getElementById('sidebar-header')!;
        loginState = new views.SidebarItem();
        init() {
            this.container.insertBefore(this.loginState.dom, this.container.firstChild);
            this.loginState.dom.id = 'login-state';
            this.loginState.onActive.add((ev) => {
                user.openUI(undefined, ev);
            });
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

        features = document.getElementById('sidebar-features')!;
        featuresListview = new ListView(this.features);

        currentActive = new ItemActiveHelper<ListViewItem>();

        setActive(item: ListViewItem | null) {
            this.currentActive.set(item);
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
            if (cur.dom) {
                this.container.removeChild(cur.dom);
                cur.onDomRemoved();
            }
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
                    && this.config.nowPlaying && (playerCore.state == 'playing' || playerCore.state == 'stalled')) {
                    const track = playerCore.track!;
                    this.show(track.name, {
                        body: I`Artist` + ': ' + track?.artist,
                        requireInteraction: false
                    });
                }
            });
        }
        async setEnable(enable: boolean) {
            if (enable && !(this.browserSupport() && await this.requestPermission()))
                return;
            this.config.enabled = enable;
            this.siNotification.save();
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
    showUsage = false;
    tipView = new ToolTip();
    InputStateTracker: InputStateTracker;
    get state() { return this.InputStateTracker.state; }

    get progress() { return super.progress; }
    set progress(val: number) {
        super.progress = val;
        this.updateTip();
    }

    constructor(dom?: HTMLElement) {
        super(dom);
        this.tipView.toggleClass('volume-tip', true);
        this.InputStateTracker = new InputStateTracker(this.dom);
        this.InputStateTracker.onChanged.add(() => this.updateTip());
        this.dom.addEventListener('wheel', (ev) => {
            ev.preventDefault();
            var delta = Math.sign(ev.deltaY) * -0.05;
            this.onChanging.invoke(this.progress + delta);
        });
        var startX: number;
        var startVol: number;
        listenPointerEvents(this.dom, (e) => {
            if (e.type === 'mouse' && e.action === 'down' && e.ev.buttons != 1) return;
            e.ev.preventDefault();
            if (e.action === 'down') {
                this.dom.focus();
                startX = e.point.pageX;
                startVol = this.progress;
                this.dom.classList.add('btn-down');
                this.fill.dom.style.transition = 'none';
                return 'track';
            } else if (e.action === 'move') {
                var deltaX = e.point.pageX - startX;
                this.onChanging.invoke(startVol + deltaX * 0.01);
            } else if (e.action === 'up') {
                if (e.ev.type == "touchcancel") this.onChanging.invoke(startVol);
                this.dom.classList.remove('btn-down');
                this.fill.dom.style.transition = '';
            }
            this.updateTip();
        });
        this.dom.addEventListener('click', (e) => {
            this.showUsage = true;
            this.updateTip();
        });
        const mapKeyAdjustment = {
            "ArrowUp": 0.05,
            "ArrowDown": -0.05,
            "ArrowRight": 0.01,
            "ArrowLeft": -0.01,
        };
        this.dom.addEventListener('keydown', (e) => {
            var adj = mapKeyAdjustment[e.code] as number;
            if (adj) {
                e.preventDefault();
                this.onChanging.invoke(this.progress + adj);
            }
        });
    }

    private updateTip() {
        const percent = Math.floor(this.progress * 100);
        this.tipView.text = percent + '%';
        const showing = this.state.mouseIn || this.state.mouseDown || (this.state.focusIn && ui.usingKeyboardInput);
        if (showing == this.tipView.shown) {
        } else if (showing) {
            const rect = this.dom.getBoundingClientRect();
            const parentRect = ui.bottomBar.container.getBoundingClientRect();
            this.tipView.show({
                x: rect.left + rect.width / 2 - parentRect.left,
                y: rect.top - parentRect.top - 3,
                parent: ui.bottomBar.container
            });
        } else {
            this.tipView.close({
                className: 'animation-fading-out'
            });
        }
    }

    bindToPlayer() {
        playerCore.onVolumeChanged.add(() => {
            this.progress = playerCore.volume;
        })();
        this.onChanging.add((x) => {
            var r = numLimit(x, 0, 1);
            r = Math.round(r * 100) / 100;
            this.showUsage = false;
            playerCore.volume = r;
        });
    }
}

class SidebarToggle extends View {
    createDom(): BuildDomExpr {
        return {
            tag: 'div.sidebar-toggle.clickable.no-selection',
            child: {
                tag: 'div.logo',
                text: 'M'
            },
            onclick: (ev) => {
                ui.sidebar.toggleHide();
            },
            ondragover: (ev) => {
                ui.sidebar.toggleHide(false);
            }
        };
    }
}
