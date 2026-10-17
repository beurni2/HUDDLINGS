// The drawing lint (build time only): the build fails on any drawing that
// breaks the art rules it can check (spec section 5b, Art rules) or that resvg
// may draw wrongly or not at all. It reads the SVG as resvg will: attributes in
// either quote, character references decoded, style declarations as
// attributes; markup it cannot read fails rather than slipping past.
import type { Drawing } from "../build/atlas.ts";
import type { Rig } from "../../runtime-web/src/format.ts";
import { arc, area, minRadius, onSpan, sample, type P, type Seg } from "./geom.ts";
import type { DrawnLine } from "./line.ts";
import type { Piece, ShapeMeta } from "./svg.ts";

export const LIMITS = {
  /** Hand nodes in one shape: 8 to 20 is the aim. */
  nodes: 24,
  /** Outer lines, in points (spec L506). */
  outer: [1.2, 1.8] as [number, number],
  /** Inner lines, in points. */
  inner: [0.6, 0.9] as [number, number],
  /** No convex corner tighter than this on an outlined edge, outside fur and toe lobes (spec L510). */
  cornerPt: 4,
  /**
   * A toe lobe's least radius on an outlined edge (Q29's default: toe lobes as the stubby-paws panel draws them, about
   * 3 pt, rather than 4; dog DECISIONS 216): rounder than a kink, tighter than the corner rule.
   */
  lobePt: 2.5,
};

/**
 * The line gate (the fur plan's vector gate A, dog DECISIONS 219), for drawings whose lane has opted in (lineGate()),
 * judged on each view as it is composited, in the rig's draw order with its clip groups (LintRules.rig): every visible
 * stretch of the edge of a shape a gated span runs on is lined at full width, but for at most `thinPt` at a time (a
 * free end's taper, a gap between two spans); a free end tapers over at most `taperPt` where its taper shows; a `join` end lies within
 * `joinPt` of another line drawn at full width; an `under` end runs on at least `underPt` at full width, and fades out,
 * under a part drawn above its line; a fur edge is one span; and a span may end in the middle of fur only within `endPt`
 * of another line's end or of where the edge goes under a part. A point lies under a part when it lies at least
 * `coverPt` inside it; a visible stretch is lined by another shape's line within `linedPt` of it, or by a typed line
 * its shape reports (ShapeMeta.outlined), and with LintRules.shown only where that line shows in the composite, as a
 * join meets only a line that shows (dog DECISIONS 264). A span that cites a current DECISIONS entry (LintRules.decisions: one that
 * exists and that no later entry replaces) may taper longer, end in the middle of fur, or share a fur edge, and a bare
 * stretch beside it is let through as far as its own taper there and what the span says the sheet leaves unlined
 * (SpanMeta.bare); its joins and its ends under parts are held whatever it cites.
 */
export const GATE = { thinPt: 2, taperPt: 2, joinPt: 0.5, underPt: 1, endPt: 1, coverPt: 0.3, linedPt: 0.75 };

/** How a lit span's end finishes (the dog's parts/lines.ts): tapering as every span did before the fur pass, or free, joined or running on under a part. */
export type EndKind = "taper" | "free" | "join" | "under";

/** What the line gate reads of a lit span, reported with each line drawn along one. */
export interface SpanMeta {
  /**
   * The shape it runs on (shapeKey of its cubics), so the gate finds that shape in its view. A right-facing view's
   * piece is its left-facing piece mirrored about x = 0 with its spans as they were (the dog's views/facing.ts), so the
   * gate also finds a shape whose mirror has this key; the mirror keeps the path's order, so the shares stay true.
   */
  shape: string;
  /** Where it runs, as shares of the shape's length; `to` may be below `from` (it wraps past the start). */
  from: number;
  to: number;
  /** Its length as drawn, in points. */
  length: number;
  ends: [EndKind, EndKind];
  /** How long each end tapers, in points (0 where it joins or runs under a part). */
  taper: [number, number];
  /** A line where one part lies over another. */
  contact?: boolean;
  /** The DECISIONS entry that lets it break the gate's rules: a current one (LintRules.decisions), or the cite fails. */
  cites?: number;
  /**
   * How far past each end, in points, the sheet leaves the edge unlined, [before its start, after its end], which its
   * cite lets through as a bare stretch beside it, and no further (nothing, when left out).
   */
  bare?: [number, number];
  /** Where its part's feather fades it, as shares of its shape (the dog's parts/lines.ts): there it is not at full width, whatever its span says. */
  faded?: [number, number][];
  /** Set by lineGate(): the drawing's lane has opted in. */
  gate?: boolean;
}

