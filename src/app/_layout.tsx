import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="institute-setup" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="students" />
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
