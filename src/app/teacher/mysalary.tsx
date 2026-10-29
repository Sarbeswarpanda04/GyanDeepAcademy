import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";

const NAVY = "#241344";
const PURPLE = "#611CD0";
const PURPLE_DARK = "#44109D";
const PURPLE_BRIGHT = "#4C02F7";
const BG = "#F3F3FF";
const WHITE = "#FFFFFF";
const MUTED = "#718096";
const GREEN = "#15966A";
const RED = "#D9535D";
const BORDER = "#E8E3F5";
const LAVENDER = "#EDE7FF";

type StaffPayout = {
  id: string;
  institute_id?: string;
  staff_id?: string;
  amount: number | string | null;
  paid_date: string;
  period_start: string | null;
  period_end: string | null;
  // These columns are optional because the payout table may not contain them.
  note?: string | null;
  payment_method?: string | null;
  proof_image_path?: string | null;
};

type StaffProfile = {
  id: string;
  institute_id: string;
  full_name: string;
  salary_type?: string | null;
  salary_amount?: number | string | null;
  weekly_holidays?: string[] | null;
};

type StaffAttendance = {
  id: string;
  staff_id: string;
  institute_id: string;
  attendance_date: string;
  status: string;
  sessions: string[] | null;
  wage_amount?: number | string | null;
};

const numeric = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const money = (value: number) =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const dateOnly = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (date: Date) =>
  date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

const prettyDate = (value: string) => {
  if (!value) return "Date not available";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

function Metric({
  label,
  value,
  icon,
  color,
  tint,
  formattedValue,
}: {
  label: string;
  value: number;
  formattedValue?: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  tint: string;
}) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: tint }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {formattedValue ?? money(value)}
      </Text>
    </View>
  );
}

