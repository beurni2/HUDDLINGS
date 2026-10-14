"""Parity (spec section 5b, Visual QA): the SpriteKit frames against the WebGL
frames of the same clip on the same clock, frame by frame, SSIM 0.95 or more.

python3 tools/qa/parity.py <web folder> <spritekit folder> <report folder>

Each folder holds one subfolder per run (full, small) of f0000.png ... frames,
directly or in a frames/ folder (as runtime-web/lab/render.ts writes them).
Writes report.json and a sheet of the worst frames side by side (web | SpriteKit
| difference), and exits 1 if any frame is below the threshold or missing."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity

THRESHOLD = 0.95


def load(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8)


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
    (out / "report.json").write_text(json.dumps(report, indent=1) + "\n")
    return 1 if failed else 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