/** A shape's key, from its cubics (FNV-1a over their coordinates to the thousandth). */
export function shapeKey(segs: Seg[]): string {
  let h = 0x811c9dc5;
  for (const n of segs.flat(2)) {
    for (const c of `${Math.round(n * 1000) / 1000},`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

type Spanned = DrawnLine & { span?: SpanMeta };

/** A piece whose lit spans the line gate holds (GATE): what a view lane sets on each drawing it has moved onto the fur pass's recipes. */
export function lineGate(p: Piece): Piece {
  return { ...p, meta: { ...p.meta, lines: p.meta.lines.map((l) => ((l as Spanned).span ? { ...l, span: { ...(l as Spanned).span!, gate: true } } : l)) } };
}

export interface LintRules {
  /** Every colour a drawing may paint (#RRGGBB): the species' palette.ts. */
  palette?: string[];
  /** Parts allowed a convex corner tighter than 4 pt on an outlined edge, each with its reason. */
  corners?: Record<string, string>;
  /**
   * The species' rig, for the line gate: each view is composited in its draw order, a part clipped to another (clipTo)
   * showing only inside it, a part resting below full alpha hiding nothing. A gated drawing with no rig to place it fails.
   */
  rig?: Pick<Rig, "drawOrder" | "parts">;
  /** The species' DECISIONS entries, for the line gate's cites (decisionsOf()): a cite that names no current entry fails, and with none given every cite does. */
  decisions?: Decisions;
  /**
   * The line gate counts a line only where it shows in the composite (dog DECISIONS 264): a line lines an edge, its own
   * or a neighbour's, only where half its width or more lies under no part drawn after it, and a join meets a line only
   * where some of that line shows. Without it the gate counts every full-width point of every line, even one a later
   * part covers, as the first gate did (219), so the front's temple.L line, running on under head.base along the head's
   * side, passed as lining it while the head's side showed bare.
   */
  shown?: boolean;
}

/** A species' DECISIONS entries as the line gate reads them: every entry's number, and each entry later ones replace, in whole or in part, with the entries that replace it. */
export interface Decisions {
  entries: number[];
  replaced: Record<number, number[]>;
}

/**
 * A DECISIONS.md read for the line gate: each entry starts a line with its bold number (`**210. `), and an entry
 * replaces another where it says "replaces" or "replacing" and names it with an apostrophe-s ("this replaces 74's
 * ..."), to the clause's end. An entry replaced even in part cannot be cited to pass the gate: the rule a cite stands on
 * must be the one in force, so a lane cites the entry that replaced it, or writes its own.
 */
export function decisionsOf(markdown: string): Decisions {
  const entries: number[] = [];
  const replaced: Record<number, number[]> = {};
  let current: number | undefined;
  for (const line of markdown.split("\n")) {
    const head = /^\*\*(\d+)\.\s/.exec(line);
    if (head) entries.push((current = Number(head[1])));
    else if (/^#/.test(line)) current = undefined;
    if (current === undefined) continue;
    // Each "replaces ..." clause, to its sentence's or clause's end (a period before a space, a semicolon or a colon),
    // leaving out an aside in brackets ("(210's cause)").
    for (const clause of line.matchAll(/\breplac(?:es|ing)\b(.*?)(?:\.(?=\s|\*|$)|[;:]|$)/g)) {
      for (const n of clause[1]!.matchAll(/(?<![\w.(])(\d+)['’]s\b/g)) if (Number(n[1]) !== current && !replaced[Number(n[1])]?.includes(current)) (replaced[Number(n[1])] ??= []).push(current);
    }
  }
  return { entries, replaced };
}

/**
 * How far a filter or a mask may reach past the canvas, in points, from what it
 * does: three σ of its widest blur plus how far an erode and a move shift a
 * shape, and never less than 2 pt. paint.ts sizes every region and masked rect
 * by this one rule (reachOf).
 */
export function reach(blur: number, shift: number): number {
  return Math.max(2, 3 * blur + shift);
}

const COLOUR_ATTRS = ["fill", "stroke", "stop-color", "flood-color", "lighting-color"];
/** Elements that bring in a picture instead of drawing one (rule R8), by their names as written. */
const PASTED: Record<string, string> = { image: "image", feimage: "feImage", foreignobject: "foreignObject" };
/** Elements whose content is a definition, drawn only where something refers to it. */
const DEFINITIONS = new Set(["defs", "mask", "clippath", "filter", "lineargradient", "radialgradient", "pattern", "symbol", "marker"]);
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Character and predefined entity references decoded, as an XML parser reads them. */
export function decode(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(lt|gt|amp|quot|apos));/g, (_m, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name) return ENTITIES[name]!;
    const code = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : "�";
  });
}

interface Tag {
  /** The local name (any prefix dropped), lower case. */
  local: string;
  /** Attributes and style declarations together, decoded: what resvg draws by. */
  props: Record<string, string>;
  close: boolean;
  empty: boolean;
  text: string;
}

const TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Every tag in order, and any markup between them the lint cannot read (anything but text). */
function readTags(svg: string): { tags: Tag[]; unread: string[] } {
  // Comments and CDATA hold no elements: blanked, so whatever "<" is left must start a tag the lint reads.
  const plain = svg.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => " ".repeat(m.length));
  const tags: Tag[] = [], unread: string[] = [];
  let last = 0;
  const between = (to: number) => {
    const text = plain.slice(last, to).replace(last === 0 ? /^\s*<\?xml[^>]*\?>/ : /^$/, "");
    const at = text.indexOf("<");
    if (at >= 0) unread.push(text.slice(at, at + 60));
  };
  for (const m of plain.matchAll(TAG)) {
    between(m.index);
    last = m.index + m[0].length;
    const props: Record<string, string> = {};
    for (const [, key, double, single] of m[3]!.matchAll(ATTR)) props[key!] = decode(double ?? single ?? "");
    // Style declarations win over attributes, as in CSS.
    for (const declaration of (props.style ?? "").split(";")) {
      const colon = declaration.indexOf(":");
      if (colon > 0) props[declaration.slice(0, colon).trim().toLowerCase()] = declaration.slice(colon + 1).trim();
    }
    delete props.style;
    tags.push({ local: m[2]!.replace(/^.*:/, "").toLowerCase(), props, close: m[1] === "/", empty: m[4] === "/", text: m[0] });
  }
  between(plain.length);
  return { tags, unread };
}

type Affine = [number, number, number, number, number, number];
const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];
const times = (m: Affine, n: Affine): Affine => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Affine, [x, y]: [number, number]): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const NUMBERS = new RegExp(NUMBER.source, "g");
/** A length in user units, or NaN for one the lint does not resolve (%, em). */
function length(s: string | undefined, otherwise = 0): number {
  if (s === undefined) return otherwise;
  return new RegExp(`^\\s*${NUMBER.source}(?:px)?\\s*$`).test(s) ? parseFloat(s) : NaN;
}
const most = (s: string | undefined) => Math.max(0, ...(s?.match(NUMBERS) ?? []).map((n) => Math.abs(Number(n))));

/** A transform list as one matrix, or undefined when it cannot be read. */
function transform(text: string): Affine | undefined {
  let m = IDENTITY;
  const rest = text.replace(/\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?/g, (_all, kind: string, args: string) => {
    const n = (args.match(NUMBERS) ?? []).map(Number);
    const rad = ((n[0] ?? 0) * Math.PI) / 180;
    let t: Affine;
    if (kind === "matrix" && n.length === 6) t = n as Affine;
    else if (kind === "translate" && (n.length === 1 || n.length === 2)) t = [1, 0, 0, 1, n[0]!, n[1] ?? 0];
    else if (kind === "scale" && (n.length === 1 || n.length === 2)) t = [n[0]!, 0, 0, n[1] ?? n[0]!, 0, 0];
    else if (kind === "rotate" && (n.length === 1 || n.length === 3)) {
      const [cx = 0, cy = 0] = n.slice(1);
      t = times(times([1, 0, 0, 1, cx, cy], [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (kind === "skewX" && n.length === 1) t = [1, 0, Math.tan(rad), 1, 0, 0];
    else if (kind === "skewY" && n.length === 1) t = [1, Math.tan(rad), 0, 1, 0, 0];
    else return "?";
    m = times(m, t);
    return "";
  });
  return rest.trim() === "" ? m : undefined;
}

/** The box around a whole ellipse an arc lies on (SVG 1.1, F.6.5), from its end points and its radii, grown if too small. */
function arcBox(x1: number, y1: number, rx: number, ry: number, degrees: number, large: number, sweep: number, x2: number, y2: number): [number, number][] {
  if (rx === 0 || ry === 0) return [[x1, y1], [x2, y2]];
  const phi = (degrees * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const hx = (x1 - x2) / 2, hy = (y1 - y2) / 2;
  const px = cos * hx + sin * hy, py = -sin * hx + cos * hy;
  const grow = Math.sqrt(Math.max(1, (px * px) / (rx * rx) + (py * py) / (ry * ry)));
  rx *= grow;
  ry *= grow;
  const sign = large === sweep ? -1 : 1;
  const k = sign * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px) / (rx * rx * py * py + ry * ry * px * px)));
  const cxp = (k * rx * py) / ry, cyp = (-k * ry * px) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ex = Math.hypot(rx * cos, ry * sin), ey = Math.hypot(rx * sin, ry * cos);
  return [[cx - ex, cy - ey], [cx + ex, cy + ey]];
}

/** Every point that bounds a path (its end and control points, and the ellipse of each arc), or undefined when its data cannot be read. */
function pathPoints(d: string): [number, number][] | undefined {
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i]!)) i++;
  };
  const number = () => {
    skip();
    const m = new RegExp(`^${NUMBER.source}`).exec(d.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    return Number(m[0]);
  };
  // Arc flags are one digit each and may run together ("a5 5 0 1010 10" is legal).
  const flag = () => {
    skip();
    const c = d[i];
    if (c !== "0" && c !== "1") return NaN;
    i++;
    return Number(c);
  };
  const reads: Record<string, (() => number)[]> = {
    m: [number, number], l: [number, number], h: [number], v: [number], c: Array(6).fill(number), s: Array(4).fill(number),
    q: Array(4).fill(number), t: [number, number], a: [number, number, number, flag, flag, number, number], z: [],
  };
  const points: [number, number][] = [];
  let x = 0, y = 0, sx = 0, sy = 0, command = "";
  for (skip(); i < d.length; skip()) {
    if (/[A-Za-z]/.test(d[i]!)) command = d[i++]!;
    else if (!command || /z/i.test(command)) return undefined;
    const lower = command.toLowerCase(), rel = command !== command.toUpperCase();
    if (!(lower in reads)) return undefined;
    const args = reads[lower]!.map((read) => read());
    if (args.some((n) => !Number.isFinite(n))) return undefined;
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (lower === "z") [x, y] = [sx, sy];
    else if (lower === "h") x = args[0]! + ox;
    else if (lower === "v") y = args[0]! + oy;
    else if (lower === "a") {
      const [ex, ey] = [args[5]! + ox, args[6]! + oy];
      points.push(...arcBox(x, y, Math.abs(args[0]!), Math.abs(args[1]!), args[2]!, args[3]!, args[4]!, ex, ey));
      [x, y] = [ex, ey];
    } else {
      for (let k = 0; k < args.length; k += 2) points.push([args[k]! + ox, args[k + 1]! + oy]);
      [x, y] = points.at(-1)!;
    }
    if (lower === "m") {
      [sx, sy] = [x, y];
      command = rel ? "l" : "L";
    }
    points.push([x, y]);
  }
  return points;
}

/** The points that bound an element's own geometry, in its user space; undefined when the lint cannot bound it. */
function geometry(tag: Tag): [number, number][] | undefined {
  const p = tag.props;
  switch (tag.local) {
    case "g":
    case "symbol":
      return [];
    case "rect": {
      const [x, y, w, h] = [length(p.x), length(p.y), length(p.width), length(p.height)];
      return [[x, y], [x + w, y + h], [x + w, y], [x, y + h]];
    }
    case "circle":
    case "ellipse": {
      const [x, y] = [length(p.cx), length(p.cy)];
      const rx = tag.local === "circle" ? length(p.r) : length(p.rx), ry = tag.local === "circle" ? rx : length(p.ry);
      return [[x - rx, y - ry], [x + rx, y + ry], [x + rx, y - ry], [x - rx, y + ry]];
    }
    case "line":
      return [[length(p.x1), length(p.y1)], [length(p.x2), length(p.y2)]];
    case "polygon":
    case "polyline": {
      const n = (p.points ?? "").match(NUMBERS)?.map(Number) ?? [];
      return n.length % 2 ? undefined : Array.from({ length: n.length / 2 }, (_, k) => [n[2 * k]!, n[2 * k + 1]!]);
    }
    case "path":
      return pathPoints(p.d ?? "");
    default:
      return undefined;
  }
}

const isNumber = (s: string | undefined) => s !== undefined && Number.isFinite(length(s, NaN));
const inBand = (w: number, [lo, hi]: [number, number], tolerance = 1e-9) => w >= lo - tolerance && w <= hi + tolerance;
/** How far past a band's edge a stroke's drawn width may fall: what composing transforms leaves in its last digits. */
const STROKE_EDGE_PT = 1e-6;
/** The elements a stroke draws a line around. */
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);

