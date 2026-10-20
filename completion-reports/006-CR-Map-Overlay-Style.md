# 006 — Completion Report: Map Overlay Style

| Field                 | Value                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Status                | Complete                                                                                   |
| Implementation commit | `2e6f9a4b949e5b1c7803c19e388b105636a7f7ab`                                                 |
| Screenshot            | `review/006-map-overlay-style.png` (1672×941, dev server against the live backend, 2D)     |
| Legend close-up       | `review/006-legend.png` (the panel at device pixel ratio 2, so the `@2x` sprite)           |
| One kind, three looks | `review/006-legend-conflict.png` (filtered to "conflict": ACLED, GDELT and UCDP)           |
| Attribution line      | `review/006-attribution-intercepted.png` (**test-only response**, see "Attribution" below) |

## What was built

All of it is in `src/map/style/`.

- **`parseStyle.ts` and `model.ts`: the style model.** `parseOverlayStyle` turns the
  `getMapStyle` response into a `StyleModel`.
  - **One `KindStyle` per (source layer, kind).** Each has its point, line, fill and outline
    styles, wherever the style defines them.
  - **A point is an icon or a circle.**
    - An icon has its sprite name, color rule, halo, and rotate field with its alignment.
    - A circle has its radius (fixed or a zoom ramp), size field, opacity and stroke.
  - **A color rule is a constant or a field match.** A match is the style's severity ramp: the
    field, whether it is case-insensitive, the cases and the fallback. Anything else is kept
    unparsed as `expression`. The live style has none.
  - **Filters become geometry families,** plus the `kind` clause on layers that carry several kinds.
  - **Each source layer gets its `metadata.foresignal` facts:** kinds, attribution, minzoom,
    `aggBelowZoom`, TileJSON URL.
    - Where it has one, also its hexagon layer: the `agg=hex` tiles, the count field, the color
      ramp, the opacity and the outline.
  - **How layers are placed.** By structure, not by parsing ids: `source-layer` names the owning
    layer, and a different `source` marks the aggregate. The role comes from the type and the
    geometry filter, so a line over polygons is an outline.
  - **What it cannot place goes to `skipped`.** It is never guessed.
  - **Helpers:** `stylesForKind`, `sourceLayer`, `colorFor` (evaluates a rule for a feature),
    `representativeColor`, `valueAtZoom` and `kindLabel`.
- **`loadOverlayStyle.ts`: loading.**
  - **The style:** `GET /v1/map/style.json` with `theme` and an optional comma-joined `layers`.
  - **The sprite:** the index and the PNG from `GET /v1/map/sprites/{spriteFile}`.
    - It takes the `@2x` files when the device pixel ratio is 1.5 or more.
    - The file name comes from the style's `sprite` URL and is checked against the operation's
      pattern. The request goes through the API client, so it uses the client's own backend URL and
      credentials, whatever host the style names.
    - **A sprite failure does not fail the style:** it logs a warning, and icons fall back to
      `getMapIcon`.
  - **`loadMapIcon`:** `GET /v1/map/icons/{name}.png`, returned as an object URL.
  - **`useOverlayStyle`:** the React hook. It reloads when the theme or the layer set changes.
- **`sprite.ts`: drawing the icons.** The sprite is a signed distance field (SDF): it holds
  distances in the alpha channel, not pixels to show.
  - **`SpriteSheet`** decodes the sheet's alpha channel and cuts out one icon.
  - **`renderSdf`** draws an icon with MapLibre's own symbol shader math (maplibre-gl 6.11.2,
    `symbol_sdf.fragment.glsl`):
    - the fill edge at 0.75;
    - the halo edge at `(6 − haloWidth) / 8`;
    - both smoothed by `0.105 / pixelRatio`;
    - the fill composited over the halo.

    So the legend shows each icon in its style color and halo, as a MapLibre map would.
- **`legendModel.ts` and `legend.tsx`: the legend.**
  - **One row per kind,** sorted by label.
  - **Each distinct look gets its own line** (icon or circle, and its representative color), with
    the sources that draw it.
  - **A kind colored by a field** shows its color cases, plus "other" for the fallback.
  - **Each row says** "Hexagon counts below zoom N" with the count ramp, or "From zoom N" when the
    points start above zoom 0.
  - **A filter box** matches label, id or source text.
  - **Placement:** the panel opens from a new **Show legend** button in the map's tool column. The
    button reports its state with `aria-pressed`.
- **`attribution.tsx` and `attributionModel.ts`: the attribution line.** It is built from the
  structured `Attribution` objects of `GET /v1/attributions` [`getAttributions`] and never
  hard-coded.
  - **Only entries with `requiredDisplay: true` show,** one per distinct text, each linked to its
    `url` or terms.
  - **An entry without the field is not shown.** The spec makes the field required, so a missing
    one says nothing about the license.
