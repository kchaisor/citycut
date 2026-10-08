export const OVERTURE_RELEASE_FALLBACK: string;

export function releaseIdFromStacHref(href: string | null | undefined): string | null;

export function releaseFromStacCatalog(catalog: {
  latest?: string;
  links?: { rel: string; href: string; latest?: boolean }[];
}): string;
