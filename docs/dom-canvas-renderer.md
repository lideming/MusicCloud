# DOM/CSS page Canvas renderer

## Application ownership

- `PageCanvas.ts` is the application's single renderer owner. `UI.init()` initializes it, and it alone subscribes to the persisted `mcloud-renderer` choice. An unset preference defaults to Canvas. Browser DOM mode disposes the renderer; choosing the current setting does not replace it.
- Canvas mode uses `document.body` as its source and one fixed, pointer-transparent host directly under `document.documentElement`. The `.page-canvas` output is outside source-paint suppression and is never read back as page content. Sidebar, list and player no longer create their own renderers.
- The source includes the application background, heading, list, bottom player, ordinary routes, Settings, context menus, dialogs, toasts, tooltips, videos and ordinary source canvases. Dynamic mounting is discovered through the same DOM tree, not a list of business paint roots.
- The original DOM retains CSS layout, native scroll offsets, sticky positioning, hit testing, focus, accessibility and business handlers. There is no cloned page, screenshot/HTML-in-Canvas API, virtual scrolling model or separate business state.
- `new DOMCanvasRenderer(source, host)` remains available for independent subtree callers. Its positioned host owns shared source/output movement. Generic tests disable the application renderer before mounting their own fixtures.

## Native editing and restoration

- Static input and textarea values, placeholders and select labels enter the normal page output. The application does not stay in DOM presentation simply because a route contains a control.
- Focused native input/textarea/select controls, contenteditable/IME editing and nonempty native text selection temporarily expose the same original page and hide the complete Canvas output. Browser caret, editing, selection and native controls remain browser-owned. Blur/selection collapse restores the same renderer, source DOM, values, media and scroll offsets.
- A child-list observer runs during native editing so removal of a focused input, including Escape closing Settings, can restore Canvas even when the browser sends no `focusout`.
- Application fullscreen on `documentElement` retains Canvas because it contains the output host. Fullscreen content excluding that host uses native presentation until fullscreen ends.
- Paint errors, unreadable images/video or context loss dispose GPU resources and restore native page paint and authored scrollbar styles. There is no automatic retry loop. A later explicit DOM → Canvas setting change can create a new renderer.

## Pixel pipeline

- `DOMPaintTree.ts` derives reusable resource boundaries, stacking contexts, scrollers and clipping from DOM/computed CSS. Small unfragmented subtrees share a bitmap; large scrolling trees retain nearby child resources. Neither caller-provided row groups nor fixed heights select this path.
- `CanvasPaint.ts` reads fractional, untransformed boxes and native text ranges, then uses ordinary Canvas2D shape/text/image drawing. It supports the application's solid backgrounds, borders/radii, focus outlines, SVG/images, URL backgrounds with cover/center/no-repeat, video frames, static controls, text shadow/underline, generated timestamp text, ruby, ellipsis and line-clamp. Complete strings use native Canvas shaping. A clamped line adds exactly one ellipsis.
- `DOMPaintGeometry.ts` normalizes resource-local 2D geometry. The compositor places transformed/mirrored resource quads using their current affine basis. Actual sidebar/route translations, control scale transitions and the rotating loading indicator use this path.
- `CanvasCompositor.ts` composes the ordered page, including its background. Opacity groups apply once. Cross-resource foregrounds and shadows retain ancestor rounded padding-edge clips. Alpha masks are bounded by effective clip/output dimensions, include those dimensions in their cache key and are evicted when unused.
- CSS `blur` and the application's `drop-shadow` use WebGL, including source padding and premultiplied alpha. Large radii progressively downsample by 2× before a dense separable Gaussian, then use linear upsampling. This prevents sparse repeated-text/grid artifacts at mobile DPR. Production does not assign Canvas2D `context.filter` or require Safari's Canvas Filters switch.
- Ordinary `backdrop-filter` reads the already composed page behind its position. `data-canvas-blur` instead selects declared source subtrees, preserving unselected backgrounds, foreground layers and original ordering. Selected runs are filtered in their opacity scope and replaced only in the effect region; the page background is not cleared. Its value remains source-scoped CSS selectors, for example `#sidebar-list ul, #sidebar-features`.
- An ordinary source canvas notifies after painting with one bubbling `canvas-content-changed` event. LoudnessMap and the actual FXDialog follow this owner protocol; the renderer does not patch global Canvas methods or inspect drawing commands. Visible video uses `requestVideoFrameCallback` and media events, rather than an idle renderer polling loop.
- Unscaled resources and the output retain allocated physical-texel extents at fractional DPR. Intentional CSS scaling keeps linear sampling. This avoids a second allocation/geometry scale while preserving native hit coordinates.

## Scrolling, local updates and lifetime

