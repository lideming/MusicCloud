import { SettingItem, I } from './utils';
import { Toast } from './viewlib';
import { buildInfo } from './buildInfo';

export const appVersion = new class {
    siVersion = new SettingItem('mcloud-ver', 'str', '');
    currentVersion = buildInfo.buildDate;
    prevVersion = '';
    versionChanged = false;
    init() {
        this.versionChanged = !!this.currentVersion && (this.siVersion.data != this.currentVersion);
        this.prevVersion = this.siVersion.data;
        this.siVersion.set(this.currentVersion);
    }
    showUpdatedToast() {
        if (this.versionChanged) {
            Toast.show(
                I`Client updated:\nCurrent: ${this.currentVersion}\nPrevious: ${this.prevVersion}`,
                5000);
        }
    }
};

appVersion.init();
