"""Cuts an equirectangular world image into the client's basemap tile pyramid.

Level z has 2^(z+1) x 2^z tiles of 256 px in Cesium's geographic tiling scheme, written as
OUT/z/x/y.webp with row 0 at the north (Cesium's UrlTemplateImageryProvider `{y}`). Each level is
resampled from the one above with Lanczos, so the pyramid is deterministic for a given source.

Usage: python3 -I scripts/tile-basemap.py SOURCE.jpg OUT_DIR MAX_LEVEL
See public/basemap/README.md for the sources and the exact commands.
"""

import os
import sys

from PIL import Image

TILE = 256
QUALITY = 80


def main(source: str, out: str, max_level: int) -> None:
    """Writes levels max_level..0 of the pyramid for `source` under `out`."""
    Image.MAX_IMAGE_PIXELS = None  # the sources are 233 and 91 megapixels
    image = Image.open(source).convert('RGB')
    for z in range(max_level, -1, -1):
        image = image.resize((TILE * 2 ** (z + 1), TILE * 2 ** z), Image.LANCZOS)
        for x in range(2 ** (z + 1)):
            os.makedirs(f'{out}/{z}/{x}', exist_ok=True)
            for y in range(2 ** z):
                box = (x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE)
                image.crop(box).save(f'{out}/{z}/{x}/{y}.webp', quality=QUALITY, method=6)
        print(f'level {z}: {2 ** (z + 1) * 2 ** z} tiles', flush=True)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
