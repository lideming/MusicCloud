import { buildDOM } from "@yuuza/webfx";
import { UserStoreItem } from "../API/UserStore";
import { userStore } from "../main";

export interface PluginInfo {
  name: string;
  description: string;
  website: string;
  version: string;
}

interface PluginListItem {
  url: string;
  name: string;
  description: string;
  enabled: boolean;
}

export const plugins = new class Plugins {
  userPluginList = new UserStoreItem({
    value: { plugins: [] as PluginListItem[] },
    revision: 0,
  });
  loadedPlugin = new Map<string, PluginInfo>();

  init() {
    this.loadUserPlguins();
  }

  async loadUserPlguins() {
    await this.userPluginList.fetch();
    for (const plugin of this.userPluginList.value.plugins) {
      this.loadPlugin(plugin.url);
    }
  }

  async addUserPlugin(url: string) {
    const info = await this.loadPlugin(url);
    this.userPluginList.value.plugins.push({
      name: info.name,
      url,
      description: info.description,
      enabled: true,
    });
    await this.userPluginList.put();
  }

  async loadPlugin(url: string) {
    if (url.startsWith("user-store:")) {
      return await this.loadPluginFromUserStore(
        url.substring("user-store:".length),
      );
    } else {
      return await this.loadPluginFromURL(url);
    }
  }

  private _loadId = 0;
  private _currentRegisterCallback: null | ((info: PluginInfo) => void) = null;
  private _urlLoadCallbacks = {};

  // Load "https://" script
  async loadPluginFromURL(url: string) {
    const id = ++this._loadId;

    let afterLoadResolve;
    let afterLoadReject;
    const afterLoadPromise = new Promise((res, rej) => {
      afterLoadResolve = res;
      afterLoadReject = rej;
    });

    let info: PluginInfo = null!;

    this._urlLoadCallbacks[id] = {
      before: () => {
        this._currentRegisterCallback = (_info) => {
          info = _info;
        };
      },
      after: () => {
        this._currentRegisterCallback = null;
        delete this._urlLoadCallbacks[id];
        afterLoadResolve();
      },
    };

    [
      buildDOM({
        tag: "script",
        text: `mcloud.plugins._urlLoadCallbacks[${id}].before()`,
      }),
      buildDOM({
        tag: "script",
        src: url,
        onerror: (error) => {
          console.error("loading plugin script", error);
          afterLoadReject(error);
        },
      }),
      buildDOM({
        tag: "script",
        text: `mcloud.plugins._urlLoadCallbacks[${id}].after()`,
      }),
    ].forEach((dom) => document.head.appendChild(dom));

    await afterLoadPromise;

    this._afterPluginLoad(url, info);

    return info;
  }

  // Load "user-store:" script
  async loadPluginFromUserStore(key: string) {
    const keyValue = await userStore.get(key, "text");
    if (!keyValue) throw new Error("userStore key not found: " + key);

    // It might be running between "before"/"plugin"/"after" scripts,
    // so we save the current callback and restore it later.
    const oldCallback = this._currentRegisterCallback;

    let info: PluginInfo = null!;
    this._currentRegisterCallback = (_info) => {
      info = _info;
    };

    try {
      (0, eval)(keyValue.value);
    } finally {
      this._currentRegisterCallback = oldCallback;
    }

    this._afterPluginLoad("user-store:" + key, info);

    return info;
  }

  private _afterPluginLoad(url: string, info: PluginInfo | null) {
    if (!info) {
      throw new Error("registerPlugin is not called.");
    }
    console.info(`Plugin loaded (${info.name} ${info.version}) from ${url}`);
    this.loadedPlugin.set(url, info);
  }

  /** Plugin must call this method when it is running. */
  registerPlugin(info: PluginInfo) {
    if (!this._currentRegisterCallback) {
      throw new Error(
        "Currently no plugin loading task (registerPlugin must be" +
          " call during the script execution, usually in top level).",
      );
    }
    this._currentRegisterCallback(info);
    this._currentRegisterCallback = null;
  }
}();
