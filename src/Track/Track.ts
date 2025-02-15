import { MessageBox, TextCompositionWatcher } from "../Infra/utils";
import { I } from "../I18n/I18n";
import {
  Toast,
  Dialog,
  LabeledInput,
  TextBtn,
  LoadingIndicator,
  objectApply,
  sleepAsync,
} from "../Infra/viewlib";
import { Api } from "../API/apidef";
import { api } from "../API/Api";
import type { TrackList } from "./TrackList";
import { lyricsEdit, LyricsSourceEditView } from "../Lyrics/LyricsEdit";
import { user } from "../API/User";
import { FileSelector } from "../Infra/viewlib";
import { playerCore } from "../main";

/** A track binding with list */
export class Track {
  infoObj: Api.Track | null = null;
  get id() {
    return this.infoObj!.id;
  }
  get owner() {
    return this.infoObj!.owner;
  }
  get name() {
    return this.infoObj!.name;
  }
  get type() {
    return this.infoObj!.type;
  }
  get artist() {
    return this.infoObj!.artist;
  }
  get album() {
    return this.infoObj!.album;
  }
  get albumArtist() {
    return this.infoObj!.albumArtist;
  }
  get url() {
    return this.infoObj!.url;
  }
  get picurl() {
    return this.infoObj!.picurl;
  }
  get thumburl() {
    return this.infoObj!.thumburl;
  }
  get files() {
    return this.infoObj!.files;
  }
  get length() {
    return this.infoObj!.length;
  }
  get size() {
    return this.infoObj!.size;
  }
  get lyrics() {
    return this.infoObj!.lyrics;
  }
  get visibility() {
    return this.infoObj!.visibility;
  }
  get displayName() {
    return this.artist + " - " + this.name;
  }
  get groupId() {
    return this.infoObj!.groupId;
  }
  blob: Blob | null = null;
  _bind?: {
    position?: number;
    list?: TrackList;
  } = undefined;
  _loudmap: Uint8Array | Promise<Uint8Array | null> | null = null;
  get canEdit() {
    return user.role == "admin" || user.info.id == this.owner;
  }
  constructor(init: Partial<Track>) {
    objectApply(this, init);
  }
  toString() {
    return `${I`Track ID`}: ${this.id}\r\n${I`Name`}: ${
      this.name
    }\r\n${I`Artist`}: ${this.artist}`;
  }
  toApiTrack(): Api.Track {
    return this.infoObj!;
  }
  getExtensionName() {
    return /\.([\w\-_]{1,6})$/.exec(this.url!)?.[1];
  }
  updateFromApiTrack(t: Api.Track) {
    if (this.id !== t.id) throw new Error("Bad track id");
    // objectApply(this, t, ['id', 'name', 'artist', 'url', 'size']);
    this.infoObj = t;
  }
  startEdit(ev?: MouseEvent) {
    var dialog = new TrackDialog();
    dialog.setTrack(this);
    dialog.show(ev);
    return dialog;
  }
  getFileUrl(file?: Api.TrackFile) {
    if (!file?.profile) return this.url;
    if (file.size == -1) return false;
    return this.url + "." + file.profile;
  }
  async requestFileUrl(file: Api.TrackFile): Promise<string> {
    var r = this.getFileUrl(file);
    if (r !== false) return r;
    var toast = Toast.show(I`Converting "${this.displayName}"...`);
    try {
      file.size = (
        await api.post({
          path: `tracks/${this.id}/convert`,
          obj: { profile: file.profile },
        })
      )["size"];
      toast.close();
      return this.getFileUrl(file) as string;
    } catch (error) {
      toast.updateWith({
        text: I`Error converting "${this.displayName}".` + "\n" + error,
      });
      toast.show(3000);
      throw error;
    }
  }
  _lyricsFetchTask: Promise<string> | null = null;
  isLyricsGotten() {
    return this.lyrics != null;
  }
  getLyrics(): Promise<string> {
    if (!this.isLyricsGotten()) {
      if (!this.id) return Promise.resolve("");
      if (!this._lyricsFetchTask)
        this._lyricsFetchTask = (async () => {
          try {
            var resp: Api.TrackLyrics = await api.get(
              "tracks/" + this.id + "/lyrics",
            );
            this.infoObj!.lyrics = resp.lyrics;
            return this.lyrics!;
          } catch (error) {
            this._lyricsFetchTask = null;
            console.error(`[Track] id ${this.id} fetching lyrics error`, error);
            throw error;
          }
        })();
      return this._lyricsFetchTask;
    }
    return Promise.resolve(this.lyrics!);
  }

