
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";
import InstituteHeader from "../components/InstituteHeader";
import FloatingTabBar from "../components/FloatingTabBar";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const C = {
  purple: "#6D3BDB",
  purpleDark: "#5125B8",
  purpleLight: "#EEE7FF",
  purplePale: "#F7F3FF",
  blue: "#0EA5E9",
  blueLight: "#E0F2FE",
  background: "#F7F8FE",
  white: "#FFFFFF",
  text: "#20243A",
  muted: "#8993A7",
  border: "#E9EAF3",
  green: "#168568",
  greenLight: "#E5F7EF",
  gold: "#B7791F",
  goldLight: "#FFF5DA",
  red: "#D14343",
  redLight: "#FFF0F0",
};

type IconName = React.ComponentProps<typeof Feather>["name"];

type Action = {
  title: string;
  icon: IconName;
  route?: string;
  color: string;
  iconColor: string;
};

type Metrics = {
  todayCollection: number;
  present: number;
  attendanceTotal: number;
  pendingFees: number;
  students: number;
  batches: number;
  monthCollection: number;
};

type Frequency =
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "one_time";

type StudentFee = {
  id: string;
  student_id: string;
  fee_frequency: Frequency;
  fee_amount: number | string | null;
  billing_day: number | null;
};

type FeePayment = {
  student_fee_id: string;
  billing_period_start: string;
  billing_period_end: string;
  amount_due: number | string | null;
  amount_paid: number | string | null;
  payment_date: string | null;
};

type FeeStudent = {
  id: string;
  admission_date: string;
  status: string;
};

type BillingPeriod = {
  start: string;
  end: string;
  dueDate: string;
};

const EMPTY_METRICS: Metrics = {
  todayCollection: 0,
  present: 0,
  attendanceTotal: 0,
  pendingFees: 0,
  students: 0,
  batches: 0,
  monthCollection: 0,
};

const QUICK_ACTIONS: Action[] = [
  {
    title: "Add student",
    icon: "user-plus",
    route: "/students",
    color: C.purpleLight,
    iconColor: C.purple,
  },
  {
    title: "Create batch",
    icon: "layers",
    route: "/batches",
    color: C.blueLight,
    iconColor: C.blue,
  },
  {
    title: "Create class",
    icon: "book-open",
    route: "/classes",
    color: C.purpleLight,
    iconColor: C.purple,
  },
  {
    title: "Exam / Test",
    icon: "clipboard",
    route: "/exams",
    color: C.blueLight,
    iconColor: C.blue,
  },
  {
    title: "Create subject",
    icon: "book",
    route: "/subjects",
    color: C.blueLight,
    iconColor: C.blue,
  },
  {
    title: "Assign subject",
    icon: "user-check",
    route: "/assign-subject",
    color: C.greenLight,
    iconColor: C.green,
  },
  {
    title: "Timetable management",
    icon: "calendar",
    route: "/timetable-management",
    color: C.purpleLight,
    iconColor: C.purple,
  },
  {
    title: "View timetable",
    icon: "printer",
    route: "/timetable-view",
    color: C.goldLight,
    iconColor: C.gold,
  },
];

const INSTITUTE_ACTIONS: Action[] = [
  {
    title: "Teacher / Staff",
    icon: "briefcase",
    route: "/teacher",
    color: C.blueLight,
    iconColor: C.blue,
  },
  {
    title: "Notice board",
    icon: "volume-2",
    color: C.purpleLight,
    iconColor: C.purple,
  },
  {
    title: "Study material",
    icon: "book-open",
    color: C.blueLight,
    iconColor: C.blue,
  },
  {
    title: "Team",
    icon: "users",
    route: "/team",
    color: C.purpleLight,
    iconColor: C.purple,
  },
  {
    title: "Birthdays",
    icon: "gift",
    route: "/birthdays",
    color: "#FCE7F3",
    iconColor: "#C2185B",
  },
  {
    title: "Reports",
    icon: "bar-chart-2",
    color: C.goldLight,
    iconColor: C.gold,
  },
  {
    title: "Repair teacher",
    icon: "tool",
    route: "/repair-teacher",
    color: C.purpleLight,
    iconColor: C.purple,
  },
  {
    title: "Expenses",
    icon: "dollar-sign",
    route: "/expenses",
    color: C.greenLight,
    iconColor: C.green,
  },
  {
    title: "Staff salary",
    icon: "credit-card",
    route: "/staff-salary",
    color: C.blueLight,
    iconColor: C.blue,
  },
  {
    title: "Wallet",
    icon: "credit-card",
    route: "/wallet",
    color: C.purpleLight,
    iconColor: C.purple,
  },
  {
    title: "Books",
    icon: "book",
    route: "/books",
    color: C.blueLight,
    iconColor: C.blue,
  },
];

