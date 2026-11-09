import { LBM_Q } from "./lbmConstants";
import { applyInletOutlet } from "./lbmCpu";
import type { WindLbmSolverState } from "./types";

type GpuCtx = {
  gl: WebGL2RenderingContext;
  f0A: WebGLTexture;
  f1A: WebGLTexture;
  f2A: WebGLTexture;
  f0B: WebGLTexture;
  f1B: WebGLTexture;
  f2B: WebGLTexture;
  obstacle: WebGLTexture;
  pingA: boolean;
  width: number;
  height: number;
};

export function uploadFToGpu(ctx: GpuCtx, state: WindLbmSolverState): void {
  const { gl } = ctx;
  const { nx, ny } = state.spec;
  const f0 = new Float32Array(nx * ny * 4);
  const f1 = new Float32Array(nx * ny * 4);
  const f2 = new Float32Array(nx * ny * 4);
  const obst = new Float32Array(nx * ny * 4);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cell = i + j * nx;
      const o = (j * nx + i) * 4;
      const blocked = state.obstacle[cell] ? 1 : 0;
      obst[o] = blocked;
      if (state.obstacle[cell]) {
        f0[o] = 0;
        f0[o + 1] = 0;
        f0[o + 2] = 0;
        f0[o + 3] = 0;
        f1[o] = 0;
        f1[o + 1] = 0;
        f1[o + 2] = 0;
        f1[o + 3] = 0;
        f2[o] = 0;
      } else {
        f0[o] = state.f[cell * LBM_Q]!;
        f0[o + 1] = state.f[cell * LBM_Q + 1]!;
        f0[o + 2] = state.f[cell * LBM_Q + 2]!;
        f0[o + 3] = state.f[cell * LBM_Q + 3]!;
        f1[o] = state.f[cell * LBM_Q + 4]!;
        f1[o + 1] = state.f[cell * LBM_Q + 5]!;
        f1[o + 2] = state.f[cell * LBM_Q + 6]!;
        f1[o + 3] = state.f[cell * LBM_Q + 7]!;
        f2[o] = state.f[cell * LBM_Q + 8]!;
      }
    }
  }
  const target = ctx.pingA ? [ctx.f0A, ctx.f1A, ctx.f2A] : [ctx.f0B, ctx.f1B, ctx.f2B];
  gl.bindTexture(gl.TEXTURE_2D, target[0]);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.RGBA, gl.FLOAT, f0);
  gl.bindTexture(gl.TEXTURE_2D, target[1]);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.RGBA, gl.FLOAT, f1);
  gl.bindTexture(gl.TEXTURE_2D, target[2]);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.RGBA, gl.FLOAT, f2);
  gl.bindTexture(gl.TEXTURE_2D, ctx.obstacle);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.RGBA, gl.FLOAT, obst);
}

export function applyInletOutletGpu(state: WindLbmSolverState): void {
  applyInletOutlet(state);
}
