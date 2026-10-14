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
             { "name": "head", "parent": "body", "y": -60, "rot": [-18, 18], "yaw": [-60, 60], "pitch": [-12, 12] },
             { "name": "ear.L", "parent": "head", "x": 30, "y": -60, "rot": [-14, 14],
               "spring": { "hz": 3.0, "damping": 0.5, "com": [0, -15], "follow": 1.0, "selfFollow": 0.6, "inertia": 1.0 } },
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
  "fakeTurn": { "bone": "head", "yawDeg": 20, "pitchDeg": 12,
                "faceShift": 0.06, "markingShift": 0.03, "earShift": 0.03, "nodShift": 0.05, "farEyeNarrow": 0.06,
                "views": { "front": { "size": [118, 104] } },
                "roles": { "eye.L": "face", "eye.R": "face", "nose": "face", "marking.head": "marking", "ear.L": "ear", "ear.R": "ear" },
                "farEye": { "positive": "eye.L", "negative": "eye.R" } } }
```

- **Bones** are listed parent before child. `x`, `y` and the rest angle (`rest`, default 0) place the pivot in the parent's space. Limits (`rot`, `squash`, `scale`, `yaw`, `pitch`) bound what clips may key, and the validator refuses a clip that leaves them; a bone without a `rot`, `yaw` or `pitch` limit is never keyed on that channel. `rot` limits are around the rest angle and contain 0. The root never rotates or squashes.
- **Per-view placement:** a bone's `views` gives other `x`, `y` and `rest` values for a view whose drawing moves the pivot (the tail roots at the side in front view and at the back in side view). Values it leaves out keep the bone's own.
- **The head bone** (`headBone`, default `head`) and every bone below it take the head's view; every other bone takes the body's view.
- **Transforms:** each bone has a frame (rotation and translation) and its own scale. A bone's frame is its parent's frame × translate(S_parent · (x + dx, y + dy)) × rotate(rest + r + spring), where S_parent is the parent's own scale and `dx`, `dy` and `r` are the clip's offsets. A bone's parts are drawn with its frame × its own scale. So **a bone's scale reaches its parts and its children's pivot positions, never its children's own size or shape**: breathing lifts the head without scaling it, and a squashed body never shears a tilted head. The exception is the root, whose uniform `scale` is the whole companion's (its perspective, coming closer): it is part of the root's frame and reaches everything.
- **Scale channels** (section 5b): only bones that declare them may scale. `squash` s sets the y scale to s and the x scale to 1/s, so the area is kept exactly. `scale` is uniform. Nothing else scales but the fake turn's far eye, and the validator refuses any other scaling.
- **Parts** hang from a bone and draw a region per view (`"front"`) or per view and state (`"front:closed"`). A part draws its state's region if it has one, else its view's, else the view's region for its `defaultState` (`open` if none is given); a part with no region in the current view is not drawn. A part belongs to the `body` or the `head` group: the head and the body can be in different views (section 5b, Views), so the head group's order comes from `head.<view>` and is placed where `@head` stands in the body view's order.
- **clipTo** draws the part only where the named part's pixels have alpha 0.05 or more: SpriteKit's own rule for `SKCropNode` (Apple: "If the pixel in the mask has an alpha value of less than 0.05, the image pixel is masked out"). WebGL writes the mask part to the stencil buffer, discarding fragments below 0.05. The parts clipped to one mask form a **clip group**, because a crop node draws its children together at one place in the order: in every order the rig can draw (each view's order and each variant, with each head order), a clip group is contiguous and comes after its mask. A clipped part whose mask is not drawn is not drawn. In version 1 clips do not nest (a mask is not itself clipped), and a bending part is neither clipped nor a mask; markings on a bending part are painted into its region at build time.
- **Draw order variants** are named `<view>:<variant>` and chosen by a clip's `order` track (section 5b: "A clip may change the order only at a marked key"). The track's value at the clip's time picks the body view's variant of that name; `null`, or a variant the current view does not have, draws the view's own order.
- **The fake turn** (section 5b): the `yaw` and `pitch` channels of `fakeTurn.bone`, in degrees. With u = clamp(yaw / `yawDeg`, −1, 1) and v = clamp(pitch / `pitchDeg`, −1, 1), and the head's width W and height H in the current head view (`views.<view>.size`), each part with a role slides, in the fake turn bone's space: `face` by (`faceShift`·W·u, `nodShift`·H·v), `marking` by (`markingShift`·W·u, 0), `ear` by (−`earShift`·W·u, 0). For u > 0 the `farEye.positive` part narrows about its region's centre to an x scale of 1 − `farEyeNarrow`·u, and for u < 0 the `farEye.negative` part to 1 + `farEyeNarrow`·u. Positive yaw slides the face toward +x and positive pitch toward +y (down). Beyond full yaw or pitch the shifts hold. Face and marking parts must be clipped (to the head base), so nothing leaves the head and its outline never changes; in a head view the block does not list, nothing slides.

## Clips

```json
{ "name": "test_dance", "lengthMs": 2600, "loop": false, "blendInMs": 200, "interruptAt": [1200, 2200],
  "tracks": { "head": { "rot": [[0, 0], [420, -16, "easeOutBack"], [1200, -16], [1620, 14], [2600, 0]],
                        "yaw": [[0, 0], [600, 14, "easeOut"], [1400, 14], [1800, 0]] },
              "body": { "squash": [[0, 1], [150, 0.95, "easeOut"], [300, 1.04, "easeOut"], [500, 1]] } },
  "states": { "eye.L": [[0, "open"], [1200, "closed"], [1340, "open"]] },
  "views": { "body": [[0, "front"], [900, "side.R"]], "head": [[0, "front"]] },
  "order": [[0, null], [1900, "sniff"]],
  "events": [ { "at": 420, "type": "keyPose" }, { "at": 420, "type": "sound", "name": "curious_hm" } ] }
