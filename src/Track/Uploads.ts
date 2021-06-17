// file: Uploads.ts

import { TrackList, TrackListView, TrackViewItem } from "./TrackList";
import { Track } from "./Track";
import { Semaphore, DataUpdatingHelper, CancelToken } from "../Infra/utils";
import { ListIndexViewItem } from "./ListIndex";
import { user } from "../API/User";
import { Api } from "../API/apidef";
import { LoadingIndicator, View, Toast, MessageBox, TextView, LazyListView, Ref, buildDOM, formatFileSize, objectApply } from "../Infra/viewlib";
import { router } from "../Infra/Router";
import { I, i18n } from "../I18n/I18n";
import { playerCore } from "../Player/PlayerCore";
import { ui } from "../Infra/UI";
import { api } from "../API/Api";
import { ContentHeader } from "../Infra/ui-views";


class UploadTrack extends Track {
    constructor(init: Partial<UploadTrack>) {
        super(init);
        this._bind = {
            list: uploads
        };
    }
    get canEdit() { return this._upload.state === 'done'; }
    setState(state: UploadTrack['_upload']['state']) {
        this._upload.state = state;
        this._upload.view?.updateDom();
    }
    _upload: {
        view?: UploadViewItem;
        progress?: number;
        state: 'pending' | 'uploading' | 'processing' | 'error' | 'done' | 'cancelled';
        // With prefix "uploads_", these are i18n keys 

        file?: File;
        cancelToken?: CancelToken;
    };
}

