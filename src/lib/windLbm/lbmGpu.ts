import { LBM_Q } from "./lbmConstants";
import { applyInletOutletGpu, uploadFToGpu } from "./lbmGpuSync";
import { LBM_GPU_MACRO_FRAG, LBM_GPU_STEP_FRAG, LBM_GPU_VERT } from "./lbmGpuShaders";
import { probeWebGl2FloatTarget } from "./webglProbe";
import type { WindLbmBackend, WindLbmSolverState } from "./types";

type GpuCtx = {
  gl: WebGL2RenderingContext;
  stepProgram: WebGLProgram;
  macroProgram: WebGLProgram;
  vao: WebGLVertexArrayObject;
  fboA: WebGLFramebuffer;
  fboB: WebGLFramebuffer;
  f0A: WebGLTexture;
  f1A: WebGLTexture;
  f2A: WebGLTexture;
  f0B: WebGLTexture;
  f1B: WebGLTexture;
  f2B: WebGLTexture;
  obstacle: WebGLTexture;
  macroTex: WebGLTexture;
  macroFbo: WebGLFramebuffer;
  width: number;
  height: number;
  pingA: boolean;
  stepsOnGpu: number;
  syncStride: number;
  sinceSync: number;
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

export class LbmGpuSurface {
  readonly backend: WindLbmBackend;
  private ctx: GpuCtx | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const probe = probeWebGl2FloatTarget();
    if (!probe.ok) {
      this.backend = "cpu";
      return;
    }
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
      this.backend = "cpu";
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, LBM_GPU_VERT);
    const stepFs = compile(gl, gl.FRAGMENT_SHADER, LBM_GPU_STEP_FRAG);
    const macroFs = compile(gl, gl.FRAGMENT_SHADER, LBM_GPU_MACRO_FRAG);
    if (!vs || !stepFs || !macroFs) {
      this.backend = "cpu";
      return;
    }
    const stepProgram = gl.createProgram();
    const macroProgram = gl.createProgram();
    if (!stepProgram || !macroProgram) {
      this.backend = "cpu";
      return;
    }
    gl.attachShader(stepProgram, vs);
    gl.attachShader(stepProgram, stepFs);
    gl.linkProgram(stepProgram);
    const vsMacro = compile(gl, gl.VERTEX_SHADER, LBM_GPU_VERT);
    if (!vsMacro) {
      this.backend = "cpu";
      return;
    }
    gl.attachShader(macroProgram, vsMacro);
    gl.attachShader(macroProgram, macroFs);
    gl.linkProgram(macroProgram);
    if (!gl.getProgramParameter(stepProgram, gl.LINK_STATUS) || !gl.getProgramParameter(macroProgram, gl.LINK_STATUS)) {
      this.backend = "cpu";
      return;
    }
    gl.deleteShader(vs);
    gl.deleteShader(vsMacro);
    gl.deleteShader(stepFs);
    gl.deleteShader(macroFs);
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    if (!vao || !buf) {
      this.backend = "cpu";
      return;
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(stepProgram, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const fboA = gl.createFramebuffer()!;
    const fboB = gl.createFramebuffer()!;
    this.backend = "gpu";
    this.ctx = {
      gl,
      stepProgram,
      macroProgram,
      vao,
      fboA,
      fboB,
      f0A: makeTex(gl, 4, 4)!,
      f1A: makeTex(gl, 4, 4)!,
      f2A: makeTex(gl, 4, 4)!,
      f0B: makeTex(gl, 4, 4)!,
      f1B: makeTex(gl, 4, 4)!,
      f2B: makeTex(gl, 4, 4)!,
      obstacle: makeTex(gl, 4, 4)!,
      macroTex: makeTex(gl, 4, 4)!,
      macroFbo: gl.createFramebuffer()!,
      width: 4,
      height: 4,
      pingA: true,
      stepsOnGpu: 0,
      syncStride: 12,
      sinceSync: 0,
    };
    void canvas;
  }

  gpuStepCount(): number {
    return this.ctx?.stepsOnGpu ?? 0;
  }

  resize(nx: number, ny: number): void {
    const ctx = this.ctx;
    if (!ctx || (nx === ctx.width && ny === ctx.height)) return;
    const { gl } = ctx;
    const drop = (t: WebGLTexture) => gl.deleteTexture(t);
    drop(ctx.f0A);
    drop(ctx.f1A);
    drop(ctx.f2A);
    drop(ctx.f0B);
    drop(ctx.f1B);
    drop(ctx.f2B);
    drop(ctx.obstacle);
    drop(ctx.macroTex);
    ctx.f0A = makeTex(gl, nx, ny)!;
    ctx.f1A = makeTex(gl, nx, ny)!;
    ctx.f2A = makeTex(gl, nx, ny)!;
    ctx.f0B = makeTex(gl, nx, ny)!;
    ctx.f1B = makeTex(gl, nx, ny)!;
    ctx.f2B = makeTex(gl, nx, ny)!;
    ctx.obstacle = makeTex(gl, nx, ny)!;
    ctx.macroTex = makeTex(gl, nx, ny)!;
    ctx.width = nx;
    ctx.height = ny;
    ctx.pingA = true;
  }

  uploadState(state: WindLbmSolverState): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { nx, ny } = state.spec;
    this.resize(nx, ny);
    uploadFToGpu(ctx, state);
  }

  dispose(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { gl } = ctx;
    gl.deleteProgram(ctx.stepProgram);
    gl.deleteProgram(ctx.macroProgram);
    gl.deleteFramebuffer(ctx.fboA);
    gl.deleteFramebuffer(ctx.fboB);
    gl.deleteFramebuffer(ctx.macroFbo);
    for (const tex of [
      ctx.f0A,
      ctx.f1A,
      ctx.f2A,
      ctx.f0B,
      ctx.f1B,
      ctx.f2B,
      ctx.obstacle,
      ctx.macroTex,
    ]) {
      gl.deleteTexture(tex);
    }
    gl.deleteVertexArray(ctx.vao);
    this.ctx = null;
  }

  step(state: WindLbmSolverState, gpuSteps: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { gl, stepProgram, macroProgram, vao } = ctx;
    const { nx, ny } = state.spec;
    this.resize(nx, ny);

    const bindRead = (pingA: boolean) => {
      const f0 = pingA ? ctx.f0A : ctx.f0B;
      const f1 = pingA ? ctx.f1A : ctx.f1B;
      const f2 = pingA ? ctx.f2A : ctx.f2B;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, f0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, f1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, f2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, ctx.obstacle);
    };

    const bindDraw = (pingA: boolean) => {
      const fbo = pingA ? ctx.fboA : ctx.fboB;
      const f0 = pingA ? ctx.f0A : ctx.f0B;
      const f1 = pingA ? ctx.f1A : ctx.f1B;
      const f2 = pingA ? ctx.f2A : ctx.f2B;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f0, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, f1, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, f2, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    };

    gl.useProgram(stepProgram);
    gl.bindVertexArray(vao);
    gl.uniform1i(gl.getUniformLocation(stepProgram, "u_f0"), 0);
    gl.uniform1i(gl.getUniformLocation(stepProgram, "u_f1"), 1);
    gl.uniform1i(gl.getUniformLocation(stepProgram, "u_f2"), 2);
    gl.uniform1i(gl.getUniformLocation(stepProgram, "u_obstacle"), 3);
    gl.uniform2f(gl.getUniformLocation(stepProgram, "u_gridSize"), nx, ny);
    gl.uniform1f(gl.getUniformLocation(stepProgram, "u_omega"), state.omega);
    gl.uniform2f(gl.getUniformLocation(stepProgram, "u_inflow"), state.inflow.ux, state.inflow.uy);
    gl.viewport(0, 0, nx, ny);

    let pingA = ctx.pingA;
    for (let s = 0; s < gpuSteps; s++) {
      bindRead(pingA);
      bindDraw(!pingA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      pingA = !pingA;
      ctx.stepsOnGpu++;
    }
    ctx.pingA = pingA;

    const readF0 = pingA ? ctx.f0A : ctx.f0B;
    const readF1 = pingA ? ctx.f1A : ctx.f1B;
    const readF2 = pingA ? ctx.f2A : ctx.f2B;
    gl.bindFramebuffer(gl.FRAMEBUFFER, ctx.macroFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ctx.macroTex, 0);
    gl.useProgram(macroProgram);
    gl.uniform1i(gl.getUniformLocation(macroProgram, "u_f0"), 0);
    gl.uniform1i(gl.getUniformLocation(macroProgram, "u_f1"), 1);
    gl.uniform1i(gl.getUniformLocation(macroProgram, "u_f2"), 2);
    gl.uniform1i(gl.getUniformLocation(macroProgram, "u_obstacle"), 3);
    gl.uniform2f(gl.getUniformLocation(macroProgram, "u_gridSize"), nx, ny);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readF0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readF1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, readF2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, ctx.obstacle);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const macro = new Float32Array(nx * ny * 4);
    gl.readPixels(0, 0, nx, ny, gl.RGBA, gl.FLOAT, macro);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const cell = i + j * nx;
        const srcJ = ny - 1 - j;
        const o = (srcJ * nx + i) * 4;
        if (state.obstacle[cell]) {
          state.ux[cell] = 0;
          state.uy[cell] = 0;
          state.rho[cell] = 1;
        } else {
          const ux = macro[o]!;
          const uy = macro[o + 1]!;
          const rho = macro[o + 2]!;
          let uxCl = Number.isFinite(ux) ? ux : 0;
          let uyCl = Number.isFinite(uy) ? uy : 0;
          const sp = Math.hypot(uxCl, uyCl);
          if (sp > 0.28) {
            const k = 0.28 / sp;
            uxCl *= k;
            uyCl *= k;
          }
          state.ux[cell] = uxCl;
          state.uy[cell] = uyCl;
          state.rho[cell] = Number.isFinite(rho) ? rho : 1;
        }
      }
    }

    ctx.sinceSync += gpuSteps;
    const needsFullSync = ctx.sinceSync >= ctx.syncStride;
    if (needsFullSync) {
      ctx.sinceSync = 0;
      const f0buf = new Float32Array(nx * ny * 4);
      const f1buf = new Float32Array(nx * ny * 4);
      const f2buf = new Float32Array(nx * ny * 4);
      const fbo = pingA ? ctx.fboA : ctx.fboB;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, readF0, 0);
      gl.readPixels(0, 0, nx, ny, gl.RGBA, gl.FLOAT, f0buf);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, readF1, 0);
      gl.readPixels(0, 0, nx, ny, gl.RGBA, gl.FLOAT, f1buf);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, readF2, 0);
      gl.readPixels(0, 0, nx, ny, gl.RGBA, gl.FLOAT, f2buf);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const cell = i + j * nx;
          const srcJ = ny - 1 - j;
          const o = (srcJ * nx + i) * 4;
          const base = cell * LBM_Q;
          state.f[base] = f0buf[o]!;
          state.f[base + 1] = f0buf[o + 1]!;
          state.f[base + 2] = f0buf[o + 2]!;
          state.f[base + 3] = f0buf[o + 3]!;
          state.f[base + 4] = f1buf[o]!;
          state.f[base + 5] = f1buf[o + 1]!;
          state.f[base + 6] = f1buf[o + 2]!;
          state.f[base + 7] = f1buf[o + 3]!;
          state.f[base + 8] = f2buf[o]!;
        }
      }
      applyInletOutletGpu(state);
      uploadFToGpu(ctx, state);
    }
    ctx.pingA = pingA;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
