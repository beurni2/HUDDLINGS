// The dog's face presets (spec L480-498), as data: for each of the table's 19 presets, its eyes, mouth, brows, ears
// and blush level, the sequence the table names, its panels, and the frame its still shows (the state of each
// sequence its primary panel draws; a sequence's later beats are phase 4's timing). faceClips.ts writes a face clip
// for each. Hungry and huffy are new drawings no panel shows, for the founder to approve at Gate A (L496-497, R3);
// their stills show the beat that carries each face, and the review-only render (qa/phase3/faces/new) shows the rest.
// Brows are not in the table: raised for curious and surprised (L472), happy for the crescent-eyed faces, as their
// panels draw them lower, and neutral otherwise. Rule R3: nothing here is sad, angry, pouting, teary or drooped
// (characters/dog/test/faces.test.ts).
import type { BrowState } from "./parts/brow.ts";
import type { CheekState } from "./parts/cheeks.ts";
import type { MouthState } from "./parts/mouth.ts";

/**
 * The eye states: the table's (L450-457), peek (Side glance), and the new faces' new drawings: eager (hungry's wide
 * eye, its pupil larger and fixed on the food), flat (huffy's shut lids) and peekBack (huffy's eye opening to look back).
 */
export const EYE_STATES = ["open", "happy", "squeeze", "closed", "sleepy", "wide", "wink", "sparkle", "peek", "eager", "flat", "peekBack"] as const;
export type EyeState = (typeof EYE_STATES)[number];
export const EAR_STATES = ["neutral", "lifted", "onePerked", "relaxed", "lowered"] as const;
export type EarState = (typeof EAR_STATES)[number];

/**
 * Each ear state's rest angle in degrees, outward positive (the ear's tip away from the face): relaxed and lowered
 * turned in toward the face, never so far that the ear goes behind the head (14 to 18° inward hides it). The lifted and
 * the one perked ear are drawings of their own, at 0° (DECISIONS 133, 145): Lifted slightly raises the root and tips
 * the flap toward us, which no turn about the root gives.
 */
export const EAR_ANGLES: Record<EarState, number> = { neutral: 0, lifted: 0, onePerked: 0, relaxed: -3, lowered: -7 };

/**
 * The level every view's blush part is drawn at (DECISIONS 145, 160): the printed pink's level over the fur that
 * match.py's fit (palette.py's, Q25) reads on each cheek with the part at alpha 1, its core at full #F7B3A6, the
 * reddest tenth of the cheek's light pixels all the printed pink (0.999 to 1 measured), so the spec's whole range,
 * 0 to 100% (L474; the strawberry's blush goes all the way up, L968), is a part alpha from 0 to 1. A level is drawn as
 * the parts' alpha, level over this: the rest alpha in rig.json is model.json's resting level over it, and a face
 * clip keys the level its preset names.
 */
export const BLUSH_REFERENCE = 1;

export interface Preset {
  /** The table's eyes, mouth and ears, each a state or several, in the table's order, and how several combine. */
  eyes: EyeState[];
  mouth: MouthState[];
  ears: EarState;
  /** How the table's states combine: alternatives ("or") or a sequence ("then"), and its own words where it qualifies them. */
  eyesHow?: "or" | "then";
  mouthHow?: "or" | "then";
  eyesNote?: string;
  mouthNote?: string;
  earsNote?: string;
  /** Each brow's state (not in the table; see above). */
  brows: BrowState | { L: BrowState; R: BrowState };
  /** The sequence the table names, in its own words. */
  sequence?: string;
  /** The blush's level where the table names one (0 to 1); null for the resting level (model.json's, 0.35 on the Grown dog). */
  blush: number | null;
  /** The table's sheet panels, in its words. */
  panels: string;
  /** The panels as crops, the primary one first: the panel the still is drawn from and set beside. */
  crops: string[];
  /** The frame the still shows, where the preset has several eyes or mouths: the one its primary panel draws. */
  still?: { eyes?: EyeState; mouth?: MouthState };
  /** Which eye winks, as the primary panel draws it, and which ear perks, as One ear perked draws it. */
  wink?: "L" | "R";
  perk?: "L" | "R";
  /** The cheeks' state where the face puffs them (huffy). */
  cheeks?: CheekState;
  /**
   * A new drawing no panel shows (hungry, huffy: L496-497), for the founder to approve at Gate A: the sheet panels it
   * borrows from, nearest first, set beside it for review. It has no primary panel, so the Faces check judges it by
   * eye and holds its head.
   */
  drawnNew?: { from: string[] };
  /**
   * Huffy's peek back, the beat every 4 to 6 s (L497): the eye that opens again to look back (peekBack), the other
   * staying shut, the mouth it smiles, and the cheeks let go. Rendered for review (qa/phase3/faces/new); its timing is
   * phase 4's.
   */
  peek?: { eye: "L" | "R"; mouth: MouthState };
}

