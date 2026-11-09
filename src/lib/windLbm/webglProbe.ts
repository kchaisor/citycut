export type WebGlFloatTargetProbe = {
  ok: boolean;
  maxTextureSize: number;
  reason: string;
};

export function probeWebGl2FloatTarget(): WebGlFloatTargetProbe {
  if (typeof document === "undefined") {
    return { ok: false, maxTextureSize: 0, reason: "no-document" };
  }
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) {
    return { ok: false, maxTextureSize: 0, reason: "no-webgl2" };
  }
  const ext = gl.getExtension("EXT_color_buffer_float");
  if (!ext) {
    return { ok: false, maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE), reason: "no-ext_color_buffer_float" };
  }
  const tex = gl.createTexture();
  const fb = gl.createFramebuffer();
  if (!tex || !fb) {
    return { ok: false, maxTextureSize: 0, reason: "alloc-failed" };
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, 4, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.deleteTexture(tex);
  gl.deleteFramebuffer(fb);
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    return { ok: false, maxTextureSize, reason: `fbo-${status}` };
  }
  return { ok: true, maxTextureSize, reason: "ok" };
}
