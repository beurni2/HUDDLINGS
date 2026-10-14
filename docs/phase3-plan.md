# Phase 3: how the dog is drawn

The working plan for phase 3 (spec section 5b; `PLAN.md`), from a design panel on Oct 14, 2026: three independent designs (art fidelity first, pipeline and verification first, risk first), each prototyped with resvg 2.6.2 and the WebGL runtime, scored by two judges and merged into this plan. The prototypes were scratch work and are not kept; a tag says which designer ran each claim: [A] art, [P] pipeline, [R] risk, [J] reproduced by a judge. Untagged items are planned, not yet run.

**Changed by the lead since:**
- **Markings stay overlays** clipped to their part, as L395 says, rather than baked into the part. Each is pre-shaded at build time with its part's own shade mask, so the shading runs on unbroken across the patch's edge. No exception to the spec is needed.
- **The kit, the harness and the front view ship in one pull request** (PR 3.1 and 3.2 below), because the front view is what you look at.

**Base design: art.** It is the only design whose method produced a drawing close to the sheet. Its front view scored IoU 0.954 through the repo's build.ts, atlas and WebGL runtime, and its runtime rest frame matched the resvg composite exactly. Its own verdict still stands: the drawing reads as "a cousin of the dog", not yet the dog.

**Taken from the other designs:**
- **From pipeline:** the fast look loop, the part-ID pass, head.line, the null region, cast-shadow parts, and face anchors placed by hand.
- **From risk:** running rasterization in child processes, the filter rules, the round-trip test, the atlas measurement, face zones and the facing checks.

**Tags:**
- [A], [P] and [R] mean the art, pipeline or risk designer verified the item by running it.
- [J] means a judge reproduced it.
- Untagged items are planned and not yet run.

## 1. Files and toolkit

