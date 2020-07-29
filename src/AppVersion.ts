import { SettingItem, I } from './utils';
import { Toast } from './viewlib';
import buildInfo from './buildInfo';

export const appVersion = new class {
    siVersion = new SettingItem('mcloud-ver', 'str', '');
    currentVersion = buildInfo.version;
    currentDate = buildInfo.buildDate;
    prevDate = '';
    versionChanged = false;
    init() {
        this.versionChanged = (this.siVersion.data != this.currentDate);
        this.prevDate = this.siVersion.data;
        this.siVersion.set(this.currentDate);
    }
    showUpdatedToast() {
        if (this.versionChanged) {
            Toast.show(
                I`Client updated:\n${this.prevDate}\n  =>\n${this.currentDate}`,
                5000);
        }
    }
};

appVersion.init();
