import { useFonts } from "expo-font";
import { colors, fonts } from "./src/theme";
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
import OnboardingScreen from "./src/screens/OnboardingScreen";
import { hasCompletedOnboarding } from "./src/services/onboarding";
import ContourSplash from "./src/components/ContourSplash";
import ToastProvider, { useToast } from "./src/components/ToastProvider";
import { claimErrorMessage } from "./src/utils/apiError";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";

import config from "./src/config";
import { parseInviteToken, isInvitationUrl } from "./src/utils/invitation";
import { useAuth } from "./src/hooks/useAuth";
import { claimInviteToken, getMe } from "./src/services/auth";

import StudentAccountScreen from "./src/screens/StudentAccountScreen";
import HomeScreen              from "./src/screens/HomeScreen";
import StudentWelcomeScreen    from "./src/screens/StudentWelcomeScreen";
import VerifyScreen            from "./src/screens/VerifyScreen";
import DashboardScreen         from "./src/screens/DashboardScreen";
import CertificateDetailScreen from "./src/screens/CertificateDetailScreen";

const Stack = createNativeStackNavigator();

// ── Deep link config so React Navigation can also resolve credence:// URLs ──
const linking = {
  prefixes: [
    Linking.createURL("/"),
    "credence://",
    config.WEB_BASE,
    "http://localhost:3001",         // dev web origin
    "https://credence.edu.sl",       // prod web origin
  ],
  config: {
    screens: {
      Verify: "verify/:certificateId",
      // No screens need to be mapped — we handle the student-invite URL
      // imperatively in the useEffect below before navigation starts.
    },
  },
};

export default function App() {
  return <SafeAreaProvider><ToastProvider><AppContent /></ToastProvider></SafeAreaProvider>;
}

function AppContent() {
  const { showToast } = useToast();
  const [fontsReady, fontError] = useFonts({
    Inter_400Regular: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    Inter_500Medium: require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"),
    Inter_600SemiBold: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
    Inter_700Bold: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
    Newsreader_500Medium: require("@expo-google-fonts/newsreader/500Medium/Newsreader_500Medium.ttf"),
  });
  const { user, setUser, loading, logout } = useAuth();

  // Pre-navigation deep-link claim state
  const [deepLinkChecked, setDeepLinkChecked] = useState(false);
  const [deepLinkError,   setDeepLinkError]   = useState("");
  const navRef = useRef(null);
  const pendingClaims = useRef(new Set());
  const completedClaims = useRef(new Set());
  const initialLinkStarted = useRef(false);
  const currentUser = useRef(user);
  currentUser.current = user;
  const [onboardingDone, setOnboardingDone] = useState(null);
  const [invitationOpened, setInvitationOpened] = useState(false);
  useEffect(() => {
    let alive = true;
    hasCompletedOnboarding().then(done => { if (alive) setOnboardingDone(done); })
      .catch(() => { if (alive) setOnboardingDone(false); });
    return () => { alive = false; };
  }, []);

  // ── Handle credence://student-invite?token= deep link ──────────────────
  useEffect(() => {
    async function handleInitialURL() {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await tryClaimFromUrl(initialUrl);
      } catch {
        setDeepLinkError("Could not open the invitation. Paste your invitation in Student access to continue.");
      } finally {
        setDeepLinkChecked(true);
      }
    }

    if (loading) return;
    if (!initialLinkStarted.current) {
      initialLinkStarted.current = true;
      handleInitialURL();
    }

    // Also listen for links while the app is already open
    const sub = Linking.addEventListener("url", ({ url }) => tryClaimFromUrl(url));
    return () => sub.remove();
  }, [loading]);

  async function tryClaimFromUrl(url) {
    if (!url) return;
    // Match both  credence://student-invite?token=…
    //        and  http://localhost:3001/student-invite?token=…
    if (!isInvitationUrl(url)) return;
    setInvitationOpened(true);
    let token;
    try {
      token = parseInviteToken(url);
    } catch (err) {
      setDeepLinkError(err.message);
      if (currentUser.current) showToast(err.message, { title: "Invitation error" });
      else navRef.current?.navigate("StudentWelcome");
      return;
    }
    if (pendingClaims.current.has(token) || completedClaims.current.has(token)) return;
    pendingClaims.current.add(token);
    setDeepLinkError("");
    try {
      const data = await claimInviteToken(token);
      const me   = data.user ?? (await getMe());
      completedClaims.current.add(token);
      if (currentUser.current && navRef.current?.isReady()) navRef.current.navigate(me.is_student !== false && me.role === "student" && !me.google_linked ? "StudentAccount" : "Dashboard");
      showToast("Your credential was claimed. Complete your profile and link Google for future sign-ins.", { title: "Credential claimed", tone: "success" });
      setUser(me);
      // The authenticated navigator selects Dashboard after setUser.
    } catch (err) {
      const message = claimErrorMessage(err);
      setDeepLinkError(message);
      if (currentUser.current) showToast(message, { title: "Invitation error" });
      else navRef.current?.navigate("StudentWelcome");
    } finally {
      pendingClaims.current.delete(token);
    }
  }

  // Show splash while auth state + initial URL are both resolving
  const startupReady = (fontsReady || Boolean(fontError)) && !loading && deepLinkChecked && onboardingDone !== null;
  if (!startupReady) {
    return <ContourSplash />;
  }

  if (!onboardingDone && !user && !invitationOpened) {
    return <SafeAreaProvider><StatusBar style="dark" /><OnboardingScreen onComplete={() => setOnboardingDone(true)} /></SafeAreaProvider>;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer ref={navRef} linking={linking}>
        <Stack.Navigator
          key={user ? `student-${user.id}` : "public"}
          initialRouteName={user ? user.role === "student" && !user.google_linked ? "StudentAccount" : "Dashboard" : invitationOpened ? "StudentWelcome" : "Home"}
          screenOptions={{
            headerStyle:      { backgroundColor: colors.cream },
            headerTintColor:  colors.navy,
            headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 16 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.cream },
          }}
        >
          <Stack.Screen name="Onboarding" options={{ headerShown: false }}>
            {props => <OnboardingScreen onComplete={() => props.navigation.goBack()} />}
          </Stack.Screen>
          {user ? (
            // ── Authenticated ──────────────────────────────────────────────
            <>
              <Stack.Screen name="StudentAccount" options={{ title: "Student account setup" }} initialParams={{ afterClaim: true }}>
                {props => <StudentAccountScreen {...props} user={user} onUserUpdate={setUser} afterClaim={props.route.params?.afterClaim} />}
              </Stack.Screen>
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
