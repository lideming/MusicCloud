import {
  ContextMenu,
  MenuItem,
  I,
  formatFileSize,
  MenuLinkItem,
  i18n,
  formatDuration,
  arraySum,
  MenuInfoItem,
} from "@yuuza/webfx";
import { api } from "../API/Api";
import { Api } from "../API/apidef";
import { user } from "../API/User";
import { router } from "../Infra/Router";
import { ui } from "../Infra/UI";
import { CopyMenuItem } from "../Infra/ui-views";
import { settings } from "../Settings/Settings";
import { Track } from "./Track";
import { TrackViewItem } from "./TrackList";
import { playerCore } from "../Player/PlayerCore";

export function onTrackContextMenuCreated(context: {
  selected: Track[];
  ev: MouseEvent;
  trackViewItems?: TrackViewItem[];
  menu: ContextMenu;
}) {}

export const trackContextMenu = (
  selected: Track[],
  ev: MouseEvent,
  trackViewItems?: TrackViewItem[],
) => {
  ev.preventDefault();
  var m = new ContextMenu();
  const item = selected[0];
  if (selected.length == 1) {
    if (
      item.id &&
      user.state != "none" &&
      user.serverOptions.trackCommentsEnabled !== false
    )
      m.add(
        new MenuItem({
          text: I`Comments`,
          onActive: () => {
            router.nav(["track-comments", item.id.toString()]);
          },
        }),
      );
    if (settings.showDownloadOptions && item.url) {
      var ext = item.getExtensionName();
      ext = ext ? ext.toUpperCase() + ", " : "";
      var fileSize = formatFileSize(item.size);
      var files = [...(item.files ?? [])];
      files.sort((a, b) => b.bitrate - a.bitrate);
      if (!files.find((f) => f.profile === ""))
        m.add(
          new MenuLinkItem({
            text: I`Download` + " (" + ext + fileSize + ")",
            link: api.processUrl(item.url)!,
            download: item.artist + " - " + item.name + "." + ext,
          }),
        );
      files.forEach((f) => {
        var format = f.format?.toUpperCase();
        var url = item.getFileUrl(f);
        if (url)
          m.add(
            new MenuLinkItem({
              text: I`Download` + " (" + format + ", " + f.bitrate + " Kbps)",
              link: api.processUrl(url)!,
              download: item.artist + " - " + item.name + "." + format,
            }),
          );
        else if (item.canEdit)
          m.add(
            new MenuItem({
              text: I`Convert` + " (" + format + ", " + f.bitrate + " Kbps)",
              onActive: () => {
                item.requestFileUrl(f);
              },
            }),
          );
      });
    }
    if (item.picurl) {
      m.add(
        new MenuLinkItem({
          text: I`Show picture`,
          link: api.processUrl(item.picurl)!,
        }),
      );
    }
  }
  const targetGroup = (item.groupId || null) ?? item.id;
  const nonSameGroupItems = selected.filter(
    (x) => x != item && x.groupId !== targetGroup,
  );
  if (nonSameGroupItems.length > 0) {
    m.add(
      new MenuItem({
        text: I`Group to this`,
        onActive: async () => {
          if (!item.groupId) {
            await item.put({
              ...item.infoObj,
              groupId: item.id,
            });
          }
          await Promise.all(
            nonSameGroupItems.map((other) => {
              return other.put({
                ...other.infoObj,
                groupId: item.groupId,
              });
            }),
          );
        },
      }),
    );
  }
  const groupedItems = selected.filter((x) => x.groupId && x.groupId !== x.id);
  if (groupedItems.length > 0) {
    m.add(
      new MenuItem({
        text: I`Ungroup`,
        onActive: async () => {
          await Promise.all(
            groupedItems.map((x) => {
              return x.put({
                ...x.infoObj,
                groupId: x.id,
              });
            }),
          );
        },
      }),
    );
  }
  if (item.canEdit)
    [0, 1].forEach((visi) => {
      var count = 0;
      for (const item of selected) {
        if (item.visibility != visi) count++;
      }
      if (!count) return;
      m.add(
        new MenuItem({
          text: i18n.get(
            count == 1
              ? "make_it_visibility_" + visi
              : "make_{0}_visibility_" + visi,
            [count],
          ),
          onActive: () => {
            api
              .post({
                path: "tracks/visibility",
                obj: {
                  trackids: selected.map((x) => x.id),
                  visibility: visi,
                } as Api.VisibilityChange,
              })
              .then((r) => {
                selected.forEach((t) => {
                  t.infoObj!.visibility = visi;
                  api.onTrackInfoChanged.invoke(t.infoObj!);
                });
              });
          },
        }),
      );
    });
  if (selected.length == 1) {
    if (item.visibility == 1) {
      m.add(
        new CopyMenuItem({
          text: I`Copy link`,
          textToCopy: api.appBaseUrl + "#track/" + item.id,
        }),
      );
      if (item.id === playerCore.track?.id) {
        const time = playerCore.currentTime;
        m.add(
          new CopyMenuItem({
            text: I`Copy link` + ` (${formatDuration(time)})`,
            textToCopy:
              api.appBaseUrl + "#track/" + item.id + "/" + time.toFixed(3),
          }),
        );
      }
    }
    m.add(
      new MenuItem({
        text: item.canEdit ? I`Edit` : I`Details`,
        onActive: (ev) => item.startEdit(ev),
      }),
    );
  }
  if (trackViewItems) {
    const trackViewItem = trackViewItems[0];
    if (
      selected.length == 1 &&
      trackViewItem.actionHandler?.onTrackRemove &&
      trackViewItem.actionHandler?.canRemove?.([trackViewItem]) != false
    ) {
      m.add(
        new MenuItem({
          text: I`Remove`,
          cls: "dangerous",
          onActive: () =>
            trackViewItem.actionHandler!.onTrackRemove?.([trackViewItem]),
        }),
      );
    }
    if (
      trackViewItem.actionHandler?.onTrackRemove &&
      selected.length > 1 &&
      trackViewItem.actionHandler?.canRemove?.([...trackViewItems]) != false
    )
      m.add(
        new MenuItem({
          text: I`Remove ${selected.length} tracks`,
          cls: "dangerous",
          onActive: () => {
            trackViewItem.actionHandler!.onTrackRemove?.([...trackViewItems]);
          },
        }),
      );
  }
  let infoText =
    I`Track ID` +
    ": " +
    selected.map((x) => x.id).join(", ") +
    "\n" +
    I`Duration` +
    ": " +
    formatDuration(arraySum(selected, (x) => x.length!)) +
    "\n" +
    I`Size` +
    ": " +
    formatFileSize(arraySum(selected, (x) => x.size!));
  if (selected.length == 1) {
    const my = item.owner == user.info.id ? "my_" : "";
    infoText += "\n" + i18n.get(my + "visibility_" + selected[0].visibility);
  }
  m.add(new MenuInfoItem({ text: infoText }));
  const context = {
    selected,
    ev,
    trackViewItems,
    menu: m,
  };
  onTrackContextMenuCreated(context);
  m = context.menu;
  if (trackViewItems) {
    ui.showContextMenuForItem(trackViewItems, m, { ev: ev });
  } else {
    m.show(ev);
  }
};
