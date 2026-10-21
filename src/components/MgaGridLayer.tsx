import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import {
  buildCache,
  cacheCovers,
  crossVertices,
  finestVisibleStep,
  levelOpacity,
  lonLatToMercator,
  metresPerPixel,
  MGA_GRID_LAYER_ID,
  translateMatrix,
  type GridCache,
} from "../lib/mgaGridLayer";

const VERTEX = `
attribute vec2 a_centre;
attribute vec2 a_offset;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
void main() {
  vec4 p = u_matrix * vec4(a_centre, 0.0, 1.0);
  p.xy += a_offset * vec2(2.0, -2.0) / u_viewport * p.w;
  gl_Position = p;
}`;
const FRAGMENT = `
precision mediump float;
uniform vec3 u_ink;
uniform float u_opacity;
void main() {
  gl_FragColor = vec4(u_ink * u_opacity, u_opacity);
}`;

function inkRgb(element: HTMLElement): [number, number, number] {
  const probe = document.createElement("span");
  probe.style.color = "var(--grid-cross)";
  element.appendChild(probe);
  const match = getComputedStyle(probe).color.match(/[\d.]+/g) ?? [];
  probe.remove();
  const [r = 0, g = 0, b = 0] = match.map(Number);
  return [r / 255, g / 255, b / 255];
}

type RankBuffer = { rank: number; centres: WebGLBuffer; offsets: WebGLBuffer; count: number };

function crossLayer(map: maplibregl.Map, container: HTMLElement): maplibregl.CustomLayerInterface {
  let program: WebGLProgram | null = null;
  let buffers: RankBuffer[] = [];
  let cache: GridCache | null = null;
  let origin: [number, number] = [0, 0];
  let ink: [number, number, number] = [0, 0, 0];
  let arm = 4.2;
  let inkAlpha = 0.7;
  const loc = { centre: -1, offset: -1, matrix: null as WebGLUniformLocation | null, viewport: null as WebGLUniformLocation | null, ink: null as WebGLUniformLocation | null, opacity: null as WebGLUniformLocation | null };

  const freeBuffers = (gl: WebGLRenderingContext) => {
    for (const b of buffers) {
      gl.deleteBuffer(b.centres);
      gl.deleteBuffer(b.offsets);
    }
    buffers = [];
  };

  const rebuild = (gl: WebGLRenderingContext, view: { west: number; south: number; east: number; north: number }, step: number) => {
    cache = buildCache(view, step);
    origin = lonLatToMercator((cache.west + cache.east) / 2, (cache.south + cache.north) / 2);
    freeBuffers(gl);
    let total = 0;
    for (const [rank, lonLats] of cache.ranks) {
      const rel = new Float64Array(lonLats.length);
      for (let i = 0; i < lonLats.length; i += 2) {
        const [x, y] = lonLatToMercator(lonLats[i]!, lonLats[i + 1]!);
        rel[i] = x - origin[0];
        rel[i + 1] = y - origin[1];
      }
      const v = crossVertices(rel, arm);
      const centres = gl.createBuffer();
      const offsets = gl.createBuffer();
      if (!centres || !offsets) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, centres);
      gl.bufferData(gl.ARRAY_BUFFER, v.centres, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, offsets);
      gl.bufferData(gl.ARRAY_BUFFER, v.offsets, gl.STATIC_DRAW);
      buffers.push({ rank, centres, offsets, count: v.count });
      total += lonLats.length / 2;
    }
    container.dataset.gridCrosses = String(total);
  };

  return {
    id: MGA_GRID_LAYER_ID,
    type: "custom",
    renderingMode: "2d",
    onAdd(_map, gl) {
      const style = getComputedStyle(container);
      arm = Number.parseFloat(style.getPropertyValue("--grid-cross-arm")) || 4.2;
      const alpha = Number.parseFloat(style.getPropertyValue("--grid-cross-opacity"));
      inkAlpha = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0.7;
      ink = inkRgb(container);
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
      };
      program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      loc.centre = gl.getAttribLocation(program, "a_centre");
      loc.offset = gl.getAttribLocation(program, "a_offset");
      loc.matrix = gl.getUniformLocation(program, "u_matrix");
      loc.viewport = gl.getUniformLocation(program, "u_viewport");
      loc.ink = gl.getUniformLocation(program, "u_ink");
      loc.opacity = gl.getUniformLocation(program, "u_opacity");
    },
    onRemove(_map, gl) {
      freeBuffers(gl);
      if (program) gl.deleteProgram(program);
      program = null;
      cache = null;
    },
    render(gl, options) {
      if (!program) return;
      const b = map.getBounds();
      const view = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      const mpp = metresPerPixel(map.getZoom(), map.getCenter().lat);
      const step = finestVisibleStep(mpp);
      container.dataset.gridStep = String(step);
      // Rebuilt synchronously inside the frame: nothing is ever missing for a frame.
      if (!cacheCovers(cache, view, step)) rebuild(gl, view, step);
      const canvas = map.getCanvas();
      gl.useProgram(program);
      gl.uniformMatrix4fv(loc.matrix, false, translateMatrix(options.defaultProjectionData.mainMatrix as ArrayLike<number>, origin[0], origin[1]));
      gl.uniform2f(loc.viewport, canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
      gl.uniform3f(loc.ink, ink[0], ink[1], ink[2]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      for (const buffer of buffers) {
        const opacity = levelOpacity(buffer.rank, mpp) * inkAlpha;
        if (opacity < 0.004) continue;
        gl.uniform1f(loc.opacity, opacity);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.centres);
        gl.enableVertexAttribArray(loc.centre);
        gl.vertexAttribPointer(loc.centre, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.offsets);
        gl.enableVertexAttribArray(loc.offset);
        gl.vertexAttribPointer(loc.offset, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, buffer.count);
      }
      gl.disableVertexAttribArray(loc.centre);
      gl.disableVertexAttribArray(loc.offset);
    },
  };
}

/**
 * Map grid on the landing map: thin dark + crosses on a 10 m–50 km ladder, square to the page
 * (rows and columns follow Web Mercator east/north, like the cut frame). Earlier builds used MGA
 * intersections, which sit at the grid convergence (~1.1° at Dandenong). It only reads the camera,
 * never sets it. `epoch` re-adds the layer after a basemap swap.
 */
export function MgaGridLayer({ map, epoch }: { map: maplibregl.Map | null; epoch: number }) {
  useEffect(() => {
    if (!map || typeof map.addLayer !== "function" || typeof map.getLayer !== "function" || typeof map.getContainer !== "function" || typeof map.getCanvas !== "function") return;
    const container = map.getContainer();
    const ensure = () => {
      try {
        if (!map.getLayer(MGA_GRID_LAYER_ID)) map.addLayer(crossLayer(map, container));
      } catch {
        // Style mid-swap: the next styledata/idle event retries.
      }
    };
    ensure();
    map.on("styledata", ensure);
    map.on("idle", ensure);
    return () => {
      map.off("styledata", ensure);
      map.off("idle", ensure);
      try {
        if (map.getLayer(MGA_GRID_LAYER_ID)) map.removeLayer(MGA_GRID_LAYER_ID);
      } catch {
        // Map already torn down.
      }
    };
  }, [map, epoch]);
  return null;
}
