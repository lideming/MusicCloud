import { router } from './Router';
import { ui } from './UI';
import { Lazy, Callbacks, BuildDomExpr } from './utils';
import { I } from "./I18n";
import { ListContentView } from './ListContentView';
import { InputView, View, ButtonView, LoadingIndicator, ListView } from './viewlib';
import { api } from './Api';
import { Api } from './apidef';
import { TrackViewItem, TrackList } from './TrackList';
import { Track } from "./Track";
import { playerCore } from './PlayerCore';
import { ListIndexViewItem } from './ListIndex';

export const search = new class {
    init() {
        this.sidebarItem = new ListIndexViewItem({ text: I`Search` });
        router.addRoute({
            path: ['search'],
            contentView: () => this.view,
            sidebarItem: () => this.sidebarItem,
            onNav: (arg) => {
                const query = arg.remaining[0];
                if (query && query != this.view.currentQuery)
                    this.view.performSearch(query);
            }
        });
        ui.sidebarList.addFeatureItem(this.sidebarItem);
        playerCore.onTrackChanged.add(this.checkPlaying)();
    }
    get view() { return this.lazyView.value; }
    lazyView = new Lazy(() => new SearchView());
    sidebarItem: ListIndexViewItem;
    checkPlaying = () => {
        var thisPlaying = this.lazyView.computed && !!this.view.tempList
            && playerCore.track?._bind?.list === this.view.tempList;
        this.sidebarItem.updateWith({ playing: thisPlaying });
    };
};

class SearchView extends ListContentView {
    title = I`Search`;
    searchbar = new SearchBar();
    currentQuery: string;
    tempList: TrackList | null = null;
    listView: ListView<TrackViewItem>;
    appendListView() {
        super.appendListView();
        this.listView.toggleClass('tracklistview', true);
        this.listView.dragging = true;
        this.listView.onItemClicked = (item) => {
            var track = this.getTempList().tracks[item.position!];
            if (playerCore.track === track && playerCore.isPlaying) {
                router.nav('nowplaying');
                return;
            }
            playerCore.playTrack(track);
        };
    }
    appendHeader() {
        super.appendHeader();
        this.refreshBtn.hidden = true;
        this.header.appendView(this.searchbar);
        this.searchbar.onSearch.add(() => {
            this.performSearch(this.searchbar.input.value);
        });
    }
    getTempList() {
        if (!this.tempList) {
            this.tempList = new TrackList();
            this.listView.forEach(t => this.tempList!.addTrack(t.track.infoObj!));
        }
        return this.tempList;
    }
    async performSearch(query: string) {
        this.currentQuery = query;
        if (this.searchbar.value != query)
            this.searchbar.value = query;
        var li = new LoadingIndicator();
        this.useLoadingIndicator(li);
        router.nav(['search', query]);
        try {
            var r = await api.get('tracks?query=' + encodeURIComponent(query)) as { tracks: Api.Track[]; };
            this.tempList = null;
            search.checkPlaying();
            this.listView.removeAll();
            r.tracks.forEach(t => {
                this.listView.add(new TrackViewItem(new Track({ infoObj: t })));
            });
            this.updatePlaying();
            this.useLoadingIndicator(null);
        } catch (error) {
            li.error(error, () => this.performSearch(query));
        }
    }
    onShow() {
        super.onShow();
        this.updatePlaying();
        this.shownEvents.add(playerCore.onTrackChanged, () => this.updatePlaying());
    }
    onRemove() {
        super.onRemove();
    }
    updatePlaying() {
        var playing = playerCore.track;
        this.listView.forEach(t => {
            t.updateWith({ playing: !!playing && t.track.id === playing.id });
        });
    };
}

class SearchBar extends View {
    input = new InputView();
    btn = new ButtonView({ text: I`Search`, onclick: () => this.onSearch.invoke() });
    onSearch = new Callbacks();
    get value() { return this.input.value; }
    set value(val) { this.input.value = val; }
    createDom(): BuildDomExpr {
        return {
            tag: 'div.searchbar',
            child: [
                this.input,
                this.btn
            ]
        };
    }
    postCreateDom() {
        super.postCreateDom();
        this.input.dom.addEventListener('keydown', (ev) => {
            if (ev.code === 'Enter') {
                ev.preventDefault();
                this.onSearch.invoke();
            }
        });
    }
}