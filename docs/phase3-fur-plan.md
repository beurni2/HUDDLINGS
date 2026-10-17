# Phase 3: the fur edges and joins pass

Why: on Oct 16 the founder looked at the six views beside their sheet crops and said the fur edges on the body and its parts do not match, then pointed at the chin above the collar, then at the paws and the leg edges. A read-only audit (four view auditors, a code-cause reader and a synthesis critic) confirmed it: 60 defects (28 high, 20 medium, 12 low), every one inside the silhouette or under 2 pt, which is why the silhouette, landmark and palette gates all pass. Annotated overviews: `qa/phase3/audit/<view>.png`; every defect with its place, what the sheet draws and what ours draws: `qa/phase3/audit/defects.json`.

## The causes, grouped so each is fixed once for every view

### G1 Line spans: one continuous line per visible edge, short taper only at free ends

- **Cause:** parts/lines.ts tapers every span at both ends (default min(5, len/3), lines.ts:89-97; DECISIONS 74 'each span tapers to nothing at both ends'), and the views pass long tapers (front.ts:706 taper [6,16] on the leg/paw span, :382-383 taper 4). The views also give each lock or segment its own span (front.ts:401, threeQuarter.ts:331 and :571-573, side.ts:593, back.ts:43-44, :325, :489). So every handoff leaves 5-17 pt below full width, and spans that start under a part fade out over visible edge. Overlap (part-over-part) edges have no depth floor, so in .R facings the line-by-light rule paints them pale. Verified in source: lines.ts:89-97, front.ts:375-395 and :700-706.

- **Change:** In LitSpan:; One span per visible edge. A fur edge is one span that follows furEdge's notches.; Taper only free ends, over 1.5-2 pt.; An end that meets another line joins it at full width on a shared point.; An end that runs under another part carries on at least 1 pt under it at full width.; A new `contact: true` flag (part over part) floors depth at about 0.5, so overlap lines stay dark in both facings.; Paw top arcs and heels close on the neighbouring line, with no overshoot hooks.  Lint (draw/lint.ts) fails any visible-edge gap over 2 pt and any taper over 2 pt, unless the span cites a DECISIONS entry. New DECISIONS replace 74's taper clause, 7's 'no line between' cheek and ear, 33/72's handoff of the chin edge to the collar rim, and 64's unlined near-leg back, each citing its crop.

- **Risk:** - **Motion:** ends kept at full width under a part can show once legs, head or ears rotate in Phase 4 clips, and spec L506 forbids a line on a hidden edge. Render the rig's extreme poses before sign-off.; **Seams:** long spans cross several tone runs (litRibbons draws one polygon per run); check for seams between runs.; **Lint band:** lint.ts:524-528 refuses anything outside 1.2-1.8 pt mid-span.; **Decisions:** 7, 33/72, 64 and 74 need entries that replace them openly.; **Face states:** these spans also draw the face states, and they must change with the rest drawing or the state swap pops:   - head.line's temple states under the perked and lifted ears (front, on p3/faces2);   - huffy's puffed head B (p3/faces2);   - the profile mouths, which use head.line as the lower lip (p3/turnedfaces);   - the turned perked ear's 'back of the head' span, taper [6,10] (p3/turnedfaces).; **Gates:** sheet-match gates are unaffected, since the lines lie inside the silhouette.; **Facing tests:** facing tests (mirror geometry) are unaffected; line tones in .R change by design.

- **Defects closed:** 21.

### G2 Crisp outer line: no blur on the silhouette side

- **Cause:** litEdge draws head.line unclipped, reaching 0.5 pt past the path, and blurs the whole group at σ 0.3 (lines.ts:39, :122-126, :190-194; DECISIONS 79). That makes the silhouette itself soft. The views also paint blurred cream bands over the ear roots (front.ts:421-432 σ 0.9, threeQuarter.ts:332-338, back.ts:402-406, side.ts:551-552) and a lighter blurred band under the topknot lobes. litPart (the topknot curls) blurs inside its clip, which is why the topknot's outer edge stays crisp.

