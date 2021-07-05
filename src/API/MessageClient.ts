import { user } from './User';
import { api } from './Api';
import { Callbacks, Action } from '../Infra/utils';

export const msgcli = new class {
    ws: WebSocket | null = null;

    get connected() { return this.ws?.readyState === WebSocket.OPEN; }
    loginState: '' | 'sent' | 'done' = '';

    onConnected = new Callbacks<Action>();
    onLogin = new Callbacks<Action>();

    lastQueryId = 0;
    queries: Record<number, Action<QueryAnswer>> = {};
    events: Record<string, Action> = {};
    permEvents: Record<string, Action<any>> = {};

    init() {
        user.onSwitchedUser.add(() => {
            if (this.connected && api.defaultAuth)
                this.login(api.defaultAuth!);
        });
        this.onConnected.add(() => {
            if (user.state === 'logged')
                this.login(api.defaultAuth!);
            this.listenPermEvents();
        });
        this.connect();
    }
    private listenPermEvents() {
        var eventlist: string[] = [];
        for (const key in this.permEvents) {
            if (this.permEvents.hasOwnProperty(key)) {
                this.events[key] = this.permEvents[key];
                eventlist.push(key);
            }
        }
        if (eventlist.length === 0) return;
        this.sendQuery({
            cmd: 'listenEvent',
            events: eventlist
        }, null);
    }
    private getUrl() {
        var match = api.baseUrl.match(/^(?:(https?:)?\/\/([\w\-\.:]+))?(\/)?(.*)$/);
        if (!match) throw new Error('cannot generate websocket URL');
        var [_, protocol, host, pathroot, path] = match;
        protocol = protocol || window.location.protocol;
        host = host || window.location.host;
        protocol = protocol === 'https:' ? 'wss://' : 'ws://';
        path = pathroot ? '/' + path : window.location.pathname + path;
        return protocol + host + path + 'ws';
    }
    private connect() {
        this.ws = new WebSocket(this.getUrl());
        this.ws.onopen = (ev) => {
            this.onConnected.invoke();
        };
        this.ws.onclose = (ev) => {
            console.warn('[MsgCli] ws close', { code: ev.code, reason: ev.reason });
            this.ws = null;
            this.loginState = '';
            this.events = {};
            var queries = this.queries;
            for (const key in queries) {
                if (queries.hasOwnProperty(key)) {
                    try {
                        queries[key]({
                            queryId: +key,
                            resp: 'wsclose'
                        });
                    } catch (error) {
                        console.error('[MsgCli] error', error);
                    }
                }
            }
            this.queries = {};
            setTimeout(() => {
                this.connect();
            }, 10000);
        };
        this.ws.onmessage = (ev) => {
            // console.debug('[MsgCli] ws msg', ev.data);
            if (typeof ev.data === 'string') {
                var json = JSON.parse(ev.data);
                if (json.resp && json.queryId) {
                    console.debug('[MsgCli] ws query answer', json);
                    if (this.queries[json.queryId]) {
                        this.queries[json.queryId](json);
                        delete this.queries[json.queryId];
                    }
                } else if (json.cmd === 'event') {
                    var evt = json.event as string;
                    console.debug('[MsgCli] ws received event', json);
                    if (this.events[evt]) {
                        this.events[evt](json.data);
                    } else {
                        console.debug('[MsgCli] ws unknown event', json);
                    }
                } else {
                    console.debug('[MsgCli] ws unknown json', json);
                }
            } else {
                console.debug('[MsgCli] ws unknwon data', ev.data);
            }
        };
    }
    private login(token: string) {
        this.loginState = 'sent';
        this.sendQueryAsync({
            cmd: 'login',
            token
        }).then(a => {
            if (a.resp === 'ok') {
                console.info('[MsgCli] ws login ok');
                this.loginState = 'done';
                this.onLogin.invoke();
            } else {
                console.warn('[MsgCli] ws login result: ', a.resp);
                this.loginState = '';
            }
        });
    }
    sendQuery(obj: Query, callback?: Action<QueryAnswer> | null) {
        if (!this.connected) throw new Error('not connected');
        var queryId = ++this.lastQueryId;
        const objWithId = {
            queryId,
            ...obj
        };
        console.debug('[MsgCli] ws send', printFilter(objWithId));
        this.ws!.send(JSON.stringify(objWithId));
        if (callback) {
            this.queries[queryId] = callback;
        }
    }
    sendQueryAsync(obj: Query) {
        return new Promise<QueryAnswer>(resolve => {
            this.sendQuery(obj, resolve);
        });
    }
    listenEvent(evt: string | { events?: string[], remove?: string[]; }, callback: Action<any>, autoRetry?: boolean) {
        if (typeof evt == 'string') {
            evt = {
                events: [evt],
                remove: []
            };
        }
        evt.events = (evt.events ?? []).filter(e => !this.events[e]);
        evt.remove = evt.remove ?? [];
        if (this.connected) {
            this.sendQuery({
                cmd: 'listenEvent',
                ...(evt as any)
            }, null);
        } else if (!autoRetry) {
            throw new Error('not connected');
        }
        for (const e of evt.events) {
            this.events[e] = callback;
            if (autoRetry) {
                this.permEvents[e] = callback;
            }
        }
        for (const e of evt.remove) {
            delete this.events[e];
            delete this.permEvents[e];
        }
    }
};

function printFilter(obj: any) {
    if (obj.token) {
        return { ...obj, token: "***" };
    }
    return obj;
}

export interface QueryAnswer {
    resp: string;
    queryId: number;
}

export type Query =
    | { cmd: 'login', token: string; }
    | { cmd: 'listenEvent', events: string[], remove: string[]; }
    ;