/** The least and the most a transform scales a length by: its singular values. */
function scales([a, b, c, d]: Affine): [number, number] {
  const sum = a * a + b * b + c * c + d * d, det = Math.abs(a * d - b * c);
  const spread = Math.sqrt(Math.max(0, sum * sum - 4 * det * det));
  return [Math.sqrt(Math.max(0, (sum - spread) / 2)), Math.sqrt((sum + spread) / 2)];
}

/** A width to 0.01 pt, rounded away from the nearest band edge, so a width just past an edge never reads as the edge (1.196 pt reads 1.19). */
function shown(w: number): string {
  const edge = [...LIMITS.inner, ...LIMITS.outer].reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
  return String((w < edge ? Math.floor(w * 100 + 1e-9) : Math.ceil(w * 100 - 1e-9)) / 100);
}
/** A reference to an element of the same drawing: the only kind a part may hold. */
const SAME_DOCUMENT = /^#[A-Za-z_][\w.:-]*$/;
const uses = (value: string | undefined) => value !== undefined && value.trim() !== "none";

/** An element and its children, as the document nests them. */
interface Node {
  tag: Tag;
  children: Node[];
}

/** The tags as a tree: the elements at the top, each with its children. */
function treeOf(tags: Tag[]): Node[] {
  const top: Node[] = [], open: Node[] = [];
  for (const tag of tags) {
    if (tag.close) {
      open.pop();
      continue;
    }
    const node: Node = { tag, children: [] };
    (open.at(-1)?.children ?? top).push(node);
    if (!tag.empty) open.push(node);
  }
  return top;
}

/** The id a url(#id) value names, if that is what it is. */
const urlId = (value: string | undefined) => /^\s*url\(\s*["']?#([^"')\s]+)["']?\s*\)\s*$/.exec(value ?? "")?.[1];
/** The id an element's href (with any prefix) names, if it names one of the drawing's own. */
function hrefId(props: Record<string, string>): string | undefined {
  for (const [key, value] of Object.entries(props)) if (key.replace(/^.*:/, "") === "href") return /^\s*#(\S+)\s*$/.exec(value)?.[1];
  return undefined;
}

/** How far a filter or a mask spreads what it draws: its widest blur (σ), its widest erode or dilate, its longest move. */
interface Spread {
  blur: number;
  erode: number;
  move: number;
}
const STILL: Spread = { blur: 0, erode: 0, move: 0 };
const widest = (a: Spread, b: Partial<Spread>): Spread => ({ blur: Math.max(a.blur, b.blur ?? 0), erode: Math.max(a.erode, b.erode ?? 0), move: Math.max(a.move, b.move ?? 0) });
const reachOfSpread = (s: Spread) => reach(s.blur, s.erode + s.move);
/** <use> drawn through <use> more deeply than this is refused rather than followed. */
const USE_DEPTH = 8;

/** A filter's own spread, from its primitives. */
function filterSpread(filter: Node): Spread {
  let s = STILL;
  const visit = (n: Node) => {
    const p = n.tag.props, move = Math.hypot(length(p.dx), length(p.dy)) || 0;
    if (n.tag.local === "fegaussianblur") s = widest(s, { blur: most(p.stdDeviation) });
    if (n.tag.local === "femorphology") s = widest(s, { erode: most(p.radius) });
    if (n.tag.local === "feoffset") s = widest(s, { move });
    if (n.tag.local === "fedropshadow") s = widest(s, { blur: most(p.stdDeviation), move });
    n.children.forEach(visit);
  };
  filter.children.forEach(visit);
  return s;
}

/**
 * A mask's spread: the widest of the filters its content uses (through any <use> in it too), and the moves
 * paint.ts makes of a light group, a translation of an element right under a filtered group (the rim's lit shapes
 * under their erode, the highlight's moved shape under its blur). No other move in a mask counts.
 */
function maskSpread(mask: Node, ids: Map<string, Node>): Spread {
  let s = STILL;
  const seen = new Set<Node>();
  const visit = (n: Node, underFilter: boolean) => {
    if (seen.has(n)) return;
    seen.add(n);
    const p = n.tag.props;
    const filter = ids.get(urlId(p.filter) ?? "");
    if (filter?.tag.local === "filter") s = widest(s, filterSpread(filter));
    const t = underFilter && p.transform !== undefined ? transform(p.transform) : undefined;
    if (t) s = widest(s, { move: Math.hypot(t[4], t[5]) });
    const filtered = uses(p.filter);
    for (const child of n.children) visit(child, filtered);
    const target = n.tag.local === "use" ? ids.get(hrefId(p) ?? "") : undefined;
    if (target) visit(target, filtered);
  };
  for (const child of mask.children) visit(child, false);
  return s;
}

