// file: uploads.ts

var uploads = new class {
    sidebarItem = new class extends ListViewItem {
        protected createDom(): BuildDomExpr {
            return {
                tag: 'div.item.no-selection',
                textContent: I`My Uploads`,
                onclick: (ev) => {
                    ui.sidebarList.setActive(uploads.sidebarItem);
                }
            };
        }
    };
    init() {
        ui.sidebarList.container.insertBefore(this.sidebarItem.dom, ui.sidebarList.container.firstChild);
    }
};