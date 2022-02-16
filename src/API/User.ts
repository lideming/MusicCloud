// file: User.ts

import { SettingItem, Callbacks, Action, TextCompositionWatcher, LoadingIndicator, i18n } from "../Infra/utils";
import { I } from "../I18n/I18n";
import { listIndex } from "../Track/ListIndex";
import { Dialog, View, TextBtn, LabeledInput, TextView, ButtonView, Toast, base64EncodeUtf8, buildDOM, objectApply, Ref, FileSelector } from "../Infra/viewlib";
import { Api } from "./apidef";
import { ui } from "../Infra/UI";
import { api } from "./Api";
import { playerCore } from "../Player/PlayerCore";
import { uploads } from "../Track/Uploads";
import { TrackList } from "../Track/TrackList";
import { Track } from "../Track/Track";
import { settingsUI } from "../Settings/SettingsUI";

export const user = new class User {
    siLogin = new SettingItem('mcloud-login', 'json', {
        id: -1,
        username: null! as string,
        passwd: undefined as (string | undefined),
        token: null! as string,
        avatar: undefined as string | undefined,
        lastBaseUrl: null! as string
    });
    loginDialog: LoginDialog;
    readonly info = this.siLogin.data;
    get id() { return this.info.id; }

    role?: Api.UserInfo['role'];
    get isAdmin() { return this.role === 'admin'; }

    private _serverOptions: Api.ServerConfig = {};
    get serverOptions() { return this._serverOptions; }

    state: 'none' | 'logging' | 'error' | 'logged' = 'none';
    onSwitchedUser = new Callbacks<Action>();
    loggingin: Promise<void> | null = null;
    pendingInfo: User['info'] | null = null;
    setState(state: User['state']) {
        this.state = state;
        ui.sidebarLogin.update();
    }
    init() {
        playerCore.onTrackChanged.add(() => this.playingTrackChanged());
        const preLogin = window['preload']?.preLoginTask;
        if (window['preload']?.['inputToken']) {
            this.info.token = window['preload']['inputToken'];
        }
        if (this.info.username || this.info.token || preLogin) {
            this.login(preLogin ? { preLogin: preLogin } : { info: this.info }).then(null, (err) => {
                Toast.show(I`Failed to login.` + '\n' + err, 5000);
            });
        } else {
            this.setState('none');
            this.openUI();
        }

        if (window.location.href.indexOf("#social-link-success") >= 0) {
            window.history.replaceState(null, "", window.location.href.split("#social-link-success")[0]);
            Toast.show(I`Account has been linked successfully.`, 5000);
            new LoginSettingsDialog().show();
        }
        if (window.location.href.indexOf("#social-link-error") >= 0) {
            var splits = window.location.href.split("#social-link-error=");
            window.history.replaceState(null, "", splits[0]);
            var error = splits[1];
            Toast.show(I`Account linking error: ${i18n.get('social-link-error_' + error)}`, 5000);
            new LoginSettingsDialog().show();
        }
    }
    openUI(login?: boolean, ev?: MouseEvent) {
        login = login ?? this.state !== 'logged';
        if (login) {
            if (!this.loginDialog) this.loginDialog = new LoginDialog();
            this.loginDialog.show(ev);
        } else {
            new MeDialog().show(ev);
        }
    }
    closeUI() {
        this.loginDialog?.close();
    }
    getBasicAuth(info: Api.UserInfo) {
        return 'Basic ' + base64EncodeUtf8(info.username + ':' + info.passwd);
    }
    getBearerAuth(token: string) {
        return 'Bearer ' + token;
    }
    async login(arg: { info?: Api.UserInfo, preLogin?: Promise<Api.UserInfo>; }) {
        if (this.state !== 'logged') this.setState('logging');
        // try GET `api/users/me` using the new info
        var promise = (async () => {
            let resp: Api.UserInfo;
            try {
                if (arg.info) {
                    const info = arg.info;
                    const token = info.token;
                    console.info({ info, token });
                    resp = token ?
                        await api.get('users/me', {
                            auth: this.getBearerAuth(token)
                        }) as Api.UserInfo
                        : await api.post({
                            path: 'users/me/login',
                            auth: this.getBasicAuth(info)
                        }) as Api.UserInfo;
                } else if (arg.preLogin) {
                    resp = await arg.preLogin;
                } else {
                    throw new Error('Unexpected login argument');
                }
            } catch (err) {
                if (this.state !== 'logged') this.setState('error');
                if (err.message === 'user_not_found')
                    throw new Error(I`Username or password is not correct.`);
                throw err;
            } finally {
                this.pendingInfo = null;
            }
            await this.handleLoginResult(resp);
        })();
        this.loggingin = promise;
        await promise;
    }
    async register(info: Api.UserInfo) {
        this.setState('logging');
        var promise = (async () => {
            var resp = await api.post({
                path: 'users/new',
                obj: info
            });
            if (resp.error) {
                this.setState('error');
                if (resp.error === 'dup_user') throw new Error(I`A user with the same username exists`);
                throw new Error(resp.error);
            }
            await this.handleLoginResult(resp);
        })();
        this.loggingin = promise;
        await promise;
    }
    async handleLoginResult(info: Api.UserInfo) {
        if (!info.username || !info.id) throw new Error(I`iNTernEL eRRoR`);
        var switchingUser = this.info.username != info.username;
        this.info.id = info.id;
        this.info.username = info.username;
        this.info.avatar = info.avatar ?? undefined;
        this.info.passwd = undefined;
        if (info.token) this.info.token = info.token;
        this.info.lastBaseUrl = api.baseUrl;
        this.role = info.role;
        this.siLogin.save();

        if (info.serverOptions) {
            const options = this._serverOptions = info.serverOptions;
            if (options.msg) Toast.show(I`Server: ` + options.msg, 3000);
            api.storageUrlBase = options.storageUrlBase || '';
        }

        api.defaultAuth = this.getBearerAuth(this.info.token);
        ui.sidebarLogin.update();
        listIndex.setIndex(info as any);
        this.setState('logged');
        this.loggingin = null;
        this.onSwitchedUser.invoke();

        if (info.playing && !playerCore.track) this.tryRestorePlaying(info.playing);
    }
    async logout() {
        if (this.info.token) {
            var toast = Toast.show(I`Logging out...`);
            try {
                await api.post({ path: 'users/me/logout' });
                toast.close();
            } catch (error) {
                toast.text = I`Failed to logout.` + '\n' + error;
                toast.show(5000);
                return;
            }
        }
        objectApply(this.info, { id: -1, username: undefined, passwd: undefined, token: undefined, avatar: undefined });
        this.role = undefined;
        this.siLogin.save();
        api.defaultAuth = null;
        ui.content.setCurrent(null);
        listIndex.setIndex(null);
        this.setState('none');
        this.loggingin = null;
        this.onSwitchedUser.invoke();
    }
    async setListids(listids: number[]) {
        var obj: Api.UserInfo = {
            id: this.info.id,
            username: this.info.username,
            listids: listids
        };
        await api.put({
            path: 'users/me',
            obj
        });
    }
    /**
     * Wait until finished logging in. Returns true if sucessfully logged in.
     */
    async waitLogin(throwOnFail?: boolean): Promise<boolean> {
        do {
            if (this.state === 'logged') return true;
            if (this.state === 'logging') {
                try {
                    await this.loggingin;
                    if (this.state as any != 'logged') break;
                    return true;
                } catch {
                    break;
                }
            }
        } while (0);
        if (throwOnFail) throw new Error('No login');
        return false;
    }

    _ignore_track_once: Track | null = null;
    playingTrackChanged() {
        var track = playerCore.track;
        if (track && this._ignore_track_once === track) {
            this._ignore_track_once = null;
            return;
        }
        var tl: Api.TrackLocation = {
            listid: track?._bind?.list?.id ?? 0,
            position: track?._bind?.position ?? 0,
            trackid: track?.id ?? 0,
            profile: playerCore.trackProfile?.profile ?? ''
        };
        this.postPlaying(tl)
            .then(() => console.info("[User] post playing OK"),
                (err) => console.warn('[User] post playing error', err));
    }
    async tryRestorePlaying(playing: Api.TrackLocation) {
        if (playing.trackid) {
            var tmpTrack: Track | null = null;
            if (playing.track) {
                tmpTrack = new Track({ infoObj: playing.track });
                this._ignore_track_once = tmpTrack;
                playerCore.setTrack(tmpTrack);
            }
            var list: TrackList = playing.listid ? listIndex.getList(playing.listid) : uploads;
            await list.fetch();
            var track: Track | null = list.tracks[playing.position];
            if (track?.id !== playing.trackid)
                track = list.tracks.find(x => x.id === playing.trackid) || null;
            if ((!tmpTrack && playerCore.track == null) || (tmpTrack && playerCore.track == tmpTrack)) {
                this._ignore_track_once = track;
                playerCore.setTrack(track);
            }
        }
    }
    async getPlaying(): Promise<Api.TrackLocation> {
        await this.waitLogin(true);
        var result: Api.TrackLocation = await api.get('my/playing');
        return result;
    }

    async postPlaying(trackLocation: Api.TrackLocation): Promise<void> {
        await this.waitLogin(true);
        await api.post({
            path: 'my/playing',
            obj: trackLocation
        });
    }

    async changePassword(newPasswd: string) {
        var toast = Toast.show(I`Changing password...`);
        try {
            await api.put({
                path: 'users/me',
                obj: {
                    id: this.info.id,
                    username: this.info.username,
                    passwd: newPasswd
                }
            });
            this.info.passwd = newPasswd;
            api.defaultAuth = this.getBasicAuth(this.info);
            this.siLogin.save();
        } catch (error) {
            toast.updateWith({ text: I`Failed to change password.` + '\n' + error });
            toast.show(3000);
            return;
        }
        toast.updateWith({ text: I`Password changed successfully.` });
        toast.show(3000);
    }
};

