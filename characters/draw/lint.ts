// The drawing lint (build time only): the build fails on any drawing that
// breaks the art rules it can check (spec section 5b, Art rules) or that resvg
// may draw wrongly or not at all. It reads the SVG as resvg will: attributes in
// either quote, character references decoded, style declarations as
// attributes; markup it cannot read fails rather than slipping past.
import type { Drawing } from "../build/atlas.ts";
import { arc, minRadius, onSpan, sample } from "./geom.ts";
import type { DrawnLine } from "./line.ts";

export const LIMITS = {
  /** Hand nodes in one shape: 8 to 20 is the aim. */
  nodes: 24,
  /** Outer lines, in points (spec L506). */
  outer: [1.2, 1.8] as [number, number],
  /** Inner lines, in points. */
  inner: [0.6, 0.9] as [number, number],
  /** No convex corner tighter than this on an outlined edge, outside fur (spec L510). */
  cornerPt: 4,
};

export interface LintRules {
  /** Every colour a drawing may paint (#RRGGBB): the species' palette.ts. */
  palette?: string[];
  /** Parts allowed a convex corner tighter than 4 pt on an outlined edge, each with its reason. */
  corners?: Record<string, string>;
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
    // A fur span's own ends (where a lock rises from the base) count as fur, 1.5 pt either way.
    const pts = sample(shape.segs, 32);
    const total = arc([...pts, pts[0]!]).at(-1)!;
    const slack = 1.5 / total;
    const keep = (f: number) =>
      shape.outlined.some(([a, b]) => onSpan(f, a, b)) && !shape.fur.some(([a, b]) => onSpan(f, (a - slack + 1) % 1, (b + slack) % 1));
    const { convex } = minRadius(shape.segs, keep);
    if (convex.r < LIMITS.cornerPt)
      say(`shape ${shape.name} turns a ${convex.r.toFixed(2)} pt convex corner at (${convex.at.map((n) => n.toFixed(1)).join(", ")}) on an outlined edge (at least ${LIMITS.cornerPt} pt outside fur)`);
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

/** Every problem with a set of drawings. */
export function lint(drawings: Drawing[], rules: LintRules = {}): string[] {
  return drawings.flatMap((d) => lintDrawing(d, rules));
}