- **Change:** - Clip litEdge's blurred group to the head path grown by `reach`, so any blur falls only inward. Alternatively, drop SOFT for outer lines and keep blur only for shades and contact shadows (spec L507).; Remove the feathered cream bands at the ear roots and under the topknot; G4's crown locks replace them.; Rejoin the side forehead's segments into one span (G1).

- **Risk:** - **Fringe:** head.line's reach exists to cover head.base's antialiased stencil edge. A tight clip can expose a light fringe in the 3x atlas and in the WebGL/SpriteKit runtimes (premultiplied alpha), so check the runtime renders and parity, not only still.ts.; **Faces check:** the Faces check crops include the crown and brows, so re-run every face clip.; **Turned states:** turned head.line states (p3/turnedfaces) call litEdge too.

- **Defects closed:** 5.

### G3 Fur locks: taller, narrower, uneven, leaning, only where the sheet draws tufts (cheeks, chin, chest, crown, tail)

- **Cause:** draw/fur.ts:56-70 gives each lock its share of the span, so locks stand 0.5-2.3 pt high on 4-9 pt widths, with blunt tips (tipRound 0.24-0.6). They were shrunk after reviewers read the broken line (G1) as lace or zigzag (fur.ts:6-8; DECISIONS 72, 85). The tail's locks are 1.1-2.3 pt on a 45 pt span and evenly sized, which reads as a cog or cloud. The front chest also carries dark dash strokes the sheet does not draw.

- **Change:** Type the locks per crop, never procedurally:; length 2-4 pt, width 3-5 pt, tipRound 0.25 or less;; lean 0.3-0.6 along the fur flow;; neighbours differing by at least 20% in size;; notches dipping 0.5-1 pt inside the base.  By region:; **Tail:** pointed, flame-like locks with wisps, and the tip as one hooked lock (back: a hooked curl over the patch).; **Chest under each collar end:** one small fur step, not saw-teeth.; **Front chest:** delete the dash strokes.; **Below the front tag:** a fluffy V of downward tufts.  Land G1 first, since the broken line, not the lock size, caused the 'lace' reading. Add validation to fur.ts for minimum length/width ratio and size variation.

- **Risk:** - **Known failure modes:** fur.ts:6-8 records them: procedural scallops read as a zigzag, even lobes as notches, round lobes as cloud scallops. A reviewer round must judge at phone scale.; **Silhouette:** tips add 2-4 pt; IoU and edgeP95 should hold, but re-run all six views.; **Lint:** the 4 pt exemption covers only declared fur spans (lint.ts:511-518).; **Spec:** L508 lists the head tuft, cheeks, chest and tail tips; chin scallops and the crown's side locks need a DECISIONS entry citing the crop (see the founder questions).; **Faces check:** cheeks and chin lie inside the face crops.

- **Defects closed:** 6.

### G4 Head fur over the ear roots, cheeks and jaw: one head-fur builder for every view

