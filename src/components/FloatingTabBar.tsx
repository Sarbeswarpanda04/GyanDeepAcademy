
import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PURPLE = "#611CD0";
const PURPLE_DARK = "#44109D";
const PURPLE_BRIGHT = "#4C02F7";
const MUTED = "#9290A3";

const tabs = [
  { label: "Home", icon: "home", route: "/dashboard" },
  { label: "Students", icon: "users", route: "/students" },
  { label: "Teacher", icon: "book-open", route: "/teacher" },
  { label: "Attendance", icon: "calendar", route: "/attendance" },
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
        {
          bottom: Math.max(insets.bottom, 10) + 8,
        },
      ]}
    >
      <View style={styles.bar}>
        {tabs.map((tab) => {
          const active =
            pathname === tab.route ||
            (tab.route === "/dashboard" && pathname === "/") ||
            pathname.startsWith(`${tab.route}/`);

          return (
            <Pressable
              key={tab.route}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => router.navigate(tab.route as never)}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.pressedItem,
              ]}
            >
              {active ? (
                <LinearGradient
                  colors={[
                    PURPLE,
                    PURPLE_DARK,
                    PURPLE_BRIGHT,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activeIconBox}
                >
                  <Feather
                    name={tab.icon}
                    size={20}
                    color="#FFFFFF"
                  />
                </LinearGradient>
              ) : (
                <View style={styles.iconBox}>
                  <Feather
                    name={tab.icon}
                    size={20}
                    color={MUTED}
                  />
                </View>
              )}

              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  active && styles.activeLabel,
                ]}
              >
                {tab.label}
              </Text>

              {active && <View style={styles.activeIndicator} />}
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
    minHeight: 76,
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 5,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#EDE7F8",

    elevation: 14,
    shadowColor: "#351078",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },

  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  pressedItem: {
    opacity: 0.72,
  },

  iconBox: {
    width: 38,
    height: 35,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  activeIconBox: {
    width: 38,
    height: 35,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: PURPLE,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },

  label: {
    color: MUTED,
    fontSize: 9,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.1,
  },

  activeLabel: {
    color: PURPLE_DARK,
    fontWeight: "800",
  },

  activeIndicator: {
    position: "absolute",
    bottom: -5,
    width: 15,
    height: 3,
    borderRadius: 3,
    backgroundColor: PURPLE,
  },
});
