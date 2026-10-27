import { useToast } from "../components/ToastProvider";
import { apiErrorMessage, claimErrorMessage } from "../utils/apiError";
import PageIntro from "../components/PageIntro";
import FormField from "../components/FormField";
import { colors as T, createStyles, fonts, cardShadow } from "../theme";
import AnimatedButton from "../components/AnimatedButton";
/**
 * StudentWelcomeScreen
 *
 * The screen students land on when they open the app.
 * Two paths — clearly labelled:
 *
 *   1. Continue with Google  — for returning students who already claimed
 *      their invite and linked their Google account.
 *
 *   2. I have an invite link — student received the WhatsApp link, copies
 *      the token from the URL and pastes it here to claim their certificate.
 *      After claiming they are encouraged to link Google for future logins.
 *
 * Deep-link (credence://student-invite?token=...) bypasses this screen
 * entirely — handled in App.js before navigation even starts.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import { loginWithGoogle, claimInviteToken, getMe } from "../services/auth";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  "google-not-configured";


export default function StudentWelcomeScreen({ navigation, route, onLoginSuccess, initialError = "" }) {
  const { showToast } = useToast();
  const processedGoogle = useRef(null);
  const scrollRef = useRef(null);
  const claimLock = useRef(false);
  const claimY = useRef(0);
  const [token,      setToken]      = useState("");
  const [claiming,   setClaiming]   = useState(false);
  const [gBusy,      setGBusy]      = useState(false);
  const [error,      setError]      = useState(initialError);

  useEffect(() => { setError(initialError); }, [initialError]);
  useEffect(() => { if (error) showToast(error, { title: "Student access" }); }, [error, showToast]);

  // ── Google OAuth ──────────────────────────────────────────────────────────

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId:     GOOGLE_CLIENT_ID,
    webClientId: GOOGLE_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "google-not-configured",
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "google-not-configured",
    scopes:       ["openid", "profile", "email"],
    // Ask which account to use even when Google's browser session is still active.
    selectAccount: true,
  });

  const handleIdToken = useCallback(async (idToken) => {
    setGBusy(true);
    setError("");
    try {
      const data = await loginWithGoogle(idToken);
      const user = data.user ?? (await getMe());
      showToast("You are signed in to your student account.", { title: "Signed in", tone: "success" });
      onLoginSuccess(user);
    } catch (err) {
      setError(apiErrorMessage(err, "Google sign-in failed. Try your invitation instead."));
      setGBusy(false);
    }
  }, [onLoginSuccess, showToast]);

  useEffect(() => {
    if (!response || processedGoogle.current === response) return;
    processedGoogle.current = response;
    if (response.type === "success") {
      const idToken = response.params?.id_token;
      if (idToken) handleIdToken(idToken);
      else { setError("Google did not return a token. Please try again."); setGBusy(false); }
    } else if (response.type === "error") {
      setError(response.error?.message || "Google sign-in failed.");
    }
    if (response.type !== "success") setGBusy(false);
  }, [response, handleIdToken]);

  async function handleGooglePress() {
    if (claimLock.current || gBusy) return;
    setError("");
    if (Platform.OS === "web" && !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
      setError("Google sign-in needs configuration. Use your invitation to continue.");
      return;
    }
    if (Platform.OS !== "web" && Constants.executionEnvironment === "storeClient") {
      setError("Google sign-in requires the Credence development build. Expo Go can still open your invitation.");
      return;
    }
    const nativeClientId = Platform.OS === "android"
      ? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
      : process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    if (Platform.OS !== "web" && !nativeClientId) {
      setError("Google sign-in needs configuration for this device. Use your invite link to continue.");
      return;
    }
    setGBusy(true);
    try {
      await promptAsync();
    } catch (err) {
      setError(err?.message || "Unable to open Google sign-in.");
      setGBusy(false);
    }
  }

  // ── Invite token claim ────────────────────────────────────────────────────
  async function handleClaimToken() {
    if (claimLock.current || gBusy) return;
    claimLock.current = true;
    setClaiming(true);
    setError("");
    try {
      const data = await claimInviteToken(token);
      const user = data.user ?? (await getMe());
      showToast("Your credential is now linked to your student account. Complete your profile and link Google.", { title: "Credential claimed", tone: "success" });
      // The authenticated navigator opens the student dashboard.
      onLoginSuccess(user);
    } catch (err) {
      setError(claimErrorMessage(err));
    } finally {
      claimLock.current = false;
      setClaiming(false);
    }
  }

  const busy = claiming || gBusy;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: T.cream }}
    >
      <ScrollView
        ref={scrollRef}
        onContentSizeChange={() => { if (route?.params?.intent === "claim") scrollRef.current?.scrollTo({ y: claimY.current, animated: false }); }}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Error / success ── */}
        <PageIntro eyebrow="STUDENT ACCESS" title="Your achievements.
