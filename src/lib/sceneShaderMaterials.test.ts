// @vitest-environment happy-dom
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDepthRestore } from "./postOverlay";
import { NON_COLOUR_SHADER_MATERIAL_FILES, SCENE_SHADER_MATERIAL_FACTORIES } from "./sceneShaderMaterials";

vi.mock("./colours", () => ({ getColour: () => "#336699" }));

const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("scene ShaderMaterial output settings", () => {
  for (const [file, make] of Object.entries(SCENE_SHADER_MATERIAL_FACTORIES)) {
    it(`${file} applies tone mapping and colour space like built-in materials`, () => {
      const material = make();
      expect(material.toneMapped).toBe(true);
      expect(material.fragmentShader).toContain("#include <tonemapping_fragment>");
      expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
      const body = material.fragmentShader;
      expect(body.indexOf("gl_FragColor")).toBeLessThan(body.indexOf("#include <tonemapping_fragment>"));
      expect(body.indexOf("#include <tonemapping_fragment>")).toBeLessThan(body.indexOf("#include <colorspace_fragment>"));
      material.dispose();
    });
  }

  it("every source file that builds a ShaderMaterial is listed", () => {
    const listed = new Set([...Object.keys(SCENE_SHADER_MATERIAL_FACTORIES), ...NON_COLOUR_SHADER_MATERIAL_FILES]);
    const builders = sourceFiles(SRC)
      .filter((file) => /new (?:THREE\.)?ShaderMaterial\(/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(path.resolve(SRC, ".."), file).split(path.sep).join("/"));
    expect(builders.filter((file) => !listed.has(file))).toEqual([]);
  });

  it("the depth-restore material stays colour-less", () => {
    const restore = createDepthRestore();
    expect(restore.material.colorWrite).toBe(false);
    restore.dispose();
  });
});
