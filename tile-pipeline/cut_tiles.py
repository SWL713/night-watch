#!/usr/bin/env python3
"""
Night Watch — Light Pollution Atlas Tile Cutter
David Lorenz World Atlas 2024 → XYZ map tiles

Usage:
  1. Download world2024.png from https://djlorenz.github.io/astronomy/lp2024/world2024.png
  2. Place it in the same folder as this script
  3. Run: python cut_tiles.py
  4. Tiles will be written to ../public/lp_tiles/{z}/{x}/{y}.png

Strategy:
  - z2-7: global coverage (land only)
  - z8:   US + Canada only (land only)
  - Ocean tiles skipped to save space (~83MB total vs 390MB full)
"""

from PIL import Image
import math, os, sys

IMG_PATH = 'world2024.png'
OUT_DIR  = '../public/lp_tiles'

# Source image geographic bounds (Lorenz atlas coverage)
IMG_WEST  = -180.0
IMG_EAST  =  180.0
IMG_NORTH =   75.0
IMG_SOUTH =  -65.0

# Zoom ranges
GLOBAL_ZOOMS = range(2, 8)   # z2-7 worldwide
USCA_ZOOMS   = range(8, 9)   # z8 US+Canada only

# US + Canada bounding box
USCA_BOUNDS = dict(west=-170, east=-52, north=84, south=24)

# Minimum non-black pixels in a tile to consider it "land" worth saving
# Lorenz source: black = no light pollution / ocean, both are fine to skip
LAND_THRESHOLD = 20  # pixels out of 256x256 that must be non-black

def lon_to_x(lon, zoom):
    n = 2 ** zoom
    return int((lon + 180.0) / 360.0 * n)

def lat_to_y(lat, zoom):
    lat_r = math.radians(lat)
    n = 2 ** zoom
    return int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n)

def tile_to_latlon(x, y, zoom):
    """Return (west, north, east, south) for tile x,y at zoom"""
    n = 2 ** zoom
    west  = x / n * 360.0 - 180.0
    east  = (x + 1) / n * 360.0 - 180.0
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return west, north, east, south

def geo_to_pixel(lon, lat, img_w, img_h):
    """Convert geographic coords to source image pixel coords"""
    px = (lon - IMG_WEST) / (IMG_EAST - IMG_WEST) * img_w
    py = (IMG_NORTH - lat) / (IMG_NORTH - IMG_SOUTH) * img_h
    return px, py

def process_zoom(src, img_w, img_h, zoom, bounds, stats):
    x_min = lon_to_x(bounds['west'], zoom)
    x_max = lon_to_x(bounds['east'], zoom)
    y_min = lat_to_y(bounds['north'], zoom)
    y_max = lat_to_y(bounds['south'], zoom)

    total = (x_max - x_min + 1) * (y_max - y_min + 1)
    done = 0

    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            done += 1
            if done % 200 == 0:
                print(f"  z{zoom}: {done}/{total} tiles...", end='\r')

            tile_w, tile_n, tile_e, tile_s = tile_to_latlon(x, y, zoom)

            # Get pixel coords for tile corners in source image
            px0, py0 = geo_to_pixel(tile_w, tile_n, img_w, img_h)
            px1, py1 = geo_to_pixel(tile_e, tile_s, img_w, img_h)

            # Skip if outside source bounds
            if px1 <= 0 or px0 >= img_w or py1 <= 0 or py0 >= img_h:
                stats['skipped'] += 1
                continue

            # Clamp to source image
            cx0 = max(0, int(px0))
            cy0 = max(0, int(py0))
            cx1 = min(img_w, math.ceil(px1))
            cy1 = min(img_h, math.ceil(py1))

            if cx1 <= cx0 or cy1 <= cy0:
                stats['skipped'] += 1
                continue

            # Crop from source
            region = src.crop((cx0, cy0, cx1, cy1))

            # Check if tile has any meaningful data (skip transparent-zone-only tiles)
            # Transparent zones after posterize: charcoal(34,34,34), grey(66,66,66), navy(20,47,114)
            # A tile worth keeping has at least one pixel from a non-transparent zone
            import numpy as np
            arr = np.array(region)
            r, g, b = arr[:,:,0].astype(int), arr[:,:,1].astype(int), arr[:,:,2].astype(int)
            # Non-transparent zones all have either:
            # - significant green channel (dark green, bright green, olive, tan)
            # - high red channel with green (orange tones)
            # - or blue dominant with high total (medium blue zone)
            # Transparent zones: charcoal (r=g=b~34-66), navy (b dominant, r+g low)
            is_charcoal = (abs(r-g)<10) & (abs(g-b)<10) & (r < 80)  # grey/charcoal
            is_navy     = (b > 80) & (r < 40) & (g < 60)             # dark navy
            is_transparent = is_charcoal | is_navy
            non_transparent = int((~is_transparent).sum())

            if non_transparent < LAND_THRESHOLD:
                stats['ocean_skipped'] += 1
                continue

            # Resize to 256x256
            tile = region.resize((256, 256), Image.LANCZOS)

            # Convert to RGBA (Lorenz source is RGB with black = no data)
            # Make black pixels transparent so it overlays cleanly on the map
            tile_rgba = tile.convert('RGBA')
            data = np.array(tile_rgba)
            # Pixels where R+G+B < 15 become transparent
            dark_mask = (data[:,:,0].astype(int) + data[:,:,1] + data[:,:,2]) < 15
            data[dark_mask, 3] = 0
            tile_final = Image.fromarray(data)

            # Save
            out_path = os.path.join(OUT_DIR, str(zoom), str(x))
            os.makedirs(out_path, exist_ok=True)
            tile_final.save(os.path.join(out_path, f'{y}.png'), optimize=True)
            stats['saved'] += 1

    print(f"  z{zoom}: {done}/{total} tiles processed")