- **Cause:** Each view types its own head.base, and all four make the same moves: - **Cheeks:** the cheek puff leaves the face's side at a concave corner, and the clumps start lower (front.ts:233-271). - **Crown over the roots:** the crown's locks there are 0.55-1.1 pt (front.ts:279-280, back.ts:83), and the crown line stops before the root (front.ts:392), so the ear top reads as a straight cut. This misses the existing DECISIONS 89 ('the crown's line runs on into each ear's') and 68 (profile ear top feathered under the crown). - **Chin, front:** no head.line span (front.ts:377-386 hands the edge to chinOnCollar's dark rim). Chin locks are 0.6-0.95 pt. A σ 2.4 band sits under the jaw while keep-zones hold the puffs unshaded to their rims (front.ts:365-369), so the lower face reads as a flat block. The jaw corner is tight (front.ts:225-227). - **Chin, 3/4:** the same pattern (threeQuarter.ts:152-155, :305-306, :319-325, :535-542). - **Back:** head.base is a rectangle with square bottom corners.

- **Change:** Add a shared builder (new parts/headfur.ts) that each view calls with its own crop nodes:; **Crown over the root:** 2-3 crown locks hang over each ear root. The crown's span runs unbroken into the ear's outer line (G1) and hides the ear's top.; **Cheek over the ear:** a convex puff in 2-4 clumps (G3), with one span from the face-side line, round every clump, to the jaw. It uses the tan ladder where it lies on the ear, and is lined lightly or partly where the crop shows only a short low line.; **Chin:** a rounded mass with corners of r 6 pt or more. Its lower edge is one lit span with 5-7 small outlined scallops dipping onto the collar. Remove chinOnCollar's dark rim stroke but keep the shadow.chin.collar part. Shade the lower cheeks round, letting the shade enter the keep-zones.; **Back:** the head's bottom becomes two rounded lobes whose lined edges run into the collar ends.; **Profile:** the chin line reaches the collar and ends in a small tufted wiggle, with wispy strands over the collar top.

- **Risk:** head.base and head.line also draw the face states:; huffy's puffed head B (p3/faces2's `head(puff)` builder and parts/cheeks.ts);; the temple states under the perked and lifted ears;; the turned perked ear and the profile mouths.  All must come from the same builder, or a state swap pops. Other risks:; **Pinned test:** dog.test.ts:68-80 pins shadow.chin.collar's clip group.; **Landmarks:** head width (93 pt between the ears' inner edges, DECISIONS 7) and the cheek and eye landmarks must stay within 2.8 pt.; **Faces check:** facematch crops the lower face, so re-run all 17 face clips.; **Collar:** the collar ends tuck under the new cheek mass; keep the collar corner exemption (drawings.ts:49) accurate.

- **Defects closed:** 11.

### G5 Ear edges: feathered outer edge, 3-4 lock tips at the hem, varied line, uneven paint

- **Cause:** - **Shape:** every view types the ear as a smoothed droplet with 1-3 shallow notches (front.ts:151-174, threeQuarter.ts:123-130, side.ts:156-160, back.ts:119-128). - **Line:** one even line runs all the way round (front.ts:550-561). - **Paint:** ear.ts paints locks only inside the ear and never builds the edge (ear.ts:39-50, :70-78). Its guards cap the hem at 2-3 clumps (ear.ts:40-41; finish.test.ts:126-139; DECISIONS 76, 81). - **Spacing:** in side and back the paint is evenly spaced parallel strokes (a comb or ribbed gourd), while front and 3/4 were judged fine. So spacing is not controlled.

- **Change:** earFur builds the edge itself:; **Outer edge:** furEdge with 1-2 lock steps (one about 40% down).; **Hem:** 3-4 rounded lock tips with notches 1-2 pt deep. In profile the rearmost lock curls up the back edge.; **3/4 far ear:** a rounded top tucked under the crown (G4) instead of the straight-diagonal 'sail'.; **Line:** one continuous span (G1), thin and light at the top, heavier and darker at the hem.; **Paint:** locks irregular in spacing and length, ending in the hem tips.  It returns shape, paint and spans, so every view gets it from one change. Calibrate against master.feature.floppy-ears.png. New DECISIONS entry replaces the 2-3 clump guard.

- **Risk:** - **Guards:** finish.test.ts:126-139 and ear.ts:40-41 must be revised through a DECISIONS entry citing the floppy-ears panel, not loosened silently.; **Ear states:** the front perked and lifted ears and the turned perked ears (p3/faces2, p3/turnedfaces) must use the same builder, or the outline changes on a state swap.; **Lint:** hem tips must be declared fur or the 4 pt rule refuses them, and spec L508 does not list ear tufts (founder question).; **Node budget:** 24 hand nodes per shape.; **Silhouette:** ears are the largest share of the outline; re-run IoU and edgeP95.; **Motion:** ears overshoot and settle as rigid parts, so tips are safe there.

