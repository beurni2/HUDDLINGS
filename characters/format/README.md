# Character package format, version 1

The contract both runtimes implement: the WebGL runtime (`runtime-web/`) and the SpriteKit runtime (`ios/`). The spec is section 5b and Appendix F; this file pins down what they leave open, so the two runtimes draw the same frame from the same package and the same clock. Anything here that departs from the spec says so.

The test vectors in `vectors/` are the arbiter: both runtimes must reproduce them.

## Units and coordinates

- Lengths are points (pt) at the companion's Grown height of 164 pt (section 5). Times are milliseconds in files and seconds inside the runtimes.
- **y grows downward**, as in Appendix F: a point above the ground has a negative y. +x is the viewer's right. `.L` and `.R` are the companion's own sides, so in the front view `.L` has a positive x.
- **Angles are degrees in files. A positive angle turns +x toward +y**, which is clockwise on screen. SpriteKit's y-up, counter-clockwise convention is converted in its adapter only.
- The `root` bone sits on the ground under the body's centre and never rotates.

## Files

A package is a folder:

| File | Holds |
| --- | --- |
| `package.json` | `format` (1), `species`, `version`, `minRuntime`, and `files`: the SHA-256 of every other file |
| `atlas.json` | the atlas pages and the regions on them |
| `atlas@2x-<n>.png`, `atlas@3x-<n>.png` (and `@5x` on demand) | the parts, each page a power of two, at most 2048 px a side |
| `atlas-small-<n>.png` | every region at the small scale, for the companion below 35% of its size |
| `rig.json` | bones, parts, views, draw orders, springs, warps, clips to masks, scale channels |
| `clips/<name>.json` | one clip each |
| `params.json` | the personality values clips and the life layer read |

Built packages are never edited by hand and are not committed; CI builds them from `characters/<species>/src/`.

## Atlas

- Each region is a part's drawing for one view and one state, rasterized at the page's scale, trimmed to its visible pixels.
- Pages store **straight (non-premultiplied) alpha**, as PNG requires. Both runtimes premultiply when they upload the texture and blend premultiplied (source factor 1, destination factor 1 − source alpha). Section 5b's "premultiplied alpha" is met in memory; storing premultiplied pixels in a PNG would be premultiplied twice by SpriteKit.
- Regions sit 16 px apart; the 2 px ring around each region repeats its edge pixels (extrusion), so filtering never reads a neighbour.
- `atlas.json` holds one set of pages and regions per scale. Every set has the same region names; a runtime loads only the set it draws with.

```json
{ "sets": [ { "name": "2x", "scale": 2,
              "pages": [ { "file": "atlas@2x-0.png", "scale": 2, "width": 1024, "height": 1024 } ],
              "regions": { "ear.L/front": { "page": 0, "x": 18, "y": 18, "w": 64, "h": 90,
                                            "anchorX": 32.0, "anchorY": 6.0 } } },
            { "name": "small", "scale": 0.75, "pages": [ ... ], "regions": { ... } } ] }
```

`anchorX` and `anchorY` are the region pixel that sits on the part's pivot, measured from the region's top-left corner. A region's size in points is its pixel size divided by its set's scale. Pages are numbered within their set (`atlas@2x-0.png`, `atlas@2x-1.png`).

## Rig