def main():
    if not os.path.exists(IMG_PATH):
        print(f"ERROR: {IMG_PATH} not found.")
        print("Download from: https://djlorenz.github.io/astronomy/lp2024/world2024.png")
        sys.exit(1)

    print(f"Loading {IMG_PATH}...")
    Image.MAX_IMAGE_PIXELS = None  # disable decompression bomb check for large atlas
    src = Image.open(IMG_PATH).convert('RGB')
    img_w, img_h = src.size
    print(f"Source: {img_w} x {img_h} pixels")

    # Posterize — snap each pixel to the nearest Lorenz zone color
    # This eliminates all anti-aliasing and transition pixels between zones
    # so the tile canvas recolor sees clean zone colors with no halos
    print("Posterizing to hard zone boundaries...")
    import numpy as np
    arr = np.array(src)

    # Lorenz zone reference colors — exact values sampled from world2024.png
    zones = np.array([
        [ 34,  34,  34],   # pristine dark (charcoal)
        [ 66,  66,  66],   # near-pristine (mid grey)
        [ 20,  47, 114],   # bortle 1-2 (dark navy)
        [ 33,  84, 216],   # bortle 2-3 (medium blue)
        [ 15,  87,  20],   # bortle 3   (dark green)
        [ 31, 161,  42],   # bortle 4   (bright green)
        [110, 100,  30],   # bortle 5   (olive brown)
        [184, 166,  37],   # bortle 6   (tan/yellow)
        [191, 100,  30],   # bortle 7   (orange-brown)
        [253, 150,  80],   # bortle 7-8 (orange)
        [251,  90,  73],   # bortle 8   (red-orange)
        [251, 153, 138],   # bortle 9   (pink)
        [160, 160, 160],   # city bright (light grey)
        [242, 242, 242],   # city core   (near white)
    ], dtype=np.float32)

    # For each pixel find nearest zone color by Euclidean distance
    flat = arr.reshape(-1, 3).astype(np.float32)
    # Process in chunks to avoid OOM on huge image
    chunk = 500000
    result = np.zeros_like(flat)
    for start in range(0, len(flat), chunk):
        end = min(start + chunk, len(flat))
        px = flat[start:end]  # (N, 3)
        # Broadcast: (N, 1, 3) - (1, Z, 3) = (N, Z, 3)
        diff = px[:, None, :] - zones[None, :, :]
        dist = (diff ** 2).sum(axis=2)  # (N, Z)
        nearest = dist.argmin(axis=1)   # (N,)
        result[start:end] = zones[nearest]
        if start % 5000000 == 0:
            print(f"  posterizing... {start//1000000}M/{len(flat)//1000000}M px")

    posterized = result.reshape(arr.shape).astype(np.uint8)
    # Free the intermediate arrays immediately to save memory
    del result, flat, arr
    import gc; gc.collect()
    # Wrap in PIL using frombuffer (zero-copy) instead of fromarray
    src = Image.frombuffer('RGB', (img_w, img_h), posterized.tobytes(), 'raw', 'RGB', 0, 1)
    print("Posterize done")
    print(f"Output: {OUT_DIR}")
    print()

    try:
        import numpy as np
    except ImportError:
        print("ERROR: numpy required. Run: pip install numpy Pillow")
        sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)

    stats = {'saved': 0, 'skipped': 0, 'ocean_skipped': 0}

    # Global z2-7
    print("=== Global coverage (z2-7) ===")
    world_bounds = dict(west=IMG_WEST, east=IMG_EAST, north=IMG_NORTH, south=IMG_SOUTH)
    for z in GLOBAL_ZOOMS:
        print(f"Processing zoom {z}...")
        process_zoom(src, img_w, img_h, z, world_bounds, stats)

    # US + Canada z8
    print()
    print("=== US + Canada (z8) ===")
    for z in USCA_ZOOMS:
        print(f"Processing zoom {z}...")
        process_zoom(src, img_w, img_h, z, USCA_BOUNDS, stats)

    print()
    print(f"Done!")
    print(f"  Tiles saved:        {stats['saved']:,}")
    print(f"  Ocean/dark skipped: {stats['ocean_skipped']:,}")
    print(f"  Out of bounds:      {stats['skipped']:,}")

    # Estimate disk usage
    import subprocess
    try:
        result = subprocess.run(['du', '-sh', OUT_DIR], capture_output=True, text=True)
        print(f"  Disk usage:         {result.stdout.split()[0]}")
    except Exception:
        pass

    print()
    print(f"Next step: commit tiles to repo")
    print(f"  cd ..")
    print(f"  git add public/lp_tiles/")
    print(f"  git commit -m 'add lorenz light pollution atlas tiles'")
    print(f"  git push origin main")

if __name__ == '__main__':
    main()
