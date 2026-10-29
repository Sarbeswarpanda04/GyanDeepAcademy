import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Image,
  ImageSourcePropType,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import Constants, { ExecutionEnvironment } from "expo-constants";
import AppAlert, { type AppAlertType } from "../../components/AppAlert";

const NAVY = "#241344";
const PURPLE = "#611CD0";
const PURPLE_DARK = "#44109D";
const PURPLE_BRIGHT = "#4C02F7";
const BG = "#F3F3FF";
const WHITE = "#FFFFFF";
const MUTED = "#718096";
const BORDER = "#E8E3F5";
const APP_LOGO: ImageSourcePropType = require("../../../assets/images/icon.png");

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
  const pinInputRef = useRef<TextInput>(null);
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

      // Expo Go on Android does not include the native remote-notification module.
      // Load pushNotifications only in a native development/production build so its
      // expo-notifications import cannot crash this login route in Expo Go.
      if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
        void import("../../lib/pushNotifications")
          .then(({ registerTeacherPushNotifications }) =>
            registerTeacherPushNotifications(),
          )
          .catch((notificationError) => {
            console.warn(
              "[teacher-login] Push notification registration skipped:",
              notificationError,
            );
          });
      } else {
        console.info(
          "[teacher-login] Remote push notifications require a development build; skipping in Expo Go.",
        );
      }

      // Open the dashboard only after Supabase accepts the session.
      router.replace("/teacher/teacher-dashboard" as never);
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
      <StatusBar barStyle="light-content" backgroundColor={PURPLE_DARK} />
      <LinearGradient
        colors={[PURPLE, PURPLE_DARK, PURPLE_BRIGHT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.orbTop} />
      <View pointerEvents="none" style={styles.orbBottom} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 12) + 8,
              paddingBottom: Math.max(insets.bottom, 14) + 12,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <Feather name="chevron-left" size={26} color={WHITE} />
            </Pressable>
            <Text style={styles.topTitle}>Teacher Login</Text>
            <View style={styles.topBarSpacer} />
          </View>

          <View style={styles.content}>
            <View style={styles.brandBlock}>
              <View style={styles.logoGlow}>
                <LinearGradient
                  colors={["#FFFFFF", "#F0E7FF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoSurface}
                >
                  <Image
                    source={APP_LOGO}
                    style={styles.logoImage}
                    resizeMode="contain"
                    accessibilityLabel="GyanDeep Academy logo"
                  />
                </LinearGradient>
              </View>
              <Text style={styles.brandName}>GyanDeep Academy</Text>
              <Text style={styles.brandTagline}>LEARN TODAY. LEAD TOMORROW.</Text>
              <View style={styles.brandAccent} />
              <Text style={styles.heading}>Welcome back</Text>
              <Text style={styles.subtitle}>
                Sign in with the mobile number and 4-digit PIN provided by your institute.
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.label}>Registered mobile number</Text>
              <View style={styles.phoneInputWrap}>
                <Text style={styles.countryText}>+91</Text>
                <View style={styles.inputDivider} />
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={(value) =>
                    setPhone(value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="Enter mobile number"
                  placeholderTextColor="#9A93AA"
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  editable={!loading}
                  returnKeyType="next"
                  selectionColor={PURPLE}
                />
                {phone.length === 10 ? (
                  <Feather name="check-circle" size={18} color="#16A34A" />
                ) : null}
              </View>

              <View style={styles.pinLabelRow}>
                <Text style={styles.label}>4-digit login PIN</Text>
                <Text style={styles.pinHint}>4 DIGITS</Text>
              </View>

              <View style={styles.pinSection}>
                <Pressable
                  style={styles.pinBoxes}
                  onPress={() => pinInputRef.current?.focus()}
                  accessibilityRole="button"
                  accessibilityLabel="Enter four-digit PIN"
                  disabled={loading}
                >
                  {[0, 1, 2, 3].map((index) => {
                    const digit = pin[index];
                    const active = pin.length === index;
                    return (
                      <View
                        key={index}
                        style={[
                          styles.pinBox,
                          active && styles.pinBoxActive,
                          digit !== undefined && styles.pinBoxFilled,
                        ]}
                      >
                        <Text style={styles.pinDigit}>
                          {digit === undefined ? "" : showPin ? digit : "•"}
                        </Text>
                        {active && digit === undefined ? (
                          <View style={styles.pinCursor} />
                        ) : null}
                      </View>
                    );
                  })}
                  <TextInput
                    ref={pinInputRef}
                    value={pin}
                    onChangeText={(value) =>
                      setPin(value.replace(/\D/g, "").slice(0, 4))
                    }
                    keyboardType="number-pad"
                    maxLength={4}
                    editable={!loading}
                    returnKeyType="go"
                    onSubmitEditing={login}
                    autoComplete="off"
                    textContentType="oneTimeCode"
                    caretHidden
                    style={styles.pinHiddenInput}
                    selectionColor="transparent"
                    accessibilityLabel="Four-digit login PIN"
                  />
                </Pressable>

                <Pressable
                  onPress={() => setShowPin((current) => !current)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={showPin ? "Hide PIN" : "Show PIN"}
                  style={styles.showPinButton}
                >
                  <Feather
                    name={showPin ? "eye-off" : "eye"}
                    size={18}
                    color={PURPLE}
                  />
                  <Text style={styles.showPinText}>
                    {showPin ? "Hide PIN" : "Show PIN"}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={[styles.loginButton, loading && styles.disabled]}
                onPress={login}
                disabled={loading}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={[PURPLE, PURPLE_DARK, PURPLE_BRIGHT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.loginGradient}
                >
                  {loading ? (
                    <ActivityIndicator color={WHITE} />
                  ) : (
                    <>
                      <Text style={styles.loginText}>Sign in</Text>
                      <Feather name="arrow-right" size={19} color={WHITE} />
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              <View style={styles.secureNote}>
                <Feather name="check-circle" size={14} color={PURPLE} />
                <Text style={styles.secureText}>Secure teacher access</Text>
              </View>
              <Text style={styles.helpText}>
                Forgot your PIN? Contact your institute owner to reset it.
              </Text>
            </View>
          </View>
          <Text style={styles.footerText}>YOUR JOURNEY. YOUR POTENTIAL.</Text>
        </ScrollView>
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
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: PURPLE_DARK },
  orbTop: {
    position: "absolute", width: 250, height: 250, borderRadius: 125,
    top: -125, right: -95, backgroundColor: "rgba(255,255,255,0.08)",
  },
  orbBottom: {
    position: "absolute", width: 200, height: 200, borderRadius: 100,
    bottom: -90, left: -95, backgroundColor: "rgba(255,255,255,0.07)",
  },
  scrollContent: {
    flexGrow: 1, justifyContent: "center", paddingHorizontal: 22,
  },
  topBar: {
    width: "100%", maxWidth: 460, alignSelf: "center",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  backButton: { width: 40, height: 42, justifyContent: "center" },
  topTitle: { color: WHITE, fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },
  topBarSpacer: { width: 40 },
  content: { width: "100%", maxWidth: 460, alignSelf: "center", paddingBottom: 10 },
  brandBlock: { alignItems: "center", marginBottom: 20 },
  logoGlow: {
    width: 104, height: 104, borderRadius: 32, padding: 4, marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    shadowColor: "#180044", shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35, shadowRadius: 18, elevation: 12,
  },
  logoSurface: {
    flex: 1, borderRadius: 28, padding: 10, alignItems: "center",
    justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.85)",
  },
  logoImage: { width: "100%", height: "100%" },
  brandName: {
    color: WHITE, fontSize: 25, fontWeight: "900", letterSpacing: -0.8,
    textAlign: "center", textShadowColor: "rgba(20,0,60,0.3)",
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6,
  },
  brandTagline: {
    color: "#E7DAFF", fontSize: 8, fontWeight: "800", letterSpacing: 2,
    textAlign: "center", marginTop: 6,
  },
  brandAccent: {
    width: 38, height: 3, borderRadius: 3, backgroundColor: "#D9C4FF",
    marginTop: 12, marginBottom: 12,
  },
  heading: { fontSize: 25, fontWeight: "900", color: WHITE, textAlign: "center" },
  subtitle: {
    color: "#E4D8FA", fontSize: 12, lineHeight: 18, textAlign: "center",
    marginTop: 6, paddingHorizontal: 8, maxWidth: 330,
  },
  formCard: {
    backgroundColor: WHITE, borderRadius: 24, padding: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.8)",
    shadowColor: "#190047", shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 8,
  },
  label: { color: NAVY, fontSize: 12, fontWeight: "800" },
  phoneInputWrap: {
    minHeight: 54, borderRadius: 14, borderWidth: 1.3, borderColor: BORDER,
    backgroundColor: "#FBFAFF", paddingHorizontal: 13, flexDirection: "row",
    alignItems: "center", gap: 10, marginTop: 9,
  },
  countryText: { color: PURPLE, fontSize: 14, fontWeight: "900" },
  inputDivider: { height: 24, width: 1, backgroundColor: BORDER },
  phoneInput: {
    flex: 1, minWidth: 0, color: NAVY, fontSize: 15, paddingVertical: 12,
  },
  pinLabelRow: {
    marginTop: 19, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  pinHint: { color: "#9B8AB8", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  pinSection: { marginTop: 12 },
  pinBoxes: {
    flexDirection: "row", justifyContent: "space-between", gap: 10,
    position: "relative",
  },
  pinBox: {
    flex: 1, height: 64, borderRadius: 15, borderWidth: 1.5,
    borderColor: "#E4DDF1", backgroundColor: "#FBFAFF",
    alignItems: "center", justifyContent: "center",
  },
  pinBoxActive: {
    borderColor: PURPLE, backgroundColor: "#F7F1FF",
    shadowColor: PURPLE, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 2,
  },
  pinBoxFilled: { borderColor: "#C8B4F1", backgroundColor: "#F7F1FF" },
  pinDigit: {
    color: PURPLE_DARK, fontSize: 29, lineHeight: 36,
    fontWeight: "900", textAlign: "center",
  },
  pinCursor: {
    position: "absolute", height: 23, width: 2, borderRadius: 2,
    backgroundColor: PURPLE,
  },
  pinHiddenInput: {
    ...StyleSheet.absoluteFill, opacity: 0.02, color: "transparent",
    backgroundColor: "transparent",
  },
  showPinButton: {
    alignSelf: "center", flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6, paddingVertical: 11,
  },
  showPinText: { color: PURPLE, fontSize: 11, fontWeight: "800" },
  loginButton: {
    height: 53, borderRadius: 15, overflow: "hidden", marginTop: 9,
    shadowColor: PURPLE, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2, shadowRadius: 9, elevation: 4,
  },
  loginGradient: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10,
  },
  disabled: { opacity: 0.65 },
  loginText: { color: WHITE, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
  secureNote: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, marginTop: 13,
  },
  secureText: { color: MUTED, fontSize: 10, fontWeight: "600" },
  helpText: {
    color: MUTED, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 11,
  },
  footerText: {
    color: "#E8DFFF", fontSize: 9, fontWeight: "800", letterSpacing: 1.6,
    textAlign: "center", marginTop: 12,
  },
});
