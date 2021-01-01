import { Dialog, ButtonView, View, LabeledInput } from "./viewlib";
import { I, i18n, IA } from "./I18n";
import { ui } from "./UI";
import { playerCore } from "./PlayerCore";
import { utils } from "./utils";
import { appVersion } from "./AppVersion";

export const settingsUI = new class {
    dialog: SettingsDialog;
    openUI(ev?: MouseEvent) {
        if (!this.dialog)
            this.dialog = new SettingsDialog();
        this.dialog.center();
        this.dialog.show(ev);
    }
};

class SettingsDialog extends Dialog {
    btnSwitchTheme = new ButtonView({ type: 'big' });
    btnSwitchLang = new ButtonView({ type: 'big' });
    inputPreferBitrate = new LabeledInput();

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
        this.addContent(this.bottom);
    }

    bottom: View = new View(
        <div style="margin: 5px 0; display: flex; flex-wrap: wrap; justify-content: space-between;">
            <div>{'MusicCloud ' + appVersion.currentVersion}</div>
            <div style="color: var(--color-text-gray);">
                <div class="clickable" onclick={(ev) => {
                    new AboutDialog().show(ev);
                    this.close();
                }}>
                    {() => I`About`}
                </div>
            </div>
        </div>
    );

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

class AboutDialog extends Dialog {
    title = I`About`;

    constructor() {
        super();
        this.addContent(new View(
            <div>
                <p>{I`MusicCloud` + ' ' + appVersion.currentVersion}</p>
                <p>{appVersion.currentDate ? I`Build Date` + ': ' + new Date(appVersion.currentDate).toLocaleString(ui.lang.curLang) : ''}</p>
                <p>{
                    IA`This project is ${<a href="https://github.com/lideming/MusicCloud" class="clickable" target="_blank">
                        {() => I`open-sourced`}
                    </a>} under MIT license.`
                }</p>
                <p>{
                    IA`This project is based on ${<a href="https://github.com/lideming/webfx" class="clickable" target="_blank">webfx</a>}.`
                }</p>
            </div>
        ));
    }
}