export const uploads = new class extends TrackList {
    tracks: UploadTrack[] = [];
    state: false | 'waiting' | 'fetching' | 'fetched' = false;
    get canEdit() { return false; }
    inprogress = 0;
    unreadError = false;
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
        user.onSwitchedUser.add(() => {
            this.sidebarItem.hidden = user.state != 'logged';
        })();
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
        listView: LazyListView<UploadViewItem>;
        usage = new TextView({ tag: 'span.uploads-usage' });

        protected appendHeader() {
            this.title = I`My Uploads`;
            super.appendHeader();
            this.uploadArea = new UploadArea({ onfile: (file) => uploads.uploadFile(file) });
            this.header.appendView(this.uploadArea);

            this.trackActionHandler.canRemove = () => true;
            this.trackActionHandler.onTrackRemove = (items: UploadViewItem[]) => {
                if (items.length === 1) {
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
            header.titlebar.appendView(this.usage);
            return header;
        }
        onShow() {
            super.onShow();
            if (uploads.unreadError) {
                uploads.unreadError = false;
                uploads.updateSidebarItem();
            }
        }
        protected appendListView() {
            super.appendListView();
            if (!uploads.state) uploads.fetch();
        }
        updateUsage() {
            var original = 0;
            var converted = 0;
            uploads.tracks.forEach(x => {
                x.files?.forEach(f => {
                    if (!f.profile)
                        original += f.size ?? 0;
                    else
                        converted += f.size ?? 0;
                });
            });
            this.usage.text = original ? `(${formatFileSize(original)} + ${formatFileSize(converted)})` : '';
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
            if (track._upload.state === 'uploading' || track._upload.state === 'pending') {
                track._upload.state = 'cancelled';
                track._upload.cancelToken!.cancel();
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
                console.error('[Uploads] Unexpected track._upload.state', track._upload.state);
                return;
            }
        }
    }(this);
    private insertTrack(t: UploadTrack, pos = 0, updateview?: boolean) {
        this.tracks.splice(pos, 0, t);
        if (this.view.rendered) this.view.addItem(t, pos, updateview);
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
                    return new UploadTrack({
                        infoObj: t,
                        _upload: { state: 'done' }
                    });
                });
            this.state = 'fetched';
        } catch (error) {
            li.error(error, () => this.fetchImpl());
            return;
        }
        const thiz = this;
        var doneTracks = this.tracks.filter(t => t._upload.state === 'done');
        var firstPos = this.tracks.findIndex(t => t._upload.state !== 'done') + 1;
        new class extends DataUpdatingHelper<UploadTrack, UploadTrack>{
            items = doneTracks;
            addItem(data: UploadTrack, pos: number) { thiz.insertTrack(data, firstPos, false); }
            updateItem(item: UploadTrack, data: UploadTrack) { item.updateFromApiTrack(data.infoObj!); }
            removeItem(item: UploadTrack) { item._upload.view?.remove(); }
        }().update(fetched);
        this.view.useLoadingIndicator(null);
        this.view.updateView();
    }
    async uploadFile(file: File) {
        var apitrack: Api.Track = {
            id: undefined!, url: undefined!,
            artist: 'Unknown', name: file.name
        };
        var track = new UploadTrack({
            infoObj: apitrack,
            blob: file,
            _upload: {
                state: 'pending',
                cancelToken: new CancelToken()
            }
        });
        this.insertTrack(track);

        this.inprogress++;
        this.updateSidebarItem();

        await this.uploadSemaphore.enter();
        try {
            if (track._upload.state === 'cancelled') return null;

            await this.uploadCore(apitrack, track, file);
        } catch (err) {
            if (track._upload.state === 'cancelled') return null;
            track.setState('error');
            Toast.show(I`Failed to upload file "${file.name}".` + '\n' + err, 3000);
            console.warn('[Uploads] uploads failed: ', file.name, err);
            if (uploads.view.isVisible == false) {
                this.unreadError = true;
                // will update sidebarItem later
            }
            throw err;
        } finally {
            this.inprogress--;
            this.updateSidebarItem();
            this.uploadSemaphore.exit();
        }
        if (this.view.rendered) this.view.updateUsage();
        return track;
    }

    private async uploadCore(apitrack: Api.Track, track: UploadTrack, file: File) {
        track.setState('uploading');

        const ct = track._upload.cancelToken!;

        const uploadReq = await api.post({
            path: 'tracks/uploadrequest',
            obj: {
                filename: file.name,
                size: file.size
            } as Api.UploadRequest
        }) as Api.UploadParameters;

        ct.throwIfCancelled();

        var respTrack: Api.Track;

        var onprogerss = (ev) => {
            if (ev.lengthComputable) {
                track._upload.progress = ev.loaded / ev.total;
                track._upload.view?.updateDom();
            }
        };

        if (uploadReq.mode === 'direct') {
            const jsonBlob = new Blob([JSON.stringify(apitrack)]);
            const finalBlob = new Blob([
                BlockFormat.encodeBlock(jsonBlob),
                BlockFormat.encodeBlock(file)
            ]);
            const xhr = await api.upload({
                method: 'POST',
                url: 'tracks/newfile',
                body: finalBlob,
                auth: api.defaultAuth!,
                contentType: 'application/x-mcloud-upload',
                cancelToken: ct,
                onprogerss
            }).complete;
            ct.throwIfCancelled();
            respTrack = JSON.parse(xhr.responseText);
        } else if (uploadReq.mode === 'put-url') {
            console.info('[Uploads] uploading to url', uploadReq);

            const xhr = await api.upload({
                method: uploadReq.method,
                url: uploadReq.url,
                body: file,
                cancelToken: ct,
                onprogerss
            }).complete;

            console.info('[Uploads] posting result to api');
            track.setState('processing');
            respTrack = await api.post({
                path: 'tracks/uploadresult',
                obj: {
                    url: uploadReq.url,
                    filename: file.name,
                    tag: uploadReq.tag
                } as Api.UploadResult
            }) as Api.Track;
            ct.throwIfCancelled();
        } else {
            throw new Error("Unknown upload mode");
        }
        track.infoObj = respTrack;
        track.setState('done');
    }

    updateSidebarItem() {
        this.sidebarItem.text = this.inprogress ? I`My Uploads` + ` (${this.inprogress})` : I`My Uploads`;
        if (this.unreadError) this.sidebarItem.text += ' (!!)';
        this.sidebarItem.updateDom();
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
        this.dom.appendChild(this.domstate = buildDOM<HTMLElement>({ tag: 'span.uploads-state' }));
    }
    updateDom() {
        super.updateDom();
        var newState = this.track._upload.state;
        if (this._lastUploadState != newState) {
            if (this._lastUploadState) this.dom.classList.remove('state-' + this._lastUploadState);
            if (newState) this.dom.classList.add('state-' + newState);
            if (this.track._upload.state === 'uploading' && this.track._upload.progress !== undefined) {
                this.domstate.textContent = (this.track._upload.progress * 100).toFixed(0) + '%';
            } else {
                this.domstate.textContent = i18n.get('uploads_' + newState);
            }
            this.dragging = newState === 'done';
        }
    }
}

class UploadArea extends View {
    onfile: (file: File) => void;
    private domfile = new Ref<HTMLInputElement>();
    constructor(init: Partial<UploadArea>) {
        super();
        objectApply(this, init);
    }
    createDom() {
        return {
            tag: 'div.upload-area.clickable',
            tabIndex: 0,
            child: [
                { tag: 'div.text.no-selection', text: I`Click here to select files to upload` },
                { tag: 'div.text.no-selection', text: I`or drag files to this zone...` },
                {
                    tag: 'input', type: 'file', ref: this.domfile,
                    style: 'visibility: collapse; height: 0;',
                    accept: 'audio/*', multiple: true
                },
            ]
        };
    }
    postCreateDom() {
        this.domfile.value!.addEventListener('change', (ev) => {
            if (this.domfile.value!.files)
                this.handleFiles(this.domfile.value!.files);
        });
        this.onActive.add((ev) => {
            this.domfile.value!.click();
        });
        this.dom.addEventListener('dragover', (ev) => {
            if (!ev.dataTransfer) return;
            if (ev.dataTransfer.types.indexOf('Files') >= 0) {
                ev.preventDefault();
                ev.stopPropagation();
                ev.dataTransfer.dropEffect = 'copy';
            }
        });
        this.dom.addEventListener('drop', (ev) => {
            if (!ev.dataTransfer) return;
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
            console.log('[Uploads] drop file', { name: file.name, size: file.size });
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
