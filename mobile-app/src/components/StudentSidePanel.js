import React, {useState} from "react";
import {Modal, Pressable, ScrollView, Text, TouchableOpacity, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {LayoutDashboard, ScanLine, FileText, BookOpen, Settings, UserRound, X, ChevronDown, LogOut} from "lucide-react-native";
import {colors as T} from "../theme";

export default function StudentSidePanel({visible, onClose, navigation, user, onLogout}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const go = (screen, params) => {onClose(); navigation.navigate(screen, params);};
  const item = (label, Icon, action, nested = false) => <TouchableOpacity key={label} accessibilityRole="button" onPress={action} style={{flexDirection: "row", alignItems: "center", gap: 12, minHeight: 50, paddingHorizontal: nested ? 30 : 14, borderRadius: 10}}><Icon size={20} color={T.cream} /><Text style={{color: T.cream, fontSize: 15, fontWeight: "500"}}>{label}</Text></TouchableOpacity>;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{flex: 1, flexDirection: "row", backgroundColor: "rgba(0,0,0,.5)"}}>
      <SafeAreaView accessibilityViewIsModal style={{width: "82%", maxWidth: 320, backgroundColor: T.navy, height: "100%"}}>
        <View style={{padding: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderColor: "rgba(255,255,255,.15)"}}><Text accessibilityRole="header" style={{color: T.cream, fontWeight: "700", fontSize: 22}}>Credence</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close navigation" onPress={onClose} style={{padding: 10}}><X size={22} color={T.cream} /></TouchableOpacity></View>
        <ScrollView contentContainerStyle={{padding: 12, gap: 4}}>
          {item("Dashboard", LayoutDashboard, () => go("Dashboard", {view: "overview"}))}
          {item("View credentials", FileText, () => go("Dashboard", {view: "credentials"}))}
          {item("Verify", ScanLine, () => go("Verify"))}
          {item("Welcome guide", BookOpen, () => go("Onboarding"))}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded: settingsOpen}} onPress={() => setSettingsOpen(value => !value)} style={{flexDirection: "row", gap: 12, alignItems: "center", padding: 14, minHeight: 50}}><Settings size={20} color={T.cream} /><Text style={{flex: 1, color: T.cream, fontSize: 15}}>Settings</Text><ChevronDown size={18} color={T.cream} style={{transform: [{rotate: settingsOpen ? "180deg" : "0deg"}]}} /></TouchableOpacity>
          {settingsOpen && item("Profile", UserRound, () => go("StudentAccount", {afterClaim: false}), true)}
        </ScrollView>
        <View style={{padding: 16, borderTopWidth: 1, borderColor: "rgba(255,255,255,.15)"}}><Text numberOfLines={1} style={{color: T.cream, fontWeight: "600", marginBottom: 4}}>{user?.first_name || "Student"}</Text><Text numberOfLines={1} style={{color: T.cream, opacity: .7, fontSize: 12, marginBottom: 8}}>{user?.email}</Text>{item("Sign out", LogOut, () => {onClose(); onLogout();})}</View>
      </SafeAreaView>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss navigation" onPress={onClose} style={{flex: 1}} />
    </View>
  </Modal>;
}
