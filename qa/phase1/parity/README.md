# Parity, phase 1

The test dance at 30 frames per second, rendered by WebGL (headless Chromium) and by SpriteKit (`SKRenderer`, iOS 26.2 simulator, Xcode 26.3), compared frame by frame by `tools/qa/parity.py`: SSIM on the character, 0.95 or more, and no patch where one runtime draws a part the other does not (`docs/QUESTIONS.md` E20).

Green on 0ceaeef with Xcode 26.3, [run 38565382683](https://github.com/beurni2/HUDDLINGS/actions/runs/38565382683), and with the same numbers on 063de9a with Xcode 16.4 ([run 38562879385](https://github.com/beurni2/HUDDLINGS/actions/runs/38562879385)):

| Run | Frames | SSIM on the character, min | Mean | Frames with a part-sized disagreement |
| --- | --- | --- | --- | --- |
| Full size: 400 px, 2 px per point, the 2x set | 127 | 0.9862 | 0.9996 | 0 |
| Small: 160 px, 0.6 px per point, the small set | 127 | 0.9794 | 0.9979 | 0 |

The strips show frames 0, 32, 63, 94 and 126, web above, SpriteKit below: `full-evidence.jpg` and `small-evidence.jpg`.

Before the web stopped using mipmaps (E21), the small run's minimum was 0.9474 (frame 80), its differences all along outlines.
