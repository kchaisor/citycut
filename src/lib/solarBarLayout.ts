export const ENV_CONSOLE_INSET_PX = 13;
export const ENV_CONSOLE_ROW_PX = 28;
export const ENV_CONSOLE_ONE_ROW_CONTENT_PX = 680;

export function envConsoleBarWidth(): number {
  return ENV_CONSOLE_ONE_ROW_CONTENT_PX + ENV_CONSOLE_INSET_PX * 2;
}

export function envConsoleRowFits(barWidth: number, rowContentPx: number): boolean {
  return rowContentPx <= barWidth - ENV_CONSOLE_INSET_PX * 2;
}
