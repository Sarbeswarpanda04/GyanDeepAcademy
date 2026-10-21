
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
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

const NAVY = "#101C3A";
const GOLD = "#E8B84A";

export default function InstituteSetupScreen() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateInstitute() {
    if (name.trim().length < 2) {
      Alert.alert("Institute name required", "Enter at least 2 characters.");
      return;
    }

    setLoading(true);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        Alert.alert("Sign in required", "Please sign in before continuing.", [
          {
            text: "Go to login",
            onPress: () => router.replace("/login"),
          },
        ]);
        return;
      }

      const { data, error } = await supabase.rpc(
        "create_institute_and_owner",
        {
          p_name: name.trim(),
          p_address: address.trim() || null,
          p_contact_phone: phone.trim() || null,
        }
      );

      if (error) throw error;

      Alert.alert(
        "Institute registered",
        "Your coaching institute has been created successfully.",
        [
          {
            text: "Continue",
            onPress: () => router.replace("/dashboard"),
          },
        ]
      );
    } catch (error: unknown) {
      Alert.alert(
        "Registration failed",
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

        <Text style={styles.heading}>Set Up Your Institute</Text>
        <Text style={styles.subtitle}>
          Add your coaching centre details to get started.
        </Text>

        <Text style={styles.label}>Institute name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. GyanDeep Academy"
          placeholderTextColor="#9298A7"
          value={name}
          onChangeText={setName}
          maxLength={150}
        />

        <Text style={styles.label}>Address</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Enter institute address"
          placeholderTextColor="#9298A7"
          value={address}
          onChangeText={setAddress}
          multiline
          maxLength={500}
        />

        <Text style={styles.label}>Contact mobile</Text>
        <TextInput
          style={styles.input}
          placeholder="Institute contact number"
          placeholderTextColor="#9298A7"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={15}
        />

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.65 }]}
          onPress={handleCreateInstitute}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={NAVY} />
          ) : (
            <Text style={styles.buttonText}>REGISTER INSTITUTE</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.back}
          onPress={() => router.replace("/login")}
          disabled={loading}
        >
          <Text style={styles.backText}>Back to login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NAVY },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  brand: {
    color: GOLD,
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  tagline: {
    color: "#D6D9E3",
    fontSize: 10,
    letterSpacing: 2,
    textAlign: "center",
    marginTop: 7,
    marginBottom: 30,
  },
  heading: { color: "#FFFFFF", fontSize: 25, fontWeight: "800" },
  subtitle: { color: "#D6D9E3", fontSize: 14, marginTop: 8, marginBottom: 22 },
  label: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    padding: 14,
    fontSize: 15,
    color: NAVY,
  },
  multiline: { minHeight: 85, textAlignVertical: "top" },
  button: {
    backgroundColor: GOLD,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 28,
  },
  buttonText: { color: NAVY, fontWeight: "800", letterSpacing: 0.5 },
  back: { alignItems: "center", padding: 18 },
  backText: { color: "#FFFFFF", fontSize: 14 },
});
