import { router } from '../Infra/Router';
import { ui } from '../Infra/UI';
import { Lazy, BuildDomExpr, SettingItem } from '../Infra/utils';
import { I } from "../I18n/I18n";
import { playerCore } from '../Player/PlayerCore';
import { LyricsView } from '../Lyrics/LyricsView';
import { api } from '../API/Api';
import { SidebarItem, ContentView, ContentHeader, ActionBtn, setScrollableShadow } from '../Infra/ui-views';
import { LoadingIndicator, View, ViewToggle } from '../Infra/viewlib';
import { Api } from '../API/apidef';
import { Track } from './Track';


export const nowPlaying = new class {
    init() {
        var sidebarItem = new SidebarItem({ text: I`Now Playing` });
        router.addRoute({
            path: ['nowplaying'],
            contentView: () => this.view,
            sidebarItem: () => sidebarItem
        });
        router.addRoute({
            path: ['tracks'],
            onNav: (arg) => {
                router.nav(['track', ...arg.remaining], 'replace');
            }
        });
        router.addRoute({
            path: ['track'],
            onNav: (arg) => {
                router.nav(['nowplaying'], false);
                if (arg.remaining[0] != playerCore.track?.id as any) { // compare string to number
                    api.get('tracks/' + arg.remaining[0]).then((t: Api.Track) => {
                        playerCore.setTrack(new Track({ infoObj: t }));
                    });
                }
            }
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
    header = new class extends ContentHeader {
        lines: View;
        onScrollboxScroll() {
            setScrollableShadow(this.dom, this.scrollbox!.scrollTop - this.lines.dom.offsetTop);
        }
    }({
        title: I`Now Playing`
    });
    infoView = new View({
        tag: 'div.infoview',
        child: [
            { tag: 'div.name', text: () => playerCore.track?.name },
            { tag: 'div.artist', text: () => playerCore.track?.artist },
        ]
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
        this.header.lines = this.lyricsView.lines;
        this.lyricsView.scale = this.si.data.lyricsScale;
        this.lyricsView.onFontSizeChanged.add(() => {
            this.si.data.lyricsScale = this.lyricsView.scale;
            this.si.save();
            this.lyricsView.centerLyrics();
        });
        this.lyricsView.onLyricsChanged.add(() => {
            this.header.onScrollboxScroll();
        });
        this.lyricsView.onSpanClick.add((s) => {
            if (s.span.startTime && s.span.startTime >= 0) playerCore.currentTime = s.span.startTime;
        });
        this.header.actions.addView(this.editBtn = new ActionBtn({
            text: I`Edit`, onActive: (ev) => {
                playerCore.track?.startEdit(ev);
            }
        }));
        this.header.appendView(this.infoView);
        this.header.bindScrollBox(this.lyricsView.dom);
    }
    createDom(): BuildDomExpr {
        return {
            tag: 'div.playingview',
            child: [
                this.header,
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
    onSidebarItemReactived() {
        this.lyricsView.setScrollingPause(null);
        this.lyricsView.setCurrentTime(this.lyricsView.curTime, "smooth");
    }
    _checkTrackVersion = 0;
    async checkTrack() {
        var version = ++this._checkTrackVersion;
        this.infoView.updateDom();
        const newTrack = playerCore.track;
        let newLyrics = '';
        this.editBtn.hidden = !newTrack;
        this.editBtn.text = newTrack?.canEdit ? I`Edit` : I`Details`;

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