One place to keep them." description="Claim your institution invitation or sign in to your credential collection." dark serif />
        <View style={s.accessSteps}><Text style={s.accessStep}>01  Claim invitation</Text><Text style={s.accessStep}>02  Link Google</Text><Text style={s.accessStep}>03  Keep & share</Text></View>


        {/* ── Path 1: Google (returning students) ── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Returning student</Text>
          <Text style={s.cardSub}>
            Already claimed your certificate? Sign in with the Google account linked in your student profile.
          </Text>
          <TouchableOpacity
            style={[s.googleBtn, (busy || !request) && s.disabled]}
            onPress={handleGooglePress}
            disabled={busy || !request}
            activeOpacity={0.85}
          >
            {gBusy
              ? <ActivityIndicator color={T.navy} size="small" />
              : (
                <View style={s.googleBtnInner}>
                  <Text style={s.gIcon}>G</Text>
                  <Text style={s.googleBtnText}>Continue with Google</Text>
                </View>
              )
            }
          </TouchableOpacity>
        </View>

        {/* ── Divider ── */}
        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        {/* ── Path 2: Invite token (first-time students) ── */}
        <View style={s.card} onLayout={event => { claimY.current = event.nativeEvent.layout.y; }}>
          <Text style={s.cardLabel}>Claim your credential</Text>
          <Text style={s.cardSub}>
            Your WhatsApp message contains a link ending with{"\n"}
            <Text style={s.example}>…student-invite?token=HSt-CquA-2AF…</Text>
            {"\n\n"}Paste the full link, or just the token after{" "}
            <Text style={s.example}>token=</Text>
          </Text>

          <FormField
            label="Invitation link or token"
            style={[s.tokenInput, claiming && s.disabled]}
            placeholder="Paste invite link or token here"
            placeholderTextColor={T.faint}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            numberOfLines={2}
            editable={!busy}
          />

          <AnimatedButton label="Claim my credential" onPress={handleClaimToken} busy={claiming} disabled={gBusy} />
        </View>

        {/* ── Verify without signing in ── */}
        <AnimatedButton label="Verify a certificate (no login needed)" onPress={() => navigation.navigate("Verify")} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = createStyles({
  scroll: { paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 48, gap: 16, width: "100%", maxWidth: 720, alignSelf: "center" },
  accessSteps: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 4 },
  accessStep: { color: T.muted, fontSize: 10, fontWeight: "500" },

  // Alerts
  errorBox:   { backgroundColor: T.redBg,   borderRadius: 10, padding: 13, marginBottom: 14 },
  errorText:  { color: T.red,   fontSize: 13, lineHeight: 19 },
  successBox: { backgroundColor: T.greenBg, borderRadius: 10, padding: 13, marginBottom: 14 },
  successText:{ color: T.green, fontSize: 13, lineHeight: 19, fontWeight: "600" },

  // Card
  card: { backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 20, gap: 14, ...cardShadow },
  cardLabel: { fontSize: 18, fontWeight: "600", color: T.navy },
  cardSub: { fontSize: 13, color: T.muted, lineHeight: 22 },
  example:   { fontFamily: "monospace", fontSize: 11, color: T.faint },

  // Google button
  googleBtn: { minHeight: 50, borderRadius: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, alignItems: "center", justifyContent: "center" },
  googleBtnInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  gIcon:          { fontSize: 17, fontWeight: "800", color: "#4285F4", width: 20, textAlign: "center" },
  googleBtnText:  { fontSize: 15, fontWeight: "600", color: T.navy },

  // Divider
  divider: { flexDirection: "row", alignItems: "center", gap: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.border },
  dividerText: { fontSize: 12, color: T.faint },

  // Token input
  tokenInput: { minHeight: 88, textAlignVertical: "top" },

  // Gold claim button
  btnGold: {
    height: 50,
    backgroundColor: T.gold,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGoldText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  disabled: { opacity: 0.55 },

  // Bottom link
  verifyRow: { alignItems: "center", paddingTop: 22 },
  verifyText:{ color: T.faint, fontSize: 12 },
});
