# Canvas native-scroll optimization

## November 16: viewport-renderer optimization

- Baseline: published MusicCloud `92a73fa`; immutable evidence remains in `/data/musiccloud-renderer-20261115/investigation/controlled-baseline.json`. This section records the viewport-renderer optimization before the whole-page changes below.
- Hardware: Chromium 149.0.7827.155, `--headless=new --enable-gpu --use-angle=vulkan`, application WebGL reports ANGLE NVIDIA RTX 3080 / Vulkan 1.4.341. Existing embedding/ASR services were not changed.
- The normal baseline protocol is retained: 1200 × 800 browser, actual list viewport 1200 × 670, DPR 1, 500/5,000/20,000 actual TrackViewItem DOM rows (3,501/35,001/140,001 descendants). Native CDP mouse gesture scrolls 6,000 pixels at 2,000 pixels/second. Every final sample reaches native scrollTop 6,000 and records trusted wheel/scroll events. Startup/DOM insertion is excluded. Passes are cold, same-path repeat, then the baseline harness's explicit first-120-cover prewarm; no observer/rebuild/mutation interventions are used.
- Main speed results are unwrapped/untraced `controlled-final.json`; diagnostic function timing lives separately in `diagnostic-final.json`. These are page rAF callback frequencies, not physical display FPS. The window includes 250 ms after the gesture completes. Table values are rounded once from JSON.