export default function MySalaryScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [teacherName, setTeacherName] = useState("My Salary");
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [payouts, setPayouts] = useState<StaffPayout[]>([]);
  const [attendance, setAttendance] = useState<StaffAttendance[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );


  const loadSalary = useCallback(async () => {
    setErrorMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        setStaff(null);
        setPayouts([]);
        setAttendance([]);
        setTeacherName("My Salary");
        setErrorMessage("Your session has expired. Please sign in again.");
        router.replace("/teacher/teacher-login" as never);
        return;
      }

      // Find the authenticated teacher's active membership.
      const { data: memberships, error: membershipError } = await supabase
        .from("institute_team_members")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (membershipError) throw membershipError;

      const membership = (memberships ?? []).find(
        (item) => String(item.role ?? "").trim().toLowerCase() === "teacher"
      );

      if (!membership?.institute_id) {
        throw new Error(
          "No active teacher membership was found for this account."
        );
      }

      const member = membership as Record<string, unknown>;
      const instituteId = String(membership.institute_id);

      // Load staff profiles for this institute. Normalize phone numbers
      // locally so values like +91 9876543210 match 9876543210.
      const { data: staffRows, error: staffRowsError } = await supabase
        .from("institute_staff")
        .select(
          "id,institute_id,full_name,phone,salary_type,salary_amount,weekly_holidays"
        )
        .eq("institute_id", instituteId);

      if (staffRowsError) throw staffRowsError;

      const staffList = staffRows ?? [];

      const linkedStaffId = String(
        member.staff_id ??
          member.institute_staff_id ??
          member.teacher_id ??
          ""
      ).trim();

      let staffProfile = linkedStaffId
        ? staffList.find((item) => String(item.id) === linkedStaffId)
        : undefined;

      // Fall back to normalized phone matching if the stored ID is absent
      // or does not resolve to a staff profile in this institute.
      if (!staffProfile) {
        const normalizePhone = (value: unknown) =>
          String(value ?? "").replace(/\D/g, "").slice(-10);

        const memberPhone = normalizePhone(member.phone || user.phone);

        if (memberPhone) {
          staffProfile = staffList.find(
            (item) => normalizePhone(item.phone) === memberPhone
          );
        }
      }

      if (!staffProfile) {
        throw new Error(
          "Your login could not be matched to a staff profile. Check the teacher's staff ID or registered phone number in the institute team settings."
        );
      }

      setStaff(staffProfile as StaffProfile);
      setTeacherName(String(staffProfile.full_name || "My Salary"));

      console.log("[MySalary] salary configuration", {
        staffId: staffProfile.id,
        salaryType: staffProfile.salary_type ?? null,
        salaryAmount: staffProfile.salary_amount ?? null,
        weeklyHolidays: staffProfile.weekly_holidays ?? [],
      });

      const staffId = String(staffProfile.id);

      // Fetch payouts for this authenticated teacher only.
      // Select only columns confirmed by the supplied staff_payouts record.
      // Selecting optional columns that do not exist in Supabase causes the
      // entire query to fail, which previously made all payout totals appear 0.
      const { data: payoutRows, error: payoutError } = await supabase
        .from("staff_payouts")
        .select("id,institute_id,staff_id,amount,paid_date,period_start,period_end")
        .eq("institute_id", instituteId)
        .eq("staff_id", staffId)
        .order("paid_date", { ascending: false });

      console.log("[MySalary] teacher payout lookup", {
        instituteId,
        staffId,
        payoutCount: payoutRows?.length ?? 0,
        payoutError: payoutError?.message ?? null,
      });

      if (payoutError) throw payoutError;

      setPayouts((payoutRows ?? []) as StaffPayout[]);

      // Fetch attendance for the current month.
      const now = new Date();
      const start = dateOnly(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = dateOnly(new Date(now.getFullYear(), now.getMonth() + 1, 0));

      const { data: attendanceRows, error: attendanceError } = await supabase
        .from("staff_attendance")
        .select(
          "id,staff_id,institute_id,attendance_date,status,sessions,wage_amount"
        )
        .eq("institute_id", instituteId)
        .eq("staff_id", staffId)
        .gte("attendance_date", start)
        .lte("attendance_date", end);

      // A successful query returning zero rows can mean RLS is hiding rows.
      // The SQL policy in mysalary_attendance_rls.sql must allow this teacher
      // to SELECT their own institute/staff attendance records. Client filters
      // alone cannot bypass Supabase Row Level Security.

      if (attendanceError) {
        // Attendance is used for the estimate, but an attendance-query failure
        // must not erase payout totals that were already loaded successfully.
        console.error("[MySalary] attendance lookup failed", attendanceError);
        setAttendance([]);
        setErrorMessage(
          `Salary payments loaded, but attendance could not be loaded: ${attendanceError.message}`
        );
      } else {
        console.log("[MySalary] attendance lookup", {
          staffId,
          start,
          end,
          attendanceCount: attendanceRows?.length ?? 0,
          instituteId,
          statuses: (attendanceRows ?? []).map((row) => ({
            id: row.id,
            instituteId: row.institute_id,
            staffId: row.staff_id,
            date: row.attendance_date,
            status: row.status,
            sessions: row.sessions ?? [],
            wageAmount: row.wage_amount ?? null,
          })),
        });

        setAttendance((attendanceRows ?? []) as StaffAttendance[]);
      }
    } catch (error: unknown) {
      // Avoid showing stale salary information if this teacher's request fails.
      setPayouts([]);
      setAttendance([]);
      const details = error as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      } | null;

      const message =
        error instanceof Error
          ? error.message
          : [
              details?.message,
              details?.details,
              details?.hint,
              details?.code,
            ]
              .filter(Boolean)
              .join("\n") || "Could not load your salary records.";

      console.error("My salary load failed:", error);
      setErrorMessage(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);


  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadSalary();
    }, [loadSalary]),
  );

  const changeMonth = (offset: number) => {
    setSelectedMonth((current) => {
      const next = new Date(
        current.getFullYear(),
        current.getMonth() + offset,
        1,
      );
      const thisMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      );
      return next > thisMonth ? thisMonth : next;
    });
  };

  const currentMonthKey = monthKey(selectedMonth);
  const monthPayouts = useMemo(
    () =>
      payouts.filter((row) => {
        // Salary belongs to the pay period, not necessarily the date it was paid.
        const period = row.period_start?.slice(0, 7);
        return period
          ? period === currentMonthKey
          : row.paid_date?.slice(0, 7) === currentMonthKey;
      }),
    [payouts, currentMonthKey],
  );

  const monthPaid = monthPayouts.reduce(
    (sum, row) => sum + numeric(row.amount),
    0,
  );
  const allPaid = payouts.reduce((sum, row) => sum + numeric(row.amount), 0);
  const currentMonth = monthKey(new Date());
  const thisMonthAttendance = useMemo(() => {
    const unique = new Map<string, StaffAttendance>();
    attendance
      .filter((row) => row.attendance_date?.slice(0, 7) === currentMonth)
      .forEach((row) => unique.set(row.attendance_date, row));
    return [...unique.values()];
  }, [attendance, currentMonth]);

 
