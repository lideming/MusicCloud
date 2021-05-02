// file: discussion.ts

import { ui } from "./UI";
import { api } from "./Api";
import { LoadingIndicator, ListViewItem, ContextMenu, MenuInfoItem, MenuItem, View, ListView, LazyListView } from "./viewlib";
import { Lazy, Action, BuildDomExpr, utils, DataUpdatingHelper, jsx } from "./utils";
import { I } from "./I18n";
import { user } from "./User";
import { ListContentView } from "./ListContentView";
import { Api } from "./apidef";
import { router } from "./Router";
import { msgcli } from "./MessageClient";
import { SidebarItem } from "./ui-views";
import { settings } from "./Settings";

class CommentsView {
    endpoint: string;
    eventName: string;
    eventRegistered: boolean;
    title: string;
    lazyView = new Lazy(() => this.createContentView());
    get view() { return this.lazyView.value; }
    state: false | 'waiting' | 'fetching' | 'error' | 'fetched' = false;
    async fetch(slient?: boolean) {
        if (this.state === 'fetching' || this.state === 'waiting') {
            console.warn('[Comments] another fetch task is running.');
            return;
        }
        this.state = 'waiting';
        var li = new LoadingIndicator();
        if (!slient) this.view.useLoadingIndicator(li);
        try {
            await user.waitLogin(true);
            this.state = 'fetching';
            var resp = await api.get(this.endpoint + '?reverse=1') as Api.CommentList;
            this.view.useLoadingIndicator(null);
        } catch (error) {
            this.state = 'error';
            li.error(error, () => this.fetch());
            this.view.useLoadingIndicator(li);
            throw error;
        }
        const thiz = this;
        new class extends DataUpdatingHelper<CommentViewItem, Api.Comment>{
            items = thiz.view.listView;
            addItem(c: Api.Comment, pos: number) { thiz.addItem(c, pos); }
            updateItem(view: CommentViewItem, c: Api.Comment) { view.comment = c; }
            removeItem(view: CommentViewItem) { view.remove(); }
        }().update(resp.comments);
        this.view.updateView();
        this.state = 'fetched';
        if (this.eventName && !this.eventRegistered) {
            msgcli.listenEvent(this.eventName, () => {
                this.fetch(true);
            }, true);
            this.eventRegistered = true;
        }
    }
    private addItem(c: Api.Comment, pos?: number): void {
        const comm = new CommentViewItem(c);
        if (c.uid === user.info.id || user.isAdmin) comm.onremove = () => {
            this.ioAction(() => api.delete({
                path: this.endpoint + '/' + comm.comment.id
            }));
        };
        return this.view.listView.add(comm, pos);
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
        await this.ioAction(() => api.post({
            path: this.endpoint + '/new',
            obj: {
                content: content
            }
        }));
    }
    createContentView() {
        var view = new CommentsContentView(this);
        view.title = this.title ?? I`Comments`;
        return view;
    }
}

class CommentsContentView extends ListContentView {
    comments: CommentsView;
    editorNew: CommentEditor;
    listView: LazyListView<CommentViewItem>;
    constructor(comments: CommentsView) {
        super();
        this.comments = comments;
    }
    protected appendHeader() {
        super.appendHeader();
        this.header.appendView(this.editorNew = new CommentEditor());
        this.editorNew.dom.classList.add('comment-editor-new');
        this.editorNew.onsubmit = (editor) => {
            var content = editor.content;
            editor.content = '';
            if (content === '') return;
            this.comments.post(content);
        };
        this.refreshBtn.onActive.add(() => {
            this.comments.fetch();
        });
    }
    protected appendListView() {
        super.appendListView();
        if (!this.comments.state) this.comments.fetch();
    }
}

export const discussion = new class extends CommentsView {
    endpoint = 'discussion';
    eventName = 'diss-changed';
    init() {
        this.title = I`Discussion`;
        this.sidebarItem = new SidebarItem({ text: I`Discussion` });
        router.addRoute({
            path: ['discussion'],
            sidebarItem: () => this.sidebarItem,
            contentView: () => this.lazyView.value
        });
        ui.sidebarList.addFeatureItem(this.sidebarItem);
        user.onSwitchedUser.add(() => {
            this.sidebarItem.hidden = !(user.state == 'logged' && user.serverOptions.discussionEnabled && settings.showDiscussion);
        })();
    }
    sidebarItem: SidebarItem;
};

export const notes = new class extends CommentsView {
    endpoint = 'my/notes';
    eventName = 'note-changed';
    init() {
        this.title = I`Notes`;
        this.sidebarItem = new SidebarItem({ text: I`Notes` }).bindContentView(() => this.view);
        router.addRoute({
            path: ['notes'],
            sidebarItem: () => this.sidebarItem,
            contentView: () => this.lazyView.value
        });
        ui.sidebarList.addFeatureItem(this.sidebarItem);
        user.onSwitchedUser.add(() => {
            if (this.state && notes.state !== 'waiting') this.fetch();
        });
        user.onSwitchedUser.add(() => {
            this.sidebarItem.hidden = !(user.state == 'logged' && user.serverOptions.notesEnabled && settings.showNotes);
        })();
    }
    sidebarItem: SidebarItem;
};

export const comments = new class {
    init() {
        router.addRoute({
            path: ['track-comments'],
            onNav: ({ remaining }) => {
                var id = parseInt(remaining[0]);
                ui.sidebarList.setActive(null);
                var comments = new CommentsView();
                comments.endpoint = "tracks/" + id + "/comments";
                ui.content.setCurrent(comments.view);
            }
        });
    }
};

class CommentViewItem extends ListViewItem {
    constructor(comment: Api.Comment) {
        super();
        this.comment = comment;
    }
    comment: Api.Comment;
    get id() { return this.comment.id; }
    onremove: Action<CommentViewItem>;
    onedit: Action<CommentViewItem>;
    createDom(): BuildDomExpr {
        return (<div class="item comment no-transform">
            <div class="username">{() => this.comment.username}</div>
            <div class="date">{() => utils.formatDateTime(new Date(this.comment.date))}</div>
            <div class="content">{() => this.comment.content}</div>
        </div>);
    }
    onContextMenu = (item, ev) => {
        ev.preventDefault();
        var m = new ContextMenu([
            new MenuInfoItem({ text: I`Comment ID` + ': ' + this.comment.id })
        ]);
        if (this.onremove) {
            m.add(new MenuItem({ text: I`Remove`, cls: 'dangerous', onActive: () => { this.onremove(this); } }), 0);
        }
        if (this.onedit) {
            m.add(new MenuItem({ text: I`Edit`, onActive: () => { this.onedit(this); } }), 0);
        }
        ui.showContextMenuForItem([this], m, { ev: ev });
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
                { tag: 'textarea.input-text.content', _key: 'domcontent' },
                { tag: 'div.btn.submit', textContent: I`Submit`, _key: 'domsubmit' }
            ]
        };
    }
    postCreateDom() {
        this.domcontent.addEventListener('keydown', (ev) => {
            if (ev.ctrlKey && ev.keyCode === 13) {
                this.onsubmit(this);
            }
        });
        this.domsubmit.addEventListener('click', () => {
            this.onsubmit(this);
        });
    }
}
