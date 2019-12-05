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
        var reg = false;
        var dialog = utils.buildDOM({
            _ctx: domctx,
            _key: 'dialog',
            tag: 'div.dialog',
            child: [{
                tag: 'div.dialog-title',
                child: [
                    { tag: 'span', textContent: 'Login', _key: 'title' },
                    {
                        tag: 'div.clickable.no-selection', style: 'float: right; color: gray;',
                        textContent: 'Close', onclick: () => {
                            overlay.dom.remove();
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
                    { tag: 'div.btn', textContent: 'Login', _key: 'btn' }
                ]
            }, {
                tag: 'div.dialog-bottom',
                style: 'text-align: center',
                child: [{
                    tag: 'div.clickable.no-selection', textContent: 'Create account',
                    _key: 'switch', onclick: () => {
                        reg = !reg;
                        domctx.passwd2_label.hidden = domctx.passwd2.hidden = !reg;
                        var tmp = domctx.title.textContent;
                        domctx.title.textContent = domctx.btn.textContent = domctx.switch.textContent;
                        domctx.switch.textContent = tmp;
                    }
                }]
            }]
        }) as HTMLElement;
        dialog.style.width = '300px';
        domctx.passwd2_label.hidden = domctx.passwd2.hidden = true;
        overlay.dom.appendChild(dialog);
    }
    loginUI() {
        if (!this.uioverlay) this.initUI();
        ui.mainContainer.dom.appendChild(this.uioverlay.dom);
    }
    closeUI() {
        this.uioverlay?.dom.remove();
    }
};