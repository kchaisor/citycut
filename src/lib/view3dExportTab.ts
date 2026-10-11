export const VIEW3D_EXPORT_TOOLTIP = "Switch to the 3D tab to export the 3D view";

export function view3dExportBlocked(tab: string): boolean {
  return tab !== "3d";
}