class LoginDialog extends Dialog {
    tabLogin = new TextBtn({ text: I`Login`, active: true });
    tabCreate = new TextBtn({ text: I`Create account` });
    inputUser = new LabeledInput({ label: I`Username` });
    inputPasswd = new LabeledInput({ label: I`Password`, type: 'password' });
    inputPasswd2 = new LabeledInput({ label: I`Confirm password`, type: 'password' });
    viewStatus = new TextView({ tag: 'div.input-label', style: 'white-space: pre-wrap; color: red;' });
    btn = new ButtonView({ text: I`Login`, type: 'big' });
    socialLogins: ButtonView[] = [];
    isRegistering = false;
    compositionWatcher: TextCompositionWatcher;
    constructor() {
        super();
        var dig = this;
        dig.title = '';
        [this.tabLogin, this.tabCreate].forEach(x => {
            dig.addBtn(x);
            x.onActive.add(() => toggle(x));
        });

        [this.inputUser, this.inputPasswd, this.inputPasswd2].forEach(x => dig.addContent(x));
        dig.addContent(buildDOM({
            tag: 'div',
            child: [this.viewStatus, this.btn]
        }) as any);
        this.compositionWatcher = new TextCompositionWatcher(this.dom);
        dig.dom.addEventListener('keydown', (ev) => {
            if (!this.compositionWatcher.isCompositing && ev.code === 'Enter') {
                this.btnClicked();
                ev.preventDefault();
            }
        });
        dig.autoFocus = this.inputUser.input;
        this.btn.toggleClass('bigbtn', true);
        this.btn.dom.addEventListener('click', () => this.btnClicked());

        var toggle = (btn: TextBtn) => {
            if (btn.active) return;
            this.isRegistering = !this.isRegistering;
            this.inputPasswd2.hidden = !this.isRegistering;
            this.btn.text = btn.text;
            this.tabLogin.updateWith({ active: !this.isRegistering });
            this.tabCreate.updateWith({ active: this.isRegistering });
            this.socialLogins.forEach(x => x.hidden = this.isRegistering);
        };
        this.inputPasswd2.hidden = true;

        this.addBtn(new TextBtn({
            text: I`Settings`, right: true,
            onActive: (ev) => {
                settingsUI.openUI(ev);
                this.close();
            }
        }));

        this.tabCreate.hidden = true;
        this.inputUser.hidden = this.inputPasswd.hidden = this.btn.hidden = true;

        const onServerconfig = (serverConfig: Api.ServerConfig) => {
            this.tabCreate.hidden = serverConfig.allowRegistration == false;
            this.inputUser.hidden = this.inputPasswd.hidden = this.btn.hidden = serverConfig.passwordLogin == false;
            serverConfig.socialLogin?.forEach(l => {
                const btn = new ButtonView({
                    text: I`Login via ${l.name}`, type: 'big', onActive: () => {
                        window.location.href = api.processUrl(`users/me/socialLogin?provider=${l.id}&returnUrl=${encodeURIComponent(window.location.href)}`);
                    }
                });
                this.socialLogins.push(btn);
                this.addContent(btn);
            });
        };

        if (user.state == "logged") {
            onServerconfig(user.serverOptions);
        } else {
            const li = new LoadingIndicator({});
            this.addContent(li);
            api.get("users/me/serverconfig")
                .then(config => {
                    li.removeFromParent();
                    onServerconfig(config);
                })
                .catch((e) => {
                    li.error(e);
                });
        }
    }

