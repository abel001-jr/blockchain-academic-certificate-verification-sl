import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const tokenStorage = {
  get: key => Platform.OS === "web" ? Promise.resolve(window.localStorage.getItem(key)) : SecureStore.getItemAsync(key),
  set: (key, value) => Platform.OS === "web" ? Promise.resolve(window.localStorage.setItem(key, value)) : SecureStore.setItemAsync(key, value),
  remove: key => Platform.OS === "web" ? Promise.resolve(window.localStorage.removeItem(key)) : SecureStore.deleteItemAsync(key),
};