export const PRESETS: Record<string, Preset> = {
  neutral: {
    eyes: ["open"], mouth: ["smile"], ears: "neutral", brows: "neutral", blush: null,
    panels: "Happy (default), Idle", crops: ["master.expression.happy", "expressions.expression.happy"],
  },
  happy: {
    eyes: ["open"], eyesNote: "pupils larger", mouth: ["open"], ears: "neutral", brows: "neutral", blush: null,
    panels: "Happy", crops: ["master.expression.happy", "expressions.expression.happy"],
  },
  excited: {
    // The dog's squeeze is its happy crescent (Q2).
    // The table's open mouth, drawn as the Excited panels draw it: wider and deeper than the rest's (DECISIONS 143).
    eyes: ["squeeze", "happy"], eyesHow: "or", eyesNote: "squeeze (kitty, bear) or happy", mouth: ["openWide"], mouthNote: "the table's open, as Excited draws it",
    ears: "lifted", brows: "happy", blush: null,
    panels: "Excited", crops: ["master.expression.excited", "expressions.expression.excited"], still: { eyes: "happy" },
  },
  laughing: {
    eyes: ["happy"], mouth: ["laugh"], ears: "neutral", earsNote: "bouncing", brows: "happy", blush: null,
    panels: "Laughing", crops: ["master.expression.laughing", "expressions.expression.laughing"],
  },
  curious: {
    eyes: ["open"], eyesNote: "glancing up", mouth: ["o", "smile"], mouthHow: "or", ears: "onePerked", brows: "raised", blush: null,
    // The expression sheet's Curious draws a mouth whose ends hang below its middle (R3); the master sheet's Curious smiles.
    panels: "Curious", crops: ["master.expression.curious", "expressions.expression.curious"], still: { mouth: "smile" }, perk: "L",
  },
  surprised: {
    eyes: ["wide"], mouth: ["o"], ears: "lifted", brows: "raised", blush: null,
    panels: "Surprised", crops: ["expressions.expression.surprised", "master.expression.surprised"],
  },
  shy: {
    eyes: ["open"], eyesNote: "looking down", mouth: ["smile"], ears: "relaxed", brows: "neutral", blush: 0.8,
    panels: "Shy", crops: ["expressions.expression.shy"],
  },
  proud: {
    sequence: "happy, then sparkle",
    eyes: ["happy", "sparkle"], eyesHow: "then", mouth: ["smile"], ears: "lifted", brows: "happy", blush: null,
    panels: "Proud", crops: ["master.expression.content", "expressions.expression.proud"], still: { eyes: "sparkle" },
  },
  mischievous: {
    // The dog's left eye winks, as Cheeky, the primary, draws it (DECISIONS 111, 141); its brows stay level, as Cheeky's do.
    eyes: ["wink"], mouth: ["cheeky"], ears: "onePerked", brows: "neutral", blush: null,
    panels: "Mischievous", crops: ["master.expression.cheeky", "master.expression.winking", "expressions.expression.mischievous"], wink: "L", perk: "L",
  },
  content: {
    eyes: ["happy"], mouth: ["smile"], ears: "relaxed", brows: "happy", blush: null,
    panels: "Content", crops: ["master.expression.content"],
  },
  sleepy: {
    sequence: "sleepy, then closed",
    eyes: ["sleepy", "closed"], eyesHow: "then", mouth: ["smile"], ears: "lowered", brows: "neutral", blush: null,
    panels: "Sleepy", crops: ["master.expression.sleepy", "expressions.expression.sleepy"], still: { eyes: "closed" },
  },
  listening: {
    eyes: ["open"], eyesNote: "pupils larger", mouth: ["smile"], ears: "lifted", brows: "neutral", blush: null,
    panels: "the ear positions Lifted, Forward and Perked", crops: ["expressions.ears.lifted-slightly"],
  },
  tender: {
    eyes: ["sleepy"], eyesNote: "with slow blinks", mouth: ["smile"], ears: "relaxed", brows: "neutral", blush: null,
    panels: "Content", crops: ["master.expression.content"],
  },
  singing: {
    eyes: ["happy", "closed"], eyesHow: "or", mouth: ["o"], mouthNote: "opening on the beat", ears: "lifted", brows: "happy", blush: null,
    panels: "Laughing, Happy", crops: ["master.expression.laughing", "master.expression.happy", "expressions.expression.happy", "expressions.expression.laughing"], still: { eyes: "happy" },
  },
  blissful: {
    sequence: "closed, then happy",
    eyes: ["closed", "happy"], eyesHow: "then", mouth: ["smile"], ears: "relaxed", brows: "happy", blush: 0.7,
    panels: "Content", crops: ["master.expression.content"], still: { eyes: "happy" },
  },
  ticklish: {
    // The dog's squeeze is its happy crescent (Q2).
    eyes: ["squeeze"], mouth: ["laugh"], ears: "neutral", earsNote: "bouncing", brows: "happy", blush: null,
    panels: "Laughing, Excited", crops: ["master.expression.laughing", "master.expression.excited", "expressions.expression.excited", "expressions.expression.laughing"],
  },
  hungry: {
    // New drawing (R3, L496): the wide eye with its pupil larger, baked fixed on the food just in front of its nose
    // (eager), the raised brows and the lifted ears of the listening tell, the o of Surprised, then the mouth closing
    // into the smile with the tongue's tip peeking out at its corner, a lick (o.tongue). Eager and sweet, never
    // pleading: the eyes meet on the food, never look up at the viewer.
    sequence: "o, then the tongue peeking at a corner",
    eyes: ["eager"], eyesNote: "wide, pupils larger, fixed on the food or the jar", mouth: ["o", "o.tongue"], mouthHow: "then", ears: "lifted",
    brows: "raised", blush: null, panels: "none: drawn new from the Surprised and Happy panels, approved by the founder", crops: [],
    still: { mouth: "o.tongue" },
    drawnNew: { from: ["expressions.expression.surprised", "expressions.expression.happy", "expressions.mouth.tiny-o", "master.expression.cheeky"] },
  },
  huffy: {
    // New drawing (R3, L497): shut flat lids, the cheeks puffed inside the outline and the lips pressed in a short level
    // line, brows and ears at rest; then the peek back, one eye opening to look back with a tiny smile, the cheeks let
    // go. A playful huff that melts in a second: no knitted or slanted brows, no downturned or pushed-out mouth, no
    // tears, no lowered ears, never the sheets' Angry or Pout. Glancing away is the head's turn (phase 4).
    sequence: "closed or half-closed, glancing away, peeking back with a tiny smile every 4–6 s",
    eyes: ["flat", "peekBack"], eyesHow: "then", eyesNote: "closed or half-closed, glancing away, peeking back with a tiny smile every 4–6 s",
    mouth: ["pressed", "tinySmile"], mouthHow: "then", mouthNote: "puffed cheeks, a small pressed mouth; the tiny smile as it peeks back",
    // The table names no blush level for huffy, so it keeps the resting level, the safe default; the 60% flush the
    // first drawing keyed is shown for the founder in the review render (DECISIONS 161).
    ears: "neutral", brows: "neutral", cheeks: "puffed", blush: null,
    panels: "none: drawn new for Grumpy and approved by the founder; never the sheets' Angry or Pout, and never held more than 6 s without a peek back",
    crops: [], still: { eyes: "flat", mouth: "pressed" }, peek: { eye: "L", mouth: "tinySmile" },
    drawnNew: { from: ["expressions.eyes.closed", "expressions.eyes.side-glance", "expressions.mouth.small-smile", "master.expression.content"] },
  },
  sly: {
    sequence: "wink, then side glances",
    eyes: ["wink", "peek"], eyesHow: "then", eyesNote: "wink, then side glances", mouth: ["cheeky"], ears: "onePerked", brows: "neutral", blush: null,
    panels: "Mischievous", crops: ["master.expression.cheeky", "master.expression.winking", "expressions.expression.mischievous"], still: { eyes: "wink" }, wink: "L", perk: "L",
  },
};