```json
{ "format": 1, "species": "test", "height": 164,
  "bones": [ { "name": "root" },
             { "name": "body", "parent": "root", "x": 0, "y": -10, "rot": [-90, 90], "squash": [0.93, 1.07] },
             { "name": "head", "parent": "body", "y": -60, "rot": [-18, 18] },
             { "name": "ear.L", "parent": "head", "x": 30, "y": -60, "rot": [-14, 14],
               "spring": { "hz": 3.0, "damping": 0.5, "com": [0, -15], "follow": 1.0, "inertia": 1.0 } },
             { "name": "tail.1", "parent": "body", "x": 38, "y": -20, "rot": [-40, 40],
               "views": { "side.R": { "x": -42, "y": -26, "rest": -20 } } } ],
  "views": ["front", "side.L", "side.R"],
  "headBone": "head",
  "parts": [ { "name": "ear.L", "bone": "ear.L", "group": "head", "regions": { "front": "ear.L/front" } },
             { "name": "eye.L", "bone": "head", "group": "head", "clipTo": "head.base", "defaultState": "open",
               "regions": { "front:open": "eye.L/front/open", "front:closed": "eye.L/front/closed" } },
             { "name": "tail", "bone": "tail.1", "group": "body",
               "warp": { "chain": ["tail.1", "tail.2", "tail.3"], "columns": 1, "rows": 5 },
               "regions": { "front": "tail/front" } } ],
  "drawOrder": { "front": ["shadow", "tail", "body", "@head", "front.L", "front.R"],
                 "head.front": ["ear.L", "ear.R", "head.base", "eye.L", "eye.R"] },
  "drawOrderVariants": { "front:sniff": ["shadow", "tail", "body", "front.L", "front.R", "@head"] },
  "fakeTurn": { "bone": "head", "yaw": 20, "pitch": 12, "parts": { "eye.L": [6, 4], "nose": [8, 5] } } }
```

- **Bones** are listed parent before child. `x`, `y` and the rest angle (`rest`, default 0) place the pivot in the parent's space. Limits (`rot`, `squash`, `scale`) bound what clips and springs may do, and the validator refuses a clip that leaves them. `rot` limits a clip's offset and, separately, a spring's θ.
- **Per-view placement:** a bone's `views` gives other `x`, `y` and `rest` values for a view whose drawing moves the pivot (the tail roots at the side in front view and at the back in side view). Values it leaves out keep the bone's own.
- **The head bone** (`headBone`, default `head`) and every bone below it take the head's view; every other bone takes the body's view.
- **Transform order:** a bone's world transform is its parent's world transform × translate(x + dx, y + dy) × rotate(rest + r + spring) × scale. `dx`, `dy` and `r` are the clip's offsets.
- **Scale channels** (section 5b): only bones that declare them may scale. `squash` s sets the y scale to s and the x scale to 1/s, so the area is kept exactly. `scale` is uniform. Nothing else scales, and the validator refuses any other scaling.
- **Parts** hang from a bone and draw a region per view (`"front"`) or per view and state (`"front:closed"`). A part draws its state's region if it has one, else its view's, else the view's region for its `defaultState` (`open` if none is given); a part with no region in the current view is not drawn. A part belongs to the `body` or the `head` group: the head and the body can be in different views (section 5b, Views), so the head group's order comes from `head.<view>` and is placed where `@head` stands in the body view's order.
- **The fake turn** (section 5b): the `yaw` and `pitch` channels of `fakeTurn.bone`, in degrees, slide each listed face part by its offset scaled by yaw / `fakeTurn.yaw` (x) and pitch / `fakeTurn.pitch` (y), in the part's own bone space. The head's own drawing does not move.
- **clipTo** draws the part only where the named part's pixels have alpha 0.05 or more: SpriteKit's own rule for `SKCropNode` (Apple: "If the pixel in the mask has an alpha value of less than 0.05, the image pixel is masked out"). WebGL writes the mask part to the stencil buffer, discarding fragments below 0.05.
- **Draw order variants** are swapped in by a clip's `order` event (section 5b: "A clip may change the order only at a marked key"). An `order` event without a name restores the view's own order. A variant lasts until the clip changes it again, carries across a loop's wrap, and ends when another clip takes over (at blend weight 0.5, like a discrete track), so the new clip starts with the view's own order.

## Clips

```json
{ "name": "test_dance", "lengthMs": 2600, "loop": false, "interruptAt": [1200, 2200],
  "tracks": { "head": { "rot": [[0, 0], [420, -16, "easeOutBack"], [1200, -16], [1620, 14, "easeInOut"], [2600, 0, "easeInOut"]] },
              "body": { "squash": [[0, 1], [150, 0.95, "easeOut"], [300, 1.04, "easeOut"], [500, 1, "easeInOut"]] } },
  "states": { "eye.L": [[0, "open"], [1200, "closed"], [1340, "open"]] },
  "views": { "body": [[0, "front"], [900, "side.R"]], "head": [[0, "front"]] },
  "events": [ { "at": 420, "type": "keyPose" }, { "at": 900, "type": "order", "name": "front:sniff" },
              { "at": 420, "type": "sound", "name": "curious_hm" } ] }
```

