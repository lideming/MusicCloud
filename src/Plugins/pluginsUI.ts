import {
  BuildDomExpr,
  ButtonView,
  Callbacks,
  Dialog,
  I,
  ListView,
  ListViewItem,
} from "@yuuza/webfx";
import { PluginListItem, plugins } from "./plugins";

export class PluginsUI extends Dialog {
  title = I`Plugins`;

  pluginListView = new ListView({ tag: "div.plugin-list" });
  constructor() {
    super();
    this.width = "500px";
    this.addContent(this.pluginListView);
    this.fetchList();
  }

  fetchList = () => {
    plugins.getUserPlugins().then((list) => {
      const loadedPlugins = plugins.getLoadedPlugins();
      this.pluginListView.removeAll();
      for (const plugin of list) {
        const item = new PluginListViewItem();
        item.data = { ...plugin, loaded: loadedPlugins.has(plugin.url) };
        item.onChange.add(this.fetchList);
        this.pluginListView.add(item);
      }
    });
  };
}

export class PluginListViewItem extends ListViewItem {
  data: PluginListItem & { loaded: boolean };
  onChange = new Callbacks();
  createDom(): BuildDomExpr {
    return {
      tag: "div.plugin-item",
      child: [
        new ButtonView({
          text: () => this.data.enabled ? I`Disable` : I`Enable`,
          type: "inline",
          onActive: () => {
            const toEnable = !this.data.enabled;
            plugins.toggleUserPlugin(this.data.url, toEnable)
              .then(() => this.onChange.invoke());
          },
        }),
        new ButtonView({
          text: () => I`Remove`,
          type: "inline",
          onActive: () => {
            plugins.removeUserPlugin(this.data.url)
              .then(() => this.onChange.invoke());
          },
        }),
        {
          tag: "div.plugin-status",
          text: () =>
            [
              this.data.enabled ? I`enabled` : I`disabled`,
              this.data.loaded && I`loaded`,
            ].filter((x) => x).join(", "),
        },
        { tag: "div.plugin-name", text: () => this.data.name },
        { tag: "div.plugin-description", text: () => this.data.description },
        { tag: "div.plugin-url", text: () => this.data.url },
      ],
    };
  }
}