  async put(newInfo: Partial<Api.Track>) {
    const resp = (await api.put({
      path: "tracks/" + this.id,
      obj: newInfo,
    })) as Api.Track;
    if (resp["error"]) {
      throw new Error(resp["error"]);
    }
    if (resp.id != this.id) throw new Error("Bad ID in response");
    this.infoObj = resp;
    api.onTrackInfoChanged.invoke(resp);
  }

  _group: Promise<{ tracks: Api.Track[] }> | null = null;
  getGroup(): Promise<{ tracks: Api.Track[] }> {
    return getGroup(this.groupId ?? this.id);
  }

  async getLoudnessMap() {
    if (!this._loudmap) {
      this._loudmap = (async () => {
        var resp = (await api.get(`tracks/${this.id}/loudnessmap`)) as Response;
        if (!resp.ok) return null;
        var ab = await resp.arrayBuffer();
        return (this._loudmap = new Uint8Array(ab));
      })();
    }
    return this._loudmap;
  }

  async preload() {
    const preloadTrackFile = async () => {
      const apiFile = playerCore.decideFileFromTrack(this);
      const fileUrl = await this.requestFileUrl(apiFile);
      const res = await api._fetch(api.processUrl(fileUrl), {
        headers: {
          range: "bytes=0-1000000",
        },
      });
      await res.blob();
    };
    const preloadThumb = async () => {
      if (this.thumburl) {
        const res = await api._fetch(api.processUrl(this.thumburl), {
          mode: "no-cors",
        });
        await res.blob();
      }
    };
    await Promise.all([
      this.getLoudnessMap(),
      this.getLyrics(),
      preloadTrackFile(),
      preloadThumb(),
    ]);
  }
}

const groupCache = new Map<number, Promise<{ tracks: Api.Track[] }>>();

function getGroup(id: number) {
  if (!groupCache.has(id)) {
    groupCache.set(id, api.get(`tracks/group/${id}`));
  }
  return groupCache.get(id)!;
}

