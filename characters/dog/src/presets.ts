// The dog's face presets (spec L480-498), as data: for each of the table's 19 presets, its eyes, mouth, brows, ears
// and blush level, the sequence the table names, its panels, and the frame its still shows (the state of each
// sequence its primary panel draws; a sequence's later beats are phase 4's timing). faceClips.ts writes a face clip
// for each preset drawn now; hungry and huffy are next round's new drawings, for the founder to approve (L496-497).
// Brows are not in the table: raised for curious and surprised (L472), happy for the crescent-eyed faces, as their
// panels draw them lower, and neutral otherwise. Rule R3: nothing here is sad, angry, pouting, teary or drooped
// (characters/dog/test/faces.test.ts).
import type { BrowState } from "./parts/brow.ts";
import type { MouthState } from "./parts/mouth.ts";

export const EYE_STATES = ["open", "happy", "squeeze", "closed", "sleepy", "wide", "wink", "sparkle", "peek"] as const;
export type EyeState = (typeof EYE_STATES)[number];
export const EAR_STATES = ["neutral", "lifted", "onePerked", "relaxed", "lowered"] as const;
export type EarState = (typeof EAR_STATES)[number];

/**
 * Each ear state's rest angle in degrees, outward positive (the ear's tip away from the face): lifted from the Lifted
 * slightly panel and the motion sheet's Ear twitch, relaxed and lowered turned in toward the face, never so far that
 * the ear goes behind the head (14 to 18° inward hides it). The one perked ear is its own drawing at 0° (DECISIONS 133).
 */
export const EAR_ANGLES: Record<EarState, number> = { neutral: 0, lifted: 10, onePerked: 0, relaxed: -3, lowered: -7 };

/**
 * The level every view's blush part is drawn at (DECISIONS 144): the printed pink's level over the fur that
 * match.py's fit (palette.py's, Q25) reads on each cheek with the part at alpha 1, its core at full #F7B3A6 (0.950 to
 * 0.964 measured, each view's stretch evened to 0.95). A level is drawn as the parts' alpha, level over this: the
 * rest alpha in rig.json is model.json's resting level over it, and a face clip keys the level its preset names.
 */
export const BLUSH_REFERENCE = 0.95;

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
  /** Next round's new drawing, not drawn now. */
  next?: string;
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
    sequence: "o, then the tongue peeking at a corner",
    eyes: ["wide"], eyesNote: "pupils larger, fixed on the food or the jar", mouth: ["o"], mouthNote: "then the tongue peeking at a corner", ears: "lifted",
    brows: "raised", blush: null, panels: "none: drawn new from the Surprised and Happy panels, approved by the founder", crops: [],
    next: "a new drawing (o.tongue: the o with the tongue peeking at a corner), next round, for the founder's approval",
  },
  huffy: {
    sequence: "closed or half-closed, glancing away, peeking back with a tiny smile every 4–6 s",
    eyes: ["closed", "sleepy"], eyesHow: "or", eyesNote: "closed or half-closed, glancing away, peeking back with a tiny smile every 4–6 s",
    mouth: [], mouthNote: "puffed cheeks, a small pressed mouth", ears: "neutral", brows: "neutral", blush: null,
    panels: "none: drawn new for Grumpy and approved by the founder; never the sheets' Angry or Pout, and never held more than 6 s without a peek back",
    crops: [], next: "new drawings (pressed, tinySmile and the puffed cheeks), next round, for the founder's approval",
  },
  sly: {
    sequence: "wink, then side glances",
    eyes: ["wink", "peek"], eyesHow: "then", eyesNote: "wink, then side glances", mouth: ["cheeky"], ears: "onePerked", brows: "neutral", blush: null,
    panels: "Mischievous", crops: ["master.expression.cheeky", "master.expression.winking", "expressions.expression.mischievous"], still: { eyes: "wink" }, wink: "L", perk: "L",
  },
};

