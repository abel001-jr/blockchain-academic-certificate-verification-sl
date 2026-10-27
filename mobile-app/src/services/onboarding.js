import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
const KEY = "credence-onboarding-v1";
export async function hasCompletedOnboarding() {
  return (Platform.OS === "web" ? window.localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY)) === "done";
}
export async function completeOnboarding() {
  if (Platform.OS === "web") window.localStorage.setItem(KEY, "done");
  else await SecureStore.setItemAsync(KEY, "done");
}