const salaryEstimate = useMemo(() => {
    if (!staff) {
      return { amount: 0, paidDays: 0, absentDays: 0, sessions: 0 };
    }

    const rows = thisMonthAttendance;
    const salaryType = String(staff.salary_type ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\\s-]+/g, "_");
    const salaryAmount = Math.max(0, numeric(staff.salary_amount));
    const daysInMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
    ).getDate();

    let paidDays = 0;
    let absentDays = 0;
    let sessions = 0;
    let earnedAmount = 0;

    // Match the owner-side Teacher Details > Payable calculation:
    // only a PRESENT attendance record with at least one saved session earns pay.
    for (const row of rows) {
      const status = String(row.status ?? "").trim().toLowerCase();
      const selectedSessions = Array.isArray(row.sessions) ? row.sessions : [];

      if (status === "absent") {
        absentDays += 1;
      }

      if (status !== "present" || selectedSessions.length === 0) {
        continue;
      }

      paidDays += 1;
      sessions += selectedSessions.length;

      if (["batch", "per_batch", "per_session", "session", "per_class", "class"].includes(salaryType)) {
        earnedAmount += selectedSessions.length * salaryAmount;
      } else if (["daily", "per_day", "daily_salary"].includes(salaryType)) {
        earnedAmount += salaryAmount;
      } else {
        // This mirrors the owner screen's monthly calculation:
        // monthly salary is prorated by calendar days for each paid attendance day.
        earnedAmount += salaryAmount / Math.max(1, daysInMonth);
      }
    }

    return {
      amount: Math.round(earnedAmount * 100) / 100,
      paidDays,
      absentDays,
      sessions,
    };
  }, [staff, thisMonthAttendance]);

  const paidThisMonth = payouts
    .filter(
      (row) =>
        (row.period_start?.slice(0, 7) || row.paid_date?.slice(0, 7)) ===
        currentMonth
    )
    .reduce((sum, row) => sum + numeric(row.amount), 0);

  // "You may receive" is the outstanding payable amount, matching the owner
  // screen: attendance-earned salary minus payouts already recorded this month.
  const remainingEstimate = Math.max(0, salaryEstimate.amount - paidThisMonth);
  const payableThisMonth = remainingEstimate;
  const isCurrentMonth = currentMonthKey === monthKey(new Date());
  const futureMonth =
    selectedMonth.getTime() >
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadSalary();
            }}
            tintColor={GREEN}
          />
        }
      >
        <LinearGradient
          colors={[PURPLE, PURPLE_DARK, PURPLE_BRIGHT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather name="chevron-left" size={25} color={WHITE} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>TEACHER PORTAL</Text>
              <Text style={styles.title}>My Salary</Text>
              <Text style={styles.subtitle}>{teacherName}</Text>
            </View>
            <View style={styles.headerIcon}>
              <Feather name="briefcase" size={22} color={WHITE} />
            </View>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>TOTAL SALARY PAID · ALL TIME</Text>
            {loading ? (
              <ActivityIndicator
                color={WHITE}
                style={{ marginTop: 14, alignSelf: "flex-start" }}
              />
            ) : (
              <Text
                style={styles.totalAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {money(allPaid)}
              </Text>
            )}
            <View style={styles.totalFooter}>
              <Feather name="shield" size={19} color="#E9DDFF" />
              <Text style={styles.totalFooterText}>
                Your own recorded salary payments
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.estimateCard}>
            <View style={styles.estimateTopRow}>
              <View style={styles.estimateIcon}>
                <Feather name="trending-up" size={20} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.estimateTitle}>You may receive this month</Text>
                <Text style={styles.estimateSubtitle}>{monthLabel(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} · Attendance-based estimate</Text>
              </View>
              <Feather name="info" size={17} color={MUTED} />
            </View>
            {loading ? (
              <ActivityIndicator color={GREEN} style={{ marginTop: 14, alignSelf: "flex-start" }} />
            ) : (
              <>
                <Text style={styles.estimateAmount}>{money(payableThisMonth)}</Text>
                <View style={styles.estimateStats}>
                  <View style={styles.estimateStat}>
                    <Text style={styles.estimateStatLabel}>Paid days</Text>
                    <Text style={styles.estimateStatValue}>{salaryEstimate.paidDays}</Text>
                  </View>
                  <View style={styles.estimateStat}>
                    <Text style={styles.estimateStatLabel}>Absent days</Text>
                    <Text style={styles.estimateStatValue}>{salaryEstimate.absentDays}</Text>
                  </View>
                  <View style={styles.estimateStat}>
                    <Text style={styles.estimateStatLabel}>Already paid</Text>
                    <Text style={styles.estimateStatValue}>{money(paidThisMonth)}</Text>
                  </View>
                </View>
                <View style={styles.remainingRow}>
                  <Text style={styles.remainingLabel}>Estimated remaining</Text>
                  <Text style={styles.remainingValue}>{money(remainingEstimate)}</Text>
                </View>
              </>
            )}
            <Text style={styles.estimateNote}>Calculated like the institute's payable amount: eligible present sessions are priced using your saved salary type and rate, then recorded payments for this month are deducted.</Text>
          </View>

          {!!errorMessage && (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={20} color={RED} />
              <View style={{ flex: 1 }}>
                <Text style={styles.errorTitle}>Unable to load salary</Text>
                <Text style={styles.errorText}>{errorMessage}</Text>
                <Pressable
                  onPress={() => {
                    setLoading(true);
                    void loadSalary();
                  }}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.monthCard}>
            <View style={styles.monthHeading}>
              <View>
                <Text style={styles.sectionTitle}>Salary by month</Text>
                <Text style={styles.sectionSubtitle}>
                  Browse current and previous salary periods
                </Text>
              </View>
              <View style={styles.monthIcon}>
                <Feather name="calendar" size={19} color={PURPLE} />
              </View>
            </View>
            <View style={styles.monthNav}>
              <Pressable
                onPress={() => changeMonth(-1)}
                style={styles.monthArrow}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <Feather name="chevron-left" size={23} color={NAVY} />
              </Pressable>
              <View style={styles.monthNameWrap}>
                <Text style={styles.monthName}>
                  {monthLabel(selectedMonth)}
                </Text>
                <Text style={styles.monthHint}>
                  {isCurrentMonth ? "Current month" : "Historical salary"}
                </Text>
              </View>
              <Pressable
                onPress={() => changeMonth(1)}
                disabled={futureMonth}
                style={[styles.monthArrow, futureMonth && styles.disabledArrow]}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <Feather
                  name="chevron-right"
                  size={23}
                  color={futureMonth ? "#B8C1CB" : NAVY}
                />
              </Pressable>
            </View>
            <View style={styles.metrics}>
              <Metric
                label="Paid this month"
                value={monthPaid}
                icon="check-circle"
                color={GREEN}
                tint="#E2F8EE"
              />
              <Metric
                label="Payments recorded"
                value={monthPayouts.length}
                formattedValue={String(monthPayouts.length)}
                icon="file-text"
                color={PURPLE}
                tint="#F0E9FF"
              />
            </View>
          </View>

          <View style={styles.listHeading}>
            <View>
              <Text style={styles.sectionTitle}>
                {monthLabel(selectedMonth)} details
              </Text>
              <Text style={styles.sectionSubtitle}>
                Payments recorded for this salary period
              </Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{monthPayouts.length}</Text>
            </View>
          </View>

          <View style={styles.listCard}>
            {loading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={GREEN} />
                <Text style={styles.emptyText}>
                  Loading your salary records…
                </Text>
              </View>
            ) : monthPayouts.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Feather name="inbox" size={24} color={MUTED} />
                </View>
                <Text style={styles.emptyTitle}>No salary payment found</Text>
                <Text style={styles.emptyText}>
                  There are no recorded salary payouts for{" "}
                  {monthLabel(selectedMonth)}.
                </Text>
              </View>
            ) : (
              monthPayouts.map((row, index) => (
                <View key={row.id}>
                  <View style={styles.payoutRow}>
                    <View style={styles.payoutIcon}>
                      <Feather name="credit-card" size={18} color={GREEN} />
                    </View>
                    <View style={styles.payoutCopy}>
                      <Text style={styles.payoutTitle}>
                        {row.note?.trim() || "Salary payment"}
                      </Text>
                      <Text style={styles.payoutDate}>
                        Paid {prettyDate(row.paid_date)}
                      </Text>
                      {!!row.period_start && (
                        <Text style={styles.periodText}>
                          Period: {prettyDate(row.period_start)}
                          {row.period_end
                            ? ` – ${prettyDate(row.period_end)}`
                            : ""}
                        </Text>
                      )}
                      {!!row.payment_method && (
                        <Text style={styles.methodText}>
                          Method:{" "}
                          {row.payment_method
                            .replaceAll("_", " ")
                            .toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.payoutAmount}>
                      {money(numeric(row.amount))}
                    </Text>
                  </View>
                  {index < monthPayouts.length - 1 && (
                    <View style={styles.divider} />
                  )}
                </View>
              ))
            )}
          </View>

          <Pressable
            style={styles.allHistoryButton}
            onPress={() =>
              setSelectedMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            <Feather name="rotate-ccw" size={16} color={NAVY} />
            <Text style={styles.allHistoryText}>Jump to current month</Text>
          </Pressable>
          <Text style={styles.note}>
            Salary information is loaded from recorded staff payouts for your
            linked staff profile only. Unrecorded or pending salary is not
            included in paid totals.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  content: { paddingBottom: 34 },
  hero: {
    backgroundColor: PURPLE,
    paddingTop: 35,
    paddingHorizontal: 18,
    paddingBottom: 26,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  backButton: {
    width: 38,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: "#E9DDFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: { color: WHITE, fontSize: 27, fontWeight: "900", marginTop: 2 },
  subtitle: { color: "#F0EAFE", fontSize: 12, marginTop: 3 },
  headerIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  totalCard: {
    marginTop: 22,
    padding: 19,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  totalLabel: {
    color: "#F0EAFE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  totalAmount: { color: WHITE, fontSize: 35, fontWeight: "900", marginTop: 12 },
  totalFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 14,
  },
  totalFooterText: { color: "#B9F6D8", fontSize: 11, fontWeight: "600" },
  body: { paddingHorizontal: 16, paddingTop: 20 },
  errorCard: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFF0EF",
    borderWidth: 1,
    borderColor: "#FFD6D2",
    marginBottom: 16,
  },
  estimateCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#DCD0FF",
    marginBottom: 16,
  },
  estimateTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  estimateIcon: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#E2F8EE",
  },
  estimateTitle: { color: NAVY, fontSize: 15, fontWeight: "900" },
  estimateSubtitle: { color: MUTED, fontSize: 10, marginTop: 4 },
  estimateAmount: { color: GREEN, fontSize: 31, fontWeight: "900", marginTop: 16 },
  estimateStats: { flexDirection: "row", gap: 8, marginTop: 14 },
  estimateStat: { flex: 1, minWidth: 0, padding: 10, borderRadius: 12, backgroundColor: "#F5F8FA" },
  estimateStatLabel: { color: MUTED, fontSize: 10, fontWeight: "600" },
  estimateStatValue: { color: NAVY, fontSize: 13, fontWeight: "900", marginTop: 5 },
  remainingRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER,
  },
  remainingLabel: { color: NAVY, fontSize: 12, fontWeight: "700" },
  remainingValue: { color: GREEN, fontSize: 16, fontWeight: "900" },
  estimateNote: { color: MUTED, fontSize: 10, lineHeight: 15, marginTop: 12 },
  errorTitle: { color: NAVY, fontWeight: "800", fontSize: 14 },
  errorText: { color: "#8D4141", fontSize: 12, lineHeight: 18, marginTop: 5 },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: 9,
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  retryText: { color: NAVY, fontWeight: "800", fontSize: 12 },
  monthCard: {
    backgroundColor: WHITE,
    borderRadius: 21,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  monthHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: NAVY, fontSize: 17, fontWeight: "900" },
  sectionSubtitle: { color: MUTED, fontSize: 11, marginTop: 4, lineHeight: 16 },
  monthIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: LAVENDER,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 17,
    padding: 10,
    borderRadius: 15,
    backgroundColor: "#F8F6FF",
  },
  monthArrow: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledArrow: { opacity: 0.5 },
  monthNameWrap: { flex: 1, alignItems: "center" },
  monthName: {
    color: NAVY,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  monthHint: { color: MUTED, fontSize: 10, marginTop: 3 },
  metrics: { flexDirection: "row", gap: 10, marginTop: 13 },
  metric: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#FCFBFF",
    minWidth: 0,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  metricLabel: { color: MUTED, fontSize: 11, fontWeight: "600" },
  metricValue: { color: NAVY, fontSize: 20, fontWeight: "900", marginTop: 5 },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 12,
    gap: 10,
  },
  countPill: {
    minWidth: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2F8EE",
    paddingHorizontal: 9,
  },
  countText: { color: GREEN, fontWeight: "900", fontSize: 12 },
  listCard: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 19,
    paddingHorizontal: 14,
  },
  payoutRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 15,
  },
  payoutIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#E2F8EE",
    alignItems: "center",
    justifyContent: "center",
  },
  payoutCopy: { flex: 1 },
  payoutTitle: { color: NAVY, fontSize: 13, fontWeight: "800" },
  payoutDate: { color: MUTED, fontSize: 11, marginTop: 5 },
  periodText: { color: MUTED, fontSize: 10, marginTop: 4, lineHeight: 15 },
  methodText: {
    color: "#8A6BC6",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
  },
  payoutAmount: { color: GREEN, fontSize: 13, fontWeight: "900", marginTop: 2 },
  divider: { height: 1, backgroundColor: "#EDF1F5", marginLeft: 48 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
    paddingHorizontal: 16,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#F0F3F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTitle: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 7,
  },
  allHistoryButton: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  allHistoryText: { color: NAVY, fontSize: 12, fontWeight: "800" },
  note: { color: "#8794A5", fontSize: 10, lineHeight: 16, marginTop: 14 },
});
