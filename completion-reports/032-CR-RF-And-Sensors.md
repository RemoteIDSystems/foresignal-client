# 032 — Completion Report: RF And Sensors

| Field                 | Value                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete)                            |
| Implementation commit | `dddce97fe5e13e701e8b8d38996c87aff08ea4b0`                                                                         |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                                                     |
| Screenshots           | None taken (compile-only run).                                                                                     |
| Mock comparison       | **No mockup exists for this space; the layout is derived** from the Satellite Operations screen (027) in the code. |

## Results

- **The RF / Sensors tab** (`/rf-sensors`) now opens a working space in place of the placeholder.
  It has four parts:
  - a **left rail**;
  - the **map**;
  - a **right detail panel**;
  - a **bottom row** of two panels.
- **RF / Spectrum layers** on the rail:
  - every kind of the client's RF / Spectrum category (for example `aprs-station`, `scanner`,
    `sdr-receiver`, `jamming-cell`), each with its current count from `listKinds`;
  - all on when the page opens;
  - the map draws the ones that have records from their record tiles (007), with the legend
    scoped to them.
- **Sensor catalog** on the rail:
  - `listSensors` over the map's view for the next 6 hours, every sensor kind;
  - filtered by kind (`station`, `receiver`, `source`, `satellite`, `scene`, `raster-product`, as
    the backend names them) and by text (title, summary, families);
  - ground stations and receivers listed first;
  - the count shown, with "more over the view" when the backend truncated, and the backend's note.
- **Ground Stations & Receivers** (bottom row): each station or receiver in range, with its kind
  and range. Each SatDump station (`sensorKind` `station`) shows its **live polar plot**
  (`getGroundStationPolarplot`). The plot is read every 5 s, matching the backend's
  `max-age=5`. Outside a pass it says "No active pass." (404 `NO_ACTIVE_PASS`).
- **Signals in View** (bottom row): the newest 50 records of the RF kinds that are on, in the view
  (`listRecords`).
- **Detail panel**, for the selected sensor or signal (`getObjectDossier`):
  - title, kind badge and summary;
  - the sensor's own facts (sensor kind, families, detection, method, range, capabilities, next
    pass) and the dossier's overview facts;
  - a station's polar plot;
  - for a record, **Open on Global →**.
- **Selection.** Choosing a sensor in the catalog, a station or a signal sets the shared
  `selection` (014), and the map flies to it when it has a position. A record clicked on the map
  is selected the same way.

## What was built

- `src/rf/rfApi.ts`:
  - `getPolarplotBlob` (the polar plot as a blob, through the API client, so the token is added);
  - `listSignals`;
  - `NO_ACTIVE_PASS`.
- `src/rf/rfView.ts`:
  - `rfKinds`, `filterSensors`, `stationsOf`, `stationSourceId`;
  - `sensorPoint`, `sensorHit`, `signalRef`, `signalHit`, `sensorFacts`;
  - `SENSOR_KINDS`, `SIGNAL_LIMIT`, `POLARPLOT_REFRESH_MS`.
- `src/rf/usePolarplot.ts`: the polar plot as an object URL, read again every 5 s; each new plot
  revokes the last URL.
- `src/views/rf/RfSensorsView.tsx` and `RfSensors.module.css`: the workspace. The route renders it
  in place of the placeholder, which was removed from `views/screens.tsx`.
- `src/satellites/area.ts`: `areaOf` and `Bbox` moved out of `satelliteView.ts` (which re-exports
  them), so the RF screen does not pull satellite.js into the main chunk.

## How it was checked

### Tests (written, not run)

- `rf/rfView.test.ts` (6):
  - the RF category's kinds;
  - the catalog filter and order;
  - the polar plot's source;
  - a sensor's point, from its geometry or the middle of its footprint, and its selection;
  - a signal's ref and selection;
  - a sensor's facts, with the next pass.
- `views/rf/RfSensorsView.test.tsx` (5):
  - the map asked for the RF kinds that have records, and turning one off;
  - the catalog over the view (the bbox in the request), filtered by kind, and a station's polar
    plot;
  - "No active pass." on 404 `NO_ACTIVE_PASS`;
  - a sensor selected into the store, with the map asked to move, its detail (summary, sensor and
    overview facts) and clearing it;
  - a signal selected as the map would pick it, with its detail and **Open on Global**.
