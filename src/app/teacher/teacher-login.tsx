import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import AppAlert, { type AppAlertType } from "../../components/AppAlert";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const WHITE = "#FFFFFF";
const MUTED = "#718393";

type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: AppAlertType;
};

export default function TeacherLoginScreen() {
  const insets = useSafeAreaInsets();

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const [alert, setAlert] = useState<AlertState>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const showAlert = (
    title: string,
    message: string,
    type: AppAlertType = "error",
  ) => {
    setAlert({ visible: true, title, message, type });
  };

  const login = async () => {
    if (loading) return;

    const cleanPhone = phone.replace(/\D/g, "").slice(-10);

    if (!/^\d{10}$/.test(cleanPhone)) {
      showAlert(
        "Invalid mobile number",
        "Enter the 10-digit mobile number registered by your institute.",
        "warning",
      );
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      showAlert("Invalid PIN", "Enter your 4-digit login PIN.", "warning");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "teacher-pin-login",
        {
          body: {
            phone: cleanPhone,
            pin,
          },
        },
      );

      if (error) {
        let message = error.message || "Unable to contact the login service.";

        // Extract the server's error message when available.
        const context = (error as { context?: Response }).context;

        if (context && typeof context.clone === "function") {
          try {
            const response = context.clone();
            const contentType = response.headers.get("content-type") ?? "";

            if (contentType.includes("application/json")) {
              const body = await response.json();
              message =
                body?.message ??
                body?.error ??
                body?.error_description ??
                message;
            } else {
              const text = (await response.text()).trim();
              if (text) message = text;
            }
          } catch {
            // Keep the original error message if the response cannot be read.
          }
        }

        throw new Error(message);
      }

      if (!data?.success) {
        throw new Error(data?.message ?? "Incorrect mobile number or PIN.");
      }

      const accessToken = data?.session?.access_token;
      const refreshToken = data?.session?.refresh_token;

      if (!accessToken || !refreshToken) {
        throw new Error(
          "The login service did not return an authenticated session. Please configure the teacher-pin-login backend.",
        );
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        throw sessionError;
      }

      // Open the dashboard only after Supabase accepts the session.
      router.replace("/teacher-dashboard" as never);
    } catch (error: unknown) {
      console.error("[teacher-login] failed:", error);

      showAlert(
        "Login failed",
        error instanceof Error
          ? error.message
          : "Check your mobile number and PIN, then try again.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[styles.topBar, { paddingTop: Math.max(insets.top, 14) + 8 }]}
        >
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={28} color={NAVY} />
          </Pressable>

          <Text style={styles.topTitle}>Teacher Login</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.logoCircle}>
            <Feather name="book-open" size={34} color={WHITE} />
          </View>

          <Text style={styles.heading}>Welcome back</Text>

          <Text style={styles.subtitle}>
            Sign in with the mobile number and 4-digit PIN provided by your
            institute owner.
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.label}>Registered mobile number</Text>

            <View style={styles.inputWrap}>
              <View style={styles.countryCode}>
                <Text style={styles.countryText}>+91</Text>
              </View>

              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={(value) =>
                  setPhone(value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="10-digit mobile number"
                placeholderTextColor="#9CA6B4"
                keyboardType="phone-pad"
                maxLength={10}
                autoComplete="tel"
                textContentType="telephoneNumber"
                editable={!loading}
                returnKeyType="next"
              />
            </View>

            <Text style={styles.label}>4-digit login PIN</Text>

            <View style={styles.inputWrap}>
              <Feather name="lock" size={19} color={MUTED} />

              <TextInput
                style={styles.pinInput}
                value={pin}
                onChangeText={(value) =>
                  setPin(value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="Enter your PIN"
                placeholderTextColor="#9CA6B4"
                keyboardType="number-pad"
                secureTextEntry={!showPin}
                maxLength={4}
                editable={!loading}
                returnKeyType="go"
                onSubmitEditing={login}
              />

              <Pressable
                onPress={() => setShowPin((current) => !current)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={showPin ? "Hide PIN" : "Show PIN"}
              >
                <Feather
                  name={showPin ? "eye-off" : "eye"}
                  size={20}
                  color={NAVY}
                />
              </Pressable>
            </View>

            <Pressable
              style={[styles.loginButton, loading && styles.disabled]}
              onPress={login}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <>
                  <Text style={styles.loginText}>Login</Text>
                  <Feather name="arrow-right" size={20} color={WHITE} />
                </>
              )}
            </Pressable>

            <Text style={styles.helpText}>
              Forgot your PIN? Contact your institute owner or manager to reset
              it.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      <AppAlert
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        confirmLabel="OK"
        onConfirm={() =>
          setAlert((current) => ({
            ...current,
            visible: false,
          }))
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  topBar: {
    backgroundColor: BG,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 40,
    justifyContent: "center",
  },
  topTitle: {
    color: NAVY,
    fontSize: 23,
    fontWeight: "900",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingBottom: 32,
  },
  logoCircle: {
    width: 76,
    height: 76,
    borderRadius: 26,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 22,
  },
  heading: {
    fontSize: 30,
    fontWeight: "900",
    color: NAVY,
    textAlign: "center",
  },
  subtitle: {
    color: MUTED,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 26,
    paddingHorizontal: 8,
  },
  formCard: {
    backgroundColor: WHITE,
    borderRadius: 26,
    padding: 22,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E6ECF1",
  },
  label: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  inputWrap: {
    minHeight: 58,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: "#DADFE5",
    backgroundColor: WHITE,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  countryCode: {
    borderRightWidth: 1,
    borderRightColor: "#E1E8EF",
    paddingRight: 11,
  },
  countryText: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "900",
  },
  phoneInput: {
    flex: 1,
    color: NAVY,
    fontSize: 16,
  },
  pinInput: {
    flex: 1,
    color: NAVY,
    fontSize: 18,
    letterSpacing: 5,
  },
  loginButton: {
    height: 58,
    borderRadius: 16,
    backgroundColor: NAVY,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  disabled: {
    opacity: 0.65,
  },
  loginText: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "900",
  },
  helpText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 7,
  },
});
