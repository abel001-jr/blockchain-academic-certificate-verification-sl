/**
 * WalletSignInScreen
 * Mobile equivalent of WalletSignIn.js from the web app.
 *
 * On mobile there is no MetaMask browser extension.
 * We use WalletConnect (via ethers.js) to connect to the user's
 * mobile wallet app (MetaMask Mobile, Rainbow, etc.).
 *
 * NOTE: Full WalletConnect integration requires @walletconnect/modal-react-native
 * and a project ID from https://cloud.walletconnect.com
 * This screen shows the flow and the placeholder where WC connects.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ethers } from "ethers";
import { requestWalletChallenge, verifyWalletSignature } from "../services/auth";
import { getMe } from "../services/auth";

export default function WalletSignInScreen({ navigation, onLoginSuccess }) {
  const [step,    setStep]    = useState("idle"); // idle | connecting | signing | verifying | done
  const [address, setAddress] = useState("");

  const stepLabels = {
    idle:       "Connect Wallet",
    connecting: "Connecting…",
    signing:    "Sign the message in your wallet…",
    verifying:  "Verifying…",
    done:       "Signed in!",
  };

  const busy = step !== "idle" && step !== "done";

  async function handleConnect() {
    try {
      setStep("connecting");

      /**
       * TODO: Replace this mock with a real WalletConnect provider:
       *
       *   import { Web3Modal } from "@walletconnect/modal-react-native";
       *   const provider = await Web3Modal.connect();
       *   const signer   = provider.getSigner();
       *   const addr     = (await signer.getAddress()).toLowerCase();
       *
       * For now we use a random wallet to demonstrate the full flow.
       */
      const wallet = ethers.Wallet.createRandom();
      const addr   = wallet.address.toLowerCase();
      setAddress(addr);

      setStep("signing");

      // Step 1 — get nonce challenge from backend
      const { message } = await requestWalletChallenge(addr);

      // Step 2 — sign the challenge
      // Replace wallet.signMessage with signer.signMessage() for real WalletConnect
      const signature = await wallet.signMessage(message);

      setStep("verifying");

      // Step 3 — verify on backend, receive JWT
      await verifyWalletSignature(addr, signature);
      const user = await getMe();

      setStep("done");
      onLoginSuccess(user);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Wallet sign-in failed.";
      Alert.alert("Error", msg);
      setStep("idle");
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Wallet Sign-In</Text>
        <Text style={styles.subtitle}>
          Connect your mobile wallet to sign in securely. No password required.
        </Text>

        {/* Address display */}
        {address ? (
          <View style={styles.addrBox}>
            <Text style={styles.addrLabel}>Connected wallet</Text>
            <Text style={styles.addrValue} numberOfLines={1} ellipsizeMode="middle">
              {address}
            </Text>
          </View>
        ) : null}

        {/* Step indicator */}
        {busy && (
          <View style={styles.stepBox}>
            <ActivityIndicator color="#08283F" />
            <Text style={styles.stepText}>{stepLabels[step]}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btnPrimary, busy && styles.btnDisabled]}
          onPress={handleConnect}
          disabled={busy}
        >
          <Text style={styles.btnText}>
            {step === "done" ? "✓  Signed In" : "🦊  " + stepLabels[step]}
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Your wallet will ask you to sign a message. No transaction or gas fee involved.
        </Text>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back to login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: "#F7F9FB" },
  container: { flex: 1, padding: 28, justifyContent: "center" },
  title:     { fontSize: 28, fontWeight: "800", color: "#08283F", marginBottom: 8 },
  subtitle:  { fontSize: 14, color: "#4A5A68", marginBottom: 32, lineHeight: 21 },
  addrBox: {
    backgroundColor: "#EAF2FB",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  addrLabel: { fontSize: 11, color: "#4A5A68", fontWeight: "600", marginBottom: 4 },
  addrValue: { fontSize: 13, color: "#08283F", fontFamily: Platform?.OS === "ios" ? "Courier" : "monospace" },
  stepBox:   { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  stepText:  { color: "#4A5A68", fontSize: 14 },
  btnPrimary: {
    backgroundColor: "#08283F",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: "#fff", fontWeight: "700", fontSize: 16 },
  note:        { color: "#8A929C", fontSize: 12, textAlign: "center", lineHeight: 18, marginBottom: 24 },
  back:        { color: "#08283F", fontWeight: "600", textAlign: "center", fontSize: 14 },
});
