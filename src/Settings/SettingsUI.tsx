import { Dialog, ButtonView, View, LabeledInput } from "../Infra/viewlib";
import { I, i18n, IA } from "../I18n/I18n";
import { ui } from "../Infra/UI";
import { playerCore } from "../Player/PlayerCore";
import { jsx } from "../Infra/utils";
import { appVersion } from "./AppVersion";
import buildInfo from "./buildInfo";
import { playerFX } from "../Player/PlayerFX";
import { TextBtn } from "@yuuza/webfx";

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
    btnNotification = new ButtonView({ type: 'big' });

    constructor() {
        super();
        this.addContent(this.btnSwitchTheme);
        this.btnSwitchTheme.onActive.add(() => {
            const idx = (ui.theme.all.indexOf(ui.theme.current) + 1) % ui.theme.all.length;
            ui.theme.set(ui.theme.all[idx]);
            this.updateDom();
        });
        this.addContent(this.btnSwitchLang);
        this.btnSwitchLang.onActive.add(() => {
            var origUsingLang = ui.lang.curLang;
            var curlang = ui.lang.siLang.data;
            var langs = ['', ...ui.lang.availableLangs];
            curlang = langs[(langs.indexOf(curlang) + 1) % langs.length];
            ui.lang.siLang.set(curlang);
        });
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
        this.addContent(this.btnNotification);
        this.btnNotification.onActive.add(() => {
            ui.notification.setEnable(!ui.notification.config.enabled)
                .then(() => this.updateDom());
        });
        const devFeatures = new View(<div>
            <ButtonView onActive={(e) => {
                playerFX.showUI(e);
            }}>Test: Player FX</ButtonView>
        </div>);
        devFeatures.hidden = true;
        let devClickCount = 0;
        this.addContent(devFeatures);
        this.addContent(
            <div style="margin: 5px 0; display: flex; flex-wrap: wrap; justify-content: space-between;">
                <div onclick={() => {
                    if (++devClickCount == 5) {
                        devFeatures.hidden = false;
                    }
                }}>{'MusicCloud ' + appVersion.currentVersion}</div>
                <TextBtn onActive={(ev) => {
                    new AboutDialog().show(ev);
                    this.close();
                }}>
                    {() => I`About`}
                </TextBtn>
            </div>
        );
    }

    updateDom() {
        this.title = I`Settings`;
        this.btnClose.updateWith({ text: I`Close` });
        super.updateDom();
        this.btnSwitchTheme.text = I`UI theme: ${i18n.get('colortheme_' + ui.theme.current)}`;
        this.btnSwitchLang.text = I`Language: ${I`English`}`;
        if (!ui.lang.siLang.data) this.btnSwitchLang.text += I` (auto-detected)`;
        this.inputPreferBitrate.updateWith({ label: I`Preferred bitrate (0: original file)` });
        this.btnNotification.text = ui.notification.config.enabled ? I`Disable notification` : I`Enable notification`;
    }
}

class AboutDialog extends Dialog {
    title = I`About`;

    constructor() {
        super();
        this.width = '500px';
        this.addContent(new View(
            <div>
                <h2>{I`MusicCloud` + ' ' + appVersion.currentVersion}</h2>
                <p>{appVersion.currentDate ? I`Build Date` + ': ' + new Date(appVersion.currentDate).toLocaleString(ui.lang.curLang) : ''}</p>
                <p>{
                    IA`This project is ${<a href="https://github.com/lideming/MusicCloud" class="clickable" target="_blank">
                        {() => I`open-sourced`}
                    </a>} under MIT license.`
                }</p>
                <p>{
                    IA`This project is based on ${<a href="https://github.com/lideming/webfx" class="clickable" target="_blank">webfx</a>}.`
                }</p>
                <h3>{I`Recent changes:`}</h3>
                <div style="max-height: 300px; overflow-y: auto;">
                    <table>
                        <tr><th>Id</th><th>Message</th></tr>
                        {
                            buildInfo.commits.map(c =>
                                <tr>
                                    <td>
                                        <a href={`https://github.com/lideming/MusicCloud/commit/${c.id}`} target="_blank">
                                            <code>{c.id}</code>
                                        </a>
                                    </td>
                                    <td>{c.message}</td>
                                </tr>
                            )
                        }
                    </table>
                </div>
            </div>
        ));
    }
}