| DOM rows | Mode | Cold callbacks/s | Repeat callbacks/s | Prewarmed callbacks/s | Repeat P95 interval (ms) | Cold / repeat ScriptDuration (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 500 | Baseline Canvas | 20.0 | 59.6 | 59.6 | 16.7 | 2550 / 580 |
| 500 | Current Canvas | 59.8 | 59.8 | 59.9 | 16.8 | 852 / 674 |
| 500 | Current DOM | 59.7 | 59.6 | 59.7 | 16.7 | 49 / 21 |
| 5,000 | Baseline Canvas | 5.5 | 56.2 | 53.1 | 33.3 | 3537 / 530 |
| 5,000 | Current Canvas | 37.9 | 57.0 | 56.1 | 16.8 | 793 / 661 |
| 5,000 | Current DOM | 56.7 | 56.7 | 49.3 | 33.2 | 48 / 19 |
| 20,000 | Baseline Canvas | 2.5 | 16.0 | 16.5 | 133.3 | 6117 / 395 |
| 20,000 | Current Canvas | 13.4 | 41.1 | 41.4 | 66.7 | 626 / 527 |
| 20,000 | Current DOM | 35.1 | 40.6 | 40.7 | 83.3 | 31 / 14 |

- The second 500-row control at the end remains 59.9/59.8/59.7 callbacks/s for Canvas. The 20,000-row Canvas cold sample takes 3,442 ms and paints 28 frames; repeat takes 3,306 ms and paints 119 frames. Cold work is greatly reduced but still slower than DOM while new covers/content rasterize and the browser processes the long source DOM. Repeat/prewarmed callback frequency is near the same-run DOM measurement.
- The separate instrumented 20,000-row run confirms 20,000 qualified flow children and zero escaping rows in the main list. Cold scrolling performs no complete `rebuild`: local tree refresh totals about 295 ms, nearby lookup totals 5.3 ms over 27 paints. Repeat nearby lookup totals 22.4 ms over 112 paints (maximum 0.5 ms), rather than walking all rows each frame. Instrumentation adds overhead; its callback frequencies are not used in the speed table.
- Current Canvas finishes every size with 14 retained foreground resources, 10 visible resources, 16 size-observation targets and 4,822,272 foreground raster bytes. Initial cached row canvases are 1196 × 72 with 3,638 nontransparent pixels, and decoded covers remain present. This is neither a shortened DOM nor an empty-cache measurement.
- ScriptDuration on repeat can exceed the old baseline while callback frequency improves: the current renderer paints approximately three times as many frames in the 20,000-row window. Compare elapsed windows, actual paint counts and intervals rather than treating total JS time as per-frame cost.

## Implementation and supported path

- Local DOM metadata and boundary counts replace unconditional tree recreation. Content/style mutation refreshes its subtree and propagates ancestor summaries; direct text/size can reuse descendant metadata. Insert/remove refreshes the affected parent subtree. Dirty resource ownership is found along ancestry plus retained descendants, not by scanning all list members. Pure root-resource placement changes reuse pixels; root/theme/font/viewport changes retain full refresh. Final-value no-op attribute records do not schedule work.
- Ordinary vertical block or column-flex flow with nonnegative margins, no floats/reordering/multicolumn fragmentation, and clipped/paint-contained unmoved boxes uses binary search over live native rectangles. Chrome resolves unmoved relative top/bottom to 0px, which is accepted. Variable heights, distant/reverse jumps and nested native viewports share this path. Escaping/sticky/transformed branches remain candidates; unsupported layouts fall back to a hierarchy walk. No custom scroll model, row-height assumption, fixed row range or application class selects the path.
- Nearby resource/ancestor size observation replaces all-resource IO/RO registration. Source DOM, layout, scroll, hit testing, focus, drag and accessibility remain browser-owned. Effect-selector membership is refreshed separately; an unchanged blur selection no longer rebuilds the complete paint tree.
- Cross-resource placements retain ancestor rounded padding-edge shapes. Canvas2D creates alpha masks, bounded by effective rectangular clipping and output size, reused under common translation and released when unused. Straight interior bands skip irrelevant rounded masks. Foregrounds/shadows, opacity groups and effect selections use the same clip coverage. `.fill` keeps zero left radii.

## Validation and limits

- `node node_modules/typescript/bin/tsc --noEmit`, `npm run build:bundle` and the maintained 34-test suite passed. Run tests serially with `TMPDIR=/data/musiccloud-canvas-work node --test --test-concurrency=1 tests/*.test.cjs` to avoid contending software-GPU Chromium processes. The final local content test was also rerun after adding explicit sibling insertion/removal and separate zero→nonzero context changes.
- Actual BottomBar native/Canvas screenshot comparison at DPR 1.25 covers a one-pixel fill, 50% and 100%. Mean RGB errors over the left 24 CSS pixels are about 2.36/3.71/3.72 levels out of 255. Independent split resources with a border, shadow and opacity group have mean errors 0.26/0.86/2.31 for 1/96/220-pixel fill widths. A transparent 100,000-pixel rounded ancestor retains real red foreground while all actual uploads remain within the output size.
- Generic 2,400-row tests exercise live variable-height geometry, bounded far-jump rectangle reads, distant size/content changes, forward/reverse jumps, actual visible cache colors, real sibling insertion/removal, context changes, nested scrolling and idle counters. Native body input-mode no-ops leave both renderer counters unchanged. Existing tests retain player/list invalidation isolation, native interactions, DPR/scale, disposal and fallback coverage. Settings tests now wait for native entrance animations before clicking; previous fixed-delay clicks could hit the Language row while the dialog moved.
- Initial metadata construction and genuine full inherited/layout refresh still visit the complete DOM. Candidate lookup may be linear outside the qualified CSS flow subset. Nonlocal relation-selector dependencies that change a different sibling's resource boundary outside the refreshed subtree are not tracked as a CSS dependency graph. Existing renderer CSS/raster limits remain documented in repo `docs/dom-canvas-renderer.md`. Whole-application takeover is not part of this change.

## Reproduction and files

```sh
cd /data/musiccloud-renderer-20261116
node profile.cjs '{"sizes":[500,5000,20000,500],"modes":["canvas","dom"],"passes":3,"output":"controlled-final.json"}'
node profile.cjs '{"sizes":[20000],"modes":["canvas"],"passes":3,"instrument":true,"output":"diagnostic-final.json"}'
```

- Main evidence: `controlled-final.json`, `controlled-final.log`, `summary.json`; independent function timings: `diagnostic-final.json`, `diagnostic-final.log`.
- Harness: `profile.cjs`, `cdp.cjs`, `assets.cjs`, `source-map.cjs`; `dist/` is the latest measured bundle only. Internal measurement reads use current `sizeTargets`/resources rather than the removed `near` IntersectionObserver set. Diagnostic-only flow-index details are gated by instrumentation and do not run in normal measurements.
- Browser profiles, transient transport archives and superseded pre-correction measurements are removed when the task completes. The read-only November 15 baseline is untouched.


## November 17: single whole-page scene

- The application now has one body-source renderer and one 1200 × 800 output. Background, header, player, route content and overlays enter that scene; the list viewport stays 1200 × 670. The sidebar is collapsed as in the existing full-width protocol. The normal header/player/background remain enabled, with a selected paused local track and its real cover/background.
- Same RTX 3080, Chromium 149.0.7827.155, ANGLE Vulkan, DPR 1, 6,000-pixel trusted native mouse gesture at 2,000 pixels/second, 250 ms tail and cold/repeat/first-120-cover-prewarm passes. Actual DOM rows remain 500/5,000/20,000; the list has 3,501/35,001/140,001 descendants. Final results are uninstrumented `gpu-vm:/data/musiccloud-page-renderer-20261117/page-normal.json`; separate timing/CPU/trace evidence is `page-diagnostic.json`.

| DOM rows | Mode | Cold callbacks/s | Repeat callbacks/s | Prewarmed callbacks/s | Repeat P95 interval (ms) | Cold / repeat ScriptDuration (ms) | Repeat Canvas paints |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | Whole-page Canvas | 58.4 | 59.6 | 59.7 | 16.8 | 1676 / 1234 | 180 |
| 500 | DOM | 59.7 | 59.8 | 59.7 | 16.8 | 50 / 21 | — |
| 5,000 | Whole-page Canvas | 38.4 | 54.7 | 55.6 | 33.3 | 1647 / 1134 | 164 |
| 5,000 | DOM | 58.4 | 58.0 | 54.7 | 16.8 | 45 / 20 | — |
| 20,000 | Whole-page Canvas | 12.5 | 38.8 | 37.6 | 83.3 | 1384 / 834 | 112 |
| 20,000 | DOM | 34.0 | 39.5 | 43.0 | 66.8 | 33 / 13 | — |

- These are page rAF callback frequencies, not physical presentation FPS. The complete scene's 20,000-row repeat is near the same-run DOM result, and below the previous viewport-only 41.1/41.4 repeat/prewarm values. Cold scrolling remains slower while resources are introduced. Whole-page composition and the added text/effect fidelity also cost more JS than viewport-only rendering; the table reports that work rather than hiding it behind the callback count.
- Across every size, the final scene retains 28 foreground backings: 14 list resources (4,822,272 RGBA backing bytes) plus 14 other page resources (13,768,376 bytes), for 18,590,648 bytes of Canvas2D backings. The largest list backing is 1196 × 72. This excludes decoded-image memory and retained GPU copies; it is not total process/GPU memory. The output is 1200 × 800; allocated compositor scratch targets total 16,740,000 RGBA bytes and retained masks 2,880 bytes. Size-observation targets remain 41. All are independent of list length.
- The first whole-page version moved transparent scrollbar hit elements on each scroll. Its 20,000-row repeat/prewarm were about 23.4/23.5 callbacks/s. A separate diagnostic disabling only those DOM commits isolated that cost. The final product removes the hit DOM entirely and delegates bar input through original DOM; final normal measurements use all observers, invalidation, media and scrollbar behavior, with no diagnostic override.
- Separate trace: repeated 20,000-row scrolling performs no complete `rebuild`. Nearby lookup totals 35.1 ms over 106 paints (maximum 0.7 ms); mutations total 0.1 ms, ResizeObserver callbacks 3.4 ms, and main-thread `compositor.render` calls 36.3 ms (not asynchronous GPU elapsed time). These wrapped/traced values are diagnostic, not the normal speed table. Browser PrePaint is about 12.1 ms in that window after removing moving hit DOM. Native HitTest/Commit still have roughly 120 ms outliers on the complete long DOM. Cold local metadata, source-selector matching and text measurement remain visible CPU costs.
- In the independent 600-row mobile acceptance, one actual 11-move sidebar gesture dropped computed-style reads from about 122,718 to 11,920 and `fillText` calls from 420 to 55. Newly visible sidebar resources still paint. During the continuous-move portion of the maintained 500-row fixture, cached list canvases survive and roughly 1,000 style reads replace per-move whole-list refresh.
- Background/backdrop/source blur now share progressive 2× prefiltering and dense Gaussian taps. Independent native mobile screenshots confirm that the earlier sparse grid and menu-overlap appearance are gone. A DPR-2 periodic stripe regression has central value 66 versus an independent CPU Gaussian 63.75 and adjacent-pixel difference 0.032.

### Page validation and reproduction

- The maintained serial suite has 36 passing tests across generic rendering, real-page interaction and player intent/lifetime behavior. `tsc --noEmit` and `build:bundle` pass. The existing failure case additionally checks local cross-origin image/video restoration; no backend account is written.
- Native reference crops cover menus/toasts, ruby/timestamps and real short progress at DPR 1/1.25. Parent acceptance independently checks a 600-row desktop scene at DPR 1.25, narrow-screen touch/blur/menu, RTL clamping, progress/list cache identity, 700 ms of zero idle draw/upload/text/geometry/style work, off-track thumb release with no document click, and actual context loss releasing every tracked texture while retaining source/selection/scroll.
- At this whole-page measurement checkpoint, source editing/IME/nonempty selection temporarily showed the original entire page. The subsequent ordinary-selection/text-editing implementation described in `dom-canvas-renderer.md` keeps ordinary text selection, editing and IME composition in Canvas; native picker paths retain native presentation. Missing/unreadable media, invalid paint and context loss restore DOM without retrying. Safari/iOS device verification remains follow-up; production GL filters do not depend on the Safari Canvas2D Filters experiment.
- Current architecture and remaining CSS scope are in `docs/dom-canvas-renderer.md`. Previous November 15/16 evidence is unchanged.

```sh
cd /data/musiccloud-page-renderer-20261117
node profile.cjs '{"sizes":[500,5000,20000],"modes":["canvas","dom"],"passes":3,"output":"page-normal.json"}'
node profile.cjs '{"sizes":[20000],"modes":["canvas"],"passes":3,"instrument":true,"trace":true,"output":"page-diagnostic.json"}'
```

- The harness serves `dist/bundle.js` and maps profiles with `dist/bundle.js.map`; transport archives must be extracted into that served directory. Final captures also record `delegatedBars`, body source dimensions, separate list/page backings and actual DOM row count, so a stale early bundle cannot masquerade as the final allocation model.
- Master page screenshots and serial-test logs are in `/data/musiccloud-canvas-work/page-renderer/full-page/`; independent acceptance is in `/data/musiccloud-canvas-work/page-renderer/acceptance/full-page/`. GPU JSON/logs and reproduction scripts stay under the new November 17 directory.
