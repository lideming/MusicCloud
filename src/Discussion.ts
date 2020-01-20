// file: discussion.ts

import { ui, SidebarItem } from "./UI";
import { api } from "./Api";
import { LoadingIndicator, ListViewItem, ContextMenu, MenuInfoItem, MenuItem, View } from "./viewlib";
import { I, Lazy, Action, BuildDomExpr } from "./utils";
import { ContentHeader } from "./tracklist";
import { user } from "./User";
import { ListContentView } from "./ListContentView";
import { Api } from "./apidef";
import { router } from "./Router";


export var discussion = new class {
    init() {
        this.sidebarItem = new SidebarItem({ text: I`Discussion` });
        router.addRoute({
            path: ['discussion'],
            sidebarItem: () => this.sidebarItem,
            contentView: () => this.view.value
        });
        ui.sidebarList.addItem(this.sidebarItem);
    }
    sidebarItem: SidebarItem;
    view = new Lazy(() => new class extends ListContentView {
        protected createHeader() {
            return new ContentHeader({
                title: I`Discussion`
            });
        }
        protected appendListView() {
            super.appendListView();
            this.useLoadingIndicator(new LoadingIndicator({
                state: 'normal',
                content: '(This feature is a work in progress)'
            }));
        }
    });
};

export var notes = new class {
    init() {
        this.sidebarItem = new SidebarItem({ text: I`Notes` }).bindContentView(() => this.view);
        router.addRoute({
            path: ['notes'],
            sidebarItem: () => this.sidebarItem,
            contentView: () => this.lazyView.value
        });
        ui.sidebarList.addItem(this.sidebarItem);
        user.onSwitchedUser.add(() => {
            if (this.state && notes.state !== 'waiting') this.fetch();
        });
    }
    sidebarItem: SidebarItem;
    lazyView = new Lazy(() => new class extends ListContentView {
        editorNew: CommentEditor;
        protected createHeader() {
            return new ContentHeader({
                title: I`Notes`
            });
        }
        protected appendHeader() {
            super.appendHeader();
            this.dom.appendView(this.editorNew = new CommentEditor());
            this.editorNew.dom.classList.add('comment-editor-new');
            this.editorNew.onsubmit = (editor) => {
                var content = editor.content;
                editor.content = '';
                if (content == '') return;
                notes.post(content);
            };
        }
        protected appendListView() {
            super.appendListView();
            if (!notes.state) notes.fetch();
        }
    });
    get view() { return this.lazyView.value; }
    state: false | 'waiting' | 'fetching' | 'error' | 'fetched' = false;
    async fetch() {
        this.state = 'waiting';
        var li = new LoadingIndicator();
        this.view.useLoadingIndicator(li);
        try {
            await user.waitLogin(true);
            this.state = 'fetching';
            var resp = await api.getJson('my/notes?reverse=1') as Api.CommentList;
            this.view.useLoadingIndicator(null);
        } catch (error) {
            this.state = 'error';
            li.error(error, () => this.fetch());
            throw error;
        }
        this.view.listView.clear();
        resp.comments.forEach(c => this.addItem(c));
        this.view.updateView();
        this.state = 'fetched';
    }
    private addItem(c: Api.Comment): void {
        const comm = new CommentViewItem(c);
        comm.onremove = () => {
            this.ioAction(() => api.postJson({
                method: 'DELETE',
                path: 'my/notes/' + comm.comment.id,
                obj: undefined
            }));
        };
        return this.view.listView.add(comm);
    }
    private async ioAction(func: () => Promise<void>) {
        var li = new LoadingIndicator({ content: I`Submitting` });
        this.view.useLoadingIndicator(li);
        await li.action(async () => {
            await func();
            await this.fetch();
        });
    }
    async post(content: string) {
        await this.ioAction(() => api.postJson({
            method: 'POST',
            path: 'my/notes/new',
            obj: {
                content: content
            }
        }));
    }
};

class CommentViewItem extends ListViewItem {
    constructor(comment: Api.Comment) {
        super();
        this.comment = comment;
    }
    domusername: HTMLDivElement;
    domcontent: HTMLDivElement;
    comment: Api.Comment;
    onremove: Action<CommentViewItem>;
    onedit: Action<CommentViewItem>;
    createDom(): BuildDomExpr {
        return {
            _ctx: this,
            tag: 'div.item.comment.no-transform',
            child: [
                { tag: 'div.username', _key: 'domusername' },
                { tag: 'div.content', _key: 'domcontent' }
            ]
        };
    }
    updateDom() {
        this.domusername.textContent = this.comment.username;
        this.domcontent.textContent = this.comment.content;
    }
    onContextMenu = (item, ev) => {
        ev.preventDefault();
        var m = new ContextMenu([
            new MenuInfoItem({ text: I`Comment ID` + ': ' + this.comment.id })
        ]);
        if (this.onremove) {
            m.add(new MenuItem({ text: I`Remove`, cls: 'dangerous', onclick: () => { this.onremove(this); } }), 0);
        }
        if (this.onedit) {
            m.add(new MenuItem({ text: I`Edit`, onclick: () => { this.onedit(this); } }), 0);
        }
        m.show({ ev: ev });
    };
}

class CommentEditor extends View {
    domcontent: HTMLTextAreaElement;
    domsubmit: HTMLDivElement;
    onsubmit: Action<CommentEditor>;
    get content() { this.ensureDom(); return this.domcontent.value; }
    set content(val) { this.ensureDom(); this.domcontent.value = val; }
    createDom(): BuildDomExpr {
        return {
            _ctx: this,
            tag: 'div.comment-editor',
            child: [
                { tag: 'textarea.content', _key: 'domcontent' },
                { tag: 'div.btn.submit', textContent: I`Submit`, _key: 'domsubmit' }
            ]
        };
    }
    postCreateDom() {
        this.domcontent.addEventListener('keydown', (ev) => {
            if (ev.ctrlKey && ev.keyCode == 13) {
                this.onsubmit(this);
            }
        });
        this.domsubmit.addEventListener('click', () => {
            this.onsubmit(this);
        });
    }
}