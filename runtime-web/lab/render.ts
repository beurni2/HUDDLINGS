// Renders a clip of a built character package in headless Chromium, frame by
// frame on the deterministic clock: PNG frames, a contact sheet (ImageMagick)
// and an MP4 (ffmpeg), so every motion can be looked at.
//
// node runtime-web/lab/render.ts --clip test_dance --out qa/phase1/test_dance
//   [--species test] [--fps 60] [--every 6] [--ppp 2] [--size 400] [--set 2x] [--seconds 4.2] [--frames all|sheet]
//   [--frames-only]: PNG frames and the report, without the sheet and the MP4 (no ImageMagick or ffmpeg needed)
//   [--package <folder>]: a built package folder other than build/characters/<species>/
//
// With --stills instead of --clip it renders every still_<view> and face_<preset>
// clip the package holds, each posed as still.ts poses a still (the clip at time 0
// on a fresh player), on the same stage and white background as the frames, into
// <out>/<clip>.png, with the report: the WebGL side of the dog's parity (ios.yml).
// Beside them, soft.json: in each still, the footprint of every soft part (a part
// whose rest alpha is under 1, or that its clip keys), from the ID pass at the
// same stage, as the box parity.py fits its level in, in both runtimes' frames.
import { spawnSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import { openLab } from "./browser.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const { values: args } = parseArgs({
  options: {
    species: { type: "string", default: "test" },
    clip: { type: "string" },
    out: { type: "string" },
    fps: { type: "string", default: "60" },
    every: { type: "string", default: "6" },
    ppp: { type: "string", default: "2" },
    size: { type: "string", default: "400" },
    set: { type: "string" },
    seconds: { type: "string" },
    frames: { type: "string", default: "sheet" },
    "frames-only": { type: "boolean", default: false },
    stills: { type: "boolean", default: false },
    package: { type: "string" },
  },
});
if (!args.clip === !args.stills || !args.out) {
  console.error("usage: node runtime-web/lab/render.ts --clip <name> --out <folder> [options]");
  console.error("       node runtime-web/lab/render.ts --stills --out <folder> [--package <folder>] [--size <px>] [--ppp <n>] [--set <name>]");
  process.exit(2);
}
const fps = Number(args.fps);
const every = Number(args.every);
const size = Number(args.size);
const ppp = Number(args.ppp);
const out = resolve(repo, args.out);
const packageDir = args.package ? resolve(args.package) : join(repo, "build", "characters", args.species!);
if (!existsSync(join(packageDir, "package.json"))) {
  console.error(`no package at ${packageDir}; run npm run build:test-character first`);
  process.exit(1);
}

