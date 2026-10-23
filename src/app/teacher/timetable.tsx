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
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const NAVY = "#1D2D44";
const BLUE = "#3677D5";
const BG = "#F4F7FB";
const WHITE = "#FFFFFF";
const MUTED = "#718096";
const BORDER = "#E7EDF4";
const GREEN = "#18845D";
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
type DayName = (typeof DAYS)[number];
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
  period_number: number;
  start_time: string;
  end_time: string;
  batch_id?: string | null;
};
type Subject = { id: string; name: string };
type TimetableEntry = {
  id: string;
  institute_id: string;
  class_id: string;
  day_of_week: DayName;
  batch_id: string;
  period_id: string;
  subject_id: string;
  teacher_id: string;
};

const getToday = (): DayName => {
  const day = new Date().getDay();
  return DAYS[(day + 6) % 7];
};
const timeLabel = (value?: string | null) => {
  if (!value) return "Time not set";
  const [hh = "0", mm = "00"] = value.slice(0, 5).split(":");
  const h = Number(hh);
  return `${h % 12 || 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
};
const minutesOf = (value?: string | null) => {
  if (!value) return 0;
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export default function TeacherTimetableScreen() {
  const insets = useSafeAreaInsets();
  const [teacher, setTeacher] = useState<TeacherLink | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayName>(getToday());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
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
          "Your active teacher profile could not be found. Please contact your institute owner.",
        );
      if (!member.staff_id)
        throw new Error(
          "Your teacher profile is not linked to a staff record yet.",
        );

      // Fetch only timetable rows assigned to this teacher's staff record.
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
      setTeacher(member as TeacherLink);
      setClasses((classRes.data ?? []) as ClassRow[]);
      setBatches((batchRes.data ?? []) as Batch[]);
      setPeriods((periodRes.data ?? []) as Period[]);
      setSubjects((subjectRes.data ?? []) as Subject[]);
      setEntries((entryRes.data ?? []) as TimetableEntry[]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load your timetable.";
      console.error("[teacher-timetable] Load failed:", error);
      setLoadError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const schedule = useMemo(() => {
    const classMap = new Map(classes.map((item) => [item.id, item.name]));
    const batchMap = new Map(batches.map((item) => [item.id, item.name]));
    const periodMap = new Map(periods.map((item) => [item.id, item]));
    const subjectMap = new Map(subjects.map((item) => [item.id, item.name]));
    return entries
      .filter((entry) => entry.day_of_week === selectedDay)
      .map((entry) => ({
        ...entry,
        className: classMap.get(entry.class_id) ?? "Class",
        batchName: batchMap.get(entry.batch_id) ?? "Batch",
        period: periodMap.get(entry.period_id),
        subjectName: subjectMap.get(entry.subject_id) ?? "Subject",
      }))
      .sort(
        (a, b) =>
          minutesOf(a.period?.start_time) - minutesOf(b.period?.start_time) ||
          (a.period?.period_number ?? 0) - (b.period?.period_number ?? 0),
      );
  }, [entries, classes, batches, periods, subjects, selectedDay]);

  const weeklyCount = entries.length;
  const todayLabel = selectedDay === getToday() ? "Today" : selectedDay;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 8) }]}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>TEACHER PORTAL</Text>
          <Text style={styles.title}>My Timetable</Text>
          <Text style={styles.subtitle}>Your assigned classes and periods</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.refreshButton}
          onPress={() => {
            setRefreshing(true);
            void load();
          }}
        >
          <Feather name="refresh-cw" size={18} color={BLUE} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 18) + 20 },
        ]}
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
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeIcon}>
            <Feather name="calendar" size={22} color={WHITE} />
          </View>
          <View style={styles.welcomeCopy}>
            <Text style={styles.welcomeLabel}>YOUR WEEKLY SCHEDULE</Text>
            <Text style={styles.teacherName}>
              {teacher?.full_name ?? "Teacher"}
            </Text>
            <Text style={styles.welcomeSub}>
              Only periods assigned to your account are shown.
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#EAF2FF" }]}>
              <Feather name="calendar" size={17} color={BLUE} />
            </View>
            <Text style={styles.statValue}>{schedule.length}</Text>
            <Text style={styles.statLabel}>Periods {selectedDay}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#E6F7EF" }]}>
              <Feather name="book-open" size={17} color={GREEN} />
            </View>
            <Text style={styles.statValue}>{weeklyCount}</Text>
            <Text style={styles.statLabel}>Weekly periods</Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Weekly timetable</Text>
            <Text style={styles.sectionSub}>
              Select a day to view assigned periods
            </Text>
          </View>
          <View style={styles.readOnlyPill}>
            <Feather name="eye" size={12} color={GREEN} />
            <Text style={styles.readOnlyText}>READ ONLY</Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayStrip}
        >
          {DAYS.map((day) => {
            const active = selectedDay === day;
            const count = entries.filter(
              (entry) => entry.day_of_week === day,
            ).length;
            return (
              <TouchableOpacity
                key={day}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSelectedDay(day)}
                style={[styles.dayChip, active && styles.dayChipActive]}
              >
                <Text
                  style={[
                    styles.dayChipText,
                    active && styles.dayChipTextActive,
                  ]}
                >
                  {day.slice(0, 3)}
                </Text>
                <View
                  style={[styles.dayCount, active && styles.dayCountActive]}
                >
                  <Text
                    style={[
                      styles.dayCountText,
                      active && styles.dayCountTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={BLUE} />
            <Text style={styles.stateTitle}>Loading timetable</Text>
            <Text style={styles.stateText}>
              Fetching your assigned periods…
            </Text>
          </View>
        ) : loadError ? (
          <View style={styles.errorCard}>
            <View style={styles.emptyIcon}>
              <Feather name="alert-circle" size={24} color="#C2413B" />
            </View>
            <Text style={styles.stateTitle}>Could not load timetable</Text>
            <Text style={styles.stateText}>{loadError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => void load()}
            >
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : schedule.length === 0 ? (
          <View style={styles.stateCard}>
            <View style={styles.emptyIcon}>
              <Feather name="calendar" size={25} color={BLUE} />
            </View>
            <Text style={styles.stateTitle}>No periods assigned</Text>
            <Text style={styles.stateText}>
              There are no timetable entries assigned to you for{" "}
              {todayLabel.toLowerCase()}. Contact your institute owner or
              manager if you think this is incorrect.
            </Text>
          </View>
        ) : (
          <View style={styles.scheduleList}>
            {schedule.map((item, index) => (
              <View key={item.id} style={styles.periodCard}>
                <View style={styles.timeline}>
                  <View style={styles.timelineDot} />
                  {index < schedule.length - 1 ? (
                    <View style={styles.timelineLine} />
                  ) : null}
                </View>
                <View style={styles.periodBody}>
                  <View style={styles.periodTop}>
                    <Text style={styles.periodNumber}>
                      PERIOD {item.period?.period_number ?? index + 1}
                    </Text>
                    <View style={styles.timePill}>
                      <Feather name="clock" size={12} color={BLUE} />
                      <Text style={styles.timeText}>
                        {timeLabel(item.period?.start_time)} –{" "}
                        {timeLabel(item.period?.end_time)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.subjectName}>{item.subjectName}</Text>
                  <View style={styles.detailRow}>
                    <Feather name="users" size={14} color={MUTED} />
                    <Text style={styles.detailText}>{item.className}</Text>
                    <View style={styles.detailDivider} />
                    <Feather name="layers" size={14} color={MUTED} />
                    <Text style={styles.detailText}>{item.batchName}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
        {!loading && !loadError && entries.length > 0 ? (
          <Text style={styles.footerNote}>
            Timetable data is managed by your institute. Contact the owner or
            manager to request a change.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  eyebrow: { color: BLUE, fontSize: 10, letterSpacing: 1.4, fontWeight: "800" },
  title: { color: NAVY, fontSize: 25, fontWeight: "800", marginTop: 2 },
  subtitle: { color: MUTED, fontSize: 12, marginTop: 3 },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 18, paddingTop: 2, gap: 17 },
  welcomeCard: {
    backgroundColor: NAVY,
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  welcomeIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#FFFFFF24",
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeCopy: { flex: 1 },
  welcomeLabel: {
    color: "#B9D2F8",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  teacherName: { color: WHITE, fontSize: 19, fontWeight: "800", marginTop: 4 },
  welcomeSub: { color: "#D4DEEB", fontSize: 11, lineHeight: 16, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  statValue: { color: NAVY, fontSize: 25, fontWeight: "800" },
  statLabel: { color: MUTED, fontSize: 11, marginTop: 3 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: { color: NAVY, fontSize: 18, fontWeight: "800" },
  sectionSub: { color: MUTED, fontSize: 11, marginTop: 4 },
  readOnlyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E6F7EF",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },
  readOnlyText: {
    color: GREEN,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  dayStrip: { gap: 8, paddingVertical: 2 },
  dayChip: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    alignItems: "center",
    gap: 6,
  },
  dayChipActive: { backgroundColor: BLUE, borderColor: BLUE },
  dayChipText: { color: NAVY, fontSize: 12, fontWeight: "800" },
  dayChipTextActive: { color: WHITE },
  dayCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 8,
    backgroundColor: "#F0F4F9",
    alignItems: "center",
    justifyContent: "center",
  },
  dayCountActive: { backgroundColor: "#FFFFFF30" },
  dayCountText: { color: MUTED, fontSize: 10, fontWeight: "800" },
  dayCountTextActive: { color: WHITE },
  scheduleList: { gap: 0 },
  periodCard: { flexDirection: "row", gap: 12, minHeight: 112 },
  timeline: { width: 18, alignItems: "center" },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BLUE,
    borderWidth: 3,
    borderColor: "#D8E7FF",
    marginTop: 17,
    zIndex: 1,
  },
  timelineLine: {
    position: "absolute",
    top: 29,
    bottom: -2,
    width: 2,
    backgroundColor: "#DCE7F5",
  },
  periodBody: {
    flex: 1,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  periodTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  periodNumber: {
    color: MUTED,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EAF2FF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  timeText: { color: BLUE, fontSize: 10, fontWeight: "700" },
  subjectName: { color: NAVY, fontSize: 17, fontWeight: "800", marginTop: 11 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 9,
  },
  detailText: { color: MUTED, fontSize: 11, fontWeight: "600" },
  detailDivider: {
    width: 1,
    height: 13,
    backgroundColor: BORDER,
    marginHorizontal: 3,
  },
  stateCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 28,
    minHeight: 205,
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: "#F4D7D5",
    borderRadius: 18,
    padding: 24,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  stateTitle: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 12,
  },
  stateText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 7,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: BLUE,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 11,
  },
  retryText: { color: WHITE, fontWeight: "800", fontSize: 12 },
  footerNote: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
});