    show(...args: Parameters<Dialog['show']>) {
        this.center();
        super.show(...args);
    }

    btnClicked() {
        if (this.btn.dom.classList.contains('disabled')) return;
        var precheckErr: string[] = [];
        if (!this.inputUser.value) precheckErr.push(I`Please input the username!`);
        if (!this.inputPasswd.value) precheckErr.push(I`Please input the password!`);
        else if (this.isRegistering && this.inputPasswd.value !== this.inputPasswd2.value)
            precheckErr.push(I`Password confirmation does not match!`);
        this.viewStatus.dom.textContent = precheckErr.join('\r\n');
        if (precheckErr.length) {
            return;
        }
        (async () => {
            this.viewStatus.text = I`Requesting...`;
            this.btn.updateWith({ disabled: true });
            var info = { username: this.inputUser.value, passwd: this.inputPasswd.value };
            try {
                user.pendingInfo = info as any;
                if (this.isRegistering) {
                    await user.register(info);
                } else {
                    await user.login({ info });
                }
                this.viewStatus.text = '';
                [this.inputUser, this.inputPasswd, this.inputPasswd2].forEach(x => x.value = '');
                user.closeUI();
            } catch (e) {
                this.viewStatus.text = e;
                // fallback to previous login info
                if (user.state === 'logged' && user.info.username) {
                    this.viewStatus.text += '\r\n' + I`Logged in with previous working account.`;
                }
            } finally {
                user.pendingInfo = null;
                this.btn.updateWith({ disabled: false });
            }
        })();
    }
}