const lab = await openLab(packageDir);
try {
  const { page } = lab;
  const stage = { x: size / 2, y: size - 24, pixelsPerPoint: ppp };
  const loaded = await page.evaluate(
    ([base, options]) => window.lab.load(base, options),
    [lab.packageUrl, { width: size, height: size, stage, set: args.set }] as const,
  );
  const device = await page.evaluate(() => window.lab.device());
  if (args.stills) {
    // Each still on the stage the frames use: the root size / 2 across and 24 px above the bottom edge, on white.
    const names = loaded.clips.map((c) => c.name).filter((name) => /^(still|face)_/.test(name)).sort();
    if (names.length === 0) throw new Error("the package holds no still_<view> or face_<preset> clip");
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const read = (file: string) => JSON.parse(readFileSync(join(packageDir, file), "utf8"));
    const manifest = read("package.json") as { species: string; files: Record<string, string> };
    const restingSoft = (read("rig.json") as { parts: { name: string; alpha?: number }[] }).parts.filter((p) => (p.alpha ?? 1) < 1).map((p) => p.name);
    const clipFiles = new Map(Object.keys(manifest.files).filter((f) => f.startsWith("clips/")).map((f) => [read(f).name as string, f]));
    const soft: Record<string, { part: string; box: number[]; pixels: number }[]> = {};
    for (const name of names) {
      const posed = await page.evaluate((n) => window.lab.still(n), name);
      const draw = (ids: boolean) => page.evaluate((o) => window.lab.drawStill(o), { width: size, height: size, stage, background: (ids ? [0, 0, 0] : [1, 1, 1]) as [number, number, number], ids });
      const rgba = Buffer.from(await draw(false), "base64");
      const png = new PNG({ width: size, height: size });
      rgba.copy(png.data);
      writeFileSync(join(out, `${name}.png`), PNG.sync.write(png));
      // A part's level is the one thing the frames' patches can miss (a resting blush is a faint tint), so parity fits it.
      const keyed = Object.keys((read(clipFiles.get(name)!) as { alpha?: Record<string, unknown> }).alpha ?? {});
      const parts = [...new Set([...restingSoft, ...keyed])].filter((part) => posed.drawn.includes(part)).sort();
      if (parts.length === 0) continue;
      const ids = Buffer.from(await draw(true), "base64");
      soft[`${name}.png`] = parts.flatMap((part) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(posed.parts[part]!.id.slice(i, i + 2), 16));
        const box = [Infinity, Infinity, -Infinity, -Infinity];
        let pixels = 0;
        for (let i = 0; i < size * size; i++) {
          if (ids[i * 4] !== r || ids[i * 4 + 1] !== g || ids[i * 4 + 2] !== b) continue;
          const x = i % size, y = Math.floor(i / size);
          box[0] = Math.min(box[0]!, x);
          box[1] = Math.min(box[1]!, y);
          box[2] = Math.max(box[2]!, x);
          box[3] = Math.max(box[3]!, y);
          pixels++;
        }
        // A part at alpha 0 has no footprint, and shows nothing to fit.
        return pixels ? [{ part, box, pixels }] : [];
      });
    }
    writeFileSync(join(out, "soft.json"), JSON.stringify({ species: manifest.species, stills: soft }, null, 1) + "\n");
    writeFileSync(join(out, "report.json"), JSON.stringify({ stills: names, size, pixelsPerPoint: ppp, set: loaded.set, device }, null, 1) + "\n");
    console.log(`rendered ${names.length} stills (set ${loaded.set}, ${device}) into ${out}`);
  } else {
    const clip = loaded.clips.find((c) => c.name === args.clip);
    if (!clip) throw new Error(`no clip ${args.clip} in the package`);
    const seconds = args.seconds ? Number(args.seconds) : clip.lengthMs / 1000;
    const count = Math.round(seconds * fps);

    rmSync(out, { recursive: true, force: true });
    mkdirSync(join(out, "frames"), { recursive: true });
    const framesOnly = args["frames-only"]!;
    const ffmpeg = framesOnly ? undefined : spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${size}x${size}`, "-r", String(fps), "-i", "-",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", join(out, `${args.clip}.mp4`)], { stdio: ["pipe", "inherit", "inherit"] });

    await page.evaluate((name) => window.lab.play(name, 0), args.clip!);
    const sheet: string[] = [];
    const log: { frame: number; ms: number; events: string[]; views: unknown; variant: string | null }[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / fps;
      const info = await page.evaluate((time) => window.lab.frame(time), t);
      log.push({ frame: i, ms: Math.round(t * 1000), events: info.events.map((e) => `${e.type}${e.name ? `:${e.name}` : ""}`), views: info.views, variant: info.variant });
      const rgba = Buffer.from(await page.evaluate(() => window.lab.pixels()), "base64");
      if (ffmpeg && !ffmpeg.stdin.write(rgba)) await new Promise((done) => ffmpeg.stdin.once("drain", done));
      if (args.frames === "all" || i % every === 0) {
        const png = new PNG({ width: size, height: size });
        rgba.copy(png.data);
        const name = `f${String(i).padStart(4, "0")}.png`;
        writeFileSync(join(out, "frames", name), PNG.sync.write(png));
        if (i % every === 0) sheet.push(name);
      }
    }
    if (ffmpeg) {
      ffmpeg.stdin.end();
      const code = await new Promise((done) => ffmpeg.on("close", done));
      if (code !== 0) throw new Error(`ffmpeg failed with ${code}`);
    }

    // The contact sheet: every sheet frame labelled with its frame number and time.
    const labelled = sheet.flatMap((name) => {
      const frame = Number(name.slice(1, 5));
      return ["-label", `${frame}  ${Math.round((frame / fps) * 1000)} ms`, join(out, "frames", name)];
    });
    const montage = framesOnly ? { status: 0 } : spawnSync("montage", [...labelled, "-tile", "8x", "-geometry", "200x200+4+4", "-pointsize", "14", join(out, `${args.clip}-sheet.png`)], { stdio: "inherit" });
    if (montage.status !== 0) throw new Error("montage failed");
    writeFileSync(join(out, "report.json"), JSON.stringify({ clip: args.clip, fps, size, pixelsPerPoint: ppp, set: loaded.set, device, frames: log }, null, 1) + "\n");
    console.log(`rendered ${count + 1} frames of ${args.clip} (set ${loaded.set}, ${device}) into ${out}`);
  }
} finally {
  await lab.close();
}
