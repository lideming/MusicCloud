import { Dialog, ButtonView, View, LabeledInput } from "../Infra/viewlib";
import { I, i18n, IA } from "../I18n/I18n";
import { ui } from "../Infra/UI";
import { playerCore } from "../Player/PlayerCore";
import { jsx } from "../Infra/utils";
import { appVersion } from "./AppVersion";
import buildInfo from "./buildInfo";
import { playerFX } from "../Player/PlayerFX";
import { TextBtn } from "@yuuza/webfx";
import { settings } from "./Settings";
import { api } from "../API/Api";
import { PluginsUI } from "../Plugins/pluginsUI";

export const settingsUI = new class {
    dialog: SettingsDialog;
    openUI(ev?: MouseEvent) {
        if (!this.dialog)
            this.dialog = new SettingsDialog();
        this.dialog.center();
        this.dialog.show(ev);
    }
};

const themes = ['light', 'dark'];
const styles = ['', '-rounded'];

function loopInArray<T>(arr: T[], current: T) {
    return arr[(arr.indexOf(current) + 1) % arr.length];
}

function getThemeAndStyle() {
    let [theme, style] = ui.theme.current.split('-');
    style = style ? '-' + style : '';
    return { theme, style };
}

function setThemeAndStyle(options: { theme?: string, style?: string; }) {
    const current = getThemeAndStyle();
    const theme = options.theme ?? current.theme;
    const style = options.style ?? current.style;
    ui.theme.set(`${theme}${style}` as any);
}

class SettingsDialog extends Dialog {
    btnSwitchTheme = new ButtonView({ type: 'big' });
    btnSwitchStyle = new ButtonView({ type: 'big' });
    btnSwitchLang = new ButtonView({ type: 'big' });
    inputPreferBitrate = new LabeledInput();
    inputServer = new LabeledInput();
    btnNotification = new ButtonView({ type: 'big' });

    constructor() {
        super();
        this.addContent(this.btnSwitchTheme);
        this.btnSwitchTheme.onActive.add(() => {
            const current = getThemeAndStyle();
            setThemeAndStyle({ theme: loopInArray(themes, current.theme) });
            this.updateDom();
        });
        this.addContent(this.btnSwitchStyle);
        this.btnSwitchStyle.onActive.add(() => {
            const current = getThemeAndStyle();
            setThemeAndStyle({ style: loopInArray(styles, current.style) });
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
        this.addContent(this.inputServer);
        this.inputServer.value = localStorage.getItem('mcloud-server') || '';
        this.inputServer.dominput.placeholder = settings.defaultApiBaseUrl;
        this.inputServer.dominput.addEventListener('change', (e) => {
            localStorage.setItem('mcloud-server', this.inputServer.value);
            settings.apiBaseUrl = this.inputServer.value;
        });
        this.addContent(this.btnNotification);
        this.btnNotification.onActive.add(() => {
            ui.notification.setEnable(!ui.notification.config.enabled)
                .then(() => this.updateDom());
        });
        this.addContent(new ButtonView({
            text: () => I`Plugins`,
            type: "big",
            onActive: (ev) => {
                new PluginsUI().show(ev);
            },
        }));
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

    show(ev?: MouseEvent): void {
        this.inputServer.hidden = !!api.defaultAuth;
        super.show(ev);
    }

    updateDom() {
        this.title = I`Settings`;
        this.btnClose.updateWith({ text: I`Close` });
        super.updateDom();
        const { theme, style } = getThemeAndStyle();
        this.btnSwitchTheme.text = I`UI color: ${i18n.get('colortheme_' + theme)}`;
        this.btnSwitchStyle.text = I`UI style: ${i18n.get('styletheme_' + style)}`;
        this.btnSwitchLang.text = I`Language: ${I`English`}`;
        if (!ui.lang.siLang.data) this.btnSwitchLang.text += I` (auto-detected)`;
        this.inputPreferBitrate.updateWith({ label: I`Preferred bitrate (0: original file)` });
        this.inputServer.updateWith({ label: I`Custom server URL` });
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