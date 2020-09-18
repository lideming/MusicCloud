import { router } from './Router';
import { ui } from './UI';
import { Lazy, BuildDomExpr, SettingItem } from './utils';
import { I } from "./I18n";
import { playerCore } from './PlayerCore';
import { LyricsView } from './LyricsView';
import { api } from './Api';
import { SidebarItem, ContentView, ContentHeader, ActionBtn } from './ui-views';
import { LoadingIndicator, View, ViewToggle } from '@yuuza/webfx';


export const nowPlaying = new class {
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
    loading = new LoadingIndicator();
    loadingOuter = new View({ tag: 'div', style: 'flex: 1; align-items: center;', child: this.loading });
    viewToggle = new ViewToggle({
        container: this,
        items: {
            'normal': this.lyricsView,
            'loading': this.loadingOuter
        }
    });
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
            text: I`Edit`, onclick: (ev) => {
                playerCore.track?.startEdit(ev);
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
    _checkTrackVersion = 0;
    async checkTrack() {
        var version = ++this._checkTrackVersion;
        this.updateDom();
        const newTrack = playerCore.track;
        let newLyrics = '';
        this.editBtn.hidden = !newTrack;

        this.loadingOuter.dom.remove();

        if (newTrack && !newTrack.isLyricsGotten()) {
            this.loading.reset();
            this.viewToggle.setShownKeys(['loading']);
            try {
                newLyrics = await newTrack.getLyrics();
            } catch (error) {
                if (version != this._checkTrackVersion) return;
                this.loading.error(error, () => this.checkTrack());
                return;
            }
            if (version != this._checkTrackVersion) return;
        } else {
            newLyrics = newTrack?.lyrics || '';
        }

        this.viewToggle.setShownKeys(['normal']);

        this.lyricsView.track = newTrack;

        if (this.loadedLyrics != newLyrics) {
            this.loadedLyrics = newLyrics;
            this.lyricsView.reset();
            this.lyricsView.setLyrics(newLyrics);
            return true;
        }
        return false;
    }

}