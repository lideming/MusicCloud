import { SettingItem } from './utils';
import { I } from "./I18n";
import { Toast } from './viewlib';
import buildInfo from './buildInfo';
import { ui } from './UI';

export const appVersion = new class {
    siVersion = new SettingItem('mcloud-ver', 'str', '');
    currentVersion = buildInfo.version;
    currentDate = buildInfo.buildDate;
    prevDate = '';
    versionChanged = false;
    init() {
        this.prevDate = this.siVersion.data;
        this.versionChanged = !!this.prevDate && (this.prevDate != this.currentDate);
        this.siVersion.set(this.currentDate);
    }
    showUpdatedToast() {
        if (this.versionChanged) {
            const [prevDate, currentDate] = [this.prevDate, this.currentDate]
                .map(x => x ? new Date(x).toLocaleString(ui.lang.curLang) : I`[Unknown version]`);
            Toast.show(
                I`Client updated:\n${prevDate}\n  =>\n${currentDate}`,
                5000);
        }
    }
};

appVersion.init();
