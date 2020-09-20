import { SettingItem } from './utils';
import { I } from "./I18n";
import { Toast } from './viewlib';
import buildInfo from './buildInfo';

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
            Toast.show(
                I`Client updated:\n${this.prevDate||I`[Unknown version]`}\n  =>\n${this.currentDate||I`[Unknown version]`}`,
                5000);
        }
    }
};

appVersion.init();
