"""Guide images for placing a drawing's nodes by hand (spec section 5b, phase
3): the turnaround crop enlarged with a grid in model space, so each node is
read off by eye and typed into the part's source.

    python3 tools/guide/grid.py dog front
    python3 tools/guide/grid.py dog front --box -50 -170 50 -50 --zoom 8 --still <dir> --trace

Writes build/guides/<species>/<view>[_<box>].png (gitignored): the crop at
--zoom (6 to 8; default 7) with a 5 pt grid, every 10 pt drawn darker and
numbered, the axes through the origin (the ground under the seat) marked,
and model.json's landmarks named. Model space is the sheet match's: model
point p sits on crop pixel ground + 0.5 + p / ptPerCropPx. Options:
  --box x0 y0 x1 y1  a window in points (default: the whole crop)
  --still <dir>      an onion skin of the current render (a still from
                     runtime-web/lab/still.ts) at --onion opacity (default 0.5)
  --trace            the crop's cut-out and dark features traced by potrace,
                     at 25% opacity: a faint placement guide only.
A .R facing shows the mirror of its .L crop, as the sheet match holds it.

Rule R8: no node is ever taken from the sheet by code. The trace exists only
in this image, is never kept, and this tool never writes under characters/,
build/characters/, ios/, web/ or runtime-web/ (--out may name build/guides/ or
any folder outside the repository)."""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "characters" / "sheetmatch"))
import match  # noqa: E402  (and through it refprep's measure and sheets)

MINOR, MAJOR = 5, 10  # pt
FADE = 0.2  # the art eased toward white, so the grid and the names read over it
TRACE_OPACITY = 0.25
GRID = (0, 110, 230)
AXIS = (220, 30, 60)
LANDMARK = (200, 0, 90)
TRACE = (20, 20, 20)
# A guide holds the sheet's pixels and maybe a trace: never where the drawing code reads (characters/) or in anything
# the app or the web page ships (the packages the app bundles, ios/, web/, runtime-web/).
REFUSED = (("characters",), ("build", "characters"), ("ios",), ("web",), ("runtime-web",))


class Guide:
    """The crop in the facing's own orientation, its window, and where a model point lands on the image."""

    def __init__(self, species, view, zoom, box=None):
        model = json.loads((ROOT / "characters" / species / "model.json").read_text())
        self.frame = frame = match.Frame(species, model, view)
        self.crop, self.sil = frame.crop, frame.sil
        gx, gy = frame.rec["anchorsCropPx"]["ground"]
        self.landmarks = model["landmarks"][frame.source]
        if frame.mirrored:
            self.crop, self.sil = np.ascontiguousarray(self.crop[:, ::-1]), self.sil[:, ::-1]
            gx = self.crop.shape[1] - 1 - gx
            self.landmarks = {match.swap_sides(n): [-x, y] for n, (x, y) in self.landmarks.items()}
        self.ground, self.k, self.zoom = (gx, gy), frame.k, zoom
        h, w = self.sil.shape
        if box:
            (x0, y0), (x1, y1) = self.to_crop(box[:2]), self.to_crop(box[2:])
            self.window = (max(0.0, min(x0, x1)), max(0.0, min(y0, y1)), min(w, max(x0, x1)), min(h, max(y0, y1)))
        else:
            self.window = (0.0, 0.0, float(w), float(h))
        x0, y0, x1, y1 = self.window
        self.size = (int(round((x1 - x0) * zoom)), int(round((y1 - y0) * zoom)))

    def to_crop(self, pt):
        """A model point in continuous crop pixels."""
        return (self.ground[0] + 0.5 + pt[0] / self.k, self.ground[1] + 0.5 + pt[1] / self.k)

    def to_image(self, pt):
        x, y = self.to_crop(pt)
        return ((x - self.window[0]) * self.zoom, (y - self.window[1]) * self.zoom)

    def to_pt(self, xy):
        """An image position back to model points."""
        return ((xy[0] / self.zoom + self.window[0] - self.ground[0] - 0.5) * self.k,
                (xy[1] / self.zoom + self.window[1] - self.ground[1] - 0.5) * self.k)

    def base(self):
        art = Image.fromarray(self.crop).resize(self.size, Image.LANCZOS, box=self.window)
        return Image.blend(art, Image.new("RGB", self.size, "white"), FADE).convert("RGBA")


def onion(guide, folder, opacity):
    """The still, carried into the guide's pixels through model space, at the given opacity."""
    still = match.Still.load(folder)
    colour = np.where(still.alpha[..., None] > 0, still.premult / np.maximum(still.alpha[..., None], 1e-6), 0)
    rgba = np.dstack([np.clip(colour * 255, 0, 255), still.alpha * 255 * opacity]).round().astype(np.uint8)
    # Guide pixel u is crop pixel window + u / zoom, model point (crop - ground - 0.5) k, still pixel root + ppp pt.
    a = still.ppp * guide.k / guide.zoom
    bx = still.root[0] + still.ppp * guide.k * (guide.window[0] - guide.ground[0] - 0.5)
    by = still.root[1] + still.ppp * guide.k * (guide.window[1] - guide.ground[1] - 0.5)
    return Image.fromarray(rgba, "RGBA").transform(guide.size, Image.AFFINE, (a, 0, bx, 0, a, by), Image.BICUBIC)


