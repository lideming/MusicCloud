import { utils } from "@yuuza/webfx/lib/utils";

export var buildInfo = {
    raw: '__mc_build_info__',
    buildDate: '',
    version: '',
};

if (buildInfo.raw !== '__mc_bui' + 'ld_info__') {
    const obj = JSON.parse(buildInfo.raw);
    utils.objectApply(buildInfo, obj, ['buildDate', 'version']);
} else {
    buildInfo.raw = '';
}
