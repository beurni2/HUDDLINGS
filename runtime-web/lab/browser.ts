// The Animation Lab's page in headless Chromium on SwiftShader, served with one
// built package: what the render scripts (render.ts, still.ts, look.ts) share.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };

export interface LabPage {
  page: Page;
  /** The package folder's URL, for window.lab.load. */
  packageUrl: string;
  close(): Promise<void>;
}

/** Bundles the Lab, serves it with the package at packageDir, and opens it in headless Chromium. */
export async function openLab(packageDir: string): Promise<LabPage> {
  const bundle = await build({
    entryPoints: [join(repo, "runtime-web/lab/lab.ts")],
    bundle: true,
    format: "esm",
    write: false,
    target: "es2022",
  });
  const labJs = bundle.outputFiles[0]!.contents;
  const server = createServer((request, response) => {
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
    // Never cached: the look loop rebuilds the package under the same names.
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const close = async () => {
    await browser.close();
    server.close();
  };
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error(`page: ${error.message}`));
    await page.goto(`http://127.0.0.1:${port}/lab/index.html`);
    await page.waitForFunction(() => "lab" in window);
    return { page, packageUrl: `http://127.0.0.1:${port}/package`, close };
  } catch (error) {
    await close();
    throw error;
  }
}
