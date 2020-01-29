// file: Uploads.ts

import { Track, TrackList, TrackListView, TrackViewItem, ContentHeader } from "./tracklist";
import { Semaphore, ItemActiveHelper, utils } from "./utils";
import { ListIndexViewItem } from "./ListIndex";
import { user } from "./User";
import { Api } from "./apidef";
import { ListContentView } from "./ListContentView";
import { ListView, LoadingIndicator, View, Toast } from "./viewlib";
import { router } from "./Router";
import { I, i18n } from "./I18n";
import { playerCore } from "./PlayerCore";
import { ui } from "./UI";
import { api } from "./Api";


class UploadTrack extends Track {
    constructor(init: Partial<UploadTrack>) {
        super(init);
    }
    _upload: {
        view?: UploadViewItem;
        state: 'pending' | 'uploading' | 'error' | 'done';
        // With prefix "uploads_", these are i18n keys 
    };
}

export var uploads = new class extends TrackList {
    tracks: UploadTrack[] = [];
    state: false | 'waiting' | 'fetching' | 'fetched' = false;
    canEdit = false;
    private uploadSemaphore = new Semaphore({ maxCount: 2 });
    init() {
        this.sidebarItem = new ListIndexViewItem({ text: I`My Uploads` });
        router.addRoute({
            path: ['uploads'],
            sidebarItem: () => this.sidebarItem,
            contentView: () => this.view
        });
        ui.sidebarList.addItem(this.sidebarItem);
        user.onSwitchedUser.add(() => {
            if (this.state !== false && this.state !== 'waiting') {
                this.tracks = [];
                this.state = false;
                if (this.view.rendered) {
                    this.view.listView.removeAll();
                    this.view.updateView();
                }
                setTimeout(() => this.fetch(), 1);
            }
        });
        playerCore.onTrackChanged.add(() => {
            this.sidebarItem.updateWith({ playing: !!this.tracks.find(x => x === playerCore.track) });
        });
        api.onTrackInfoChanged.add((newer: Api.Track) => {
            this.tracks.forEach(t => {
                if (t.id === newer.id) {
                    t.updateFromApiTrack(newer);
                    t._upload.view?.updateDom();
                }
            });
        });
    }
    sidebarItem: ListIndexViewItem;
    view = new class extends TrackListView {
        uploadArea: UploadArea;
        listView: ListView<UploadViewItem>;

        protected appendHeader() {
            this.title = I`My Uploads`;
            super.appendHeader();
            this.uploadArea = new UploadArea({ onfile: (file) => uploads.uploadFile(file) });
            this.dom.appendView(this.uploadArea);
        }
        createHeader() {
            return new ContentHeader({
                title: this.title
            });
        }
        protected appendListView() {
            super.appendListView();
            if (!uploads.state) uploads.fetch();
        }
        createViewItem(t: Track) {
            return new UploadViewItem(t as UploadTrack);
        }
    }(this);
    private prependTrack(t: UploadTrack) {
        this.tracks.unshift(t);
        if (this.view.rendered) this.view.addItem(t, 0);
    }
    private appendTrack(t: UploadTrack) {
        this.tracks.push(t);
        if (this.view.rendered) this.view.addItem(t);
    }
    async fetch() {
        this.state = 'waiting';
        var li = new LoadingIndicator();
        li.content = I`Logging in`;
        this.view.useLoadingIndicator(li);
        try {
            await user.waitLogin(true);
            this.state = 'fetching';
            li.reset();
            var fetched = ((await api.getJson('my/uploads'))['tracks'] as any[])
                .reverse()
                .map(t => {
                    t._upload = { state: 'done' };
                    return new UploadTrack(t);
                });
            this.state = 'fetched';
        } catch (error) {
            li.error(error, () => this.fetch());
            return;
        }
        this.tracks = this.tracks.filter(t => {
            if (t._upload.state == 'done') {
                t._upload.view?.remove();
                return false;
            }
            return true;
        });
        this.view.useLoadingIndicator(null);
        fetched.forEach(t => this.appendTrack(t));
        this.view.updateView();
    }
    async uploadFile(file: File) {
        var apitrack: Api.Track = {
            id: undefined, url: undefined,
            artist: 'Unknown', name: file.name
        };
        var track = new UploadTrack({
            ...apitrack,
            _upload: {
                state: 'pending'
            }
        });
        this.prependTrack(track);

        await this.uploadSemaphore.enter();
        try {
            track._upload.state = 'uploading';
            track._upload.view?.updateDom();

            var jsonBlob = new Blob([JSON.stringify(apitrack)]);
            var finalBlob = new Blob([
                BlockFormat.encodeBlock(jsonBlob),
                BlockFormat.encodeBlock(file)
            ]);
            var resp = await api.postJson({
                path: 'tracks/newfile',
                method: 'POST',
                mode: 'raw',
                obj: finalBlob,
                headers: { 'Content-Type': 'application/x-mcloud-upload' }
            }) as Api.Track;
            track.id = resp.id;
            track.updateFromApiTrack(resp);
        } catch (err) {
            track._upload.state = 'error';
            track._upload.view?.updateDom();
            Toast.show(I`Failed to upload file "${file.name}".` + '\n' + err, 3000);
            console.log('uploads failed: ', file.name, err);
            throw err;
        } finally {
            this.uploadSemaphore.exit();
        }
        track._upload.state = 'done';
        track._upload.view?.updateDom();
    }
};


