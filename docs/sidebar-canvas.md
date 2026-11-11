# DOM/CSS Canvas rendering and native sidebar material

The renderer paints an existing DOM subtree. DOM and CSS retain layout, native scrolling/sticky positioning, hit testing, focus, accessibility and event handlers. Canvas2D produces reusable paint resources; WebGL composites them on a transparent output Canvas. No DOM screenshots, cloned page, custom scroll position or parallel business model are involved.

## Native material ownership

- MusicCloud creates `.sidebar-material` outside the source scroller, inside `#sidebar-shell`. This DOM element alone owns the external `backdrop-filter`, translucent light/dark tint and right border. The filter samples the browser's actual underlying main-page DOM.
- Material starts at the shell's content edge. The mobile 200-pixel gesture padding stays outside the painted material. The shell retains existing pan/hide/peek transforms and stacking above the z99 overlay. The material ends at the main container, above the bottom player.
- `#sidebar` has a transparent background. The output Canvas has no native-material pixels. On disposal/failure/context loss the material remains and ordinary DOM content becomes visible again; an opaque source background does not cover the glass.
- Internal headers have ordinary CSS background tint, border and shadow. They have no second native backdrop filter. Their custom content blur only reads selected source-subtree paint resources, never the external material or main page.

## Generic renderer entry point

`new DOMCanvasRenderer(source, host)` paints a source subtree into its positioned host. The source and Canvas share the host's movement. The renderer owns Canvas positioning/pointer transparency, its root-only paint-suppression rule, observer/resource lifetime and restoration. The host owns its own background/material and native geometry. It must be a positioned containing block; the renderer does not alter the host's layout mode.

Callers provide no list/header arrays, semantic membership, z-index threshold or paint-pass configuration. `SidebarCanvas.ts` only mounts the renderer and adds the application's output class. Its core modules do not import application models, routers or view state.

- `DOMPaintTree.ts` derives paint-resource boundaries from DOM/computed CSS, native dimensions, explicit stacking contexts, sticky boxes and custom-effect/source boundaries. Small unfragmented subtrees reuse a surface; large scroll containers are split into their normal child subtrees. It preserves the block/flex/positioned stacking subset as a hierarchy: a high-z descendant cannot escape a lower-z context, and static flex/grid items get their context from their parent's layout mode.
- `DOMCanvasRenderer.ts` batches reads, tracks nearby resources with IntersectionObserver, reads only active resource/ancestor geometry on scroll, and evicts offscreen resources. Content/layout/style changes dirty resources; opacity/translation/scroll can reuse pixels. CSS shadows have separate cached raster resources so changing scroll shadows does not rerasterize foreground text. Root opacity applies once to the completed GPU output. Split opacity contexts use scoped, depth-reused compositor surfaces; nested opacity inside a cached resource is also composited once.
- `CanvasPaint.ts` paints solid backgrounds, borders/radii, inward focus outlines, native clipping, text, SVG and images from computed styles. Text ranges locate browser-measured lines; complete logical strings go through native Canvas shaping, including bidi, combining characters and joined emoji. Standalone SVG units use the same box/image path as embedded icons. Single outer CSS box shadows use Canvas2D shadow rasterization. Empty decorative `::before`/`::after` boxes are read from computed CSS, including their color, box dimensions and simple translation/scale; the drag marker has no application-specific paint overlay.
- `CanvasCompositor.ts` consumes an internal ordered content display list and transparent resource surfaces. It knows nothing about sidebar roles or native glass. Scoped opacity groups and regional blur are simple composition operations, not a dependency graph or shader configuration API. Normal CSS resources supply tint/foreground/shadow.

## Declarative content blur

`DOMCanvasEffects.ts` handles the renderer-only `data-canvas-blur` attribute separately from ordinary CSS painting. Its value contains CSS selectors scoped to the source root, identifying the DOM subtrees whose painted content is the blur input. Application initialization must set a real DOM attribute; the current webfx JSX attribute fallback assigns unknown keys as JavaScript properties.