def trace(guide):
    """Outlines potrace fits to the crop's cut-out and its dark features (eyes, nose), drawn faintly."""
    if shutil.which("potrace") is None:
        raise SystemExit("guide: --trace needs potrace (apt install potrace)")
    layer = Image.new("RGBA", guide.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    h = guide.sil.shape[0]
    dark = match.measure.Classes(guide.crop, guide.sil).dark
    with tempfile.TemporaryDirectory() as folder:
        for index, mask in enumerate((guide.sil, dark)):
            path = Path(folder) / f"{index}.pbm"
            Image.fromarray(~mask).convert("1").save(path)  # potrace traces the black pixels
            found = subprocess.run(["potrace", "-b", "geojson", "-o", "-", str(path)], capture_output=True, text=True, check=True)
            for feature in json.loads(found.stdout)["features"]:
                for ring in feature["geometry"]["coordinates"]:
                    # GeoJSON from potrace counts y up from the bottom, in pixel corners.
                    points = [((x - guide.window[0]) * guide.zoom, (h - y - guide.window[1]) * guide.zoom) for x, y in ring]
                    draw.line(points + points[:1], fill=TRACE + (int(255 * TRACE_OPACITY),), width=2)
    return layer


def grid(image, guide):
    """The 5 pt grid, every 10 pt darker and numbered, and the axes through the origin."""
    draw = ImageDraw.Draw(image, "RGBA")
    (x0, y0), (x1, y1) = guide.to_pt((0, 0)), guide.to_pt(guide.size)
    for axis, lo, hi in ((0, min(x0, x1), max(x0, x1)), (1, y0, y1)):
        for value in range(int(np.floor(lo / MINOR)) * MINOR, int(np.ceil(hi)) + 1, MINOR):
            major = value % MAJOR == 0
            colour = AXIS + (200,) if value == 0 else GRID + (170 if major else 45,)
            if axis == 0:
                x = guide.to_image((value, 0))[0]
                draw.line([(x, 0), (x, image.height)], fill=colour, width=2 if value == 0 else 1)
                if major:
                    label(draw, (x + 2, 2), str(value), colour[:3])
            else:
                y = guide.to_image((0, value))[1]
                draw.line([(0, y), (image.width, y)], fill=colour, width=2 if value == 0 else 1)
                if major:
                    label(draw, (2, y + 2), str(value), colour[:3])


def label(draw, xy, text, fill):
    draw.text(xy, text, fill=fill, stroke_width=2, stroke_fill=(255, 255, 255))


def landmarks(image, guide):
    draw = ImageDraw.Draw(image)
    for name, pt in guide.landmarks.items():
        x, y = guide.to_image(pt)
        draw.line([(x - 7, y), (x + 7, y)], fill=LANDMARK, width=2)
        draw.line([(x, y - 7), (x, y + 7)], fill=LANDMARK, width=2)
        label(draw, (x + 6, y + 4), f"{name} {pt[0]:g}, {pt[1]:g}", LANDMARK)


def out_path(args):
    """Where the guide goes: build/guides/ by default, or anywhere outside what the drawing code reads and what the
    app and the web page ship (REFUSED), symbolic links followed and case ignored."""
    if args.out:
        path = Path(args.out).resolve()
    else:
        suffix = "_" + "_".join(f"{v:g}" for v in args.box) if args.box else ""
        path = ROOT / "build" / "guides" / args.species / f"{args.view}{suffix}.png"
    if path.is_relative_to(ROOT):
        parts = tuple(p.casefold() for p in path.relative_to(ROOT).parts)
        for folder in REFUSED:
            if parts[:len(folder)] == folder:
                raise SystemExit(f"guide: a guide never goes under {'/'.join(folder)}/ (rule R8); it lives in build/guides/")
    return path


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("species")
    parser.add_argument("view")
    parser.add_argument("--zoom", type=float, default=7)
    parser.add_argument("--box", type=float, nargs=4, metavar=("X0", "Y0", "X1", "Y1"))
    parser.add_argument("--still")
    parser.add_argument("--onion", type=float, default=0.5)
    parser.add_argument("--trace", action="store_true")
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    path = out_path(args)
    guide = Guide(args.species, args.view, args.zoom, args.box)
    image = guide.base()
    if args.trace:
        image = Image.alpha_composite(image, trace(guide))
    if args.still:
        image = Image.alpha_composite(image, onion(guide, args.still, args.onion))
    grid(image, guide)
    landmarks(image, guide)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path)
    print(f"guide: {path} ({image.width} x {image.height} px, {args.zoom:g} px per crop px, "
          f"{args.zoom / guide.k:.2f} px per pt)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
