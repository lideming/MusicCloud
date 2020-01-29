// file: User.ts

import { SettingItem, Callbacks, Action, I, utils } from "./utils";
import { listIndex } from "./main";
import { Dialog, View, TabBtn, LabeledInput, TextView, ButtonView, Toast } from "./viewlib";
import { Api } from "./apidef";
import { ui } from "./UI";
import { api } from "./Api";

export var user = new class User {
    siLogin = new SettingItem('mcloud-login', 'json', {
        id: -1,
        username: null as string,
        passwd: null as string
    });
    loginDialog: LoginDialog;
    get info() { return this.siLogin.data; }
    state: 'none' | 'logging' | 'error' | 'logged';
    onSwitchedUser = new Callbacks<Action>();
    loggingin: Promise<void>;
    pendingInfo: User['info'];
    setState(state: User['state']) {
        this.state = state;
        ui.sidebarLogin.update();
    }
    init() {
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
        return info.username + ':' + info.passwd;
    }
    async login(info: Api.UserInfo) {
        this.setState('logging');
        // try GET `api/users/me` using the new info
        var promise = (async () => {
            try {
                // thanks to the keyword `var` of JavaScript.
                var resp = await api.getJson('users/me', {
                    basicAuth: this.getBasicAuth(info)
                });
            } catch (err) {
                this.setState('error');
                if (err.message == 'user_not_found')
                    throw new Error(I`Username or password is not correct.`);
                throw err;
            } finally {
                this.pendingInfo = null;
            }
            // fill the passwd because the server won't return it
            resp.passwd = info.passwd;
            await this.handleLoginResult(resp);
        })();
        this.loggingin = promise;
        await promise;
    }
    async register(info: Api.UserInfo) {
        this.setState('logging');
        var promise = (async () => {
            var resp = await api.postJson({
                method: 'POST',
                path: 'users/new',
                obj: info
            });
            if (resp.error) {
                this.setState('error');
                if (resp.error == 'dup_user') throw new Error(I`A user with the same username exists`);
                throw new Error(resp.error);
            }
            // fill the passwd because the server won't return it
            resp.passwd = info.passwd;
            await this.handleLoginResult(resp);
        })();
        this.loggingin = promise;
        await promise;
    }
    async handleLoginResult(info: Api.UserInfo) {
        if (!info.username) throw new Error(I`iNTernEL eRRoR`);
        var switchingUser = this.info.username != info.username;
        this.info.id = info.id;
        this.info.username = info.username;
        this.info.passwd = info.passwd;
        this.siLogin.save();

        var servermsg = info['servermsg'];
        if (servermsg) Toast.show(I`Server: ` + servermsg, 3000);

        api.defaultBasicAuth = this.getBasicAuth(this.info);
        ui.sidebarLogin.update();
        listIndex.setIndex(info as any);
        this.setState('logged');
        this.loggingin = null;
        this.onSwitchedUser.invoke();
    }
    logout() {
        utils.objectApply(this.info, { id: -1, username: null, passwd: null });
        this.siLogin.save();
        api.defaultBasicAuth = undefined;
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
        await api.postJson({
            path: 'users/me',
            method: 'PUT',
            obj
        });
    }
    /**
     * Wait until finished logging in. Returns true if sucessfully logged in.
     */
    async waitLogin(throwOnFail?: boolean): Promise<boolean> {
        do {
            if (this.state == 'logged') return true;
            if (this.state == 'logging') {
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
            child: [this.viewStatus.dom, this.btn.dom]
        }) as any);
        dig.dom.addEventListener('keydown', (ev) => {
            if (ev.keyCode == 13) { // Enter
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
    }

    btnClicked() {
        if (this.btn.dom.classList.contains('disabled')) return;
        var precheckErr = [];
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
                user.closeUI();
            } catch (e) {
                this.viewStatus.text = e;
                // fallback to previous login info
                if (user.info.username) {
                    await user.login(user.info);
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
    btnSwitch = new ButtonView({ text: I`Switch user`, type: 'big' });
    btnLogout = new ButtonView({ text: I`Logout`, type: 'big' });
    constructor() {
        super();
        var username = user.info.username;
        this.title = I`User ${username}`;
        this.addContent(new View({ tag: 'div', textContent: I`You've logged in as "${username}".` }));
        this.addContent(this.btnSwitch);
        this.addContent(this.btnLogout);
        this.btnSwitch.onclick = () => {
            user.openUI(true);
            this.close();
        };
        this.btnLogout.onclick = () => {
            user.logout();
            this.close();
        };
    }
}