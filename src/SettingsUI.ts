import { Dialog, ButtonView, View, LabeledInput } from "./viewlib";
import { I, i18n } from "./I18n";
import { ui } from "./UI";
import { playerCore } from "./PlayerCore";

export var settingsUI = new class {
    dialog: SettingsDialog;
    openUI() {
        if (!this.dialog)
            this.dialog = new SettingsDialog();
        this.dialog.center();
        this.dialog.show();
    }
};

class SettingsDialog extends Dialog {
    btnSwitchTheme = new ButtonView({ type: 'big' });
    btnSwitchLang = new ButtonView({ type: 'big' });
    inputPreferBitrate = new LabeledInput();
    bottom: View;
    constructor() {
        super();
        this.addContent(this.btnSwitchTheme);
        this.btnSwitchTheme.onclick = () => {
            ui.theme.set((ui.theme.current === 'light') ? 'dark' : 'light');
            this.updateDom();
        };
        this.addContent(this.btnSwitchLang);
        this.btnSwitchLang.onclick = () => {
            var origUsingLang = ui.lang.curLang;
            var curlang = ui.lang.siLang.data;
            var langs = ['', ...ui.lang.availableLangs];
            curlang = langs[(langs.indexOf(curlang) + 1) % langs.length];
            ui.lang.siLang.set(curlang);
            if (origUsingLang != ui.lang.curLang)
                this.showReload();
            this.updateDom();
        };
        this.addContent(this.inputPreferBitrate);
        this.onShown.add(() => {
            this.inputPreferBitrate.value = (playerCore.siPlayer.data.preferBitrate ?? '0').toString();
        });
        this.onClose.add(() => {
            var val = parseInt(this.inputPreferBitrate.value);
            if (!isNaN(val)) {
                playerCore.siPlayer.data.preferBitrate = val;
                playerCore.siPlayer.save();
            }
        });
        this.addContent(this.bottom = new View({
            tag: 'div',
            style: 'margin: 5px 0;',
            child: [
                { tag: 'span', text: 'MusicCloud' },
                {
                    tag: 'a.clickable', style: 'float: right; color: inherit;',
                    text: () => I`Source code`, href: 'https://github.com/lideming/MusicCloud',
                    target: '_blank'
                },
            ]
        }));
    }
    reloadShown = false;
    showReload() {
        if (this.reloadShown) return;
        this.reloadShown = true;
        this.content.addView(new View({
            tag: 'div.clickable',
            style: 'color: var(--color-primary); text-align: center; margin: 10px 0;',
            text: () => I`Reload to fully apply changes`,
            onclick: () => {
                window.location.reload();
            }
        }), this.bottom.position);
    }
    updateDom() {
        this.title = I`Settings`;
        this.btnClose.updateWith({ text: I`Close` });
        super.updateDom();
        this.btnSwitchTheme.text = I`Color theme: ${i18n.get('colortheme_' + ui.theme.current)}`;
        this.btnSwitchLang.text = I`Language: ${I`English`}`;
        if (!ui.lang.siLang.data) this.btnSwitchLang.text += I` (auto-detected)`;
        this.inputPreferBitrate.updateWith({ label: I`Preferred bitrate (0: original file)` });
        this.content.updateChildrenDom();
    }
}