- **Channels:** `rot`, `x`, `y` (offsets from the rest pose, so 0 is rest), `squash` and `scale` (multipliers, so 1 is rest), and the head's `yaw` and `pitch` for the fake turn.
- **A key is `[time, value, easing]`. Its easing shapes the segment that ends at that key**; the first key's easing is ignored. Before the first key a channel holds the first value, and after the last key it holds the last. This is the reading under which Appendix F's `head_tilt` example makes sense (`[420, -16, "easeOutBack"]` overshoots into −16).
- **Easings**, identical in both runtimes, with u in 0 to 1 the segment's progress:
  - `linear` (the default): u
  - `step`: 0 until the key's time, then 1 (the value jumps at the key)
  - `easeIn`: u³; `easeOut`: 1 − (1 − u)³; `easeInOut`: 4u³ for u < 0.5, else 1 − (−2u + 2)³ / 2
  - `easeOutBack` with overshoot s (default 1.70158, about 10%): 1 + (s + 1)(u − 1)³ + s(u − 1)²; a key may give `["easeOutBack", s]`
  - `["bezier", x1, y1, x2, y2]`: CSS's cubic Bézier, solved for u by 8 Newton steps from u, then bisection to 1e−7 if Newton has not converged
  - Powers are written as products (u·u·u), never `pow`, so both languages produce the same doubles.
- **Discrete tracks** (`states`, `views`) hold each value from its key until the next.
- **Events** fire once when the clip's time crosses `at`, including on a loop's wrap: an event at `at` fires in the first frame whose time is at or past it, an event at 0 fires in the clip's first frame, and on a loop an event at `lengthMs` is refused (it is the event at 0). Events fire in time order, and in file order when times are equal. Only the clip playing fires events; when another clip starts, the old clip's events up to that moment still reach the next frame, then stop.

## Playing, blending and the clock

- **The clock:** the host gives the runtime a time step; the runtime never reads a wall clock. **Springs run at a fixed 120 Hz** (section 5b): the runtime accumulates time and advances the springs in steps of exactly 1/120 s, evaluating the clips at each step's time, so the same clock gives the same springs at any frame rate. The pose drawn at a frame time interpolates the spring angles between the last two steps.
- **Blending:** switching clips blends every channel linearly from the old clip's pose to the new one's over the blend time (150 to 300 ms, section 5b) with an `easeInOut` weight. A channel one clip leaves alone blends from or to its rest value. Switching during a blend blends from the blend in progress, so a quick second switch never pops. Discrete tracks switch to the new clip when the weight reaches 0.5. Pictures are never cross-faded. A clip started with nothing playing shows at once.
- **Time only moves forward:** the host gives absolute times in seconds, and a time earlier than the last one given is an error.
- **Deterministic mode** (section 5b, Controller API): a seeded random source and a clock that advances only by the steps the script gives. The random source is mulberry32: a 32-bit state `a`; each call does `a = (a + 0x6D2B79F5) mod 2³²`, `t = imul(a ^ (a >>> 15), 1 | a)`, `t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t`, and returns `((t ^ (t >>> 14)) >>> 0) / 2³²`.

## Springs

Ears, tails, tags, whiskers and tufts (section 5b, The rig). A spring adds an angle θ (degrees) to its bone, on top of the clip's rotation. In `rig.json`, `spring` is `{ "hz", "damping", "com": [x, y], "follow", "inertia" }`, where `com` is the part's centre of mass in the bone's own space (pt).

