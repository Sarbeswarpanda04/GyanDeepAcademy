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

  const contentPadding = 12;
  const sectionPadding = 10;
  const sectionBorder = 1;
  const tileGap = 8;
  const tileAreaWidth =
    width - contentPadding * 2 - (sectionPadding + sectionBorder) * 2;
  const tileWidth = (tileAreaWidth - tileGap * 2) / 3;
  const quickTileWidth = (tileAreaWidth - tileGap * 3) / 4;

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
      route: "/batches",
      color: "#EFF2F4",
      iconColor: "#3E627A",
    },
    {
      title: "Create class",
      icon: "book-open",
      route: "/classes",
      color: "#EFF2F4",
      iconColor: "#3E627A",
    },
    {
      title: "Exam/Test",
      icon: "clipboard",
      route: "/exams",
      color: "#EFF2F4",
      iconColor: "#3E627A",
    },
    {
      title: "Create subject",
      icon: "book",
      route: "/subjects",
      color: "#EFF2F4",
      iconColor: "#3E627A",
    },
    {
      title: "Assign Subject",
      icon: "user-check",
      route: "/assign-subject",
      color: "#EAF4EE",
      iconColor: "#397D40",
    },
    {
      title: "Timetable Management",
      icon: "calendar",
      route: "/timetable-management",
      color: "#E8F3EE",
      iconColor: "#20815A",
    },
    {
      title: "View Timetable",
      icon: "printer",
      route: "/timetable-view",
      color: "#FFF4D6",
      iconColor: "#947300",
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
      route: "/teacher",
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
      route: "/team",
      color: "#F0F1F9",
      iconColor: "#5D6DC5",
    },
    {
      title: "Birthdays",
      icon: "gift",
      route: "/birthdays",
      color: "#F9EDF2",
      iconColor: "#C2185B",
    },
    {
      title: "Reports",
      icon: "bar-chart-2",
      color: "#F8F3ED",
      iconColor: "#B8761E",
    },
    {
      title: "Repair Teacher",
      icon: "tool",
      route: "/repair-teacher",
      color: "#F4F0F8",
      iconColor: "#8050B7",
    },
    {
      title: "Expenses",
      icon: "dollar-sign",
      route: "/expenses",
      color: "#F8F3ED",
      iconColor: "#B8761E",
    },
    {
      title: "Staff Salary",
      icon: "credit-card",
      route: "/staff-salary",
      color: "#F8F3ED",
      iconColor: "#1e8ab8",
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

            <Text style={[styles.summaryAmount, { color: GREEN }]}>₹0</Text>
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
            <Text style={[styles.secondaryAmount, { color: GOLD }]}>₹0</Text>
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
            <Text style={[styles.secondaryAmount, { color: GREEN }]}>₹0</Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Quick actions</Text>

          <View style={styles.quickActionsRow}>
            {quickActions.map((item) => (
              <TouchableOpacity
                key={item.title}
                style={[
                  styles.tile,
                  styles.quickActionTile,
                  {
                    width: quickTileWidth,
                    backgroundColor: item.color,
                  },
                ]}
                activeOpacity={0.75}
                onPress={() => openSection(item.title, item.route)}
              >
                <View
                  style={[
                    styles.tileIcon,
                    styles.quickActionIcon,
                    { backgroundColor: item.iconColor },
                  ]}
                >
                  <Feather name={item.icon} size={17} color={WHITE} />
                </View>

                <Text style={[styles.tileTitle, styles.quickActionTitle]}>
                  {item.title}
                </Text>
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
                  style={[styles.tileIcon, { backgroundColor: item.iconColor }]}
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
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sectionTitle: {
    color: NAVY,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 17,
  },

  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
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
  quickActionTile: {
    flexShrink: 0,
    minHeight: 98,
    paddingHorizontal: 2,
    paddingVertical: 8,
    borderRadius: 16,
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
  quickActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    marginBottom: 8,
  },
  tileTitle: {
    color: NAVY,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  quickActionTitle: {
    fontSize: 10,
    lineHeight: 13,
  },
  footer: {
    color: MUTED,
    textAlign: "center",
    fontSize: 9,
    paddingTop: 2,
    paddingBottom: 8,
  },
});
