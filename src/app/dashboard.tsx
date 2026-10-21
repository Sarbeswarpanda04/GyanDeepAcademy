
import { useCallback } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import InstituteHeader from "../components/InstituteHeader";
import FloatingTabBar from "../components/FloatingTabBar";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const MUTED = "#9DB1BE";
const GREEN = "#397D40";
const GOLD = "#947300";
const WHITE = "#FFFFFF";

type IconName = React.ComponentProps<typeof Feather>["name"];

function openSection(title: string, route?: string) {
  if (route) {
    router.navigate(route as never);
    return;
  }

  Alert.alert(title, `${title} will be available soon.`);
}

export default function DashboardScreen() {
  const { width } = useWindowDimensions();

  const horizontalPadding = 18;
  const gap = 12;
  const tileWidth = (width - horizontalPadding * 2 - gap * 2) / 3;

  const quickActions: {
    title: string;
    icon: IconName;
    route?: string;
    color: string;
    iconColor: string;
  }[] = [
    {
      title: "Add student",
      icon: "user-plus",
      route: "/students",
      color: "#ECEEF1",
      iconColor: NAVY,
    },
    {
      title: "Create batch",
      icon: "layers",
      color: "#EFF2F4",
      iconColor: "#3E627A",
    },
    {
      title: "Exam/Test",
      icon: "clipboard",
      color: "#EFF2F4",
      iconColor: "#3E627A",
    },
  ];

  const instituteActions: {
    title: string;
    icon: IconName;
    route?: string;
    color: string;
    iconColor: string;
  }[] = [
    {
      title: "Teacher / Staff",
      icon: "briefcase",
      route: "/teachers",
      color: "#EDF5F5",
      iconColor: "#208395",
    },
    {
      title: "Notice board",
      icon: "volume-2",
      color: "#F4F0F8",
      iconColor: "#8050B7",
    },
    {
      title: "Study material",
      icon: "book-open",
      color: "#EFF2F4",
      iconColor: "#405F7E",
    },
    {
      title: "Team",
      icon: "users",
      color: "#F0F1F9",
      iconColor: "#5D6DC5",
    },
    {
      title: "Birthdays",
      icon: "gift",
      color: "#F9EDF2",
      iconColor: "#C2185B",
    },
    {
      title: "Reports",
      icon: "bar-chart-2",
      color: "#F8F3ED",
      iconColor: "#B8761E",
    },
  ];

  const refreshDashboard = useCallback(() => {
    // Dashboard currently uses the reference layout and placeholder values.
  }, []);

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={NAVY}
        translucent={false}
      />

      <InstituteHeader subtitle="Coaching Owner" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Today's collection and attendance */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHalf}>
            <View style={styles.summaryHeading}>
              <Feather name="dollar-sign" size={24} color={GREEN} />
              <Text style={styles.summaryLabel} numberOfLines={1}>
                Today's collection
              </Text>
            </View>

            <Text style={[styles.summaryAmount, { color: GREEN }]}>
              ₹0
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <TouchableOpacity
            style={styles.summaryHalf}
            activeOpacity={0.75}
            onPress={() => openSection("Today's attendance", "/attendance")}
          >
            <View style={styles.summaryHeading}>
              <Feather name="calendar" size={24} color={NAVY} />
              <Text style={styles.summaryLabel} numberOfLines={1}>
                Today's attendance
              </Text>
            </View>

            <View style={styles.summaryValueRow}>
              <Text style={styles.summaryCount}>0</Text>
              <Text style={styles.summaryDetail}>present · 0%</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Pending, students and this month */}
        <View style={styles.secondarySummaryCard}>
          <TouchableOpacity
            style={styles.secondarySummaryItem}
            activeOpacity={0.75}
            onPress={() => openSection("Pending fees", "/fees")}
          >
            <View style={styles.summaryHeading}>
              <Feather name="clock" size={22} color={GOLD} />
              <Text style={styles.summaryLabel} numberOfLines={1}>
                Pending
              </Text>
            </View>
            <Text style={[styles.secondaryAmount, { color: GOLD }]}>
              ₹0
            </Text>
          </TouchableOpacity>

          <View style={styles.secondaryDivider} />

          <TouchableOpacity
            style={styles.secondarySummaryItem}
            activeOpacity={0.75}
            onPress={() => openSection("Students", "/students")}
          >
            <View style={styles.summaryHeading}>
              <Feather name="users" size={22} color={NAVY} />
              <Text style={styles.summaryLabel} numberOfLines={1}>
                Students
              </Text>
            </View>
            <View style={styles.summaryValueRow}>
              <Text style={styles.secondaryCount}>0</Text>
              <Text style={styles.summaryDetail}>6 batches</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.secondaryDivider} />

          <TouchableOpacity
            style={styles.secondarySummaryItem}
            activeOpacity={0.75}
            onPress={() => openSection("This month's collection", "/fees")}
          >
            <View style={styles.summaryHeading}>
              <Feather name="calendar" size={22} color={GREEN} />
              <Text style={styles.summaryLabel} numberOfLines={1}>
                This month
              </Text>
            </View>
            <Text style={[styles.secondaryAmount, { color: GREEN }]}>
              ₹0
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Quick actions</Text>

          <View style={styles.tilesRow}>
            {quickActions.map((item) => (
              <TouchableOpacity
                key={item.title}
                style={[
                  styles.tile,
                  {
                    width: tileWidth,
                    backgroundColor: item.color,
                  },
                ]}
                activeOpacity={0.75}
                onPress={() => openSection(item.title, item.route)}
              >
                <View
                  style={[
                    styles.tileIcon,
                    { backgroundColor: item.iconColor },
                  ]}
                >
                  <Feather name={item.icon} size={31} color={WHITE} />
                </View>

                <Text style={styles.tileTitle}>{item.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Manage institute */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Manage institute</Text>

          <View style={styles.tilesGrid}>
            {instituteActions.map((item) => (
              <TouchableOpacity
                key={item.title}
                style={[
                  styles.tile,
                  styles.manageTile,
                  {
                    width: tileWidth,
                    backgroundColor: item.color,
                  },
                ]}
                activeOpacity={0.75}
                onPress={() => openSection(item.title, item.route)}
              >
                <View
                  style={[
                    styles.tileIcon,
                    { backgroundColor: item.iconColor },
                  ]}
                >
                  <Feather name={item.icon} size={30} color={WHITE} />
                </View>

                <Text style={styles.tileTitle}>{item.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.footer}>
          GyanDeep Academy · Learn Today, Lead Tomorrow
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
  content: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 100,
    gap: 12,
  },

  summaryCard: {
    backgroundColor: WHITE,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E4EBF0",
    paddingVertical: 16,
    paddingHorizontal: 12,
    minHeight: 104,
    flexDirection: "row",
    alignItems: "stretch",
  },
  summaryHalf: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: 2,
  },
  summaryHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  summaryLabel: {
    flexShrink: 1,
    color: MUTED,
    fontSize: 12,
    fontWeight: "600",
  },
  summaryAmount: {
    fontSize: 25,
    fontWeight: "800",
    marginTop: 10,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: "#EAF0F4",
    marginHorizontal: 8,
  },
  summaryValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 9,
  },
  summaryCount: {
    color: NAVY,
    fontSize: 25,
    fontWeight: "800",
  },
  summaryDetail: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "500",
  },

  secondarySummaryCard: {
    backgroundColor: WHITE,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E4EBF0",
    paddingVertical: 16,
    paddingHorizontal: 8,
    minHeight: 108,
    flexDirection: "row",
    alignItems: "stretch",
  },
  secondarySummaryItem: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  secondaryDivider: {
    width: 1,
    backgroundColor: "#EAF0F4",
    marginHorizontal: 5,
  },
  secondaryAmount: {
    fontSize: 23,
    fontWeight: "800",
    marginTop: 10,
  },
  secondaryCount: {
    color: NAVY,
    fontSize: 23,
    fontWeight: "800",
  },

  sectionCard: {
    backgroundColor: WHITE,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E4EBF0",
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sectionTitle: {
    color: NAVY,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 17,
  },

  tilesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  tile: {
    minHeight: 118,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    paddingVertical: 12,
  },
  manageTile: {
    minHeight: 118,
  },
  tileIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  tileTitle: {
    color: NAVY,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  footer: {
    color: MUTED,
    textAlign: "center",
    fontSize: 9,
    paddingTop: 2,
    paddingBottom: 8,
  },
});
