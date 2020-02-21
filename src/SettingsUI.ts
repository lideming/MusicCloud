import { Dialog, ButtonView, View } from "./viewlib";
import { I } from "./I18n";
import { ui } from "./UI";

export var settingsUI = new class {
    openUI() {
        new SettingsDialog().show();
    }
};

class SettingsDialog extends Dialog {
    title = I`Settings`;
    btnSwitchTheme = new ButtonView({ type: 'big' });
    constructor() {
        super();
        this.addContent(this.btnSwitchTheme);
        this.btnSwitchTheme.onclick = () => {
            ui.theme.set((ui.theme.current == 'light') ? 'dark' : 'light');
            this.updateDom();
        };
        this.addContent(new View({
            tag: 'div',
            style: 'margin: 5px 0;',
            child: [
                { tag: 'span', text: 'MusicCloud' },
                {
                    tag: 'a', style: 'float: right; color: inherit;',
                    text: I`Source code`, href: 'https://github.com/lideming/MusicCloud',
                    target: '_blank'
                },
            ]
        }));
    }
    updateDom() {
        super.updateDom();
        this.btnSwitchTheme.text = (ui.theme.current == 'light') ?
            I`Switch to dark theme` : I`Switch to light theme`;
    }
}