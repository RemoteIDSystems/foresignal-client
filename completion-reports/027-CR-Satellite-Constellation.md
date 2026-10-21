# 027 — Completion Report: Satellite Constellation

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `17b314cf50cfc68e50ffdb00883a98dd9ef1647b`                                              |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                          |
| Screenshots           | None taken (compile-only run). `e2e/satellites.e2e.ts` takes none either.               |
| Mock comparison       | From `design/ForeSignal_Analysis_View.png` (read in this session) and the code.         |

## Results

- **The Satellites tab is now Satellite Operations**, replacing its placeholder. It loads in its
  own chunk (45.09 kB), with its orbit library.
- **The constellation on the globe:**
  - satellites come from the backend's CelesTrak-compatible element sets (`getCelestrakGp`,
    `FORMAT=json`), one request per data source;
  - **SGP4 runs in the browser** (satellite.js) and moves every satellite to the **Cesium clock's**
    instant as it runs;
  - each satellite is a point colored by its data source, with a label for the first 150;
  - **orbit rings:** one revolution of each orbit for up to 400 satellites, fixed to the Earth at
    the clock's instant, so each ring passes through its satellite;
  - **the selected satellite** is larger and outlined, its ring brighter, and its **ground track**
    is drawn one orbit back and one ahead;
  - points and rings are ordinary depth-tested primitives, so **the globe hides those behind the
    Earth** in 3D;
  - 2D / 3D is the map's own toggle (005).
- **The time scrubber** (top left, as in the mock) shows the clock in UTC, **LIVE**, and a slider
  from −24 h to +24 h with the mock's ticks. Moving it sets the Cesium clock; it runs on from
  there. LIVE returns it to now.
