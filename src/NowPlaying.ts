import { router } from './Router';
import { ContentView, SidebarItem, ui, ContentHeader, ActionBtn } from './UI';
import { Lazy, I, BuildDomExpr, SettingItem } from './utils';
import { playerCore } from './PlayerCore';
import { LyricsView } from './LyricsView';
import { api } from './Api';


export var nowPlaying = new class {
    init() {
        var sidebarItem = new SidebarItem({ text: I`Now Playing` });
        router.addRoute({
            path: ['nowplaying'],
            contentView: () => this.view,
            sidebarItem: () => sidebarItem
        });
        ui.sidebarList.addFeatureItem(sidebarItem);
        playerCore.onTrackChanged.add(() => {
            sidebarItem.hidden = !playerCore.track;
        })();
    }
    get view() { return this.lazyView.value; }
    lazyView = new Lazy(() => new PlayingView());
};

class PlayingView extends ContentView {
    header = new ContentHeader({
        title: I`Now Playing`
    });
    lyricsView = new LyricsView();
    editBtn: ActionBtn;
    si = new SettingItem('mcloud-nowplaying', 'json', {
        lyricsScale: 100
    });
    loadedLyrics: string = '';
    constructor() {
        super();
        this.lyricsView.scale = this.si.data.lyricsScale;
        this.lyricsView.onFontSizeChanged.add(() => {
            this.si.data.lyricsScale = this.lyricsView.scale;
            this.si.save();
            this.lyricsView.centerLyrics();
        });
        this.lyricsView.onSpanClick.add((s) => {
            if (s.span.startTime && s.span.startTime >= 0) playerCore.currentTime = s.span.startTime;
        });
        this.header.actions.addView(this.editBtn = new ActionBtn({
            text: I`Edit`, onclick: () => {
                playerCore.track?.startEdit();
            }
        }));
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'div.playingview',
            child: [
                this.header,
                { tag: 'div.name', text: () => playerCore.track?.name },
                { tag: 'div.artist', text: () => playerCore.track?.artist },
                // {
                //     tag: 'div.pic',
                //     child: [
                //         { tag: 'div.nopic.no-selection', text: () => I`No album cover` }
                //     ]
                // },
                this.lyricsView
            ]
        };
    }
    postCreateDom() {
        super.postCreateDom();
    }
    onShow() {
        super.onShow();
        this.ensureDom();
    }
    onDomInserted() {
        super.onDomInserted();
        this.shownEvents.add(playerCore.onTrackChanged, () => { this.checkTrack(); })();
        this.shownEvents.add(playerCore.onProgressChanged, () => this.lyricsView.onProgressChanged());
        this.shownEvents.add(api.onTrackInfoChanged, (track) => {
            if (track.id === playerCore.track?.id) {
                this.checkTrack();
            }
        });
        this.lyricsView.onShow();
    }
    onRemove() {
        super.onRemove();
        this.lyricsView.onHide();
    }
    checkTrack() {
        this.updateDom();
        this.editBtn.hidden = !playerCore.track;
        var newLyrics = playerCore.track?.lyrics || '';
        this.lyricsView.track = playerCore.track;
        if (this.loadedLyrics != newLyrics) {
            this.loadedLyrics = newLyrics;
            this.lyricsView.reset();
            this.lyricsView.setLyrics(newLyrics);
            return true;
        }
        return false;
    }

}