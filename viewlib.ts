// file: viewlib.ts

type ViewArg = View | HTMLElement;

class View {
    constructor(dom?: BuildDomExpr) {
        if (dom) this._dom = utils.buildDOM(dom) as HTMLElement;
    }
    protected _dom: HTMLElement;
    public get dom() {
        return this._dom = this._dom || utils.buildDOM(this.createDom()) as HTMLElement;
    }
    public ensureDom() {
        return this.dom;
    }
    protected createDom(): BuildDomExpr {
        return document.createElement('div');
    }
    toggleClass(clsName: string, force?: boolean) {
        utils.toggleClass(this.dom, clsName, force);
    }
    static getDOM(view: HTMLElement | View): HTMLElement {
        if (!view) throw new Error('view is undefined or null');
        if (view instanceof View) return view.dom;
        if (view instanceof HTMLElement) return view;
        console.error('getDOM(): unknown type: ', view);
        throw new Error('Cannot get DOM: unknown type');
    }
}

abstract class ListViewItem extends View {
}

class ListView<T extends ListViewItem> extends View {
    items: T[];
    onItemClicked: (item: T) => void;
    constructor(container?: BuildDomExpr) {
        super(container);
        this.items = [];
    }
    add(item: T) {
        item.dom.addEventListener('click', () => {
            if (this.onItemClicked) this.onItemClicked(item);
        });
        this.dom.appendChild(item.dom);
        this.items.push(item);
    }
    clear() {
        utils.clearChilds(this.dom);
        this.items = [];
    }
    get(idx: number) {
        return this.items[idx];
    }
    ReplaceChild(dom: ViewArg) {
        this.clear();
        this.dom.appendChild(View.getDOM(dom));
    }
}

type SectionActionOptions = { text: string, onclick: Action; };

class Section extends View {
    titleDom: HTMLSpanElement;
    constructor(arg?: { title?: string, content?: ViewArg, actions?: SectionActionOptions[]; }) {
        super();
        this.ensureDom();
        if (arg) {
            if (arg.title) this.setTitle(arg.title);
            if (arg.content) this.setContent(arg.content);
            if (arg.actions) arg.actions.forEach(x => this.addAction(x));
        }
    }
    createDom() {
        var DOM = utils.buildDOM;
        return DOM({
            tag: 'div.section',
            child: [
                {
                    tag: 'div.section-header',
                    child: [
                        this.titleDom = DOM({ tag: 'span.section-title' }) as HTMLSpanElement
                    ]
                }
                // content element(s) here
            ]
        }) as HTMLElement;
    }
    setTitle(text: string) {
        this.titleDom.textContent = text;
    }
    setContent(view: ViewArg) {
        var dom = this.dom;
        var firstChild = dom.firstChild;
        while (dom.lastChild !== firstChild) dom.removeChild(dom.lastChild);
        dom.appendChild(View.getDOM(view));
    }
    addAction(arg: SectionActionOptions) {
        this.titleDom.parentElement.appendChild(utils.buildDOM({
            tag: 'div.section-action.clickable',
            textContent: arg.text,
            onclick: arg.onclick
        }));
    }
}

type LoadingIndicatorState = 'normal' | 'running' | 'error';

class LoadingIndicator extends View {
    constructor(arg?: { status?: LoadingIndicatorState, content?: string, onclick?: Action<MouseEvent>; }) {
        super();
        if (arg) {
            if (arg.status) this.status = arg.status;
            if (arg.content) this.content = arg.content;
            if (arg.onclick) this.onclick = arg.onclick;
        }
    }
    private _status: LoadingIndicatorState = 'running';
    get status() { return this._status; }
    set status(val: LoadingIndicatorState) {
        this._status = val;
        this.toggleClass('running', val == 'running');
        this.toggleClass('error', val == 'error');
    }
    private _text: string;
    get content() { return this._text; }
    set content(val: string) { this._text = val; this.dom.textContent = val; }
    onclick: (e: MouseEvent) => void;
    reset() {
        this.status = 'running';
        this.content = 'Loading...';
    }
    createDom() {
        this._dom = utils.buildDOM({
            tag: 'div.loading-indicator',
            onclick: (e) => this.onclick && this.onclick(e)
        }) as HTMLElement;
        this.reset();
        return this._dom;
    }
}

// TODO: class ContextMenu
