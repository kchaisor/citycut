export function roadNameFromOvertureProps(props: Record<string, unknown>): string | undefined {
  const names = props.names as { primary?: string; common?: Record<string, string> } | undefined;
  const primary = typeof names?.primary === "string" ? names.primary.trim() : "";
  if (primary) return primary;
  const common = names?.common;
  if (common && typeof common === "object") {
    for (const value of Object.values(common)) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return undefined;
}
