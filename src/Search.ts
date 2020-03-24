import { router } from './Router';
import { SidebarItem, ui } from './UI';
import { Lazy, I, Callbacks, BuildDomExpr } from './utils';
import { ListContentView } from './ListContentView';
import { InputView, View, ButtonView, LoadingIndicator, ListView } from './viewlib';
import { api } from './Api';
import { Api } from './apidef';
import { TrackViewItem, TrackList } from './TrackList';
import { Track } from "./Track";
import { playerCore } from './PlayerCore';

export var search = new class {
    init() {
        var sidebarItem = new SidebarItem({ text: I`Search` });
        router.addRoute({
            path: ['search'],
            contentView: () => this.view,
            sidebarItem: () => sidebarItem
        });
        ui.sidebarList.addFeatureItem(sidebarItem);
    }
    get view() { return this.lazyView.value; }
    lazyView = new Lazy(() => new SearchView());
};

class SearchView extends ListContentView {
    title = I`Search`;
    searchbar = new SearchBar();
    currentQuery: string;
    listView: ListView<TrackViewItem>;
    appendListView() {
        super.appendListView();
        this.listView.dragging = true;
        this.listView.onItemClicked = (item) => {
            var tempList = new TrackList();
            this.listView.forEach(t => tempList.addTrack(t.track.infoObj));
            playerCore.playTrack(tempList.tracks[item.position]);
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
    async performSearch(query: string) {
        this.currentQuery = query;
        var li = new LoadingIndicator();
        this.useLoadingIndicator(li);
        try {
            var r = await api.get('tracks?query=' + encodeURIComponent(query)) as { tracks: Api.Track[]; };
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
            t.updateWith({ playing: playing && t.track.id === playing.id });
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