- **Selecting:** a click on a satellite picks it (Cesium's `scene.pick`), and so does **Find a
  satellite** (name, catalog number or designator) or a row of Upcoming Passes.
- **The Selected Satellite panel** shows:
  - the name, its data source and its first sensor type;
  - Operator, NORAD ID, international designator, Launch Date, Orbit Type, Altitude (by SGP4 now),
    Inclination, Period, Status, and the age of the element set;
  - **Next Pass** over the view's center: computed by SGP4, above 10°, within 24 hours;
  - **View Details →**, which opens the satellite's record when the backend holds one
    (`listRecords`, kind `satellite`, by designator);
  - **Sensors:** the satellite sensor's types and resolution, from `listSensors`, with the
    backend's note that it cannot task.
- **The rail:**
  - **SATELLITE OPERATIONS**, in the mock's order:
    - Constellation View, Live Tracking (now on the clock), Sensor Catalog, Ground Stations and
      Pass Predictions switch the view;
    - Imagery Analysis and Change Detection open Imagery (028);
    - Tasking & Events and Acquisition Queue are disabled, with why.
  - **DATA SOURCES**, in the mock's order: each is a checkbox with its color and count. Stations,
    weather and Earth resources are on at first.
- **The bottom panel:**
  - **Upcoming Passes (Next 24h)** over the view, from `listSensors`' satellite sensors: time,
    satellite, sensor type, maximum elevation and duration;
  - **Ground Stations** (stations and receivers in range);
  - the **Sensor Catalog** (every sensor over the view).

## What was built

- **`satellites/satelliteApi.ts`:** `getGpElements` ("No GP data found" is an empty list),
  `listSensors`, `findSatelliteRecord`, `recordField`.
- **`satellites/orbit.ts`:** `toSatrec`, `positionAt`, `periodMinutes`, `apsides`, `orbitType`,
  `elementAgeHours`, `orbitRing`, `groundTrack` (split at the antimeridian), `elevationFrom`,
  `nextPass`.
- **`satellites/constellation.ts`:** the data sources, `buildConstellation` (one per catalog
  number), `searchSatellites`, `sourceColors`.
- **`satellites/useConstellation.ts`:** reads each chosen source once per client.
- **`satellites/satelliteView.ts`:** the area, its center, pass rows, sensor matching, the facts,
  "in 2 h 14 min".
- **`satellites/ConstellationLayer.tsx`:** the Cesium primitives, the clock, picking.
  `satelliteProbe.ts` exposes the drawn satellites to the end-to-end check in development builds
  only.
- **`views/satellites/`:** `SatellitesScreen` (the screen), `SatellitesView` (lazy), the CSS.
- **`map/Viewer.tsx`:** a `scene` slot for layers drawn inside the viewer.
- **`vite.config.ts`:** the dev server also proxies `/compat` to the backend.
- **Package:** **satellite.js 6.0.2** (MIT, 2026-01-07), credited in `credits.ts`.

## How it was checked

### Tests (written, not run)

- `satellites/orbit.test.ts` (7):
  - the position at the epoch (−178.47°, 51.80°, 419.4 km) and a geostationary height
    (35,782 km);
  - unusable element sets; absent drag terms;
  - period, apsides and every orbit type;
  - element age;
  - the ring through the satellite, closing within 10 km;
  - the ground track's antimeridian split;
  - the next pass over Houston (13:39:00Z to 13:44:30Z, about 47.6°).

  The expected values were worked out with satellite.js in node in this session.

- `satellites/constellation.test.ts` (3): one per catalog number; search order; the sources and
  their colors.
- `satellites/satelliteApi.test.ts` (4): by group and by name, with the empty text; an error; the
  sensors query; the record lookup.
- `satellites/satelliteView.test.ts` (6): the area; the center across the antimeridian; pass rows;
  sensor matching; the facts with and without a record; "until".
- `views/satellites/SatellitesScreen.test.tsx` (7): the initial sources and counts; selection and
  the panel; search; another source; passes, stations and catalog; the scrubber and LIVE; no
  element sets. The map and the layer are mocked (no WebGL).
- `app/App.test.tsx`: the routing check waits for the lazy screen's heading.
- `e2e/satellites.e2e.ts` (1). The element sets are stand-ins. It checks:
  - three satellites drawn on the canvas;
  - the clock running;
  - +6 h on the scrubber moving the clock about six hours ahead, and LIVE bringing it back;
  - a real click on a drawn satellite selecting it, and the panel's NORAD ID and next pass;
  - the passes table;
  - no console errors.

### Checks

| Check                                                       | Result                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                                                             |
| `npm run lint`                                              | Passed                                                                                                                             |
| `npx prettier --check src e2e`                              | Passed                                                                                                                             |
| `npm run build`                                             | Passed. `index` 743.90 kB (226.49 kB gzip); `SatellitesScreen` 45.09 kB (19.27 kB gzip)                                            |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                                                        |
| Guard: `test_us_english.py`                                 | 14 tests OK (170.9 s)                                                                                                              |
| Guard: `check_us_english.py` over the project               | 797 hits, unchanged                                                                                                                |
| Guard: `check_us_english.py` over the new and changed files | Two hits in `App.test.tsx` lines 208 and 213: the backend's attribution JSON key in an existing stand-in. A wire name, not changed |

## Compared to the mock

From `design/ForeSignal_Analysis_View.png` against the components; no screenshot was taken.

- **Matches:**
  - the SATELLITE OPERATIONS rail in the mock's order, then DATA SOURCES;
  - the globe with satellites colored by type (here, by source), orbit paths and labels;
  - the time scrubber at the top left with the UTC time, LIVE and the −24h / −6h / Now / +6h / +24h
    ticks;
  - Selected Satellite on the right: Operator, NORAD ID, Launch Date, Orbit Type, Altitude,
    Inclination, Period, Status, View Details and Sensors;
  - Upcoming Passes (Next 24h) at the bottom.
- **Differs:**
  - **No thumbnail** in the panel; the backend has no satellite image.
  - **Sensors** show no "Taskable" tag. The backend says it "cannot task public satellites or
    third-party sensors", and that note is shown instead.
  - **The top tabs** are Constellation View, Passes, Ground Stations and Sensor Catalog. The
    mock's Tasking, Imagery and Analysis tabs are the rail's disabled entries or 028's screen.
  - **Recent Imagery and Imagery Comparison** at the bottom are 028's; here the bottom row is
    Upcoming Passes.
  - **The 2D Map / 3D Globe / Split View** buttons: 2D and 3D are the map HUD's toggle; there is
    no Split View.
  - **The hover card** (WorldView-3 with its thumbnail) is not drawn; selection fills the panel.
  - **The footprint cone** under the selected satellite is not drawn; its ground track is.

## Decisions taken (unattended run)

1. **Propagation in the browser** with SGP4 from OMM elements, rather than CZML; the backend
   serves elements and not ephemerides.
2. **satellite.js 6.0.2, not 7.x.** 7.1.0 (2026-07-23) was tried first. Its entry point re-exports
   a WebAssembly build whose worker uses top-level await, and `vite build` failed
   (`Top-level await is currently not supported with the 'iife' output format`). 6.0.2 has the
   same API in plain JavaScript.
3. **Data sources:** each of the mock's sources is a CelesTrak group (stations, Starlink, Planet,
   GOES, weather, resource) or a name match (Sentinel). NORAD, SatDump (Local) and Custom have no
   such selector and are disabled, with why. Stations, weather and Earth resources are on at
   first.
