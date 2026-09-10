// Theme overrides for the embedded Stack Auth form (Zyli palette).

import type { StackTheme } from "@stackframe/stack";
import type { ComponentProps } from "react";

type ThemeConfig = NonNullable<ComponentProps<typeof StackTheme>["theme"]>;

export const stackAuthDarkTheme: ThemeConfig = {
  light: {
    background: "#FFFFFF",
    foreground: "#0F172A",
    card: "#FFFFFF",
    cardForeground: "#0F172A",
    popover: "#FFFFFF",
    popoverForeground: "#0F172A",
    primary: "#7F1425",
    primaryForeground: "#FFFFFF",
    secondary: "#FCECEF",
    secondaryForeground: "#7F1425",
    muted: "#FCECEF",
    mutedForeground: "#64748B",
    accent: "#FBF0F2",
    accentForeground: "#0F172A",
    destructive: "#DC2626",
    destructiveForeground: "#FFFFFF",
    border: "#E2E8F0",
    input: "#E2E8F0",
    ring: "#7F1425",
  },
  dark: {
    background: "#1E293B",
    foreground: "#EEF2F7",
    card: "#1E293B",
    cardForeground: "#EEF2F7",
    popover: "#1E293B",
    popoverForeground: "#EEF2F7",
    primary: "#7F1425",
    primaryForeground: "#FFFFFF",
    secondary: "#0F172A",
    secondaryForeground: "#EEF2F7",
    muted: "#0F172A",
    mutedForeground: "#94A3B8",
    accent: "rgba(255, 255, 255, 0.08)",
    accentForeground: "#EEF2F7",
    destructive: "#DC2626",
    destructiveForeground: "#FFFFFF",
    border: "#334155",
    input: "#334155",
    ring: "#7F1425",
  },
  radius: "0.625rem",
};
