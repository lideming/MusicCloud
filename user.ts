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
        overlay.dom.addEventListener('click', (ev) => {
            if (ev.target === overlay.dom) this.closeUI();
        });
        overlay.dom.appendChild(dialog);
        var domuser = domctx.user as HTMLInputElement,
            dompasswd = domctx.passwd as HTMLInputElement,
            dompasswd2 = domctx.passwd2 as HTMLInputElement,
            domstatus = domctx.status as HTMLElement,
            dombtn = domctx.btn as HTMLElement;
        dombtn.addEventListener('click', (ev) => {
            var precheckErr = [];
            if (!domuser.value) precheckErr.push('Please input the username!');
            if (!dompasswd.value) precheckErr.push('Please input the password!');
            else if (registering && dompasswd.value !== dompasswd2.value)
                precheckErr.push('Password confirmation does not match!');
            domstatus.textContent = precheckErr.join('\r\n');
            if (precheckErr.length) {
                return;
            }
            this.login({
                username: domuser.value,
                password: dompasswd.value
            });
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

    async login(info: { username, password; }) {

    }
};