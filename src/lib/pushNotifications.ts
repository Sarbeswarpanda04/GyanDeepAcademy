
import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "./supabase";

export async function registerTeacherPushNotifications(
  instituteId: string,
): Promise<boolean> {
  try {
    if (!instituteId?.trim()) {
      throw new Error("Institute ID is required.");
    }

    const isExpoGo =
      Constants.executionEnvironment ===
        Constants.ExecutionEnvironment.StoreClient ||
      Constants.appOwnership === "expo";

    if (isExpoGo) {
      console.info("[push] Remote push requires a development or production build.");
      return false;
    }

    if (!Device.isDevice) {
      console.info("[push] A physical device is required.");
      return false;
    }

    const Notifications = await import("expo-notifications");

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "GyanDeep Academy",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
      });
    }

    let permission = await Notifications.getPermissionsAsync();

    if (!permission.granted) {
      permission = await Notifications.requestPermissionsAsync();
    }

    if (!permission.granted) {
      console.warn("[push] Notification permission denied.");
      return false;
    }

    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      throw new Error("EAS project ID is missing.");
    }

    const tokenResponse =
      await Notifications.getExpoPushTokenAsync({ projectId });

    const expoPushToken = tokenResponse.data;

    const { data, error } = await supabase.functions.invoke(
      "register-teacher-push-token",
      {
        body: {
          expoPushToken,
          deviceName: Device.deviceName ?? "Android device",
          instituteId,
        },
      },
    );

    if (error) {
      const context = (error as { context?: Response }).context;
      let details = error.message;

      if (context) {
        try {
          const responseText = await context.clone().text();
          if (responseText) details += `: ${responseText}`;
        } catch {
          // Retain original error.
        }
      }

      throw new Error(details);
    }

    if (!data?.success) {
      throw new Error(data?.error ?? "Token registration failed.");
    }

    console.info("[push] Teacher device registered successfully.");
    return true;
  } catch (error) {
    console.error("[push] Registration failed:", error);
    return false;
  }
}
