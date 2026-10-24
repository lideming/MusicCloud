// Run with: node --test tests/player-core.test.cjs
// Execute the real TypeScript modules with controlled browser/API boundaries.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const webfxRequire = createRequire(require.resolve("@yuuza/webfx/package.json"));
const utils = webfxRequire("@yuuza/utils");
const root = path.resolve(__dirname, "..");

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(setImmediate);

class MediaElement {
  src = "";
  currentTime = 0;
  duration = NaN;
  readyState = 0;
  playbackRate = 1;
  paused = true;
  volume = 1;
  loads = [];
  plays = [];
  listeners = new Map();
  setAttribute() {}
  addEventListener(name, callback) {
    const list = this.listeners.get(name) ?? [];
    list.push(callback);
    this.listeners.set(name, list);
  }
  emit(name) { for (const fn of this.listeners.get(name) ?? []) fn({}); }
  load() {
    this.loads.push(this.src);
    this.currentTime = 0;
    this.readyState = 0;
  }
  play() {
    this.plays.push(this.src);
    this.paused = false;
    this.emit("play");
    this.emit("playing");
    return this.playResult ? this.playResult() : Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.emit("pause");
  }
}

// Timer is a platform boundary; no test needs a wall-clock retry.
class Timer {
  constructor(action) { this.action = action; }
  timeout() { this.pending = true; }
  tryCancel() { this.pending = false; }
}

function harness({ native = false, ios = false } = {}) {
  const audio = new MediaElement();
  const created = [];
  const positions = [];
  const errors = [];
  const warnings = [];
  const mediaSession = {
    metadata: null,
    setActionHandler() {},
    setPositionState(value) { positions.push(value); },
  };
  const storage = new Map();
  const context = vm.createContext({
    console: { info() {}, error: (...args) => errors.push(args), warn: (...args) => warnings.push(args) },
    navigator: { userAgent: ios ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" : "test", mediaSession },
    window: { mcloudNative: native ? { audio } : undefined, addEventListener() {} },
    document: { createElement(tag) { created.push(tag); return audio; } },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    HTMLMediaElement: { HAVE_METADATA: 1 },
    MediaMetadata: class { constructor(value) { Object.assign(this, value); } },
    AudioContext: class {
      state = "suspended";
      destination = {};
      resumes = 0;
      createMediaElementSource() { return { connect() {} }; }
      createGain() { return { gain: { value: 1 }, connect() {} }; }
      addEventListener() {}
      resume() { this.resumes++; this.state = "running"; return Promise.resolve(); }
    },
    URL, Blob, performance, queueMicrotask,
  });
  const mocks = {
    "@yuuza/webfx": { ...utils, Timer },
    "../Infra/viewlib": { ...utils, Timer, Dialog: class {}, View: class {}, Toast: { show() {} } },
    "../I18n/I18n": { I: strings => strings.join("") },
    "../API/Api": { api: { onTrackInfoChanged: new utils.Callbacks(), processUrl: url => url } },
    "../Infra/UI": { ui: { isVisible: new utils.Ref(true), notification: { isEnabledFor: () => false } } },
  };
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const requireModule = id => {
      if (id in mocks) return mocks[id];
      return load(path.resolve(path.dirname(filename), id + ".ts"));
    };
    vm.runInContext(`(function(require, module, exports) {${source}\n})`, context, { filename })(requireModule, module, module.exports);
    return module.exports;
  }
  const coreModule = load(path.join(root, "src/Player/PlayerCore.ts"));
  const player = coreModule.playerCore;
  const fx = load(path.join(root, "src/Player/PlayerFX.ts")).playerFX;
  player.init();
  return { player, fx, audio, created, mediaSession, positions, errors, warnings, sync: coreModule.syncMediaSession };
}

function track(name, { url, loudness = null, size = 100 } = {}) {
  return {
    id: name, name, artist: "artist", url: `/${name}`, length: 120,
    files: [{ profile: "test", bitrate: 256, size }],
    requestFileUrl: () => url ?? Promise.resolve(`/${name}`),
    getLoudnessMap: () => Promise.resolve(loudness),
  };
}

test("selects the native media element explicitly, or creates a browser video", async () => {
  const browser = harness({ ios: true });
  assert.deepEqual(browser.created, ["video"]);
  assert.equal(browser.player.volumeByGainNode, true);
  const native = harness({ native: true, ios: true });
  assert.deepEqual(native.created, []);
  assert.equal(native.player.audio, native.audio);
  assert.equal(native.player.volumeByGainNode, false);
  native.audio.playResult = () => undefined;
  await native.player.playTrack(track("native")); // play() returns undefined, as in the bridge.
  assert.equal(native.player.state, "playing");
});

for (const size of [100, -1]) {
  test(`a late ${size === -1 ? "conversion" : "ordinary URL"} cannot undo a newer selection`, async () => {
    const { player, audio } = harness();
    const pending = deferred();
    const a = track("A", { url: pending.promise, size });
    const b = track("B");
    const changed = [];
    player.onTrackChanged.add(() => changed.push(player.track.name));
    const old = player.playTrack(a);
    await player.setTrack(b, 23);
    pending.resolve("/A");
    await old;
    assert.equal(player.track, b);
    assert.deepEqual(audio.loads, ["/B"]);
    assert.deepEqual(audio.plays, ["/B"]);
    assert.equal(audio.currentTime, 23);
    assert.equal(player.trackProfile, b.files[0]);
    assert.deepEqual(changed, ["B"]);
    assert.equal(player.state, "playing");
  });
}

