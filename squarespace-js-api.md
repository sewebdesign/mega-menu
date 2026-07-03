# The undocumented `window.Squarespace` API

Notes reverse-engineered from Squarespace's `common-*.js` bundle (the webpack build that
defines `window.Squarespace` on every 7.1 site). Saved locally as `maybe-common.txt`.
Line numbers below refer to that file. Bundle contents change between Squarespace
releases, so re-verify line numbers after they ship updates — the method names have been
stable for years, though.

## How to explore it yourself

- **Enumerate at runtime:** in DevTools console on any Squarespace page run
  `Object.keys(window.Squarespace).sort()` — every method, including private `_`-prefixed ones.
- **Read a method's source:** `window.Squarespace.initializePageContent.toString()`.
- **Find it in the bundle:** DevTools → Sources → `common-*.js` → click `{}` (pretty-print) →
  Ctrl+F for the method name. Or save the pretty-printed file (what `maybe-common.txt` is)
  and grep for `Squarespace.<name> = `.
- **Call signature convention:** almost every method takes `(Y, node)` — `Y` is the YUI
  sandbox instance, `node` an optional YUI Node to scope the work to (defaults to the whole
  document when omitted).

## The method that started this: `initializePageContent`

Line 3335 — it's just a convenience wrapper:

```js
Squarespace.initializePageContent = function (Y, node) {
  Squarespace.initializeLayoutBlocks(Y, node);
  Squarespace.initializeWebsiteComponentForContentPreview(Y, node);
  Squarespace.initializeCollectionPages(Y, node);
};
```

So calling `initializeLayoutBlocks` + `initializeWebsiteComponent` + `initializePageContent`
(as mega-menu.js originally did) ran **layout blocks twice** and **website components
twice**. Worse, the `ForContentPreview` variant (line 3642) is the *editor preview* version:
it re-downloads each component's definition script and calls the component registry with
`forceRefresh: true`, force-re-initializing components that were already live — that's what
made the accordion toggle open and instantly closed.

What Squarespace itself runs on a normal visitor page load is `globalInit` (line 3054), and
for block content it calls exactly this pair:

```js
Squarespace.initializeLayoutBlocks(Y);
Squarespace.initializeWebsiteComponent(Y);   // not the ForContentPreview variant
```

That's the pattern to copy when injecting fetched content (and what mega-menu.js does now).

## The three initializers that matter for injected content

### `initializeLayoutBlocks(Y, node)` — line 3210
The workhorse. Scans the node for every classic block type and initializes each:
video/embed, image, shape, product & collection-link images, SoundCloud, map, forms,
newsletter, donation, **legacy accordion** (`.sqs-block-accordion:not(.sqs-block-website-component)`),
marquee, scaled text, text highlight, button, pricing plan, aspect-ratio blocks,
gallery, Flickr/Instagram/500px, OpenTable, Tock, audio player, tour dates, calendar,
Zola, Acuity, search, chart, social links, menu block.

### `initializeWebsiteComponent(Y)` — line 3606
For the newer React-based "website component" blocks (`data-block-type="1337"`, class
`sqs-block-website-component` — the modern accordion is one of these). Lazy-loads extra
chunks if form/donation/meeting components are present, then for every
`[data-website-component-id]` element asks the component registry to
`load({ definitionName, id, element })`, which fetches the component's `visitor.js`
(the `data-block-scripts` URL) and mounts it.

### `initializeWebsiteComponentForContentPreview(Y, node)` — line 3642
Editor-preview variant of the above: same registry load but with `forceRefresh: true` and a
forced re-download of the definition script. **Avoid on live pages** — re-running it against
already-initialized components is the double-init/flicker trap.

## Full method list (grouped)

Bootstrap / lifecycle
- `load(win)` — entry point; builds the YUI sandbox, wires `afterBodyLoad`. Guards against running twice.
- `afterBodyLoad()` — loads the rollup modules, then fires `globalInit`.
- `globalInit(Y)` — visitor-page boot: layout blocks, website components, lightbox, video,
  native video, cart, SVGs, Disqus, announcement bar, popup overlays, mobile info bar.
- `addLoadTrigger(selector, [modules])` — "when `selector` exists on the page, load these
  YUI modules." How Squarespace lazy-loads audio players, comments, etc.
- `onDestroy(Y, fn)` — register a teardown callback (used in the editor when content is re-rendered).
- `SQUARESPACE_INITIALIZED_ONCE` — boolean flag set after first full init.

Content initializers (aggregate)
- `initializePageContent(Y, node)` — layout blocks + website components (preview variant) + collection pages. Editor-oriented.
- `initializeLayoutBlocks(Y, node)` — all classic blocks (see above).
- `initializeWebsiteComponent(Y)` / `initializeWebsiteComponentForContentPreview(Y, node)` — see above.
- `initializeCollectionPages(Y, node)` — events collection list/calendar views.

Per-block initializers (all `(nodeOrY, Y)`-ish; called for you by the aggregates)
- `initializeAccordionBlock` (legacy accordion), `initializeMarqueeBlock`,
  `initializeButtonBlock`, `initializeFormBlocks`, `initializeNewsletterBlock`,
  `initializeDonationButton`, `initializePricingPlanBlock`, `initializeSummaryV2Block`,
  `initializeSoundcloudBlock`, `initializeVideoBlock`, `initializeVideo`,
  `initializeNativeVideo(Y, {isVisitorWebsite, parentElement})`, `initializeChartBlock`,
  `initializeSearchBlock`, `initializeMenuBlock`, `initializeOpenTableBlock`,
  `initializeZolaBlocks`, `initializeAcuityBlocks`, `initializeScaledText`,
  `initializeTextHighlight`, `initializeContainerStyles` (blend-mode/blur/stroke wrappers),
  `initializeImageBlockDynamicElements`, `initializeAspectRatioBlocks`,
  `initializeSocialLinks`, `initializeGlobalLightbox`, `initializeSvgs`.

Commerce
- `initializeCommerce(Y)`, `initializeCartPage(Y)`, `initializeReservedCart(Y)`.

Utilities / internal
- `getSession`, `setSession`, `createCookie` — cookie/session helpers.
- `initializeDisqusCommentLinks`, `_humanizeAllDates(selector)` — "3 days ago" dates.
- `shouldRedirectToConfig`, `injectRollups`, `_injectStylesheetFromTopFrame`,
  `_userHasViewerRole` — editor-frame plumbing; don't call these.

## Rules of thumb for injected content (mega menus etc.)

1. Mirror `globalInit`: call `initializeLayoutBlocks` + `initializeWebsiteComponent` on the
   new container, nothing else, exactly once per container.
2. Never call `initializePageContent` on top of those — it overlaps both.
3. Never call the `ForContentPreview` variant on a live page.
4. Guard against re-entry — none of these methods are idempotent; re-running them
   double-binds event handlers (symptom: accordions/toggles open and instantly close).
5. Cloned website components keep their `id`/`aria-controls` attributes — two copies in the
   DOM at once (desktop + mobile clone) means duplicate IDs, and `visitor.js` wiring via
   `getElementById` will hit the first copy only.
