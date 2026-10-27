import { StyleSheet } from "react-native";

// Matched to globals.css, LoginSwitch.module.css and the default dashboard theme.
export const colors = {
  navy: "#08283F", navyDark: "#051E2E", navyMid: "#12374F",
  cream: "#F8F7F2", surface: "#FFFFFF", border: "#E4E1D6",
  ink: "#1B2734", muted: "#4A5A68", faint: "#73808C", navyMuted: "#B9C6D2",
  accent: "#780110", accentSoft: "#FDF7F8", accentBorder: "#EFCFD4",
  input: "#EAF2FB", tint: "#F2EFE7", blueLine: "#CFE1F2",
  gold: "#B98A28", goldLight: "#F5EBDB",
  green: "#2F6F4E", greenBg: "#E7F1EB", greenLight: "#E7F1EB", greenBdr: "#A3D9B1",
  red: "#A23B34", redBg: "#F5E5E3", redLight: "#F5E5E3", redBdr: "#E9B4B0",
  amber: "#A9721F", amberLight: "#F5EBDB", amberBdr: "#E9DAB8",
};
export const fonts = { regular: "Inter_400Regular", medium: "Inter_500Medium", semibold: "Inter_600SemiBold", bold: "Inter_700Bold", serif: "Newsreader_500Medium" };
export const cardShadow = { shadowColor: colors.navy, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.045, shadowRadius: 14, elevation: 1 };

// Native font families must select a loaded font for each weight.
export function createStyles(definitions) {
  return StyleSheet.create(Object.fromEntries(Object.entries(definitions).map(([key, definition]) => {
    const style = { ...definition };
    if ((style.fontSize || style.fontWeight || style.lineHeight) && !style.fontFamily) {
      const weight = Number(style.fontWeight || 400);
      style.fontFamily = weight >= 700 ? fonts.bold : weight >= 600 ? fonts.semibold : weight >= 500 ? fonts.medium : fonts.regular;
      delete style.fontWeight;
    }
    return [key, style];
  })));
}