test("a late loudness result cannot change the gain or replay the previous track", async () => {
  const { player, audio } = harness();
  // Older saved player settings omit this field; normalization defaults to on.
  delete player.siPlayer.data.loudnessNormalization;
  const pending = deferred();
  const a = track("A");
  a.getLoudnessMap = () => pending.promise;
  const old = player.playTrack(a);
  await flush();
  await player.playTrack(track("B", { loudness: new Uint8Array(10).fill(128) }));
  const gain = player.normalizingGain.value;
  pending.resolve(new Uint8Array(10).fill(32));
  await old;
  await flush();
  assert.equal(player.normalizingGain.value, gain);
  assert.ok(gain < 0.3);
  assert.deepEqual(audio.plays, ["/B"]);
  assert.equal(player.track.name, "B");
});

test("play handles loading, loudness and media Promise failures", async t => {
  for (const boundary of ["URL", "loudness", "media"]) {
    await t.test(boundary, async () => {
      const { player, audio, errors } = harness();
      const failure = () => Promise.reject(new Error(boundary));
      const a = track("A");
      if (boundary === "URL") a.requestFileUrl = failure;
      if (boundary === "loudness") a.getLoudnessMap = failure;
      if (boundary === "media") audio.playResult = failure;
      await player.setTrack(a);
      await player.play();
      assert.equal(player.state, "none");
      assert.equal(errors.length, 1);
    });
  }
});

test("old source and media play failures cannot overwrite a new playing state", async t => {
  for (const boundary of ["source", "media"]) {
    await t.test(boundary, async () => {
      const { player, audio, errors } = harness();
      const pending = deferred();
      const a = track("A", boundary === "source" ? { url: pending.promise } : {});
      if (boundary === "media") audio.playResult = () => pending.promise;
      const old = player.playTrack(a);
      await flush();
      audio.playResult = undefined;
      await player.playTrack(track("B"));
      pending.reject(new Error("old failure"));
      await old;
      assert.equal(player.state, "playing");
      assert.equal(player.track.name, "B");
      assert.equal(errors.length, 0);
    });
  }
});

test("pause cancels pending automatic playback without cancelling the selected source", async t => {
  for (const boundary of ["source", "loudness", "media"]) {
    await t.test(boundary, async () => {
      const { player, audio } = harness();
      const pending = deferred();
      const a = track("A", boundary === "source" ? { url: pending.promise } : {});
      if (boundary === "loudness") a.getLoudnessMap = () => pending.promise;
      if (boundary === "media") audio.playResult = () => pending.promise;
      const playing = player.playTrack(a);
      await flush();
      player.pause();
      if (boundary === "media") pending.reject(new Error("interrupted by pause"));
      else pending.resolve(boundary === "source" ? "/A" : null);
      await playing;
      assert.equal(player.state, "paused");
      assert.equal(audio.paused, true);
      assert.equal(player.audioLoaded, true);
      assert.equal(audio.plays.length, boundary === "media" ? 1 : 0);
    });
  }
});

test("overlapping plays share the selected source load and only the newest intent plays", async () => {
  const { player, audio } = harness();
  const pending = deferred();
  let requests = 0;
  const a = track("A");
  a.requestFileUrl = () => { requests++; return pending.promise; };
  const selection = player.setTrack(a, 37, "restore");
  const play = player.play();
  pending.resolve("/A");
  await Promise.all([selection, play]);
  assert.equal(requests, 1);
  assert.deepEqual(audio.loads, ["/A"]);
  assert.deepEqual(audio.plays, ["/A"]);
  assert.equal(audio.currentTime, 37);
  assert.equal(player.trackChangedReason, "restore");
});

test("numeric time is restored on a source switch and zero still requests playback", async () => {
  const { player, audio } = harness();
  const a = track("A");
  await player.setTrack(a, 42, "restore");
  assert.equal(audio.currentTime, 42);
  await player.setTrack(a, 10); // Existing same-source semantics keep the current position.
  assert.equal(audio.currentTime, 42);
  await player.setTrack(track("B"), 0);
  assert.equal(audio.currentTime, 0);
  assert.equal(player.state, "playing");
});

test("WebAudio activation is synchronous and first graph gain uses the current inputs", async () => {
  const { player, fx } = harness({ ios: true });
  const pending = deferred();
  const a = track("A");
  a.getLoudnessMap = () => pending.promise;
  await player.setTrack(a);
  player.volume = 0.25;
  player.normalizingGain.value = 0.5;
  const playing = player.play();
  assert.equal(fx.webAudioInited, true);
  assert.equal(fx.ctx.resumes, 1);
  assert.equal(fx.gainNode.gain.value, Math.pow(0.25, 1.5) * 0.5);
  pending.resolve(null);
  await playing;
  await flush();
  assert.equal(player.effectiveGain.value, player.getEffectiveGain());
});

test("MediaSession metadata survives unknown duration and position errors, and clears with the track", async () => {
  const { player, audio, mediaSession, positions, sync } = harness();
  const a = track("A");
  a.length = undefined;
  await player.setTrack(a);
  assert.equal(mediaSession.metadata.title, "A");
  assert.equal(positions.length, 0);
  player.audioLoaded = true;
  audio.readyState = 1;
  for (const duration of [NaN, 0, Infinity]) { audio.duration = duration; sync(); }
  assert.equal(positions.length, 0);
  audio.duration = 120;
  audio.currentTime = 12;
  sync();
  assert.equal(positions.at(-1).position, 12);
  assert.equal(positions.at(-1).duration, 120);
  mediaSession.setPositionState = value => { if (value) throw new Error("unsupported"); positions.push(value); };
  a.name = "updated A";
  player.onTrackChanged.invoke();
  assert.equal(mediaSession.metadata.title, "updated A");
  await player.setTrack(null);
  audio.emit("pause"); // A queued browser/native pause can arrive after clearing.
  assert.equal(player.state, "none");
  assert.equal(mediaSession.metadata, null);
  assert.equal(positions.at(-1), undefined);
});
