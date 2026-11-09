export const LBM_GPU_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const LBM_GPU_STEP_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D u_f0;
uniform sampler2D u_f1;
uniform sampler2D u_f2;
uniform sampler2D u_obstacle;
uniform vec2 u_gridSize;
uniform float u_omega;
uniform vec2 u_inflow;
layout(location = 0) out vec4 o_f0;
layout(location = 1) out vec4 o_f1;
layout(location = 2) out vec4 o_f2;

float w(int k) {
  if (k == 0) return 4.0 / 9.0;
  if (k < 5) return 1.0 / 9.0;
  return 1.0 / 36.0;
}

ivec2 c(int k) {
  if (k == 0) return ivec2(0, 0);
  if (k == 1) return ivec2(1, 0);
  if (k == 2) return ivec2(0, 1);
  if (k == 3) return ivec2(-1, 0);
  if (k == 4) return ivec2(0, -1);
  if (k == 5) return ivec2(1, 1);
  if (k == 6) return ivec2(-1, 1);
  if (k == 7) return ivec2(-1, -1);
  return ivec2(1, -1);
}

int opp(int k) {
  if (k == 0) return 0;
  if (k == 1) return 3;
  if (k == 2) return 4;
  if (k == 3) return 1;
  if (k == 4) return 2;
  if (k == 5) return 7;
  if (k == 6) return 8;
  if (k == 7) return 5;
  return 6;
}

float readF(ivec2 p, int k) {
  vec2 uv = (vec2(p) + 0.5) / u_gridSize;
  if (k < 4) {
    vec4 t = texture(u_f0, uv);
    if (k == 0) return t.x;
    if (k == 1) return t.y;
    if (k == 2) return t.z;
    return t.w;
  }
  if (k < 8) {
    vec4 t = texture(u_f1, uv);
    if (k == 4) return t.x;
    if (k == 5) return t.y;
    if (k == 6) return t.z;
    return t.w;
  }
  return texture(u_f2, uv).x;
}

void writeF(float f0, float f1, float f2, float f3, float f4, float f5, float f6, float f7, float f8) {
  o_f0 = vec4(f0, f1, f2, f3);
  o_f1 = vec4(f4, f5, f6, f7);
  o_f2 = vec4(f8, 0.0, 0.0, 0.0);
}

float feq(int k, float rho, float ux, float uy) {
  ivec2 cv = c(k);
  float cu = float(cv.x) * ux + float(cv.y) * uy;
  float u2 = ux * ux + uy * uy;
  return w(k) * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * u2);
}

void main() {
  ivec2 size = ivec2(u_gridSize);
  ivec2 p = ivec2(v_uv * u_gridSize);
  p = clamp(p, ivec2(0), size - ivec2(1));
  float blocked = texture(u_obstacle, (vec2(p) + 0.5) / u_gridSize).r;
  if (blocked > 0.5) {
    writeF(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    return;
  }

  float next[9];
  for (int k = 0; k < 9; k++) {
    ivec2 cv = c(k);
    ivec2 src = p - cv;
    src = clamp(src, ivec2(0), size - ivec2(1));
    float srcBlocked = texture(u_obstacle, (vec2(src) + 0.5) / u_gridSize).r;
    if (srcBlocked > 0.5) {
      next[k] = readF(p, opp(k));
    } else {
      next[k] = readF(src, k);
    }
  }

  float rho = 0.0;
  float ux = 0.0;
  float uy = 0.0;
  for (int k = 0; k < 9; k++) rho += next[k];
  if (rho < 1e-8) rho = 1.0;
  for (int k = 0; k < 9; k++) {
    ivec2 cv = c(k);
    ux += float(cv.x) * next[k];
    uy += float(cv.y) * next[k];
  }
  ux /= rho;
  uy /= rho;

  bool onWest = p.x == 0;
  bool onEast = p.x == size.x - 1;
  bool onSouth = p.y == 0;
  bool onNorth = p.y == size.y - 1;
  bool inlet = (onWest && u_inflow.x > 0.002) || (onEast && u_inflow.x < -0.002) ||
    (onSouth && u_inflow.y > 0.002) || (onNorth && u_inflow.y < -0.002);
  if (inlet) {
    ux = u_inflow.x;
    uy = u_inflow.y;
    rho = 1.0;
    for (int k = 0; k < 9; k++) next[k] = feq(k, rho, ux, uy);
  } else {
    for (int k = 0; k < 9; k++) {
      float eq = feq(k, rho, ux, uy);
      next[k] += u_omega * (eq - next[k]);
    }
  }

  writeF(next[0], next[1], next[2], next[3], next[4], next[5], next[6], next[7], next[8]);
}`;

export const LBM_GPU_MACRO_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D u_f0;
uniform sampler2D u_f1;
uniform sampler2D u_f2;
uniform sampler2D u_obstacle;
uniform vec2 u_gridSize;
layout(location = 0) out vec4 o_macro;

ivec2 c(int k) {
  if (k == 0) return ivec2(0, 0);
  if (k == 1) return ivec2(1, 0);
  if (k == 2) return ivec2(0, 1);
  if (k == 3) return ivec2(-1, 0);
  if (k == 4) return ivec2(0, -1);
  if (k == 5) return ivec2(1, 1);
  if (k == 6) return ivec2(-1, 1);
  if (k == 7) return ivec2(-1, -1);
  return ivec2(1, -1);
}

float readF(ivec2 p, int k) {
  vec2 uv = (vec2(p) + 0.5) / u_gridSize;
  if (k < 4) {
    vec4 t = texture(u_f0, uv);
    if (k == 0) return t.x;
    if (k == 1) return t.y;
    if (k == 2) return t.z;
    return t.w;
  }
  if (k < 8) {
    vec4 t = texture(u_f1, uv);
    if (k == 4) return t.x;
    if (k == 5) return t.y;
    if (k == 6) return t.z;
    return t.w;
  }
  return texture(u_f2, uv).x;
}

void main() {
  ivec2 size = ivec2(u_gridSize);
  ivec2 p = ivec2(v_uv * u_gridSize);
  p = clamp(p, ivec2(0), size - ivec2(1));
  float blocked = texture(u_obstacle, (vec2(p) + 0.5) / u_gridSize).r;
  if (blocked > 0.5) {
    o_macro = vec4(0.0, 0.0, 1.0, 0.0);
    return;
  }
  float rho = 0.0;
  float ux = 0.0;
  float uy = 0.0;
  for (int k = 0; k < 9; k++) {
    float fv = readF(p, k);
    rho += fv;
    ivec2 cv = c(k);
    ux += float(cv.x) * fv;
    uy += float(cv.y) * fv;
  }
  if (rho < 1e-8) rho = 1.0;
  ux /= rho;
  uy /= rho;
  o_macro = vec4(ux, uy, rho, length(vec2(ux, uy)));
}`;
