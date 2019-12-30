// file: User.ts

/// <reference path="main.ts" />


var user = new class User {
    siLogin = new SettingItem('mcloud-login', 'json', {
        id: -1,
        username: null as string,
        passwd: null as string
    });
    uidialog: Dialog;
    uictx: BuildDOMCtx;
    uishown = false;
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
            this.login(this.info);
        } else {
            this.setState('none');
            this.loginUI();
        }
    }
    initUI() {
        var domctx = this.uictx = new BuildDOMCtx();
        var registering = false;

        var dig = this.uidialog = new Dialog();
        dig.title = '';
        var tabLogin = new TabBtn({ text: I`Login`, active: true });
        var tabCreate = new TabBtn({ text: I`Create account` });
        [tabLogin, tabCreate].forEach(x => {
            dig.addBtn(x);
            x.onClick.add(() => toggle(x));
        });

        var inputUser = new LabeledInput({ label: I`Username:` });
        var inputPasswd = new LabeledInput({ label: I`Password:`, type: 'password' });
        var inputPasswd2 = new LabeledInput({ label: I`Confirm password:`, type: 'password' });
        [inputUser, inputPasswd, inputPasswd2].forEach(x => dig.addContent(x));
        dig.addContent(utils.buildDOM({
            tag: 'div', _ctx: domctx,
            child: [
                { tag: 'div.input-label', style: 'white-space: pre-wrap; color: red;', _key: 'status' },
                { tag: 'div.btn#login-btn', textContent: I`Login`, tabIndex: 0, _key: 'btn' }
            ]
        }) as any);

        var domstatus = domctx.status as HTMLElement,
            dombtn = domctx.btn as HTMLElement;
        dig.dom.addEventListener('keydown', (ev) => {
            if (ev.keyCode == 13) { // Enter
                btnClick();
                ev.preventDefault();
            }
        });
        dig.onShown.add(() => inputUser.dom.focus());
        var btnClick = () => {
            if (dombtn.classList.contains('disabled')) return;
            var precheckErr = [];
            if (!inputUser.value) precheckErr.push(I`Please input the username!`);
            if (!inputPasswd.value) precheckErr.push(I`Please input the password!`);
            else if (registering && inputPasswd.value !== inputPasswd2.value)
                precheckErr.push(I`Password confirmation does not match!`);
            domstatus.textContent = precheckErr.join('\r\n');
            if (precheckErr.length) {
                return;
            }
            (async () => {
                domstatus.textContent = I`Requesting...`;
                utils.toggleClass(dombtn, 'disabled', true);
                var info = { username: inputUser.value, passwd: inputPasswd.value };
                try {
                    this.pendingInfo = info as any;
                    if (registering) {
                        await this.register(info);
                    } else {
                        await this.login(info);
                    }
                    domstatus.textContent = '';
                    this.closeUI();
                } catch (e) {
                    domstatus.textContent = e;
                    // fallback to previous login info
                    if (this.info.username) {
                        await this.login(this.info);
                        domstatus.textContent += '\r\n' + I`Logged in with previous working account.`;
                    }
                } finally {
                    this.pendingInfo = null;
                    utils.toggleClass(dombtn, 'disabled', false);
                }
            })();
        };
        dombtn.addEventListener('click', btnClick);

        var toggle = (btn: TabBtn) => {
            if (btn.active) return;
            registering = !registering;
            inputPasswd2.hidden = !registering;
            domctx.btn.textContent = btn.text;
            tabLogin.updateWith({ active: !registering });
            tabCreate.updateWith({ active: registering });
        };
        inputPasswd2.hidden = true;
    }
    loginUI() {
        if (!this.uidialog) this.initUI();
        this.uidialog.show();
    }
    closeUI() {
        this.uidialog.close();
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

        // // something is dirty
        // if (switchingUser) window.location.reload();

        api.defaultBasicAuth = this.getBasicAuth(this.info);
        ui.sidebarLogin.update();
        listIndex.setIndex(info as any);
        this.setState('logged');
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