import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

const PURPLE = "#611CD0";
const PURPLE_DARK = "#44109D";
const PURPLE_BRIGHT = "#4C02F7";
const BACKGROUND = "#F3F3FF";
const TEXT = "#1F2937";
const MUTED = "#718096";
const BORDER = "#E8E3F5";
const WHITE = "#FFFFFF";

const APP_LOGO: ImageSourcePropType = require("../../assets/images/icon.png");

const roles = [
  {
    id: "owner",
    title: "Coaching Owner",
    subtitle: "Manage your institute",
    icon: "business-outline" as const,
  },
  {
    id: "teacher",
    title: "Teacher",
    subtitle: "Classes, attendance and exams",
    icon: "school-outline" as const,
  },
  {
    id: "student",
    title: "Student",
    subtitle: "Timetable, fees and results",
    icon: "book-outline" as const,
  },
];

type InstituteBranding = {
  name: string;
  logoUrl: string | null;
};

export default function Index() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [institute, setInstitute] = useState<InstituteBranding | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const session = data.session;

        if (!session?.user) {
          if (!cancelled) setCheckingSession(false);
          return;
        }

        const { data: teacherMembership, error: teacherError } = await supabase
          .from("institute_team_members")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("role", "teacher")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (teacherError) throw teacherError;
        if (cancelled) return;

        if (teacherMembership) {
          router.replace("/teacher/teacher-dashboard" as never);
          return;
        }

        const { data: ownerMembership, error: ownerError } = await supabase
          .from("institute_members")
          .select("institute_id")
          .eq("user_id", session.user.id)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();

        if (ownerError) throw ownerError;
        if (cancelled) return;

        if (ownerMembership?.institute_id) {
          const { data: instituteData, error: instituteError } = await supabase
            .from("institutes")
            .select("name, logo_url")
            .eq("id", ownerMembership.institute_id)
            .maybeSingle();

          if (instituteError) throw instituteError;
          if (cancelled) return;

          if (instituteData) {
            let logoUrl: string | null = instituteData.logo_url || null;

            if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
              const { data: signedData, error: storageError } =
                await supabase.storage
                  .from("institute-assets")
                  .createSignedUrl(logoUrl, 3600);

              if (storageError) {
                console.warn(
                  "Unable to load institute logo:",
                  storageError.message,
                );
                logoUrl = null;
              } else {
                logoUrl = signedData?.signedUrl ?? null;
              }
            }

            if (cancelled) return;

            setInstitute({
              name: instituteData.name || "GyanDeep Academy",
              logoUrl,
            });
          }

          if (cancelled) return;
          router.replace("/dashboard" as never);
          return;
        }

        // Other authenticated roles remain on the role-selection screen.
        if (!cancelled) setCheckingSession(false);
      } catch (error: unknown) {
        if (cancelled) return;

        console.error("[role-selection] Session restore failed:", error);
        Alert.alert(
          "Unable to restore your session",
          error instanceof Error ? error.message : "Please try again.",
        );
        setCheckingSession(false);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function continueSetup() {
    if (!selectedRole) return;

    if (selectedRole === "teacher") {
      router.push("/teacher/teacher-login" as never);
      return;
    }

    router.push({
      pathname: "/login",
      params: { role: selectedRole },
    } as never);
  }

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar barStyle="light-content" backgroundColor={PURPLE_DARK} />
        <LinearGradient
          colors={[PURPLE, PURPLE_DARK, PURPLE_BRIGHT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.loadingContent}>
          <View style={styles.loadingLogoShadow}>
            <Image source={APP_LOGO} style={styles.loadingLogoImage} resizeMode="contain" />
          </View>
          <ActivityIndicator size="large" color={WHITE} />
          <Text style={styles.loadingText}>Preparing your experience...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = institute?.name || "GyanDeep Academy";
  const logoUri = !logoFailed ? institute?.logoUrl : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE_DARK} />
      <LinearGradient
        colors={[PURPLE, PURPLE_DARK, PURPLE_BRIGHT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.orbTop} />
      <View pointerEvents="none" style={styles.orbBottom} />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.brandBlock}>
          <View style={styles.logoGlow}>
            <LinearGradient
              colors={["#FFFFFF", "#F0E7FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoSurface}
            >
              {logoUri ? (
                <Image
                  source={{ uri: logoUri }}
                  style={styles.logoImage}
                  resizeMode="contain"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <Image source={APP_LOGO} style={styles.logoImage} resizeMode="contain" />
              )}
            </LinearGradient>
          </View>

          <Text style={styles.brandName}>{displayName}</Text>
          <Text style={styles.brandTagline}>LEARN TODAY. LEAD TOMORROW.</Text>
          <View style={styles.brandAccent} />
          <Text style={styles.heroLine}>A brighter future</Text>
          <Text style={styles.heroAccent}>starts with learning.</Text>
        </View>

        <View style={styles.selectionHeader}>
          <Text style={styles.sectionTitle}>Who's learning today?</Text>
          <Text style={styles.sectionSubtitle}>Choose your space to continue.</Text>
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
                style={({ pressed }) => [
                  styles.roleCard,
                  active && styles.roleCardActive,
                  pressed && styles.roleCardPressed,
                ]}
              >
                <View style={[styles.roleIcon, active && styles.roleIconActive]}>
                  <Ionicons
                    name={role.icon}
                    size={23}
                    color={active ? WHITE : PURPLE}
                  />
                </View>

                <View style={styles.roleText}>
                  <Text style={[styles.roleTitle, active && styles.roleTitleActive]}>
                    {role.title}
                  </Text>
                  <Text style={[styles.roleSubtitle, active && styles.roleSubtitleActive]}>
                    {role.subtitle}
                  </Text>
                </View>

                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={continueSetup}
          disabled={!selectedRole}
          style={({ pressed }) => [
            styles.buttonOuter,
            !selectedRole && styles.buttonDisabled,
            pressed && !!selectedRole && styles.buttonPressed,
          ]}
        >
          <LinearGradient
            colors={selectedRole ? [PURPLE, PURPLE_BRIGHT] : ["#9A85C8", "#8E7AB8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={19} color={WHITE} />
          </LinearGradient>
        </Pressable>

        <View style={styles.footer}>
          <Ionicons name="sparkles-outline" size={13} color="#E8DFFF" />
          <Text style={styles.footerText}>YOUR JOURNEY. YOUR POTENTIAL.</Text>
          <Ionicons name="sparkles-outline" size={13} color="#E8DFFF" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PURPLE_DARK,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: PURPLE_DARK,
  },
  loadingContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  loadingLogoShadow: {
    width: 108,
    height: 108,
    borderRadius: 32,
    padding: 10,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#180044",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  loadingLogoImage: {
    width: "100%",
    height: "100%",
  },
  loadingText: {
    color: "#F0E9FF",
    fontSize: 13,
    fontWeight: "600",
  },
  orbTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -135,
    right: -90,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  orbBottom: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    bottom: -100,
    left: -100,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 23,
    paddingTop: 18,
    paddingBottom: 22,
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: 27,
  },
  logoGlow: {
    width: 132,
    height: 132,
    borderRadius: 40,
    padding: 4,
    marginBottom: 18,
    backgroundColor: "rgba(255,255,255,0.24)",
    shadowColor: "#160039",
    shadowOffset: { width: 0, height: 13 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 14,
  },
  logoSurface: {
    flex: 1,
    borderRadius: 36,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  brandName: {
    color: WHITE,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1.2,
    textAlign: "center",
    textShadowColor: "rgba(20,0,60,0.35)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 7,
  },
  brandTagline: {
    color: "#E7DAFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2.4,
    textAlign: "center",
    marginTop: 8,
  },
  brandAccent: {
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#D9C4FF",
    marginTop: 17,
    marginBottom: 15,
  },
  heroLine: {
    color: WHITE,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  heroAccent: {
    color: "#E4D2FF",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  selectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    color: WHITE,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    color: "#E0D4F7",
    fontSize: 12,
    marginTop: 5,
  },
  roleList: {
    gap: 10,
  },
  roleCard: {
    minHeight: 73,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 13,
    gap: 12,
    shadowColor: "#180044",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 9,
    elevation: 3,
  },
  roleCardActive: {
    backgroundColor: "#F3ECFF",
    borderColor: "#D5BFFF",
    shadowOpacity: 0.22,
    elevation: 6,
  },
  roleCardPressed: {
    transform: [{ scale: 0.99 }],
  },
  roleIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "#F0E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  roleIconActive: {
    backgroundColor: PURPLE,
  },
  roleText: {
    flex: 1,
    gap: 4,
  },
  roleTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "800",
  },
  roleTitleActive: {
    color: PURPLE_DARK,
  },
  roleSubtitle: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 15,
  },
  roleSubtitleActive: {
    color: "#6B4B9D",
  },
  radio: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#C9B9E6",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    borderColor: PURPLE,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PURPLE,
  },
  buttonOuter: {
    marginTop: 17,
    borderRadius: 16,
    shadowColor: "#1B004A",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 7,
  },
  button: {
    minHeight: 53,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.78,
    shadowOpacity: 0.08,
    elevation: 2,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 22,
  },
  footerText: {
    color: "#E8DFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
});