- **Defects closed:** 5.

### G6 Paws and legs: bun paws, scalloped soles, soft toe lines, a light varied line, short plump columns with fur bumps (the founder's paws and leg edges)

- **Cause:** - **Toe lines:** paw.ts types only the toe lines, with a gradient from 0.8 opacity at 20% to 0.08 at the top (paw.ts:23-30). Only 2-3 pt show, as dark ticks hanging off the sole, which read as claws. - **Paw shapes:** every view types flat soles (within 1.4 pt of flat), toe dips of 0.1-0.7 pt (none in side) and outer corners of about r 4 pt, on straight columns (front.ts:94-120, threeQuarter.ts:57-76, side.ts:82-101, back.ts:174-179). - **Sole line:** the ground term makes the whole sole the darkest tone at 1.6 pt with only a ±6% wobble (lines.ts:37, :49, :53, :96). finish.test.ts:70-80 pins at least 1.55 pt and tones 8 and up (DECISIONS 74, 79). - **Leg lines:** the front's single span (inner side, paw, outer side) has taper [6,16] (front.ts:706), so leg lines start in mid-air and the outer line runs up near the collar, which makes the tube look. - **Missing and stray marks:** no view draws an elbow or haunch bump; paw top arcs overshoot as hooks or cuffs; DECISIONS 64 leaves the near leg's back and heel unlined. - **Existing decisions not met:** DECISIONS 47 (bun paws wider than the leg) and 82 (outline closed all round) already ask for this, so this is an implementation gap.

- **Change:** **Paw builder in paw.ts, used by every view.**; **Shape:** a bun 10-20% wider than the leg, with a rounded bottom of 2-3 toe lobes. The sole scallops up 0.5-0.8 pt at each toe line.; **Corners:** r 4 pt or more, unless the founder allows the sheet's tighter toe lobes.; **Toe lines:** 2-3, rising 40-50% of the paw's height, following the dome, in the warm line at about 50% opacity, fading gently, never darker than the outline.; **Outline:** closed round every visible edge. The top arc stops at the leg's line, and hind paws close against the haunch.  **Line (lines.ts).** The ground term applies only to the middle ~60% of the sole, where the paw presses: 1.3-1.5 pt there, thinning to about 1.2 pt and lightening up the sides, with ±15% wobble.  **Legs.**; **Columns:** slightly bulging. Their lines start below the chest fur at a small elbow bump (front, 3/4), with a haunch notch where the haunch leaves the flank (front #13), and inner edges lined down to the paws.; **Side:** a heel crease V against the hind paw and a continuous ground line under the hind paw and haunch.; **Back:** haunch bottoms rounded (corner r about 10 pt; at crop y 212 the silhouette spans x 61-139) with small fur bumps, the bottom line no darker than the sides.  **Test.** Revise finish.test.ts's ground-line test with a new DECISIONS entry citing the founder's note ('a lighter, warmer, varied line').

- **Risk:** - **Tests and lint:**   - finish.test.ts:70-80 (DECISIONS 74, 79) must be revised openly.   - The 4 pt lint applies to paws, which are not fur: toe bumps of 0.8 pt or less over 5 pt pass; the stubby-paws panel's deeper toe lobes (about r 3 pt) would not (founder question).; **Landmarks and anchor:**   - paw.front.L/R, paw.hind.L/R and seat (front.ts:840-847; tolerance 2.8 pt).   - The ground anchor match.py uses (root on the crop's ground) needs the lowest sole point at y 0.   - Silhouette IoU at the ground.; **Motion:**   - Paws must stay planted in Phase 5, and scalloped soles change the contact points.   - Leg pivots in rig.json stay unchanged.   - Full-width line ends under the body (G1) must not show when the legs rotate.; **ID pass:** leg and paw boundaries.

