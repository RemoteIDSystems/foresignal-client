# 006 — Completion Report: Map Overlay Style

| Field                 | Value                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Status                | Complete. Second pass: the owner's polish of 2026-10-19 (planner `7f9bdae`)                            |
| Implementation commit | `394c515945015b833896114a07774bfacdcf156f`                                                             |
| Earlier commit        | `2e6f9a4` (first pass: style model, sprite, legend, attribution)                                       |
| Screenshot            | `review/006-map-overlay-style.png` (1672×941, dev server against the live backend, 2D, legend open)    |
| Legend close-up       | `review/006-legend.png` (device pixel ratio 2, so the `@2x` sprite)                                    |
| Severity colors       | `review/006-legend-severity.png` (filtered to "warning")                                               |
| Expanded row          | `review/006-legend-expanded.png` (Aircraft opened: looks, sources, hexagon zoom)                       |
| About page            | `review/006-about-credits.png` (the new Data sources table)                                            |
| Attribution line      | `review/006-attribution-intercepted.png` (first pass, **test-only response**, see "Attribution" below) |

## History of this prompt

1. **`2e6f9a4`: the first pass.** The style model, the sprite rendering, the legend and the
   attribution line. Approved by the owner.
2. **`394c515`: this pass** (planner `7f9bdae`). The owner's polish:
   - **Kind labels** from an acronym-aware prettifier in `lib/`.
   - **Icon size** normalized, so the oversized sprite icons match the rest.
   - **Legend rows** matched to the Conflict mockup, with the detail moved to a tooltip and an
     expandable section.
   - **Every attribution** listed on the About page.
   - **Backend observations** recorded below, with no client workarounds.

## What was built

### This pass

- **`src/lib/labels.ts`: `prettifyId`.** It turns a backend id into a display label.
  - The id is split on `-` and `_` and each word is title-cased. Minor words (`of`, `and`, `the`…)
    stay lowercase after the first word.
  - **`LABEL_TOKENS` spells acronyms and product names the way their owners do:** `ADS-B`, `AIS`,
    `APRS`, `RF`, `SIGINT`, `UAV`, `UAS`, `BGP`, `CVE`, `METAR`, `TAF`, `PIREP`, `ShakeMap`,
    `ProbSevere`, `URL`, `U-Turn`, `X-Ray`, and 19 more.
  - **`LABEL_OVERRIDES` covers the 11 ids no rule reads well.** For example, `cpa` → "Closest Point
    of Approach", `pol-place` → "Pattern-of-Life Place" and `aerodrome-osm` → "Aerodrome (OSM)".
  - **The OSM data-center kind's backend id keeps its British spelling, but its label is "Data Center (OSM)".**
    The id crosses the wire; the label is US English.
  - **Results:** "APRS Station", "AIS Gap", "ShakeMap MMI", "Data Center (OSM)", "Closest Point of
    Approach", "BGP Hijack".
  - All 191 live kinds were printed through it and read through this pass. That reading is what
    added `URL`, `U-Turn` and `X-Ray`.
  - `kindLabel` in the style model now calls it. The 007 layer rail will too, which is why it lives
    in `lib/`.
- **`sprite.ts`: the display size of an icon.** On screen what matters is the size of the drawn
  shape, not the sprite cell around it.
  - **`glyphSize(name)`** measures the shape: the larger side of the box around the pixels inside
    the fill edge, in CSS pixels.
  - **`referenceGlyphSize()`** is the median shape size across the sprite.
  - **`displayScale(name)`** is 1 for an ordinary icon. For an icon more than 1.5 times that median
    (`OVERSIZED_FACTOR`), it is `median / size`.
  - **`displaySize(name)`** is the cell size at that scale.
  - **The rule finds the oversized icons by measuring them, with no list of names.** On the live
    sprite at 1×, shapes are 11–15 px for 85 icons. fighter-jet and sailboat are 48 px and snow is
    48 px tall, so those three scale by about 0.27.
  - **The legend draws every icon at `displaySize`.** The map draws no record icons yet: 007 and 010
    multiply the style's `icon-size` by `displayScale` when they do.
