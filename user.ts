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
    init() {
        ui.sidebarLogin.update();
        if (this.info.username) {
            this.login(this.info);
        }
    }
    initUI() {
        var overlay = this.uioverlay = new Overlay().setCenterChild(true);
        var domctx = this.uictx = new BuildDOMCtx();
        var registering = false;
        var toggle = () => {
            registering = !registering;
            domctx.passwd2_label.hidden = domctx.passwd2.hidden = !registering;
            var tmp = domctx.title.textContent;
            domctx.title.textContent = domctx.btn.textContent = domctx.title2.textContent;
            domctx.title2.textContent = tmp;
        };
        var dialog = utils.buildDOM({
            _ctx: domctx,
            _key: 'dialog',
            tag: 'div.dialog',
            style: 'width: 300px',
            child: [{
                tag: 'div.dialog-title',
                child: [
                    { tag: 'span.clickable.no-selection.tab.active', textContent: 'Login', _key: 'title' },
                    {
                        tag: 'span.clickable.no-selection.tab', textContent: 'Create account', _key: 'title2',
                        onclick: toggle
                    },
                    {
                        tag: 'div.clickable.no-selection', style: 'float: right; color: gray;',
                        textContent: 'Close', onclick: () => {
                            this.closeUI();
                        }
                    }
                ]
            }, {
                tag: 'div.dialog-content',
                child: [
                    { tag: 'div.input-label', textContent: 'Username:' },
                    { tag: 'input.input-text', type: 'text', _key: 'user' },
                    { tag: 'div.input-label', textContent: 'Password:' },
                    { tag: 'input.input-text', type: 'password', _key: 'passwd' },
                    { tag: 'div.input-label', textContent: 'Confirm password:', _key: 'passwd2_label' },
                    { tag: 'input.input-text', type: 'password', _key: 'passwd2' },
                    { tag: 'div.input-label', style: 'white-space: pre-wrap; color: red;', _key: 'status' },
                    { tag: 'div.btn#login-btn', textContent: 'Login', _key: 'btn' }
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
        dombtn.addEventListener('click', (ev) => {
            if (dombtn.classList.contains('disabled')) return;
            var precheckErr = [];
            if (!domuser.value) precheckErr.push('Please input the username!');
            if (!dompasswd.value) precheckErr.push('Please input the password!');
            else if (registering && dompasswd.value !== dompasswd2.value)
                precheckErr.push('Password confirmation does not match!');
            domstatus.textContent = precheckErr.join('\r\n');
            if (precheckErr.length) {
                return;
            }
            (async () => {
                domstatus.textContent = 'Requesting...';
                utils.toggleClass(dombtn, 'disabled', true);
                try {
                    if (registering) {
                        await this.register({
                            username: domuser.value,
                            passwd: dompasswd.value
                        });
                    } else {
                        await this.login({
                            username: domuser.value,
                            passwd: dompasswd.value
                        });
                    }
                    domstatus.textContent = '';
                } catch (e) {
                    domstatus.textContent = e;
                } finally {
                    utils.toggleClass(dombtn, 'disabled', false);
                }
            })();
        });
    }
    loginUI() {
        if (this.uishown) return;
        this.uishown = true;
        if (!this.uioverlay) this.initUI();
        ui.mainContainer.dom.appendChild(this.uioverlay.dom);
    }
    closeUI() {
        if (!this.uishown) return;
        this.uishown = false;
        this.uioverlay.dom.style.transition = 'opacity .3s';
        this.uioverlay.dom.style.opacity = '0';
        var end = () => {
            if (!end) return; // use a random variable as flag ;)
            end = null;
            this.uioverlay.dom.style.transition = null;
            this.uioverlay.dom.style.opacity = null;
            this.uioverlay?.dom.remove();
        };
        this.uioverlay.dom.addEventListener('transitionend', end);
        setTimeout(end, 500); // failsafe
    }
    getBasicAuth(info: Api.UserInfo) {
        return info.username + ':' + info.passwd;
    }
    async login(info: Api.UserInfo) {
        // try GET `api/users/me` using the new info
        try {
            // thanks to the keyword `var` of JavaScript.
            var resp = await api.getJson('users/me', {
                basicAuth: this.getBasicAuth(info)
            });
        } catch (err) {
            if (err.message == 'user_not_found')
                throw new Error('username or password is not correct.');
            throw err;
        }
        // fill the passwd because the server won't return it
        resp.passwd = info.passwd;
        await this.handleLoginResult(resp);
    }
    async register(info: Api.UserInfo) {
        var resp = await api.postJson({
            method: 'POST',
            path: 'users/new',
            obj: info
        });
        if (resp.error) {
            if (resp.error == 'dup_user') throw new Error('A user with the same username exists');
            throw new Error(resp.error);
        }
        // fill the passwd because the server won't return it
        resp.passwd = info.passwd;
        await this.handleLoginResult(resp);
    }
    async handleLoginResult(info: Api.UserInfo) {
        if (!info.username) throw new Error('iNTernEL eRRoR');
        this.info.id = info.id;
        this.info.username = info.username;
        this.info.passwd = info.passwd;
        this.siLogin.save();
        api.defaultBasicAuth = this.getBasicAuth(this.info);
        ui.sidebarLogin.update();
        listIndex.setIndex(info as any);
        this.closeUI();
    }
    async setLists(listids: number[]) {
        var obj: Api.UserInfo  = {
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