- **Defects closed:** 13.

### G7 Shade bands and seams at part joins

- **Cause:** Soft fills end on unlined part edges inside the silhouette: - **Front between the legs:** between() paints tan at 0.35-0.9 opacity, cut straight by the legs' unlined inner edges (front.ts:569-578; DECISIONS 25). - **Front saddle:** its inner edge stops 0-2 pt short of the leg line and is blurred σ 1.4 (front.ts:334-335, :608), leaving a cream seam. - **3/4 shoulder:** body.front's shade stops hard against body.back. - **3/4 far leg:** painted peach-tan (dE about 4.7). - **Turned thighs:** a faint separate line beside a highlight strip (threeQuarter.ts:258-274, side.ts:260-265). - **Side near-side group:** a vertical light/dark seam, plus a peach band behind the near front leg (DECISIONS 64). - **Back:** back.patch.L is painted over the body's edge.

- **Change:** Rule: a shade or marking never ends on a part boundary inside the silhouette unless that boundary is lined. To meet it:; Paint a light group's shade once, clipped to the group's union, so it crosses joins continuously.; The dark between the front legs becomes the two legs' inner lines plus a light warm shade (opacity 0.35 or less, no hard sides).; The saddle reaches under the leg's line.; The far leg is cream with a soft shade.; The thigh front is one curved line rising from the hind paw and fading upward, with no highlight strip.; Side: the near-side seam goes.; Back: the patch sits inside the lined edge.  Enforce it with the seam measure (h) in checkDesign.

- **Risk:** - **Decisions:** 25, 34 and 64 are replaced.; **Facing tests:** facing.test.ts's light-from-top-left shade-centroid tests may move.; **Palette:** the palette gate (dE2000 3.0 or less) runs per region.; **Markings:** markings.json area checks (the saddle seen from the front is 1.2-1.4 times phase 2's patch) and markingPlaceShareOfHead 0.03.

- **Defects closed:** 7.

### G8 Marking edges: feathered brush edges, no airbrush blobs, no white scratches

- **Cause:** marking.ts paints each marking as a blurred fill inside a mask (DECISIONS 83), with thin white hairline streaks across it. Patch shapes are typed squarish, and edges are blurred evenly or regularly scalloped instead of brushed.

- **Change:** - **Edges:** uneven, seeded feathered strands along the fur flow, with darker strands inside, and no white hairlines.; **Front eye patches:** rounded arcs with a feathered top, keeping the viewer-left cream temple strip.; **Tail root:** radiating brush strands, darkest at the root.; **Haunch:** tan streaks as on the crop.; **Saddle:** streaky edges that follow the back's curve.

- **Risk:** - **Checks:** marking placement and area checks.; **Right side:** the .R facings show their own side's markings (DECISIONS 102).; **Seeding:** seeded strands must be fixed, never re-seeded, so they never shimmer.

- **Defects closed:** 4.

### G9 Collar ends and edges; side tag

- **Cause:** Each view types its own collar, with: - a uniform outline all round, including the wobbly top under the chin; - blunt, rounded-square ends, allowed by the lint corner exemption for the collar (drawings.ts:49); - from behind, a stiff bar.  The side view's tag is drawn as an apple with a stem and a heavy rim.

- **Change:** - **Line:** heavier on the bottom edge. The top edge stays unlined under the chin fur, which G4's scallops overlap.; **Ends:** taper and tuck under the cheek fur, or meet the shoulder and head lines (back).; **Back band:** curved round the neck, with rounded, tapering ends that dip slightly.; **Side tag:** a rounded heart or coin with an embossed heart and a thin darker rim, on a ring, with a darker loop band at the collar's front end.

- **Risk:** - **Lint:** the collar's corner exemption text in drawings.ts must stay true.; **Tag swing:** the tag's pivot and swing (tag.ring landmark).; **Chin shadow:** the chin shadow's clip lies on the collar.

- **Defects closed:** 4.

