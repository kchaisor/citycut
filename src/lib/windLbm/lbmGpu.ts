import { LBM_Q } from "./lbmConstants";
import { lbmCpuStep } from "./lbmCpu";
import { probeWebGl2FloatTarget } from "./webglProbe";
import type { WindLbmBackend, WindLbmSolverState } from "./types";

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const COPY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_vel;
layout(location = 0) out vec4 o_vel;
void main() {
  o_vel = texture(u_vel, v_uv);
}`;

type GpuCtx = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  readFbo: WebGLFramebuffer;
  drawFbo: WebGLFramebuffer;
  velTex: WebGLTexture;
  velTexOut: WebGLTexture;
  width: number;
  height: number;
};

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vert);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function makeTex(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
  return tex;
}

function uploadVelocity(gl: WebGL2RenderingContext, tex: WebGLTexture, state: WindLbmSolverState): void {
  const { nx, ny } = state.spec;
  const rgba = new Float32Array(nx * ny * 4);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cell = i + j * nx;
      const o = (j * nx + i) * 4;
      if (state.obstacle[cell]) {
        rgba[o] = 0;
        rgba[o + 1] = 0;
        rgba[o + 2] = 1;
        rgba[o + 3] = 0;
      } else {
        rgba[o] = state.ux[cell]!;
        rgba[o + 1] = state.uy[cell]!;
        rgba[o + 2] = state.rho[cell]!;
        rgba[o + 3] = Math.hypot(state.ux[cell]!, state.uy[cell]!);
      }
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.RGBA, gl.FLOAT, rgba);
}

export class LbmGpuSurface {
  readonly backend: WindLbmBackend;
  private ctx: GpuCtx | null = null;
  private scratch: Float32Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const probe = probeWebGl2FloatTarget();
    if (!probe.ok) {
      this.backend = "cpu";
      return;
    }
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
      this.backend = "cpu";
      return;
    }
    const program = link(gl, VERT, COPY_FRAG);
    if (!program) {
      this.backend = "cpu";
      return;
    }
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    if (!vao || !buf) {
      this.backend = "cpu";
      return;
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.backend = "gpu";
    this.ctx = {
      gl,
      program,
      vao,
      readFbo: gl.createFramebuffer()!,
      drawFbo: gl.createFramebuffer()!,
      velTex: makeTex(gl, 4, 4)!,
      velTexOut: makeTex(gl, 4, 4)!,
      width: 4,
      height: 4,
    };
  }

  resize(nx: number, ny: number): void {
    const ctx = this.ctx;
    if (!ctx || nx === ctx.width && ny === ctx.height) return;
    const { gl } = ctx;
    gl.deleteTexture(ctx.velTex);
    gl.deleteTexture(ctx.velTexOut);
    const velTex = makeTex(gl, nx, ny);
    const velTexOut = makeTex(gl, nx, ny);
    if (!velTex || !velTexOut) return;
    ctx.velTex = velTex;
    ctx.velTexOut = velTexOut;
    ctx.width = nx;
    ctx.height = ny;
  }

  dispose(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { gl } = ctx;
    gl.deleteProgram(ctx.program);
    gl.deleteFramebuffer(ctx.readFbo);
    gl.deleteFramebuffer(ctx.drawFbo);
    gl.deleteTexture(ctx.velTex);
    gl.deleteTexture(ctx.velTexOut);
    gl.deleteVertexArray(ctx.vao);
    this.ctx = null;
  }

  step(state: WindLbmSolverState, gpuSteps: number): void {
    const n = state.spec.nx * state.spec.ny * LBM_Q;
    if (!this.scratch || this.scratch.length !== n) this.scratch = new Float32Array(n);
    for (let s = 0; s < gpuSteps; s++) lbmCpuStep(state, this.scratch);
    const ctx = this.ctx;
    if (!ctx) return;
    this.resize(state.spec.nx, state.spec.ny);
    uploadVelocity(ctx.gl, ctx.velTex, state);
    const { gl, program, vao } = ctx;
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ctx.velTex);
    gl.uniform1i(gl.getUniformLocation(program, "u_vel"), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.drawFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ctx.velTexOut, 0);
    gl.viewport(0, 0, ctx.width, ctx.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const tmp = ctx.velTex;
    ctx.velTex = ctx.velTexOut;
    ctx.velTexOut = tmp;
  }

  sampleVelocity(state: WindLbmSolverState, east: number, north: number): { ux: number; uy: number; speed: number } {
    const { spec, obstacle, ux, uy, rho } = state;
    const half = spec.sideM / 2;
    const fx = ((east + half) / spec.sideM) * spec.nx;
    const fy = ((north + half) / spec.sideM) * spec.ny;
    const i = Math.min(spec.nx - 1, Math.max(0, Math.floor(fx)));
    const j = Math.min(spec.ny - 1, Math.max(0, Math.floor(fy)));
    const cell = i + j * spec.nx;
    if (obstacle[cell]) return { ux: 0, uy: 0, speed: 0 };
    const u = ux[cell]!;
    const v = uy[cell]!;
    void rho;
    return { ux: u, uy: v, speed: Math.hypot(u, v) };
  }
}
