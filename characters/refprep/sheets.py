"""Shared helpers for preparing a species' references from its master sheets
(spec section 5b, phase 2). The sheets are concept art: these tools crop and
measure them for drawing and checking; nothing they write is ever shipped."""
import hashlib
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ("master", "rigging", "motion", "expressions")


def sheet_path(species, sheet):
    return ROOT / "characters" / "reference" / species / f"{sheet}.jpg"


def load_sheet(species, sheet):
    """A sheet as RGB bytes, rows first, exactly as decoded (no colour management)."""
    with Image.open(sheet_path(species, sheet)) as image:
        return np.asarray(image.convert("RGB"), dtype=np.uint8)


def to_lab(rgb):
    """CIE L*a*b* (D65) of sRGB bytes, as floats: L in 0..100."""
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def hex_to_rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.uint8)


def rgb_to_hex(rgb):
    return "#" + "".join(f"{int(round(v)):02X}" for v in rgb)


def delta_e2000(lab1, lab2):
    """CIEDE2000 colour difference (Sharma, Wu and Dalal, 2005), broadcasting over the last axis."""
    L1, a1, b1 = np.moveaxis(np.asarray(lab1, dtype=np.float64), -1, 0)
    L2, a2, b2 = np.moveaxis(np.asarray(lab2, dtype=np.float64), -1, 0)
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cbar = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cbar ** 7 / (Cbar ** 7 + 25.0 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dLp = L2 - L1
    dCp = C2p - C1p
    dh = h2p - h1p
    dh = np.where(C1p * C2p == 0, 0, np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh)))
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dh / 2))
    Lbp = (L1 + L2) / 2
    Cbp = (C1p + C2p) / 2
    hsum = h1p + h2p
    hbp = np.where(C1p * C2p == 0, hsum,
                   np.where(np.abs(h1p - h2p) <= 180, hsum / 2, np.where(hsum < 360, (hsum + 360) / 2, (hsum - 360) / 2)))
    T = (1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp))
         + 0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.20 * np.cos(np.radians(4 * hbp - 63)))
    dtheta = 30 * np.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * np.sqrt(Cbp ** 7 / (Cbp ** 7 + 25.0 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / np.sqrt(20 + (Lbp - 50) ** 2)
    Sc = 1 + 0.045 * Cbp
    Sh = 1 + 0.015 * Cbp * T
    Rt = -np.sin(np.radians(2 * dtheta)) * Rc
    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


def ink_mask(rgb):
    """Pixels that are drawn: darker or more colourful than the pale paper and the cards behind the art."""
    lab = to_lab(rgb)
    return (lab[..., 0] < 84) | (np.hypot(lab[..., 1], lab[..., 2]) > 16)


def pixels_sha256(array):
    """A hash of an image's pixels and shape, not of a file's bytes, which depend on the PNG encoder."""
    array = np.ascontiguousarray(array)
    return hashlib.sha256(f"{array.shape}{array.dtype}".encode() + array.tobytes()).hexdigest()


NUMBERS = re.compile(r"\[\s*(-?[0-9.eE+-]+(?:,\s*-?[0-9.eE+-]+)*)\s*\]")


def write_json(path, value):
    """Indented JSON with each list of numbers (a point, a box) kept on one line."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = NUMBERS.sub(lambda m: "[" + ", ".join(v.strip() for v in m.group(1).split(",")) + "]",
                       json.dumps(value, indent=1, ensure_ascii=False))
    path.write_text(text + "\n", encoding="utf-8")


def save_jpeg(path, array):
    """A review image too large for PNG (a whole sheet with boxes drawn on it), at a fixed quality."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(array).save(path, format="JPEG", quality=90, subsampling=0, optimize=False)


def save_png(path, array):
    """Writes a PNG with no colour chunks and no timestamp, so the same input gives the same bytes."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(array).save(path, format="PNG", optimize=False, compress_level=9)