- **`legend.tsx`: rows matched to the Conflict mockup.** Each kind is one compact line: its icon,
  its label and, for a kind colored by severity, its severity colors as small squares.
  - **Sources and zoom notes are no longer on the row.** They are in two places:
    - **the row's tooltip:** the sources per look, then "Hexagon counts below zoom N" or "From zoom
      N";
    - **the expandable detail,** opened from the row's chevron: each look with its symbol and
      sources, the named severity cases with "other", and the zoom note with the hexagon color
      ramp.
  - **The row is a native `<details>` element,** so it opens with a click or the keyboard without
    extra code.
  - **The tooltip text comes from `legendTooltip` and `zoomNotes`,** in `legendModel.ts`.
- **About page: every attribution.** A new **Data sources** section (`src/app/SourceCredits.tsx`)
  lists every `getAttributions` entry, whether or not `requiredDisplay` is set.
  - Each distinct line and license appears once, sorted by text, linked to its URL, terms or
    license page when it has one.
  - `creditList` and `attributionHref` sit beside `requiredAttributions` in `attributionModel.ts`.
  - **The on-map line is unchanged:** it still shows only entries with `requiredDisplay: true`.

### From the first pass

All of it is in `src/map/style/`.

- **`parseStyle.ts` and `model.ts`: the style model.** `parseOverlayStyle` turns the
  `getMapStyle` response into a `StyleModel`.
  - **One `KindStyle` per (source layer, kind),** with its point, line, fill and outline styles.
  - **A point is an icon or a circle.**
    - An icon has its sprite name, color rule, halo, and rotate field with its alignment.
    - A circle has its radius (fixed or a zoom ramp), size field, opacity and stroke.
  - **A color rule is a constant or a field match** (the severity ramp: field, case-insensitivity,
    cases, fallback). Anything else is kept unparsed as `expression`. The live style has none.
  - **Filters become geometry families,** plus the `kind` clause on multi-kind layers.
  - **Each source layer carries its `metadata.foresignal` facts:** kinds, attribution, minzoom,
    `aggBelowZoom`, TileJSON URL. Where it has one, it also carries its hexagon layer: the `agg=hex`
    tiles, count field, color ramp, opacity and outline.
  - **Layers are placed by structure, not by parsing ids.** `source-layer` names the owning layer,
    and a different `source` marks the aggregate. What cannot be placed goes to `skipped`; it is
    never guessed.
- **`loadOverlayStyle.ts`: loading.**
  - **The style:** `GET /v1/map/style.json` with `theme` and an optional comma-joined `layers`.
  - **The sprite:** the index and the PNG from `GET /v1/map/sprites/{spriteFile}`, taking `@2x`
    when the device pixel ratio is 1.5 or more.
    - The request goes through the API client, so it uses the client's own backend URL and
      credentials.
    - A sprite failure only logs a warning; icons then come from `GET /v1/map/icons/{name}.png`.
- **`sprite.ts`: drawing the icons.** `renderSdf` draws an SDF icon with MapLibre's own symbol
  shader math (maplibre-gl 6.11.2, `symbol_sdf.fragment.glsl`):
  - the fill edge at 0.75;
  - the halo edge at `(6 − haloWidth) / 8`;
  - both smoothed by `0.105 / pixelRatio`.

  So the legend shows each icon in its style color and halo.

- **The legend panel** opens from a **Show legend** button in the map's tool column. It has a
  filter box that matches label, id or source.
- **`attribution.tsx`: the on-map attribution line.** It comes from `GET /v1/attributions`
  [`getAttributions`], never hard-coded. It shows entries with `requiredDisplay: true`, one per
  distinct text.
  - This is a fourth operation beyond the three the prompt lists. The structured attribution
    objects exist only there.

## How it was checked

### Tests

| Suite                      | What it covers                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `labels.test.ts` (new)     | Title case; acronyms and product names; minor words; overrides, whatever the case of the id; the backend id with a British spelling getting a US label; empty ids                                                                                         |
| `sprite.test.ts`           | File names, hex colors, `renderSdf` against the shader formula, cutting an icon. **New:** shape size measured inside the fill edge, not the cell; ordinary icons at 1, an oversized one scaled to the median; CSS pixels on a 2× sheet                    |
| `legend.test.tsx`          | **Rewritten:** one compact row per kind with icon, prettified label and severity colors; sources and zoom out of the row, in its tooltip and detail; a row expands from its summary; icons at their normalized size; the no-sprite path; filter and close |
| `legendModel.test.ts`      | Grouping, per-source looks, the aggregation zoom and ramp, minzoom, color cases, the filter, prettified labels. **New:** the tooltip text and zoom notes                                                                                                  |
| `attribution.test.tsx`     | `requiredAttributions`; the on-map line from a mocked `getAttributions`. **New:** `creditList` keeps every entry, required or not, once per text and license, sorted; `attributionHref`'s order                                                           |
| `App.test.tsx`             | The About page: **new:** the Data sources table lists entries without `requiredDisplay`, sorted, with their links and count                                                                                                                               |
| `parseStyle.test.ts`       | The parse of a representative style, cut unchanged from the live dark style (labels updated)                                                                                                                                                              |
| `loadOverlayStyle.test.ts` | Query string, sprite files and headers, the 404 fallback, `FsError`, the icon fetch                                                                                                                                                                       |
| `MapHud.test.tsx`          | The legend button                                                                                                                                                                                                                                         |

