# Characters

One folder per companion, built from its four master sheets (spec section 5b).

| Path | What it holds | Made by |
| --- | --- | --- |
| `reference/` | the 16 master sheets, concept art only; never edited, moved, animated or shipped | the founder |
| `<species>/ref/` | crops of every sheet panel, cut-out silhouettes and the measurements behind `model.json`, with the scripts that made them | phase 2 |
| `<species>/model.json` | the locked model: proportions, landmarks per view, palette, outline widths, marking map | phase 2, approved at Gate A |
| `<species>/DECISIONS.md` | every choice where the sheets disagree or say nothing, each with the crop that settled it | phase 2 onward |
| `<species>/src/` | the parts drawn in TypeScript, the rig, clip sources, species parameters | phases 3 to 5 |
| built package | `atlas@2x.png`, `atlas@3x.png`, `atlas@5x.png`, `atlas.json`, `rig.json`, `clips/`, `params.json`, `sounds/`, `haptics/`, `package.json` (Appendix F) | the build script; never edited by hand |

The dog comes first (M0). Kitty, bear and rabbit start only after the dog's Gate D for Home and Treats (M2 gate), as parallel lanes.
