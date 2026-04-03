#!/usr/bin/env python3
"""
Run this from tile-pipeline folder to sample actual colors from world2024.png
It will print all unique colors found in a grid of sample points.
"""
from PIL import Image
import numpy as np

Image.MAX_IMAGE_PIXELS = None
print("Loading world2024.png...")
img = Image.open('world2024.png').convert('RGB')
arr = np.array(img)

print(f"Image size: {img.size}")
print()

# Sample every 50th pixel to find all unique colors
sampled = arr[::50, ::50].reshape(-1, 3)

# Count occurrences of each unique color
from collections import Counter
color_counts = Counter(map(tuple, sampled))

# Filter out near-black (ocean/transparent)
visible = {c: n for c, n in color_counts.items() if sum(c) > 15}

# Sort by frequency
sorted_colors = sorted(visible.items(), key=lambda x: -x[1])

print(f"Found {len(visible)} unique colors (excluding near-black):")
print()
for color, count in sorted_colors[:30]:
    r, g, b = color
    pct = count / sum(visible.values()) * 100
    print(f"  rgb({r:3d}, {g:3d}, {b:3d})  — {count:6d} samples ({pct:.1f}%)")
