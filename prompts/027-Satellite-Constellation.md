# 027 — Satellite Constellation

**Goal.** The Satellite Operations constellation view: live orbits, ground tracks, passes and
sensor discovery on the 3D globe — Cesium's core domain.

**Read first.** 026-CR; [Architecture.md](../docs/Architecture.md) §12. Design: **Satellite
Operations / Analysis View** (Constellation View, time scrubber with LIVE, selected-satellite
panel, passes, ground stations).

**Backend (OpenAPI only).**
- `GET /v1/sensors` [`listSensors`] — discover sensors observing an area (kinds include `satellite`).
- `GET /v1/records` [`listRecords`] (kind=satellite) and `GET /v1/records/{sourceId}/{externalId}`
  [`getRecord`] — satellite records.
- CelesTrak-compatible GP/TLE: `GET /compat/celestrak/gp.php` [`getCelestrakGp`],
  `GET /compat/celestrak/NORAD/elements/{group}.txt` [`getCelestrakGroupTle`].

**Build.**
- Propagate orbits from TLE (SGP4) or render CZML; draw satellites as time-dynamic points with
  ground tracks and orbit arcs on the globe (Cesium clock drives the time scrubber; native depth
  occlusion hides arcs behind the earth).
- Selected-satellite panel (operator, NORAD id, orbit type, altitude, inclination, period, next
  pass, sensors/bands) from the record.
- Upcoming passes and ground stations lists; sensor discovery via `listSensors` for an AOI.
- 2D/3D reuse the 005 scene toggle.

**Match the mock (Satellite Operations).** Left SATELLITE OPERATIONS rail (Constellation View / Live
Tracking / Sensor Catalog / Tasking & Events / Imagery Analysis / Change Detection / Ground Stations
/ Pass Predictions / Acquisition Queue) + DATA SOURCES (CelesTrak / NORAD / Starlink / Planet /
Sentinel / GOES / Weather Satellites / SatDump / Custom). Center globe with the constellation
(satellites colored by type, orbit paths, labels, the time scrubber + LIVE). Right **Selected
Satellite** panel: thumbnail, Operator, NORAD ID, Launch Date, Orbit Type, Altitude, Inclination,
Period, Status, `View Details`, and a **Sensors** list (e.g. PAN / MSI / SWIR / CAVIS) each with
resolution and a **Taskable** tag. Bottom: Upcoming Passes.

**Done when.** The constellation renders live orbits that animate with the scrubber; selecting a
satellite shows its details and next pass; arcs occlude correctly in 3D. Playwright: constellation
renders and a satellite selects.

**Commit.** `027: Satellite Constellation`; `completion-reports/027-CR-Satellite-Constellation.md` (hash + owner questions).
