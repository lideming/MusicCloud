// file: UI.ts

import { ListView, ListViewItem, Dialog, ToastsContainer, TextView, View, DialogParent, MessageBox, Overlay, ItemActiveHelper, dragManager, ContextMenu, buildDOM, fadeout, formatDuration, listenPointerEvents, numLimit, replaceChild, toggleClass, mountView, unmountView } from "./viewlib";
import * as views from "./ui-views";
import { MainContainer } from "./ui-views";
import { BottomBar } from "./BottomBar";

View.debugging = true;

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
mountView(document.body, mainContainer);
mountView(document.body, bottomBar);

import { router } from "./Router";
import { SettingItem, BuildDomExpr, Func, Callbacks, Timer, InputStateTracker, Toast, ToolTip } from "./utils";
import { I18n, i18n, I } from "../I18n/I18n";
import { Track } from "../Track/Track";
import { user } from "../API/User";
import { playerCore, playingLoopModes } from "../Player/PlayerCore";
import { uploads } from "../Track/Uploads";
import { api } from "../API/Api";

export const ui = new class {
    usingKeyboardInput = false;
    init() {
        this.addErrorListener();
        this.lang.init();
        this.sidebar.init();
        this.contentBg.init();
        bottomBar.bindPlayer(playerCore);
        this.sidebarLogin.init();
        this.windowTitle.init();
        this.notification.init();
        Dialog.defaultParent = new DialogParent(mainContainer);
        ToastsContainer.default.parentDom = mainContainer.dom;
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
    updateAllViews() {
        mainContainer.updateAll();
        bottomBar.updateAll();
    }
    theme = new class {
        all = ['light', 'dark', 'dark-rounded', 'light-rounded'] as const;
        current: this['all'][number] = 'light';
        timer = new Timer(() => toggleClass(document.body, 'changing-theme', false));
        private rendered = false;
        siTheme = new SettingItem<this['current']>('mcloud-theme', 'str', 'light-rounded')
            .render((theme) => {
                if (this.current !== theme) {
                    this.current = theme;
                    if (this.rendered) toggleClass(document.body, 'changing-theme', true);
                    const [color, rounded] = theme.split('-');
                    toggleClass(document.body, 'dark', color === 'dark');
                    toggleClass(document.body, 'rounded', rounded === 'rounded');
                    var meta = document.getElementById('meta-theme-color') as HTMLMetaElement;
                    if (meta) {
                        meta.content = color === 'dark' ? 'black' : '';
                    } else {
                        console.warn('[UI] Failed to get the "meta-theme-color" element');
                    }
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
                ui.updateAllViews();
            });
            i18n.renderElements(document.querySelectorAll('.i18ne'));
        }
        setLang(lang: string, reload?: boolean) {
            this.siLang.set(lang ?? '');
            if (reload === undefined || reload) window.location.reload();
        }
    };
    mainContainer = new class {
        dom = document.getElementById('main-container')!;
    };
    sidebar = new class {
        dom = document.getElementById('sidebar')!;
        header = mainContainer.sidebar.header;
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
            this.initPanHandler();
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


        private _panxHandler: TouchPanListener = null!;
        private _leftPadding = 200;
        private _getWidth() { return this.dom.offsetWidth - 200; }
        private _movingPos: number | null = null;
        private get movingPos() { return this._movingPos; }
        private set movingPos(pos: number | null) {
            this._movingPos = pos;
            const width = this._getWidth();
            if (pos != null) pos = numSoftLimit(pos, -width, 0, 0.15);
            const ratio = 1 + pos! / width;
            this.overlay!.dom.style.opacity = pos == null ? '' : `${ratio}`;
            this.overlay!.dom.style.transition = pos == null ? 'opacity .3s' : 'none';
            this.dom.style.transform = pos == null ? '' : `translate(${pos}px, 0)`;
            this.dom.style.transition = pos == null ? '' : 'none';
            ui.content.container.dom.style.transition = pos == null ? '' : 'none';
            ui.content.container.dom.style.transform = pos == null ? '' : `translate(${30 * ratio}%, 0)`;
            this.dom.style.boxShadow = pos == null ? '' : `0 0 ${numLimit((width + pos) / 5, 0, 20)}px var(--color-shadow)`;
            if (pos != null && pos > 0) {
                this.btn.dom.style.transform = `translate(${pos}px, 0)`;
                this.btn.dom.style.transition = 'none';
            } else {
                this.btn.dom.style.transform = '';
                this.btn.dom.style.transition = '';
            }
        }

        initPanHandler() {
            this._panxHandler = new TouchPanListener(mainContainer.dom, 'x');
            this._panxHandler.filter = (e) => {
                return this.dom.contains(e.target as Node)
                    || this.overlay?.dom.contains(e.target as Node)
                    || ui.content.container.dom.contains(e.target as Node);
            };
            this._panxHandler.onStart.add(() => {
                this.toggleHide(false);
                this.movingPos = this.dom.getBoundingClientRect().left + this._leftPadding;
            });
            var lastDelta = 0;
            this._panxHandler.onMove.add(({ deltaX }) => {
                lastDelta = deltaX;
                this.movingPos! += deltaX;
            });
            this._panxHandler.onEnd.add(() => {
                var hide = this.movingPos! + lastDelta * 10 < -this._getWidth() / 2;
                this.movingPos = null;
                this.toggleHide(hide);
            });
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
        toggleFloat(float?: boolean) {
            if (float !== undefined && !!float === this._float) return;
            this._float = toggleClass(document.body, 'float-sidebar', float);
            this._panxHandler.enabled = this._float;
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
            ui.content.container.toggleClass('sidebar-shown', !this._hide);
            this.updateOverlay();
        }
        updateOverlay() {
            var showOverlay = this.float && !this.hide;
            if (showOverlay != !!this.overlay) {
                if (showOverlay) {
                    this.overlay = new Overlay({
                        tag: 'div.overlay', style: 'z-index: 99; animation: none; transition: opacity .3s;',
                        onclick: () => this.toggleHide(true),
                        ondragover: () => this.toggleHide(true)
                    });
                    this.overlay.dom.style.opacity = '0';
                    mainContainer.appendView(this.overlay);
                    this.overlay.dom.offsetLeft;
                    this.overlay.dom.style.opacity = '1';
                } else {
                    const overlay = this.overlay!;
                    this.overlay = null;
                    overlay.dom.style.opacity = '0';
                    fadeout(overlay.dom).onFinished(() => {
                        mainContainer.removeView(overlay);
                    });
                }
            }
        }
    };
    sidebarLogin = new class {
        container = mainContainer.sidebar.header;
        loginState = new View({ tag: 'div.item.no-selection', tabIndex: 0 });
        loginName = new TextView({ tag: 'span.user-name' });
        loginAvatar = new View({ tag: 'img.user-avatar' });
        init() {
            this.loginState.addView(this.loginAvatar, 0);
            this.loginState.addView(this.loginName, 1);
            this.container.addView(this.loginState, 0);
            this.loginState.dom.id = 'login-state';
            this.loginState.onActive.add((ev) => {
                user.openUI(undefined, ev);
            });
        }
        update() {
            var text = this.loginName.text;
            var username = user.pendingInfo?.username ?? user.info.username;
            var avatar = api.processUrl(user.info?.avatar) ?? '';
            if (username) {
                text = username;
                if (user.state === 'logging') text += I` (logging in...)`;
                if (user.state === 'error') text += I` (error!)`;
                if (user.state === 'none') text += I` (not logged in)`;
            } else {
                if (user.state === 'logging') text = I`(logging...)`;
                else text = I`Guest (click to login)`;
            }
            this.loginName.text = text;
            this.loginAvatar.hidden = !avatar;
            (this.loginAvatar.dom as HTMLImageElement).src = avatar;
        }
    };
    sidebarList = new class {
        container = mainContainer.sidebar.list;

        featuresListview = mainContainer.sidebar.features;

        currentActive = new ItemActiveHelper<ListViewItem>();

        setActive(item: ListViewItem | null) {
            this.currentActive.set(item);
        }
        addFeatureItem(item: ListViewItem) {
            this.featuresListview.add(item);
        }
    };
    content = new class {
        container = mainContainer.contentOuter;
        current: views.ContentView | null = null;
        removeCurrent() {
            const cur = this.current;
            this.current = null;
            if (!cur) return;
            cur.fadeOut();
        }
        setCurrent(view: views.ContentView | null) {
            if (view === this.current) return;
            this.container.toggleClass('content-animation-reverse', router.wasBacked);
            this.removeCurrent();
            if (view) {
                if (!view.parentView) {
                    view.onShow();
                    this.container.appendView(view);
                    view.onDomInserted();
                }
                view.fadeIn();
            }
            this.current = view;
        }
    };
    contentBg = new class {
        bgView: View | null = null;
        imgView: View | null = null;
        videoView: View | null = null;
        curImg = '';
        init() {
            this.bgView = new View({ tag: 'div.content-bg' });
            ui.content.container.addView(this.bgView, 0);

            playerCore.onTrackChanged.add(() => this.update());
            playerCore.onAudioCreated.add(() => {
                if (!playerCore.audio) return;
                this.videoView = new View(playerCore.audio);
                this.bgView!.addView(this.videoView);
            })();
            playerCore.onStateChanged.add(() => {
                this.bgView!.toggleClass('has-video', playerCore.track?.infoObj?.type === 'video');
            });
            api.onTrackInfoChanged.add((t) => t.id === playerCore.track?.id && this.update());
        }

        toggleFullVideo(full: boolean) {
            this.bgView!.toggleClass('full-video', full);
        }

        update() {
            const newTrack = playerCore.track;
            if (newTrack?.thumburl && newTrack.type != 'video') {
                const url = 'url(' + api.processUrl(newTrack.thumburl) + ')';
                if (this.curImg != url) {
                    const newView = new View({ tag: 'div.content-bg-img', style: { backgroundImage: url } });
                    this.bgView!.addView(newView, 0);
                    this.fadeoutCurrent();
                    this.imgView = newView;
                    this.curImg = url;
                }
            } else {
                this.fadeoutCurrent();
            }
        }

        fadeoutCurrent() {
            const oldbg = this.imgView;
            if (oldbg) {
                fadeout(oldbg.dom, { remove: false }).onFinished(() => {
                    oldbg!.removeFromParent();
                });
                this.curImg = '';
            }
        }
    };
    windowTitle = new class {
        appName = I`Music Cloud`;
        init() {
            this.reset();
            playerCore.onTrackChanged.add(() => {
                ui.windowTitle.setFromTrack(playerCore.track);
            });
        }
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
                        requireInteraction: false,
                        image: !track?.picurl ? undefined : api.processUrl(track.picurl)!,
                        silent: true,
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

class TouchPanListener {
    onStart = new Callbacks<() => void>();
    onMove = new Callbacks<(data: { deltaX: number; deltaY: number; }) => void>();
    onEnd = new Callbacks<() => void>();
    filter: (e: TouchEvent) => boolean;
    constructor(
        readonly element: HTMLElement,
        public mode: 'x' | 'y' | 'both' = 'both',
    ) { }

    private _enabled = false;
    get enabled() { return this._enabled; }
    set enabled(v: boolean) {
        if (v == this._enabled) return;
        this._enabled = v;
        if (v) {
            this.element.addEventListener('touchstart', this._listener, true);
        } else {
            this.element.removeEventListener('touchstart', this._listener, true);
        }
    }

    private _listener = (ev: TouchEvent) => {
        if (this.filter && !this.filter(ev)) return;
        if (ev.touches.length > 1) return;
        var startX = ev.touches[0].pageX;
        var startY = ev.touches[0].pageY;
        var state: 'begin' | 'moving' | 'ignore' = 'begin';
        const move = (ev: TouchEvent) => {
            const x = ev.touches[0].pageX;
            const y = ev.touches[0].pageY;
            // console.info({ state, x, y, startX, startY });
            if (state == 'ignore') return;
            else if (state == 'moving') {
                ev.preventDefault();
                ev.stopPropagation();
                var deltaX = x - startX;
                var deltaY = y - startY;
                this.onMove.invoke({ deltaX, deltaY });
                startX = x;
                startY = y;
            } else { // begin
                if (this.mode == 'x' && Math.abs(y - startY) > 10 && Math.abs(y - startY) > Math.abs(x - startX)) {
                    state = 'ignore';
                } else if (this.mode == 'y' && Math.abs(x - startX) > 10 && Math.abs(x - startX) > Math.abs(y - startY)) {
                    state = 'ignore';
                } else if (Math.abs(x - startX) > 10 || Math.abs(y - startY) > 10) {
                    state = 'moving';
                    ev.preventDefault();
                    ev.stopPropagation();
                    this.onStart.invoke();
                }
            }
        };
        const end = (ev: TouchEvent) => {
            if (ev.touches.length == 0) {
                if (state == 'moving') {
                    this.onEnd.invoke();
                }
                this.element.removeEventListener('touchmove', move, true);
                this.element.removeEventListener('touchend', end, true);
                this.element.removeEventListener('touchcancel', end, true);
            }
        };
        this.element.addEventListener('touchmove', move, true);
        this.element.addEventListener('touchend', end, true);
        this.element.addEventListener('touchcancel', end, true);
    };
}

function numSoftLimit(num: number, low: number, high: number, factor: number) {
    if (num > high) {
        return high + (num - high) * factor;
    } else if (num < low) {
        return low + (num - low) * factor;
    }
    return num;
}