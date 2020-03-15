import { router } from './Router';
import { ListContentView } from './ListContentView';
import { ContentView, SidebarItem, ui } from './UI';
import { Lazy, I, utils, BuildDomExpr, Timer, SettingItem } from './utils';
import { ContentHeader, ActionBtn } from './TrackList';
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
    constructor() {
        super();
        this.lyricsView.scale = this.si.data.lyricsScale;
        this.lyricsView.onFontSizeChanged.add(() => {
            this.si.data.lyricsScale = this.lyricsView.scale;
            this.si.save();
        });
        this.lyricsView.onSpanClick.add((span) => {
            if (span.startTime >= 0) playerCore.currentTime = span.startTime;
        });
        this.header.actions.addView(this.editBtn = new ActionBtn({
            text: I`Edit`, onclick: () => {
                playerCore.track.startEdit();
            }
        }));
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'div.playingview',
            child: [
                this.header.dom,
                { tag: 'div.name', text: () => playerCore.track?.name },
                { tag: 'div.artist', text: () => playerCore.track?.artist },
                // {
                //     tag: 'div.pic',
                //     child: [
                //         { tag: 'div.nopic.no-selection', text: () => I`No album cover` }
                //     ]
                // },
                this.lyricsView.dom
            ]
        };
    }
    postCreateDom() {
        super.postCreateDom();
    }
    onShow() {
        this.ensureDom();
        this.shownEvents.add(playerCore.onTrackChanged, this.onTrackChanged)();
        this.shownEvents.add(playerCore.onProgressChanged, this.onProgressChanged);
        this.shownEvents.add(api.onTrackInfoChanged, (track) => {
            if (track.id === playerCore.track?.id) {
                this.onTrackChanged();
            }
        });
    }
    onDomInserted() {
        this.lyricsView.dom.scrollTop; // force layout
        this.lyricsView.setCurrentTime(playerCore.currentTime, true);
        this.timer.tryCancel();
        // if (this.lyricsScrollPos) this.lyricsView.dom.scrollTop = this.lyricsScrollPos;
    }
    onRemove() {
        playerCore.onTrackChanged.remove(this.onTrackChanged);
        playerCore.onProgressChanged.remove(this.onProgressChanged);
        this.lyricsScrollPos = this.lyricsView.dom.scrollTop;
    }
    loadedLyrics: string;
    lyricsScrollPos: number;
    onTrackChanged = () => {
        this.updateDom();
        this.editBtn.hidden = !playerCore.track;
        var newLyrics = playerCore.track?.infoObj.lyrics || '';
        if (this.loadedLyrics != newLyrics) {
            this.loadedLyrics = newLyrics;
            this.lyricsView.setLyrics(newLyrics);
            this.lyricsView.dom.scrollTop = 0;
        }
    };

    timer = new Timer(() => this.onProgressChanged());
    lastTime = 0;
    lastChangedRealTime = 0;
    onProgressChanged = () => {
        var time = playerCore.currentTime;
        var realTime = new Date().getTime();
        var timerOn = true;
        if (time != this.lastTime) {
            this.lastChangedRealTime = realTime;
            this.lyricsView.setCurrentTime(time, 'smooth');
        }
        if (realTime - this.lastChangedRealTime < 500) this.timer.timeout(16);
    };
}