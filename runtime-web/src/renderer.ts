// Draws a draw list with WebGL2 (characters/format/README.md, Rendering):
// premultiplied textures sampled linearly without mipmaps (as SpriteKit was
// measured to draw them), single-sample, one quad or dense mesh per part, each
// part's colour times its alpha, and clip groups through the stencil buffer,
// keeping mask pixels whose own texel alpha is 0.05 or more, as SKCropNode does.
import type { AtlasSet } from "./format.ts";
import type { DrawItem } from "./rig.ts";

/** Where the companion stands on the canvas: its root at (x, y) pixels, and pixels per point. */
export interface Stage {
  x: number;
  y: number;
  pixelsPerPoint: number;
}

/** The mask rule of SKCropNode: mask pixels with alpha below this are cut. */
export const MASK_ALPHA = 0.05;

/** Below this share of its full size, the companion draws from the small set (section 5b). */
export const SMALL_BELOW = 0.35;

/**
 * The atlas set to draw with: the small set below 35% of full size, otherwise the
 * smallest set with at least as many pixels per point as the screen shows.
 */
export function chooseSet(sets: AtlasSet[], sizeShare: number, pixelsPerPoint: number): AtlasSet {
  const small = sets.find((s) => s.name === "small");
  if (small && sizeShare < SMALL_BELOW) return small;
  const full = sets.filter((s) => s.name !== "small").sort((a, b) => a.scale - b.scale);
  return full.find((s) => s.scale >= pixelsPerPoint) ?? full[full.length - 1]!;
}

/** The context the renderer needs: single-sample, with a stencil buffer (README, Rendering). */
export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  antialias: false,
  stencil: true,
  depth: false,
  alpha: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: true,
};

const VERTEX = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform vec2 u_viewport;
out vec2 v_uv;
void main() {
  vec2 clip = a_position / u_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_maskCut;
uniform float u_alpha;
in vec2 v_uv;
out vec4 color;
void main() {
  vec4 c = texture(u_texture, v_uv);
  // The cut reads the texel's own alpha, so a part's alpha never changes what a mask lets through.
  if (c.a < u_maskCut) discard;
  color = c * u_alpha;
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader failed");
  return shader;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private textures: WebGLTexture[] = [];
  private positions: WebGLBuffer;
  private uvs: WebGLBuffer;
  private indices: WebGLBuffer;
  private where: { viewport: WebGLUniformLocation; maskCut: WebGLUniformLocation; alpha: WebGLUniformLocation; texture: WebGLUniformLocation };

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.bindAttribLocation(program, 0, "a_position");
    gl.bindAttribLocation(program, 1, "a_uv");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
    this.program = program;
    this.where = {
      viewport: gl.getUniformLocation(program, "u_viewport")!,
      maskCut: gl.getUniformLocation(program, "u_maskCut")!,
      alpha: gl.getUniformLocation(program, "u_alpha")!,
      texture: gl.getUniformLocation(program, "u_texture")!,
    };
    this.positions = gl.createBuffer()!;
    this.uvs = gl.createBuffer()!;
    this.indices = gl.createBuffer()!;
    if (!gl.getContextAttributes()?.stencil) throw new Error("the renderer needs a stencil buffer (CONTEXT_ATTRIBUTES)");
  }

  /**
   * Uploads a set's pages, premultiplied, without colour conversion, sampled linearly
   * without mipmaps: SpriteKit, even asked for mipmaps, used none (RenderProbes.swift),
   * so both runtimes filter the same way.
   */
  loadPages(images: TexImageSource[]): void {
    const gl = this.gl;
    for (const t of this.textures) gl.deleteTexture(t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.textures = images.map((image) => {
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    });
  }

  /**
   * Clears to an opaque background and draws the list in order. Colours are 0..1. Texels
   * whose alpha is below `cut` draw no colour (the Lab's ID pass draws flat colours at 0.5);
   * a mask always cuts at MASK_ALPHA.
   */
  draw(items: DrawItem[], stage: Stage, background: [number, number, number], cut = 0): void {
    const gl = this.gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.colorMask(true, true, true, true);
    gl.clearColor(background[0], background[1], background[2], 1);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform2f(this.where.viewport, width, height);
    gl.uniform1i(this.where.texture, 0);
    gl.activeTexture(gl.TEXTURE0);

    let mask: number | undefined;
    for (const item of items) {
      if (item.clipTo !== mask) {
        mask = item.clipTo;
        if (mask === undefined) {
          gl.disable(gl.STENCIL_TEST);
        } else {
          // A new clip group: mark its mask's pixels in the stencil, drawing no colour.
          gl.enable(gl.STENCIL_TEST);
          gl.clear(gl.STENCIL_BUFFER_BIT);
          gl.stencilFunc(gl.ALWAYS, 1, 0xff);
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
          gl.colorMask(false, false, false, false);
          gl.uniform1f(this.where.maskCut, MASK_ALPHA);
          this.mesh(items[mask]!, stage, 1);
          gl.colorMask(true, true, true, true);
          gl.stencilFunc(gl.EQUAL, 1, 0xff);
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        }
      }
      // Fully transparent texels add nothing to a premultiplied blend, so drawing them changes no pixel.
      gl.uniform1f(this.where.maskCut, cut);
      this.mesh(item, stage, item.alpha);
    }
    gl.disable(gl.STENCIL_TEST);
  }

  private mesh(item: DrawItem, stage: Stage, alpha: number): void {
    const gl = this.gl;
    gl.uniform1f(this.where.alpha, alpha);
    const n = item.positions.length / 2;
    const pixels = new Float32Array(item.positions.length);
    for (let i = 0; i < n; i++) {
      pixels[2 * i] = stage.x + item.positions[2 * i]! * stage.pixelsPerPoint;
      pixels[2 * i + 1] = stage.y + item.positions[2 * i + 1]! * stage.pixelsPerPoint;
    }
    // Rows of two vertices (left, right); each row pair is two triangles, split on the
    // top-right to bottom-left diagonal.
    const indices = new Uint16Array(item.rows * 6);
    for (let r = 0; r < item.rows; r++) {
      const tl = 2 * r, tr = tl + 1, bl = tl + 2, br = tl + 3;
      indices.set([tl, bl, tr, tr, bl, br], r * 6);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.textures[item.page]!);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positions);
    gl.bufferData(gl.ARRAY_BUFFER, pixels, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvs);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(item.uvs), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STREAM_DRAW);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  }

  /** The canvas as RGBA bytes, top row first. */
  readPixels(): Uint8Array {
    const gl = this.gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const raw = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const out = new Uint8Array(raw.length);
    const row = width * 4;
    for (let y = 0; y < height; y++) out.set(raw.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    return out;
  }
}
