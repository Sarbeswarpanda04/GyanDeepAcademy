import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const NAVY = "#202F42",
  BG = "#F1F5F8",
  WHITE = "#FFFFFF",
  MUTED = "#9DB1BE",
  BORDER = "#E1E8EF";
const OPTIONS = [
  {
    code: "present",
    short: "P",
    label: "Present",
    color: "#E5F4E5",
    ink: "#397D40",
  },
  {
    code: "absent",
    short: "A",
    label: "Absent",
    color: "#FBE5E5",
    ink: "#C62828",
  },
  {
    code: "leave",
    short: "L",
    label: "Leave",
    color: "#FFF0DC",
    ink: "#C34A10",
  },
  {
    code: "late",
    short: "LV",
    label: "Late",
    color: "#E5EDFC",
    ink: "#315FA8",
  },
  {
    code: "holiday",
    short: "H",
    label: "Holiday",
    color: "#FBF3CC",
    ink: "#8B7000",
  },
] as const;
type StatusCode = (typeof OPTIONS)[number]["code"];
type Student = {
  id: string;
  full_name: string;
  roll_number: string | null;
  photo_path: string | null;
  class_id: string;
  status: string;
};
type RecordRow = {
  id: string;
  student_id: string;
  status: StatusCode;
  attendance_date: string;
  timetable_entry_id: string;
  institute_id: string;
};
type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: AppAlertType;
};