### The parse against the live style

From the first pass, against both live themes:

```
dark:  styleLayers 1956 layers 406 styles 485 kinds 191 icons 43 skipped 0 agg 16 aggBelowZoom 7 expr 0 iconPoints 326 circlePoints 159 rotating 28 severityMatch 40
light: styleLayers 1956 layers 406 styles 485 kinds 191 icons 43 skipped 0 agg 16 aggBelowZoom 7 expr 0 iconPoints 326 circlePoints 159 rotating 28 severityMatch 40
```

This pass did not touch the parser.

### In a real browser, this pass

The browser was Chromium through Playwright, against the Vite dev server proxying the live backend
at `localhost:8080`. Everything below was read from the rendered page, not from the component tree.

- **Rows.** There are 191 rows, each 28 px tall.
  - No row line contains a source or a URL.
  - All 191 have a tooltip.
  - Five have severity colors: Aviation Hazard, Flood Warning, NWS Alert, Road Event and Tsunami
    Warning, each with four.
- **Labels,** as rendered: "Aerodrome (OSM)", "Air Quality", "Air Raid Alert", "APRS Station",
  "AIS Gap", "ShakeMap MMI", "Data Center (OSM)", "Closest Point of Approach", "BGP Hijack".
- **Icon size.** Each row icon's drawn shape was measured from its pixels (alpha ≥ 50%) times its
  rendered scale, in CSS pixels.
  - Across all rows: 11 px minimum, 13 px median, 15 px maximum.
  - fighter-jet (Aircraft) draws at 13 px, in a 14.6 px cell.
  - snow (Snow Observation) draws at 13 px, in a 15.2 px cell.
  - warning, danger and antenna draw at 13, 15 and 15 px, in 21 px cells.
  - Before this pass the legend stretched every cell to one swatch size, so the outliers' shapes
    filled more of it.
  - **The live style uses no sailboat icon.** Searching the style's layers for `icon-image`
    "sailboat" found none, so there is no rendered measurement for it. The same rule covers it: its
    shape is 48 px, like fighter-jet's.
- **Colors.** Pixels were read back from the rendered icons; the most common opaque color is the
  style color:

  | Kind            | Icon        | Style color | Most common pixel                              |
  | --------------- | ----------- | ----------- | ---------------------------------------------- |
  | aircraft        | fighter-jet | `#5C940D`   | `#5c940d` (898 px)                             |
  | conflict-event  | danger      | `#C92A2A`   | `#c92a2a` (37 px)                              |
  | earthquake      | circle      | `#E03131`   | `#e03131` (113 px)                             |
  | aviation-hazard | warning     | `#D9480F`   | `#d9480f` (58 px)                              |
  | aprs-station    | antenna     | `#2B8A3E`   | `#245430` halo (19 px), then `#2b8a3e` (15 px) |

  The antenna is thin enough that its halo covers more pixels than its fill.
  - All 212 icons on the page come from the sprite: 43 distinct icons across the rows and their
    details, with no `getMapIcon` fallbacks.
  - No row is missing a symbol.

- **Expand and tooltip.** Clicking the Aircraft row opened its detail: four looks with their
  sources, then "Hexagon counts below zoom 7" and the ramp. Its tooltip carries the same lines.
- **About page.** It reads "290 attributions from the backend, for every source it reads".
  - The table has 290 rows, 121 of them linked.
  - The live backend has 419 entries, which reduce to 290 distinct (text, license) pairs.
  - License ids stay on one line. The first screenshot broke `provider-terms` at its hyphen, which
    was fixed.
- **No external requests and no console errors or warnings** in any run.

### Attribution