function formatRupees(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function dateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function safeAmount(
  value: number | string | null | undefined,
): number {
  const amount = Number(value ?? 0);

  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function sumPayments(rows: FeePayment[]) {
  return rows.reduce(
    (sum, row) => sum + safeAmount(row.amount_paid),
    0,
  );
}

function parseDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  return new Date(year, month - 1, day);
}

function dueDateForMonth(
  year: number,
  month: number,
  day: number,
): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();

  return new Date(
    year,
    month,
    Math.min(Math.max(day, 1), lastDay),
  );
}

function addBillingMonths(date: Date, months: number): Date {
  const target = new Date(
    date.getFullYear(),
    date.getMonth() + months,
    1,
  );

  return dueDateForMonth(
    target.getFullYear(),
    target.getMonth(),
    date.getDate(),
  );
}

/**
 * Generates the same billing periods as Fees Management.
 * Periods are matched using the fee assignment ID and exact
 * billing period start/end dates.
 */
function getBillingPeriods(
  fee: StudentFee,
  student: FeeStudent,
  now: Date,
): BillingPeriod[] {
  if (!student.admission_date) {
    return [];
  }

  const admission = parseDate(student.admission_date);
  const today = parseDate(dateString(now));

  if (Number.isNaN(admission.getTime())) {
    return [];
  }

  if (fee.fee_frequency === "one_time") {
    const admissionDate = dateString(admission);

    return [
      {
        start: admissionDate,
        end: admissionDate,
        dueDate: admissionDate,
      },
    ];
  }

  const interval =
    fee.fee_frequency === "monthly"
      ? 1
      : fee.fee_frequency === "quarterly"
        ? 3
        : fee.fee_frequency === "half_yearly"
          ? 6
          : 12;

  const billingDay = Math.min(
    31,
    Math.max(1, fee.billing_day ?? admission.getDate()),
  );

  let due = dueDateForMonth(
    admission.getFullYear(),
    admission.getMonth(),
    billingDay,
  );

  // If admission occurs after the billing day, use the next cycle.
  if (due < admission) {
    due = addBillingMonths(due, interval);
  }

  let periodStart = admission;
  const periods: BillingPeriod[] = [];
  let guard = 0;

  // Include periods due up to today.
  while (due <= today && guard < 240) {
    periods.push({
      start: dateString(periodStart),
      end: dateString(due),
      dueDate: dateString(due),
    });

    periodStart = due;
    due = addBillingMonths(due, interval);
    guard++;
  }

  // Match Fees Management by including the next upcoming period.
  if (guard < 240) {
    periods.push({
      start: dateString(periodStart),
      end: dateString(due),
      dueDate: dateString(due),
    });
  }

  return periods;
}

/**
 * Calculates pending fees using the same billing-period model
 * as Fees Management.
 *
 * Each period is calculated independently:
 * balance = max(0, fee amount - total payments for that period).
 */
function calculatePendingFees(
  fees: StudentFee[],
  students: FeeStudent[],
  payments: FeePayment[],
  now: Date,
): number {
  const studentsById = new Map<string, FeeStudent>(
    students.map((student) => [student.id, student]),
  );

  const paymentsByPeriod = new Map<string, FeePayment[]>();

  for (const payment of payments) {
    const key = [
      payment.student_fee_id,
      payment.billing_period_start,
      payment.billing_period_end,
    ].join("|");

    const existing = paymentsByPeriod.get(key) ?? [];

    existing.push(payment);
    paymentsByPeriod.set(key, existing);
  }

  let totalPending = 0;

  for (const fee of fees) {
    const student = studentsById.get(fee.student_id);

    if (!student || !student.admission_date) {
      continue;
    }

    // Use the same active-student rule as the dashboard.
    if (student.status !== "active") {
      continue;
    }

    const periods = getBillingPeriods(fee, student, now);
    const amountDue = safeAmount(fee.fee_amount);

    for (const period of periods) {
      const key = [
        fee.id,
        period.start,
        period.end,
      ].join("|");

      const periodPayments = paymentsByPeriod.get(key) ?? [];

      const paid = periodPayments.reduce(
        (sum, payment) => sum + safeAmount(payment.amount_paid),
        0,
      );

      totalPending += Math.max(0, amountDue - paid);
    }
  }

  return Math.max(0, totalPending);
}

