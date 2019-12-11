// file: user.ts

/// <reference path="main.ts" />


var user = new class User {
    siLogin = new SettingItem('mcloud-login', 'json', {
        id: -1,
        username: null as string,
        passwd: null as string
    });
    uioverlay: Overlay;
    uictx: BuildDOMCtx;
    uishown = false;
    get info() { return this.siLogin.data; }
    state: 'none' | 'logging' | 'error' | 'logged';
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
        }
    }
    initUI() {
        var overlay = this.uioverlay = new Overlay().setCenterChild(true);
        var domctx = this.uictx = new BuildDOMCtx();
        var registering = false;
        var toggle = (ev: Event) => {
            if ((ev.target as HTMLElement)?.classList?.contains('active')) return;
            registering = !registering;
            domctx.passwd2_label.hidden = domctx.passwd2.hidden = !registering;
            var activingTitle = registering ? domctx.title2 : domctx.title;
            domctx.btn.textContent = activingTitle.textContent;
            utils.toggleClass(domctx.title, 'active', !registering);
            utils.toggleClass(domctx.title2, 'active', registering);
        };
        var dialog = utils.buildDOM({
            _ctx: domctx,
            _key: 'dialog',
            tag: 'div.dialog',
            style: 'width: 300px',
            child: [{
                tag: 'div.dialog-title',
                child: [
                    {
                        tag: 'span.clickable.no-selection.tab.active', textContent: I`Login`, _key: 'title',
                        onclick: toggle
                    },
                    {
                        tag: 'span.clickable.no-selection.tab', textContent: I`Create account`, _key: 'title2',
                        onclick: toggle
                    },
                    {
                        tag: 'div.clickable.no-selection', style: 'float: right; color: gray;',
                        textContent: I`Close`, onclick: () => {
                            this.closeUI();
                        }
                    }
                ]
            }, {
                tag: 'div.dialog-content',
                child: [
                    { tag: 'div.input-label', textContent: I`Username:` },
                    { tag: 'input.input-text', type: 'text', _key: 'user' },
                    { tag: 'div.input-label', textContent: I`Password:` },
                    { tag: 'input.input-text', type: 'password', _key: 'passwd' },
                    { tag: 'div.input-label', textContent: I`Confirm password:`, _key: 'passwd2_label' },
                    { tag: 'input.input-text', type: 'password', _key: 'passwd2' },
                    { tag: 'div.input-label', style: 'white-space: pre-wrap; color: red;', _key: 'status' },
                    { tag: 'div.btn#login-btn', textContent: I`Login`, tabIndex: 0, _key: 'btn' }
                ]
            }]
        }) as HTMLElement;
        domctx.passwd2_label.hidden = domctx.passwd2.hidden = true;
        overlay.dom.addEventListener('mousedown', (ev) => {
            if (ev.button === 0 && ev.target === overlay.dom) this.closeUI();
        });
        overlay.dom.appendChild(dialog);
        var domuser = domctx.user as HTMLInputElement,
            dompasswd = domctx.passwd as HTMLInputElement,
            dompasswd2 = domctx.passwd2 as HTMLInputElement,
            domstatus = domctx.status as HTMLElement,
            dombtn = domctx.btn as HTMLElement;
        overlay.dom.addEventListener('keydown', (ev) => {
            if (ev.keyCode == 27) { // ESC
                this.closeUI();
                ev.preventDefault();
            } else if (ev.keyCode == 13) { // Enter
                btnClick();
                ev.preventDefault();
            }
        });
        dombtn.addEventListener('click', (ev) => {
            btnClick();
        });
        var btnClick = () => {
            if (dombtn.classList.contains('disabled')) return;
            var precheckErr = [];
            if (!domuser.value) precheckErr.push(I`Please input the username!`);
            if (!dompasswd.value) precheckErr.push(I`Please input the password!`);
            else if (registering && dompasswd.value !== dompasswd2.value)
                precheckErr.push(I`Password confirmation does not match!`);
            domstatus.textContent = precheckErr.join('\r\n');
            if (precheckErr.length) {
                return;
            }
            (async () => {
                domstatus.textContent = I`Requesting...`;
                utils.toggleClass(dombtn, 'disabled', true);
                var info = { username: domuser.value, passwd: dompasswd.value };
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
    }
    loginUI() {
        if (this.uishown) return;
        this.uishown = true;
        if (!this.uioverlay) this.initUI();
        ui.mainContainer.dom.appendChild(this.uioverlay.dom);
        this.uictx.user.focus();
    }
    closeUI() {
        if (!this.uishown) return;
        this.uishown = false;
        utils.fadeout(this.uioverlay.dom);
    }
    getBasicAuth(info: Api.UserInfo) {
        return info.username + ':' + info.passwd;
    }
    async login(info: Api.UserInfo) {
        this.setState('logging');
        // try GET `api/users/me` using the new info
        try {
            // thanks to the keyword `var` of JavaScript.
            var resp = await api.getJson('users/me', {
                basicAuth: this.getBasicAuth(info)
            });
        } catch (err) {
            this.setState('error');
            if (err.message == 'user_not_found')
                throw new Error(I`username or password is not correct.`);
            throw err;
        } finally {
            this.pendingInfo = null;
        }
        // fill the passwd because the server won't return it
        resp.passwd = info.passwd;
        await this.handleLoginResult(resp);
    }
    async register(info: Api.UserInfo) {
        this.setState('logging');
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
    }
    async handleLoginResult(info: Api.UserInfo) {
        if (!info.username) throw new Error(I`iNTernEL eRRoR`);
        this.info.id = info.id;
        this.info.username = info.username;
        this.info.passwd = info.passwd;
        this.siLogin.save();
        api.defaultBasicAuth = this.getBasicAuth(this.info);
        ui.sidebarLogin.update();
        listIndex.setIndex(info as any);
        this.setState('logged');
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
};