- **Wiring:** `App` → `GlobalDashboard` → `MapViewer` now passes the API client.
  - The viewer loads the style for the current theme. Only `dark` exists in the app today.
  - It renders the legend and the attribution.
  - Without a client, the legend button and the attribution are not rendered.

### A fourth operation

The prompt lists three operations. The attribution uses a fourth, `getAttributions`.

- The style's own `metadata.foresignal.layers[].attribution` is a plain string, with no
  `requiredDisplay`.
- The structured objects the prompt asks for exist only in `getAttributions`. The OpenAPI file
  describes that operation as being for map footers.

It is still OpenAPI only, with no backend change.

## How it was checked

### Tests (run this pass)

| Suite                      | What it covers                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `parseStyle.test.ts`       | The parse of a representative style. Header and layers, kinds and icons, one kind styled three ways by three sources, geometry roles, aircraft rotation, aggregation, a multi-kind layer split by filter, the severity match, skipped layers, expression readers, labels |
| `sprite.test.ts`           | File names and the pattern check, hex colors, `renderSdf` against the shader formula at known distances, cutting an icon from a sheet                                                                                                                                    |
| `loadOverlayStyle.test.ts` | Through the mock server: the query string, `@2x` and 1× sprite files with their `Accept` headers, the sprite 404 fallback, `FsError` on a 400, the icon fetch                                                                                                            |
| `legendModel.test.ts`      | Grouping, per-source looks, the aggregation zoom and ramp, minzoom, the color cases, the filter                                                                                                                                                                          |
| `legend.test.tsx`          | Loading and error states, rows and sprite icons in their style colors, the circle swatch, the hexagon line, the color cases, the no-sprite path, the filter, close                                                                                                       |
| `attribution.test.tsx`     | `requiredAttributions` filtering and dedupe; the line from a mocked `getAttributions` with its link and `source` query; nothing shown when no entry requires display, or with no sources                                                                                 |
| `MapHud.test.tsx`          | The legend button appears only with a handler, shows its pressed state and calls it                                                                                                                                                                                      |

**The fixture is real data.** `fixtures/overlay-style.json` is six layers cut unchanged from the
live dark style (29 style layers): acled, adsbfi-mil with its hexagon layer, aprs-is,
awc-gairmets, gdelt-events and ucdp-ged.

### The parse against the live style

The parse ran against both live themes this pass, with this output:

```
dark:  styleLayers 1956 layers 406 styles 485 kinds 191 icons 43 skipped 0 agg 16 aggBelowZoom 7 expr 0 iconPoints 326 circlePoints 159 rotating 28 severityMatch 40
light: styleLayers 1956 layers 406 styles 485 kinds 191 icons 43 skipped 0 agg 16 aggBelowZoom 7 expr 0 iconPoints 326 circlePoints 159 rotating 28 severityMatch 40
```

Every one of the 1,956 style layers was placed, none skipped.

### In a real browser

The browser was Chromium through Playwright, against the Vite dev server proxying the live backend
at `localhost:8080`. Each run pressed **Show legend**.

- **The legend.** The panel shows "191 kinds from 406 layers", with 191 rows and 114 icon swatches
  of 43 distinct icons.
  - All 114 icons were drawn from the sprite; none needed `getMapIcon`.
  - No row is missing a swatch.
- **The colors come out as styled.** Pixels were read back from the rendered icons; the most common
  opaque color is the style's color:

  | Kind            | Icon        | Style color | Most common pixel                              |
  | --------------- | ----------- | ----------- | ---------------------------------------------- |
  | aircraft        | fighter-jet | `#5C940D`   | `#5c940d` (898 px)                             |
  | conflict-event  | danger      | `#C92A2A`   | `#c92a2a` (37 px)                              |
  | earthquake      | circle      | `#E03131`   | `#e03131` (113 px)                             |
  | aviation-hazard | warning     | `#D9480F`   | `#d9480f` (58 px)                              |
  | aprs-station    | antenna     | `#2B8A3E`   | `#245430` halo (19 px), then `#2b8a3e` (15 px) |

  The antenna is thin enough that its halo covers more pixels than its fill.

- **The sprite resolves at both ratios.**
  - At ratio 1 the page requested `foresignal-1b0f0988.json` and `.png`, and drew icons at 21×21.
  - At ratio 2 it requested `foresignal-1b0f0988@2x.json` and `.png`, and drew icons at 42×42
    (fighter-jet at 108×108).
  - Every request returned 200.
  - Each request was made twice. That is React's development StrictMode running effects twice
    (`src/main.tsx`); a production build makes them once.
- **Filtering.** "conflict" leaves one row with three looks:
  - ACLED: a danger icon in `#C92A2A`;
  - GDELT: a blue circle;
  - UCDP: a danger icon in `#A61E4D`.
