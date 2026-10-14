// The app's generated assets (PLAN, phase 1): a placeholder icon drawn from the
// test character's own shapes, until the founder's arrives (QUESTIONS.md Q11),
// and the string catalogue from copy/catalogue.json. Nothing here is written by
// hand or committed. Run: node characters/build/app-assets.ts <out folder>
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { readSource } from "./build.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** A drawing's SVG placed with its bone's pivot at (x, y) of the icon's space. */
function place(svg: string, x: number, y: number): string {
  const [, vx, vy, w, h] = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg)!.map(Number) as number[];
  return svg.replace(/^<svg [^>]*?width="[^"]*" height="[^"]*"/, (open) =>
    open.replace(/width="[^"]*" height="[^"]*"/, `x="${x + vx!}" y="${y + vy!}" width="${w}" height="${h}"`));
}

export async function iconPng(size = 1024): Promise<Buffer> {
  const { drawings, rig } = await readSource("test");
  const svg = (region: string) => drawings.find((d) => d.region === region)!.svg;
  const ear = (name: string) => rig.bones.find((b) => b.name === name)!;
  // The head, its ears and its face, in the head bone's space, centred on the head.
  const parts = [
    place(svg("ear.L/front"), ear("ear.L").x!, ear("ear.L").y!),
    place(svg("ear.R/front"), ear("ear.R").x!, ear("ear.R").y!),
    place(svg("head.base/front"), 0, 0),
    place(svg("eye.L/front:open"), 0, 0),
    place(svg("eye.R/front:open"), 0, 0),
    place(svg("nose/front"), 0, 0),
  ];
  const icon =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-70 -116 140 140">` +
    `<rect x="-70" y="-116" width="140" height="140" fill="#7DB7E8"/>${parts.join("")}</svg>`;
  const rendered = PNG.sync.read(new Resvg(icon, { fitTo: { mode: "width", value: size } }).render().asPng());
  // App icons are opaque.
  for (let i = 3; i < rendered.data.length; i += 4) rendered.data[i] = 255;
  return PNG.sync.write(rendered);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? join(repo, "ios", "Generated"));
  const icon = join(out, "Assets.xcassets", "AppIcon.appiconset");
  mkdirSync(icon, { recursive: true });
  writeFileSync(join(out, "Assets.xcassets", "Contents.json"), JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n");
  writeFileSync(join(icon, "Contents.json"), JSON.stringify({
    images: [{ filename: "icon.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
    info: { author: "xcode", version: 1 },
  }, null, 2) + "\n");
  writeFileSync(join(icon, "icon.png"), await iconPng());
  execFileSync("python3", [join(repo, "tools/copylint/strings_build.py"), "catalogue", join(out, "Localizable.xcstrings")], { stdio: "inherit" });
  console.log(`app assets written to ${out}`);
}
