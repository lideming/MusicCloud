// file: User.ts

import { SettingItem, Callbacks, Action, I, utils } from "./utils";
import { listIndex } from "./ListIndex";
import { Dialog, View, TabBtn, LabeledInput, TextView, ButtonView, Toast } from "./viewlib";
import { Api } from "./apidef";
import { ui } from "./UI";
import { api } from "./Api";
import { playerCore } from "./PlayerCore";
import { uploads } from "./Uploads";
import { TrackList } from "./TrackList";
import { Track } from "./Track";
import { settingsUI } from "./SettingsUI";
import { TextCompositionWatcher } from "@yuuza/webfx/lib/utils";

export var user = new class User {
    siLogin = new SettingItem('mcloud-login', 'json', {
        id: -1,
        username: null! as string,
        passwd: undefined as (string | undefined),
        token: null! as string
    });
    loginDialog: LoginDialog;
    get info() { return this.siLogin.data; }

    role?: Api.UserInfo['role'];
    get isAdmin() { return this.role === 'admin'; }

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
        if (this.info.username) {
            this.login(this.info).then(null, (err) => {
                Toast.show(I`Failed to login.` + '\n' + err, 5000);
            });
        } else {
            this.setState('none');
            this.openUI();
        }
    }
    initLoginUI() {
        this.loginDialog = new LoginDialog();
    }
    openUI(login?: boolean) {
        login = login ?? this.state !== 'logged';
        if (login) {
            if (!this.loginDialog) this.loginDialog = new LoginDialog();
            this.loginDialog.show();
        } else {
            new MeDialog().show();
        }
    }
    closeUI() {
        this.loginDialog?.close();
    }
    getBasicAuth(info: Api.UserInfo) {
        return 'Basic ' + utils.base64EncodeUtf8(info.username + ':' + info.passwd);
    }
    getBearerAuth(token: string) {
        return 'Bearer ' + token;
    }
    async login(info: Api.UserInfo) {
        if (this.state !== 'logged') this.setState('logging');
        // try GET `api/users/me` using the new info
        var promise = (async () => {
            var token = info.token;
            try {
                // thanks to the keyword `var` of JavaScript.
                var resp = token ?
                    await api.get('users/me', {
                        auth: this.getBearerAuth(token)
                    }) as Api.UserInfo
                    : await api.post({
                        path: 'users/me/login',
                        auth: this.getBasicAuth(info)
                    }) as Api.UserInfo;
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
        this.info.passwd = undefined;
        if (info.token) this.info.token = info.token;
        this.role = info.role;
        this.siLogin.save();

        if (info.servermsg) Toast.show(I`Server: ` + info.servermsg, 3000);
        api.storageUrlBase = info.storageUrlBase || '';

        api.defaultAuth = this.getBearerAuth(this.info.token);
        ui.sidebarLogin.update();
        listIndex.setIndex(info as any);
        this.setState('logged');
        this.loggingin = null;
        this.onSwitchedUser.invoke();

        if (info.playing) this.tryRestorePlaying(info.playing);
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
        utils.objectApply(this.info, { id: -1, username: undefined, passwd: undefined, token: undefined });
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
            trackid: track?.id ?? 0
        };
        this.postPlaying(tl)
            .then(() => console.info("post playing OK"),
                (err) => console.warn('post playing error', err));
    }
    async tryRestorePlaying(playing: Api.TrackLocation) {
        if (playing.trackid) {
            var list: TrackList = playing.listid ? listIndex.getList(playing.listid) : uploads;
            await list.fetch();
            var track: Track | null = list.tracks[playing.position];
            if (track?.id !== playing.trackid)
                track = list.tracks.find(x => x.id === playing.trackid) || null;
            this._ignore_track_once = track;
            playerCore.setTrack(track);
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
    tabLogin = new TabBtn({ text: I`Login`, active: true });
    tabCreate = new TabBtn({ text: I`Create account` });
    inputUser = new LabeledInput({ label: I`Username` });
    inputPasswd = new LabeledInput({ label: I`Password`, type: 'password' });
    inputPasswd2 = new LabeledInput({ label: I`Confirm password`, type: 'password' });
    viewStatus = new TextView({ tag: 'div.input-label', style: 'white-space: pre-wrap; color: red;' });
    btn = new ButtonView({ text: I`Login`, type: 'big' });
    isRegistering = false;
    compositionWatcher: TextCompositionWatcher;
    constructor() {
        super();
        var dig = this;
        dig.title = '';
        [this.tabLogin, this.tabCreate].forEach(x => {
            dig.addBtn(x);
            x.onClick.add(() => toggle(x));
        });

        [this.inputUser, this.inputPasswd, this.inputPasswd2].forEach(x => dig.addContent(x));
        dig.addContent(utils.buildDOM({
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

        var toggle = (btn: TabBtn) => {
            if (btn.active) return;
            this.isRegistering = !this.isRegistering;
            this.inputPasswd2.hidden = !this.isRegistering;
            this.btn.text = btn.text;
            this.tabLogin.updateWith({ active: !this.isRegistering });
            this.tabCreate.updateWith({ active: this.isRegistering });
        };
        this.inputPasswd2.hidden = true;

        this.addBtn(new TabBtn({
            text: I`Settings`, right: true,
            onclick: () => {
                settingsUI.openUI();
                this.close();
            }
        }));
    }

    show() {
        this.center();
        super.show();
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
                    await user.login(info);
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
    btnChangePassword = new ButtonView({ text: I`Change password`, type: 'big' });
    btnSwitch = new ButtonView({ text: I`Switch user`, type: 'big' });
    btnLogout = new ButtonView({ text: I`Logout`, type: 'big' });
    constructor() {
        super();
        var username = user.info.username;
        this.title = I`User ${username}`;
        this.addContent(new View({ tag: 'p', textContent: I`You've logged in as "${username}".` }));
        if (user.isAdmin)
            this.addContent(new View({ tag: 'p', textContent: I`You are admin.` }));
        this.addContent(this.btnChangePassword);
        this.addContent(this.btnSwitch);
        this.addContent(this.btnLogout);
        this.btnChangePassword.onclick = () => {
            new ChangePasswordDialog().show();
            this.close();
        };
        this.btnSwitch.onclick = () => {
            user.openUI(true);
            this.close();
        };
        this.btnLogout.onclick = () => {
            user.logout();
            this.close();
        };
        this.addBtn(new TabBtn({
            text: I`Settings`, right: true,
            onclick: () => {
                settingsUI.openUI();
                this.close();
            }
        }));
    }
}

class ChangePasswordDialog extends Dialog {
    inputPasswd = new LabeledInput({ label: I`New password`, type: 'password' });
    inputPasswd2 = new LabeledInput({ label: I`Confirm password`, type: 'password' });
    status = new TextView({ tag: 'div.input-label', style: 'white-space: pre-wrap; color: red;' });
    btnChangePassword = new ButtonView({ text: I`Change password`, type: 'big' });
    constructor() {
        super();
        this.title = I`Change password`;
        [this.inputPasswd, this.inputPasswd2, this.status, this.btnChangePassword]
            .forEach(x => this.addContent(x));
        this.btnChangePassword.onclick = () => {
            if (!this.inputPasswd.value) {
                this.status.text = (I`Please input the new password!`);
            } else if (this.inputPasswd.value !== this.inputPasswd2.value) {
                this.status.text = (I`Password confirmation does not match!`);
            } else {
                user.changePassword(this.inputPasswd.value);
                this.close();
            }
        };
    }
}