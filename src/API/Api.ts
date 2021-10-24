// file: Api.ts

import { settings } from "../Settings/Settings";
import { Callbacks, Action, CancelToken, sleepAsync } from "../Infra/utils";
import { Api } from "./apidef";

function getAppBaseUrl() {
    var href = window.location.href;
    var queryStrStart = href.indexOf('?');
    if (queryStrStart >= 0) return href.substring(0, queryStrStart);
    var hash = href.indexOf('#');
    if (hash >= 0) return href.substring(0, hash);
    return href;
}

export const api = new class {
    get baseUrl() { return settings.apiBaseUrl; }
    readonly appBaseUrl = getAppBaseUrl();
    storageUrlBase = '';
    debugSleep = settings.debug ? settings.apiDebugDelay : 0;
    defaultAuth: string | null = null;

    onTrackInfoChanged = new Callbacks<Action<Api.Track>>();
    onTrackDeleted = new Callbacks<Action<Api.Track>>();

    async _fetch(input: RequestInfo, init?: RequestInit) {
        if (this.debugSleep) await sleepAsync(this.debugSleep * (Math.random() + 1));
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
        if (arg.cache != true) headers['Cache-Control'] = 'no-store';
        return headers;
    }
    async get(path: string, options?: FetchOptions): Promise<any> {
        options = options || {};
        var resp = await this._fetch(this.baseUrl + path, {
            headers: { ...this.getHeaders(options) }
        });
        await this.checkResp(options, resp);
        if (resp.headers.get("Content-Type")?.startsWith("application/json"))
            return await resp.json();
        return resp;
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
    upload(arg: {
        method: 'POST' | 'PUT';
        url: string;
        body: any;
        auth?: string;
        contentType?: string;
        cancelToken?: CancelToken;
        onprogerss?: (e: ProgressEvent) => void;
    }) {
        const ct = arg.cancelToken;
        if (ct) {
            var cb = ct.onCancelled.add(function () {
                xhr.abort();
            });
        }

        const xhr = new XMLHttpRequest();
        const whenXhrComplete = new Promise<void>((resolve, reject) => {
            xhr.onload = ev => resolve();
            xhr.onerror = ev => reject("XHR error");
            xhr.onabort = ev => reject("XHR abort");
        });
        xhr.upload.onprogress = arg.onprogerss || null;

        xhr.open(arg.method, this.processUrl(arg.url));

        if (arg.auth) xhr.setRequestHeader('Authorization', arg.auth);
        if (arg.contentType) xhr.setRequestHeader('Content-Type', arg.contentType);

        xhr.send(arg.body);
        const complete = (async function (checkStatus?: boolean) {
            try {
                await whenXhrComplete;
            } finally {
                if (ct) {
                    ct.onCancelled.remove(cb!);
                    ct.throwIfCancelled();
                }
            }

            if (checkStatus === undefined || checkStatus)
                if (xhr.status < 200 || xhr.status >= 300) throw new Error("HTTP status " + xhr.status);
            return xhr;
        })();

        return {
            xhr,
            complete
        };
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
    getTrack(id: number) { return this.get('tracks/' + id) as Promise<Api.Track>; }
    getList(id: number) { return this.get('lists/' + id) as Promise<Api.Track>; }
    processUrl(url: string) {
        if (!url || url.match('^(https?:/)?/')) return url;
        if (this.storageUrlBase && url.startsWith('storage/'))
            return this.storageUrlBase + url.substr(8);
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
    cache?: boolean;
}

export type PostBodyOptions =
    {
        mode?: 'json' | 'raw';
        obj: any,
    } | {
        mode?: 'empty';
        obj?: undefined;
    };
