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
const MUTED = "#8297A8";
const ICON = "#526D85";
const RED = "#D62828";

type IconName = React.ComponentProps<typeof Feather>["name"];

type SettingsItem = {
  icon: IconName;
  label: string;
  route: string;
};

type SettingsGroup = {
  title: string;
  items: SettingsItem[];
};

// Routes must match files inside your app/ directory.
const groups: SettingsGroup[] = [
  {
    title: "INSTITUTE",
    items: [
      {
        icon: "briefcase",
        label: "Institute profile",
        route: "/institute-profile",
      },
      {
        icon: "layers",
        label: "Batches",
        route: "/batches",
      },
      {
        icon: "book-open",
        label: "Classes",
        route: "/classes",
      },
      {
        icon: "credit-card",
        label: "Fee plans",
        route: "/fee-plans",
      },
      {
        icon: "sliders",
        label: "Fee settings",
        route: "/fee-settings",
      },
      {
        icon: "credit-card",
        label: "ID card settings",
        route: "/student-id-card-settings",
      },
      {
        icon: "file-text",
        label: "Exam report card",
        route: "/exam-report-card",
      },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      {
        icon: "users",
        label: "Team",
        route: "/team",
      },
      {
        icon: "user-check",
        label: "Staff/teachers",
        route: "/staff",
      },
      {
        icon: "grid",
        label: "QR Join",
        route: "/qr-join",
      },
      {
        icon: "user-plus",
        label: "Join requests",
        route: "/join-requests",
      },
      {
        icon: "bar-chart-2",
        label: "Reports & export",
        route: "/reports",
      },
    ],
  },
  {
    title: "APP",
    items: [
      {
        icon: "play-circle",
        label: "How to use the app",
        route: "/help",
      },
      {
        icon: "settings",
        label: "App settings",
        route: "/app-settings",
      },
      {
        icon: "shield",
        label: "Privacy policy",
        route: "/privacy-policy",
      },
      {
        icon: "file-text",
        label: "Terms & conditions",
        route: "/terms",
      },
      {
        icon: "help-circle",
        label: "Help & support",
        route: "/support",
      },
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

  const handleLogout = () => {
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
  };

  const openItem = (item: SettingsItem) => {
    router.push(item.route as never);
  };

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={NAVY}
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
            Manage {instituteName} and its preferences.
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
                activeOpacity={0.75}
                onPress={() => openItem(item)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={styles.rowIconBox}>
                  <Feather name={item.icon} size={18} color={ICON} />
                </View>

                <Text style={styles.rowLabel}>{item.label}</Text>

                <Feather
                  name="chevron-right"
                  size={19}
                  color="#B5C4CE"
                />
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <TouchableOpacity
          style={styles.logoutRow}
          onPress={handleLogout}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Feather name="log-out" size={20} color={RED} />
          <Text style={styles.logoutLabel}>Log out</Text>
          <View style={styles.logoutSpacer} />
          <Feather name="chevron-right" size={19} color={RED} />
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DFE7ED",
    overflow: "hidden",
    marginBottom: 16,
  },
  groupTitle: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    paddingHorizontal: 17,
    paddingTop: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5EBF0",
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  rowIconBox: {
    width: 35,
    height: 35,
    borderRadius: 10,
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
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#F0DADA",
  },
  logoutLabel: {
    color: RED,
    fontSize: 14,
    fontWeight: "700",
  },
  logoutSpacer: {
    flex: 1,
  },
  version: {
    color: MUTED,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 22,
  },
});