### G10 Ground contact shadow

- **Cause:** Each view draws a narrow, faint, warm haze close under the paws. The sheet paints a broad soft grey-lilac ellipse reaching well past the haunches and tail.

- **Change:** One shadow recipe (a shared helper in lane 1, sized per view from its crop): a wide soft ellipse in the palette's soft-shadow colour, darkest under the paws, extending past both haunches and the tail. It fades from its top edge, with no hard edge at the ground line.

- **Risk:** Silhouette IoU leaves the ground shadow out (groundShadowLeftOut), so keep it its own part so the mask still drops it. On Home it falls on the person's background, a low risk.

- **Defects closed:** 4.

## The check that would have caught it

Proposed **linematch** check: a new characters/sheetmatch/linematch.py with test_linematch.py, plus a cheap vector gate in lint.ts. It complements match.py, whose silhouette, landmark and palette gates cannot see these defects: they lie inside the silhouette and are under 2 pt.

**A. Vector gate (lint.ts; exact, no images).**
- Build each view's visible edges from the composited shapes.
- Fail when any of these holds, unless the span cites a DECISIONS entry:
  - a visible outer or overlap edge has a run over 2 pt below full line width;
  - a taper is longer than 2 pt;
  - a fur edge is drawn as more than one span;
  - a span ends in mid-fur, more than 1 pt from another line or a part edge.
- Catches front #10, #12 and #14; 3/4 D3; side #9, #11 and #12; back #6.

**B. Image check, per view and region (linematch.py).**

*Inputs:*
- the sheet crop at native size;
- our 3x still, with alpha recovered from the white and black renders;
- our ID pass;
- match.py's alignment (ground anchor plus best-fit shift).

Area-downsample ours to the crop grid.

*Regions* are bands of ±3 crop px (about 2.3 pt) around each ID boundary, named by the part pair: head.base/ear.R (cheek over ear), head.base/collar (chin), front.R/body.front, paw/ground, haunch/tail, and so on.

*Line map:* a black top-hat on L* (radius 2 px). Keep warm hues (a* > 3, b* > 8), and mask out the eyes, nose, mouth, collar and tag by ID and by the sheet's face boxes. Choose the threshold τ per sheet where the sheet's skeleton length plateaus.

*Measures per region:*
- **(a) Recall:** the share of the sheet's line skeleton within 1.5 crop px of ours. Catches missing lines.
- **(b) Precision:** the share of ours within 1.5 crop px of the sheet's. Catches claw ticks, hooks, cuffs, dashes and stray ticks.
- **(c) Max gap:** the longest unlined run along the boundary in pt, ours against the sheet's on the mapped curve.
- **(d) Weight variation:** the coefficient of variation of the line's perpendicular FWHM. Fail when ours is under 0.5 times the sheet's, or when ours is uniformly at least the sheet's width + 0.3 pt.
- **(e) Tone:** minimum L* along each profile, as a mean and a spread. On contact edges, ours must not be more than 10 L* lighter than the sheet; this catches the .R paling.
- **(f) Fur amplitude:** the silhouette contour's deviation from itself smoothed with σ 4 pt, as an RMS and as zero crossings per 10 pt. Ours must reach at least 0.6 times the sheet's on the ears, cheeks, chin, tail, paw soles and haunch bottoms.
- **(g) Crispness (render only, at 3x):** the 10-90% alpha rise across head.line and every outer edge must be 0.45 pt or less. Calibrate by rendering one reference ribbon at blur 0 and at the current σ 0.3.
- **(h) Seams:** an interior ID boundary with ΔL* above 6 and no line within 1.5 px, where the sheet shows ΔL* under 3, is a 'hard unlined seam'. A band along a boundary lighter than both sides by more than 3 L* is a 'light seam'.

