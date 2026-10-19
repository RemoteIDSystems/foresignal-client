# Basemap tiles

These tiles are the map's base imagery. They are served from the client's own origin, with no
account, no API key and no third-party tile service.

| Directory       | Product                                                                    | Shown on       |
| --------------- | -------------------------------------------------------------------------- | -------------- |
| `blue-marble/`  | NASA Blue Marble: Next Generation, topography + bathymetry, September 2004 | the day side   |
| `black-marble/` | NASA Black Marble 2016, color, 3 km                                        | the night side |

Cesium's day/night lighting blends the two at the terminator. Weather clouds are not part of the
basemap; they come from the backend's raster products.

## Layout

- Each directory is a tile pyramid in Cesium's geographic tiling scheme.
- Level `z` holds 2^(z+1) × 2^z tiles of 256 px, at `z/x/y.webp`.
- Row `0` is the northern edge of the map.
- Levels 0–5 are present, so level 5 is 16384 × 8192 px for the whole world, about 2.4 km per
  pixel at the equator.
- Each pyramid has 2,730 tiles. The total is 10,012,466 bytes for Blue Marble and 4,035,726 bytes
  for Black Marble.

## Sources

| File                                        | URL                                                                                                                                                   | Size         | SHA-256                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| `world.topo.bathy.200409.3x21600x10800.jpg` | https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/september/world.topo.bathy.200409.3x21600x10800.jpg | 28,335,770 B | `863036b622ba3dab4eb4ffb7149730b02cfa433ce49672e9b7267022051e04a2` |
| `BlackMarble_2016_3km.jpg`                  | https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg                                 | 8,106,233 B  | `230aac448ae68c358be433dd518888cccb3a85ccf66f7b44326441c324ad6725` |

The pages that list these downloads are:

- Blue Marble: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry
- Black Marble: https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps

The sources are not in the repository. Only the tiles are.

## Rebuilding

The tiles are rebuilt with Python 3 and Pillow:

```sh
curl -fo blue.jpg  <Blue Marble URL above>
curl -fo black.jpg <Black Marble URL above>
python3 -I scripts/tile-basemap.py blue.jpg  public/basemap/blue-marble  5
python3 -I scripts/tile-basemap.py black.jpg public/basemap/black-marble 5
```
