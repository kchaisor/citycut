export const MAP_VECTOR_ATTRIBUTION = {
  openFreeMap: { label: "OpenFreeMap", href: "https://openfreemap.org/" },
  openMapTiles: { label: "© OpenMapTiles", href: "https://www.openmaptiles.org/" },
  openStreetMap: { label: "© OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" },
} as const;

export const MAP_SATELLITE_ATTRIBUTION = {
  esri: {
    label: "Esri World Imagery",
    href: "https://www.esri.com/en-us/legal/terms/full-master-agreements",
  },
  contributors:
    "Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community",
} as const;