**C. Calibration on the sheets themselves.**
- Run the sheet against a perturbed copy of itself:
  - shift ±1 px, scale ±2%, rotate ±1°;
  - JPEG re-encode at quality 70;
  - Lanczos down-up by 2x;
  - Gaussian σ 0.5 px.
- Each threshold is the worst perturbed score less a 10% margin. Store them per region in characters/dog/ref/lines.json.
- Take absolute line widths and the fur-amplitude floor from master.hero.main.png (358x378) and the stubby-paws and floppy-ears panels. The turnaround crops are only about 1.3 px per pt and cannot resolve under about 1.5 pt or 0.4 pt of width, so (a)-(c) compare positions while (d)-(f) compare relative statistics.
- In .R views, compare tones only on contact edges.

**D. Planted faults.** Each must fail in its own region, with every other region still passing:
1. delete 4 pt of the cheek-over-ear span;
2. restore 8 pt tapers on every span;
3. head.line unclipped at σ 0.6;
4. one ear's outer edge replaced by its smoothed hull;
5. one paw sole flattened, with a square r 4 pt corner;
6. three dark 3 pt claw ticks on a sole;
7. a uniform 1.75 pt tone-10 line all round a paw;
8. a hard-edged tan stripe between the front legs;
9. a 0.8 pt cream band along the haunch/leg boundary;
10. the chin span removed;
11. side.R's haunch-over-tail line turned pale;
12. a detached 1 pt tick beside the crown line.

Also plant faults in the sheet itself (erase one line segment, blur one region) and check it against the edited copy.

**E. Acceptance.**
- The sheet against its perturbed self passes in every region.
- Today's build must fail at least: front #2, #3, #10, #11, #12; 3/4 D3, D10, D12; side #9, #11, #12; back #6, #7. If it does not, the check is not measuring what the founder sees.
- Run it advisory during the fix pass and gating at the end, beside the existing match.py thresholds (edgeP95Pt 2.0, which is advisory today).

## Lanes, in order

**0. Before the pass.**
- Land or freeze the in-flight branches. Otherwise every view lane conflicts:
  - p3/faces2: front.ts +337 lines (head(puff) builder, head.line temple states, perked and lifted ears), parts/cheeks.ts, small edits in side.ts and threeQuarter.ts;
  - p3/turnedfaces: side.ts +285, threeQuarter.ts +257, drawings.ts, parts/turned.ts, and rest-still byte-identity tests;
  - p3/checks: sheetmatch/match.py, build/build.ts, lab/still.ts, lab/render.ts.
- Start from main after those merges; line numbers in the cause report shift with them.
- Reserve DECISIONS 210-249. In use now: up to 140, 141-162, 170-186, 190-192 and 200.
- Lanes render into their own output folders, never build/stills.

**1. Shared recipes** (one agent, first; DECISIONS 210-219).
- Files:
  - characters/dog/src/parts/: lines.ts, paw.ts, ear.ts, marking.ts, and new headfur.ts and shadow.ts;
  - characters/draw/fur.ts, characters/draw/lint.ts (and draw/paint.ts only if needed);
  - tests: draw/test/fur.test.ts, draw/test/lint.test.ts, dog/test/finish.test.ts.
- Ship the new behaviour as options that default to today's, so all six views still build and pass. Each view lane opts in.

**2. The check** (runs in parallel with 1; no shared files).
- Files: characters/sheetmatch/linematch.py, test_linematch.py, characters/dog/ref/lines.json, and a calibration script.
- Hook it into characters/build/build.ts only after p3/checks merges.
- It must fail on today's build before the view lanes start, and stays advisory until lane 7.

