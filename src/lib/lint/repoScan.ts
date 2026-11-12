import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export function walkFiles(root: string, test: (path: string) => boolean): string[] {
  const found: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
        visit(path);
        continue;
      }
      if (entry.isFile() && test(path)) found.push(path);
    }
  };
  visit(root);
  return found;
}

export function relFromRoot(root: string, file: string): string {
  return relative(root, file).split("\\").join("/");
}

export function readText(file: string): string {
  return readFileSync(file, "utf8");
}
