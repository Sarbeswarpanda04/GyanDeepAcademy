
import { useCallback, useState } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { supabase } from "../lib/supabase";
import InstituteHeader from "../components/InstituteHeader";
import FloatingTabBar from "../components/FloatingTabBar";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const MUTED = "#9DB1BE";
const ICON = "#526D85";
const RED = "#D62828";

type IconName = React.ComponentProps<typeof Feather>["name"];

type SettingsGroup = {
  title: string;
  items: {
    icon: IconName;
    label: string;
  }[];
};

const groups: SettingsGroup[] = [
  {
    title: "INSTITUTE",
    items: [
      { icon: "briefcase", label: "Institute profile" },
      { icon: "layers", label: "Batches" },
      { icon: "book-open", label: "Classes" },
      { icon: "credit-card", label: "Fee plans" },
      { icon: "sliders", label: "Fee settings" },
      { icon: "credit-card", label: "ID card settings" },
      { icon: "file-text", label: "Exam report card" },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      { icon: "users", label: "Team" },
      { icon: "user-check", label: "Staff/teachers" },
      { icon: "grid", label: "QR Join" },
      { icon: "user-plus", label: "Join requests" },
      { icon: "bar-chart-2", label: "Reports & export" },
    ],
  },
  {
    title: "APP",
    items: [
      { icon: "play-circle", label: "How to use the app" },
      { icon: "settings", label: "App settings" },
      { icon: "shield", label: "Privacy policy" },
      { icon: "file-text", label: "Terms & conditions" },
      { icon: "rotate-ccw", label: "Refund policy" },
      { icon: "help-circle", label: "Help & support" },
    ],
  },
];

export default function SettingsScreen() {
  const [instituteName, setInstituteName] = useState("GyanDeep Academy");

  const loadInstitute = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: membership, error: membershipError } =
        await supabase
          .from("institute_members")
          .select("institute_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership) {
        setInstituteName("GyanDeep Academy");
        return;
      }

      const { data, error } = await supabase
        .from("institutes")
        .select("name")
        .eq("id", membership.institute_id)
        .maybeSingle();

      if (error) throw error;

      setInstituteName(data?.name?.trim() || "GyanDeep Academy");
    } catch (error) {
      console.error("Could not load institute details:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadInstitute();
    }, [loadInstitute])
  );

  async function handleLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.auth.signOut();

            if (error) throw error;

            router.replace("/login");
          } catch (error) {
            console.error("Logout failed:", error);
            Alert.alert(
              "Logout failed",
              "Unable to log out. Please try again."
            );
          }
        },
      },
    ]);
  }

  function openItem(label: string) {
    switch (label) {
      case "Institute profile":
        router.push("/institute-profile");
        break;

      case "Classes":
        router.push("/classes");
        break;

      case "Batches":
        router.push("/batches");
        break;

      case "ID card settings":
        router.push("/student-id-card-settings");
        break;

      default:
        Alert.alert(
          label,
          `${label} screen will be implemented next.`
        );
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={NAVY}
        translucent={false}
      />

      <InstituteHeader subtitle="Institute settings" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.pageTitle}>Settings</Text>
          <Text style={styles.pageSubtitle}>
            Manage {instituteName} and your app preferences.
          </Text>
        </View>

        {groups.map((group) => (
          <View style={styles.group} key={group.title}>
            <Text style={styles.groupTitle}>{group.title}</Text>

            {group.items.map((item, index) => (
              <TouchableOpacity
                key={item.label}
                style={[
                  styles.row,
                  index === group.items.length - 1 && styles.lastRow,
                ]}
                activeOpacity={0.7}
                onPress={() => openItem(item.label)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={styles.rowIconBox}>
                  <Feather name={item.icon} size={19} color={ICON} />
                </View>

                <Text style={styles.rowLabel}>{item.label}</Text>

                <Feather
                  name="chevron-right"
                  size={20}
                  color="#C2D0DA"
                />
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <TouchableOpacity
          style={styles.logoutRow}
          onPress={handleLogout}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Feather name="log-out" size={21} color={RED} />
          <Text style={styles.logoutLabel}>Logout</Text>
          <View style={styles.logoutSpacer} />
          <Feather name="chevron-right" size={20} color={RED} />
        </TouchableOpacity>

        <Text style={styles.version}>
          {instituteName} · Version 1.0.0
        </Text>
      </ScrollView>

      <FloatingTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 17,
    paddingTop: 18,
    paddingBottom: 120,
  },
  intro: {
    marginBottom: 20,
  },
  pageTitle: {
    color: NAVY,
    fontSize: 27,
    fontWeight: "800",
  },
  pageSubtitle: {
    color: "#718397",
    fontSize: 13,
    marginTop: 5,
    lineHeight: 20,
  },
  group: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DFE7ED",
    overflow: "hidden",
    marginBottom: 18,
  },
  groupTitle: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    paddingHorizontal: 18,
    paddingTop: 17,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 58,
    paddingHorizontal: 17,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DFE7ED",
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  rowIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#F1F5F8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    color: NAVY,
    fontSize: 14,
    fontWeight: "600",
  },
  logoutRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F0DADA",
  },
  logoutLabel: {
    color: RED,
    fontSize: 15,
    fontWeight: "700",
  },
  logoutSpacer: {
    flex: 1,
  },
  version: {
    color: MUTED,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 24,
  },
});
