// file: Api.ts

import { settings } from "./main";
import { Callbacks, Action, utils } from "./utils";
import { Api } from "./apidef";


/** API 操作 */
export var api = new class {
    get baseUrl() { return settings.apiBaseUrl; }
    debugSleep = settings.debug ? settings.apiDebugDelay : 0;
    defaultBasicAuth: string;

    onTrackInfoChanged = new Callbacks<Action<Api.Track>>();

    async _fetch(input: RequestInfo, init?: RequestInit) {
        if (this.debugSleep) await utils.sleepAsync(this.debugSleep * (Math.random() + 1));
        return await fetch(input, {
            credentials: 'same-origin',
            ...init
        });
    }
    getHeaders(arg: { basicAuth?: string; }) {
        arg = arg || {};
        var headers = {};
        var basicAuth = arg.basicAuth ?? this.defaultBasicAuth;
        if (basicAuth) headers['Authorization'] = 'Basic ' + utils.base64EncodeUtf8(basicAuth);
        return headers;
    }
    async getJson(path: string, options?: { status?: false | number, basicAuth?: string; }): Promise<any> {
        options = options || {};
        var resp = await this._fetch(this.baseUrl + path, {
            headers: { ...this.getHeaders(options) }
        });
        if (options.status !== false && resp.status != (options.status ?? 200)) {
            if (resp.status === 450) {
                try {
                    var resperr = (await resp.json()).error;
                } catch { }
                if (resperr) throw new Error(resperr);
            }
            throw new Error('HTTP status ' + resp.status);
        }
        return await resp.json();
    }
    async postJson(arg: {
        path: string, obj: any,
        mode?: 'json' | 'raw',
        method?: 'POST' | 'PUT' | 'DELETE',
        basicAuth?: string,
        headers?: Record<string, string>;
    }) {
        var body = arg.obj;
        if (arg.mode === undefined) arg.mode = 'json';
        if (arg.mode === 'json') body = body !== undefined ? JSON.stringify(body) : undefined;
        else if (arg.mode === 'raw') void 0; // noop
        else throw new Error('Unknown arg.mode');

        var headers = this.getHeaders(arg);
        if (arg.mode === 'json') headers['Content-Type'] = 'application/json';

        headers = { ...headers, ...arg.headers };

        var resp = await this._fetch(this.baseUrl + arg.path, {
            body: body,
            method: arg.method ?? 'POST',
            headers: headers
        });
        var contentType = resp.headers.get('Content-Type');
        if (contentType && /^application\/json;?/.test(contentType))
            return await resp.json();
        return null;
    }
    async getListAsync(id: number): Promise<Api.TrackListGet> {
        return await this.getJson('lists/' + id);
    }
    async getListIndexAsync(): Promise<Api.TrackListIndex> {
        return await this.getJson('lists/index');
    }
    async putListAsync(list: Api.TrackListPut, creating: boolean = false): Promise<Api.TrackListPutResult> {
        return await this.postJson({
            path: 'lists/' + list.id,
            method: creating ? 'POST' : 'PUT',
            obj: list,
        });
    }
    processUrl(url: string) {
        if (url.match('^(https?:/)?/')) return url;
        return this.baseUrl + url;
    }
};