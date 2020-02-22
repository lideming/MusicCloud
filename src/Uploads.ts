// file: Uploads.ts

import { Track, TrackList, TrackListView, TrackViewItem, ContentHeader, ActionBtn } from "./tracklist";
import { Semaphore, ItemActiveHelper, utils, DataUpdatingHelper } from "./utils";
import { ListIndexViewItem } from "./ListIndex";
import { user } from "./User";
import { Api } from "./apidef";
import { ListContentView } from "./ListContentView";
import { ListView, LoadingIndicator, View, Toast, MessageBox, TextView } from "./viewlib";
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
        state: 'pending' | 'uploading' | 'error' | 'done' | 'cancelled';
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
        ui.sidebarList.addFeatureItem(this.sidebarItem);
        user.onSwitchedUser.add(() => {
            if (this.state !== false && this.state !== 'waiting') {
                this.tracks = [];
                this.state = false;
                if (this.view.rendered) {
                    this.view.listView.removeAll();
                    this.view.updateView();
                }
                setTimeout(() => this.fetch(true), 1);
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
        api.onTrackDeleted.add((deleted) => {
            var track = this.tracks.find(x => x.id === deleted.id);
            if (track) this.remove(track);
        });
    }
    sidebarItem: ListIndexViewItem;
    view = new class extends TrackListView {
        uploadArea: UploadArea;
        listView: ListView<UploadViewItem>;
        usage = new TextView({ tag: 'span.uploads-usage' });

        protected appendHeader() {
            this.title = I`My Uploads`;
            super.appendHeader();
            this.uploadArea = new UploadArea({ onfile: (file) => uploads.uploadFile(file) });
            this.dom.appendView(this.uploadArea);

            this.trackActionHandler.onTrackRemove = (items: UploadViewItem[]) => {
                if (items.length == 1) {
                    this.removeTrack(items[0]);
                } else {
                    new MessageBox()
                    .setTitle(I`Warning`)
                    .addText(I`Are you sure to delete ${items.length} tracks permanently?`)
                    .addResultBtns(['cancel', 'ok'])
                    .allowCloseWithResult('cancel')
                    .showAndWaitResult()
                    .then(r => {
                        if (r !== 'ok') return;
                        items.forEach(x => this.removeTrack(x, true));
                    });
                }
            };
        }
        createHeader() {
            var header = new ContentHeader({
                title: this.title
            });
            header.appendView(this.usage);
            return header;
        }
        protected appendListView() {
            super.appendListView();
            if (!uploads.state) uploads.fetch();
        }
        updateUsage() {
            var total = 0;
            uploads.tracks.forEach(x => total += x.size ?? 0);
            this.usage.text = total ? `(${utils.formatFileSize(total)})` : '';
        }
        updateView() {
            super.updateView();
            this.updateUsage();
        }
        createViewItem(t: Track) {
            const item = new UploadViewItem(t as UploadTrack);
            item.actionHandler = this.trackActionHandler;
            return item;
        }
        async removeTrack(item: UploadViewItem, noPrompt?: boolean) {
            const track = item.track;
            if (track._upload.state === 'uploading') {
                Toast.show(I`Removing of a uploading track is currently not supported.`);
                return;
            }
            if (track._upload.state === 'pending') {
                track._upload.state = 'cancelled';
                uploads.remove(track);
            } else if (track._upload.state === 'error') {
                uploads.remove(track);
            } else if (track._upload.state === 'done') {
                if (!noPrompt && await new MessageBox()
                    .setTitle(I`Warning`)
                    .addText(I`Are you sure to delete the track permanently?`)
                    .addResultBtns(['cancel', 'ok'])
                    .allowCloseWithResult('cancel')
                    .showAndWaitResult() !== 'ok') return;
                try {
                    await api.delete({
                        path: 'tracks/' + track.id
                    });
                } catch (error) {
                    Toast.show(I`Failed to remove track.` + '\n' + error);
                    return;
                }
                api.onTrackDeleted.invoke(track);
            } else {
                console.error('Unexpected track._upload.state', track._upload.state);
                return;
            }
        }
    }(this);
    private insertTrack(t: UploadTrack, pos = 0) {
        this.tracks.splice(pos, 0, t);
        if (this.view.rendered) this.view.addItem(t, pos);
    }
    remove(track: UploadTrack) {
        var pos = this.tracks.indexOf(track);
        if (pos === -1) return;
        this.tracks.splice(pos, 1);
        track._upload.view?.remove();
    }
    async fetchImpl() {
        this.state = 'waiting';
        var li = new LoadingIndicator();
        li.content = I`Logging in`;
        this.view.useLoadingIndicator(li);
        try {
            await user.waitLogin(true);
            this.state = 'fetching';
            li.reset();
            var fetched = ((await api.get('my/uploads'))['tracks'] as any[])
                .map(t => {
                    t._upload = { state: 'done' };
                    return new UploadTrack(t);
                });
            this.state = 'fetched';
        } catch (error) {
            li.error(error, () => this.fetchImpl());
            return;
        }
        const thiz = this;
        var doneTracks = this.tracks.filter(t => t._upload.state === 'done');
        const firstPos = doneTracks.length ? this.tracks.indexOf(doneTracks[0]) : 0;
        new class extends DataUpdatingHelper<UploadTrack, UploadTrack>{
            items = doneTracks;
            addItem(data: UploadTrack, pos: number) { thiz.insertTrack(data, firstPos); }
            updateItem(item: UploadTrack, data: UploadTrack) { item.updateFromApiTrack(data); }
            removeItem(item: UploadTrack) { item._upload.view?.remove(); }
        }().update(fetched);
        this.view.useLoadingIndicator(null);
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
        this.insertTrack(track);

        await this.uploadSemaphore.enter();
        try {
            if (track._upload.state === 'cancelled') return;

            track._upload.state = 'uploading';
            track._upload.view?.updateDom();

            var jsonBlob = new Blob([JSON.stringify(apitrack)]);
            var finalBlob = new Blob([
                BlockFormat.encodeBlock(jsonBlob),
                BlockFormat.encodeBlock(file)
            ]);
            var resp = await api.post({
                path: 'tracks/newfile',
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
        if (this.view.rendered) this.view.updateUsage();
    }
};


class UploadViewItem extends TrackViewItem {
    track: UploadTrack;
    // noPos = true;
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
                ev.stopPropagation();
                ev.dataTransfer.dropEffect = 'copy';
            }
        });
        this.dom.addEventListener('drop', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
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