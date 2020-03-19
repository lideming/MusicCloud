import { Track } from './Track';
import { ContentView, ContentHeader, SidebarItem, ui, ActionBtn } from './UI';
import { I } from './I18n';
import { BuildDomExpr } from './utils';
import { LyricsView } from './LyricsView';
import { router } from './Router';

export var lyricsEdit = new class {
    sidebarItem: SidebarItem;
    view: LyricsEditContentView;
    startEdit(track: Track) {
        if (!this.view) {
            this.sidebarItem = new SidebarItem({ text: I`Edit Lyrics` });
            this.view = new LyricsEditContentView();
            ui.sidebarList.addFeatureItem(this.sidebarItem);
            router.addRoute({
                path: ['lyricsEdit'],
                contentView: () => this.view,
                sidebarItem: () => this.sidebarItem
            });
        }
        this.sidebarItem.hidden = false;
        router.nav('lyricsEdit');
    }
};

class LyricsEditContentView extends ContentView {
    header = new ContentHeader({ title: I`Edit Lyrics` });
    lyrics = new LyricsView();
    constructor() {
        super();
        this.header.actions.addView(new ActionBtn({
            text: I`Discard`,
            onclick: () => {
                lyricsEdit.sidebarItem.hidden = true;
                window.history.back();
            }
        }));
        this.header.actions.addView(new ActionBtn({
            text: I`Save`
        }));
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'div.lyricsedit',
            child: [
                this.header.dom,
                this.lyrics.dom
            ]
        };
    }
}
