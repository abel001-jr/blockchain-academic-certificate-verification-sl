import { useToast } from "./ToastProvider";
import { apiErrorMessage } from "../utils/apiError";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import AnimatedButton from "./AnimatedButton";

WebBrowser.maybeCompleteAuthSession();

export default function GoogleAccountButton({ onToken, disabled = false, label = "Link Google account" }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (error) showToast(error, { title: "Google account" }); }, [error, showToast]);
  const callback = useRef(onToken);
  callback.current = onToken;
  const processed = useRef(null);
  const webId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const iosId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    // An inert placeholder keeps the setup screen usable before OAuth is configured.
    clientId: webId || "google-not-configured",
    webClientId: webId || "google-not-configured",
    androidClientId: androidId || "google-not-configured",
    iosClientId: iosId || "google-not-configured",
    selectAccount: true,
  });

  useEffect(() => {
    if (!response || processed.current === response) return;
    processed.current = response;
    if (response.type !== "success") {
      setBusy(false);
      if (response.type === "error") setError("Google sign-in could not complete. Please try again.");
      return;
    }
    const idToken = response.params?.id_token || response.authentication?.idToken;
    if (!idToken) {
      setBusy(false);
      setError("Google did not return an identity token. Please try again.");
      return;
    }
    (async () => {
      try { await callback.current(idToken); }
      catch (err) { setError(apiErrorMessage(err, "We could not link Google. Your current account is still available. Try again.")); }
      finally { setBusy(false); }
    })();
  }, [response]);

  async function openGoogle() {
    setError("");
    if (Platform.OS !== "web" && Constants.executionEnvironment === "storeClient") {
      setError("Google linking requires the Credence development build. You can save your profile now and link Google later from Profile.");
      return;
    }
    const clientId = Platform.OS === "android" ? androidId : Platform.OS === "ios" ? iosId : webId;
    if (!clientId) { setError("Google sign-in is not configured for this app yet. Save your profile and link Google here once it is configured."); return; }
    setBusy(true);
    try { await promptAsync(); }
    catch { setBusy(false); setError("Could not open Google sign-in. Please try again."); }
  }

  return <View style={{ gap: 12 }}>
    <AnimatedButton label={busy ? "Connecting Google..." : label} onPress={openGoogle} busy={busy} disabled={disabled || !request} />
  </View>;
}
