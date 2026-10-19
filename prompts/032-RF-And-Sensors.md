# 032 — RF And Sensors

**Goal.** A dedicated **RF / Sensors** workspace: the RF and signals map layers, a sensor catalogue,
receivers and ground stations with live pass plots, and detail for a selected sensor or signal.

**Read first.** 031-CR; [Architecture.md](../docs/Architecture.md) §12; Charter §3. **No dedicated
mockup exists for this space** — build it in the established dashboard design language (left rail,
map, right detail panel), review-gated so the owner can redirect the layout.

**Backend (OpenAPI only).**
- `GET /v1/sensors` [`listSensors`] — discover sensors observing an area (kinds `source`, `receiver`,
  `station`, `satellite`, `scene`, `raster-product`).
- `GET /v1/ground-stations/{sourceId}/polarplot.jpeg` [`getGroundStationPolarplot`] — live pass polar
  plot.
- `GET /v1/kinds` [`listKinds`] + `GET /v1/records` [`listRecords`] filtered to RF / signal kinds
  (spectrum, scanner, APRS, SIGINT, …); `GET /v1/records/{sourceId}/{externalId}` [`getRecord`].
- `GET /v1/objects/{ref}/dossier` [`getObjectDossier`] — selected sensor/signal detail.
- Record tiles (007) for the RF / Spectrum / SIGINT map layers.

**Build.**
- A workspace reached from the **RF / Sensors** nav tab: the map focused on the RF/spectrum/SIGINT
  layers (reusing 007/008), a **sensor catalogue** (list + filter from `listSensors`), receivers and
  ground stations with their live **polar plots** (`getGroundStationPolarplot`), and a right-hand
  dossier for the selected sensor or signal.
- Selecting a sensor/signal drives the shared `selection` (014) and flies the map to it.

**Done when.** The RF / Sensors tab opens a working space: RF layers on the map, a populated sensor
catalogue, a live polar plot for a ground station, and a detail panel for a selected item.
Playwright: open tab → catalogue + map + a selected-sensor detail render.

**Commit.** `032: RF And Sensors`; `completion-reports/032-CR-RF-And-Sensors.md` (hash + owner
questions; note the layout is derived — no mockup).
