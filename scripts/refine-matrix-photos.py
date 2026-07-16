#!/usr/bin/env python3
"""Download matrix device cutouts, defringe on white, and save retina PNGs."""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = ROOT / "matrix-bridge.json"
OUT_DIR = ROOT / "assets" / "matrix-photos"
CDN = "https://bnarcum.github.io/collaboration-device-matrix/devices/img-{}.webp"


def refine(img: Image.Image, *, feather: float = 3.6, alpha_cut: int = 24, scale: int = 3) -> Image.Image:
    img = img.convert("RGBA")
    arr = np.array(img, dtype=np.float32)
    rgb = arr[..., :3]
    alpha = arr[..., 3]

    # Drop near-transparent dark specks that cause spiky halos on white.
    speck = (alpha > 0) & (alpha < alpha_cut) & (rgb.sum(axis=-1) < 210)
    arr[speck, 3] = 0
    arr[speck, :3] = 255

    a = arr[..., 3] / 255.0
    bg = 255.0
    edge = (a > 0) & (a < 1)
    for c in range(3):
        ch = arr[..., c]
        ch[edge] = np.clip((ch[edge] - bg * (1 - a[edge])) / np.maximum(a[edge], 0.08), 0, 255)

    out = Image.fromarray(arr.astype(np.uint8), "RGBA")
    r, g, b, alpha_ch = out.split()
    alpha_ch = alpha_ch.filter(ImageFilter.BoxBlur(feather))
    out = Image.merge("RGBA", (r, g, b, alpha_ch))

    if scale > 1:
        out = out.resize((out.width * scale, out.height * scale), Image.Resampling.LANCZOS)
    return out


def main() -> int:
    bridge = json.loads(BRIDGE.read_text())
    hashes = sorted({
        e["hash"]
        for e in bridge.get("products", {}).values()
        if e.get("hash") and not e.get("image")
    })
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = 0
    for h in hashes:
        dest = OUT_DIR / f"img-{h}.png"
        try:
            raw = urlopen(CDN.format(h), timeout=30).read()
            img = refine(Image.open(io.BytesIO(raw)))
            img.save(dest, optimize=True)
            print(f"ok  {h} -> {dest.name} ({img.width}x{img.height})")
            ok += 1
        except Exception as exc:
            print(f"err {h}: {exc}", file=sys.stderr)
    print(f"refined {ok}/{len(hashes)}")
    return 0 if ok == len(hashes) else 1


if __name__ == "__main__":
    raise SystemExit(main())
