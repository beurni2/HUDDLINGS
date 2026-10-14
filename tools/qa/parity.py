"""Parity (spec section 5b, Visual QA): the SpriteKit frames against the WebGL
frames of the same clip on the same clock, frame by frame, SSIM 0.95 or more.

python3 tools/qa/parity.py <web folder> <spritekit folder> <report folder>

Each folder holds one subfolder per run (full, small) of f0000.png ... frames,
directly or in a frames/ folder (as runtime-web/lab/render.ts writes them).
Writes report.json and a sheet of the worst frames side by side (web | SpriteKit
| difference), and exits 1 if any frame is below the threshold or missing."""
import base64
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity

THRESHOLD = 0.95


def load(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8)


def diagnose(a, b):
    """What kind of difference two frames show: where the drawing sits, its best shift, a flip, its colour."""
    def box(img):
        ink = (img.astype(int).sum(axis=2) < 3 * 250).nonzero()
        if len(ink[0]) == 0:
            return None, None
        return (int(ink[1].min()), int(ink[0].min()), int(ink[1].max()), int(ink[0].max())), (float(ink[1].mean()), float(ink[0].mean()))
    box_a, centre_a = box(a)
    box_b, centre_b = box(b)
    ga, gb = a.astype(float).mean(axis=2), b.astype(float).mean(axis=2)
    best = None
    for dy in range(-24, 25, 2):
        for dx in range(-24, 25, 2):
            err = float(((ga - np.roll(np.roll(gb, dy, axis=0), dx, axis=1)) ** 2).mean())
            if best is None or err < best[0]:
                best = (err, dx, dy)
    flipped = structural_similarity(a, b[::-1], channel_axis=2, data_range=255)
    ink = (a.astype(int).sum(axis=2) < 3 * 250) & (b.astype(int).sum(axis=2) < 3 * 250)
    colour = (b.astype(float) - a.astype(float))[ink].mean(axis=0).round(1).tolist() if ink.any() else None
    return {"web box": box_a, "spritekit box": box_b, "web centre": centre_a, "spritekit centre": centre_b,
            "best shift moving spritekit (dx, dy)": best[1:], "mse at best shift": round(best[0], 1),
            "ssim if spritekit were flipped": round(float(flipped), 4), "mean colour difference where both draw": colour}


def sheet_text(rows):
    """A small side-by-side sheet as base64 JPEG, for logs where artifacts cannot be fetched."""
    image = Image.fromarray(np.concatenate(rows, axis=0))
    image.thumbnail((720, 720))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=80)
    text = base64.b64encode(buffer.getvalue()).decode("ascii")
    return [text[i:i + 100] for i in range(0, len(text), 100)]


def frames(root, run):
    nested = root / run / "frames"
    return nested if nested.is_dir() else root / run


def main(web, spritekit, out):
    web, spritekit, out = Path(web), Path(spritekit), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    report = {"threshold": THRESHOLD, "runs": {}}
    failed = False
    for run in sorted(p.name for p in web.iterdir() if p.is_dir()):
        names = sorted(p.name for p in frames(web, run).glob("f*.png"))
        if not names:
            print(f"parity: {run}: no web frames")
            failed = True
            continue
        scores = []
        for name in names:
            other = frames(spritekit, run) / name
            if not other.exists():
                print(f"parity: {run}/{name}: no SpriteKit frame")
                failed = True
                continue
            a, b = load(frames(web, run) / name), load(other)
            if a.shape != b.shape:
                print(f"parity: {run}/{name}: sizes differ, {a.shape} vs {b.shape}")
                failed = True
                continue
            score = structural_similarity(a, b, channel_axis=2, data_range=255)
            scores.append((float(score), name))
        if not scores:
            continue
        values = [s for s, _ in scores]
        worst = sorted(scores)[:6]
        below = [n for s, n in scores if s < THRESHOLD]
        report["runs"][run] = {"frames": len(scores), "min": min(values), "mean": float(np.mean(values)), "worst": worst, "below": below}
        print(f"parity: {run}: {len(scores)} frames, SSIM min {min(values):.4f}, mean {np.mean(values):.4f}, below {THRESHOLD}: {len(below)}")
        if below:
            failed = True
        rows = []
        for _, name in worst:
            a, b = load(frames(web, run) / name), load(frames(spritekit, run) / name)
            diff = np.abs(a.astype(int) - b.astype(int)).sum(axis=2)
            heat = np.clip(255 - diff * 4, 0, 255).astype(np.uint8)
            rows.append(np.concatenate([a, b, np.stack([heat] * 3, axis=2)], axis=1))
        Image.fromarray(np.concatenate(rows, axis=0)).save(out / f"{run}-worst.png")
        first = names[0]
        a0, b0 = load(frames(web, run) / first), load(frames(spritekit, run) / first)
        report["runs"][run]["diagnosis of " + first] = diagnose(a0, b0)
        print(f"parity: {run}: diagnosis of {first}: {json.dumps(report['runs'][run]['diagnosis of ' + first])}")
        if below:
            # The first frame and the worst ones (web | SpriteKit | difference), readable from the log alone.
            print(f"PARITY-SHEET-BEGIN {run}")
            for line in sheet_text([np.concatenate([a0, b0, np.stack([np.clip(255 - np.abs(a0.astype(int) - b0.astype(int)).sum(axis=2) * 4, 0, 255).astype(np.uint8)] * 3, axis=2)], axis=1)] + rows[:2]):
                print(line)
            print(f"PARITY-SHEET-END {run}")
    (out / "report.json").write_text(json.dumps(report, indent=1) + "\n")
    return 1 if failed else 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
