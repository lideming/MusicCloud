import type { playerCore } from "../Player/PlayerCore";

export const infoProvider = {
  init(player: typeof playerCore) {
    const channel = new BroadcastChannel("mc-player");

    channel.addEventListener("message", (ev) => {
      const {
        data: { type },
      } = ev;
      if (type === "request_state") {
        postTrack();
        postLyrics();
        postTime();
      }
    });

    player.onTrackChanged.add((e) => {
      postTrack();
      postLyrics();
    });
    player.onProgressChanged.add((e) => {
      postTime();
    });

    function postTrack() {
      const track = player.track;
      channel.postMessage({
        type: "track",
        track: track?.infoObj,
      });
    }

    function postLyrics() {
      const track = player.track;
      (track?.getLyrics() ?? Promise.resolve(null)).then((lyrics) => {
        if (track !== player.track) {
          return;
        }
        channel.postMessage({
          type: "lyrics",
          trackId: track?.id,
          lyrics: lyrics,
        });
      });
    }

    function postTime() {
      channel.postMessage({
        type: "time",
        time: player.currentTime,
      });
    }
  },
};
