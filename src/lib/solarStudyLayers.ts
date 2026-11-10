export function shadowTimeLabel(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function existingShadowLayerName(hour: number, minute = 0): string {
  return `Existing shadow ${shadowTimeLabel(hour, minute)}`;
}

export function addedShadowLayerName(hour: number, minute = 0): string {
  return `Added shadow ${shadowTimeLabel(hour, minute)}`;
}

export function receptorLayerName(id: string, statusTone: string): string {
  return `Receptor ${id} (${statusTone})`;
}

export function isSunStudyShadowLayerName(name: string): boolean {
  return /^Existing shadow \d{2}:\d{2}$/.test(name) || /^Added shadow \d{2}:\d{2}$/.test(name);
}
