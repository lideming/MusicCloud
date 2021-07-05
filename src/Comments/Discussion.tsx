// file: discussion.ts

import { ui } from "../Infra/UI";
import { I } from "../I18n/I18n";
import { user } from "../API/User";
import { router } from "../Infra/Router";
import { SidebarItem } from "../Infra/ui-views";
import { settings } from "../Settings/Settings";
import { CommentsView } from "./CommentsView";

export const discussion = new class extends CommentsView {
    endpoint = 'discussion';
    eventName = 'diss-changed';
    init() {
        this.title = () => I`Discussion`;
        this.sidebarItem = new SidebarItem({ text: () => I`Discussion` });
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
        this.title = () => I`Notes`;
        this.sidebarItem = new SidebarItem({ text: () => I`Notes` }).bindContentView(() => this.view);
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
