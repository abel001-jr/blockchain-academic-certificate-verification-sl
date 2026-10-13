/**
 * Intelligent Academic Credentialing Mobile — App entry point
 *
 * Screen routing:
 *   Unauthenticated public:
 *     Home → StudentWelcome (students / Google / token claim)
 *          → Verify         (anyone, no login)
 *
 *   Authenticated:
 *     Dashboard → Verify → CertificateDetail
 *
 * Deep link handling:
 *   credence://student-invite?token=<raw>
 *   → intercepts before the navigator renders
 *   → claims the token automatically
 *   → on success navigates straight to Dashboard
 *   → on failure shows StudentWelcome with an error pre-filled
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, View, StyleSheet, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";

import { useAuth } from "./src/hooks/useAuth";
import { claimInviteToken, getMe } from "./src/services/auth";

import HomeScreen              from "./src/screens/HomeScreen";
import StudentWelcomeScreen    from "./src/screens/StudentWelcomeScreen";
import VerifyScreen            from "./src/screens/VerifyScreen";
import DashboardScreen         from "./src/screens/DashboardScreen";
import CertificateDetailScreen from "./src/screens/CertificateDetailScreen";

const Stack = createNativeStackNavigator();

// ── Deep link config so React Navigation can also resolve credence:// URLs ──
const linking = {
  prefixes: [
    Linking.createURL("/"),          // credence://
    "http://localhost:3001",         // dev web origin
    "https://credence.edu.sl",       // prod web origin
  ],
  config: {
    screens: {
      // No screens need to be mapped — we handle the student-invite URL
      // imperatively in the useEffect below before navigation starts.
    },
  },
};

export default function App() {
  const { user, setUser, loading, logout } = useAuth();

  // Pre-navigation deep-link claim state
  const [deepLinkChecked, setDeepLinkChecked] = useState(false);
  const [deepLinkError,   setDeepLinkError]   = useState("");
  const navRef = useRef(null);

  // ── Handle credence://student-invite?token= deep link ──────────────────
  useEffect(() => {
    async function handleInitialURL() {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await tryClaimFromUrl(initialUrl);
      } finally {
        setDeepLinkChecked(true);
      }
    }

    handleInitialURL();

    // Also listen for links while the app is already open
    const sub = Linking.addEventListener("url", ({ url }) => tryClaimFromUrl(url));
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function tryClaimFromUrl(url) {
    if (!url) return;
    // Match both  credence://student-invite?token=…
    //        and  http://localhost:3001/student-invite?token=…
    if (!url.includes("student-invite")) return;

    let token = "";
    try {
      const match = url.match(/[?&]token=([^&\s]+)/);
      token = match ? decodeURIComponent(match[1]) : "";
    } catch {
      token = "";
    }

    if (!token) return;

    try {
      const data = await claimInviteToken(token);
      const me   = data.user ?? (await getMe());
      setUser(me);
      // Navigate to dashboard if navigator is already mounted
      navRef.current?.navigate("Dashboard");
    } catch (err) {
      const detail = err?.response?.data?.detail || "";
      setDeepLinkError(detail || "Invite link error. Paste the token manually.");
    }
  }

  // Show splash while auth state + initial URL are both resolving
  if (loading || !deepLinkChecked) {
    return (
      <View style={styles.splash}>
        <Image
          source={require("./assets/logo.png")}
          style={styles.splashLogo}
          resizeMode="contain"
        />
        <Text style={styles.splashName}>Intelligent Academic Credentialing</Text>
        <ActivityIndicator size="small" color="#B98A28" style={{ marginTop: 32 }} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer ref={navRef} linking={linking}>
        <Stack.Navigator
          screenOptions={{
            headerStyle:      { backgroundColor: "#08283F" },
            headerTintColor:  "#fff",
            headerTitleStyle: { fontWeight: "700" },
          }}
        >
          {user ? (
            // ── Authenticated ──────────────────────────────────────────────
            <>
              <Stack.Screen name="Dashboard" options={{ headerShown: false }}>
                {(props) => (
                  <DashboardScreen {...props} user={user} onLogout={logout} />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="Verify"
                component={VerifyScreen}
                options={{ title: "Verify Certificate" }}
              />
              <Stack.Screen
                name="CertificateDetail"
                component={CertificateDetailScreen}
                options={({ route }) => ({
                  title:           route.params?.cert?.degree_title ?? "Certificate",
                  headerBackTitle: "Back",
                })}
              />
            </>
          ) : (
            // ── Unauthenticated ────────────────────────────────────────────
            <>
              {/* Landing */}
              <Stack.Screen name="Home" options={{ headerShown: false }}>
                {(props) => <HomeScreen {...props} />}
              </Stack.Screen>

              {/* Student entry point — Google + token claim */}
              <Stack.Screen 
                name="StudentWelcome" 
                options={{ 
                  title: "Access Certificate",
                  headerBackTitle: "Back"
                }}
              >
                {(props) => (
                  <StudentWelcomeScreen
                    {...props}
                    onLoginSuccess={setUser}
                    initialError={deepLinkError}
                  />
                )}
              </Stack.Screen>

              {/* Public verify — no login */}
              <Stack.Screen
                name="Verify"
                component={VerifyScreen}
                options={{ title: "Verify Certificate" }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#08283F",
  },
  splashLogo: { width: 88, height: 88, marginBottom: 16 },
  splashName: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