4. **Colors by source:** the elements carry no satellite type.
5. **Orbit type** comes from the elements:
   - geostationary or geosynchronous near a 1,436-minute period;
   - highly elliptical above eccentricity 0.25;
   - sun-synchronous for a low orbit inclined 95°–105°;
   - otherwise low, medium or high Earth orbit.
6. **Limits:** rings for up to 400 satellites, labels for 150; positions are recomputed every
   100 ms, rings and the ground track every 60 s of clock time.
7. **The scrubber owns the clock on this screen.** It sets the Cesium clock to now plus its offset
   and runs on, whatever the app's time machine holds.
8. **Next Pass** is over the center of the view, worked out in the browser; the backend's predicted
   passes fill Upcoming Passes.
9. **Sensor matching:** a satellite sensor matches by the last number in its ref (the catalog
   number), else by the same name.

## Deviations from the prompt text

- **"Selected-satellite panel … from the record":** the facts come from the element set, the
  record (Operator, Launch Date, Status when its payload carries `OWNER`, `LAUNCH_DATE`,
  `OPS_STATUS_CODE`) and the sensor. Local records were not available to confirm those field
  names.
- **`getRecord`** is not called. The record is found with `listRecords` (kind `satellite`, `q` =
  designator), because the client does not know the record's external id.
- **`getCelestrakGroupTle`** is not used; the JSON form of `getCelestrakGp` carries the same
  elements.
- **"Arcs occlude correctly in 3D"** comes from depth testing. The e2e spec does not measure it
  (no screenshots).

## Backend observations

- **No satellites locally** (curl, this session):
  - `http://localhost:8080/compat/celestrak/gp.php?GROUP=stations&FORMAT=json` and `GROUP=active`
    answered `No GP data found`;
  - `…/NORAD/elements/stations.txt` answered the same;
  - `/v1/records?kind=satellite` answered `"items":[]`;
  - `/v1/sources/celestrak-gp` reports `"status": "disabled", "statusReason": "source disabled"`.
- **`listSensors`** over California for a day answered sources and raster products (for example
  `sensor:source:usgs-earthquakes` with `pDetect` 1.0), with no satellites or stations.
- **The dev proxy** sent `/compat/…` to the app's own page (an HTML document) until `/compat` was
  added to it.
- **`celestrak-gp`'s descriptor** says it fetches CSV by default and that "TLE cannot carry the
  six-digit catalog numbers". The client reads JSON, where `NORAD_CAT_ID` is a number of up to 9
  digits.

## Owner questions

1. **Satellite type.** Should element sets or records carry a type (optical, SAR, weather,
   communications), so satellites are colored by type as in the mock? **Default in place: by data
   source.**
2. **Record fields.** What are a satellite record's operator, launch date and status fields?
   **Default in place: `OWNER`/`OPERATOR`, `LAUNCH_DATE`, `OPS_STATUS_CODE`/`STATUS`, else "—".**
3. **Sensor refs.** Does a satellite sensor's ref end with its catalog number? **Default in place:
   matched by that number, else by name.**
4. **Initial sources.** Which sources should be on when the screen opens? **Default in place:
   stations, weather, Earth resources.**
5. **Scrubber and time machine.** Should the satellites screen follow the app's time machine (013)
   rather than its own scrubber? **Default in place: its own scrubber.**
6. **satellite.js 7.** Should the build be configured for 7.x's WebAssembly worker, or stay on
   6.0.2? **Default in place: 6.0.2.**
7. **Tasking.** The mock tags sensors "Taskable"; the backend says it cannot task. **Default in
   place: the backend's note, no tag.**

Questions still open from earlier reports keep their defaults.
