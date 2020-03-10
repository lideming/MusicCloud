import { router } from './Router';
import { ListContentView } from './ListContentView';
import { ContentView, SidebarItem, ui } from './UI';
import { Lazy, I, utils, BuildDomExpr } from './utils';
import { ContentHeader } from './TrackList';
import { playerCore } from './PlayerCore';


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
    createDom(): BuildDomExpr {
        return {
            tag: 'div',
            child: [
                this.header.dom,
                {
                    tag: 'div.playingview',
                    child: [
                        { tag: 'div.name', text: () => playerCore.track?.name },
                        { tag: 'div.artist', text: () => playerCore.track?.artist },
                        {
                            tag: 'div.pic',
                            child: [
                                { tag: 'div.nopic', text: () => I`No album cover` }
                            ]
                        }
                    ]
                }]
        };
    }
    postCreateDom() {
        super.postCreateDom();
    }
    onShow() {
        this.ensureDom();
        playerCore.onTrackChanged.add(this.onTrackChanged)();
    }
    onRemove() {
        playerCore.onTrackChanged.remove(this.onTrackChanged);
    }
    onTrackChanged = () => {
        this.updateDom();
    };
}