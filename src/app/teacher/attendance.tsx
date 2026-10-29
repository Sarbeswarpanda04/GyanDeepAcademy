import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
const BLUE = PURPLE;
const BG = "#F3F3FF";
const WHITE = "#FFFFFF";
const MUTED = "#718096";
const BORDER = "#E8E3F5";
const GREEN = "#18845D";
const LAVENDER = "#EDE7FF";

type TeacherLink = {
  id: string;
  institute_id: string;
  staff_id: string | null;
  full_name: string;
  role: string;
  is_active: boolean;
};
type ClassRow = { id: string; name: string };
type Batch = { id: string; name: string; is_active: boolean };
type Period = {
  id: string;
  batch_id: string;
  period_number: number;
  start_time: string;
  end_time: string;
};
type Subject = { id: string; name: string };
type TimetableEntry = {
  id: string;
  institute_id: string;
  class_id: string;
  day_of_week: string;
  batch_id: string;
  period_id: string;
  subject_id: string;
  teacher_id: string;
};
type AttendanceRecord = {
  id: string;
  timetable_entry_id: string;
  student_id: string;
  status: "present" | "absent" | "leave" | "late" | "holiday";
  attendance_date: string;
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const dateLabel = (d: Date) =>
  d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const timeLabel = (v?: string | null) => {
  if (!v) return "";
  const [h = "0", m = "00"] = v.slice(0, 5).split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
};

export default function TeacherAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const [teacher, setTeacher] = useState<TeacherLink | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    setLoading(true);
    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData.user;
      if (!user) {
        router.replace("/teacher/teacher-login" as never);
        return;
      }

      const { data: member, error: memberError } = await supabase
        .from("institute_team_members")
        .select("id,institute_id,staff_id,full_name,role,is_active")
        .eq("user_id", user.id)
        .eq("role", "teacher")
        .eq("is_active", true)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member)
        throw new Error(
          "Your active teacher profile could not be found. Please contact the institute owner.",
        );
      if (!member.staff_id)
        throw new Error(
          "Your teacher profile is not linked to a staff record yet.",
        );

      const [classRes, batchRes, periodRes, subjectRes, entryRes] =
        await Promise.all([
          supabase
            .from("institute_classes")
            .select("id,name")
            .eq("institute_id", member.institute_id)
            .order("name"),
          supabase
            .from("institute_batches")
            .select("id,name,is_active")
            .eq("institute_id", member.institute_id)
            .eq("is_active", true),
          supabase
            .from("institute_batch_periods")
            .select("id,batch_id,period_number,start_time,end_time")
            .eq("institute_id", member.institute_id)
            .order("period_number"),
          supabase
            .from("institute_subjects")
            .select("id,name")
            .eq("institute_id", member.institute_id)
            .order("name"),
          supabase
            .from("institute_timetable_entries")
            .select(
              "id,institute_id,class_id,day_of_week,batch_id,period_id,subject_id,teacher_id",
            )
            .eq("institute_id", member.institute_id)
            .eq("teacher_id", member.staff_id),
        ]);
      for (const result of [
        classRes,
        batchRes,
        periodRes,
        subjectRes,
        entryRes,
      ]) {
        if (result.error) throw result.error;
      }

      const currentEntries = (entryRes.data ?? []) as TimetableEntry[];
      setTeacher(member as TeacherLink);
      setClasses((classRes.data ?? []) as ClassRow[]);
      setBatches((batchRes.data ?? []) as Batch[]);
      setPeriods((periodRes.data ?? []) as Period[]);
      setSubjects((subjectRes.data ?? []) as Subject[]);
      setEntries(currentEntries);

      const { data: attendanceData, error: attendanceError } = await supabase
        .from("institute_attendance_records")
        .select("id,timetable_entry_id,student_id,status,attendance_date")
        .eq("institute_id", member.institute_id)
        .eq("attendance_date", selectedDate)
        .in(
          "timetable_entry_id",
          currentEntries.map((e) => e.id).length
            ? currentEntries.map((e) => e.id)
            : ["00000000-0000-0000-0000-000000000000"],
        );
      if (attendanceError) throw attendanceError;
      setRecords((attendanceData ?? []) as AttendanceRecord[]);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Unable to load your timetable.";
      console.error("[teacher-attendance] Load failed:", e);
      setLoadError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const chosenDate = parseIso(selectedDate);
  const selectedDay = DAYS[chosenDate.getDay()];
  const weekDates = useMemo(() => {
    const start = new Date(chosenDate);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [selectedDate]);

  const scheduled = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            entry.day_of_week.toLowerCase() === selectedDay.toLowerCase(),
        )
        .map((entry) => {
          const cls = classes.find((x) => x.id === entry.class_id);
          const batch = batches.find((x) => x.id === entry.batch_id);
          const period = periods.find(
            (x) => x.id === entry.period_id && x.batch_id === entry.batch_id,
          );
          const subject = subjects.find((x) => x.id === entry.subject_id);
          if (!cls || !batch || !period) return null;
          const periodRecords = records.filter(
            (r) =>
              r.timetable_entry_id === entry.id &&
              r.attendance_date === selectedDate,
          );
          const uniqueStudents = new Set(
            periodRecords.map((r) => r.student_id),
          );
          const present = periodRecords.filter(
            (r) => r.status === "present",
          ).length;
          return {
            ...entry,
            className: cls.name,
            batchName: batch.name,
            periodNumber: period.period_number,
            start: period.start_time,
            end: period.end_time,
            subjectName: subject?.name ?? "Subject",
            markedCount: uniqueStudents.size,
            presentCount: present,
            marked: uniqueStudents.size > 0,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .sort(
          (a, b) =>
            a.start.localeCompare(b.start) || a.periodNumber - b.periodNumber,
        ),
    [
      entries,
      classes,
      batches,
      periods,
      subjects,
      records,
      selectedDay,
      selectedDate,
    ],
  );

  const markedPeriods = scheduled.filter((row) => row.marked).length;

  const openMarking = (row: (typeof scheduled)[number]) => {
    if (selectedDate > isoDate(new Date())) {
      Alert.alert(
        "Future date",
        "Attendance cannot be marked for a future date.",
      );
      return;
    }
    router.push({
      pathname: "/teacher/attendance-marking" as never,
      params: {
        timetableEntryId: row.id,
        classId: row.class_id,
        className: row.className,
        batchId: row.batch_id,
        batchName: row.batchName,
        periodId: row.period_id,
        periodNumber: String(row.periodNumber),
        subjectName: row.subjectName,
        date: selectedDate,
      },
    } as never);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE_DARK} />
      <LinearGradient
        colors={[PURPLE, PURPLE_DARK, PURPLE_BRIGHT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={25} color={WHITE} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Attendance</Text>
            <Text style={styles.subtitle}>
              {teacher?.full_name
                ? `Hello, ${teacher.full_name.split(/\s+/)[0]}`
                : "Your teaching schedule"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setRefreshing(true);
              void load();
            }}
            style={styles.refreshButton}
            accessibilityLabel="Refresh timetable"
          >
            <Feather name="refresh-cw" size={19} color={WHITE} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekStrip}>
          {weekDates.map((day) => {
            const value = isoDate(day);
            const active = value === selectedDate;
            const future = value > isoDate(new Date());
            return (
              <TouchableOpacity
                key={value}
                style={[styles.dayCell, active && styles.dayCellActive]}
                onPress={() => setSelectedDate(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.dayName, active && styles.dayNameActive]}>
                  {day.toLocaleDateString("en-IN", { weekday: "short" })}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    active && styles.dayNumberActive,
                    future && !active && styles.futureDate,
                  ]}
                >
                  {day.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.monthLabel}>
          {chosenDate.toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })}
        </Text>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={BLUE}
          />
        }
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Feather name="check-square" size={22} color={BLUE} />
          </View>
          <View style={styles.summaryText}>
            <Text style={styles.summaryTitle}>{dateLabel(chosenDate)}</Text>
            <Text style={styles.summarySubtitle}>
              {markedPeriods} of {scheduled.length} periods have attendance
              saved
            </Text>
          </View>
          <View style={styles.summaryBadge}>
            <Text style={styles.summaryBadgeText}>
              {scheduled.length
                ? Math.round((markedPeriods / scheduled.length) * 100)
                : 0}
              %
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your assigned periods</Text>
            <Text style={styles.sectionSubtitle}>
              {selectedDay} · {scheduled.length}{" "}
              {scheduled.length === 1 ? "period" : "periods"}
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{scheduled.length}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={BLUE} />
            <Text style={styles.stateText}>
              Loading your assigned timetable…
            </Text>
          </View>
        ) : loadError ? (
          <View style={styles.stateCard}>
            <Feather name="alert-circle" size={32} color="#D65B69" />
            <Text style={styles.emptyTitle}>Could not load attendance</Text>
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setLoading(true);
                void load();
              }}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : scheduled.length === 0 ? (
          <View style={styles.stateCard}>
            <View style={styles.emptyIcon}>
              <Feather name="calendar" size={25} color={BLUE} />
            </View>
            <Text style={styles.emptyTitle}>No assigned periods</Text>
            <Text style={styles.emptyText}>
              No timetable periods are assigned to you for {selectedDay}. Select
              another day or ask the institute manager to assign your timetable.
            </Text>
          </View>
        ) : (
          scheduled.map((row) => (
            <View key={row.id} style={styles.periodCard}>
              <View style={styles.timeColumn}>
                <Text style={styles.periodNumber}>P{row.periodNumber}</Text>
                <View style={styles.timeLine} />
              </View>
              <View style={styles.periodBody}>
                <Text style={styles.subjectName} numberOfLines={1}>
                  {row.subjectName}
                </Text>
                <Text style={styles.className}>
                  {row.className} · {row.batchName}
                </Text>
                <View style={styles.timeRow}>
                  <Feather name="clock" size={13} color={MUTED} />
                  <Text style={styles.timeText}>
                    {timeLabel(row.start)} – {timeLabel(row.end)}
                  </Text>
                </View>
                {row.marked ? (
                  <View style={styles.savedRow}>
                    <View style={styles.savedDot} />
                    <Text style={styles.savedText}>
                      Attendance saved · {row.presentCount}/{row.markedCount}{" "}
                      present
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.pendingText}>Attendance not marked</Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.markButton, row.marked && styles.editButton]}
                onPress={() => openMarking(row)}
                accessibilityRole="button"
              >
                <Feather
                  name={row.marked ? "edit-2" : "check"}
                  size={15}
                  color={row.marked ? BLUE : WHITE}
                />
                <Text
                  style={[
                    styles.markButtonText,
                    row.marked && styles.editButtonText,
                  ]}
                >
                  {row.marked ? "Edit" : "Mark"}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <Text style={styles.footerNote}>
          Choose a date above to view the classes assigned to you for that
          weekday. Attendance is recorded separately for each period.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: PURPLE,
    paddingHorizontal: 18,
    paddingBottom: 17,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#FFFFFF20",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  title: { color: WHITE, fontSize: 24, fontWeight: "900" },
  subtitle: { color: "#F0E9FF", fontSize: 12, marginTop: 3 },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#FFFFFF20",
    alignItems: "center",
    justifyContent: "center",
  },
  weekStrip: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  dayCell: {
    flex: 1,
    minWidth: 0,
    height: 66,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  dayCellActive: { backgroundColor: WHITE },
  dayName: { color: "#E0D3FF", fontSize: 11, fontWeight: "700" },
  dayNameActive: { color: PURPLE_DARK },
  dayNumber: { color: WHITE, fontSize: 19, fontWeight: "900" },
  dayNumberActive: { color: NAVY },
  futureDate: { color: "#D0C2F4" },
  monthLabel: {
    color: "#F0E9FF",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 9,
  },
  content: { padding: 16, gap: 13 },
  summaryCard: {
    backgroundColor: WHITE,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    shadowColor: PURPLE_DARK,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  summaryIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: LAVENDER,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryText: { flex: 1 },
  summaryTitle: { color: NAVY, fontSize: 14, fontWeight: "900" },
  summarySubtitle: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 4 },
  summaryBadge: {
    backgroundColor: "#E7F8F0",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  summaryBadgeText: { color: GREEN, fontSize: 14, fontWeight: "900" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 5,
  },
  sectionTitle: { color: NAVY, fontSize: 19, fontWeight: "900", letterSpacing: -0.2 },
  sectionSubtitle: { color: MUTED, fontSize: 12, marginTop: 4 },
  countBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: LAVENDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countBadgeText: { color: BLUE, fontWeight: "900" },
  periodCard: {
    backgroundColor: WHITE,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    shadowColor: PURPLE_DARK,
    shadowOpacity: 0.045,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timeColumn: { width: 34, alignItems: "center", alignSelf: "stretch" },
  periodNumber: {
    color: BLUE,
    fontSize: 11,
    fontWeight: "900",
    backgroundColor: LAVENDER,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: "hidden",
  },
  timeLine: {
    width: 2,
    flex: 1,
    minHeight: 15,
    backgroundColor: "#DCD0FA",
    marginTop: 7,
    borderRadius: 1,
  },
  periodBody: { flex: 1, minWidth: 0 },
  subjectName: { color: NAVY, fontSize: 15, fontWeight: "900" },
  className: { color: "#675B80", fontSize: 12, marginTop: 4 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  timeText: { color: MUTED, fontSize: 11, fontWeight: "700" },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  savedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  savedText: { color: GREEN, fontSize: 10, fontWeight: "800" },
  pendingText: {
    color: "#B8791F",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 8,
  },
  markButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: PURPLE,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  markButtonText: { color: WHITE, fontSize: 12, fontWeight: "900" },
  editButton: { backgroundColor: LAVENDER },
  editButtonText: { color: BLUE },
  stateCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 160,
  },
  stateText: { color: MUTED, fontSize: 13 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: LAVENDER,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: NAVY,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: PURPLE,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
  },
  retryButtonText: { color: WHITE, fontWeight: "800", fontSize: 12 },
  footerNote: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 3,
  },
});
