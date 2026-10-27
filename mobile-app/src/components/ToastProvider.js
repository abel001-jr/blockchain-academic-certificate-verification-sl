import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";

const ToastContext = createContext(null);
export function useToast() { return useContext(ToastContext); }

export default function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const dismiss = useCallback(() => { clearTimeout(timer.current); setToast(null); }, []);
  const showToast = useCallback((message, { title = "", tone = "error" } = {}) => {
    clearTimeout(timer.current);
    setToast({ message, title, tone });
    if (tone === "success" || tone === "info") timer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);
  const color = toast?.tone === "success" ? colors.green : toast?.tone === "warning" ? colors.amber : toast?.tone === "info" ? colors.navy : colors.red;
  return <ToastContext.Provider value={value}>
    <View style={s.root}>
      {children}
      {toast && <View pointerEvents="box-none" style={[s.position, { top: insets.top + 12 }]}>
        <View accessibilityRole="alert" accessibilityLiveRegion={toast.tone === "error" ? "assertive" : "polite"} style={[s.card, { borderLeftColor: color }]}>
          <View style={s.copy}>{toast.title ? <Text style={[s.title, { color }]}>{toast.title}</Text> : null}<Text style={s.message}>{toast.message}</Text></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={dismiss} style={s.close}><Text style={s.closeText}>×</Text></TouchableOpacity>
        </View>
      </View>}
    </View>
  </ToastContext.Provider>;
}

const s = StyleSheet.create({
  root: { flex: 1 }, position: { position: "absolute", left: 16, right: 16, zIndex: 999, alignItems: "center" },
  card: { width: "100%", maxWidth: 600, flexDirection: "row", alignItems: "flex-start", borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, backgroundColor: colors.surface, padding: 16, elevation: 10, shadowColor: colors.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  copy: { flex: 1 }, title: { fontWeight: "700", fontSize: 15, marginBottom: 5 }, message: { fontSize: 14, lineHeight: 21, color: colors.ink },
  close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: -8, marginRight: -8 }, closeText: { fontSize: 25, color: colors.muted },
});