- Ordinary vertical block/column-flex flow uses binary search over current native rectangles when CSS containment, margins and ordering qualify. Sticky/transformed/escaping branches remain candidates; other layouts use a hierarchy walk. Variable heights, reverse jumps and nested scroll viewports share the same native geometry.
- Only nearby resources and necessary ancestors are ResizeObserver targets. Full DOM construction and genuine inherited theme/font/layout refresh still visit the complete source; ordinary local mutation does not recreate unrelated siblings.
- Pure text/size changes and transform/opacity changes of structural ancestors refresh their own metadata. Descendant cached pixels survive placement-only sidebar movement. A transformed/opaque child baked into an atomic bitmap still dirties that containing bitmap. Real inherited/style changes keep the subtree refresh path.
- Child insertion/removal can retain unchanged sibling metadata when accessible stylesheets contain no structural/relation selectors. Otherwise the changed parent subtree is refreshed conservatively. This is not a CSS dependency graph: a relation selector changing a different sibling outside that refreshed subtree is not dependency-tracked.
- Explicit effect declarations are retained locally while their selected-source membership is refreshed separately. Source-selector matching and cold content/image work remain visible CPU costs; the live-flow lookup itself does not scan every row.
- Decoded images belong to retained snapshots. Readiness dirties only resources referencing the URL, and unused images/textures are released. Drag images reuse cached raster canvases and carry `data-canvas-owned`, so their temporary DOM attachment cannot feed back into page painting.
- Scroll, mutation, input, resource and size events schedule frames. Visible CSS animations/video/owner canvas changes sustain required updates. A static page has no renderer animation loop. Progress updates may recompose the page without rerasterizing unchanged list text.

## Overlay scrollbars

- App mode discovers actual scrollers from the paint tree. Generic callers opt in with a real `data-canvas-scrollbar="overlay"` attribute. Native `scrollTop`/`scrollLeft` remain the only scrolling state.
- The helper owns only inline `scrollbar-width: none !important` and `scrollbar-gutter: auto !important` during takeover. Original values/priorities are restored on native editing, disposal or failure; unrelated authored style changes survive.
- One measurement supplies 8-pixel GPU tracks/thumbs and input geometry, including ancestor clipping, scale and RTL offsets. App scrollbar layers stay in the scroller's paint/opacity order, so later menus/dialogs cover them.
- Pointer/touch interaction is delegated through the original source DOM. There are no moving transparent hit-control elements and no per-frame hit-DOM style writes. Wheel/keyboard scrolling stays native. Track clicks and captured drags write the original scroller offsets without activating underlying rows.
- Completion click consumption follows the bar gesture's pointer ID, including an off-track release. New pointer input, cancellation and keyboard input clear that state; keyboard clicks are not consumed. No timer guesses event order. Nested, horizontal/RTL and touch-cancel paths use the same helper.

## Scope and validation

- The supported path is the maintained MusicCloud UI, not a full CSS/browser paint implementation. Authored gradients, arbitrary filters, multiple/inset shadows, arbitrary generated layouts, 3D/perspective and the full range of blending/inline/stacking combinations remain outside the validated subset. Rotated cross-resource overflow clips and general large-container tiling are not qualified as a complete CSS transform/tiling engine.
- Canvas follows main-thread native scroll notifications. It does not replace browser scrolling with an independent compositor-thread model. OS drag-ghost appearance and Safari/iOS device checks remain follow-up; Chromium validation does not establish device parity.
- Build: `node node_modules/typescript/bin/tsc --noEmit` and `npm run build:bundle`.
- Maintained tests: `TMPDIR=/data/musiccloud-canvas-work node --test --test-concurrency=1 tests/*.test.cjs` with Node 22+ and Chromium (`CHROMIUM_PATH` can override the executable). Generic/page/player tests retain actual GPU pixels, native controls, clipping/opacity/precision, failure restoration and player intent regressions.
- Page checks use local data and media without backend account writes. They cover one output, native row selection/keyboard/drag, editing and selection restoration, Settings/context menus/dialogs/toasts, play/pause/seek/volume, real video/fullscreen, FX owner notifications, loading/error/retry, ruby/timestamps/textarea/search, themes, fractional DPR, narrow-screen touch pan and failure/context loss.
- Native screenshot references validate current menu/toast/ruby/timestamp/progress content. A periodic high-frequency input checks the large blur against an independent CPU Gaussian and rejects repeated sparse-sampling patterns. Native capture is test evidence only, not a production render source.
- Whole-page hardware protocol, resource accounting, remaining CPU costs and evidence paths are in `canvas-scroll-performance.md`. The final scene retains all 500/5,000/20,000 requested DOM rows and separates list caches from the rest of the page.
