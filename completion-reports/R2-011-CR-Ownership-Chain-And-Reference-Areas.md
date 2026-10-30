# R2-011 — Completion Report: Ownership Chain And Reference Areas

| Field                 | Value                                                     |
| --------------------- | --------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule).         |
| Implementation commit | `3596d07`                                                 |
| Run mode              | Unattended batch (no pause at this gate).                 |
| Screenshots           | None (compile-only run).                                  |
| Mock comparison       | Not made visually; built on the existing graph/map surfaces. |

## What was built

Two analyst data enrichments, both gated on `data.read` (the panels self-gate and render nothing
without it).

- **Ownership chain.** `src/graph/ownershipApi.ts` — `ownershipChain(refs, { depth, direction, asOf })`
  (`POST /v1/graph/ownership-chain`). `src/graph/OwnershipChainPanel.tsx` — from the selected graph
  entity, a direction selector (both / what it owns / who owns it) and **Expand ownership chain**
  walk the chain and list every reached entity as a linked node (its title, type, the path's
  relation types, and a weakest-edge-label badge); clicking opens the entity. Mounted in the
  workbench `GraphSidePanel` under the selected node.
- **Reference areas.** `src/reference/referenceAreas.ts` — `searchReferenceAreas(q)`,
  `getReferenceArea(code)`, and `areaGeometry(area)` (a coded country/admin-1's fetched outline, or
  a `Point` for a place, which has no outline). `src/reference/ReferenceAreaPicker.tsx` — a floating
  panel on the full map: search, pick a result, and the chosen area is written to a new
  `referenceArea` store key; **Clear** removes it. The map outlines it through the **existing**
  `AreaOutlines` overlay plumbing (`MapView` passes `referenceArea.geometry` as the viewer's
  `areas`), reusing the situation-footprint path rather than adding a second one.
- **Relation edges.** The five ownership edges (`owns`, `controls`, `officer-of`,
  `beneficial-owner`, `affiliated-with`) are added to `RELATION_TYPES`, so they appear in the
  relation filter and the legend, under a new `ownership` edge family (directional, drawn in the
  theme's violet). `edgeFamily`'s `default` now explicitly maps any **unlisted** `x-extensible-enum`
  wire type to the generic `related` family, so an unknown relation type renders as a plain edge
  rather than being dropped.

## Reuse (not a second path)

- The drawn area feeds the same `AreaOutlines` component that draws situation/investigation
  footprints; the picker only populates a store key and the map reads it.
- The ownership-chain nodes reuse the panel's existing row/link styles and `onOpen`.
- The ownership edges reuse the existing `RELATION_TYPES` filter list, `edgeFamily`/`familyColors`
  legend, and `familyArrow` direction — one family added, every consumer compile-checked.

## Tests written (not run)

- **`src/graph/ownershipApi.test.ts`** — sends the seed refs with the documented defaults
  (direction `both`, depth 6) and returns the chains; passes a chosen direction.
- **`src/graph/ownershipEdges.test.ts`** — `RELATION_TYPES` contains the five ownership edges;
  `edgeFamily` maps each to `ownership`; an unlisted type and `undefined` map to `related`.
- **`src/graph/OwnershipChainPanel.test.tsx`** — walks the chain, lists reached entities, opens one
  on click; hidden without `data.read`.
- **`src/reference/referenceAreas.test.ts`** — search by text; outline by code; `areaGeometry`
  fetches a coded outline and draws a place as a point without a fetch.
- **`src/reference/ReferenceAreaPicker.test.tsx`** — searching and selecting writes the outline into
  the store; hidden without `data.read`.

## Checks

| Check                                                   | Result                              |
| ------------------------------------------------------- | ----------------------------------- |
| `npm run typecheck`                                     | Passed                              |
| `npm run lint`                                          | Passed                              |
| `npm run build`                                         | Passed (pre-existing chunk warning) |
| `npm test`, `npm run e2e`, browser run                  | **Not run** (standing rule)         |
| Guard: `check_us_english.py` over the new/changed files | 0 British spellings                 |

(`npm run generate` not needed: surface generated at 2.0.0 in R2-001.)

## Decisions taken (unattended)

1. **Ownership chain in the workbench graph side panel**, under the selected node — the natural
   "from a selected entity" surface; it lists reached entities rather than re-laying-out the sigma
   graph, which can't be verified without a browser.
2. **Reference-area outline via the shared store key + `AreaOutlines`** on the full map, reusing the
   footprint overlay; a place (no outline) draws as a point.
3. **A dedicated `ownership` edge family** (not folding ownership into `related`) so the legend and
   filter name the ownership edges distinctly, which is what "surface in the legend" asks for.
4. **Picker on the full `/map` view only.** The Global dashboard map is left unchanged this pass
   (owner question 1).

## Owner questions

1. **Picker placement.** The reference-area picker and its outline are on the full-screen `/map`.
   Should the Global dashboard map carry them too (its `hiddenSources` already shares the store)?
2. **Ownership-chain rendering.** The chain is a linked list of reached entities under the selected
   node. Should reached entities instead be injected into the sigma graph as nodes/edges (a visual
   sub-graph), given that is a layout change best verified in a browser?
3. **Direction/depth controls.** The panel exposes direction; depth defaults to 6. Expose depth and
   a confidence floor too, or keep it minimal?

Questions carried from R2-001–R2-010 keep their defaults.
