// file: uploads.ts

interface UploadTrack extends Track {
    _upload: {
        view?: UploadViewItem;
        state: 'pending' | 'uploading' | 'error' | 'done';
    };
}

var uploads = new class {
    tracks: UploadTrack[] = [];
    state: false | 'fetching' | 'fetched' = false;
    init() {
        ui.sidebarList.container.insertBefore(this.sidebarItem.dom, ui.sidebarList.container.firstChild);
    }
    sidebarItem = new class extends ListViewItem {
        protected createDom(): BuildDomExpr {
            return {
                tag: 'div.item.no-selection',
                textContent: I`My Uploads`,
                onclick: (ev) => {
                    ui.sidebarList.setActive(uploads.sidebarItem);
                    ui.content.setCurrent(uploads.view);
                }
            };
        }
    };
    view = new class implements ContentView {
        dom: HTMLElement;
        header: ContentHeader;
        uploadArea: UploadArea;
        listView: ListView<UploadViewItem>;
        loadingIndicator: LoadingIndicator;
        emptyIndicator: LoadingIndicator;
        get rendered() { return !!this.listView; }
        ensureDom() {
            if (!this.dom) {
                this.listView = new ListView({ tag: 'div.tracklist' });
                this.dom = this.listView.dom;
                this.header = new ContentHeader({ title: I`My Uploads` });
                this.dom.appendView(this.header);
                this.uploadArea = new UploadArea({ onfile: (file) => uploads.uploadFile(file) });
                this.dom.appendView(this.uploadArea);
                if (!uploads.state) uploads.fetch();
            }
        }
        onShow() {
            this.ensureDom();
        }
        onRemove() {
        }
        useLoadingIndicator(li: LoadingIndicator) {
            if (this.loadingIndicator && this.rendered) this.loadingIndicator.dom.remove();
            if (li && this.rendered) {
                this.dom.insertBefore(li.dom, this.uploadArea.dom.nextSibling);
            }
            this.loadingIndicator = li;
            // if (this.rendered) this.updateView();
        }
        addTrack(t: UploadTrack, pos?: number) {
            var lvi = new UploadViewItem(t);
            lvi.dragging = true;
            this.listView.add(lvi, pos);
            this.updateView();
        }
        updateView() {
            if (this.listView.length == 0) {
                if (!this.loadingIndicator) {
                    this.emptyIndicator = this.emptyIndicator || new LoadingIndicator({ state: 'normal', content: I`(Empty)` });
                    this.useLoadingIndicator(this.emptyIndicator);
                }
            } else {
                if (this.emptyIndicator && this.loadingIndicator == this.emptyIndicator) {
                    this.useLoadingIndicator(null);
                }
            }
        }
    };
    private prependTrack(track: UploadTrack) {
        this.tracks.unshift(track);
        if (this.view.rendered) {
            this.view.addTrack(track, 0);
        }
    }
    async fetch() {
        this.state = 'fetching';
        var li = new LoadingIndicator();
        this.view.useLoadingIndicator(li);
        this.tracks = (await api.getJson('my/uploads'))['tracks'];
        this.tracks.reverse();
        this.tracks.forEach(t => {
            t._upload = { state: 'done' };
        });
        this.state = 'fetched';
        this.view.useLoadingIndicator(null);
        this.view.updateView();
        if (this.view.rendered) this.tracks.forEach(t => this.view.addTrack(t));
    }
    async uploadFile(file: File) {
        var apitrack: Api.Track = {
            id: undefined, url: undefined,
            artist: 'Unknown', name: file.name
        };
        var track: UploadTrack = {
            ...apitrack,
            _upload: {
                state: 'uploading'
            }
        };
        this.prependTrack(track);
        var jsonBlob = new Blob([JSON.stringify(apitrack)]);
        var finalBlob = new Blob([
            BlockFormat.encodeBlock(jsonBlob),
            BlockFormat.encodeBlock(file)
        ]);
        var resp = await api.postJson({
            path: 'tracks/newfile',
            method: 'POST',
            mode: 'raw',
            obj: finalBlob
        });
        track._upload.state = 'done';
        track._upload.view?.updateDom();
    }
};


class UploadViewItem extends TrackViewItem {
    track: UploadTrack;
    domstate: HTMLElement;
    constructor(track: UploadTrack) {
        super(track);
        track._upload.view = this;
    }
    postCreateDom() {
        this.dom.classList.add('uploads-item');
        this.dom.appendChild(this.domstate = utils.buildDOM<HTMLElement>({ tag: 'span.uploads-state' }));
    }
    updateDom() {
        super.updateDom();
        this.domstate.textContent = this.track._upload.state;
    }
}

class UploadArea extends View {
    onfile: (file: File) => void;
    constructor(init: Partial<UploadArea>) {
        super();
        utils.objectApply(this, init);
    }
    createDom() {
        return {
            tag: 'div.upload-area',
            child: [
                { tag: 'div.text.no-selection', textContent: I`Drag files to this zone...` }
            ]
        };
    }
    postCreateDom() {
        this.dom.addEventListener('dragover', (ev) => {
            if (ev.dataTransfer.types.indexOf('Files') >= 0) {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'copy';
            }
        });
        this.dom.addEventListener('drop', (ev) => {
            ev.preventDefault();
            if (ev.dataTransfer.types.indexOf('Files') >= 0) {
                var files = ev.dataTransfer.files;
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    console.log('drop file', { name: file.name, size: file.size });
                    this.onfile?.(file);
                }
            }
        });
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