import {
  Action,
  BuildDomExpr,
  ButtonView,
  Callbacks,
  Dialog,
  I,
  InputView,
  ListView,
  ListViewItem,
  MessageBox,
  TextBtn,
} from "@yuuza/webfx";
import { PluginListItem, plugins } from "./plugins";
import { UserStoreItem } from "../API/UserStore";

export class PluginsUI extends Dialog {
  pluginListView = new ListView({ tag: "div.plugin-list" });

  constructor() {
    super();
    this.title = I`Plugins`;
    this.width = "500px";

    const addUrl = new ButtonView({
      text: I`Add plugin by URL`,
      onActive: (ev) => {
        const dialog = new AddByUrlDialog();
        dialog.onSubmit.add(this.fetchList);
        dialog.show(ev);
      },
    });
    const addCode = new ButtonView({
      text: I`Add plugin by code`,
      onActive: (ev) => {
        const dialog = new PluginCodeDialog("add");
        dialog.onSubmit.add(this.fetchList);
        dialog.show(ev);
      },
    });
    this.addContent({
      tag: "div.add-plugins",
      child: [
        addUrl,
        addCode,
      ],
    });

    this.addContent(this.pluginListView);
    this.fetchList();
  }

  private _firstFetch = true;

  fetchList = () => {
    plugins.getUserPlugins().then((list) => {
      // Move enabled plugins to the top, but prevent moving them after changing
      // the plugin state from the UI here.
      if (this._firstFetch) {
        this._firstFetch = false;
        // NOTE: it changes the internal array in `plugins.userPluginList`
        // intentionally, because we want to keep this sort when putting the
        // plugin list.
        list.sort((a, b) => +b.enabled - +a.enabled);
      }
      const loadedPlugins = plugins.getLoadedPlugins();
      this.pluginListView.removeAll();
      for (const plugin of list) {
        const item = new PluginListViewItem();
        const loadedInfo = loadedPlugins.get(plugin.url);
        item.data = { ...plugin, loaded: !!loadedInfo, settings: loadedInfo?.settings };
        item.onChange.add(this.fetchList);
        this.pluginListView.add(item);
      }
    });
  };
}

class AddByUrlDialog extends Dialog {
  onSubmit = new Callbacks();

  constructor() {
    super();
    this.title = I`Add plugin by URL`;
    this.width = "600px";
    const urlInput = new InputView({ placeholder: I`Plugin URL` });
    const btn = new TextBtn({
      text: I`Add`,
      right: true,
      onActive: async () => {
        if (urlInput.value) {
          btn.updateWith({ clickable: false });
          await plugins.addUserPlugin(urlInput.value);
          this.onSubmit.invoke();
          this.close();
        }
      },
    });
    this.addBtn(btn);
    this.addContent(urlInput);
  }
}

class PluginCodeDialog extends Dialog {
  onSubmit = new Callbacks();

  constructor(mode: "add" | "edit", storeItem?: UserStoreItem<string>) {
    super();
    if (mode === "add") {
      this.title = I`Add plugin by code`;
    } else {
      this.title = I`Edit plugin code`;
    }
    this.width = "600px";
    const defaultCode = `(function (mcloud) {
  mcloud.plugins.registerPlugin({
    name: "Hello World",
    description: "Example Plugin",
    version: "1.0.0",
    website: "https://github.com/lideming/MusicCloud-example-plugins",
  });

  mcloud.Toast.show("Hello World plugin is running", 3000);
})(mcloud);
`;
    const codeInput = new InputView({
      multiline: true,
      value: storeItem?.value ?? defaultCode,
    });
    codeInput.dom.style.height = "500px";
    const btn = new TextBtn({
      text: mode === "add" ? I`Add` : I`Save`,
      right: true,
      onActive: async () => {
        if (codeInput.value) {
          btn.updateWith({ clickable: false });
          if (mode === "add") {
            await plugins.addPluginCode(codeInput.value);
          } else {
            storeItem!.value = codeInput.value;
            await storeItem!.put();
          }
          this.onSubmit.invoke();
          this.close();
        }
      },
    });
    this.addBtn(btn);
    this.addContent(codeInput);
  }
}

export class PluginListViewItem extends ListViewItem {
  data: PluginListItem & { loaded: boolean, settings?: Action };
  onChange = new Callbacks();

  createDom(): BuildDomExpr {
    const { type, key } = plugins.parsePluginURL(this.data.url);
    return {
      tag: "div.plugin-item",
      child: [
        {
          tag: "div.plugin-status",
          update: (dom) => {
            dom.style.color = this.data.loaded || this.data.enabled
              ? ""
              : "var(--color-text-gray)";
          },
          text: () => 
            !this.data.enabled ? I`disabled` :
            this.data.loaded ? I`loaded` :
            I`enabled`,
        },
        new ButtonView({
          text: () => (this.data.enabled ? I`Disable` : I`Enable`),
          type: "inline",
          onActive: () => {
            const toEnable = !this.data.enabled;
            plugins
              .toggleUserPlugin(this.data.url, toEnable)
              .then(() => this.onChange.invoke());
          },
        }),
        this.data.settings && new ButtonView({
          text: () => I`Settings`,
          type: "inline",
          onActive: () => {
            this.data.settings!();
          },
        }),
        type === "user-store" && new ButtonView({
          text: () => I`Edit`,
          type: "inline",
          onActive: async (ev) => {
            const item = plugins.getPluginCodeItem(key);
            await item.get();
            const dialog = new PluginCodeDialog("edit", item);
            dialog.onSubmit.add(() => this.onChange.invoke());
            dialog.show(ev);
          },
        }),
        new ButtonView({
          text: () => I`Remove`,
          type: "inline",
          onActive: () => {
            new MessageBox()
              .setTitle(I`Warning`)
              .addText(
                I`Are you sure to remove plugin "${this.data.name}"?`,
              )
              .addResultBtns(["cancel", "ok"])
              .allowCloseWithResult("cancel")
              .showAndWaitResult()
              .then((r) => {
                if (r !== "ok") return;
                plugins
                  .removeUserPlugin(this.data.url)
                  .then(() => this.onChange.invoke());
              });
          },
        }),
        { tag: "div.plugin-name", text: () => this.data.name },
        { tag: "div.plugin-description", text: () => this.data.description },
        { tag: "div.plugin-url", text: () => this.data.url },
      ].filter(Boolean),
    };
  }
}