**3-6. One lane per view** (parallel, after lanes 1 and 2).
- **Front** (DECISIONS 220-227): views/front.ts, dog/test/dog.test.ts, qa/phase3/front. Must carry huffy's puffed head B, the head.line temple states and the perked and lifted ears.
- **Three-quarter** (228-234): views/threeQuarter.ts, threeQuarter.test.ts, qa/phase3/threeQuarter.*. Both facings and the turned perked ear.
- **Side** (235-241): views/side.ts, side.test.ts, facing.test.ts (this lane owns it), parts/tag.ts, qa/phase3/side.*. Both facings, the profile mouths on head.line, and the back-of-head line.
- **Back** (242-248): views/back.ts, back.test.ts, qa/phase3/back.
- Shared files: DECISIONS.md is append-only within each lane's block; merge the lanes one after another. Nobody edits rig.json or palette.ts, except lane 1 if a new tone is needed.

**7. Integration** (last).
- Rebuild the package and run:
  - match.py and linematch (gating) on all six views;
  - the Faces check on all 17 clips and the turned states;
  - every Node and Python test.
- Re-pin rest stills with the reason.
- Render the rig's extreme poses to check line ends hidden under parts.
- Run three fresh reviewers at phone scale, refresh the evidence, update PROGRESS.

## What the audit did not cover

- Face-state variants were not audited, and they are drawn on the same parts: huffy's puffed head B, the head.line temple states and the perked/lifted ears on p3/faces2; the turned perked ears, the profile mouths that use head.line as the lower lip, and the 'back of the head' span (taper [6,10]) on p3/turnedfaces. Both branches are unmerged and touch front.ts, side.ts and threeQuarter.ts heavily.

- Motion was not checked, only the six rest stills. Line ends kept at full width under a part (G1, G6) can show when legs, head or ears rotate in Phase 4-5 clips, and scalloped soles change the paw contact points used for planting.

- Runtime renders were not checked. The crispness fix (clipping head.line) can expose stencil fringes in the WebGL/SpriteKit atlases and in parity, which still.ts does not show.

- Two edges were found by this synthesis, not by the view auditors. threeQuarter.R's haunch-over-tail line and tail outline are paler than .L (same cause as side #17). threeQuarter's chest side under the collar (the far leg's top edge) is a chipped saw-tooth like front #8, which D11 rated as 'wavy bumps', low.

- The side view's chest front edge between the tag and the near leg was not audited. There our line starts abruptly about 1-2 pt below the tag; this is low severity and unmeasured.

- The front 'long straight tubes' claim was not measured. The three-quarter auditor measured leg height equal to the sheet; in front, the tube look appears to come from the outer leg line running up near the collar with parallel sides. Measure before changing proportions, since the paw and seat landmarks pass today.

- Several defects violate existing decisions, so they are implementation gaps rather than new decisions: 47 (bun paws wider than the leg), 82 (paw outline closed all round), 89 (the crown's line runs into each ear's) and 68 (profile ear top feathered under the crown). Others need replacing entries: 7, 25, 33/72, 64 and 74/79.

- The turnaround crops are only 193-234 px (about 1.3 px/pt). The auditors' lock counts, tip shapes and line widths come from upscaled crops; they were not cross-checked against master.hero.main.png (358x378) or the feature panels.

- Not re-measured here: the auditors' numbers (L*, widths, the 10.7 pt sole gap, 62.9 pt of unlined chin, dE 4.7). I verified the source behind the main causes: - lines.ts: taper default (:89-97), SOFT σ 0.3 (:39), litEdge unclipped (:190-194); - paw.ts:23-30, the toe gradient; - front.ts:706, taper [6,16]; - front.ts:569-578, between(); - finish.test.ts:70-80, the 1.55 pt / tone 8 ground line; :126-139, the 2-3 clump ear guard; - lint.ts:511-518, the fur exemption from the 4 pt rule.

- Out of scope and not audited: the face (eyes, nose, mouth; the side eye leans back about 15 degrees with a heavier rim), the tag outside the side view, and the kit's effect on later species (fur.ts and lint.ts are shared kit, though today only the dog uses fur.ts).

- Ear paint was judged inconsistently: comb-like or ribbed in side and back, 'fine' in front and 3/4, from the same ear.ts recipe. Nobody checked whether the spacing differs by view or the judgements differ.
