import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const TOKEN_KEY = "encore_token";

/**
 * Universal Storage yang aman berjalan di:
 * - Native (iOS / Android) -> expo-secure-store
 * - Web (Chrome / Safari / Localhost) -> window.localStorage
 */

export async function setStorageItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("localStorage set error:", e);
    }
  } else {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (e) {
      console.warn("SecureStore set error:", e);
    }
  }
}

export async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn("localStorage get error:", e);
    }
    return null;
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function removeStorageItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("localStorage remove error:", e);
    }
  } else {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      console.warn("SecureStore delete error:", e);
    }
  }
}

// Shorthands untuk token
export async function saveToken(token: string) {
  return setStorageItem(TOKEN_KEY, token);
}

export async function getToken() {
  return getStorageItem(TOKEN_KEY);
}

export async function removeToken() {
  return removeStorageItem(TOKEN_KEY);
}
