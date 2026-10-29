# R2-011 — Ownership Chain And Reference Areas

**Goal.** Two analyst data enrichments: the ownership chain of an entity in the relationship graph,
and reference-area lookup for selecting and labeling areas on the map.

**Read first.** R2-006-CR; 024-CR (Relationship-Graph) and 017-CR (Search-And-Ask).
Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `POST /v1/graph/ownership-chain` [`ownershipChain`] — body `OwnershipChainRequest` →
  `OwnershipChain` (`OwnershipChainNode[]`).
- `GET /v1/reference/areas` [`searchReferenceAreas`] → `ReferenceArea[]`.
- `GET /v1/reference/areas/{code}` [`getReferenceArea`] → `ReferenceAreaOutline`.
- All gated `data.read`.

**Build.**
- An ownership-chain view in the relationship graph (prompt 024): from a selected entity, expand its
  `ownershipChain` and render the `OwnershipChainNode` path as linked nodes.
- A reference-area picker: search areas (`searchReferenceAreas`) and, on selection, draw the area's
  `ReferenceAreaOutline` (`getReferenceArea`) on the map for scoping and labeling, reusing the
  existing map overlay plumbing.
- Gate both on `data.read`.
- `Relation.type` is `x-extensible-enum` in 2.0.0 (R2-001 kept the client's `RelationType` a closed
  union over the known 20, which now include the ownership edges `owns`, `controls`, `officer-of`,
  `beneficial-owner`, `affiliated-with`): surface those ownership edges in the graph's relation
  filter and legend, and render any *unlisted* wire relation type as a generic edge
  (`edgeFamily`'s default) rather than dropping it.

**Done when.** The ownership chain renders in the graph and a selected reference area's outline
draws on the map, both from the real operationIds and gated on `data.read`. Compile-only; tests
written not run.

**Commit.** `R2-011: Ownership Chain And Reference Areas`;
`completion-reports/R2-011-CR-Ownership-Chain-And-Reference-Areas.md` (hash + owner questions).
