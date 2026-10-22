import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";
import FloatingTabBar from "../components/FloatingTabBar";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const WHITE = "#FFFFFF";
const MUTED = "#9DB1BE";
const BORDER = "#E1E8EF";
const GREEN = "#43814A";
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
type DayName = (typeof DAYS)[number];
type ClassRow = { id: string; name: string };
type Batch = {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  days_of_week: string[] | null;
  is_active: boolean;
};
type Period = {
  id: string;
  batch_id: string;
  period_number: number;
  start_time: string;
  end_time: string;
};
type Subject = { id: string; name: string };
type Teacher = { id: string; full_name: string };
type TimetableEntry = {
  id: string;
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
  attendance_date: string;
  status: "present" | "absent" | "leave" | "late" | "holiday";
};
type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: AppAlertType;
};

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const timeLabel = (v?: string | null) => {
  if (!v) return "";
  const [h = "0", m = "00"] = v.slice(0, 5).split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
};
const dateLabel = (d: Date) =>
  d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
const monthLabel = (d: Date) =>
  d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export default function AttendanceScreen() {
  const insets = useSafeAreaInsets();
  const [instituteId, setInstituteId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()));
  const [monthCursor, setMonthCursor] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<AlertState>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const showAlert = (
    title: string,
    message: string,
    type: AppAlertType = "info",
  ) => setAlert({ visible: true, title, message, type });

  const load = useCallback(async () => {
    setLoading(true);
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

      const { data: memberships, error: memberError } = await supabase
        .from("institute_members")
        .select("institute_id")
        .eq("user_id", user.id)
        .limit(2);
      if (memberError) throw memberError;
      if (!memberships?.length)
        throw new Error("Your account is not linked to an institute.");
      if (memberships.length > 1)
        throw new Error(
          "Your account belongs to multiple institutes. Select an active institute first.",
        );
      const iid = memberships[0].institute_id as string;
      setInstituteId(iid);

      const [classRes, batchRes, periodRes, subjectRes, teacherRes, entryRes] =
        await Promise.all([
          supabase
            .from("institute_classes")
            .select("id,name")
            .eq("institute_id", iid)
            .order("name"),
          supabase
            .from("institute_batches")
            .select("id,name,start_time,end_time,days_of_week,is_active")
            .eq("institute_id", iid)
            .eq("is_active", true)
            .order("start_time"),
          supabase
            .from("institute_batch_periods")
            .select("id,batch_id,period_number,start_time,end_time")
            .eq("institute_id", iid)
            .order("period_number"),
          supabase
            .from("institute_subjects")
            .select("id,name")
            .eq("institute_id", iid)
            .order("name"),
          supabase
            .from("institute_staff")
            .select("id,full_name")
            .eq("institute_id", iid)
            .eq("status", "active")
            .order("full_name"),
          supabase
            .from("institute_timetable_entries")
            .select(
              "id,class_id,day_of_week,batch_id,period_id,subject_id,teacher_id",
            )
            .eq("institute_id", iid),
        ]);
      for (const result of [
        classRes,
        batchRes,
        periodRes,
        subjectRes,
        teacherRes,
        entryRes,
      ]) {
        if (result.error) throw result.error;
      }
      setClasses((classRes.data ?? []) as ClassRow[]);
      setBatches((batchRes.data ?? []) as Batch[]);
      setPeriods((periodRes.data ?? []) as Period[]);
      setSubjects((subjectRes.data ?? []) as Subject[]);
      setTeachers((teacherRes.data ?? []) as Teacher[]);
      setEntries((entryRes.data ?? []) as TimetableEntry[]);

      const { data: attendanceData, error: attendanceError } = await supabase
        .from("institute_attendance_records")
        .select("id,timetable_entry_id,student_id,attendance_date,status")
        .eq("institute_id", iid)
        .eq("attendance_date", selectedDate);
      if (attendanceError) throw attendanceError;
      setAttendanceRecords((attendanceData ?? []) as AttendanceRecord[]);
    } catch (e: any) {
      showAlert(
        "Unable to load attendance",
        e?.message ?? "Please check your connection and Supabase setup.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const chosenDate = parseIso(selectedDate);
  const selectedDay: DayName = DAYS[chosenDate.getDay()];
  const weekDates = useMemo(() => {
    const start = new Date(chosenDate);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [selectedDate]);

  const scheduled = useMemo(() => {
    return entries
      .filter((e) => e.day_of_week.toLowerCase() === selectedDay.toLowerCase())
      .map((e) => {
        const cls = classes.find((x) => x.id === e.class_id);
        const batch = batches.find((x) => x.id === e.batch_id);
        const period = periods.find((x) => x.id === e.period_id);
        const subject = subjects.find((x) => x.id === e.subject_id);
        const teacher = teachers.find((x) => x.id === e.teacher_id);
        if (!cls || !batch || !period) return null;
        const records = attendanceRecords.filter(
          (r) =>
            r.timetable_entry_id === e.id && r.attendance_date === selectedDate,
        );
        const presentCount = records.filter(
          (r) => r.status === "present",
        ).length;
        return {
          ...e,
          className: cls.name,
          batchName: batch.name,
          periodNumber: period.period_number,
          start: period.start_time,
          end: period.end_time,
          subjectName: subject?.name ?? "Subject",
          teacherName: teacher?.full_name ?? "Teacher not assigned",
          attendanceCount: records.length,
          presentCount,
          attendanceComplete: records.length > 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort(
        (a, b) =>
          a.start.localeCompare(b.start) ||
          a.className.localeCompare(b.className) ||
          a.periodNumber - b.periodNumber,
      );
  }, [
    entries,
    classes,
    batches,
    periods,
    subjects,
    teachers,
    selectedDay,
    attendanceRecords,
    selectedDate,
  ]);

  const markedCount = scheduled.filter((row) => row.attendanceComplete).length;
  const calendarCells = useMemo(() => {
    const first = new Date(
      monthCursor.getFullYear(),
      monthCursor.getMonth(),
      1,
    );
    const offset = first.getDay();
    const total = new Date(
      monthCursor.getFullYear(),
      monthCursor.getMonth() + 1,
      0,
    ).getDate();
    return [
      ...Array(offset).fill(null),
      ...Array.from({ length: total }, (_, i) => i + 1),
    ];
  }, [monthCursor]);

  const selectDate = (day: number) => {
    const d = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day);
    setSelectedDate(isoDate(d));
    setCalendarVisible(false);
  };

  const openMark = (row: (typeof scheduled)[number]) => {
    router.push({
      pathname: "/attendance-marking" as never,
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
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View
        style={[styles.topPanel, { paddingTop: Math.max(insets.top, 10) + 8 }]}
      >
        <View style={styles.topHeading}>
          <Text style={styles.heading}>Attendance</Text>
          <View style={styles.topActions}>
            <Pressable
              style={styles.roundAction}
              onPress={() => router.push("/attendance-reports" as never)}
            >
              <Feather name="bar-chart-2" size={23} color={WHITE} />
            </Pressable>
            <Pressable
              style={styles.roundAction}
              onPress={() => setCalendarVisible(true)}
            >
              <Feather name="calendar" size={23} color={WHITE} />
            </Pressable>
          </View>
        </View>

        <View style={styles.weekStrip}>
          {weekDates.map((d) => {
            const value = isoDate(d);
            const active = value === selectedDate;
            const future = value > isoDate(new Date());
            return (
              <Pressable
                key={value}
                onPress={() => setSelectedDate(value)}
                style={[styles.dayCell, active && styles.dayCellActive]}
              >
                <Text
                  style={[styles.dayShort, active && styles.dayShortActive]}
                >
                  {d.toLocaleDateString("en-IN", { weekday: "short" })}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    active && styles.dayNumberActive,
                    future && !active && styles.futureDate,
                  ]}
                >
                  {d.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryDate}>{dateLabel(chosenDate)}</Text>
            <Text style={styles.summaryCount}>
              {markedCount} of {scheduled.length} marked
            </Text>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryPercent}>
              {scheduled.length
                ? Math.round((markedCount / scheduled.length) * 100)
                : 0}
              %
            </Text>
            <Text style={styles.summaryPresent}>present</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Classes scheduled</Text>
        <Text style={styles.sectionSubtitle}>
          {selectedDay} · {scheduled.length} scheduled{" "}
          {scheduled.length === 1 ? "period" : "periods"}
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={NAVY} />
            <Text style={styles.loadingText}>Loading timetable…</Text>
          </View>
        ) : scheduled.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="calendar" size={30} color={MUTED} />
            <Text style={styles.emptyTitle}>No classes scheduled</Text>
            <Text style={styles.emptyText}>
              There are no timetable entries for {selectedDay}. Choose another
              date to view its classes.
            </Text>
          </View>
        ) : (
          scheduled.map((row) => (
            <Pressable
              key={row.id}
              style={styles.classCard}
              onPress={() => openMark(row)}
              accessibilityRole="button"
              accessibilityLabel={
                row.attendanceComplete
                  ? `Edit attendance for ${row.className}, ${row.subjectName}. ${row.presentCount} of ${row.attendanceCount} present`
                  : `Mark attendance for ${row.className}, ${row.subjectName}`
              }
            >
              <View style={styles.subjectBadge}>
                <Text style={styles.subjectInitial}>
                  {row.subjectName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.classInfo}>
                <Text style={styles.classTitle} numberOfLines={1}>
                  {row.subjectName}
                </Text>
                <Text style={styles.classMeta} numberOfLines={1}>
                  {row.className} · {row.batchName}
                </Text>
                <Text style={styles.classTime}>
                  {timeLabel(row.start)} – {timeLabel(row.end)} · Period{" "}
                  {row.periodNumber}
                </Text>
                <Text style={styles.teacherName} numberOfLines={1}>
                  {row.teacherName}
                </Text>
              </View>
              {row.attendanceComplete ? (
                <View style={styles.savedAttendance}>
                  <Text style={styles.savedAttendanceCount}>
                    {row.presentCount}/{row.attendanceCount}
                  </Text>
                  <Text style={styles.savedAttendanceLabel}>present</Text>
                </View>
              ) : (
                <View style={styles.markButton}>
                  <Text style={styles.markButtonText}>Mark now</Text>
                </View>
              )}
            </Pressable>
          ))
        )}
        <Text style={styles.note}>
          Only classes scheduled for the selected weekday are shown. Use the
          calendar to choose another date.
        </Text>
      </ScrollView>

      <FloatingTabBar />

      <Modal
        visible={calendarVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCalendarVisible(false)}
          />
          <View
            style={[
              styles.calendarSheet,
              { paddingBottom: Math.max(insets.bottom, 18) },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select date</Text>
              <Pressable
                style={styles.closeButton}
                onPress={() => setCalendarVisible(false)}
              >
                <Feather name="x" size={22} color={NAVY} />
              </Pressable>
            </View>
            <View style={styles.monthNav}>
              <Pressable
                style={styles.monthButton}
                onPress={() =>
                  setMonthCursor(
                    new Date(
                      monthCursor.getFullYear(),
                      monthCursor.getMonth() - 1,
                      1,
                    ),
                  )
                }
              >
                <Feather name="chevron-left" size={24} color={NAVY} />
              </Pressable>
              <Text style={styles.monthTitle}>{monthLabel(monthCursor)}</Text>
              <Pressable
                style={styles.monthButton}
                onPress={() =>
                  setMonthCursor(
                    new Date(
                      monthCursor.getFullYear(),
                      monthCursor.getMonth() + 1,
                      1,
                    ),
                  )
                }
              >
                <Feather name="chevron-right" size={24} color={NAVY} />
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <Text key={`${d}${i}`} style={styles.weekdayLabel}>
                  {d}
                </Text>
              ))}
              {calendarCells.map((day, i) => {
                if (day === null)
                  return (
                    <View key={`blank-${i}`} style={styles.calendarDayBlank} />
                  );
                const value = isoDate(
                  new Date(
                    monthCursor.getFullYear(),
                    monthCursor.getMonth(),
                    day,
                  ),
                );
                const active = value === selectedDate;
                return (
                  <Pressable
                    key={value}
                    style={[
                      styles.calendarDay,
                      active && styles.calendarDayActive,
                    ]}
                    onPress={() => selectDate(day)}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        active && styles.calendarDayTextActive,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={styles.selectDateButton}
              onPress={() => {
                setSelectedDate(isoDate(new Date()));
                setMonthCursor(
                  new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                );
                setCalendarVisible(false);
              }}
            >
              <Text style={styles.selectDateText}>Today</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <AppAlert
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        confirmLabel="OK"
        onConfirm={() => setAlert((a) => ({ ...a, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  topPanel: { backgroundColor: NAVY, paddingHorizontal: 20, paddingBottom: 20 },
  topHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  heading: { color: WHITE, fontSize: 25, fontWeight: "800" },
  topActions: { flexDirection: "row", gap: 10 },
  roundAction: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#30445E",
    alignItems: "center",
    justifyContent: "center",
  },
  weekStrip: { flexDirection: "row", justifyContent: "space-between", gap: 2 },
  dayCell: {
    flex: 1,
    minWidth: 0,
    height: 78,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dayCellActive: { backgroundColor: WHITE },
  dayShort: { color: MUTED, fontSize: 12, fontWeight: "600" },
  dayShortActive: { color: "#53687F" },
  dayNumber: { color: WHITE, fontSize: 20, fontWeight: "800" },
  dayNumberActive: { color: NAVY },
  futureDate: { color: "#617891" },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 110,
    gap: 12,
  },
  summaryCard: {
    backgroundColor: NAVY,
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 108,
  },
  summaryDate: { color: MUTED, fontSize: 15, fontWeight: "600" },
  summaryCount: { color: WHITE, fontSize: 22, fontWeight: "800", marginTop: 8 },
  summaryRight: { alignItems: "flex-end" },
  summaryPercent: { color: "#62B968", fontSize: 29, fontWeight: "900" },
  summaryPresent: { color: MUTED, fontSize: 13, fontWeight: "600" },
  sectionTitle: {
    color: "#526B82",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 10,
  },
  sectionSubtitle: {
    color: MUTED,
    fontSize: 14,
    marginTop: -6,
    marginBottom: 2,
  },
  classCard: {
    backgroundColor: WHITE,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  subjectBadge: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#FFF4C9",
    alignItems: "center",
    justifyContent: "center",
  },
  subjectInitial: { color: "#947300", fontSize: 23, fontWeight: "900" },
  classInfo: { flex: 1, minWidth: 0 },
  classTitle: { color: NAVY, fontSize: 18, fontWeight: "800" },
  classMeta: { color: "#536B82", fontSize: 13, marginTop: 3 },
  classTime: { color: MUTED, fontSize: 13, marginTop: 3 },
  teacherName: { color: "#8395A7", fontSize: 12, marginTop: 3 },
  markButton: {
    backgroundColor: NAVY,
    borderRadius: 24,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  markButtonText: { color: WHITE, fontSize: 13, fontWeight: "800" },
  savedAttendance: {
    minWidth: 68,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "#E5F4E5",
  },
  savedAttendanceCount: { color: "#397D40", fontSize: 17, fontWeight: "900" },
  savedAttendanceLabel: {
    color: "#397D40",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  emptyCard: {
    backgroundColor: WHITE,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 28,
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  emptyTitle: { color: NAVY, fontSize: 18, fontWeight: "800" },
  emptyText: {
    color: MUTED,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  note: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 10,
  },
  loadingText: { color: MUTED, fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10,20,35,0.42)",
    justifyContent: "flex-end",
  },
  calendarSheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: { color: NAVY, fontSize: 23, fontWeight: "900" },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 14,
  },
  monthButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: { color: NAVY, fontSize: 18, fontWeight: "800" },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  weekdayLabel: {
    width: "14.285%",
    textAlign: "center",
    color: MUTED,
    fontWeight: "700",
    paddingVertical: 10,
  },
  calendarDayBlank: { width: "14.285%", height: 47 },
  calendarDay: {
    width: "14.285%",
    height: 47,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  calendarDayActive: { backgroundColor: NAVY },
  calendarDayText: { color: NAVY, fontSize: 16, fontWeight: "700" },
  calendarDayTextActive: { color: WHITE },
  selectDateButton: {
    marginTop: 18,
    height: 54,
    borderRadius: 16,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  selectDateText: { color: WHITE, fontSize: 16, fontWeight: "800" },
});