- **Hide legend** removes the panel.
- **No external requests and no console errors or warnings** in any run.

### Attribution

With the live backend, no attribution line shows. None of its 419 entries has `requiredDisplay`
(see owner question 1).

To see the line drawn, one run used Playwright to intercept `getAttributions`. It took the live
response, kept its first two entries and set `requiredDisplay: true` on them. **That response is a
test fixture, not backend data.** The line read "abuse.ch Feodo Tracker · abuse.ch URLhaus",
linked, above the coordinate bar (`review/006-attribution-intercepted.png`).

The run also caught an overlap: the legend panel's bottom edge covered that line by about 8 px. The
panel's maximum height was shortened so it now ends clear of it.

### Checks

| Check                                                         | Result                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm run typecheck`                                           | Pass                                                                        |
| `npm run lint`                                                | Pass                                                                        |
| `npx prettier --check .`                                      | Pass                                                                        |
| `npm test`                                                    | 33 files, 175 tests, all pass                                               |
| `npm run build`                                               | Pass                                                                        |
| `python3 ~/Documents/GitLab/meshdtn/style/test_us_english.py` | 14 tests, OK                                                                |
| `check_us_english.py`                                         | 781 hits. 777 are the generated API schema, as before. 4 are new: see below |

`check_us_english.py` ran over `src`, `scripts`, `completion-reports`, `README.md`,
`vite.config.ts` and both `public/*/README.md` files.

**The four new hits are the backend's own field names,** and were left as they are:

- `attribution.tsx` reads the API's license-URL field;
- `attribution.test.tsx` builds three `Attribution` objects whose license field has that spelling.

They cross the wire, so they are not renamed. The checker has no allow entry for them: its allow
list is in the meshdtn repository, and adding one is your call.

## Compared to the mockups

The Conflict mockup has the map legend: `design/Foresignal Conflict Intelligence Dashboard.png`.
It is compared here against `review/006-map-overlay-style.png` and `review/006-legend.png`.

**What matches:**

- the dark translucent panel with a short row per symbol: icon then label;
- icons in their category colors, with aircraft and danger glyphs of the kind the mockup draws;
- the panel opens over the map, beside the map tools.

**Known differences:**

1. **Placement.** The mockup puts the legend at top left, next to its zoom column. Here that corner
   holds the time box, as in the Global mockup. So the legend opens on the right, beside the tool
   column that has the new button.
2. **It lists every kind the style knows: 191.** The mockup lists the 15 on its map. Scoping to the
   visible layers needs the layer list, which arrives in 007. The filter box covers the gap until
   then.
3. **Sources and zoom notes.** Each row adds its source line and, where it applies, the
   hexagon-count zoom. The mockup's rows are icon and label only.
4. **Some symbols the mockup shows are not record kinds** (front line, territory change, troop
   movement). They would come from product legends (009) or later layers.
5. **No markers on the map yet.** Drawing records with this model is 007 and 010.

## Owner questions

1. **The live `getAttributions` omits `requiredDisplay`, which the spec marks required.**
   - The OpenAPI `Attribution` schema requires `text`, the license field and `requiredDisplay`.
   - All 419 live entries have `text`, the license field, `termsUrl`, `count` and `sourceId`.
   - None has `requiredDisplay`, `url`, `html` or the license-URL field.
   - **What the client does now:** an entry without the flag is not shown, so no attribution
     appears on the map today. Is that right until the backend sends the flag? Or should a missing
     flag count as "show"?
2. **Attribution `count` is 0 on every entry,** including `?kind=earthquake`, while `listKinds`
   reports `currentCount` 519 for earthquake. If the count were filled in, the line could list only
   the sources actually on screen. Is 0 expected here?
3. **Kinds have no display names.** `KindSummary` has `kind`, `currentCount`, `sources` and
   `display`, and `display` has an icon and color but no label.
   - Labels are derived from the id, so `aprs-station` reads "Aprs station" and `aerodrome-osm`
     reads "Aerodrome osm".
   - Should the backend carry a label, or is a client-side label table wanted?
4. **Three sprite icons are larger than the rest.** At 1×, fighter-jet and sailboat are 54 px and
   snow is 56 px; the other 85 are 21 px.
   - The legend scales every icon to the same swatch, so this does not show there.
   - On the map it would draw those three about 2.6× larger at the same `icon-size`.
   - Is that intended, or a sprite build issue?
5. **The legend lists all 191 kinds until 007 scopes it to the map's layers.** Is that acceptable
   as an interim state?

Earlier questions still open, with defaults in place:

- 004: the Alerts tab, the tagline and the user menu.
- 003: `security.openReads` missing from the live system response, and tile keys needing the agent
  scope.
- 002: `listObjectAnnotations` paging, and Retry-After as an HTTP date.
