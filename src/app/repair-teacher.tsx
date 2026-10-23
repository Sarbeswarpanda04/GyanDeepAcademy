
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

const INSTITUTE_ID = "171fb947-8fd8-4395-abd2-e54ef87fd411";
const MEMBER_ID = "a802629b-6814-4f03-ba33-38a957cf3c85";

export default function RepairTeacherScreen() {
  const [loading, setLoading] = useState(false);

  const repairTeacher = async () => {
    if (loading) return;

    Alert.alert(
      "Repair teacher account",
      "This will repair the existing teacher's internal login credentials. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Repair",
          onPress: async () => {
            setLoading(true);

            try {
              // Require a signed-in owner/manager session.
              const {
                data: { session },
                error: sessionError,
              } = await supabase.auth.getSession();

              if (sessionError) throw sessionError;

              if (!session) {
                throw new Error(
                  "Your session has expired. Sign in as the institute owner first."
                );
              }

              const { data, error } =
                await supabase.functions.invoke("repair-team-member", {
                  body: {
                    instituteId: INSTITUTE_ID,
                    memberId: MEMBER_ID,
                  },
                });

              if (error) {
                // Edge Function errors may include the backend response.
                const context = (
                  error as { context?: Response }
                ).context;

                let message = error.message;

                if (context && typeof context.clone === "function") {
                  try {
                    const response = context.clone();
                    const body = await response.json();
                    message = body?.message ?? message;
                  } catch {
                    // Keep the SDK error if no response body is available.
                  }
                }

                throw new Error(message);
              }

              if (!data?.success) {
                throw new Error(
                  data?.message ?? "The teacher account could not be repaired."
                );
              }

              Alert.alert(
                "Repair successful",
                "The existing teacher account has been repaired. Try signing in with the registered mobile number and existing PIN."
              );
            } catch (error) {
              console.error("[repair-teacher-screen]", error);

              Alert.alert(
                "Repair failed",
                error instanceof Error
                  ? error.message
                  : "An unexpected error occurred."
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Repair Teacher Account</Text>

        <Text style={styles.description}>
          Repairs the existing teacher record. It does not create a second
          team member. Use this screen only while signed in as an authorized
          institute owner or manager.
        </Text>

        <Text style={styles.detail}>Teacher: Sarbeswar Panda</Text>
        <Text style={styles.detail}>Mobile: 8260916384</Text>

        <TouchableOpacity
          style={[styles.button, loading && styles.disabled]}
          onPress={repairTeacher}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Repair Existing Account</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F1F5F8",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E1E8EF",
  },
  title: {
    fontSize: 23,
    fontWeight: "800",
    color: "#202F42",
    marginBottom: 12,
  },
  description: {
    color: "#657689",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  detail: {
    fontSize: 15,
    color: "#202F42",
    marginBottom: 8,
  },
  button: {
    marginTop: 18,
    backgroundColor: "#202F42",
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.65,
  },
});
