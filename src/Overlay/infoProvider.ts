import type { playerCore } from "../Player/PlayerCore";

export const infoProvider = {
  bindToPlayer(player: typeof playerCore) {
    const channel = new BroadcastChannel("mc-player");
    player.onTrackChanged.add((e) => {
      const track = player.track;
      channel.postMessage({
        type: "track",
        track: track?.infoObj,
      });
      (track?.getLyrics() ?? Promise.resolve(null)).then((lyrics) => {
        if (track !== player.track) return;
        channel.postMessage({
          type: "lyrics",
          trackId: track?.id,
          lyrics: lyrics,
        });
      });
    });
    player.onProgressChanged.add((e) => {
      channel.postMessage({
        type: "time",
        time: player.currentTime,
      });
    });
  },
};
