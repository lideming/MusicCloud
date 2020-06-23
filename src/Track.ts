import { utils, I, TextCompositionWatcher } from "./utils";
import { Toast, Dialog, LabeledInput, TabBtn } from "./viewlib";
import { Api } from "./apidef";
import { api } from "./Api";
import { TrackList } from "./TrackList";
import { lyricsEdit, LyricsSourceEditView } from "./LyricsEdit";

/** A track binding with list */
export class Track {
    infoObj: Api.Track | null = null;
    get id() { return this.infoObj!.id; }
    get name() { return this.infoObj!.name; }
    get artist() { return this.infoObj!.artist; }
    get url() { return this.infoObj!.url; }
    get files() { return this.infoObj!.files; }
    get length() { return this.infoObj!.length; }
    get size() { return this.infoObj!.size; }
    get lyrics() { return this.infoObj!.lyrics; }
    get displayName() { return this.artist + ' - ' + this.name; }
    blob: Blob | null = null;
    _bind?: {
        position?: number;
        list?: TrackList;
    } = undefined;
    get canEdit() { return true; }
    constructor(init: Partial<Track>) {
        utils.objectApply(this, init);
    }
    toString() {
        return `${I`Track ID`}: ${this.id}\r\n${I`Name`}: ${this.name}\r\n${I`Artist`}: ${this.artist}`;
    }
    toApiTrack(): Api.Track {
        return this.infoObj!;
    }
    getExtensionName() {
        return /\.([\w\-_]{1,6})$/.exec(this.url!)?.[1];
    }
    updateFromApiTrack(t: Api.Track) {
        if (this.id !== t.id)
            throw new Error('Bad track id');
        // utils.objectApply(this, t, ['id', 'name', 'artist', 'url', 'size']);
        this.infoObj = t;
    }
    startEdit() {
        var dialog = new TrackDialog();
        dialog.setTrack(this);
        dialog.show();
        return dialog;
    }
    async requestFileUrl(file: Api.TrackFile) {
        if (!file.url) {
            var toast = Toast.show(I`Converting "${this.displayName}"...`);
            try {
                file.url = (await api.get(file.urlurl!))['url'];
                toast.close();
            }
            catch (error) {
                toast.updateWith({ text: I`Error converting "${this.displayName}".` + '\n' + error });
                toast.show(3000);
            }
        }
    }
}

export class TrackDialog extends Dialog {
    width = '500px';
    track: Track;
    inputName = new LabeledInput({ label: I`Name` });
    inputArtist = new LabeledInput({ label: I`Artist` });
    inputLyrics = new LabeledInput({ label: I`Lyrics` });
    btnSave = new TabBtn({ text: I`Save`, right: true });
    btnEditLyrics = new TabBtn({ text: I`Edit Lyrics`, right: true });
    autoFocus = this.inputName.input;
    compositionWatcher: TextCompositionWatcher;
    constructor() {
        super();
        this.resizable = true;
        this.contentFlex = true;
        this.inputLyrics.input = new LyricsSourceEditView();
        this.inputLyrics.input.dom.style.resize = 'none';
        this.inputLyrics.dom.style.flex = '1';
        this.inputLyrics.dominput.style.minHeight = '5em';
        [this.inputName, this.inputArtist, this.inputLyrics].forEach(x => this.addContent(x));
        this.addBtn(this.btnSave);
        this.btnSave.onClick.add(() => this.save());
        this.addBtn(this.btnEditLyrics);
        this.btnEditLyrics.onClick.add(() => {
            this.close();
            lyricsEdit.startEdit(this.track, this.inputLyrics.value);
        });
        this.compositionWatcher = new TextCompositionWatcher(this.dom);
        this.dom.addEventListener('keydown', (ev) => {
            if (!this.compositionWatcher.isCompositing
                && ev.code === 'Enter'
                && (ev.ctrlKey || ev.target !== this.inputLyrics.input.dom)) {
                ev.preventDefault();
                this.save();
            }
        });
    }
    setTrack(t: Track) {
        this.track = t;
        this.title = I`Track ID` + ' ' + t.id;
        this.inputName.updateWith({ value: t.name });
        this.inputArtist.updateWith({ value: t.artist });
        this.inputLyrics.updateWith({ value: t.lyrics });
        this.updateDom();
    }
    async save() {
        if (!this.btnSave.clickable)
            throw new Error('btnSave is not clickable.');
        this.btnSave.updateWith({ clickable: false, text: I`Saving...` });
        try {
            var newinfo = await api.put({
                path: 'tracks/' + this.track.id,
                obj: {
                    id: this.track.id,
                    name: this.inputName.value,
                    artist: this.inputArtist.value,
                    lyrics: this.inputLyrics.value
                }
            }) as Api.Track;
            if (newinfo.id != this.track.id) throw new Error('Bad ID in response');
            api.onTrackInfoChanged.invoke(newinfo);
            this.close();
        } catch (error) {
            console.error('[Track] saving error', error);
            this.btnSave.updateWith({ clickable: false, text: I`Error` });
            await utils.sleepAsync(3000);
        }
        this.btnSave.updateWith({ clickable: true, text: I`Save` });
    }
}