class MeDialog extends Dialog {
    btnLoginSettings = new ButtonView({ text: I`Login settings`, type: 'big' });
    btnSwitch = new ButtonView({ text: I`Switch user`, type: 'big' });
    btnLogout = new ButtonView({ text: I`Logout`, type: 'big' });
    btnChangeAvatar = new ButtonView({ text: I`Change avatar`, type: 'normal' });
    fileSelector = new FileSelector({ accept: 'image/*', multiple: false });
    constructor() {
        super();
        var username = user.info.username;
        this.title = I`User`;
        const domimg = new Ref<HTMLImageElement>();
        this.addContent(new View(
            {
                tag: 'div.user-info',
                child: [
                    {
                        tag: 'img.user-avatar', ref: domimg,
                        src: user.info.avatar ? api.processUrl(user.info.avatar!) : '',
                        hidden: !user.info.avatar,
                    },
                    {
                        tag: 'div',
                        child: [
                            { tag: 'div.user-name', text: user.info.username },
                            this.btnChangeAvatar,
                        ]
                    },
                    this.fileSelector,
                ]
            }
        ));
        this.btnChangeAvatar.toggleClass('user-change-avatar', true);
        this.btnChangeAvatar.onActive.add(() => {
            this.fileSelector.open();
        });
        this.fileSelector.onfile = async (file) => {
            await api.put({
                path: 'users/me/avatar',
                mode: 'raw',
                obj: await file.arrayBuffer()
            });
            const { avatar } = await api.get("users/me");
            user.info.avatar = avatar;
            domimg.value!.src = api.processUrl(user.info.avatar!);
        };
        if (user.isAdmin)
            this.addContent(new View({ tag: 'p', textContent: I`You are admin.` }));
        this.addContent(this.btnLoginSettings);
        this.addContent(this.btnSwitch);
        this.addContent(this.btnLogout);
        this.btnLoginSettings.onActive.add((ev) => {
            new LoginSettingsDialog().show(ev);
            this.close();
        });
        this.btnSwitch.onActive.add((ev) => {
            user.openUI(true, ev);
            this.close();
        });
        this.btnLogout.onActive.add(() => {
            user.logout();
            this.close();
        });
        this.addBtn(new TextBtn({
            text: I`Settings`, right: true,
            onActive: (ev) => {
                settingsUI.openUI(ev);
                this.close();
            }
        }));
    }
}

