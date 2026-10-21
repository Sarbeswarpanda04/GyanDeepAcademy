
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

const NAVY = "#101C3A";
const GOLD = "#E8B84A";

export default function SignupScreen() {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanMobile = mobile.trim();

    if (!cleanName || !cleanMobile || !cleanEmail || !password) {
      Alert.alert("Missing details", "Please fill in all fields.");
      return;
    }

    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      Alert.alert(
        "Invalid mobile number",
        "Enter a valid 10-digit Indian mobile number."
      );
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Weak password",
        "Your password must contain at least 8 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Your passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            mobile: cleanMobile,
          },
        },
      });

      if (error) throw error;

      if (data.session) {
        Alert.alert(
          "Account created",
          "Your account is ready. Continue to institute setup.",
          [
            {
              text: "Continue",
              onPress: () => router.replace("/institute-setup"),
            },
          ]
        );
      } else {
        Alert.alert(
          "Verify your email",
          "Your account has been created. Check your inbox for the verification link. After verifying, return and sign in.",
          [
            {
              text: "Go to login",
              onPress: () => router.replace("/login"),
            },
          ]
        );
      }
    } catch (error: unknown) {
      Alert.alert(
        "Signup failed",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>GyanDeep Academy</Text>
        <Text style={styles.tagline}>LEARN TODAY, LEAD TOMORROW</Text>

        <View style={styles.card}>
          <Text style={styles.heading}>Create Owner Account</Text>
          <Text style={styles.subtitle}>
            Register to manage your coaching institute.
          </Text>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor="#9298A7"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            maxLength={100}
          />

          <Text style={styles.label}>Mobile number</Text>
          <TextInput
            style={styles.input}
            placeholder="10-digit mobile number"
            placeholderTextColor="#9298A7"
            value={mobile}
            onChangeText={(value) =>
              setMobile(value.replace(/\D/g, "").slice(0, 10))
            }
            keyboardType="phone-pad"
            maxLength={10}
          />

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
            placeholder="At least 8 characters"
            placeholderTextColor="#9298A7"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter your password"
            placeholderTextColor="#9298A7"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={NAVY} />
            ) : (
              <Text style={styles.buttonText}>CREATE ACCOUNT</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace("/login")}>
              <Text style={styles.link}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NAVY },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 35,
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
    padding: 22,
  },
  heading: { color: NAVY, fontSize: 23, fontWeight: "800" },
  subtitle: {
    color: "#687084",
    fontSize: 13,
    marginTop: 7,
    marginBottom: 22,
  },
  label: {
    color: NAVY,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
    marginTop: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: "#DCE0E8",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 13,
    fontSize: 15,
    color: NAVY,
    backgroundColor: "#FAFBFD",
  },
  button: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 25,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
  },
  footerText: { color: "#687084", fontSize: 13 },
  link: { color: NAVY, fontWeight: "800", fontSize: 13 },
});
