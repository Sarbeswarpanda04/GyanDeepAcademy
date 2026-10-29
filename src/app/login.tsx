import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

const PURPLE = "#611CD0";
const PURPLE_DARK = "#44109D";
const PURPLE_BRIGHT = "#4C02F7";
const BG = "#F3F3FF";
const TEXT = "#1F2937";
const MUTED = "#718096";
const BORDER = "#E8E3F5";
const WHITE = "#FFFFFF";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;

      if (!data.session) {
        Alert.alert("Login incomplete", "Please sign in again.");
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("institute_members")
        .select("id")
        .eq("user_id", data.session.user.id)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;

      router.replace(membership ? "/dashboard" : "/institute-setup");
    } catch (error: unknown) {
      Alert.alert(
        "Login failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert(
        "Email required",
        "Enter your registered email address first.",
      );
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) throw error;

      Alert.alert(
        "Check your email",
        "If an account exists for this address, Supabase will send a password reset link. Configure your reset redirect URL in Supabase before using a custom in-app reset flow.",
      );
    } catch (error: unknown) {
      Alert.alert(
        "Request failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
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
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.fixedContent}>
          <View style={styles.brandArea}>
            <View style={styles.logoBadge}>
              <Image
                source={require("../../assets/images/icon.png")}
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityLabel="GyanDeep Academy logo"
              />
            </View>
            <Text style={styles.brand}>GyanDeep Academy</Text>
            <Text style={styles.tagline}>LEARN TODAY, LEAD TOMORROW</Text>
            <View style={styles.brandDivider} />
            <Text style={styles.welcomeLine}>Your learning community,</Text>
            <Text style={styles.welcomeLineStrong}>all in one place.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeadingRow}>
              <View style={styles.headingIcon}>
                <Feather name="user" size={20} color={PURPLE} />
              </View>
              <View style={styles.headingCopy}>
                <Text style={styles.heading}>Welcome back</Text>
                <Text style={styles.subtitle}>Sign in to your owner account</Text>
              </View>
            </View>

            <Text style={styles.label}>Email address</Text>
            <View style={styles.inputWrap}>
              <Feather name="mail" size={18} color="#9A8BB8" />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#9A9AAF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={18} color="#9A8BB8" />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#9A9AAF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={() => void handleLogin()}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                onPress={() => setShowPassword((value) => !value)}
                hitSlop={10}
                style={styles.eyeButton}
              >
                <Feather
                  name={showPassword ? "eye-off" : "eye"}
                  size={18}
                  color={MUTED}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.forgot}
              onPress={handleForgotPassword}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handleLogin()}
              disabled={loading}
              activeOpacity={0.85}
              style={styles.primaryButtonWrap}
            >
              <LinearGradient
                colors={[PURPLE, PURPLE_BRIGHT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
              >
                {loading ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Sign in</Text>
                    <Feather name="arrow-right" size={19} color={WHITE} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.secureNote}>
              <Feather name="check-circle" size={15} color="#6B52A3" />
              <Text style={styles.secureNoteText}>Secure sign-in for institute owners</Text>
            </View>

            <View style={styles.signupDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.orText}>NEW TO GYANDEEP?</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.signupButton}
              onPress={() => router.push("/signup")}
              disabled={loading}
              activeOpacity={0.75}
            >
              <Feather name="user-plus" size={17} color={PURPLE} />
              <Text style={styles.signupButtonText}>Create owner account</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace("/")}
            activeOpacity={0.75}
          >
            <Feather name="arrow-left" size={16} color="#F0E9FF" />
            <Text style={styles.backText}>Back to role selection</Text>
          </TouchableOpacity>

          <Text style={styles.footerCaption}>GyanDeep Academy · Learn with purpose</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PURPLE_DARK,
  },
  keyboard: {
    flex: 1,
  },
  fixedContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: Platform.OS === "android" ? 28 : 44,
    paddingBottom: 28,
  },
  orbTop: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -100,
    right: -75,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  orbBottom: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    bottom: -70,
    left: -75,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  brandArea: {
    alignItems: "center",
    marginBottom: 15,
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
  },
  logoImage: {
    width: 42,
    height: 42,
  },
  brand: {
    color: WHITE,
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  tagline: {
    color: "#E6DBFF",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2.1,
    textAlign: "center",
    marginTop: 8,
  },
  brandDivider: {
    width: 42,
    height: 3,
    borderRadius: 3,
    backgroundColor: "#D9C5FF",
    marginTop: 12,
    marginBottom: 10,
  },
  welcomeLine: {
    color: "#F3EDFF",
    fontSize: 15,
    textAlign: "center",
  },
  welcomeLineStrong: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 2,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: WHITE,
    borderRadius: 23,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    shadowColor: "#21075C",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 8,
  },
  cardHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  headingIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: "#F0E9FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headingCopy: {
    flex: 1,
  },
  heading: {
    color: TEXT,
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  subtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
  },
  label: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 13,
  },
  inputWrap: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: "#FBFAFF",
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: TEXT,
    fontSize: 14,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  eyeButton: {
    padding: 4,
    marginLeft: 3,
  },
  forgot: {
    alignSelf: "flex-end",
    marginTop: 13,
    paddingVertical: 3,
  },
  forgotText: {
    color: PURPLE,
    fontSize: 12,
    fontWeight: "800",
  },
  primaryButtonWrap: {
    marginTop: 17,
    borderRadius: 14,
    overflow: "hidden",
  },
  primaryButton: {
    minHeight: 49,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  secureNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
    gap: 7,
  },
  secureNoteText: {
    color: MUTED,
    fontSize: 11,
  },
  signupDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    marginBottom: 12,
  },
  dividerLine: {
    height: 1,
    backgroundColor: "#EEEAF6",
    flex: 1,
  },
  orText: {
    color: "#9690A6",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  signupButton: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D8C9F8",
    backgroundColor: "#FBF9FF",
    paddingHorizontal: 14,
  },
  signupButtonText: {
    color: PURPLE,
    fontSize: 13,
    fontWeight: "800",
  },
  backButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 13,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  backText: {
    color: "#F0E9FF",
    fontSize: 12,
    fontWeight: "700",
  },
  footerCaption: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 10,
    textAlign: "center",
    marginTop: 8,
  },
});