The on-map line is unchanged and still gated by `requiredDisplay`, so with the live backend it does
not appear (observation 1).

In the first pass, Playwright intercepted `getAttributions` and set `requiredDisplay: true` on two
live entries. **That response is a test fixture, not backend data.** The line then appeared,
linked, above the coordinate bar (`review/006-attribution-intercepted.png`).

### Checks

| Check                                                         | Result                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run typecheck`                                           | Pass                                                                          |
| `npm run lint`                                                | Pass                                                                          |
| `npx prettier --check .`                                      | Pass                                                                          |
| `npm test`                                                    | 34 files, 189 tests, all pass                                                 |
| `npm run build`                                               | Pass                                                                          |
| `python3 ~/Documents/GitLab/meshdtn/style/test_us_english.py` | 14 tests, OK                                                                  |
| `check_us_english.py`                                         | 793 hits: 777 in the generated API schema as before, and 16 wire names, below |

`check_us_english.py` ran over `src`, `scripts`, `completion-reports`, `README.md`,
`vite.config.ts` and both `public/*/README.md` files.

**The 16 hits outside the schema are all names the backend sends,** and per the owner's instruction
they are left unchanged:

- **13 are the `Attribution` license field and license-URL field,** read in `attributionModel.ts`
  and `SourceCredits.tsx` and built in `attribution.test.tsx` and `App.test.tsx`.
- **3 are the OSM data-center kind's id,** the override key in `labels.ts` and its test. Its
  displayed label is "Data Center (OSM)".

## Compared to the mockups

The Conflict mockup has the map legend: `design/Foresignal Conflict Intelligence Dashboard.png`.
It is compared here against `review/006-map-overlay-style.png`, `review/006-legend.png` and
`review/006-legend-severity.png`.

**What matches:**

- the dark translucent panel with one short line per symbol: icon, then label;
- icons in their category colors at one consistent size, with aircraft and danger glyphs like the
  mockup's;
- no source text on the rows.

**Known differences:**

1. **Severity colors and a chevron.** Rows add the severity squares (as the owner asked) and an
   expand chevron. The mockup's rows have neither.
2. **It lists every kind the style knows: 191.** The mockup lists the 15 on its map. Scoping to the
   enabled layers is built in 007, since it needs the layer rail.
3. **Placement.** The legend opens on the right, beside the tool column; the mockup puts it at top
   left. 007 settles it against the mock once the rail exists.
4. **Some symbols the mockup shows are not record kinds** (front line, territory change, troop
   movement). They come with product legends (009) or later layers.

## Backend observations

These are for the backend to address. The client handles each one correctly as things stand and
works around none of them.

1. **`requiredDisplay` is missing from all 419 `getAttributions` entries.**
   - The OpenAPI `Attribution` schema lists it as required.
   - The live entries carry `text`, the license field, `termsUrl`, `count` and `sourceId`.
   - None carries `requiredDisplay`, `url`, `html` or the license-URL field.
   - **Client behavior:** the on-map line shows no entry, because none says it must, and the About
     page credits all of them.
2. **Attribution `count` is 0 on every entry,** including `?kind=earthquake`, while `listKinds`
   reports `currentCount` 519 for earthquake.
3. **Three sprite icons are drawn far larger than the rest.**
   - At 1×, fighter-jet and sailboat sit in 54 px cells and snow in a 56 px cell. Their shapes are
     48 px, against 11–15 px for the other 85 icons in 21 px cells.
   - **Client behavior:** `displayScale` brings them to the median, measured, with no list of
     names. If the sprite is fixed, the factor becomes 1 by itself.
4. **No kind display names in the API.**
   - `KindSummary` has `kind`, `currentCount`, `sources` and `display`. `display` has an icon and a
     color but no label.
   - The live `getKindSchema` `title` is the id itself (`conflict-event`, `aprs-station`,
     and the OSM data-center id).
   - The only `kindLabel` in the schema is an Alertmanager setting: the name of the alert label
     that becomes a record's kind.
   - **Client behavior:** labels come from `prettifyId`. A backend label, if one is added, would
     replace it.

## Owner questions

None new from this pass.

Earlier questions still open, with defaults in place:

- 004: the Alerts tab, the tagline and the user menu.
- 003: `security.openReads` missing from the live system response, and tile keys needing the agent
  scope.
- 002: `listObjectAnnotations` paging, and Retry-After as an HTTP date.
