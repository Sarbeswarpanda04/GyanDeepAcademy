import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const PURPLE = "#611CD0";
const PURPLE_DARK = "#44109D";
const PURPLE_BRIGHT = "#4C02F7";
const NAVY = "#241344";
const BG = "#F3F3FF";
const WHITE = "#FFFFFF";
const MUTED = "#718096";
const BORDER = "#E8E3F5";
const GREEN = "#15966A";
const RED = "#D9535D";
const AMBER = "#B7791F";
const LAVENDER = "#EDE7FF";

type AttendanceRow = {
  id: string;
  staff_id: string;
  institute_id: string;
  attendance_date: string;
  status: string;
  sessions: string[] | null;
  wage_amount?: number | string | null;
  note?: string | null;
};

type TeacherInfo = {
  full_name: string;
  institute_id: string;
  staff_id: string;
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const monthLabel = (date: Date) =>
  date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

const prettyDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const money = (value: unknown) => {
  const amount = Number(value ?? 0);
  return `₹${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
};

const statusMeta = (status?: string) => {
  switch (String(status ?? "").toLowerCase()) {
    case "present":
      return { label: "Present", color: GREEN, background: "#E2F8EE" };
    case "absent":
      return { label: "Absent", color: RED, background: "#FFF0EF" };
    case "holiday":
      return { label: "Holiday", color: AMBER, background: "#FFF4D8" };
    default:
      return { label: "Not marked", color: MUTED, background: "#F1F3F7" };
  }
};

export default function MyAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const [teacher, setTeacher] = useState<TeacherInfo | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRow>>({});
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(() => iso(new Date()));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadAttendance = useCallback(async () => {
    setErrorMessage("");
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.replace("/teacher/teacher-login" as never);
        return;
      }

      const { data: members, error: memberError } = await supabase
        .from("institute_team_members")
        .select("id,user_id,institute_id,full_name,phone,role,is_active,staff_id")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (memberError) throw memberError;

      const member = (members ?? []).find(
        (row: any) => String(row.role ?? "").trim().toLowerCase() === "teacher",
      );
      if (!member?.institute_id) {
        throw new Error("No active teacher membership was found for this account.");
      }

      const { data: staffRows, error: staffError } = await supabase
        .from("institute_staff")
        .select("id,institute_id,full_name,phone")
        .eq("institute_id", member.institute_id);
      if (staffError) throw staffError;

      const linkedId = String(member.staff_id ?? "").trim();

      let staff = (staffRows ?? []).find((row: any) => String(row.id) === linkedId);
      if (!staff) {
        const normalizePhone = (value: unknown) =>
          String(value ?? "").replace(/\D/g, "").slice(-10);
        const memberPhone = normalizePhone(member.phone || user.phone);
        if (memberPhone) {
          staff = (staffRows ?? []).find(
            (row: any) => normalizePhone(row.phone) === memberPhone,
          );
        }
      }
      if (!staff?.id) {
        throw new Error("Your login is not linked to a staff profile. Ask the institute owner to check your teacher account.");
      }

      const teacherInfo: TeacherInfo = {
        full_name: String(staff.full_name || member.full_name || "Teacher"),
        institute_id: String(member.institute_id),
        staff_id: String(staff.id),
      };
      setTeacher(teacherInfo);

      const start = iso(new Date(month.getFullYear(), month.getMonth(), 1));
      const end = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));

      const { data: rows, error: attendanceError } = await supabase
        .from("staff_attendance")
        .select("id,staff_id,institute_id,attendance_date,status,sessions,wage_amount,note")
        .eq("institute_id", teacherInfo.institute_id)
        .eq("staff_id", teacherInfo.staff_id)
        .gte("attendance_date", start)
        .lte("attendance_date", end)
        .order("attendance_date", { ascending: true });

      if (attendanceError) throw attendanceError;

      const mapped: Record<string, AttendanceRow> = {};
      (rows ?? []).forEach((row: AttendanceRow) => {
        mapped[row.attendance_date] = { ...row, sessions: row.sessions ?? [] };
      });
      setAttendance(mapped);
      console.log("[MyAttendance] loaded", {
        instituteId: teacherInfo.institute_id,
        staffId: teacherInfo.staff_id,
        month: monthLabel(month),
        count: rows?.length ?? 0,
      });
    } catch (error: unknown) {
      console.error("[MyAttendance] load failed:", error);
      setAttendance({});
      setErrorMessage(error instanceof Error ? error.message : "Unable to load your attendance.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadAttendance();
    }, [loadAttendance]),
  );

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  // Sunday-first calendar: Sunday is column 1, so dates always align
  // with the weekday headings shown in the calendar.
  const leadingBlanks = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const calendarCells = useMemo(
    () => Array.from({ length: leadingBlanks + daysInMonth }, (_, index) =>
      index < leadingBlanks ? null : index - leadingBlanks + 1,
    ),
    [leadingBlanks, daysInMonth],
  );

  const monthRows = Object.values(attendance);
  const presentCount = monthRows.filter(
    (row) => row.status?.toLowerCase() === "present" && (row.sessions ?? []).length > 0,
  ).length;
  const absentCount = monthRows.filter((row) => row.status?.toLowerCase() === "absent").length;
  const holidayCount = monthRows.filter((row) => row.status?.toLowerCase() === "holiday").length;
  const selectedRecord = attendance[selectedDate];
  const selectedStatus = statusMeta(selectedRecord?.status);
  const isFutureMonth =
    month.getTime() > new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    const current = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (next > current) return;
    setMonth(next);
    setSelectedDate(iso(new Date(next.getFullYear(), next.getMonth(), 1)));
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE_DARK} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadAttendance();
            }}
            tintColor={PURPLE}
          />
        }
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 24 }}
      >
        <LinearGradient
          colors={[PURPLE, PURPLE_DARK, PURPLE_BRIGHT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 12 }]}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
              <Feather name="arrow-left" size={21} color={WHITE} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>TEACHER PORTAL</Text>
              <Text style={styles.title}>My Attendance</Text>
              <Text style={styles.subtitle}>{teacher?.full_name ?? "Your attendance record"}</Text>
            </View>
            <View style={styles.headerIcon}>
              <Feather name="calendar" size={22} color={WHITE} />
            </View>
          </View>
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{presentCount}</Text>
              <Text style={styles.summaryLabel}>Present</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{absentCount}</Text>
              <Text style={styles.summaryLabel}>Absent</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{holidayCount}</Text>
              <Text style={styles.summaryLabel}>Holidays</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {errorMessage ? (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={19} color={RED} />
              <View style={{ flex: 1 }}>
                <Text style={styles.errorTitle}>Unable to load attendance</Text>
                <Text style={styles.errorText}>{errorMessage}</Text>
                <TouchableOpacity onPress={() => { setLoading(true); void loadAttendance(); }} style={styles.retryButton}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.calendarCard}>
            <View style={styles.monthHeader}>
              <View>
                <Text style={styles.sectionTitle}>Attendance calendar</Text>
                <Text style={styles.sectionCaption}>Tap any date to view its record</Text>
              </View>
              <View style={styles.monthControls}>
                <TouchableOpacity style={styles.monthArrow} onPress={() => changeMonth(-1)} accessibilityLabel="Previous month">
                  <Feather name="chevron-left" size={22} color={NAVY} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.monthArrow, isFutureMonth && { opacity: 0.35 }]} disabled={isFutureMonth} onPress={() => changeMonth(1)} accessibilityLabel="Next month">
                  <Feather name="chevron-right" size={22} color={NAVY} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.monthLabel}>{monthLabel(month)}</Text>

            <View style={styles.weekRow}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <Text key={day} style={styles.weekDay}>{day}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarCells.map((day, index) => {
                if (day === null) return <View key={`blank-${index}`} style={styles.dayCell} />;
                const dateKey = iso(new Date(month.getFullYear(), month.getMonth(), day));
                const record = attendance[dateKey];
                const meta = statusMeta(record?.status);
                const selected = dateKey === selectedDate;
                const isToday = dateKey === iso(new Date());
                const hasEligiblePresent = record?.status?.toLowerCase() === "present" && (record.sessions ?? []).length > 0;
                return (
                  <TouchableOpacity
                    key={dateKey}
                    style={[
                      styles.dayCell,
                      styles.dayButton,
                      record && { backgroundColor: meta.background },
                      selected && styles.selectedDay,
                    ]}
                    onPress={() => setSelectedDate(dateKey)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`${prettyDate(dateKey)}${record ? `, ${meta.label}` : ", not marked"}`}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[
                      styles.dayNumber,
                      record && { color: meta.color },
                      selected && styles.selectedDayText,
                      isToday && !selected && styles.todayText,
                    ]}>{day}</Text>
                    {record ? (
                      <View style={[styles.dayDot, { backgroundColor: selected ? WHITE : (hasEligiblePresent ? GREEN : meta.color) }]} />
                    ) : <View style={styles.dayDotPlaceholder} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.legend}>
              <LegendDot color={GREEN} label="Present" />
              <LegendDot color={RED} label="Absent" />
              <LegendDot color={AMBER} label="Holiday" />
              <LegendDot color="#C8C3D4" label="Not marked" />
            </View>
          </View>

          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <View style={styles.detailIcon}>
                <Feather name="clipboard" size={19} color={PURPLE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailTitle}>Selected date</Text>
                <Text style={styles.detailDate}>{prettyDate(selectedDate)}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: selectedStatus.background }]}>
                <Text style={[styles.statusPillText, { color: selectedStatus.color }]}>{selectedStatus.label}</Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={PURPLE} />
                <Text style={styles.loadingText}>Loading attendance…</Text>
              </View>
            ) : selectedRecord ? (
              <>
                <View style={styles.detailLine}>
                  <Text style={styles.detailLabel}>Sessions</Text>
                  <Text style={styles.detailValue}>
                    {(selectedRecord.sessions ?? []).length
                      ? (selectedRecord.sessions ?? []).map((item) => item.charAt(0).toUpperCase() + item.slice(1)).join(", ")
                      : "—"}
                  </Text>
                </View>
                <View style={styles.detailLine}>
                  <Text style={styles.detailLabel}>Recorded wage</Text>
                  <Text style={styles.detailValue}>{money(selectedRecord.wage_amount)}</Text>
                </View>
                {selectedRecord.note?.trim() ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.detailLabel}>Note</Text>
                    <Text style={styles.noteText}>{selectedRecord.note}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Feather name="calendar" size={23} color={MUTED} />
                </View>
                <Text style={styles.emptyTitle}>No attendance recorded</Text>
                <Text style={styles.emptyText}>There is no saved teacher attendance for this date.</Text>
              </View>
            )}
          </View>
          <Text style={styles.footerNote}>This calendar shows your saved attendance records. It is view-only; attendance changes are managed by the institute.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 18, paddingBottom: 20, borderBottomLeftRadius: 27, borderBottomRightRadius: 27 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  backButton: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  eyebrow: { color: "#E9DDFF", fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: WHITE, fontSize: 26, fontWeight: "900", marginTop: 2 },
  subtitle: { color: "#F0EAFE", fontSize: 12, marginTop: 3 },
  headerIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  summaryCard: { marginTop: 19, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.23)", flexDirection: "row", alignItems: "center" },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { color: WHITE, fontSize: 22, fontWeight: "900" },
  summaryLabel: { color: "#E9DDFF", fontSize: 10, fontWeight: "700", marginTop: 3 },
  summaryDivider: { width: 1, height: 34, backgroundColor: "rgba(255,255,255,0.25)" },
  content: { paddingHorizontal: 16, paddingTop: 18 },
  calendarCard: { backgroundColor: WHITE, borderRadius: 21, padding: 15, borderWidth: 1, borderColor: BORDER, marginBottom: 15 },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: NAVY, fontSize: 16, fontWeight: "900" },
  sectionCaption: { color: MUTED, fontSize: 10, marginTop: 4 },
  monthControls: { flexDirection: "row", gap: 7 },
  monthArrow: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#F7F4FF", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  monthLabel: { color: NAVY, fontSize: 18, fontWeight: "900", textAlign: "center", marginTop: 17, marginBottom: 15 },
  weekRow: { flexDirection: "row", marginBottom: 7 },
  weekDay: { flex: 1, textAlign: "center", color: MUTED, fontSize: 10, fontWeight: "800" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.28%", aspectRatio: 0.91, padding: 0, flexGrow: 0, flexShrink: 0 },
  dayButton: { alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: "transparent", marginBottom: 3, paddingHorizontal: 0 },
  selectedDay: { backgroundColor: PURPLE, borderColor: PURPLE },
  dayNumber: { color: NAVY, fontSize: 13, fontWeight: "700" },
  selectedDayText: { color: WHITE, fontWeight: "900" },
  todayText: { color: PURPLE, fontWeight: "900" },
  dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  dayDotPlaceholder: { width: 5, height: 5, marginTop: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#F0ECF8" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: MUTED, fontSize: 10, fontWeight: "600" },
  detailCard: { backgroundColor: WHITE, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: BORDER },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  detailIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: LAVENDER, alignItems: "center", justifyContent: "center" },
  detailTitle: { color: NAVY, fontSize: 14, fontWeight: "900" },
  detailDate: { color: MUTED, fontSize: 10, marginTop: 4 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  statusPillText: { fontSize: 10, fontWeight: "900" },
  detailLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#F0ECF8" },
  detailLabel: { color: MUTED, fontSize: 12, fontWeight: "600" },
  detailValue: { color: NAVY, fontSize: 12, fontWeight: "800", maxWidth: "60%", textAlign: "right" },
  noteBox: { padding: 11, borderRadius: 12, backgroundColor: "#F8F6FF", marginTop: 7, gap: 5 },
  noteText: { color: NAVY, fontSize: 12, lineHeight: 18 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 18 },
  loadingText: { color: MUTED, fontSize: 12 },
  emptyState: { alignItems: "center", paddingVertical: 21, paddingHorizontal: 10 },
  emptyIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: "#F1F3F7", alignItems: "center", justifyContent: "center", marginBottom: 9 },
  emptyTitle: { color: NAVY, fontSize: 13, fontWeight: "900" },
  emptyText: { color: MUTED, fontSize: 11, textAlign: "center", lineHeight: 17, marginTop: 5 },
  errorCard: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 15, backgroundColor: "#FFF0EF", borderWidth: 1, borderColor: "#FFD6D2", marginBottom: 14 },
  errorTitle: { color: NAVY, fontSize: 13, fontWeight: "900" },
  errorText: { color: "#8D4141", fontSize: 11, lineHeight: 17, marginTop: 5 },
  retryButton: { alignSelf: "flex-start", marginTop: 9, backgroundColor: WHITE, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  retryText: { color: NAVY, fontSize: 11, fontWeight: "800" },
  footerNote: { color: MUTED, fontSize: 10, lineHeight: 15, marginTop: 13, marginHorizontal: 2 },
});
