import { Dialog, ButtonView } from "./viewlib";
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
    }
    updateDom() {
        super.updateDom();
        this.btnSwitchTheme.text = (ui.theme.current == 'light') ?
            I`Switch to dark theme` : I`Switch to light theme`;
    }
}