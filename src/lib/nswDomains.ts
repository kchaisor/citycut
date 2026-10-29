import domains from "../content/regions/nswDomains.json";

type DomainLayer = {
  sources: string[];
  subtypeField: string | null;
  subtypes: Record<string, string>;
  fields: Record<string, Record<string, string>>;
  bySubtype: Record<string, Record<string, Record<string, string>>>;
};

const LAYERS = (domains as unknown as { layers: Record<string, DomainLayer> }).layers;

export type NswDomainLayer = keyof typeof domains.layers;

export type Decoded = { text: string; known: boolean; raw: string };

const splitCamel = (word: string) => word.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

export function humanise(name: string): string {
  if (/\s/.test(name)) return name.split(" ").map(splitCamel).join(" ");
  const words = splitCamel(name).split(" ");
  return words
    .map((word, index) => (index === 0 || (word.length > 1 && word === word.toUpperCase()) ? word : word.toLowerCase()))
    .join(" ");
}

function rawText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

export function decodeSubtype(layer: NswDomainLayer, value: unknown): Decoded | null {
  const raw = rawText(value);
  if (!raw) return null;
  const name = LAYERS[layer]?.subtypes[raw];
  return name ? { text: humanise(name), known: true, raw } : { text: `code ${raw}`, known: false, raw };
}

export function decodeField(layer: NswDomainLayer, field: string, value: unknown, subtype?: unknown): Decoded | null {
  const raw = rawText(value);
  if (!raw) return null;
  const meta = LAYERS[layer];
  const sub = subtype == null ? null : meta?.bySubtype[rawText(subtype)]?.[field];
  const domain = sub ?? meta?.fields[field];
  if (!domain) return { text: raw, known: true, raw };
  const name = domain[raw];
  return name ? { text: humanise(name), known: true, raw } : { text: `code ${raw}`, known: false, raw };
}

export function isCodedField(layer: NswDomainLayer, field: string): boolean {
  const meta = LAYERS[layer];
  if (!meta) return false;
  return Boolean(meta.fields[field]) || Object.values(meta.bySubtype).some((fields) => Boolean(fields[field]));
}

export const NSW_DOMAIN_SNAPSHOT_DATE: string = domains.generated;

export class UnknownCodes {
  private counts = new Map<string, number>();
  constructor(private readonly label: string) {}
  add(field: string, decoded: Decoded | null) {
    if (!decoded || decoded.known) return;
    const key = `${field} ${decoded.raw}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  note(): string | null {
    if (this.counts.size === 0) return null;
    const parts = [...this.counts].map(([key, n]) => `${key} (${n})`);
    return `${this.label}: codes not in the published domain, shown raw: ${parts.join(", ")}.`;
  }
}
