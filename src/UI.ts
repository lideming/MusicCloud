// file: UI.ts

import { ListView, ListViewItem, Dialog, ToastsContainer, TextView, View, DialogParent, MessageBox } from "./viewlib";

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

import { router } from "./Router";
import { SettingItem, utils, ItemActiveHelper, Action, BuildDomExpr, Func, Callbacks, Timer } from "./utils";
import { I18n, i18n, I } from "./I18n";
import { Track } from "./TrackList";
import { user } from "./User";
import { playerCore, PlayingLoopMode, playingLoopModes } from "./PlayerCore";
import { uploads } from "./Uploads";

/** 常驻 UI 元素操作 */
export const ui = new class {
    init() {
        this.lang.init();
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
        document.getElementById('js-ok').hidden=false;
        utils.fadeout(document.getElementById('preload-overlay'));
        window['preload'].end();
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
            this.progbar.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (ui.bottomBar.shown && !ui.bottomBar.inTransition)
                    if (e.buttons == 1) call(e.offsetX);
                document.addEventListener('mousemove', mousemove);
                document.addEventListener('mouseup', mouseup);
            });
            var mousemove = (e: MouseEvent) => {
                call(e.pageX - this.progbar.getBoundingClientRect().left);
            };
            var mouseup = () => {
                document.removeEventListener('mousemove', mousemove);
                document.removeEventListener('mouseup', mouseup);
            };
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
        this.dom.addEventListener('mousedown', (ev) => {
            if (ev.buttons !== 1) return;
            ev.preventDefault();
            var startX = ev.pageX;
            var mousemove = (ev) => {
                var deltaX = ev.pageX - startX;
                startX = ev.pageX;
                this.onChanging.invoke(deltaX * 0.01);
            };
            var mouseup = (ev) => {
                document.removeEventListener('mousemove', mousemove);
                document.removeEventListener('mouseup', mouseup);
                this.dom.classList.remove('btn-down');
                this.fill.dom.style.transition = '';
            };
            document.addEventListener('mousemove', mousemove);
            document.addEventListener('mouseup', mouseup);
            this.dom.classList.add('btn-down');
            this.fill.dom.style.transition = 'none';
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
