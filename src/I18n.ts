// file: I18n.ts

export interface I18nData {
    [lang: string]: {
        [key: string]: string;
    };
}

/** Internationalization (aka i18n) helper class */
export class I18n {
    data: I18nData = {};
    curLang = 'en';
    missing = new Map<string, 1>();
    /** Get i18n string for `key`, return `key` when not found. */
    get(key, arg?: any[]): string {
        return this.get2(key, arg) || key;
    }
    /** Get i18n string for `key`, return `null` when not found. */
    get2(key, arg?: any[], lang?: string): string {
        lang = lang || this.curLang;
        var langObj = this.data[lang];
        if (!langObj) {
            console.log('i18n missing lang: ' + lang);
            return null;
        }
        var r = langObj[key];
        if (!r) {
            if (!this.missing.has(key)) {
                this.missing.set(key, 1);
                console.log('i18n missing key: ' + key);
            }
            return null;
        }
        if (arg) {
            for (const key in arg) {
                if (arg.hasOwnProperty(key)) {
                    const val = arg[key];
                    r = r.replace('{' + key + '}', val);
                    // Note that it only replaces the first occurrence.
                }
            }
        }
        return r;
    }
    /** Fills data with an 2darray */
    add2dArray(array: [...string[][]]) {
        const langObjs = [];
        const langs = array[0];
        for (const lang of langs) {
            langObjs.push(this.data[lang] = this.data[lang] || {});
        }
        for (let i = 1; i < array.length; i++) {
            const line = array[i];
            const key = line[0];
            for (let j = 0; j < line.length; j++) {
                const val = line[j];
                langObjs[j][key] = val;
            }
        }
    }
    renderElements(elements) {
        console.log('i18n elements rendering');
        elements.forEach(x => {
            for (const node of x.childNodes) {
                if (node.nodeType == Node.TEXT_NODE) {
                    // console.log('node', node);
                    var r = this.get2(node.beforeI18n || node.textContent);
                    if (r) {
                        node.beforeI18n = node.beforeI18n || node.textContent;
                        node.textContent = r;
                    }
                    else {
                        if (node.beforeI18n) {
                            node.textContent = node.beforeI18n;
                        }
                        console.log('missing key for node', node);
                    }
                }
            }
        });
    }
    /**
     * Detect the best available language using
     * the user language preferences provided by the browser.
     * @param langs Available languages
     */
    static detectLanguage(langs: string[]) {
        var cur: string;
        var curIdx = -1;
        var languages = [];
        // ['en-US'] -> ['en-US', 'en']
        (navigator.languages || [navigator.language]).forEach(lang => {
            languages.push(lang);
            if (lang.indexOf('-') > 0)
                languages.push(lang.substr(0, lang.indexOf('-')));
        });
        langs.forEach((l) => {
            var idx = languages.indexOf(l);
            if (!cur || (idx !== -1 && idx < curIdx)) {
                cur = l;
                curIdx = idx;
            }
        });
        return cur;
    }
}

export var i18n = new I18n();

export function I(literals: TemplateStringsArray, ...placeholders: any[]) {
    if (placeholders.length == 0) {
        return i18n.get(literals[0]);
    }
    // Generate format string from template string:
    var formatString = '';
    for (var i = 0; i < literals.length; i++) {
        var lit = literals[i];
        formatString += lit;
        if (i < placeholders.length) {
            formatString += '{' + i + '}';
        }
    }
    var r = i18n.get(formatString);
    for (var i = 0; i < placeholders.length; i++) {
        r = r.replace('{' + i + '}', placeholders[i]);
    }
    return r;
}

// Use JSON.parse(a_big_json) for faster JavaScript runtime parsing
i18n.add2dArray(JSON.parse(`[
    ["en", "zh"],
    ["English", "中文"],
    ["Pin", "固定"],
    ["Unpin", "浮动"],
    ["Pause", "暂停"],
    ["Pause...", "暂停..."],
    ["Play", "播放"],
    [" (logging in...)", " （登录中...）"],
    ["Guest (click to login)", "游客（点击登录）"],
    ["Login", "登录"],
    ["Create account", "创建账户"],
    ["Close", "关闭"],
    ["Username", "用户名"],
    ["Password", "密码"],
    ["Change password", "更改密码"],
    ["New password", "新密码"],
    ["Confirm password", "确认密码"],
    ["Requesting...", "请求中……"],
    [" (error!)", "（错误！）"],
    ["Username or password is not correct.", "用户名或密码不正确。"],
    ["Logged in with previous working account.", "已登录为之前的用户。"],
    ["Please input the username!", "请输入用户名！"],
    ["Please input the password!", "请输入密码！"],
    ["Please input the new password!", "请输入新密码！"],
    ["Password confirmation does not match!", "确认密码不相同！"],
    ["Playlist", "播放列表"],
    ["Playlists", "播放列表"],
    ["New Playlist", "新建播放列表"],
    ["New Playlist ({0})", "新播放列表（{0}）"],
    ["Click to edit", "点击编辑"],
    ["(Empty)", "（空）"],
    ["Logging in", "登录中"],
    ["Loading", "加载中"],
    ["Oh no! Something just goes wrong:", "发生错误："],
    ["[Click here to retry]", "[点击重试]"],
    ["My Uploads", "我的上传"],
    ["Click here to select files to upload", "点此选择文件并上传"],
    ["or drag files to this zone...", "或拖放文件到此处..."],
    ["Comments", "评论"],
    ["Remove", "移除"],
    ["List ID", "列表 ID"],
    ["Track ID", "歌曲 ID"],
    ["Name", "名称"],
    ["Artist", "艺术家"],
    ["Discussion", "讨论区"],
    ["Notes", "便签"],
    ["Submit", "提交"],
    ["Submitting", "提交中"],
    ["Download", "下载"],
    ["Edit", "编辑"],
    ["Save", "保存"],
    ["User {0}", "用户 {0}"],
    ["You've logged in as \\"{0}\\".", "你已登录为 \\"{0}\\"。"],
    ["Switch user", "切换用户"],
    ["Logout", "注销"],
    ["Failed to create playlist \\"{0}\\".", "创建播放列表 \\"{0}\\" 失败。"],
    ["Failed to sync playlist \\"{0}\\".", "同步播放列表 \\"{0}\\" 失败。"],
    ["Login to create playlists.", "登录以创建播放列表。"],
    ["Failed to login.", "登录失败。"],
    ["Failed to upload file \\"{0}\\".", "上传文件 \\"{0}\\" 失败。"],
    ["Changing password...", "正在更改密码..."],
    ["Failed to change password.", "更改密码失败。"],
    ["Password changed successfully.", "已成功更改密码。"],
    ["Server: ", "服务器："],
    ["Volume", "音量"],
    ["(Scroll whell or drag to adjust volume)", "（滚动滚轮或拖动调整音量）"],
    ["Music Cloud", "Music Cloud"]
]`));

i18n.add2dArray([
    ["_key_", "en", "zh"],
    ["uploads_pending", "Pending", "队列中"],
    ["uploads_uploading", "Uploading", "上传中"],
    ["uploads_error", "Error", "错误"],
    ["uploads_done", "Done", "完成"],
    ["prev_track", "Prev", "上一首"],
    ["next_track", "Next", "下一首"],
    ["loopmode_list-seq", "List-seq", "顺序播放"],
    ["loopmode_list-loop", "List-loop", "列表循环"],
    ["loopmode_track-loop", "Track-loop", "单曲循环"],
]);