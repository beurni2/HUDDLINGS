// The Animation Lab's engine room: loads a built character package, plays its
// clips on the deterministic clock and draws them with the WebGL renderer. The
// render scripts drive it through window.lab; the Lab's controls come later.
import type { AtlasSet, Clip, Rig } from "../src/format.ts";
import { compile, drawList, type CompiledRig, type DrawItem } from "../src/rig.ts";
import { Player } from "../src/player.ts";
import { chooseSet, CONTEXT_ATTRIBUTES, Renderer, type Stage } from "../src/renderer.ts";
import { hex, idColour, recolour, type IdRect } from "./ids.ts";

interface Loaded {
  rig: CompiledRig;
  clips: Clip[];
  set: AtlasSet;
}

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
}

async function image(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

function base64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

class Lab {
  private canvas = document.getElementById("stage") as HTMLCanvasElement;
  private renderer: Renderer | undefined;
  private loaded: Loaded | undefined;
  private player: Player | undefined;
  private pages: HTMLImageElement[] = [];
  /** The ID pass's own renderer, holding the recoloured pages, and its nearest sampler. */
  private ids: { renderer: Renderer; sampler: WebGLSampler; current: boolean } | undefined;
  /** The still's frame, posed by still() and drawn by drawStill(). */
  private held: DrawItem[] = [];
  private stage: Stage = { x: 200, y: 370, pixelsPerPoint: 2 };
  private background: [number, number, number] = [1, 1, 1];

  /** Loads the package at base (a folder URL) for a canvas size and a stage; picks the atlas set the size calls for. */
  async load(base: string, options: { width: number; height: number; stage: Stage; sizeShare?: number; set?: string; background?: [number, number, number] }) {
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    const gl = this.canvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
    if (!gl) throw new Error("no WebGL2");
    // One renderer per canvas: loading again replaces its pages instead of leaking them.
    this.renderer ??= new Renderer(gl);
    this.stage = options.stage;
    if (options.background) this.background = options.background;
    const manifest = await json<{ files: Record<string, string> }>(`${base}/package.json`);
    const rig = await json<Rig>(`${base}/rig.json`);
    const atlas = await json<{ sets: AtlasSet[] }>(`${base}/atlas.json`);
    const clipFiles = Object.keys(manifest.files).filter((f) => f.startsWith("clips/"));
    const clips = await Promise.all(clipFiles.map((f) => json<Clip>(`${base}/${f}`)));
    const set = options.set
      ? atlas.sets.find((s) => s.name === options.set)!
      : chooseSet(atlas.sets, options.sizeShare ?? 1, options.stage.pixelsPerPoint);
    this.pages = await Promise.all(set.pages.map((p) => image(`${base}/${p.file}`)));
    this.renderer.loadPages(this.pages);
    if (this.ids) this.ids.current = false;
    this.loaded = { rig: compile(rig), clips, set };
    this.player = new Player(this.loaded.rig, clips);
    document.getElementById("status")!.textContent = `${rig.species}: ${clips.length} clips, set ${set.name}`;
    return { set: set.name, clips: clips.map((c) => ({ name: c.name, lengthMs: c.lengthMs })) };
  }

  play(clip: string, t: number, blendMs?: number) {
    this.player!.play(clip, t, blendMs);
  }

  /** Advances to time t (seconds), draws the frame, and returns its events and state. */
  frame(t: number) {
    const { rig, set } = this.loaded!;
    const frame = this.player!.advanceTo(t);
    this.renderer!.draw(drawList(rig, frame.pose, set, frame.state), this.stage, this.background);
    return { events: frame.events, views: frame.state.views, variant: frame.state.variant ?? null };
  }

  /** The canvas's RGBA bytes, top row first, as base64. */
  pixels(): string {
    return base64(this.renderer!.readPixels());
  }

  /**
   * Poses a still: the clip at time 0 on a fresh player, so nothing played before
   * reaches it. Returns its views, every part with its ID colour, the parts it
   * draws in order, and the box around their quads in points.
   */
  still(name: string) {
    const { rig, clips, set } = this.loaded!;
    const clip = clips.find((c) => c.name === name);
    if (!clip) throw new Error(`no clip ${name} in the package`);
    if (!clip.views?.body || !clip.views.head) throw new Error(`clip ${name} must set both the body and the head view to be a still`);
    this.player = new Player(rig, clips);
    this.player.play(name, 0);
    const frame = this.player.advanceTo(0);
    this.held = drawList(rig, frame.pose, set, frame.state);
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const item of this.held) {
      for (let k = 0; k < item.positions.length; k += 2) {
        const x = item.positions[k]!, y = item.positions[k + 1]!;
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
      }
    }
    const parts = Object.fromEntries(rig.rig.parts.map((p, i) => [p.name, { id: hex(idColour(i)), bone: p.bone, ...(p.clipTo ? { clipTo: p.clipTo } : {}) }]));
    return { views: frame.state.views, parts, drawn: this.held.map((item) => item.part), box };
  }

  /**
   * Draws the posed still on a canvas of the given size and returns its pixels as
   * base64: on an opaque background, or with ids the part-ID pass.
   */
  drawStill(o: { width: number; height: number; stage: Stage; background: [number, number, number]; ids?: boolean }): string {
    this.canvas.width = o.width;
    this.canvas.height = o.height;
    if (!o.ids) {
      this.renderer!.draw(this.held, o.stage, o.background);
      return this.pixels();
    }
    const { renderer, sampler } = this.idPass();
    const gl = renderer.gl;
    // A sampler on the renderer's texture unit overrides its linear filtering, so every pixel takes one texel's flat colour.
    gl.bindSampler(0, sampler);
    renderer.draw(this.held, o.stage, o.background);
    gl.bindSampler(0, null);
    return base64(renderer.readPixels());
  }

  /** The ID pass: a recoloured copy of the set's pages (ids.ts) in a renderer of its own, so the package's pages stay as they are. */
  private idPass() {
    const gl = this.renderer!.gl;
    if (!this.ids) {
      const sampler = gl.createSampler()!;
      gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.ids = { renderer: new Renderer(gl), sampler, current: false };
    }
    if (!this.ids.current) {
      const { rig, set } = this.loaded!;
      const owner = new Map<string, number>();
      rig.rig.parts.forEach((part, i) => {
        for (const region of Object.values(part.regions)) {
          const other = owner.get(region);
          if (other !== undefined && other !== i) throw new Error(`region ${region} belongs to both ${rig.rig.parts[other]!.name} and ${part.name}; the ID pass needs one part per region`);
          owner.set(region, i);
        }
      });
      const pages = this.pages.map((img, page) => {
        const canvas = new OffscreenCanvas(img.width, img.height);
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(img, 0, 0);
        const rects: IdRect[] = [];
        for (const [name, r] of Object.entries(set.regions)) {
          const part = owner.get(name);
          if (r.page === page && part !== undefined) rects.push({ x: r.x, y: r.y, w: r.w, h: r.h, colour: idColour(part) });
        }
        // Only alpha is read back, and a 2D canvas keeps alpha exactly.
        const texels = recolour(context.getImageData(0, 0, img.width, img.height).data, img.width, img.height, rects);
        return new ImageData(texels, img.width, img.height);
      });
      this.ids.renderer.loadPages(pages);
      this.ids.current = true;
    }
    return this.ids;
  }

  /** What the GPU is, so a render can never pass on a missing device. */
  device(): string {
    const gl = this.renderer!.gl;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  }
}

declare global {
  interface Window {
    lab: Lab;
  }
}
window.lab = new Lab();
