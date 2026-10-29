import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "./supabase";

/**
 * Register this device for teacher push notifications after teacher login.
 * Expo Go on Android cannot register remote push notifications on SDK 53+,
 * so skip loading expo-notifications there to avoid native-module crashes.
 */
export async function registerTeacherPushNotifications(): Promise<boolean> {
  try {
    // Check Expo Go before importing expo-notifications: importing it at the
    // top level can crash when its native module is not present in Expo Go.
    const isExpoGo =
      Constants.executionEnvironment === Constants.ExecutionEnvironment.StoreClient ||
      Constants.appOwnership === "expo";

    if (isExpoGo) {
      console.info(
        "[push-notifications] Remote push registration is unavailable in Expo Go. Use a development build.",
      );
      return false;
    }

    if (!Device.isDevice) {
      console.info("[push-notifications] A physical device is required for push registration.");
      return false;
    }

    // Dynamic import prevents Expo Go from evaluating the native notification
    // module before the environment check above.
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
      console.info("[push-notifications] Notification permission was not granted.");
      return false;
    }

    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      throw new Error(
        "Missing EAS projectId. Configure expo.extra.eas.projectId in app.json/app.config.ts.",
      );
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data;

    const { data, error } = await supabase.functions.invoke(
      "register-teacher-push-token",
      {
        body: {
          expoPushToken,
          deviceName: Device.deviceName ?? "Android device",
        },
      },
    );

    if (error) {
      const context = (error as { context?: Response }).context;
      let details = error.message;
      if (context) {
        try {
          const body = await context.clone().text();
          if (body) details = `${details}: ${body}`;
        } catch {
          // Keep the original Supabase function error.
        }
      }
      throw new Error(details);
    }

    if (!data?.success) {
      throw new Error(data?.error ?? "Token registration was rejected.");
    }

    console.info("[push-notifications] Teacher device token registered.");
    return true;
  } catch (error) {
    console.error("[push-notifications] Registration failed:", error);
    return false;
  }
}