```

- **Channels:** `rot`, `x`, `y` (offsets from the rest pose, so 0 is rest), `squash` and `scale` (multipliers, so 1 is rest), and the fake turn bone's `yaw` and `pitch`.
- **A key is `[time, value, easing]`. Its easing shapes the segment that ends at that key**; the first key's easing is ignored. Before the first key a channel holds the first value, and after the last key it holds the last. This is the reading under which Appendix F's `head_tilt` example makes sense (`[420, -16, "easeOutBack"]` overshoots into −16).
- **Easings**, identical in both runtimes, with u in 0 to 1 the segment's progress:
  - `easeInOut` (the default, so nothing moves evenly spaced unless a key asks): 4u³ for u < 0.5, else 1 − (−2u + 2)³ / 2
  - `linear`: u
  - `step`: 0 until the key's time, then 1 (the value jumps at the key)
  - `easeIn`: u³; `easeOut`: 1 − (1 − u)³
  - `easeOutBack` with overshoot s (default 1.70158, about 10%): 1 + (s + 1)(u − 1)³ + s(u − 1)²; a key may give `["easeOutBack", s]`
  - `["bezier", x1, y1, x2, y2]`: CSS's cubic Bézier, solved for u by 8 Newton steps from u, then bisection to 1e−7 if Newton has not converged
  - Powers are written as products (u·u·u), never `pow`, so both languages produce the same doubles.
- **Discrete tracks** (`states`, `views`, `order`) hold each value from its key until the next, and before the first key they hold the first value. They are functions of the clip's time, so they wrap with a loop and scrubbing gives the same picture.
- **Events** (`keyPose`, `sound`, `haptic`, `effect`, `plant`, `lift`, `footstep`) fire once when the clip's time crosses `at`, including on a loop's wrap: an event fires in the first frame whose time is at or past it, an event at 0 fires in the clip's first frame, and on a loop an event at `lengthMs` is refused (it is the event at 0). Events fire in time order, and in file order when times are equal. Only the clip playing fires events; when another clip starts, the old clip's events up to that moment still reach the next frame, then stop.

## Playing, blending and the clock

- **The clock:** the host gives the runtime absolute times in seconds; the runtime never reads a wall clock, and a time earlier than the last one given is an error. **Springs run at a fixed 120 Hz** (section 5b): step n runs at exactly n/120 s and evaluates the clips at that time, so the same clock gives the same springs at any frame rate. The pose drawn at a frame time interpolates the spring angles between the last two steps.
- **Blending:** switching clips blends every channel linearly from the old clip's pose to the new one's with an `easeInOut` weight, over the new clip's `blendInMs` (150 to 300 ms, section 5b; 200 by default) unless the switch names another time. The old clip keeps playing during the blend (held at its end if it does not loop). A channel one clip leaves alone blends from or to its rest value. Switching during a blend blends from the blend in progress, so a quick second switch never pops. Discrete tracks switch to the new clip when the weight reaches 0.5. Pictures are never cross-faded. A clip started with nothing playing shows at once, and a switch with a blend of 0 is a cut (Springs).
- **Travel:** the host moves the companion through the root's `x` and `y` in points, so springs feel the journey; the stage (its place on screen and the scale from points to pixels) is only a camera.
- **Deterministic mode** (section 5b, Controller API): a seeded random source and a clock that advances only by the steps the script gives. The random source is mulberry32: a 32-bit state `a`; each call does `a = (a + 0x6D2B79F5) mod 2³²`, `t = imul(a ^ (a >>> 15), 1 | a)`, `t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t`, and returns `((t ^ (t >>> 14)) >>> 0) / 2³²`. **Every consumer draws from its own named stream**, seeded with seed XOR FNV-1a(name) (32-bit FNV-1a over the name's UTF-8 bytes: start at 0x811C9DC5; for each byte, XOR it in, then multiply by 0x01000193 mod 2³²), for example `blink`, `gaze`, `ear.L.twitch` or `variation:head_tilt`. Adding a consumer never shifts another's draws.

## Springs

Ears, tails, tags, whiskers and tufts (section 5b, The rig). A spring adds an angle θ (degrees) to its bone, on top of the clip's rotation. In `rig.json`, `spring` is `{ "hz", "damping", "com": [x, y], "follow", "selfFollow", "inertia" }`, where `com` is the part's centre of mass in the bone's own space (pt, at least 2 pt from the pivot) and `selfFollow` defaults to 0.

- θ″ = −ω²θ − 2ζωθ′ − follow·φ″ − selfFollow·ψ″ + inertia·α, in degrees per second squared
- ω = 2π·hz and ζ is the damping ratio. Both are nominal: semi-implicit Euler at 120 Hz adds a little damping of its own (4 to 11% for these springs), and the Lab tunes the springs as they run.
- φ is the parent's world angle: the sum of the drawn rotations of every ancestor. The `follow` term makes the part lag its parent's turns.
- ψ is the bone's own rest + clip angle. The `selfFollow` term makes the part overshoot its own turns (an ear swinging to a new state).
- α = −(r × a) / |r|² · (180/π): the swing a carried part feels. r is `com` turned into world space by the bone's drawn world angle before the step, a is the world acceleration of the bone's pivot (pt/s²), and r × a = rₓa_y − r_ya_x. With y down and clockwise-positive angles this is the ordinary 2D cross product.
- Integration: semi-implicit Euler with h = 1/120 s: θ′ += h·θ″, then θ += h·θ′, never clamped. φ″, ψ″ and a are second differences over the last three steps, x″ₙ = (xₙ − 2xₙ₋₁ + xₙ₋₂)/h², and zero until three steps are recorded.
- Each step poses the bones parent first, at the step's own clip time, so a spring feels its parent's spring from the same step. Every spring starts at θ = 0, θ′ = 0.
- **The soft limit:** the spring's share of the drawn rotation is θ through a soft limit within the room the clip's rotation r leaves inside the bone's `rot` limit [lo, hi]: on the positive side the room is hi − r, on the negative side r − lo. Up to 80% of the room θ is drawn as it is; past that, with k = 0.8·room, s = room − k and u = (|θ| − k)/s, it is drawn as k + s·u/(1 + u), which keeps the slope continuous, approaches the room and never reaches it. So the total never leaves the limit, the authored rotation is never altered, and a part driven hard into its limit eases in and swings back out instead of stopping dead.
- **Cuts:** a jump is not a motion. When the body or head view changes, when any mixing clip crosses a `step` key, or at a switch with a blend of 0, every spring forgets its history (as after loading) and keeps its θ and θ′, so it feels no kick.
- Gravity and the phone's own movement (section 6) are added to a later (Arriving later).
- Step times are counted, never summed: step n runs at exactly n/120 s, and a frame at time T runs every step with n/120 ≤ T (within 1e−9 s), then draws θ interpolated between steps n−1 and n by (T − n/120)·120, clamped to 0 to 1. The drawn spring is one step behind; in exchange every frame rate draws the same curve.

## Bending parts

Only the rabbit's ears and the kitty's tail bend (section 5b, Bends). A bending part is one region on a control grid of 2 × 6 points (1 column, 5 rows) driven by its chain of bones, which starts at the part's own bone, each bone the child of the one before. Each row of the grid, from the top of the region to the bottom, belongs to the chain bone that owns its place along the chain at rest: the row is carried into that bone's space by the inverse of the bone's rest transform, then moved by the bone's part transform (its frame × its own scale). This works the same for parts that point up from their root (a tail) and parts that hang down (lop ears).

**Proposal, departing from the letter of section 5b:** the spec sets SpriteKit's `subdivisionLevels` "to match the WebGL mesh". Apple does not document how SpriteKit subdivides a warp grid ("The maximum number of subdivision iterations used to generate the final vertices"), so matching it is guesswork. Instead, both runtimes expand the 2 × 6 control grid into the same dense mesh, by Catmull–Rom interpolation along each column to 4 sub-rows per row (2 × 21 points), with the grid continued in a straight line beyond its end rows so evenly spaced rows at rest stay evenly spaced, and draw that mesh as it is: WebGL as triangles, SpriteKit as an `SKWarpGeometryGrid` of 1 × 20 cells with no further subdivision. The bend is then identical by construction. Phase 1 measures what SpriteKit does with `subdivisionLevels` 0 and which diagonal splits each cell, and pins WebGL to match; any gap goes into `docs/LIMITATIONS.md`.

## Arriving later

Each of these extends the contract, its vectors and both runtimes together, in the phase that first needs it. None changes what version 1 already defines.

- **Phase 4, rigging the dog:** clip layers (`layer`: base, additive or override, with a bone `mask` and a `weight`) and which life behaviours a clip turns off, in a fixed per-step order (base blend, additive, overrides, look-at, fake turn, soft limit, stance lock, springs); the blink (a lid channel, a rig `blink` block, a clip's `blinks`) and the rule that views, face states and ear states swap inside a closed lid, with the 60–90 ms pop as the fallback; the three-quarter swap past 22° of yaw and back below 18°, decided on spring steps and deferred into a blink, with the three-quarter view's own fake turn (±15° around 45°); bone states (ear states) with their rest angles and a fixed 100–150 ms turn; the stance lock from `plant` and `lift`; look-at; micro-motion as a closed-form function of time; nested clips (the lid inside the eye inside the head); an `alpha` channel, the shadow rule and the hour's tint formula.
- **Phase 5, the motions:** playback variation; loop regions and exit marks; stride length for gaits; gravity relative to the drawn rest.
- **M1 and after:** the phone's movement in the springs; slots and props (M2); a bending part's own source positions (the kitty's tail, M5).

## Rendering

- A part's quad is its region's size in points, placed so its anchor sits on the bone's pivot, transformed by the bone's part transform, then by the stage: the root's position on screen and the scale from points to pixels.
- Textures use linear filtering. Pages are powers of two so both runtimes can use mipmaps (set before any sub-texture is made); the filter between mip levels is whichever phase 1 measures SpriteKit using. Below 35% of the companion's size, the runtime switches to the `small` set, whose scale is chosen so it is never shrunk more than 2×.
- **The same bytes reach both runtimes:** atlas pages are 8-bit RGBA PNGs with no gAMA, cHRM or iCCP chunk. The web uploads them with `UNPACK_PREMULTIPLY_ALPHA_WEBGL` true and `UNPACK_COLORSPACE_CONVERSION_WEBGL` `NONE`. The app ships them with `COMPRESS_PNG_FILES` and `STRIP_PNG_TEXT` off, loads them with `CGImageSource` from the package's folder (never from an asset catalogue or `imageNamed`), and sizes sprites from `atlas.json`, never from the texture.
- **Both runtimes draw single-sample:** the web context is created with `antialias: false, stencil: true`.
- **SpriteKit:** the shared Swift engine computes every transform; each part is one sprite (its frame as position and rotation, its own scale as x and y scale, so no node ever needs a shear), and each clip group one `SKCropNode` whose mask is a copy of the mask part. Every part gets its own `zPosition` from the current order; `ignoresSiblingOrder` and `shouldCullNonVisibleNodes` are set explicitly. The runtime never uses `SKAction` and never reads SpriteKit's clock.
- **For comparisons** frames are rendered on an opaque background into an 8-bit target without colour conversion. SpriteKit renders through `SKRenderer` into a `bgra8Unorm` texture (never sRGB) with a private `depth32Float_stencil8` attachment as both depth and stencil, one frame at a time (advance, update, render, commit, wait, read back), and writes the raw bytes swizzled to RGBA.

## Test vectors

`vectors/*.json` are generated by the web runtime (`npm run vectors`) and checked by both runtimes' tests: easings, key sampling, the random source and its named streams, the soft limit, bone transforms and Catmull–Rom curves so far; poses, dense warp meshes, the fake turn and player runs (springs, blends, cuts, events) join as the Swift engine grows. A runtime passes when every number matches within 1e−9 (angles in degrees, lengths in points), and the random source exactly.
