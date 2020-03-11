import { router } from './Router';
import { ListContentView } from './ListContentView';
import { ContentView, SidebarItem, ui } from './UI';
import { Lazy, I, utils, BuildDomExpr, Timer } from './utils';
import { ContentHeader } from './TrackList';
import { playerCore } from './PlayerCore';
import { LyricsView } from './LyricsView';


export var nowPlaying = new class {
    init() {
        router.addRoute({
            path: ['nowplaying'],
            contentView: () => this.view,
            sidebarItem: () => this.sidebarItem
        });
        ui.sidebarList.addFeatureItem(this.sidebarItem);
    }
    sidebarItem = new SidebarItem({ text: I`Now Playing` });
    get view() { return this.lazyView.value; }
    lazyView = new Lazy(() => new PlayingView());
};

class PlayingView extends ContentView {
    header = new ContentHeader({
        title: I`Now Playing`
    });
    lyricsView = new LyricsView();
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
        playerCore.onTrackChanged.add(this.onTrackChanged)();
        playerCore.onProgressChanged.add(this.onProgressChanged);
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
        if (realTime - this.lastChangedRealTime < 500) this.timer.timeout(32);
    };
}