- `e2e/rf-sensors.e2e.ts` (1), "open tab → catalog + map + a selected-sensor detail render":
  1. the nav tab opens `/rf-sensors`;
  2. the map's canvas and the RF layers rail render;
  3. the catalog lists the stood-in station first, among the backend's own sensors, and filters to
     it;
  4. the station's polar plot renders;
  5. selecting it shows its detail;
  6. no console errors.

  The local backend has no stations, so the station, its polar plot and its dossier are stand-ins.
  Every other request goes to the backend.

### Checks

| Check                                                       | Result                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                                              |
| `npm run lint`                                              | Passed                                                                                                              |
| `npx prettier --check src e2e`                              | Passed                                                                                                              |
| `npm run build`                                             | Passed. `index` 860.48 kB (259.08 kB gzip). It read 886.54 kB before `areaOf` moved out of the satellite.js module. |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                                         |
| Guard: `test_us_english.py`                                 | 14 tests OK (168.3 s)                                                                                               |
| Guard: `check_us_english.py` over the project               | 803 hits, unchanged                                                                                                 |
| Guard: `check_us_english.py` over the new and changed files | 0 hits                                                                                                              |

## Compared to the mock

**There is no mockup for this space.** The layout is derived from the dashboard language and is
open to the owner's redirection.

- **Matches the established language:**
  - the left rail (the Analysis frame's), the map, a right detail panel and a bottom row of panels,
    as on Satellite Operations;
  - the same panel, table, badge and button styling;
  - lucide icons;
  - the theme's tokens, with no new visual idiom.
- **Derived choices to review:**
  - **layer toggles and the catalog share the rail**;
  - **polar plots sit in the bottom row**, and again in the detail panel for a selected station;
  - **signals are a bottom-row table**.

## Decisions taken (unattended run)

1. **RF kinds** are the client's RF / Spectrum category (`lib/kindCategories`). The backend has no
   category for a kind.
2. **All RF kinds start on.** The toggles are this page's own and are not saved to the Global
   rail's layers.
3. **The catalog reads every sensor kind**, not only receivers and stations, so it is the full
   `listSensors` answer; the kind filter narrows it.
4. **Discovery window:** the next 6 hours from the hour the page opened, over the map's view
   rounded outward to whole degrees (as 027).
5. **Polar plots** are read for `station` sensors by their first provenance source id, every 5 s
   while shown. Receivers have none in the OpenAPI.
6. **Selecting** a sensor or signal sets the shared selection and asks the map to move to it. A
   sensor with no position is selected without moving the map.
7. **Signals**: the newest 50 records, newest observed first, of the RF kinds that are on and have
   records.
8. **Backend values as is:** sensor kinds, families, methods, record kinds and sources.

## Deviations from the prompt text

- **`getRecord`** is not called. A selected signal's detail comes from its dossier
  (`getObjectDossier`), which the prompt also names and which covers the record.
- **"Review-gated"**: this range runs unattended by the owner's instruction. The layout questions
  are below.

## Backend observations

These come from curl in this session:

- `GET /v1/sensors` over the United States for 6 hours answered 50 sensors (`truncated: true`): 49
  `raster-product` and 1 `source` (`sensor:source:usgs-earthquakes`, `pDetect` 1.0, method
  `declared`). Over the whole world, `receiver`, `station`, `satellite` and `scene` each answered 0.
- `GET /v1/ground-stations/satdump/polarplot.jpeg` answered **404** "No SatDump ground station
  source 'satdump'." There is no station locally to read a plot from.
- `GET /v1/kinds` listed one kind (`earthquake`).
- `GET /v1/records?kind=` `aprs-station`, `sdr-receiver`, `scanner`, `radio-spot` and
  `jamming-cell` each answered no items.
- `GET /v1/sources` lists RF-related sources (`aprs-is`, `kiwisdr`, `local-aprs-1`, `local-aprs-2`,
  `local-adsb-1`, `openmhz-systems`), none with RF records now.
- `GET /v1/objects/sensor:source:usgs-earthquakes/dossier` answered a dossier with an `ok`
  overview.

## Owner questions

1. **Layout.** Is the derived layout right: rail (layers and catalog), map, right detail, bottom
   stations and signals? **Default in place: as built.**
2. **RF kinds.** Should the RF workspace take its kinds from the client's category table, or should
   the backend mark RF and signal kinds? **Default in place: the client's table.**
3. **Catalog scope.** Should the catalog hide `raster-product` and `scene` sensors by default, as
   imagery belongs to Imagery and Satellites? **Default in place: every kind, filterable.**
4. **Station source.** Is a station's polar plot source always its first provenance source id?
   **Default in place: yes.**
5. **Layer state.** Should the RF toggles share the Global rail's layers (and a workspace's)?
   **Default in place: page-local, all on.**

Questions still open from earlier reports keep their defaults.
