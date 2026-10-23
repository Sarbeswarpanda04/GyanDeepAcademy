
import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

// Keep the native splash screen visible while the app initializes.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    async function prepareApp() {
      try {
        // Add essential startup initialization here if required.
      } finally {
        await SplashScreen.hideAsync();
      }
    }

    prepareApp();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="institute-setup" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="students" />
      <Stack.Screen name="add-students" />
      <Stack.Screen name="student-details-document" />
      <Stack.Screen name="student-id-card" />
      <Stack.Screen name="student-id-card-settings" />
      <Stack.Screen name="teachers" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="fees" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="institute-profile" />
      <Stack.Screen name="classes" />
      <Stack.Screen name="batches" />
    </Stack>
  );
}