export class TrackDialog extends Dialog {
  track: Track;
  inputName = new LabeledInput({ label: I`Name` });
  inputArtist = new LabeledInput({ label: I`Artist` });
  inputAlbum = new LabeledInput({ label: I`Album` });
  inputAlbumArtist = new LabeledInput({ label: I`Album artist` });
  inputLyrics = new LabeledInputWithLoading({ label: I`Lyrics` });
  fileSelector = new FileSelector({ accept: "image/jpeg" });
  btnSave = new TextBtn({ text: I`Save`, right: true });
  btnEditLyrics = new TextBtn({ text: I`Edit Lyrics`, right: true });
  btnSetPicture = new TextBtn({ text: I`Set Picture`, right: true });
  autoFocus = this.inputName.input;
  compositionWatcher: TextCompositionWatcher;
  constructor() {
    super();
    this.width = "500px";
    this.resizable = true;
    this.contentFlex = true;
    this.inputLyrics.input = new LyricsSourceEditView();
    this.inputLyrics.input.dom.style.resize = "none";
    this.inputLyrics.dom.style.flex = "1";
    this.inputLyrics.dominput.style.minHeight = "3em";
    this.inputLyrics.dominput.style.height = "6em";

    [
      this.inputName,
      this.inputArtist,
      this.inputAlbum,
      this.inputAlbumArtist,
      this.inputLyrics,
      this.fileSelector,
    ].forEach((x) => this.addContent(x));

    this.addBtn(this.btnSave);
    this.btnSave.onActive.add(() => this.save());
    this.addBtn(this.btnEditLyrics);
    this.btnEditLyrics.onActive.add(() => {
      this.close();
      lyricsEdit.startEdit(this.track, this.inputLyrics.value);
    });
    this.addBtn(this.btnSetPicture);
    this.btnSetPicture.onActive.add(() => {
      this.fileSelector.open();
    });

    this.fileSelector.onfile = async (file) => {
      try {
        this.btnSetPicture.updateWith({
          clickable: false,
          text: I`Uploading...`,
        });
        let updated = (await api.put({
          path: `tracks/${this.track.id}/picture`,
          mode: "raw",
          obj: await file.arrayBuffer(),
        })) as Api.Track;
        this.btnSetPicture.updateWith({ clickable: false, text: I`Done` });
        this.track.updateFromApiTrack(updated);
        api.onTrackInfoChanged.invoke(updated);
      } catch (error) {
        console.error(error);
        this.btnSetPicture.updateWith({ clickable: false, text: I`Error` });
      } finally {
        sleepAsync(2000).then(() => {
          this.btnSetPicture.updateWith({
            clickable: true,
            text: I`Set Picture`,
          });
        });
      }
    };

    this.compositionWatcher = new TextCompositionWatcher(this.dom);
    this.dom.addEventListener("keydown", (ev) => {
      if (
        this.track.canEdit &&
        !this.compositionWatcher.isCompositing &&
        ev.code === "Enter" &&
        (ev.ctrlKey || ev.target !== this.inputLyrics.input.dom)
      ) {
        ev.preventDefault();
        this.save();
      }
    });
  }
  setTrack(t: Track) {
    this.track = t;
    this.title = I`Track ID` + " " + t.id;
    if (!t.canEdit) this.title += I` (read-only)`;
    this.btnSave.hidden = !t.canEdit;
    this.inputName.updateWith({ value: t.name });
    this.inputArtist.updateWith({ value: t.artist });
    this.inputAlbum.value = t.infoObj?.album || "";
    this.inputAlbumArtist.value = t.infoObj?.albumArtist || "";
    if (t.isLyricsGotten()) {
      this.inputLyrics.loaded = true;
      this.inputLyrics.updateWith({ value: t.lyrics });
    } else {
      this.inputLyrics.loaded = false;
      t.getLyrics().then((l) => {
        this.inputLyrics.loaded = true;
        this.inputLyrics.updateWith({ value: t.lyrics });
      });
    }
    this.updateDom();
  }
  checkIfChanged() {
    return (
      this.track.name !== this.inputName.value ||
      this.track.artist !== this.inputArtist.value ||
      this.track.album !== this.inputAlbum.value ||
      this.track.albumArtist !== this.inputAlbumArtist.value ||
      (this.inputLyrics.loaded && this.track.lyrics !== this.inputLyrics.value)
    );
  }
  close() {
    if (this.checkIfChanged()) {
      new MessageBox()
        .setTitle(I`Save changes?`)
        .addText(I`There are unsaved changes.`)
        .addResultBtns(["cancel", "no", "yes"])
        .showAndWaitResult()
        .then((result) => {
          if (result === "yes") {
            this.save();
          } else if (result === "no") {
            super.close();
          } // else noop
        });
      return;
    }
    super.close();
  }
  async save() {
    if (!this.btnSave.clickable) throw new Error("btnSave is not clickable.");
    this.btnSave.updateWith({ clickable: false, text: I`Saving...` });
    try {
      await this.track.put({
        id: this.track.id,
        name: this.inputName.value,
        artist: this.inputArtist.value,
        album: this.inputAlbum.value,
        albumArtist: this.inputAlbumArtist.value,
        lyrics: this.inputLyrics.loaded ? this.inputLyrics.value : undefined,
        version: this.track.infoObj?.version,
      });
      this.close();
    } catch (error) {
      if (error.message == "track_changed") {
        Toast.show(I`The track was changed from somewhere else.`, 5000);
        return;
      }
      console.error("[Track] saving error", error);
      this.btnSave.updateWith({ clickable: false, text: I`Error` });
      await sleepAsync(3000);
    }
    this.btnSave.updateWith({ clickable: true, text: I`Save` });
  }
}

class LabeledInputWithLoading extends LabeledInput {
  loadingIndicator = new LoadingIndicator();
  get loaded() {
    return this.loadingIndicator.hidden;
  }
  set loaded(val) {
    this.loadingIndicator.hidden = val;
    this.input.hidden = !val;
  }
  postCreateDom() {
    super.postCreateDom();
    this.appendView(this.loadingIndicator);
    this.loaded = false;
  }
}