function openSection(title: string, route?: string) {
  if (route) {
    router.navigate(route as never);
  } else {
    Alert.alert(
      title,
      `${title} is not connected to a screen yet.`,
    );
  }
}

function SkeletonBlock({
  width = "100%",
  height = 18,
}: {
  width?: number | `${number}%`;
  height?: number;
}) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.95,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeletonBlock,
        { width, height, opacity },
      ]}
    />
  );
}

function MetricSkeleton() {
  return (
    <View style={styles.metricSkeletonCard}>
      <View style={styles.metricSkeletonHalf}>
        <SkeletonBlock width="70%" height={14} />
        <SkeletonBlock width="82%" height={29} />
        <SkeletonBlock width="55%" height={10} />
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.metricSkeletonHalf}>
        <SkeletonBlock width="75%" height={14} />
        <SkeletonBlock width="45%" height={29} />
        <SkeletonBlock width="68%" height={10} />
      </View>
    </View>
  );
}

function AnimatedCard({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: object;
  accessibilityLabel: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      speed: 24,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        style,
        { transform: [{ scale }] },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={() => animateTo(0.975)}
        onPressOut={() => animateTo(1)}
        style={styles.pressableFill}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [alert, setAlert] = useState<{
    type: AppAlertType;
    message: string;
  } | null>(null);

  const contentPadding = 16;
  const cardPadding = 14;
  const tileGap = 10;

  const tileAreaWidth =
    width -
    contentPadding * 2 -
    (cardPadding + 1) * 2;

  const tileWidth = Math.max(
    88,
    (tileAreaWidth - tileGap * 2) / 3,
  );

  const quickTileWidth = Math.max(
    60,
    (tileAreaWidth - tileGap * 3) / 4,
  );

  const quickActions = useMemo(
    () => QUICK_ACTIONS,
    [],
  );

  const instituteActions = useMemo(
    () => INSTITUTE_ACTIONS,
    [],
  );

  const loadDashboard = useCallback(
    async (showLoader = true) => {
      if (showLoader) {
        setLoading(true);
      }

      setAlert(null);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          router.replace("/login" as never);
          return;
        }

        const {
          data: memberships,
          error: membershipError,
        } = await supabase
          .from("institute_members")
          .select("institute_id")
          .eq("user_id", user.id)
          .limit(2);

        if (membershipError) {
          throw membershipError;
        }

        if (!memberships?.length) {
          setMetrics(EMPTY_METRICS);

          setAlert({
            type: "error",
            message:
              "No institute is linked to this account. Contact your institute administrator.",
          });

          return;
        }

        if (memberships.length > 1) {
          setMetrics(EMPTY_METRICS);

          setAlert({
            type: "error",
            message:
              "This account is linked to multiple institutes. An institute selection is required.",
          });

          return;
        }

        const instituteId = memberships[0].institute_id;
        const now = new Date();
        const today = dateString(now);

        const monthStart = dateString(
          new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
          ),
        );

        const nextMonthStart = dateString(
          new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            1,
          ),
        );

        const [
          studentsResult,
          batchesResult,
          attendanceResult,
          feesResult,
          feeStudentsResult,
        ] = await Promise.all([
          supabase
            .from("institute_students")
            .select("id", {
              count: "exact",
              head: true,
            })
            .eq("institute_id", instituteId)
            .eq("status", "active"),

          supabase
            .from("institute_batches")
            .select("id", {
              count: "exact",
              head: true,
            })
            .eq("institute_id", instituteId)
            .eq("is_active", true),

          supabase
            .from("institute_attendance_records")
            .select("id,status")
            .eq("institute_id", instituteId)
            .eq("attendance_date", today),

          supabase
            .from("institute_student_fees")
            .select(
              "id,student_id,fee_frequency,fee_amount,billing_day",
            )
            .eq("institute_id", instituteId),

          supabase
            .from("institute_students")
            .select("id,admission_date,status")
            .eq("institute_id", instituteId),
        ]);

        const queryError = [
          studentsResult.error,
          batchesResult.error,
          attendanceResult.error,
          feesResult.error,
          feeStudentsResult.error,
        ].find(Boolean);

        if (queryError) {
          throw queryError;
        }

        const fees: StudentFee[] =
          (feesResult.data ?? []) as StudentFee[];

        const feeStudents: FeeStudent[] =
          (feeStudentsResult.data ?? []) as FeeStudent[];

        const feeIds = fees.map((fee) => fee.id);

        let paymentRows: FeePayment[] = [];

        if (feeIds.length > 0) {
          const {
            data,
            error,
          } = await supabase
            .from("institute_fee_payments")
            .select(
              "student_fee_id,billing_period_start,billing_period_end,amount_due,amount_paid,payment_date",
            )
            .eq("institute_id", instituteId)
            .in("student_fee_id", feeIds);

          if (error) {
            throw error;
          }

          paymentRows = (data ?? []) as FeePayment[];
        }

        const todayAttendance =
          attendanceResult.data ?? [];

        const present = todayAttendance.filter(
          (row) =>
            row.status === "present" ||
            row.status === "late",
        ).length;

        const todaysPayments = paymentRows.filter(
          (row) => row.payment_date === today,
        );

        const monthlyPayments = paymentRows.filter(
          (row) =>
            row.payment_date !== null &&
            row.payment_date >= monthStart &&
            row.payment_date < nextMonthStart,
        );

        const todayCollection =
          sumPayments(todaysPayments);

        const monthCollection =
          sumPayments(monthlyPayments);

        const pendingFees = calculatePendingFees(
          fees,
          feeStudents,
          paymentRows,
          now,
        );

        setMetrics({
          todayCollection,
          present,
          attendanceTotal: todayAttendance.length,
          pendingFees,
          students: studentsResult.count ?? 0,
          batches: batchesResult.count ?? 0,
          monthCollection,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load dashboard data.";

        setAlert({
          type: "error",
          message,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadDashboard(false);
  }, [loadDashboard]);

  const attendancePercent =
    metrics.attendanceTotal > 0
      ? Math.round(
          (metrics.present / metrics.attendanceTotal) * 100,
        )
      : 0;

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={C.purpleDark}
        translucent={false}
      />

      <InstituteHeader subtitle="Coaching Owner" />

      {alert ? (
        <View style={styles.alertWrap}>
          <AppAlert type={alert.type} message={alert.message} />
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.purple}
            colors={[C.purple]}
          />
        }
      >
        {/* Only the database-driven metric cards use skeletons. */}
        {loading ? (
          <>
            <MetricSkeleton />
            <View style={styles.secondarySummaryCard}>
              {[0, 1, 2].map((item) => (
                <React.Fragment key={item}>
                  {item > 0 ? <View style={styles.secondaryDivider} /> : null}
                  <View style={styles.secondarySummaryItem}>
                    <SkeletonBlock width="75%" height={12} />
                    <View style={{ height: 10 }} />
                    <SkeletonBlock width="85%" height={22} />
                  </View>
                </React.Fragment>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryHalf}>
                <View style={styles.summaryHeading}>
                  <View style={[styles.smallIcon, { backgroundColor: C.greenLight }]}>
                    <Feather name="dollar-sign" size={17} color={C.green} />
                  </View>
                  <Text style={styles.summaryLabel} numberOfLines={2}>
                    Today's collection
                  </Text>
                </View>
                <Text
                  style={[styles.summaryAmount, { color: C.green }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatRupees(metrics.todayCollection)}
                </Text>
                <Text style={styles.summaryCaption}>Collected today</Text>
              </View>

              <View style={styles.summaryDivider} />

              <Pressable
                accessibilityRole="button"
                onPress={() => openSection("Today's attendance", "/attendance")}
                style={styles.summaryHalf}
              >
                <View style={styles.summaryHeading}>
                  <View style={[styles.smallIcon, { backgroundColor: C.purpleLight }]}>
                    <Feather name="calendar" size={17} color={C.purple} />
                  </View>
                  <Text style={styles.summaryLabel} numberOfLines={2}>
                    Today's attendance
                  </Text>
                </View>
                <View style={styles.summaryValueRow}>
                  <Text style={styles.summaryCount}>{metrics.present}</Text>
                  <Text style={styles.summaryDetail}>
                    present · {attendancePercent}%
                  </Text>
                </View>
                <Text style={styles.summaryCaption}>
                  Attendance recorded today
                </Text>
              </Pressable>
            </View>

            <View style={styles.secondarySummaryCard}>
              <Pressable
                style={styles.secondarySummaryItem}
                onPress={() => openSection("Pending fees", "/fees")}
                accessibilityRole="button"
              >
                <View style={styles.metricIconRow}>
                  <Feather name="clock" size={16} color={C.gold} />
                  <Text style={styles.summaryLabel} numberOfLines={1}>
                    Pending
                  </Text>
                </View>
                <Text
                  style={[styles.secondaryAmount, { color: C.gold }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatRupees(metrics.pendingFees)}
                </Text>
              </Pressable>

              <View style={styles.secondaryDivider} />

              <Pressable
                style={styles.secondarySummaryItem}
                onPress={() => openSection("Students", "/students")}
                accessibilityRole="button"
              >
                <View style={styles.metricIconRow}>
                  <Feather name="users" size={16} color={C.purple} />
                  <Text style={styles.summaryLabel} numberOfLines={1}>
                    Students
                  </Text>
                </View>
                <Text style={styles.secondaryCount}>{metrics.students}</Text>
              </Pressable>

              <View style={styles.secondaryDivider} />

              <Pressable
                style={styles.secondarySummaryItem}
                onPress={() => openSection("This month's collection", "/fees")}
                accessibilityRole="button"
              >
                <View style={styles.metricIconRow}>
                  <Feather name="trending-up" size={16} color={C.green} />
                  <Text style={styles.summaryLabel} numberOfLines={1}>
                    This month
                  </Text>
                </View>
                <Text
                  style={[styles.secondaryAmount, { color: C.green }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatRupees(metrics.monthCollection)}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Static actions remain visible during database loading. */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeadingRow}>
            <View>
              <Text style={styles.sectionTitle}>Quick actions</Text>
              <Text style={styles.sectionSubtitle}>
                Shortcuts to everyday tasks
              </Text>
            </View>
            <View style={styles.sectionAccent}>
              <Feather name="zap" size={17} color={C.purple} />
            </View>
          </View>

          <View style={styles.quickActionsRow}>
            {quickActions.map((item) => (
              <AnimatedCard
                key={item.title}
                accessibilityLabel={item.title}
                onPress={() => openSection(item.title, item.route)}
                style={[
                  styles.tile,
                  styles.quickActionTile,
                  { width: quickTileWidth, backgroundColor: C.white },
                ]}
              >
                <View
                  style={[
                    styles.tileIcon,
                    styles.quickActionIcon,
                    { backgroundColor: item.color },
                  ]}
                >
                  <Feather name={item.icon} size={19} color={item.iconColor} />
                </View>
                <Text style={[styles.tileTitle, styles.quickActionTitle]}>
                  {item.title}
                </Text>
              </AnimatedCard>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeadingRow}>
            <View>
              <Text style={styles.sectionTitle}>Manage institute</Text>
              <Text style={styles.sectionSubtitle}>
                Your institute, all in one place
              </Text>
            </View>
            <View style={[styles.sectionAccent, { backgroundColor: C.blueLight }]}>
              <Feather name="grid" size={17} color={C.blue} />
            </View>
          </View>

          <View style={styles.tilesGrid}>
            {instituteActions.map((item) => (
              <AnimatedCard
                key={item.title}
                accessibilityLabel={item.title}
                onPress={() => openSection(item.title, item.route)}
                style={[
                  styles.tile,
                  styles.manageTile,
                  { width: tileWidth, backgroundColor: C.white },
                ]}
              >
                <View style={[styles.tileIcon, { backgroundColor: item.color }]}>
                  <Feather name={item.icon} size={25} color={item.iconColor} />
                </View>
                <Text style={styles.tileTitle}>{item.title}</Text>
              </AnimatedCard>
            ))}
          </View>
        </View>

        <View style={styles.footerWrap}>
  <View style={styles.footerBrandRow}>
    <View style={styles.footerLogoContainer}>
      <Image
        source={require("../../assets/images/icon.png")}
        style={styles.footerLogoImage}
        resizeMode="contain"
        accessibilityLabel="GyanDeep Academy logo"
      />
    </View>
  </View>

  <Text style={styles.footerBrand}>GyanDeep Academy</Text>

  <Text style={styles.footerSubtitle}>
    Coaching Management System
  </Text>

  <View style={styles.footerDivider} />

  <Text style={styles.footer}>
    Learn Today, Lead Tomorrow
  </Text>

  <Text style={styles.footerCopyright}>
    © {new Date().getFullYear()} GyanDeep Academy
  </Text>
</View>
      </ScrollView>

      <FloatingTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 14,
  },
  alertWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  summaryCard: {
    backgroundColor: C.white,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 18,
    paddingHorizontal: 14,
    minHeight: 142,
    flexDirection: "row",
    alignItems: "stretch",
    shadowColor: C.purpleDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.055,
    shadowRadius: 14,
    elevation: 2,
  },
  summaryHalf: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: 3,
  },
  summaryHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
  },
  smallIcon: {
    width: 31,
    height: 31,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabel: {
    flexShrink: 1,
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  summaryAmount: {
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginTop: 12,
  },
  summaryCaption: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "500",
    marginTop: 5,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: C.border,
    marginHorizontal: 10,
  },
  summaryValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 12,
  },
  summaryCount: {
    color: C.text,
    fontSize: 29,
    fontWeight: "900",
  },
  summaryDetail: {
    color: C.muted,
    fontSize: 12,
    fontWeight: "600",
  },

  secondarySummaryCard: {
    backgroundColor: C.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 17,
    paddingHorizontal: 10,
    minHeight: 120,
    flexDirection: "row",
    alignItems: "stretch",
    shadowColor: C.purpleDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  secondarySummaryItem: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  metricIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  secondaryDivider: {
    width: 1,
    backgroundColor: C.border,
    marginHorizontal: 4,
  },
  secondaryAmount: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 12,
  },
  secondaryCount: {
    color: C.text,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 9,
  },

  sectionCard: {
    backgroundColor: C.white,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 13,
    paddingTop: 17,
    paddingBottom: 14,
    shadowColor: C.purpleDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 17,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.35,
  },
  sectionSubtitle: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 4,
  },
  sectionAccent: {
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.purpleLight,
  },

  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  tile: {
    borderRadius: 21,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    paddingVertical: 12,
    overflow: "hidden",
  },
  quickActionTile: {
    minHeight: 105,
    paddingHorizontal: 2,
    paddingVertical: 11,
    borderRadius: 18,
  },
  manageTile: {
    minHeight: 126,
    paddingVertical: 13,
  },
  pressableFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  tileIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    marginBottom: 8,
  },
  tileTitle: {
    color: C.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  quickActionTitle: {
    fontSize: 9,
    lineHeight: 12,
    paddingHorizontal: 1,
  },

  skeletonBlock: {
    backgroundColor: "#E7E3F4",
    borderRadius: 8,
  },
  metricSkeletonCard: {
    backgroundColor: C.white,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    minHeight: 142,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metricSkeletonHalf: {
    flex: 1,
    gap: 12,
  },
footerWrap: {
  alignItems: "center",
  paddingTop: 12,
  paddingBottom: 18,
  marginTop: 2,
},

footerBrandRow: {
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 10,
},

footerLogoContainer: {
  width: 100,
  height: 100,
  borderRadius: 20,
  backgroundColor: C.white,
  borderWidth: 1,
  borderColor: C.border,
  alignItems: "center",
  justifyContent: "center",
  shadowColor: C.purpleDark,
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 2,
},

footerLogoImage: {
  width: "100%",
  height: "100%",
},

footerBrand: {
  color: C.text,
  fontSize: 15,
  fontWeight: "900",
  letterSpacing: 0.2,
  textAlign: "center",
},

footerSubtitle: {
  color: C.muted,
  fontSize: 10,
  fontWeight: "600",
  marginTop: 4,
  textAlign: "center",
},

footerDivider: {
  width: 44,
  height: 3,
  borderRadius: 3,
  backgroundColor: C.purple,
  marginTop: 12,
  marginBottom: 10,
},

footer: {
  color: C.purple,
  textAlign: "center",
  fontSize: 11,
  fontWeight: "700",
},

footerCopyright: {
  color: C.muted,
  textAlign: "center",
  fontSize: 10,
  marginTop: 7,
},
});
