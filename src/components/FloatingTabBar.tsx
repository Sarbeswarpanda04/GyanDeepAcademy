
import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { usePathname, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NAVY = "#10264A";
const GOLD = "#F3C969";

const tabs = [
  { label: "Home", icon: "home", route: "/dashboard" },
  { label: "Students", icon: "users", route: "/students" },
  { label: "Teacher", icon: "book-open", route: "/teacher" },
  {
    label: "Attendance",
    icon: "calendar",
    route: "/attendance",
  },
  { label: "Fees", icon: "credit-card", route: "/fees" },
  { label: "Settings", icon: "settings", route: "/settings" },
] as const;

export default function FloatingTabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrapper,
        { bottom: Math.max(insets.bottom, 10) + 8 },
      ]}
    >
      <View style={styles.bar}>
        {tabs.map((tab) => {
          const active =
            pathname === tab.route ||
            (tab.route === "/dashboard" &&
              pathname === "/");

          return (
            <Pressable
              key={tab.route}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => router.navigate(tab.route as never)}
              style={styles.item}
            >
              <View
                style={[
                  styles.iconBox,
                  active && styles.activeIconBox,
                ]}
              >
                <Feather
                  name={tab.icon}
                  size={20}
                  color={active ? GOLD : "#748096"}
                />
              </View>

              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  active && styles.activeLabel,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 10,
    right: 10,
    zIndex: 100,
  },
  bar: {
    minHeight: 68,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 3,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#E8EBF1",
    elevation: 12,
    shadowColor: "#10264A",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  iconBox: {
    width: 32,
    height: 29,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  activeIconBox: {
    backgroundColor: NAVY,
  },
  label: {
    color: "#748096",
    fontSize: 9,
    fontWeight: "500",
    textAlign: "center",
  },
  activeLabel: {
    color: NAVY,
    fontWeight: "700",
    borderRadius: 10,
  },
});
