
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

const NAVY = "#10264A";
const GOLD = "#D9AC52";
const BACKGROUND = "#F5F7FB";

const roles = [
  {
    id: "owner",
    title: "Coaching Owner",
    subtitle: "Manage your entire institute",
    icon: "🏫",
  },
  {
    id: "manager",
    title: "Manager",
    subtitle: "Manage daily operations",
    icon: "📋",
  },
  {
    id: "teacher",
    title: "Teacher",
    subtitle: "Classes, attendance and exams",
    icon: "👨‍🏫",
  },
  {
    id: "student",
    title: "Student",
    subtitle: "Timetable, fees and results",
    icon: "🎓",
  },
];

export default function Index() {
  const [selectedRole, setSelectedRole] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data.session) {
          if (!cancelled) setCheckingSession(false);
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
        if (cancelled) return;

        router.replace(membership ? "/dashboard" : "/institute-setup");
      } catch (error: unknown) {
        if (cancelled) return;

        Alert.alert(
          "Unable to restore your session",
          error instanceof Error
            ? error.message
            : "Please try signing in again.",
        );
        setCheckingSession(false);
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [router]);


function continueSetup() {
  if (!selectedRole) return;

  if (selectedRole === "teacher") {
    router.push("/teacher/teacher-login");
    return;
  }

  // Keep the existing flow for other roles.
  router.push({
    pathname: "/login",
    params: { role: selectedRole },
  });
}


  if (checkingSession) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={BACKGROUND} />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={NAVY} />
          <Text style={styles.loadingText}>Restoring your session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={BACKGROUND}
      />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>G</Text>
          </View>

          <Text style={styles.brandName}>
            GyanDeep Academy
          </Text>
          <Text style={styles.location}>
            KHORDHA, ODISHA
          </Text>
        </View>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>
            YOUR LEARNING COMMUNITY
          </Text>

          <Text style={styles.title}>
            How will you use{"\n"}GyanDeep Academy?
          </Text>

          <Text style={styles.description}>
            Choose your role to get started with
            your personalized experience.
          </Text>
        </View>

        <View style={styles.roleList}>
          {roles.map((role) => {
            const active = selectedRole === role.id;

            return (
              <Pressable
                key={role.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setSelectedRole(role.id)}
                style={[
                  styles.roleCard,
                  active && styles.roleCardActive,
                ]}
              >
                <View
                  style={[
                    styles.roleIcon,
                    active && styles.roleIconActive,
                  ]}
                >
                  <Text style={styles.roleEmoji}>
                    {role.icon}
                  </Text>
                </View>

                <View style={styles.roleText}>
                  <Text style={styles.roleTitle}>
                    {role.title}
                  </Text>
                  <Text style={styles.roleSubtitle}>
                    {role.subtitle}
                  </Text>
                </View>

                <View
                  style={[
                    styles.radio,
                    active && styles.radioActive,
                  ]}
                >
                  {active && (
                    <View style={styles.radioDot} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={continueSetup}
          disabled={!selectedRole}
          style={({ pressed }) => [
            styles.button,
            !selectedRole && styles.buttonDisabled,
            pressed && selectedRole && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>
            Continue
          </Text>
          <Text style={styles.arrow}>→</Text>
        </Pressable>

        <Text style={styles.footer}>
          LEARN TODAY, LEAD TOMORROW
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "600",
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 24,
  },
  brand: {
    alignItems: "center",
    marginBottom: 30,
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: NAVY,
    borderWidth: 2,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  logoText: {
    color: GOLD,
    fontSize: 34,
    fontWeight: "900",
  },
  brandName: {
    color: NAVY,
    fontSize: 23,
    fontWeight: "800",
  },
  location: {
    marginTop: 5,
    fontSize: 10,
    letterSpacing: 2,
    color: "#788398",
    fontWeight: "700",
  },
  heading: {
    marginBottom: 22,
  },
  eyebrow: {
    color: "#9B742B",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  title: {
    color: NAVY,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
  },
  description: {
    color: "#697589",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  roleList: {
    gap: 12,
  },
  roleCard: {
    minHeight: 82,
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "#E7EAF1",
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  roleCardActive: {
    borderColor: NAVY,
    backgroundColor: "#F0F3F9",
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F1F3F8",
    alignItems: "center",
    justifyContent: "center",
  },
  roleIconActive: {
    backgroundColor: "#E1E7F2",
  },
  roleEmoji: {
    fontSize: 23,
  },
  roleText: {
    flex: 1,
    gap: 5,
  },
  roleTitle: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "700",
  },
  roleSubtitle: {
    color: "#7B8495",
    fontSize: 11,
    lineHeight: 16,
  },
  radio: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#C5CBD6",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    borderColor: NAVY,
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: NAVY,
  },
  button: {
    height: 54,
    borderRadius: 15,
    backgroundColor: NAVY,
    marginTop: 22,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  arrow: {
    color: GOLD,
    fontSize: 23,
    fontWeight: "700",
  },
  footer: {
    marginTop: 22,
    color: "#8A93A3",
    textAlign: "center",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.3,
  },
});
