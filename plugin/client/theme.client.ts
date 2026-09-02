import type { PluginTheme } from "@getpaseo/plugin";

/**
 * Every colour comes from the host theme. Unstyled text renders black and is
 * unreadable in Paseo's dark themes, so nothing here hardcodes a value.
 */
export function makeStyles(theme: PluginTheme, compact: boolean) {
  const pad = compact ? 12 : 20;
  const c = theme.colors;
  return {
    pad,
    screen: { flex: 1, backgroundColor: c.surface0 } as const,
    body: { color: c.foreground, fontSize: compact ? 15 : 16, lineHeight: compact ? 22 : 25 },
    muted: { color: c.foregroundMuted, fontSize: compact ? 13 : 14 },
    heading: { color: c.foreground, fontWeight: "600" as const },
    link: { color: c.accent, textDecorationLine: "underline" as const },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingVertical: compact ? 10 : 12,
      paddingHorizontal: pad,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    bar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      padding: compact ? 8 : 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface1,
    },
    button: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.surface2 },
    buttonOn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.accent },
    buttonText: { color: c.foreground, fontSize: 13 },
    buttonTextOn: { color: c.accentForeground, fontSize: 13 },
    input: {
      margin: pad,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      color: c.foreground,
      backgroundColor: c.surface1,
    },
    danger: { color: c.statusDanger, padding: pad, fontSize: compact ? 14 : 15 },
    centre: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, padding: pad },
    cell: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: c.border,
      minWidth: 120,
      maxWidth: 260,
    },
  };
}

export type Styles = ReturnType<typeof makeStyles>;

const UNITS = ["B", "KB", "MB", "GB"];

export function humanSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

export const KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  image: "Image",
  document: "Document",
  sheet: "Spreadsheet",
};