class UploadViewItem extends TrackViewItem {
    track: UploadTrack;
    noPos = true;
    domstate: HTMLElement;
    _lastUploadState: string;
    constructor(track: UploadTrack) {
        super(track);
        track._upload.view = this;
    }
    postCreateDom() {
        super.postCreateDom();
        this.dom.classList.add('uploads-item');
        this.dom.appendChild(this.domstate = utils.buildDOM<HTMLElement>({ tag: 'span.uploads-state' }));
    }
    updateDom() {
        super.updateDom();
        var newState = this.track._upload.state;
        if (this._lastUploadState != newState) {
            if (this._lastUploadState) this.dom.classList.remove('state-' + this._lastUploadState);
            if (newState) this.dom.classList.add('state-' + newState);
            this.domstate.textContent = i18n.get('uploads_' + newState);
            this.dragging = newState == 'done';
        }
    }
}

class UploadArea extends View {
    onfile: (file: File) => void;
    private domfile: HTMLInputElement;
    constructor(init: Partial<UploadArea>) {
        super();
        utils.objectApply(this, init);
    }
    createDom() {
        return {
            _ctx: this,
            tag: 'div.upload-area.clickable',
            child: [
                { tag: 'div.text.no-selection', textContent: I`Click here to select files to upload` },
                { tag: 'div.text.no-selection', textContent: I`or drag files to this zone...` },
                {
                    tag: 'input', type: 'file', _key: 'domfile',
                    style: 'visibility: collapse; height: 0;',
                    accept: 'audio/*', multiple: true
                },
            ]
        };
    }
    postCreateDom() {
        this.domfile.addEventListener('change', (ev) => {
            this.handleFiles(this.domfile.files);
        });
        this.dom.addEventListener('click', (ev) => {
            this.domfile.click();
        });
        this.dom.addEventListener('dragover', (ev) => {
            if (ev.dataTransfer.types.indexOf('Files') >= 0) {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'copy';
            }
        });
        this.dom.addEventListener('drop', (ev) => {
            ev.preventDefault();
            if (ev.dataTransfer.types.indexOf('Files') >= 0) {
                this.handleFiles(ev.dataTransfer.files);
            }
        });
    }
    private handleFiles(files: FileList) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log('drop file', { name: file.name, size: file.size });
            this.onfile?.(file);
        }
    }
}

var BlockFormat = {
    encodeBlock(blob: Blob): Blob {
        return new Blob([BlockFormat.encodeLen(blob.size), blob]);
    },
    encodeLen(len: number): string {
        var str = '';
        for (var i = 0; i < 8; i++) {
            str = '0123456789aBcDeF'[(len >> (i * 4)) & 0x0f] + str;
        }
        str += '\r\n';
        return str;
    }
};