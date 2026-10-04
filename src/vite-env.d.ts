/// <reference types="vite/client" />

declare module "rhino3dm/rhino3dm.module.js" {
  import type rhino3dmFactory from "rhino3dm";
  const rhino3dm: typeof rhino3dmFactory;
  export default rhino3dm;
}

declare module "node:fs/promises" {
  export function readFile(path: string): Promise<Uint8Array>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>>;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export const sep: string;
}

declare module "node:module" {
  export function createRequire(filename: string | URL): {
    resolve(specifier: string): string;
  };
}

declare module "node:url" {
  export function fileURLToPath(url: URL | string): string;
}

interface ImportMetaEnv {
  readonly VITE_NOMINATIM_URL?: string;
}
