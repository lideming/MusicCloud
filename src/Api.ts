// file: Api.ts

import { settings } from "./main";
import { Callbacks, Action, utils } from "./utils";
import { Api } from "./apidef";


/** API 操作 */
export var api = new class {
    get baseUrl() { return settings.apiBaseUrl; }
    debugSleep = settings.debug ? settings.apiDebugDelay : 0;
    defaultAuth: string;

    onTrackInfoChanged = new Callbacks<Action<Api.Track>>();
    onTrackDeleted = new Callbacks<Action<Api.Track>>();

    async _fetch(input: RequestInfo, init?: RequestInit) {
        if (this.debugSleep) await utils.sleepAsync(this.debugSleep * (Math.random() + 1));
        return await fetch(input, {
            credentials: 'same-origin',
            ...init
        });
    }
    getHeaders(arg: FetchOptions) {
        arg = arg || {};
        var headers = {};
        var auth = arg.auth ?? this.defaultAuth;
        if (auth) headers['Authorization'] = auth;
        return headers;
    }
    async get(path: string, options?: FetchOptions): Promise<any> {
        options = options || {};
        var resp = await this._fetch(this.baseUrl + path, {
            headers: { ...this.getHeaders(options) }
        });
        await this.checkResp(options, resp);
        return await resp.json();
    }
    async post(arg:
        { method?: 'POST' | 'PUT' | 'DELETE'; }
        & PostOptions & PostBodyOptions
    ) {
        var body = arg.obj;
        if (arg.mode === undefined) arg.mode = body !== undefined ? 'json' : 'empty';
        if (arg.mode === 'json') body = body !== undefined ? JSON.stringify(body) : undefined;
        else if (arg.mode === 'raw') void 0; // noop
        else if (arg.mode === 'empty') body = null;
        else throw new Error('Unknown arg.mode');

        var headers = this.getHeaders(arg);
        if (arg.mode === 'json') headers['Content-Type'] = 'application/json';

        headers = { ...headers, ...arg.headers };

        var resp = await this._fetch(this.baseUrl + arg.path, {
            body: body,
            method: arg.method ?? 'POST',
            headers: headers
        });
        await this.checkResp(arg, resp);
        var contentType = resp.headers.get('Content-Type');
        if (contentType && /^application\/json;?/.test(contentType))
            return await resp.json();
        return null;
    }
    put(arg: PostOptions & PostBodyOptions) {
        return this.post({ ...arg, method: 'PUT' });
    }
    delete(arg: PostOptions) {
        return this.post({ ...arg, method: 'DELETE' });
    }
    private async checkResp(options: { status?: number | false; }, resp: Response) {
        if (options.status !== false &&
            ((options.status !== undefined && resp.status != options.status)
                || resp.status >= 400)) {
            if (resp.status === 450) {
                try {
                    var resperr = (await resp.json()).error;
                }
                catch { }
                if (resperr)
                    throw new Error(resperr);
            }
            throw new Error('HTTP status ' + resp.status);
        }
    }
    async getListAsync(id: number): Promise<Api.TrackListGet> {
        return await this.get('lists/' + id);
    }
    async getListIndexAsync(): Promise<Api.TrackListIndex> {
        return await this.get('lists/index');
    }
    async putListAsync(list: Api.TrackListPut, creating: boolean = false): Promise<Api.TrackListPutResult> {
        return await this.post({
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

export interface PostOptions extends FetchOptions {
    path: string;
    headers?: Record<string, string>;
}

export interface FetchOptions {
    status?: number;
    auth?: string;
}

export type PostBodyOptions =
    {
        mode?: 'json' | 'raw';
        obj: any,
    } | {
        mode?: 'empty';
        obj?: undefined;
    };