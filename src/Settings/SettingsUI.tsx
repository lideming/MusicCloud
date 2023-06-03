import { ButtonView, Dialog, LabeledInput, View } from "../Infra/viewlib";
import { I, i18n, IA } from "../I18n/I18n";
import { ui } from "../Infra/UI";
import { playerCore } from "../Player/PlayerCore";
import { jsx } from "../Infra/utils";
import { appVersion } from "./AppVersion";
import buildInfo from "./buildInfo";
import { playerFX } from "../Player/PlayerFX";
import {
  Action,
  BuildDomExpr,
  Callbacks,
  ContainerView,
  ItemActiveHelper,
  TextBtn,
  TextView,
} from "@yuuza/webfx";
import { settings } from "./Settings";
import { api } from "../API/Api";
import { PluginsUI } from "../Plugins/pluginsUI";

export const settingsUI = new (class {
  dialog: SettingsDialog;
  openUI(ev?: MouseEvent) {
    if (!this.dialog) this.dialog = new SettingsDialog();
    this.dialog.center();
    this.dialog.show(ev);
  }
})();

const themes = ["light", "dark"];
const styles = ["", "-rounded"];
const bitrates = [128, 256, 0];

function getThemeAndStyle() {
  let [theme, style] = ui.theme.current.split("-");
  style = style ? "-" + style : "";
  return { theme, style };
}

function setThemeAndStyle(options: { theme?: string; style?: string }) {
  const current = getThemeAndStyle();
  const theme = options.theme ?? current.theme;
  const style = options.style ?? current.style;
  ui.theme.set(`${theme}${style}` as any);
}

class RadioContainer extends ContainerView<RadioOption> {
  currentValue: any = null;
  currentActive = new ItemActiveHelper<RadioOption>({
    funcSetActive: (item, val) => {
      if (val) item.select();
      else item.unselect();
    },
  });
  onCurrentChange = new Callbacks<Action<RadioOption>>();
  setCurrent(current: RadioOption) {
    this.currentActive.set(current);
    this.onCurrentChange.invoke(current);
  }
  protected createDom(): BuildDomExpr {
    return <div class="radio-container" tabIndex="0"></div>;
  }
  protected postCreateDom(): void {
    super.postCreateDom();
    this.dom.addEventListener("keydown", (ev) => {
      if (ev.code === "ArrowLeft" || ev.code === "ArrowRight") {
        const next = this.childViews[
          (this.childViews.length +
            (this.currentActive.current?._position ?? 0) +
            (ev.code === "ArrowRight" ? 1 : -1)) %
            this.childViews.length
        ] as RadioOption;
        this.setCurrent(next);
      }
    });
  }
  addView(view: RadioOption, pos?: number) {
    super.addView(view, pos);
    if (this.currentValue !== null && view.value === this.currentValue) {
      this.setCurrent(view);
    }
  }
}

class RadioOption extends TextView {
  protected createDom(): BuildDomExpr {
    return <div class="radio-option btn" onclick={() => this.select()}></div>;
  }
  value: any = null;
  select() {
    const parent = this.parentView as RadioContainer;
    if (parent.currentActive.current !== this) {
      parent.setCurrent(this);
    }
    this.toggleClass("selected", true);
  }
  unselect() {
    this.toggleClass("selected", false);
  }
}

class SettingItem extends View {
  label: () => string;
  protected createDom(): BuildDomExpr {
    return (
      <div class="setting-item">
        <span class="setting-label">{this.label}</span>
      </div>
    );
  }
}

class SettingsDialog extends Dialog {
  inputServer = new LabeledInput();
  btnNotification = new ButtonView({ type: "big" });

