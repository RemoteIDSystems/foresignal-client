# Terrain tiles

These tiles are the map's terrain: land and seafloor relief. They are served from the client's own
origin, with no account, no API key and no third-party tile service.

- **3D Globe:** Cesium raises the globe to these heights and drapes the basemap over them.
- **2D Map:** the map stays flat.
- **ELEV readout:** in both modes, it reads the height under the mouse pointer from the most
  detailed level (`src/map/terrain.ts`, `TerrainSampler`).

## Source

NOAA ETOPO 2022, 60 arc-second, ice surface elevation (the top of the ice sheets over Greenland and
Antarctica, not the bedrock beneath).

| File                                    | URL                                                                                                                        | Size          | SHA-256                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| `ETOPO_2022_v1_60s_N90W180_surface.tif` | https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif | 465,969,062 B | `9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e` |

- **Grid:** 21600 × 10800 cells of 1 arc-minute, origin 180°W 90°N.
- **Heights:** meters, "WGS 84 + EGM2008 height", from the file's GeoTIFF keys (vertical CS 3855).
  That is height above the geoid, which is what people mean by elevation above sea level.
- **Product page:** https://www.ncei.noaa.gov/products/etopo-global-relief-model
- **Citation** (from the product page): NOAA National Centers for Environmental Information. 2022:
  ETOPO 2022 15 Arc-Second Global Relief Model. NOAA National Centers for Environmental Information.
  DOI: 10.25921/fd45-gt74.
- **License:** the data.gov record for ETOPO 2022
  (https://catalog.data.gov/dataset/etopo-2022-15-arc-second-global-relief-model) gives its license
  as CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/.

The source file is not in the repository. Only the tiles are.

## Layout

- **Format:** Cesium quantized-mesh-1.0, described by `layer.json`. Tiles are at `z/x/y.terrain`
  in the geographic (EPSG:4326) tiling scheme, with TMS rows (row `0` is the southern edge).
- **Levels:** level 0 is two 180° tiles, and each level halves the tile size. Levels 0–6 are
  present.
- **Tile mesh:** each tile samples a 65 × 65 grid and simplifies it to a triangle mesh, keeping
  vertical error within a budget for its level.
- **Level 6:** tiles are 2.8125° wide, so they sample about every 4.9 km at the equator, within a
  300 m error budget.
- **No vertex normals.** When terrain has normals, Cesium lights the globe per vertex instead of
  with day/night shading. Only day/night shading keeps the Black Marble night lights on the night
  side (`@cesium/engine` `Scene/GlobeSurfaceShaderSet.js` and `Shaders/GlobeFS.glsl`). With normals,
  the lights covered the whole globe.
- **Horizon culling for the two level-0 tiles.** These tiles span a hemisphere, so Cesium cannot
  compute a horizon culling point for them. Their point lies far out along the direction of the
  tile's center. A point there is above the horizon exactly when some part of the tile is in view.

| Level | Tiles  | Bytes      | Vertices per tile | Error budget |
| ----- | ------ | ---------- | ----------------- | ------------ |
| 0     | 2      | 13,836     | 389               | 38,534 m     |
| 1     | 8      | 31,818     | 226               | 19,267 m     |
| 2     | 32     | 67,690     | 118               | 9,633 m      |
| 3     | 128    | 164,496    | 71                | 4,817 m      |
| 4     | 512    | 438,624    | 45                | 2,408 m      |
| 5     | 2,048  | 2,154,808  | 56                | 1,204 m      |
| 6     | 8,192  | 33,939,346 | 232               | 300 m        |
| Total | 10,922 | 36,810,618 |                   |              |

`layer.json` adds 1,249 bytes. The SHA-256 of the sorted per-file checksums of every file except this
README is `f788f0d3a13671350be98555a2747cc03edd7f092071d5e2680b598f20e5f8d2`:

```sh
cd public/terrain && find . -type f ! -name README.md | LC_ALL=C sort | xargs sha256sum | sha256sum
```

Two builds from the same source produced that same value.

## Accuracy

Method:

- 20,000 land points and 20,000 ocean points, area-uniform at random.
- At each point, the level-6 height from Cesium's own `QuantizedMeshTerrainData.interpolateHeight`
  was compared with the source grid, bilinearly sampled.

| Points | Mean | Median | 90th percentile | 99th percentile | Largest |
| ------ | ---- | ------ | --------------- | --------------- | ------- |
| Land   | 52 m | 26 m   | 139 m           | 319 m           | 576 m   |
| Ocean  | 67 m | 45 m   | 159 m           | 302 m           | 534 m   |

The errors come from two sources:

- **Sampling.** Level 6 samples every 2.6 arc-minutes, against the source's 1.
- **Simplification.** Each tile's mesh keeps vertical error within its level's budget.

## Rebuilding

The builder is Node (24 was used), with the `geotiff` and `@mapbox/martini` dev dependencies:

```sh
curl -fo etopo60s.tif <URL above>
node --max-old-space-size=8192 scripts/build-terrain.mjs etopo60s.tif public/terrain 6 0.5 300
```

The arguments are: the source, the output directory, the deepest level, the error budget as a
fraction of Cesium's geometric error for each level, and the budget for the deepest level in
meters. The build replaces the level directories and `layer.json` and keeps this README. It takes
about 20 seconds. `scripts/terrain/` holds the tile encoder and mesh
builder, and their tests.
