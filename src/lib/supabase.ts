
import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Supabase environment variables are missing. Check your .env file."
  );
}

// Expo Router may evaluate this module during server-side rendering.
const isServer =
  Platform.OS === "web" && typeof window === "undefined";

const authStorage = {
  getItem: (key: string): Promise<string | null> =>
    isServer ? Promise.resolve(null) : AsyncStorage.getItem(key),

  setItem: (key: string, value: string): Promise<void> =>
    isServer ? Promise.resolve() : AsyncStorage.setItem(key, value),

  removeItem: (key: string): Promise<void> =>
    isServer ? Promise.resolve() : AsyncStorage.removeItem(key),
};

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
