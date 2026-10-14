// Renders a clip of a built character package in headless Chromium, frame by
// frame on the deterministic clock: PNG frames, a contact sheet (ImageMagick)
// and an MP4 (ffmpeg), so every motion can be looked at.
//
// node runtime-web/lab/render.ts --clip test_dance --out qa/phase1/test_dance
//   [--species test] [--fps 60] [--every 6] [--ppp 2] [--size 400] [--set 2x] [--seconds 4.2] [--frames all|sheet]
//   [--frames-only]: PNG frames and the report, without the sheet and the MP4 (no ImageMagick or ffmpeg needed)
import { spawnSync, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "esbuild";
import { chromium } from "playwright";
import { PNG } from "pngjs";

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
  },
});
if (!args.clip || !args.out) {
  console.error("usage: node runtime-web/lab/render.ts --clip <name> --out <folder> [options]");
  process.exit(2);
}
const fps = Number(args.fps);
const every = Number(args.every);
const size = Number(args.size);
const ppp = Number(args.ppp);
const out = resolve(repo, args.out);
const packageDir = join(repo, "build", "characters", args.species!);
if (!existsSync(join(packageDir, "package.json"))) {
  console.error(`no package at ${packageDir}; run npm run build:test-character first`);
  process.exit(1);
}

const bundle = await build({
  entryPoints: [join(repo, "runtime-web/lab/lab.ts")],
  bundle: true,
  format: "esm",
  write: false,
  target: "es2022",
});
const labJs = bundle.outputFiles[0]!.contents;
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };

const server: Server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
  let body: Uint8Array | undefined;
  if (path === "/lab/index.html") body = readFileSync(join(repo, "runtime-web/lab/index.html"));
  else if (path === "/lab/lab.js") body = labJs;
  else if (path.startsWith("/package/") && !path.includes("..")) {
    const file = join(packageDir, path.slice("/package/".length));
    if (existsSync(file)) body = readFileSync(file);
  }
  if (!body) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(body);
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const port = (server.address() as { port: number }).port;

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(`page: ${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/lab/index.html`);
  await page.waitForFunction(() => "lab" in window);
  const stage = { x: size / 2, y: size - 24, pixelsPerPoint: ppp };
  const loaded = await page.evaluate(
    ([base, options]) => window.lab.load(base, options),
    [`http://127.0.0.1:${port}/package`, { width: size, height: size, stage, set: args.set }] as const,
  );
  const device = await page.evaluate(() => window.lab.device());
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
} finally {
  await browser.close();
  server.close();
}
