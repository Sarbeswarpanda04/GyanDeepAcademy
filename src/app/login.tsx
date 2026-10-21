import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

const NAVY = "#101C3A";
const GOLD = "#E8B84A";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <ScrollView
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.brand}>GyanDeep Academy</Text>
      <Text style={styles.tagline}>LEARN TODAY, LEAD TOMORROW</Text>

      <View style={styles.card}>
        <Text style={styles.heading}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to your owner account.</Text>

        <Text style={styles.label}>Email address</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor="#9298A7"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          placeholderTextColor="#9298A7"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={styles.forgot}
          onPress={handleForgotPassword}
          disabled={loading}
        >
          <Text style={styles.link}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.65 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={NAVY} />
          ) : (
            <Text style={styles.buttonText}>SIGN IN</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signup}
          onPress={() => router.push("/signup")}
        >
          <Text style={styles.footerText}>
            New owner? <Text style={styles.link}>Create account</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.back}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.footerText}>← Back to role selection</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: "center",
    backgroundColor: NAVY,
    padding: 22,
  },
  brand: {
    color: GOLD,
    fontSize: 29,
    fontWeight: "800",
    textAlign: "center",
  },
  tagline: {
    color: "#D6D9E3",
    fontSize: 10,
    letterSpacing: 2,
    textAlign: "center",
    marginTop: 7,
    marginBottom: 28,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 23,
  },
  heading: { color: NAVY, fontSize: 25, fontWeight: "800" },
  subtitle: { color: "#687084", fontSize: 13, marginTop: 7, marginBottom: 22 },
  label: {
    color: NAVY,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: "#DCE0E8",
    borderRadius: 11,
    padding: 14,
    fontSize: 15,
    color: NAVY,
    backgroundColor: "#FAFBFD",
  },
  forgot: { alignSelf: "flex-end", marginTop: 13 },
  link: { color: NAVY, fontWeight: "800" },
  button: {
    backgroundColor: GOLD,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: { color: NAVY, fontWeight: "800", letterSpacing: 0.6 },
  signup: { alignItems: "center", marginTop: 23 },
  footerText: { color: "#687084", fontSize: 13 },
  back: { alignItems: "center", marginTop: 20 },
});