const asText = (v: unknown) => (typeof v === "string" ? v : "");
const rollSort = (a: Student, b: Student) => {
  const x = Number(a.roll_number),
    y = Number(b.roll_number);
  if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
  return (a.roll_number ?? "").localeCompare(b.roll_number ?? "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

export default function AttendanceMarkingScreen() {
  const params = useLocalSearchParams<{
    timetableEntryId?: string;
    classId?: string;
    className?: string;
    batchId?: string;
    batchName?: string;
    periodId?: string;
    periodNumber?: string;
    subjectName?: string;
    date?: string;
  }>();
  const insets = useSafeAreaInsets();
  const entryId = asText(params.timetableEntryId),
    classId = asText(params.classId),
    batchId = asText(params.batchId);
  const date = asText(params.date) || new Date().toISOString().slice(0, 10);
  const [instituteId, setInstituteId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, StatusCode>>({});
  const [original, setOriginal] = useState<Record<string, StatusCode>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [returnToAttendanceAfterAlert, setReturnToAttendanceAfterAlert] =
    useState(false);
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
      if (!entryId || !classId || !batchId)
        throw new Error(
          "Timetable details are missing. Return to Attendance and tap Mark now again.",
        );
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: memberships, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id")
        .eq("user_id", user.id)
        .limit(2);
      if (membershipError) throw membershipError;
      if (!memberships?.length)
        throw new Error("Your account is not linked to an institute.");
      if (memberships.length > 1)
        throw new Error("Select an active institute first.");
      const iid = memberships[0].institute_id as string;
      setInstituteId(iid);

      const { data: rawStudents, error: studentError } = await supabase
        .from("institute_students")
        .select("id,full_name,roll_number,photo_path,class_id,status")
        .eq("institute_id", iid)
        .eq("class_id", classId)
        .eq("status", "active");
      if (studentError) throw studentError;
      const activeStudents = (rawStudents ?? []) as Student[];
      const studentIds = activeStudents.map((s) => s.id);
      let links: { student_id: string; batch_id: string }[] = [];
      if (studentIds.length) {
        const { data, error } = await supabase
          .from("institute_student_batches")
          .select("student_id,batch_id")
          .in("student_id", studentIds)
          .eq("batch_id", batchId);
        if (error) throw error;
        links = data ?? [];
      }
      const enrolledIds = new Set(links.map((x) => x.student_id));
      const enrolled = activeStudents
        .filter((s) => enrolledIds.has(s.id))
        .sort(rollSort);
      setStudents(enrolled);

      const { data: existing, error: attendanceError } = await supabase
        .from("institute_attendance_records")
        .select(
          "id,student_id,status,attendance_date,timetable_entry_id,institute_id",
        )
        .eq("institute_id", iid)
        .eq("timetable_entry_id", entryId)
        .eq("attendance_date", date);
      if (attendanceError) throw attendanceError;
      const state: Record<string, StatusCode> = {};
      for (const r of (existing ?? []) as RecordRow[])
        state[r.student_id] = r.status;
      setAttendance(state);
      setOriginal(state);
    } catch (e: any) {
      showAlert(
        "Unable to load students",
        e?.message ?? "Please try again.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [entryId, classId, batchId, date]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const counts = useMemo(
    () =>
      OPTIONS.reduce(
        (acc, o) => {
          acc[o.code] = students.filter(
            (s) => attendance[s.id] === o.code,
          ).length;
          return acc;
        },
        {} as Record<StatusCode, number>,
      ),
    [students, attendance],
  );

  const choose = (studentId: string, status: StatusCode) =>
    setAttendance((prev) => ({
      ...prev,
      [studentId]:
        prev[studentId] === status
          ? (undefined as unknown as StatusCode)
          : status,
    }));

  const markAllPresent = () =>
    setAttendance((prev) => {
      const next = { ...prev };
      students.forEach((s) => {
        next[s.id] = "present";
      });
      return next;
    });

  const save = async () => {
    if (!instituteId || !entryId) return;
    const unmarked = students.filter((s) => !attendance[s.id]);
    if (unmarked.length) {
      showAlert(
        "Attendance incomplete",
        `${unmarked.length} student(s) still need an attendance status. Choose P, A, L, LV or H for each student.`,
        "warning",
      );
      return;
    }
    setSaving(true);
    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId)
        throw new Error("Your session has expired. Please sign in again.");

      const rows = students.map((s) => ({
        institute_id: instituteId,
        timetable_entry_id: entryId,
        student_id: s.id,
        class_id: classId,
        batch_id: batchId,
        attendance_date: date,
        status: attendance[s.id],
        marked_by: userId,
      }));
      const { error } = await supabase
        .from("institute_attendance_records")
        .upsert(rows, {
          onConflict: "timetable_entry_id,attendance_date,student_id",
        });
      if (error) throw error;
      setOriginal({ ...attendance });
      setReturnToAttendanceAfterAlert(true);
      showAlert(
        "Attendance saved",
        `Saved attendance for ${students.length} student(s).`,
        "success",
      );
    } catch (e: any) {
      showAlert(
        "Unable to save attendance",
        e?.message ?? "Run the attendance SQL migration and try again.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const changed = students.some((s) => attendance[s.id] !== original[s.id]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />
      <View
        style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}
      >
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Feather name="chevron-left" size={29} color={NAVY} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Mark Attendance</Text>
          <Text style={styles.subtitle}>
            {asText(params.subjectName) || "Class"} · {dateLabel}
          </Text>
          <Text style={styles.submeta}>
            {asText(params.className)} · {asText(params.batchName)} · Period{" "}
            {asText(params.periodNumber)}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        {OPTIONS.map((o) => (
          <View
            key={o.code}
            style={[styles.statCard, { backgroundColor: o.color }]}
          >
            <Text style={[styles.statNumber, { color: o.ink }]}>
              {counts[o.code]}
            </Text>
            <Text style={[styles.statLabel, { color: o.ink }]}>{o.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={NAVY} />
            <Text style={styles.emptyText}>Loading enrolled students…</Text>
          </View>
        ) : students.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="users" size={30} color={MUTED} />
            <Text style={styles.emptyTitle}>No students in this batch</Text>
            <Text style={styles.emptyText}>
              Only active students assigned to this class and batch are listed
              here.
            </Text>
          </View>
        ) : (
          students.map((s) => {
            const selected = attendance[s.id];
            return (
              <View key={s.id} style={styles.studentCard}>
                <View style={styles.avatar}>
                  {s.photo_path ? (
                    <Image
                      source={{ uri: s.photo_path }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Text style={styles.avatarText}>
                      {(s.full_name || "?").slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName} numberOfLines={1}>
                    {s.full_name}
                  </Text>
                  <Text style={styles.roll}>
                    Roll No. {s.roll_number || "—"}
                  </Text>
                </View>
                <View style={styles.optionsRow}>
                  {OPTIONS.map((o) => {
                    const active = selected === o.code;
                    return (
                      <Pressable
                        key={o.code}
                        accessibilityRole="button"
                        accessibilityLabel={`${s.full_name}: ${o.label}`}
                        onPress={() => choose(s.id, o.code)}
                        style={[
                          styles.option,
                          active && {
                            backgroundColor: o.color,
                            borderColor: o.ink,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            active && { color: o.ink, fontWeight: "900" },
                          ]}
                        >
                          {o.short}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <Pressable
          style={styles.markAll}
          onPress={markAllPresent}
          disabled={loading || !students.length}
        >
          <Text style={styles.markAllText}>Mark all present</Text>
        </Pressable>
        <Pressable
          style={[
            styles.saveButton,
            (saving || loading || !changed) && styles.disabledButton,
          ]}
          onPress={save}
          disabled={saving || loading || !changed}
        >
          {saving ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
      </View>

      <AppAlert
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        confirmLabel="OK"
        onConfirm={() => {
          setAlert((a) => ({ ...a, visible: false }));
          if (returnToAttendanceAfterAlert) {
            setReturnToAttendanceAfterAlert(false);
            router.back();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: WHITE,
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  back: {
    width: 44,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  title: { color: NAVY, fontSize: 23, fontWeight: "900" },
  subtitle: { color: MUTED, fontSize: 15, fontWeight: "700", marginTop: 3 },
  submeta: { color: "#718096", fontSize: 12, marginTop: 3 },
  statsRow: {
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    paddingBottom: 18,
    flexDirection: "row",
    gap: 6,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
    minHeight: 76,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  statNumber: { fontSize: 22, fontWeight: "900" },
  statLabel: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  listContent: { padding: 16, gap: 12, paddingBottom: 24 },
  studentCard: {
    backgroundColor: WHITE,
    borderRadius: 22,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: "#E7EEF5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { color: NAVY, fontSize: 20, fontWeight: "900" },
  studentInfo: { flex: 1, minWidth: 70 },
  studentName: { color: NAVY, fontSize: 16, fontWeight: "800" },
  roll: { color: MUTED, fontSize: 12, marginTop: 3 },
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: BG,
    padding: 5,
    borderRadius: 14,
  },
  option: {
    width: 27,
    height: 38,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionText: { color: MUTED, fontSize: 12, fontWeight: "800" },
  empty: {
    backgroundColor: WHITE,
    borderRadius: 22,
    padding: 28,
    alignItems: "center",
    gap: 9,
  },
  emptyTitle: { color: NAVY, fontSize: 18, fontWeight: "800" },
  emptyText: { color: MUTED, textAlign: "center", lineHeight: 20 },
  loader: { padding: 32, alignItems: "center", gap: 10 },
  bottomBar: {
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  markAll: {
    borderWidth: 2,
    borderColor: "#DCE6ED",
    borderRadius: 18,
    paddingHorizontal: 15,
    minHeight: 56,
    justifyContent: "center",
  },
  markAllText: { color: "#43814A", fontSize: 14, fontWeight: "800" },
  saveButton: {
    flex: 1,
    backgroundColor: NAVY,
    borderRadius: 16,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: { opacity: 0.55 },
  saveText: { color: WHITE, fontSize: 21, fontWeight: "800" },
});
