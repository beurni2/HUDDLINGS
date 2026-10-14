// The Animation Lab's engine room: loads a built character package, plays its
// clips on the deterministic clock and draws them with the WebGL renderer. The
// render scripts drive it through window.lab; the Lab's controls come later.
import type { AtlasSet, Clip, Rig } from "../src/format.ts";
import { compile, drawList, type CompiledRig } from "../src/rig.ts";
import { Player } from "../src/player.ts";
import { chooseSet, CONTEXT_ATTRIBUTES, Renderer, type Stage } from "../src/renderer.ts";

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

class Lab {
  private canvas = document.getElementById("stage") as HTMLCanvasElement;
  private renderer: Renderer | undefined;
  private loaded: Loaded | undefined;
  private player: Player | undefined;
  private stage: Stage = { x: 200, y: 370, pixelsPerPoint: 2 };
  private background: [number, number, number] = [1, 1, 1];

  /** Loads the package at base (a folder URL) for a canvas size and a stage; picks the atlas set the size calls for. */
  async load(base: string, options: { width: number; height: number; stage: Stage; sizeShare?: number; set?: string; background?: [number, number, number] }) {
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    const gl = this.canvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
    if (!gl) throw new Error("no WebGL2");
    this.renderer = new Renderer(gl);
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
    this.renderer.loadPages(await Promise.all(set.pages.map((p) => image(`${base}/${p.file}`))));
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
    const bytes = this.renderer!.readPixels();
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
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
