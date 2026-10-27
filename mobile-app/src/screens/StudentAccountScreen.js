import { useToast } from "../components/ToastProvider";
import { apiErrorMessage } from "../utils/apiError";
import { colors, createStyles, fonts, cardShadow } from "../theme";
import PageIntro from "../components/PageIntro";
import FormField from "../components/FormField";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AnimatedButton from "../components/AnimatedButton";
import GoogleAccountButton from "../components/GoogleAccountButton";
import { linkGoogleAccount, updateStudentProfile } from "../services/auth";

export default function StudentAccountScreen({ user, onUserUpdate, navigation, afterClaim = false }) {
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [phone, setPhone] = useState(user?.phone_number || "");
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = saving || linking;
  useEffect(() => { if (error) showToast(error, { title: "Student account" }); }, [error, showToast]);
  useEffect(() => { if (notice) showToast(notice, { title: "Account updated", tone: "success" }); }, [notice, showToast]);

  async function saveProfile() {
    if (busy) return;
    if (!firstName.trim() || !lastName.trim()) { setError("Enter your first and last name."); return; }
    if (phone.trim() && !/^\+[1-9]\d{7,14}$/.test(phone.trim())) { setError("Use an international phone number, for example +23276123456, or leave it blank."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await updateStudentProfile({ first_name: firstName.trim(), last_name: lastName.trim(), phone_number: phone.trim() });
      onUserUpdate(updated);
      setNotice("Your profile has been saved.");
    } catch (err) {
      const data = err?.response?.data;
      setError(apiErrorMessage(err, "Could not save your profile. Check your connection and try again."));
    } finally { setSaving(false); }
  }

  async function connectGoogle(idToken) {
    setLinking(true); setError(""); setNotice("");
    try {
      const updated = await linkGoogleAccount(idToken);
      onUserUpdate(updated);
      setNotice("Google account linked. Use Continue with Google the next time you sign in.");
    } finally { setLinking(false); }
  }

  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <PageIntro eyebrow={afterClaim ? "CREDENTIAL CLAIMED" : "PROFILE & ACCOUNT"} title={afterClaim ? "Make it yours." : "Your student account"} description={afterClaim ? "Your credential is ready. Complete your profile and connect Google for your next visit." : "Manage your profile and the account you use to sign in."} dark />
      <View style={s.card}>
        <Text style={s.heading}>Your profile</Text>
        <FormField label="First name" accessibilityLabel="First name" value={firstName} onChangeText={setFirstName} editable={!busy} autoComplete="given-name" />
        <FormField label="Last name" accessibilityLabel="Last name" value={lastName} onChangeText={setLastName} editable={!busy} autoComplete="family-name" />
        <Text style={s.label}>Institution account email</Text>
        <Text selectable style={s.body}>{user?.email}</Text>
        <Text style={s.hint}>Your institution uses this email for your credential records. Linking Google keeps it unchanged.</Text>
        <FormField label="Phone number (optional)" accessibilityLabel="Phone number" value={phone} onChangeText={setPhone} editable={!busy} keyboardType="phone-pad" placeholder="+23276123456" />
        <AnimatedButton label={saving ? "Saving profile..." : "Save profile"} onPress={saveProfile} busy={saving} disabled={linking} />
      </View>
      <View style={s.card}>
        <Text style={s.heading}>Google account</Text>
        {user?.google_linked ? <>
          <Text style={s.success}>Google is linked</Text>
          <Text selectable style={s.body}>{user.google_email}</Text>
          <Text style={s.hint}>Use this Google account to sign in and return to your credentials.</Text>
        </> : <>
          <Text style={s.body}>Connect a Google account you own. It can use a different email from your institution account.</Text>
          <GoogleAccountButton onToken={connectGoogle} disabled={busy} />
          <Text style={s.hint}>Your invitation is used once. Link Google before signing out so you have a way to return.</Text>
        </>}
      </View>
      <AnimatedButton label={afterClaim ? "Continue to my credentials" : "Back to my credentials"} disabled={busy} onPress={() => navigation.navigate("Dashboard")} />
    </ScrollView>
  </KeyboardAvoidingView>;
}

const s = createStyles({
  root: { flex: 1, backgroundColor: "#F8F7F2" },
  scroll: { padding: 20, paddingBottom: 48, gap: 20, width: "100%", maxWidth: 720, alignSelf: "center" },
  eyebrow: { color: "#B98A28", fontSize: 12, fontWeight: "700" },
  title: { color: "#08283F", fontSize: 27, fontWeight: "700" },
  body: { color: "#4A5A68", lineHeight: 23, fontSize: 15 },
  hint: { color: "#4A5A68", lineHeight: 20, fontSize: 13 },
  card: { padding: 20, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: "#E4E1D6", gap: 12 },
  heading: { fontSize: 17, fontWeight: "600", color: "#08283F" },
  label: { color: "#08283F", fontSize: 14, fontWeight: "600" },
  input: { padding: 13, minHeight: 48, borderWidth: 1, borderColor: "#E4E1D6", borderRadius: 10, color: "#08283F", backgroundColor: "#F8F7F2" },
  error: { color: "#A23B34", lineHeight: 22 },
  success: { color: "#2E7D32", lineHeight: 22, fontWeight: "600" },
});