/** Every problem with one drawing, as readable lines. */
export function lintDrawing(d: Drawing, rules: LintRules = {}): string[] {
  const problems: string[] = [];
  const say = (what: string) => problems.push(`${d.region}: ${what}`);
  const svg = d.svg;
  const text = decode(svg);

  // Rule R8: parts are drawn, never pasted. Nothing may bring in a picture, a file, a URL or embedded data.
  if (/<!(DOCTYPE|ENTITY)/i.test(svg)) say("has a DOCTYPE, whose entities could hide anything from the lint; parts are plain SVG");
  if (/data:/i.test(text)) say("has a data: URI; parts are drawn, never pasted (rule R8)");
  if (text.includes("\\")) say("has a backslash, which can hide a reference from the lint");
  for (const [, inside] of text.matchAll(/url\(\s*([^)]*?)\s*\)/gi)) {
    const target = inside!.replace(/^(["'])(.*)\1$/, "$2").trim();
    if (!SAME_DOCUMENT.test(target)) say(`refers to url(${inside}); a drawing refers only to its own elements, url(#id) (rule R8)`);
  }
  const { tags, unread } = readTags(svg);
  for (const markup of unread) say(`has markup the lint cannot read: ${markup}`);
  for (const tag of tags) {
    if (tag.close) continue;
    if (PASTED[tag.local]) say(`has an <${PASTED[tag.local]}> element; parts are drawn, never pasted (rule R8)`);
    if (tag.local === "style") say("has a <style> element; paint goes on the elements, where the lint reads it");
    for (const [key, value] of Object.entries(tag.props)) {
      if (key.replace(/^.*:/, "") === "href" && !SAME_DOCUMENT.test(value.trim())) say(`has ${key}="${value}"; a drawing refers only to its own elements, "#id" (rule R8)`);
    }
  }

  // The canvas: a whole number of points on whole points, so every set's scale gives whole pixels.
  const root = tags.find((t) => t.local === "svg" && !t.close)?.props ?? {};
  const view = (root.viewBox ?? "").trim().split(/[\s,]+/).map(Number);
  if (!/^\d+$/.test(root.width ?? "") || !/^\d+$/.test(root.height ?? "")) say(`canvas ${root.width} × ${root.height} is not whole points`);
  if (view.length !== 4 || view.some((n) => !Number.isFinite(n)) || view[2] !== Number(root.width) || view[3] !== Number(root.height))
    say(`viewBox "${root.viewBox}" does not match the canvas`);
  else if (!Number.isInteger(view[0]) || !Number.isInteger(view[1])) say(`viewBox "${root.viewBox}" does not start on whole points`);
  const [vx = 0, vy = 0, vw = 0, vh = 0] = view;
  // A nested <svg>, a <symbol> drawn by a <use> and a marker each set up a viewport of their own that the bounds
  // below do not model, so they are refused rather than followed.
  if (tags.filter((t) => t.local === "svg" && !t.close).length > 1) say("has a nested <svg>; its viewport cannot be bounded");
  if (tags.some((t) => t.local === "marker" || Object.keys(t.props).some((k) => /^marker(-start|-mid|-end)?$/.test(k))))
    say("has a marker; its viewport cannot be bounded");

  // How far each mask and filter reaches (reach()): a filter by its own primitives; a mask by the filters its
  // content uses and the moves paint.ts makes of a light group in it. A mask's reach bounds what is drawn under it,
  // so nothing else in the drawing can raise it: a filter the mask never uses, a move it never feeds to a filter.
  const top = treeOf(tags);
  const ids = new Map<string, Node>();
  const index = (n: Node) => {
    const id = n.tag.props.id;
    if (id !== undefined && !ids.has(id)) ids.set(id, n);
    n.children.forEach(index);
  };
  top.forEach(index);
  const reaches = new Map<string, number>();
  for (const [id, n] of ids) {
    if (n.tag.local === "filter") reaches.set(id, reachOfSpread(filterSpread(n)));
    if (n.tag.local === "mask") reaches.set(id, reachOfSpread(maskSpread(n, ids)));
  }
  // Filter and mask regions are held to the widest reach among the masks and filters the drawing refers to.
  const referred = new Set([...text.matchAll(/url\(\s*["']?#([^"')\s]+)/g)].map((m) => m[1]!));
  const margin = Math.max(reach(0, 0), ...[...reaches].filter(([id]) => referred.has(id)).map(([, r]) => r));
  const within = (by: number) => ([x, y]: [number, number]) =>
    x >= vx - by - 1e-6 && y >= vy - by - 1e-6 && x <= vx + vw + by + 1e-6 && y <= vy + vh + by + 1e-6;
  const bounds = `the canvas and the paint's reach (${Math.round(margin * 10) / 10} pt)`;
  const palette = new Set((rules.palette ?? []).map((c) => c.toUpperCase()));

  // Filter and mask regions stay within the canvas and the paint's reach, and everything drawn under a mask within
  // the canvas and the reach of the innermost mask over it. resvg 2.6.2 cuts every layer to twice the canvas past
  // each side and draws a mask's filtered content in the masked layer's own pixels: a masked shape far past the
  // canvas aborts it (geom.rs:27) or cuts the mask short. A filtered element's layer is its own filter region, so
  // what lies under it is bounded by that region. The drawing is walked as resvg draws it: definitions (<defs>,
  // <symbol> and the rest) only where a <use> draws them, at the <use>'s place, under its masks and filters.
  interface Frame {
    m: Affine;
    /** The innermost mask over the element: its name, and how far its content reaches. */
    mask?: { name: string; reach: number };
    filtered: boolean;
    /** Inside a definition that no <use> draws here. */
    definition: boolean;
    /** Outside masks and clip paths, which hold luminance and geometry, not paint. */
    paint: boolean;
    /** The <use> elements it is drawn through, outermost first. */
    through: Node[];
    /** The stroke and its width, as the element inherits them. */
    stroke?: string;
    strokeWidth?: string;
  }
  const walk = (n: Node, parent: Frame, drawnByUse = false) => {
    const { tag } = n, p = tag.props;
    // Each element's own markup is read once, where the document puts it, not again wherever a <use> draws it.
    const first = parent.through.length === 0;
    let m = parent.m;
    if (p.transform !== undefined) {
      const t = transform(p.transform);
      if (!t) {
        if (first) say(`has a transform the lint cannot read: ${tag.text.slice(0, 80)}`);
      } else m = times(m, t);
    }
    // A <use> draws its element moved by its x and y, after its own transform.
    if (tag.local === "use") m = times(m, [1, 0, 0, 1, length(p.x), length(p.y)]);
    const masked = urlId(p.mask);
    const frame: Frame = {
      m,
      mask: uses(p.mask) ? { name: masked ?? p.mask!, reach: reaches.get(masked ?? "") ?? reach(0, 0) } : parent.mask,
      filtered: parent.filtered || uses(p.filter),
      definition: parent.definition || (DEFINITIONS.has(tag.local) && !(drawnByUse && tag.local === "symbol")),
      paint: parent.paint && tag.local !== "mask" && tag.local !== "clippath",
      through: parent.through,
      stroke: p.stroke ?? parent.stroke,
      strokeWidth: p["stroke-width"] ?? parent.strokeWidth,
    };
    if (tag.local === "filter" || tag.local === "mask") {
      if (first) {
        const units = tag.local === "filter" ? p.filterUnits : p.maskUnits;
        const box = [p.x, p.y, p.width, p.height];
        const [x, y, w, h] = box.map((s) => length(s));
        const corners: [number, number][] = [[x!, y!], [x! + w!, y!], [x!, y! + h!], [x! + w!, y! + h!]];
        if (units !== "userSpaceOnUse" || !box.every(isNumber) || !corners.map((c) => apply(m, c)).every(within(margin)))
          say(`${tag.local} ${p.id} needs an explicit userSpaceOnUse region within ${bounds}`);
        if (tag.local === "filter" && p["color-interpolation-filters"] !== "sRGB") say(`filter ${p.id} needs color-interpolation-filters="sRGB"`);
        if (tag.local === "mask" && p["color-interpolation"] !== "sRGB") say(`mask ${p.id} needs color-interpolation="sRGB"`);
      }
    } else if (frame.mask && !frame.filtered && !frame.definition) {
      const where = `the canvas and mask ${frame.mask.name}'s reach (${Math.round(frame.mask.reach * 10) / 10} pt)`;
      // A <use> is bounded by what it draws, walked below; one that draws nothing the lint can find is not.
      const placed = (tag.local === "use" ? (ids.has(hrefId(p) ?? "") ? [] : undefined) : geometry(tag))?.map((c) => apply(m, c));
      if (!placed || placed.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) say(`has a <${tag.local}> under a mask whose geometry the lint cannot bound: ${tag.text.slice(0, 80)}`);
      else if (!placed.every(within(frame.mask.reach))) say(`has a <${tag.local}> under a mask that reaches past ${where}: ${tag.text.slice(0, 80)}`);
    }

    if (rules.palette && frame.paint && first) {
      for (const key of COLOUR_ATTRS) {
        const value = p[key]?.trim();
        if (value === undefined || value === "none" || /^url\(\s*["']?#/.test(value)) continue;
        if (!/^#[0-9a-fA-F]{6}$/.test(value) || !palette.has(value.toUpperCase())) say(`colour ${value} is not in the species' palette`);
      }
    }
    // A stroked shape's line, as wide as it is drawn: its stroke-width (inherited, 1 by default) scaled by everything
    // that places it, a <use> included, held to one band at both its narrowest and its widest. A shape scaled unevenly
    // draws its line unevenly wide, which no band describes. Read where it is drawn, and where the document puts it.
    if (rules.palette && frame.paint && (!frame.definition || first) && SHAPES.has(tag.local) && uses(frame.stroke)) {
      const declared = frame.strokeWidth ?? "1", w = length(declared, NaN);
      const [least, most] = scales(m), [lo, hi] = [w * least, w * most];
      const held = (band: [number, number]) => inBand(lo, band, STROKE_EDGE_PT) && inBand(hi, band, STROKE_EDGE_PT);
      const scaled = Math.abs(least - 1) > 1e-9 || Math.abs(most - 1) > 1e-9;
      if (hi - lo > STROKE_EDGE_PT)
        say(`a stroked <${tag.local}> is scaled unevenly (${least.toFixed(3)} to ${most.toFixed(3)}), drawing its ${declared} pt line ${shown(lo)} to ${shown(hi)} pt wide; scale a stroked shape evenly`);
      else if (!Number.isFinite(w) || !(held(LIMITS.outer) || held(LIMITS.inner)))
        say(`a stroke ${declared} pt wide${scaled ? ` is drawn ${shown(lo)} pt wide by its transform,` : " is"} neither an outer line (1.2 to 1.8) nor an inner one (0.6 to 0.9)`);
    }

    for (const child of n.children) walk(child, frame);
    if (tag.local === "use") {
      const target = ids.get(hrefId(p) ?? "");
      if (!target) return;
      if (target.tag.local === "symbol" || target.tag.local === "svg") {
        say(`has a <use> of a <${target.tag.local}>, whose viewport cannot be bounded: ${tag.text.slice(0, 80)}`);
        return;
      }
      if (frame.through.includes(n) || frame.through.length >= USE_DEPTH) {
        say(`has a <use> that draws itself, or <use>s nested deeper than ${USE_DEPTH}: ${tag.text.slice(0, 80)}`);
        return;
      }
      walk(target, { ...frame, through: [...frame.through, n] }, true);
    }
  };
  const start: Frame = { m: IDENTITY, filtered: false, definition: false, paint: true, through: [] };
  for (const n of top) walk(n, start);

  const part = d.region.split("/")[0]!;
  for (const shape of d.meta?.shapes ?? []) {
    if (shape.nodes > LIMITS.nodes) say(`shape ${shape.name} has ${shape.nodes} hand nodes (at most ${LIMITS.nodes})`);
    if (!shape.outlined.length || rules.corners?.[part]) continue;
    // Fur spans are left out: a fur lock's tip may turn tighter than 4 pt where the sheet draws it so (Q29's default,
    // dog DECISIONS 213), and a fur span's own ends (where a lock rises from the base) count as fur, 1.5 pt either way.
    // Toe lobes (the dog's parts/paw.ts) are held to their own floor, LIMITS.lobePt, as the stubby-paws panel draws them (Q29).
    const pts = sample(shape.segs, 32);
    const total = arc([...pts, pts[0]!]).at(-1)!;
    const slack = 1.5 / total;
    const lobes = (shape as ShapeMeta & { lobes?: [number, number][] }).lobes ?? [];
    const outlinedAt = (f: number) => shape.outlined.some(([a, b]) => onSpan(f, a, b));
    const inFur = (f: number) => shape.fur.some(([a, b]) => onSpan(f, (a - slack + 1) % 1, (b + slack) % 1));
    const inLobe = (f: number) => lobes.some(([a, b]) => onSpan(f, a, b));
    const { convex } = minRadius(shape.segs, (f) => outlinedAt(f) && !inFur(f) && !inLobe(f));
    if (convex.r < LIMITS.cornerPt)
      say(`shape ${shape.name} turns a ${convex.r.toFixed(2)} pt convex corner at (${convex.at.map((n) => n.toFixed(1)).join(", ")}) on an outlined edge (at least ${LIMITS.cornerPt} pt outside fur)`);
    if (lobes.length) {
      const lobe = minRadius(shape.segs, (f) => outlinedAt(f) && !inFur(f) && inLobe(f)).convex;
      if (lobe.r < LIMITS.lobePt)
        say(`shape ${shape.name} turns a ${lobe.r.toFixed(2)} pt convex corner at (${lobe.at.map((n) => n.toFixed(1)).join(", ")}) on a toe lobe (at least ${LIMITS.lobePt} pt)`);
    }
  }
  // A line meta comes from what line.ts draws (strokeOf, taperedStroke, ribbons, innerLine), with the widths it draws.
  for (const line of (d.meta?.lines ?? []) as (Omit<DrawnLine, "drawn"> & Partial<DrawnLine>)[]) {
    const band = line.kind === "outer" ? LIMITS.outer : LIMITS.inner;
    if (!line.drawn) say(`${line.kind} line ${line.width} pt in ${line.where} reports no drawn widths; its meta comes from what line.ts draws`);
    if (!inBand(line.width, band)) say(`${line.kind} line ${line.width} pt in ${line.where} is outside ${band[0]} to ${band[1]} pt`);
    // What the wobble and the taper actually draw, away from the tapered ends, holds to the same band.
    else if (line.drawn && !(inBand(line.drawn[0], band) && inBand(line.drawn[1], band)))
      say(`${line.kind} line ${line.width} pt in ${line.where} is drawn ${line.drawn.map(shown).join(" to ")} pt wide, outside ${band[0]} to ${band[1]} pt`);
  }
  // A definition drawn by several <use>s can break a rule the same way at each.
  return [...new Set(problems)];
}

/** The length two spans of a closed path overlap by, as a share of it (each from a to b, wrapping when b < a). */
function overlap([a, b]: [number, number], [c, d]: [number, number]): number {
  const pieces = (from: number, to: number): [number, number][] => (from <= to ? [[from, to]] : [[from, 1], [0, to]]);
  let sum = 0;
  for (const [p, q] of pieces(a, b)) for (const [r, s] of pieces(c, d)) sum += Math.max(0, Math.min(q, s) - Math.max(p, r));
  return sum;
}
/** How far apart two places on a closed path are, as a share of it, the short way round. */
const apart = (f: number, g: number) => Math.min(Math.abs(f - g), 1 - Math.abs(f - g));
/** How far on from share f a closed path runs to reach share g, as a share. */
const ahead = (f: number, g: number) => (((g - f) % 1) + 1) % 1;
/** How much of a closed path a span covers, as a share: the whole of it from a share to itself, or from 0 to 1, as spanPoints reads them. */
const extent = (from: number, to: number) => (from === to || (from === 0 && to === 1) ? 1 : ahead(from, to));
const listed = (ns: number[]) => (ns.length > 1 ? `${ns.slice(0, -1).join(", ")} and ${ns.at(-1)}` : `${ns[0]}`);
const at1 = (p: P) => `(${p.map((n) => n.toFixed(1)).join(", ")})`;

/** Whether a span's line is faded by its part's feather at share f of its shape. */
const fadedAt = (s: SpanMeta, f: number) => (s.faded ?? []).some(([a, b]) => onSpan(((f % 1) + 1) % 1, a, b));

/** A shape of a composited view, as the line gate reads it. */
interface Placed {
  meta: ShapeMeta;
  part: string;
  region: string;
  key: string;
  /** The key of its mirror about x = 0: the key a right-facing view's spans still carry (SpanMeta.shape). */
  mirrorKey: string;
  /** Where it is painted: its drawing's place in the draw order, then its own place in the drawing. */
  layer: [number, number];
  /** Whether it hides what lies under it: painted at full alpha, and not a second report of a shape painted lower (head.line reports the head's outline for its lines). */
  covers: boolean;
  clipTo?: string;
  /** Its outline, measured as geom.ts measures shares (48 points a cubic): the points, how far along each lies and the whole length, in points. */
  pts: P[];
  at: number[];
  total: number;
  box: [number, number, number, number];
  /** Which way round its outline runs: geom.ts's area of it is positive (the dog's parts/lines.ts then takes [t1, -t0] as outward). */
  cw: boolean;
}

/** A lit span placed on its shape in a composited view. */
interface Placing {
  line: Spanned;
  span: SpanMeta;
  region: string;
  shape?: Placed;
  /** Where its line is painted: over its drawing's shapes up to its own shape. */
  layer: [number, number];
  /** Where it is drawn at full width, as shares of its shape, from and to (null when it never is). */
  full: [number, number] | null;
  /** The same span on the same shape as one placed before it: a marking's copy of its part's line (litMarking), drawn again inside the marking's soft edge, held once, as its part's. */
  copy?: boolean;
}

const after = (a: [number, number], b: [number, number]) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

function placed(meta: ShapeMeta, part: string, region: string, layer: [number, number], covers: boolean, clipTo?: string): Placed {
  const pts = sample(meta.segs, 48);
  const a = arc([...pts, pts[0]!]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) (x0 = Math.min(x0, x), y0 = Math.min(y0, y), x1 = Math.max(x1, x), y1 = Math.max(y1, y));
  const mirror = meta.segs.map((seg) => seg.map(([x, y]): P => [-x, y]) as Seg);
  return { meta, part, region, key: shapeKey(meta.segs), mirrorKey: shapeKey(mirror), layer, covers, clipTo, pts, at: a.slice(0, -1), total: a.at(-1)!, box: [x0, y0, x1, y1], cw: area(pts) > 0 };
}

/** The way into a placed shape at share f of its outline, a unit vector: the side of the edge a part's lit line is drawn on, inside its clip (the dog's parts/lines.ts). */
function inward(s: Placed, f: number): P {
  const d = 0.1 / s.total, a = pointAt(s, f - d), b = pointAt(s, f + d);
  const t: P = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(t[0], t[1]) || 1;
  // lines.ts's outward normal is [t1, -t0] on a shape whose area is positive, [-t1, t0] on one whose area is not.
  return s.cw ? [-t[1] / l, t[0] / l] : [t[1] / l, -t[0] / l];
}

/** The point at share f of a placed shape's outline. */
function pointAt(s: Placed, f: number): P {
  const d = ((((f % 1) + 1) % 1) * s.total);
  let lo = 0, hi = s.at.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s.at[mid]! <= d) lo = mid;
    else hi = mid - 1;
  }
  const p = s.pts[lo]!, q = s.pts[(lo + 1) % s.pts.length]!, next = lo + 1 < s.at.length ? s.at[lo + 1]! : s.total;
  const t = next > s.at[lo]! ? (d - s.at[lo]!) / (next - s.at[lo]!) : 0;
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

/** How far inside a shape's outline a point lies, in points; negative outside it. */
function insideBy(q: P, s: Placed): number {
  const [x0, y0, x1, y1] = s.box;
  if (q[0] < x0 || q[0] > x1 || q[1] < y0 || q[1] > y1) return -1;
  let inside = false, nearest = Infinity;
  for (let i = 0, j = s.pts.length - 1; i < s.pts.length; j = i++) {
    const a = s.pts[i]!, b = s.pts[j]!;
    if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
    nearest = Math.min(nearest, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
  }
  return inside ? nearest : -nearest;
}

/**
 * How much of a line shows at a point of it in the composite (dog DECISIONS 264): none (every part of it there lies under
 * a part drawn after it), some (its edge shows, but less than half its width), or enough to line the edge (half its
 * width or more).
 */
const Seen = { None: 0, Some: 1, Lines: 2 } as const;
type Seen = (typeof Seen)[keyof typeof Seen];

/** Points along every lit line's full-width run, in 1 pt cells, to find the lines near a place, each with how much of it shows. */
class Lined {
  private cells = new Map<string, { p: P; line: number; seen: Seen }[]>();
  add(p: P, line: number, seen: Seen) {
    const k = `${Math.floor(p[0])},${Math.floor(p[1])}`;
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = []));
    c.push({ p, line, seen });
  }
  /** Whether a full-width point of a line other than those `skip` refuses, showing at least `least`, lies within `r` (at most 1 pt) of q. */
  near(q: P, r: number, skip: (line: number) => boolean, least: Seen = Seen.None): boolean {
    const cx = Math.floor(q[0]), cy = Math.floor(q[1]);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cy - 1; j <= cy + 1; j++) {
        for (const e of this.cells.get(`${i},${j}`) ?? []) if (!skip(e.line) && e.seen >= least && Math.hypot(e.p[0] - q[0], e.p[1] - q[1]) <= r) return true;
      }
    }
    return false;
  }
}
/** How far apart the gate's samples along an edge lie, in points. */
const STEP = 0.25;

/**
 * The line gate's problems (GATE) with every view that has a gated drawing: the view is composited at rest (and with
 * each state a gated drawing draws, that state's drawings in place of the rest's), each part's shapes in the rig's draw
 * order, and every lit span of a gated drawing is held to the gate, with the whole outline of every shape one runs on.
 */
export function gateProblems(drawings: Drawing[], rules: Pick<LintRules, "rig" | "decisions" | "shown"> = {}): string[] {
  const { rig, decisions, shown: onlyShown = false } = rules;
  const problems: string[] = [];
  // What is wrong with a cite, if anything: it must name a current entry.
  const citeFault = (n: number) => !decisions ? `cites ${n}, and the lint was given no DECISIONS entries to check it against (LintRules.decisions)`
    : !decisions.entries.includes(n) ? `cites ${n}, which is no DECISIONS entry`
    : decisions.replaced[n] ? `cites ${n}, which ${listed(decisions.replaced[n]!)} ${decisions.replaced[n]!.length > 1 ? "replace" : "replaces"}: a cite stands on a current entry` : undefined;
  const cited = (s: SpanMeta | undefined) => !!s?.cites && !citeFault(s.cites);
  const parse = (d: Drawing) => {
    const [part, rest = ""] = d.region.split("/");
    const [view, state] = rest.split(":");
    return { part: part!, view: view!, state };
  };
  const gated = (d: Drawing) => ((d.meta?.lines ?? []) as Spanned[]).some((l) => l.span?.gate);
  const composites = new Map<string, { view: string; state?: string }>();
  for (const d of drawings) {
    if (!gated(d)) continue;
    const { view, state } = parse(d);
    composites.set(`${view}:${state ?? ""}`, { view, state });
  }
  for (const { view, state } of composites.values()) {
    const mine = drawings.filter((d) => parse(d).view === view);
    const own = mine.filter((d) => gated(d) && parse(d).state === state);
    const order = rig?.drawOrder[view]?.flatMap((p) => (p === "@head" ? rig.drawOrder[`head.${view}`] ?? [] : [p]));
    if (!order) {
      for (const d of own) problems.push(`${d.region}: the line gate composites ${view} in the rig's draw order, and the lint was given none (LintRules.rig)`);
      continue;
    }
    for (const d of own) if (!order.includes(parse(d).part)) problems.push(`${d.region}: the line gate cannot place it: ${parse(d).part} is not in ${view}'s draw order`);
    const partOf = (name: string) => rig!.parts.find((p) => p.name === name);
    // Each part's drawing in this composite: the state's own where it has one, else its rest (or its default state).
    const pick = (part: string) => {
      const of = mine.filter((d) => parse(d).part === part);
      return (state !== undefined ? of.find((d) => parse(d).state === state) : undefined) ?? of.find((d) => parse(d).state === undefined) ??
        of.find((d) => parse(d).state === partOf(part)?.defaultState);
    };
    const layers = order.map((part, z) => ({ part, z, d: pick(part) })).filter((x) => x.d);
    const shapes: Placed[] = [];
    for (const { part, z, d } of layers) {
      const info = partOf(part);
      (d!.meta?.shapes ?? []).forEach((m, i) => {
        const key = shapeKey(m.segs);
        const covers = (info?.alpha ?? 1) >= 1 && !shapes.some((s) => s.key === key);
        shapes.push(placed(m, part, d!.region, [z, i], covers, info?.clipTo));
      });
    }
    const find = (key: string) => shapes.find((s) => s.key === key) ?? shapes.find((s) => s.mirrorKey === key);
    // A point lies under a part drawn after `above` when it lies more than `by` inside it (and inside its clip).
    const covered = (q: P, above: [number, number], by = GATE.coverPt) => shapes.some((c) => c.covers && after(c.layer, above) && insideBy(q, c) > by &&
      (!c.clipTo || shapes.some((m) => m.part === c.clipTo && insideBy(q, m) > by)));
    // Every lit span of the composite, placed on its shape, with where it is drawn at full width.
    const lines: Placing[] = [];
    for (const { z, d } of layers) {
      const ownShapes = d!.meta?.shapes ?? [];
      for (const line of (d!.meta?.lines ?? []) as Spanned[]) {
        if (!line.span) continue;
        const span = line.span, shape = find(span.shape);
        const mine = ownShapes.findIndex((m) => [shapeKey(m.segs), shapeKey(m.segs.map((seg) => seg.map(([x, y]): P => [-x, y]) as Seg))].includes(span.shape));
        let full: [number, number] | null = null;
        if (shape) {
          const length = extent(span.from, span.to) * shape.total;
          if (length > span.taper[0] + span.taper[1] + 1e-9) full = [(span.from + span.taper[0] / shape.total) % 1, (span.to - span.taper[1] / shape.total + 1) % 1];
        }
        const copy = lines.some((o) => o.span.shape === span.shape && o.span.from === span.from && o.span.to === span.to && o.region !== d!.region);
        lines.push({ line, span, region: d!.region, shape, layer: [z, mine >= 0 ? mine : ownShapes.length], full, ...(copy ? { copy } : {}) });
      }
    }
    // A typed line (line.ts's ribbons, a part's typed outline) carries no span, but its shape reports where it runs
    // (ShapeMeta.outlined): every such run that is no lit span's counts as lined along its whole length, its own
    // taper unmeasured (the nose's and the lip's edges on head.line, the collar's outline).
    // A shape reported twice (head.line reports the head's outline for its lines) is one outline: its runs are read by
    // its key, and a lit span on either report is that outline's.
    const typed = new Map<string, [number, number][]>();
    for (const sh of shapes) {
      const own = lines.filter((l) => l.span.shape === sh.key || l.span.shape === sh.mirrorKey);
      const runs = (sh.meta.outlined ?? []).filter(([a, b]) => !own.some((l) => Math.abs(l.span.from - a) < 1e-6 && Math.abs(l.span.to - b) < 1e-6));
      if (runs.length) typed.set(sh.key, [...(typed.get(sh.key) ?? []), ...runs]);
    }
    // How much of a lit line shows at share f of its shape, as composited (LintRules.shown, DECISIONS 264): a part's lit
    // line is drawn on the inside of its edge (lines.ts), so half of it or more shows where the middle of its ribbon,
    // half its width in from the edge, lies under no part drawn after the line, and some of it where its edge does.
    // Without `shown`, every line counts wherever it is drawn, as the first gate counted it (219).
    const seen = (l: Placing, f: number): Seen => {
      if (!onlyShown) return Seen.Lines;
      const q = pointAt(l.shape!, f), n = inward(l.shape!, f), half = l.line.width / 2;
      return !covered([q[0] + n[0] * half, q[1] + n[1] * half], l.layer, 0) ? Seen.Lines : !covered(q, l.layer) ? Seen.Some : Seen.None;
    };
    const shows = (l: Placing, f: number) => seen(l, f) === Seen.Lines;
    // Every line's full-width points, each with the shape it runs on: the lit spans' (by their index) and the typed lines',
    // each with how much of it shows. A line that runs on under a later part is drawn, but what shows of the composite
    // there is that part, so it lines nothing of that part's edge: the front's temple.L line ran on along the head's side,
    // its ribbon under head.base, within 0.75 pt of the head's edge, and was counted as lining it, while the head's side
    // showed bare between the temple's line and the cheek's (DECISIONS 264). A typed line is drawn on its shape's own
    // edge, and shows where that does.
    const lined = new Lined();
    const owner: (Placed | undefined)[] = lines.map((l) => l.shape);
    lines.forEach((l, k) => {
      if (!l.shape || !l.full) return;
      const length = extent(l.full[0], l.full[1]) * l.shape.total;
      for (let s = 0; s <= length + 1e-9; s += STEP) {
        const f = l.full[0] + s / l.shape.total;
        if (fadedAt(l.span, f)) continue;
        lined.add(pointAt(l.shape, f), k, seen(l, f));
      }
    });
    for (const [key, runs] of typed) {
      const sh = shapes.find((x) => x.key === key)!;
      for (const [a, b] of runs) {
        const id = owner.push(sh) - 1, length = extent(a, b) * sh.total;
        for (let s = 0; s <= length + 1e-9; s += STEP) {
          const q = pointAt(sh, a + s / sh.total);
          lined.add(q, id, onlyShown && covered(q, sh.layer) ? Seen.None : Seen.Lines);
        }
      }
    }
    const named = (l: Placing) => `the lit span on ${l.line.where} from ${l.span.from.toFixed(3)} to ${l.span.to.toFixed(3)}`;
    const which = ["start", "end"];
    const subjects = new Map<Placed, string>();

    lines.forEach((l, k) => {
      if (!l.span.gate || l.copy || l.region.split("/")[1]?.split(":")[1] !== state) return;
      const s = l.span;
      if (!l.shape) {
        problems.push(`${l.region}: ${named(l)} runs on a shape (${s.shape}) that no drawing of ${view} reports, so the line gate cannot place it`);
        return;
      }
      if (!subjects.has(l.shape)) subjects.set(l.shape, l.region);
      // A current cite lets through what the sheet may draw so: a long taper, a line ending in the middle of fur, a bare
      // stretch as long as the span says. A join with no line to meet, or an end run on under no part, is never the
      // sheet's: those are held whatever the span cites. Any other cite fails, and the span is held as if it cited nothing.
      if (s.cites && citeFault(s.cites)) problems.push(`${l.region}: ${named(l)} ${citeFault(s.cites)}`);
      const waived = cited(s);
      const shape = l.shape;
      s.ends.forEach((e, i) => {
        const f = i === 0 ? s.from : s.to;
        const p = pointAt(shape, f);
        // A taper is held where it shows: one that lies wholly under parts drawn over its line (an ear's inner edge behind the face) is not seen.
        const hidden = () => {
          const dir = i === 0 ? 1 : -1;
          for (let d = 0; d <= s.taper[i]! + 1e-9; d += STEP) if (!covered(pointAt(shape, f + (dir * d) / shape.total), l.layer)) return false;
          return true;
        };
        if ((e === "taper" || e === "free") && !waived && s.taper[i]! > GATE.taperPt + 1e-6 && !hidden())
          problems.push(`${l.region}: ${named(l)} tapers over ${s.taper[i]!.toFixed(2)} pt at its ${which[i]} (at most ${GATE.taperPt} pt, unless it cites a current DECISIONS entry)`);
        if (e === "join") {
          // Its own other end, on a ring drawn whole, or another line at full width.
          // Where the joined end shows, the line it meets must show there too, if only its edge (a line that comes out
          // from under a part at a crossing shows its edge first): a line wholly under a later part meets nothing.
          const ring = s.ends[1 - i] === "join" && apart(s.from, s.to) * shape.total <= GATE.joinPt;
          if (!ring && !lined.near(p, GATE.joinPt, (m) => m === k, seen(l, f) === Seen.None ? Seen.None : Seen.Some))
            problems.push(`${l.region}: ${named(l)} joins no line at its ${which[i]}: no other lit line runs at full width within ${GATE.joinPt} pt of ${at1(p)}`);
        }
        if (e === "under") {
          // From its drawn end back over its fade and at least underPt at full width, it lies under a part drawn over its line.
          const back = s.taper[i]! + GATE.underPt, dir = i === 0 ? 1 : -1;
          for (let d = 0; d <= back + 1e-9; d += STEP) {
            const q = pointAt(shape, f + (dir * d) / shape.total);
            if (!covered(q, l.layer)) {
              problems.push(`${l.region}: ${named(l)} runs on under no part at its ${which[i]}: ${at1(q)}, ${d.toFixed(2)} pt in from its end, lies under no part drawn over its line (its last ${back.toFixed(1)} pt must)`);
              break;
            }
          }
        }
        if ((e === "taper" || e === "free") && !waived) {
          const mid = shape.meta.fur.some(([a, b]) => onSpan(f, a, b) && apart(f, a) * shape.total > GATE.endPt && apart(f, b) * shape.total > GATE.endPt);
          const nearEnd = lines.some((m, j) => j !== k && m.shape && [m.span.from, m.span.to].some((g) => {
            const q = pointAt(m.shape!, g);
            return Math.hypot(q[0] - p[0], q[1] - p[1]) <= GATE.endPt;
          }));
          const nearPart = [-1, 1].some((sign) => covered(pointAt(shape, f + (sign * GATE.endPt) / shape.total), shape.layer));
          if (mid && !nearEnd && !nearPart)
            problems.push(`${l.region}: ${named(l)} ends in the middle of fur at its ${which[i]}, more than ${GATE.endPt} pt from another line or a part's edge`);
        }
      });
    });

    for (const [shape, region] of subjects) {
      const on = lines.map((l, k) => ({ l, k })).filter(({ l }) => l.shape === shape && !l.copy);
      const drawnOn = lines.filter((l) => l.shape === shape);
      // A fur edge is one span.
      for (const fur of shape.meta.fur) {
        const over = on.filter(({ l }) => overlap([l.span.from, l.span.to], fur) * shape.total > 1);
        if (over.length > 1 && !over.some(({ l }) => cited(l.span)))
          problems.push(`${region}: the fur edge from ${fur[0].toFixed(3)} to ${fur[1].toFixed(3)} of ${shape.meta.name} is drawn as ${over.length} spans (one span per fur edge)`);
      }
      // Every visible stretch of its outline is lined at full width, by its own spans or another shape's line beside it.
      const n = Math.max(1, Math.round(shape.total / STEP)), step = shape.total / n;
      const bare = Array.from({ length: n }, (_, i) => {
        const f = ((i + 0.5) * step) / shape.total, q = pointAt(shape, f);
        // Its own line where it shows: the span's, or a marking's copy of it drawn again over the marking (litMarking).
        if (drawnOn.some((l) => l.full && (extent(l.full[0], l.full[1]) === 1 || onSpan(f, l.full[0], l.full[1])) && !fadedAt(l.span, f) && shows(l, f))) return false;
        if ((typed.get(shape.key) ?? []).some(([a, b]) => extent(a, b) === 1 || onSpan(f, a, b))) return false;
        if (lined.near(q, GATE.linedPt, (m) => owner[m]?.key === shape.key, Seen.Lines)) return false;
        return !covered(q, shape.layer);
      });
      // The bare runs, walked round from a sample that is not bare (the whole outline, when none is).
      const first = bare.findIndex((b) => !b);
      const runs: [number, number][] = [];
      if (first < 0) runs.push([0, n]);
      for (let i = 1; first >= 0 && i < n; i++) {
        if (!bare[(first + i) % n]) continue;
        let j = i;
        while (j + 1 < n && bare[(first + j + 1) % n]) j++;
        runs.push([(first + i) % n, j - i + 1]);
        i = j;
      }
      for (const [start, count] of runs) {
        const length = count * step;
        if (length <= GATE.thinPt + 1e-6) continue;
        const f0 = (start * step) / shape.total, f1 = (((start + count) % n) * step) / shape.total;
        // The spans on either side of the stretch: the one whose end lies nearest back from the stretch's end (its taper
        // or fade, when it has one, lies in the stretch) and the one whose start lies nearest on from the stretch's start.
        const before = on.map(({ l }) => l).sort((a, b) => ahead(a.span.to, f1) - ahead(b.span.to, f1))[0];
        const next = on.map(({ l }) => l).sort((a, b) => ahead(f0, a.span.from) - ahead(f0, b.span.from))[0];
        // A citing span beside it lets through its own end's taper and as much as it says the sheet leaves unlined
        // there, and no more.
        const waived = (cited(before?.span) ? before!.span.taper[1] + (before!.span.bare?.[1] ?? 0) : 0) +
          (cited(next?.span) ? next!.span.taper[0] + (next!.span.bare?.[0] ?? 0) : 0);
        if (length <= waived + GATE.thinPt + 1e-6) continue;
        problems.push(`${region}: the edge of ${shape.meta.name} shows ${length.toFixed(2)} pt below full line width from ${at1(pointAt(shape, f0))} to ${at1(pointAt(shape, f1))}` +
          `${before ? `, after ${named(before)}` : ""}${next && count < n ? `, before ${named(next)}` : ""} (at most ${GATE.thinPt} pt` +
          `${waived > 0 ? ` past the ${waived.toFixed(2)} pt its cite lets through` : ""}: one line at full width along each visible edge, unless a span beside it cites a current DECISIONS entry and says how far the sheet leaves it unlined)`);
      }
    }
  }
  return [...new Set(problems)];
}

/** Every problem with a set of drawings: each drawing's own, and the line gate's on each view a lane has opted into it. */
export function lint(drawings: Drawing[], rules: LintRules = {}): string[] {
  return [...drawings.flatMap((d) => lintDrawing(d, rules)), ...gateProblems(drawings, rules)];
}