class LoginSettingsDialog extends Dialog {
    inputPasswd = new LabeledInput({ label: I`New password`, type: 'password' });
    inputPasswd2 = new LabeledInput({ label: I`Confirm password`, type: 'password' });
    status = new TextView({ tag: 'div.input-label', style: 'white-space: pre-wrap;' });
    btnChangePassword = new ButtonView({ text: I`Change password`, type: 'big' });
    constructor() {
        super();
        this.title = I`Login settings`;
        [
            new SocialLogins(),
            new View({ tag: 'h3', textContent: I`Change password` }),
            this.inputPasswd,
            this.inputPasswd2,
            this.status,
            this.btnChangePassword,
        ].forEach(x => this.addContent(x));
        this.btnChangePassword.onActive.add(() => {
            if (!this.inputPasswd.value) {
                this.status.text = (I`Please input the new password!`);
                this.status.dom.style.color = 'red';
            } else if (this.inputPasswd.value !== this.inputPasswd2.value) {
                this.status.text = (I`Password confirmation does not match!`);
                this.status.dom.style.color = 'red';
            } else {
                user.changePassword(this.inputPasswd.value).then(() => {
                    this.status.text = I`Password changed.`;
                    this.status.dom.style.color = '#00FF00';
                });
            }
        });
    }
}

class SocialLogins extends View {
    constructor() {
        super({ tag: 'div' });
        this.initAsync();
    }

    async initAsync() {
        await user.waitLogin(true)
        const { links } = await api.get("users/me/socialLinks")
        if (!links || links.length == 0) return;
        this.appendView(new View({ tag: 'h3', textContent: I`Linked accounts` }));
        links.forEach(x => {
            this.appendView(new SocialLoginItem(x));
        });
    }
}

class SocialLoginItem extends View {
    constructor(data: { id: string, name: string, username: string | null }) {
        var btn: ButtonView;
        super({
            tag: 'div.social-login-item',
            child: [
                { tag: 'span.name', text: data.name + (data.username ? ` (${data.username})` : '') },
                btn = new ButtonView({
                    text: () => data.username ? I`Unlink` : I`Link`,
                    onActive: () => {
                        if (data.username) {
                            api.delete({path: `users/me/socialLinks/${data.id}`}).then(() => {
                                data.username = null;
                                btn.updateDom();
                                Toast.show(I`Account has been unlinked successfully.`, 5000);
                            });
                        } else {
                            btn.disabled = true;
                            api.post({path: `users/me/socialLinks/${data.id}?returnUrl=${encodeURIComponent(window.location.href)}`}).then(({url}) => {
                                window.location.href = url;
                            });
                        }
                    }
                }),
            ]
        });
    }
}