**characters/draw/** is a new toolkit shared by all species. It runs at build time only, adds no dependencies, and keeps its tests in draw/test.
- **geom.ts:**
  - centripetal Catmull–Rom, then Schneider's curve fit (fitCubic);
  - `smooth(points, {corners, tol 0.15–0.3 pt})`, which fits each run between corners separately [A: 25 ear points became 13 cubics];
  - split, sample, fracAt (spans are named by their points, so they survive edits), mirrorX;
  - minRadius, reported for convex and concave corners [A, P].
- **fur.ts:** `furEdge(base, from, to, locks[{len, w, lean}], tipRound)`.
  - Each fur lock is two direct cubics.
  - The base path is untouched outside the span, and each lock adds a fur stroke [A].
  - Rejected methods:
    - Catmull–Rom tufts made loops [A].
    - Procedural scallops read as a zigzag [R].
    - pipeline's lobes() read as notches [P].
    - Round lobes read as cloud scallops [R].
- **paint.ts:** the paint recipe in section 2.
- **line.ts:** tapered outline ribbons, with width and colour set per span.
- **frame.ts:** `toBone()`.
  - Parts are drawn in model.json space: points, with the origin on the ground under the seat and y pointing down.
  - Each part is wrapped in the inverse of its bone's rest transform, computed by runtime-web/src/rig.ts (`compile`, `evaluatePose`) [P], on a canvas of whole points.
  - The anchor always comes from the pivot in rig.json and is never typed by hand. [A: a hand-typed pivot drew 508 px off; taken from the pivot, the match was SSIM 1.0. J measured a maximum difference of 0.]
- **svg.ts:** every filter and mask gets an explicit userSpaceOnUse region bounded to its part, plus `color-interpolation-filters="sRGB"`. [A, R: the default region cut a 4 pt blur to nothing; linearRGB lifted a dark edge from 135 to 193.]
- **eye.ts** and **lint.ts**.

**characters/dog/src/:**
- rig.json is the only source of pivots.
- params.json.
- palette.ts reads model.json only.
- clips/ holds `still.<view>` and `face.<preset>`, the pose names phase 4 will use.
- views/{front, threeQuarter.L, side.L, back}.ts hold the hand-typed nodes. facing.ts generates the .R facings from them.
- parts/, markings.ts, markings.R.ts and face/.
- drawings.ts stays the place where an illustrator's SVGs could plug in (L736).

**Build changes:**
- Rasterize in child-process batches. If a batch aborts, rerun it one drawing at a time to name the culprit. [R; J reproduced the abort, exit 134 at geom.rs:27.]
- A sha256 raster cache and worker threads.
- A rectangular power-of-two last atlas page.
- Node counts and atlas page share in the build report.

**Lab:**
- runtime-web/lab/still.ts renders named stills (evaluatePose, then drawList).
- look.ts runs as `npm run look -- dog front --watch`, with Chromium kept open between runs. [P: 2.0–2.5 s to build and render, 0.9 s to match.]

**Python:**
- characters/sheetmatch/ imports refprep.
- refprep/faces.py writes faceCrops into model.json from dog/refmap/faces.json.
- tools/guide/grid.py writes guide images to build/guides/, which is gitignored.

## 2. Authoring a part (rule R8: no tracing)

1. Reference the model.json landmarks and the 93.3 pt head width. Never retype them.
2. Type 8–20 nodes per shape by hand, at extremes and inflections. The lint caps a shape at 24.
3. Read the nodes off the guide:
   - the crop at 6–8×, with a 5/10 pt grid and the landmarks;
   - an onion skin of the current render;
   - the rigging panels, which show the hidden ends.

   A potrace outline may appear only in the guide, at 25% [A, R].
4. **The loop:**
   1. Edit the nodes.
   2. Build, and render a still through WebGL.
   3. Read compare.png (crop | render | edges with landmarks | onion) and the phone-size PNG.
   4. Retype the nodes.

   No code moves a node toward the silhouette.
5. **Guards:**
   - A test checks that src and draw read nothing under ref/, reference/ or guides/, and no .png file or potrace output.
   - The lint refuses `<image>` elements and data: URIs.
   - E1's no_sheet_pixels check keeps guarding the app.
6. **Sources:** geometry comes from the turnaround (L287). Detail comes from the hero and the expression panels.

**Paint recipe.** Each technique was rendered in resvg 2.6.2 at 3x and inspected.
1. **Flat fill.**
2. **Markings** (head patches, saddle halves, tail base, rump) are overlay parts clipped to their part (L395), pre-shaded at build time with their part's shade mask. Head patches also slide with the fake turn's marking role.
3. **One shade:**
   - The mask is art's: a rim away from the light (the shape eroded and moved toward the light, then subtracted), plus overhang shapes, minus keep zones, through one 2.4 pt blur [A].
   - It is painted with pipeline's multiply colour #FDEDDC, inside an isolated group that holds its own copy of the fill. [P, R: cream becomes exactly #FDE3C8, tan becomes #D79768.]
   - The two have not been run together yet; PR 3.1 runs the combination first.
   - Ears darken toward the tip, from #E0A475 to #C2834E. The palette check limits how far: art's shade covered too much and failed at ΔE 8.8.
4. **One highlight,** placed automatically from the top-left light. All blurs use σ ≥ 1.5 pt, so the 2x and 3x sets agree within 15% [A, R].
5. **Outline:**
   - A ribbon drawn at double width and clipped inside the shape, so the silhouette is exactly the path [A].
   - #91694A at 1.54 pt, tapered at the ends, with a 0.3 pt blur in sRGB.
   - Fur spans and the tag use a lighter #A27C5C, at no less than 1.2 pt. A thinner line is filed as a question.
   - Inner lines are 0.6–0.9 pt.
6. **Joins:**
   - Hidden ends are feathered, with no rim and no line.
   - Light groups put the rim on the union of head and tuft, chest and front legs, and haunches and hind paws. [A: colour change at the joins, ΔE76 1.12 and 0.25.]
7. **Cast shadows** are parts on the bone that casts them, clipped to the part they fall on. shadow.chin sits on the head bone and is clipped to body.front [P: it draws in WebGL]. This replaces art's chin shadow, which was baked into the chest.
8. **The head's edge:**
   - head.line is its own unclipped region, drawn after the head's clip group.
   - Patches are built unclipped with 4 pt of bleed past the head's edge, and the runtime stencil clips them.
   - A seam run in patch tan covers the ear junction, plus a junction line in ear tan where the sheet draws no line (DECISIONS 7) [P, A].

   This fixes two things: the stair-stepped edge from the stencil, which clips at alpha 0.05 with no antialiasing, and the yaw gap in art's own frames (t5700, t6000).
9. **Facings:** mirror the geometry, recompute the light, and use the right side's own markings. [R: the shade's centre lands bottom-right on both facings; a plain mirror puts it bottom-left.]
10. **Far legs:** a warm blend about 40% toward the shade, matching the sheet's far paw (#FEEED9). The spec's 0.92 darkening turns it grey (#EBE0D5) [A]. This is question Q27.
11. **Forbidden:** an unbounded rectangle under a filtered mask, which crashes resvg [R].

**Corrections the front view needs** (from the judges, on art's prototype image p10):
- broader cheeks spilling over the ear roots, with no vertical head sides;
- a three-lobed topknot, not a dome;
- patches as soft rings around the eyes, opening toward the ears;
- short front legs melting into a fluffy chest, not outlined tubes;
- arched brows, not carets;
- a smaller mouth in #9E241A. Art's darker #7E1C12 fooled the nose finder.

## 3. Rest rig and lints

**Bones and limits** follow the spec (L412–433), stored as data. Phase 3 adds no springs, look-at, stance lock, ear states or iris bones. Larger pupils are baked into the wide and hungry eye drawings, because a scaled iris clipped only to head.base would spill over the eye white.

**Front-view pivots,** set by rule from model.json:
- root at (0, 0);
- body under the haunch;
- neck and head at the chin, (0, −57);
- tag at tag.ring, (0.4, −57.5);
- ears 3 pt inside the head;
- eyes at their landmarks;
- mouth at (−0.2, −91.6);
- legs at shoulders and hips hidden under the body.

Turned views take their own landmarks; the .R views use mirroredViews.

**Rig tests:**
- the pivots follow the rules;
- the runtime's rest frame equals the resvg composite (mean difference 0/255);
- moving a pivot leaves the rest pixels unchanged.

**Head roll (DECISIONS 8):** measured in PR 3.2 through stills.ts, with the roll as a rest angle. Art's 0.954 was measured on a composite rolled about the head centre, which the rig cannot yet express.

**Draw orders:**
- The front follows L397, with shadow.chin before the collar.
- The head draws ears, head.base, the clip group (patches, blush, eye layers, brows, nose, mouth), head.line, then the tuft.
- Turned and back orders are read off the crops (L298). Overlap facts checked on the ID pass pin them.

**Left for phase 4:** a far eye per view, ear-state angles, and a raised paw.

**Sweeps** through WebGL in every view: each joint to its limits, yaw ±20° and pitch ±12°. [A, front view: found an exposed head side, a collar end in the air, broken leg swings and a lighting band on the tuft.]

**Lints that fail the build:**
- convex corners of at least 4 pt on outlined edges outside declared fur spans. The exceptions list is filed in QUESTIONS.
- outer lines 1.2–1.8 pt, inner lines 0.6–0.9 pt;
- the node cap;
- every colour comes from the palette;
- at least 15% of each part hidden under the part covering it (L394);
- explicit sRGB filter regions;
- whole-point canvases;
- face parts inside the face zone: the head inset by 1.54 + 5.6 pt across and 1.54 + 5.4 pt vertically [R];
- the R3 guards.

## 4. Sheet match on renders

CI runs it on every package change; the pre-commit hook runs the front view.

**Render passes,** through WebGL from the 3x set:
- on white and on black, for exact alpha [A, P];
- on the card colour, for the finders;
- a part-ID atlas recoloured from the same rasters, with no renderer change [P];
- a 4x still to look at.

**Alignment:**
- Area-downsample to each crop's scale (ptPerCropPx) [A], with the root at anchorsCropPx.ground + 0.5 [P].
- A round-trip test on analytic shapes must agree within 0.25 px. [R: without it, risk's prototype lost 1.2–1.6 pt.]
- A leftover shift of more than 2 px counts as a drawing error and is never absorbed.

**Gating checks:**
- **Silhouette IoU,** without the ground shadow: 0.90 for front and three-quarter, 0.85 for side and back. IoU aligned on the head centre is also reported (L522). The .R facings are compared with the mirrored crop. [A: 0.954; J reproduced.]
- **Landmarks** within 2.8 pt, found by refprep's own finders [A, P]. Points placed by hand on the sheet (paws, tag ring, seat) come from the source and are checked to lie inside their part's ID pixels.
- **Palette:** ΔE2000 ≤ 3 on masks from the ID pass, each region against its own Q24 value:
  - fur #FFF4E8, fur shade #FDE3C8;
  - eyes, nose and upper iris #200C02, lower iris #3A2314;
  - patches #F0BC92, tongue #FB9A88, mouth inside #9E241A;
  - ears, collar and tag at their printed values.

  Without the ID masks, pipeline's check passed eyes that were flat black.
- **Blush (Q25):** the core within ΔE 3 of #F7B3A6, and the level from palette.blush between 0.29 and 0.43 at rest [P, R].
- **Markings:**
  - no marking pixel outside its part (alpha ≥ 0.05), on rest and sweep stills;
  - each facing shows exactly the markings model.json gives it;
  - the shade's centre sits bottom-right [R].
- **Overlap facts** for draw order.

**Advisory only, never a pass:** edge distance (target p95 ≤ 2 pt), IoU per part ≥ 0.85, colour change at joins, atlas share. [P: silhouette IoU passed at 0.921 on a visibly off-model render whose p95 edge distance was 5.2 pt.]

**Self-tests:**
- Planted failures must fail: an eye moved 3 pt, a 4 px shift, a marking outside its part, a tint of ΔE 4, blush at 60%, a scaled silhouette, a plain mirror.
- Measuring the crop itself reproduces phase 2's numbers.
- Thresholds are never loosened.

**Evidence** in qa/phase3/<view>/:
- compare.png;
- match.json;
- a phone-size PNG: the render at 3x and 164 pt tall beside the crop at the same size, so it can be opened on an iPhone from the pull request.

## 5. Faces

Faces are drawn in five views (front, threeQuarter.L/R, side.L/R); the .R views are generated.

**Eye layers** [A], each clipped to head.base:
- the white #FFFDF8, with a lid line;
- the iris, a radial gradient from #200C02 to #3A2314, shifted 0.75 pt toward the nose;
- a 2.6 pt catchlight high on the nose side;
- the lid.

**Eye states:**
- open, closed, sleepy, wink, happy;
- squeeze is the happy eye (Q2);
- sparkle is the happy eye plus stars;
- wide, with a larger pupil baked in;
- peek, with the iris baked to one side.

**Format change 1: a `null` region** meaning "not drawn in this state", in both runtimes with test vectors. Today regionFor (rig.ts L132–135) falls back to the default region, so the open iris would draw under the happy, closed and wink eyes.

**Format change 2: the alpha channel,** brought forward from phase 4 for blush levels.
- The format README allows a change "in the phase that first needs it".
- It goes into both runtimes with test vectors and replaces separate blush drawings per level.
- It is filed as a question. The fallback is blush drawings baked at each level.

**Other face parts:**
- Mouths: smile, open, laugh, o, cheeky, yawn, pant, plus the new o.tongue, pressed and tinySmile.
- Brows: neutral, raised and happy, drawn as arcs.
- Ears: the onePerked drawing. Other ear states are rotations, with angles chosen by how much of the ear stays visible [R: ears turned 14–18° inward disappear]. Never drooped.
- The two Q2 alternative eyes go in a review-only build.
- presets.ts holds the 19 presets.

**Face crop records (DECISIONS 14):**
- Anchors placed by hand in refmap/faces.json. [P: the automatic nose finder landed on an eye in 4 of 10 panels.]
- Masks that remove labels, motion marks and slivers of neighbouring panels.
- faceCrops entries: panel, preset, view, facing, scale, roll, anchors, mask.
- A test that no record exists for Sad, Pout or Both drooped.

**Faces check:**
1. Render each preset in its panel's view and facing, at the panel's scale and roll.
2. Align it on the nose and the head top.
3. Take the render's landmarks from the source, checked against the ID pixels. They must fall within 3% of the head width of the panel's anchors.

**R3 guards (no sad faces):**
- an allowlist of state names;
- mouth corners never below the mouth's centre;
- the inner ends of the brows never lower than the outer ends;
- no tears and no drooping parts;
- reviewers say what each face feels.

**New faces,** two variants each, labelled "new drawing":
- **Hungry:** wide eyes, raised brows, lifted ears, the o.tongue mouth.
- **Huffy:** closed flat lids, puffed cheeks, the pressed mouth, and a peek with tinySmile.
  - Variant A puffs the cheeks inside the outline.
  - Variant B uses a puffed head.base with a matching head.line.

## 6. Pull requests, in order

This plan takes about 16 working days; PLAN.md allows about 1.5 weeks (7.5 days). I'm flagging that now, and I'll re-plan once PR 3.2 shows the real pace.

1. **PR 3.1: kit and harness** (days 1–3).
   - Contents:
     - the toolkit, lints and build changes;
     - still.ts and look.ts;
     - the sheet match, with the round-trip test, planted failures and the crop self-check;
     - the atlas measured on the planned region sizes.
   - The test fixture is art's prototype front.
   - It proves that:
     - the loop takes 4 s or less;
     - every planted fault fails;
     - the combined shade renders;
     - a planted resvg crash is named;
     - the 3x set fits in 24 MiB, so two dogs fit the 48 MB budget.
2. **PR 3.2: the front view** (days 4–6; not a gate, PLAN L45).
   - Contents:
     - the drawing corrections, head.line, the bleeding patches, shadow.chin, light groups, the rig and draw order;
     - sweeps through WebGL;
     - SpriteKit parity on the macOS job at SSIM ≥ 0.95, its first test on soft alpha.
   - Evidence:
     - the phone-size PNG beside the crop and the hero image;
     - the three weakest spots;
     - the numbers;
     - a fresh character-designer review before the founder sees it.
   - Shown both ways for a decision:
     - Q26, fur-lock tips at 0.7 pt as the sheet draws them, against the 4 pt rule;
     - the fur outline width;
     - Q27;
     - the head roll.
   - The founder can stop the look here.
3. **PR 3.3: format changes** (day 7, during PR 3.2's review): the null region and the alpha channel, in both runtimes, with test vectors.
4. **PR 3.4: turned views** (days 8–10).
   - threeQuarter.L/R and side.L/R, each drawn from its own crop;
   - facing.ts and the far-leg tint;
   - swap continuity: the front view at +20° against the three-quarter view at −15°;
   - a design review.
5. **PR 3.5: back view and marking map** (day 11): all six facings pass.
6. **PR 3.6: face library** (days 12–14): every state in five views, the presets, faceCrops, the Faces check and the R3 guards.
7. **PR 3.7: hungry and huffy** (day 15).
8. **PR 3.8: Gate A** (day 16).
   - The PLAN L46 evidence, at phone size.
   - Parity on the six rest stills.
   - Three fresh reviewers scoring with the L762 rubric. The lowest score per line counts, and anything below 4 gets fixed.
   - Then stop for the founder's approval and record it in GATES.md.

## 7. Risks, retired early

1. **A cousin, not the dog.**
   - Retired by the front-view corrections in PR 3.2, the phone-size comparison on every loop, the advisory numbers and the designer review.
   - If the dog is still off-model after PR 3.2 plus one revision, raise the illustrator option (L736) then.
2. **Atlas budget.** [R: 286 regions need two 2048² pages at 3x, 64 MiB with a visitor, against a 48 MB budget.]
   - Measured in PR 3.1.
   - Mitigations: the alpha channel instead of blush drawings per level; the Q2 alternative eyes kept out of the package; a rectangular last page; mirrored face parts (L368).
   - Last resort: 4 px atlas gaps (E21).
   - Art's "tight boxes" mitigation is dropped, because atlas.ts already trims every region.
3. **Seams when parts move.**
   - Sweeps run in every view.
   - Fixes: head.line, patch bleed, seam runs, light groups and feathered ends.
   - Yaw ±20° is re-checked through WebGL, because art's claim of no gap did not hold in its own frames.
4. **Rule conflicts,** each filed in PR 3.2 with a reversible default:
   - Q26, fur tips against the 4 pt rule;
   - fur lines under 1.2 pt;
   - Q27, the far legs;
   - the alpha channel moved earlier;
      - the head roll;
   - collar and tag edge colours;
   - 4 px atlas gaps.

**Not yet verified:**
- the turned views, the back view and all face work;
- the null region and the alpha channel;
- the packer change;
- the combined shade;
- SpriteKit parity on the dog;
- the fur-tip radii on the sheet.

**Next step: PR 3.1.**