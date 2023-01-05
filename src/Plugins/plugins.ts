import { buildDOM, Semaphore } from "@yuuza/webfx";
import { UserStoreItem } from "../API/UserStore";
import { user, userStore } from "../main";

export interface PluginInfo {
  name: string;
  description: string;
  website: string;
  version: string;
}

export interface PluginListItem {
  url: string;
  name: string;
  description: string;
  enabled: boolean;
}

export const plugins = new class Plugins {
  private userPluginList = new UserStoreItem({
    key: "plugins",
    value: { plugins: [] as PluginListItem[] },
    revision: 0,
  });
  private loadedPlugin = new Map<string, PluginInfo>();

  init() {
    user.waitLogin().then(() => {
      this.loadUserPlguins();
    });
  }

  async getUserPlugins() {
    return (await this.userPluginList.get()).plugins;
  }

  getLoadedPlugins() {
    return this.loadedPlugin;
  }

  async loadUserPlguins() {
    for (const plugin of await this.getUserPlugins()) {
      if (plugin.enabled) {
        this.loadPlugin(plugin.url);
      }
    }
  }

  async addUserPlugin(url: string) {
    const info = await this.loadPlugin(url);
    await this.userPluginList.concurrencyAwareUpdate((value) => {
      return {
        ...value,
        plugins: [...value.plugins, {
          name: info.name,
          url,
          description: info.description,
          enabled: true,
        }],
      };
    });
  }

  async removeUserPlugin(url: string) {
    await this.userPluginList.concurrencyAwareUpdate((value) => {
      return {
        ...value,
        plugins: value.plugins.filter((x) => x.url != url),
      };
    });
  }

  async toggleUserPlugin(url: string, enabled: boolean) {
    await this.userPluginList.concurrencyAwareUpdate((value) => {
      return {
        ...value,
        plugins: value.plugins.map((x) => x.url == url ? { ...x, enabled } : x),
      };
    });
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

  private _currentRegisterCallback: null | ((info: PluginInfo) => void) = null;
  private _loadingLock = new Semaphore({ maxCount: 1 });

  // Load "https://" script
  async loadPluginFromURL(url: string) {
    // Prefetch the script before waiting for the lock
    try {
      await fetch(url);
    } catch (error) {
      // Network/CORS error
    }

    await this._loadingLock.enter();

    let info: PluginInfo = null!;
    this._currentRegisterCallback = (_info) => {
      info = _info;
    };

    try {
      let afterLoadResolve;
      let afterLoadReject;
      const afterLoadPromise = new Promise((res, rej) => {
        afterLoadResolve = res;
        afterLoadReject = rej;
      });

      document.body.appendChild(buildDOM({
        tag: "script",
        src: url,
        onerror: (error) => {
          console.error("loading plugin script", error);
          afterLoadReject(error);
        },
        onload: () => {
          afterLoadResolve();
        },
      }));

      await afterLoadPromise;
    } finally {
      this._currentRegisterCallback = null;
      this._loadingLock.exit();
    }

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