  constructor() {
    super();
    const { theme, style } = getThemeAndStyle();
    this.addContent(
      <SettingItem label={() => I`UI color:`}>
        <RadioContainer
          currentValue={theme}
          onCurrentChange={(option) => {
            setThemeAndStyle({ theme: option.value });
          }}
        >
          {themes.map((option) => (
            <RadioOption value={option}>
              {() => i18n.get("colortheme_" + option)}
            </RadioOption>
          ))}
        </RadioContainer>
      </SettingItem>,
    );

    this.addContent(
      <SettingItem label={() => I`UI style:`}>
        <RadioContainer
          currentValue={style}
          onCurrentChange={(option) => {
            setThemeAndStyle({ style: option.value });
          }}
        >
          {styles.map((option) => (
            <RadioOption value={option}>
              {() => i18n.get("styletheme_" + option)}
            </RadioOption>
          ))}
        </RadioContainer>
      </SettingItem>,
    );

    this.addContent(
      <SettingItem label={() => I`Language:`}>
        <RadioContainer
          currentValue={ui.lang.siLang.data}
          onCurrentChange={(option) => {
            ui.lang.siLang.set(option.value);
          }}
        >
          {["", ...ui.lang.availableLangs].map((option) => (
            <RadioOption value={option}>
              {() =>
                option ? i18n.get2("English", [], option) : I`language_auto`
              }
            </RadioOption>
          ))}
        </RadioContainer>
      </SettingItem>,
    );

    this.addContent(
      <SettingItem label={() => I`Preferred bitrate:`}>
        <RadioContainer
          currentValue={playerCore.siPlayer.data.preferBitrate ?? 0}
          onCurrentChange={(option) => {
            playerCore.siPlayer.data.preferBitrate = option.value;
            playerCore.siPlayer.save();
          }}
        >
          {bitrates.map((option) => (
            <RadioOption value={option}>
              {() => (option ? `${option}k` : I`bitrate_original`)}
            </RadioOption>
          ))}
        </RadioContainer>
      </SettingItem>,
    );

    this.addContent(
      <SettingItem label={() => I`Notification:`}>
        <RadioContainer
          currentValue={ui.notification.config.enabled}
          onCurrentChange={(option) => {
            ui.notification.setEnable(option.value);
          }}
        >
          {[true, false].map((option) => (
            <RadioOption value={option}>
              {() => (option ? I`enabled` : I`disabled`)}
            </RadioOption>
          ))}
        </RadioContainer>
      </SettingItem>,
    );

    this.addContent(this.inputServer);
    this.inputServer.value = localStorage.getItem("mcloud-server") || "";
    this.inputServer.dominput.placeholder = settings.defaultApiBaseUrl;
    this.inputServer.dominput.addEventListener("change", (e) => {
      localStorage.setItem("mcloud-server", this.inputServer.value);
      settings.apiBaseUrl = this.inputServer.value;
    });

    this.addContent(
      new ButtonView({
        text: () => I`Plugins`,
        type: "big",
        onActive: (ev) => {
          new PluginsUI().show(ev);
        },
      }),
    );

    const devFeatures = new View(
      (
        <div>
          <ButtonView
            onActive={(e) => {
              playerFX.showUI(e);
            }}
          >
            Test: Player FX
          </ButtonView>
        </div>
      ),
    );
    devFeatures.hidden = true;
    let devClickCount = 0;
    this.addContent(devFeatures);

    this.addContent(
      <div style="margin: 5px 0; display: flex; flex-wrap: wrap; justify-content: space-between;">
        <div
          onclick={() => {
            if (++devClickCount == 5) {
              devFeatures.hidden = false;
            }
          }}
        >
          {"MusicCloud " + appVersion.currentVersion}
        </div>
        <TextBtn
          onActive={(ev) => {
            new AboutDialog().show(ev);
            this.close();
          }}
        >
          {() => I`About`}
        </TextBtn>
      </div>,
    );
  }

  show(ev?: MouseEvent): void {
    this.inputServer.hidden = !!api.defaultAuth;
    super.show(ev);
  }

  updateDom() {
    this.title = I`Settings`;
    this.btnClose.updateWith({ text: I`Close` });
    super.updateDom();
    this.inputServer.updateWith({ label: I`Custom server URL` });
    this.btnNotification.text = ui.notification.config.enabled
      ? I`Disable notification`
      : I`Enable notification`;
  }
}

class AboutDialog extends Dialog {
  title = I`About`;

  constructor() {
    super();
    this.width = "500px";
    this.addContent(
      new View(
        (
          <div>
            <h2>{I`MusicCloud` + " " + appVersion.currentVersion}</h2>
            <p>
              {appVersion.currentDate
                ? I`Build Date` +
                  ": " +
                  new Date(appVersion.currentDate).toLocaleString(
                    ui.lang.curLang,
                  )
                : ""}
            </p>
            <p>
              {IA`This project is ${(
                <a
                  href="https://github.com/lideming/MusicCloud"
                  class="clickable"
                  target="_blank"
                >
                  {() => I`open-sourced`}
                </a>
              )} under MIT license.`}
            </p>
            <p>
              {IA`This project is based on ${(
                <a
                  href="https://github.com/lideming/webfx"
                  class="clickable"
                  target="_blank"
                >
                  webfx
                </a>
              )}.`}
            </p>
            <h3>{I`Recent changes:`}</h3>
            {this.createCommitsTable()}
          </div>
        ),
      ),
    );
  }

  private createCommitsTable() {
    let loading = false;
    let lastSha = "";
    let allLoaded = false;

    const table = new View(
      (
        <table>
          <tr>
            <th>Id</th>
            <th>Message</th>
          </tr>
        </table>
      ),
    );
    const addCommit = (commit) => {
      table.addView(
        new View(
          (
            <tr>
              <td>
                <a
                  href={`https://github.com/lideming/MusicCloud/commit/${commit.id}`}
                  target="_blank"
                >
                  <code>{commit.id}</code>
                </a>
              </td>
              <td>{commit.message}</td>
            </tr>
          ),
        ),
      );
      lastSha = commit.id;
    };
    for (const commit of buildInfo.commits) {
      addCommit(commit);
    }
    const loadMore = async () => {
      loading = true;
      const resp = await fetch(
        `https://api.github.com/repos/lideming/musiccloud/commits?per_page=100&sha=${lastSha}`,
      );
      const json = await resp.json();
      for (const item of json) {
        if (item.sha.startsWith(lastSha)) continue;
        addCommit({
          id: (item.sha as string).slice(0, 7),
          message: item.commit.message,
        });
      }
      if (json.at(-1).parents.length === 0) {
        allLoaded = true;
      }
      loading = false;
      checkToLoadMore();
    };
    const checkToLoadMore = () => {
      const { dom } = scrollBox;
      if (dom.scrollTop / (dom.scrollHeight - dom.clientHeight) > 0.7) {
        if (!loading && !allLoaded) {
          loadMore();
        }
      }
    };
    loadMore();
    const scrollBox = new View(
      (
        <div
          style="height: 300px; overflow-y: auto;"
          onscroll={checkToLoadMore}
        >
          {table}
        </div>
      ),
    );
    return scrollBox;
  }
}