- MusicCloud's login/settings header declares `data-canvas-blur="#sidebar-list ul, #sidebar-features"`.
- The playlist heading declares `data-canvas-blur="#sidebar-list ul"`.
- Their positions and paint order come from their native sticky layout and CSS stacking. The effect runs at that element's paint position, replaces sharp pixels only in its actual band, and then ordinary header CSS paints the crisp foreground/tint.
- Blur uses a fixed separable Gaussian kernel. Offsets and sampling margins are CSS pixels, so DPR changes resolution rather than radius. Work is restricted to the actual band and its sampling margin.

Native-scroll thumb drawing follows the source scroll position; the native scroller still owns scroll/scrollbar input. Native drag images reuse cached paint surfaces, while existing DOM handlers own reordering. These browser decorations are not a full native-widget renderer.

## Lifetime and inspection

Source DOM paint is suppressed only after a successful complete frame. Descendant computed opacity remains logical; source-root opacity is read with suppression temporarily removed during the read phase and restored synchronously. Own suppression records are ignored, avoiding an observer feedback loop. `dispose()` restores DOM paint, disconnects observers/listeners and releases resources. Missing WebGL, image/CORS failures, upload/raster errors and context loss retain or restore DOM rendering. Lost contexts do not automatically retry.

There is no idle animation loop. Events/mutations/resize/scroll schedule a frame; only running finite CSS transitions/animations sustain more frames. Shared-host placement-only style updates reuse pixels, while inherited host colors/fonts/custom properties invalidate them. `stats` reports frames, snapshots, foreground rasterizations, decoration rasterizations and current cached foreground resources.

## Supported subset and remaining scope

The implemented subset covers the maintained sidebar and unrelated ordinary block/flex/positioned subtrees without a custom binding. It is not a complete browser paint implementation. Arbitrary rotations/perspective, gradients/background images, general filters, multiple/inset shadows, generated text pseudo-content, complex floats/inline/negative-z interactions and the full range of CSS blending/stacking combinations are outside this phase's validated subset. Decorative pseudo boxes support the explicit simple box geometry needed here, not arbitrary generated layouts. Large painted container backgrounds beyond the visible-resource cases have not been qualified as a general-purpose tiling system.

Canvas follows main-thread native scroll notifications; it does not add an independent compositor-thread scroll implementation. Cross-origin images need a Canvas-readable server CORS policy; unreadable images restore the entire native source rather than leaving a partially missing surface. Native drag-ghost visual parity and iOS/Safari/device behavior remain device follow-up, not a claim from synthetic drag events.

## Validation

- Build: `pnpm run build:typecheck` and `pnpm run build:bundle`.
- Tests: `node --test tests/*.test.cjs` with Node 22+ and Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`). Tests use a temporary local server with the real production bundle and no backend account. Set `TMPDIR=/data/musiccloud-canvas-work` in the maintained lab; other environments use their normal temporary directory.
- Production checks cover actual visible list pixels, bounded nearby caching, zero idle frames, scroll/pan reuse, mouse hit/press, dynamic names/playing state, text/SVG/avatar/theme/empty state, disposal and actual context loss. Both production header attributes are checked, and removing the top-header effect increases actual GPU edge contrast. Native glass is tested by comparing browser-composited stripe contrast with the material filter enabled/disabled and by checking transparent Canvas output and retained material after disposal.
- An unrelated root/host check covers static flex-item z-index, nested contexts, source-root opacity once, group opacity across resource boundaries and direct SVG decode/paint without sidebar classes or binding.
- GPU checks retain sharp pixels outside the effect band, replace sharp pixels within it, exclude unselected background, preserve crisp foreground and compare CSS-space blur at DPR 1 and 2. Existing player regressions run in the same 21-test suite.

Chrome checks are separate from the deferred Mac/iOS environment. Device verification will resume when that environment is available.
