import { DataUpdatingHelper, I, Lazy, LoadingIndicator } from "@yuuza/webfx";
import { api, playerCore, router, ui, user } from "../main";
import { TrackList, TrackListView } from "./TrackList";
import { ListIndexViewItem } from "./ListIndex";
import { ContentHeader } from "../Infra/ui-views";
import { Track } from "./Track";
import { Api } from "../API/apidef";

export class History extends TrackList {
  get canEdit() {
    return false;
  }
  sidebarItem = new ListIndexViewItem({ text: () => I`History` });

  init() {
    ui.sidebarList.addFeatureItem(this.sidebarItem);
    router.addRoute({
      path: ["history"],
      sidebarItem: () => this.sidebarItem,
      contentView: () => this.view,
    });
    playerCore.onTrackChanged.add(() => {
      this.sidebarItem.updateWith({
        playing: Boolean(
          playerCore.track && this.tracks.includes(playerCore.track!),
        ),
      });
      if (playerCore.track && playerCore.trackChangedReason !== "restore") {
        this.insertTrack(this.createTrack(playerCore.track.infoObj!), 0, true);
      }
    });
  }

  private insertTrack(t: Track, pos = 0, updateview?: boolean) {
    this.tracks.splice(pos, 0, t);
    if (this.view.rendered) this.view.addItem(t, pos, updateview);
  }

  override async fetchImpl() {
    var li = new LoadingIndicator();
    this.view.useLoadingIndicator(li);
    await user.waitLogin(true);
    const fetched = ((await api.get("my/recentplays")).tracks as any[]).map(
      (t) => this.createTrack(t),
    );
    const thiz = this;
    new (class extends DataUpdatingHelper<Track, Track> {
      items = thiz.tracks;
      addItem(data: Track, pos: number) {
        thiz.insertTrack(data, pos, false);
      }
      updateItem(item: Track, data: Track) {
        item.updateFromApiTrack(data.infoObj!);
      }
      removeItem(item: Track) {}
    })().update(fetched);
    this.view.updateView();
    this.view.useLoadingIndicator(null);
  }

  private createTrack(t: Api.Track): Track {
    return new Track({
      infoObj: t,
      _bind: { list: this },
    });
  }

  get view() {
    return this.lazyView.value;
  }
  lazyView = new Lazy(
    () =>
      new (class HistoryView extends TrackListView {
        override createHeader() {
          const header = new ContentHeader({
            title: I`History`,
          });
          return header;
        }
      })(this),
  );
}

export const history = new History();
