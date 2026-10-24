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
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

const NAVY = "#123263";
const BLUE = "#2878E5";
const BACKGROUND = "#EDF5FF";
const CARD = "#FFFFFF";

const APP_LOGO: ImageSourcePropType = require("../../assets/images/icon.png");

const roles = [
  {
    id: "owner",
    title: "Coaching Owner",
    subtitle: "Manage your entire institute",
    icon: "business-outline" as const,
    color: "#2878E5",
    iconBackground: "#E7F0FF",
  },
  {
    id: "manager",
    title: "Manager",
    subtitle: "Manage daily operations",
    icon: "clipboard-outline" as const,
    color: "#8B5CF6",
    iconBackground: "#F0EAFE",
  },
  {
    id: "teacher",
    title: "Teacher",
    subtitle: "Classes, attendance and exams",
    icon: "school-outline" as const,
    color: "#0F9D8A",
    iconBackground: "#E1F7F2",
  },
  {
    id: "student",
    title: "Student",
    subtitle: "Timetable, fees and results",
    icon: "book-outline" as const,
    color: "#D18A22",
    iconBackground: "#FFF3DF",
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

        // No authenticated session: display the role-selection screen.
        if (!session?.user) {
          if (!cancelled) setCheckingSession(false);
          return;
        }

        // 1. Check active teacher membership first.
        const { data: teacherMembership, error: teacherError } =
          await supabase
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

        // 2. Check coaching-owner membership.
        const { data: ownerMembership, error: ownerError } =
          await supabase
            .from("institute_members")
            .select("institute_id")
            .eq("user_id", session.user.id)
            .eq("role", "owner")
            .limit(1)
            .maybeSingle();

        if (ownerError) throw ownerError;
        if (cancelled) return;

        // 3. Restore institute branding for an owner who has an institute.
        if (ownerMembership?.institute_id) {
          const { data: instituteData, error: instituteError } =
            await supabase
              .from("institutes")
              .select("name, logo_url")
              .eq("id", ownerMembership.institute_id)
              .maybeSingle();

          if (instituteError) throw instituteError;
          if (cancelled) return;

          if (instituteData) {
            let logoUrl: string | null = instituteData.logo_url || null;

            // If logo_url is a storage path rather than a URL,
            // create a signed URL for the institute-assets bucket.
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

        /*
         * Do not assume every authenticated user is an owner.
         * Manager/student dashboard routes are intentionally not guessed
         * here because their exact route paths have not been established.
         *
         * Leave those sessions on the role-selection screen rather than
         * incorrectly redirecting them to institute setup.
         */
        if (!cancelled) {
          setCheckingSession(false);
        }
      } catch (error: unknown) {
        if (cancelled) return;

        console.error("[role-selection] Session restore failed:", error);

        Alert.alert(
          "Unable to restore your session",
          error instanceof Error
            ? error.message
            : "Please try again.",
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
        <StatusBar
          barStyle="dark-content"
          backgroundColor={BACKGROUND}
        />

        <View style={styles.loadingContent}>
          <View style={styles.loadingLogo}>
            <Image
              source={APP_LOGO}
              style={styles.loadingLogoImage}
              resizeMode="contain"
            />
          </View>

          <ActivityIndicator size="large" color={BLUE} />

          <Text style={styles.loadingText}>
            Preparing your experience...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = institute?.name || "GyanDeep Academy";
  const logoUri = !logoFailed ? institute?.logoUrl : null;

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
        {/* Brand header */}
        <View style={styles.brand}>
          <View style={styles.logoOuter}>
            {logoUri ? (
              <Image
                source={{ uri: logoUri }}
                style={styles.logoImage}
                resizeMode="contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <Image
                source={APP_LOGO}
                style={styles.logoImage}
                resizeMode="contain"
              />
            )}
          </View>

          <Text style={styles.brandName}>{displayName}</Text>

          <View style={styles.locationRow}>
            <Ionicons
              name="location-outline"
              size={12}
              color="#7285A3"
            />
            <Text style={styles.location}>KHORDHA, ODISHA</Text>
          </View>
        </View>

        {/* Heading */}
        <View style={styles.heading}>
          <View style={styles.eyebrowPill}>
            <Ionicons
              name="sparkles-outline"
              size={13}
              color={BLUE}
            />
            <Text style={styles.eyebrow}>
              YOUR LEARNING COMMUNITY
            </Text>
          </View>

          <Text style={styles.title}>
            How will you use{"\n"}
            <Text style={styles.titleAccent}>
              GyanDeep Academy?
            </Text>
          </Text>

          <Text style={styles.description}>
            Select your role to access the tools and features designed
            for you.
          </Text>
        </View>

        {/* Role selection */}
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
                <View
                  style={[
                    styles.roleIcon,
                    { backgroundColor: role.iconBackground },
                    active && styles.roleIconActive,
                  ]}
                >
                  <Ionicons
                    name={role.icon}
                    size={26}
                    color={role.color}
                  />
                </View>

                <View style={styles.roleText}>
                  <Text style={styles.roleTitle}>{role.title}</Text>
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
                  {active && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Continue */}
        <Pressable
          accessibilityRole="button"
          onPress={continueSetup}
          disabled={!selectedRole}
          style={({ pressed }) => [
            styles.button,
            !selectedRole && styles.buttonDisabled,
            pressed && selectedRole && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>Continue</Text>
          <Ionicons
            name="arrow-forward"
            size={20}
            color="#FFFFFF"
          />
        </Pressable>

        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <Text style={styles.footerText}>
            LEARN TODAY, LEAD TOMORROW
          </Text>
          <View style={styles.footerLine} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  loadingContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  loadingLogo: {
    width: 82,
    height: 82,
    borderRadius: 25,
    backgroundColor: "#FFFFFF",
    padding: 8,
    borderWidth: 1,
    borderColor: "#D7E6FC",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingLogoImage: {
    width: "100%",
    height: "100%",
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
    marginBottom: 28,
  },
  logoOuter: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D6E5FB",
    padding: 7,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: "#285B9C",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 3,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  brandName: {
    color: NAVY,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  location: {
    fontSize: 10,
    letterSpacing: 1.8,
    color: "#7285A3",
    fontWeight: "700",
  },
  heading: {
    marginBottom: 22,
  },
  eyebrowPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#DDEBFF",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 13,
  },
  eyebrow: {
    color: BLUE,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  title: {
    color: NAVY,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  titleAccent: {
    color: BLUE,
  },
  description: {
    color: "#647793",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 320,
  },
  roleList: {
    gap: 12,
  },
  roleCard: {
    minHeight: 82,
    backgroundColor: CARD,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: "#DFEAF8",
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    gap: 13,
    shadowColor: "#214D83",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.035,
    shadowRadius: 8,
    elevation: 1,
  },
  roleCardActive: {
    borderColor: BLUE,
    backgroundColor: "#F7FAFF",
    shadowOpacity: 0.08,
    elevation: 3,
  },
  roleCardPressed: {
    transform: [{ scale: 0.99 }],
  },
  roleIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  roleIconActive: {
    borderWidth: 1,
    borderColor: "#C7DBFC",
  },
  roleText: {
    flex: 1,
    gap: 5,
  },
  roleTitle: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
  },
  roleSubtitle: {
    color: "#7889A2",
    fontSize: 11,
    lineHeight: 16,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#C7D5E8",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    borderColor: BLUE,
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: BLUE,
  },
  button: {
    minHeight: 56,
    backgroundColor: BLUE,
    borderRadius: 17,
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: "#A8C5ED",
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 28,
  },
  footerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#D5E2F3",
  },
  footerText: {
    color: "#8091AA",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
});