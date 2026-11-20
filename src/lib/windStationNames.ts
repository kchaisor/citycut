const READABLE: Record<string, string> = {
  "948700": "Moorabbin Airport",
  "959360": "Olympic Park",
  "948640": "Essendon Fields",
  "958660": "Essendon Fields",
  "948680": "Melbourne Regional Office",
  "958640": "St Kilda Harbour",
  "958730": "La Trobe University",
  "958740": "Viewbank",
  "948650": "RAAF Laverton",
  "947670": "Sydney Airport",
  "947680": "Sydney Observatory Hill",
  "957640": "Riverview Observatory",
  "947660": "Canterbury Park Racecourse",
};

export function readableWindStationName(epwName: string, stationId?: string): string {
  if (stationId && READABLE[stationId]) return READABLE[stationId]!;
  let s = epwName.replace(/\.(AP|ARP|ARPNSA|RO|RMYS)$/i, "").replace(/-/g, " ");
  s = s.replace(/\bAP\b/g, "Airport").replace(/\s+/g, " ").trim();
  if (s.includes("Moorabbin")) return "Moorabbin Airport";
  if (s.includes("Olympic Park")) return "Olympic Park";
  if (s.includes("Essendon")) return "Essendon Fields";
  return s;
}