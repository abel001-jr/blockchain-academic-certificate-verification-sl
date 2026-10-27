import React from "react";
import {Menu} from "lucide-react-native";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { colors, createStyles } from "../theme";

export default function BrandHeader({ action, onAction, subtitle = "ACADEMIC CREDENTIALING", onMenuPress, menuOpen = false }) {
  return <View style={s.header}>
    {onMenuPress && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation" accessibilityState={{expanded: menuOpen}} onPress={onMenuPress} style={{minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center"}}><Menu size={24} color={colors.navy} /></TouchableOpacity>}
    <View style={s.brand}>
      <Image source={require("../../assets/restored-shield.png")} style={s.logo} accessibilityIgnoresInvertColors />
      <View style={s.copy}><Text style={s.name}>Credence</Text><Text style={s.subtitle}>{subtitle}</Text></View>
    </View>
    {action ? <TouchableOpacity accessibilityRole="button" onPress={onAction} style={s.action}><Text style={s.actionText}>{action}</Text></TouchableOpacity> : null}
  </View>;
}
const s = createStyles({
  header: { minHeight: 76, backgroundColor: colors.surface, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  logo: { width: 32, height: 38, resizeMode: "contain" },
  copy: { flexShrink: 1 },
  name: { color: colors.navy, fontSize: 21, fontWeight: "700", letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 8, letterSpacing: 1.2, marginTop: 3 },
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  actionText: { color: colors.navy, fontSize: 12, fontWeight: "600" },
});