- θ″ = −ω²θ − 2ζωθ′ − follow·φ″ + inertia·α, in degrees per second squared
- ω = 2π·hz and ζ is the damping ratio.
- φ is the parent's world angle: the sum of the rotations (rest + clip + spring) of every ancestor. The `follow` term makes the part lag its parent's turns.
- α = −(r × a) / |r|² · (180/π): the swing a carried part feels. r is `com` turned into world space by the bone's world rotation, a is the world acceleration of the bone's pivot (pt/s²), and r × a = rₓa_y − r_ya_x. With y down and clockwise-positive angles this is the ordinary 2D cross product.
- Integration: semi-implicit Euler with h = 1/120 s: θ′ += h·θ″, then θ += h·θ′. φ″ and a are second differences of the parent's angle and of the pivot's world position over the last three steps (zero for the first two steps after the rig loads).
- Each step poses the bones parent first, at the step's own clip time, so a spring feels its parent's spring from the same step. Its r uses its own θ from before the step. Every spring starts at θ = 0, θ′ = 0.
- θ is clamped to the bone's `rot` limit, and θ′ is zeroed when it is clamped.
- Gravity and the phone's own movement (section 6) are added to a from M1.
- Step times are counted, never summed: step n runs at exactly n/120 s, and a frame at time T runs every step with n/120 ≤ T (within 1e−9 s), then draws θ interpolated between steps n−1 and n by (T − n/120)·120, clamped to 0 to 1. The drawn spring is one step behind; in exchange every frame rate draws the same curve.

## Bending parts

Only the rabbit's ears and the kitty's tail bend (section 5b, Bends). A bending part is one region on a control grid of 2 × 6 points (1 column, 5 rows) driven by its chain of bones, which starts at the part's own bone, each bone the child of the one before. Each row of the grid, from the top of the region to the bottom, belongs to the chain bone that owns its place along the chain at rest: the row is carried into that bone's space by the inverse of the bone's rest transform, then moved by the bone's world transform. This works the same for parts that point up from their root (a tail) and parts that hang down (lop ears).

**Proposal, departing from the letter of section 5b:** the spec sets SpriteKit's `subdivisionLevels` "to match the WebGL mesh". Apple does not document how SpriteKit subdivides a warp grid ("The maximum number of subdivision iterations used to generate the final vertices"), so matching it is guesswork. Instead, both runtimes expand the 2 × 6 control grid into the same dense mesh, by Catmull–Rom interpolation along each column to 4 sub-rows per row (2 × 21 points), with the grid continued in a straight line beyond its end rows so evenly spaced rows at rest stay evenly spaced, and draw that mesh as it is: WebGL as triangles, SpriteKit as an `SKWarpGeometryGrid` of 1 × 20 cells with no further subdivision. The bend is then identical by construction. Phase 1 proves SpriteKit accepts it; if it cannot, the finding goes into `docs/LIMITATIONS.md`.

## Arriving in phase 4

Section 5b puts these in the dog's rigging (phase 4), so this version of the format leaves them out; each will extend the contract, its vectors and both runtimes together:

- the fake turn's far-eye narrowing (up to 6%) and the three-quarter view swap past 22° of yaw, back below 18°, decided at spring steps so every frame rate swaps on the same step;
- the stance lock (planted paws never slide), from the `plant` and `lift` events;
- look-at, gravity and the phone's movement in the springs (section 6, from M1).

## Rendering

- A part's quad is its region's size in points, placed so its anchor sits on the bone's pivot, transformed by the bone's world transform, then by the stage: the root's position on screen and the scale from points to pixels.
- Textures use linear filtering. Pages are powers of two so both runtimes can use mipmaps; below 35% of the companion's size, the runtime switches to the `small` set.
- For comparisons, frames are rendered on an opaque background into an 8-bit RGBA target without colour conversion, so both runtimes blend in the same space.

## Test vectors

`vectors/*.json` are generated by the web runtime (`npm run vectors`) and checked by both runtimes' tests: easings, curves, the random source, springs over scripted parent motion, bone world transforms, blends and dense warp meshes. A runtime passes when every number matches within 1e−9 (angles in degrees, lengths in points).
