// The drawing lint (build time only): the build fails on any drawing that
// breaks the art rules it can check (spec section 5b, Art rules) or that resvg
// may draw wrongly or not at all. It reads the SVG as resvg will: attributes in
// either quote, character references decoded, style declarations as
// attributes; markup it cannot read fails rather than slipping past.
import type { Drawing } from "../build/atlas.ts";
import { arc, minRadius, onSpan, sample } from "./geom.ts";

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
 * How far a part's filters and masks may reach past its canvas, in points:
 * paint.ts's rule (reachOf), three σ of the widest blur plus how far an erode
 * and a move shift a shape, and never less than 2 pt.
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
const inBand = (w: number, [lo, hi]: [number, number]) => w >= lo - 1e-9 && w <= hi + 1e-9;
/** A reference to an element of the same drawing: the only kind a part may hold. */
const SAME_DOCUMENT = /^#[A-Za-z_][\w.:-]*$/;
const uses = (value: string | undefined) => value !== undefined && value.trim() !== "none";

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

  // How far this drawing's paint reaches: its widest blur, plus its widest erode and its longest move inside a
  // mask or a filter.
  let sd = 0, erode = 0, move = 0;
  const shaping: boolean[] = [];
  for (const tag of tags) {
    if (tag.close) {
      shaping.pop();
      continue;
    }
    const p = tag.props;
    const inside = (shaping.at(-1) ?? false) || tag.local === "mask" || tag.local === "filter";
    if (tag.local === "fegaussianblur") sd = Math.max(sd, most(p.stdDeviation));
    if (tag.local === "femorphology") erode = Math.max(erode, most(p.radius));
    if (tag.local === "feoffset") move = Math.max(move, Math.hypot(length(p.dx), length(p.dy)) || 0);
    const m = inside && p.transform ? transform(p.transform) : undefined;
    if (m) move = Math.max(move, Math.hypot(m[4], m[5]));
    if (!tag.empty) shaping.push(inside);
  }
  const margin = reach(sd, erode + move);
  const within = ([x, y]: [number, number]) =>
    x >= vx - margin - 1e-6 && y >= vy - margin - 1e-6 && x <= vx + vw + margin + 1e-6 && y <= vy + vh + margin + 1e-6;
  const bounds = `the canvas and the paint's reach (${Math.round(margin * 10) / 10} pt)`;
  const palette = new Set((rules.palette ?? []).map((c) => c.toUpperCase()));

  // Filter and mask regions, and everything drawn under a mask, stay within the canvas and the paint's reach.
  // resvg 2.6.2 cuts every layer to twice the canvas past each side and draws a mask's filtered content in the
  // masked layer's own pixels: a masked shape far past the canvas aborts it (geom.rs:27) or cuts the mask short.
  // A filtered element's layer is its own filter region, so what lies under it is bounded by that region.
  interface Frame {
    m: Affine;
    masked: boolean;
    filtered: boolean;
    definition: boolean;
    /** Outside masks and clip paths, which hold luminance and geometry, not paint. */
    paint: boolean;
  }
  const stack: Frame[] = [];
  for (const tag of tags) {
    if (tag.close) {
      stack.pop();
      continue;
    }
    const p = tag.props;
    const parent: Frame = stack.at(-1) ?? { m: IDENTITY, masked: false, filtered: false, definition: false, paint: true };
    let m = parent.m;
    if (p.transform !== undefined) {
      const t = transform(p.transform);
      if (!t) say(`has a transform the lint cannot read: ${tag.text.slice(0, 80)}`);
      else m = times(m, t);
    }
    const frame: Frame = {
      m,
      masked: parent.masked || uses(p.mask),
      filtered: parent.filtered || uses(p.filter),
      definition: parent.definition || DEFINITIONS.has(tag.local),
      paint: parent.paint && tag.local !== "mask" && tag.local !== "clippath",
    };
    if (!tag.empty) stack.push(frame);
    if (tag.local === "filter" || tag.local === "mask") {
      const units = tag.local === "filter" ? p.filterUnits : p.maskUnits;
      const box = [p.x, p.y, p.width, p.height];
      const [x, y, w, h] = box.map((s) => length(s));
      const corners: [number, number][] = [[x!, y!], [x! + w!, y!], [x!, y! + h!], [x! + w!, y! + h!]];
      if (units !== "userSpaceOnUse" || !box.every(isNumber) || !corners.map((c) => apply(m, c)).every(within))
        say(`${tag.local} ${p.id} needs an explicit userSpaceOnUse region within ${bounds}`);
      if (tag.local === "filter" && p["color-interpolation-filters"] !== "sRGB") say(`filter ${p.id} needs color-interpolation-filters="sRGB"`);
      if (tag.local === "mask" && p["color-interpolation"] !== "sRGB") say(`mask ${p.id} needs color-interpolation="sRGB"`);
    } else if (frame.masked && !frame.filtered && !frame.definition) {
      const points = geometry(tag);
      if (!points || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) say(`has a <${tag.local}> under a mask whose geometry the lint cannot bound: ${tag.text.slice(0, 80)}`);
      else if (!points.map((c) => apply(m, c)).every(within)) say(`has a <${tag.local}> under a mask that reaches past ${bounds}: ${tag.text.slice(0, 80)}`);
    }

    if (rules.palette && frame.paint) {
      for (const key of COLOUR_ATTRS) {
        const value = p[key]?.trim();
        if (value === undefined || value === "none" || /^url\(\s*["']?#/.test(value)) continue;
        if (!/^#[0-9a-fA-F]{6}$/.test(value) || !palette.has(value.toUpperCase())) say(`colour ${value} is not in the species' palette`);
      }
      const w = p["stroke-width"];
      if (w !== undefined && !inBand(length(w, NaN), LIMITS.outer) && !inBand(length(w, NaN), LIMITS.inner))
        say(`a stroke ${w} pt wide is neither an outer line (1.2 to 1.8) nor an inner one (0.6 to 0.9)`);
    }
  }

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
  for (const line of d.meta?.lines ?? []) {
    const band = line.kind === "outer" ? LIMITS.outer : LIMITS.inner;
    if (!inBand(line.width, band)) say(`${line.kind} line ${line.width} pt in ${line.where} is outside ${band[0]} to ${band[1]} pt`);
  }
  return problems;
}

/** Every problem with a set of drawings. */
export function lint(drawings: Drawing[], rules: LintRules = {}): string[] {
  return drawings.flatMap((d) => lintDrawing(d, rules));
}
