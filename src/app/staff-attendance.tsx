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
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect, router } from "expo-router";
import { supabase } from "../lib/supabase";
import AppAlert, { AppAlertType } from "../components/AppAlert";

const NAVY = "#202F42",
  BG = "#F1F5F8",
  MUTED = "#78909F",
  BORDER = "#DDE5EC",
  WHITE = "#FFFFFF";
type Session = "morning" | "evening" | "batch";
type ExclusiveChoice = "absent" | "holiday";
type Selection = ExclusiveChoice | Session[] | null;
type Staff = {
  id: string;
  institute_id: string;
  full_name: string;
  photo_path: string | null;
  salary_type: string;
  salary_amount: number;
  weekly_holidays: string[] | null;
  photo_url: string | null;
};
type AttendanceRow = {
  id: string;
  staff_id: string;
  institute_id: string;
  attendance_date: string;
  status: "present" | "absent" | "holiday";
  sessions: Session[];
  wage_amount: number;
  note?: string | null;
};
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const prettyDate = (s: string) =>
  parseDate(s).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const choices: {
  key: Exclude<Choice, null>;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  bg: string;
}[] = [
  {
    key: "absent",
    label: "Absent",
    icon: "x-circle",
    color: "#C94F5B",
    bg: "#FDECEF",
  },
  {
    key: "holiday",
    label: "Holiday",
    icon: "sun",
    color: "#A96C13",
    bg: "#FFF2D9",
  },
  {
    key: "morning",
    label: "Morning",
    icon: "sunrise",
    color: "#3478B9",
    bg: "#E5F1FF",
  },
  {
    key: "evening",
    label: "Evening",
    icon: "sunset",
    color: "#7856A8",
    bg: "#F0EAFE",
  },
  {
    key: "batch",
    label: "Batch",
    icon: "users",
    color: "#16845B",
    bg: "#DDF7EB",
  },
];
export default function StaffAttendanceScreen() {
  const [date, setDate] = useState(iso(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [saved, setSaved] = useState<Record<string, Selection>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [instituteId, setInstituteId] = useState("");
  const [alert, setAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AppAlertType;
  }>({ visible: false, title: "", message: "", type: "info" });
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
      if (!user) throw new Error("Please sign in again.");
      const { data: members, error: memberError } = await supabase
        .from("institute_members")
        .select("institute_id,role")
        .eq("user_id", user.id);
      if (memberError) throw memberError;
      if (!members?.length)
        throw new Error("Your account is not linked to an institute.");
      if (members.length !== 1)
        throw new Error(
          "This account has multiple institute memberships. Select an institute first.",
        );
      const iid = members[0].institute_id as string;
      setInstituteId(iid);
      const { data: people, error: staffError } = await supabase
        .from("institute_staff")
        .select(
          "id,institute_id,full_name,photo_path,salary_type,salary_amount,weekly_holidays",
        )
        .eq("institute_id", iid)
        .eq("status", "active")
        .order("full_name");
      if (staffError) throw staffError;
      const withPhotos: Staff[] = await Promise.all(
        (people ?? []).map(async (p: any) => {
          let photo_url: string | null = null;
          if (p.photo_path) {
            const { data } = await supabase.storage
              .from("staff-photos")
              .createSignedUrl(p.photo_path, 3600);
            photo_url = data?.signedUrl ?? null;
          }
          return { ...p, photo_url } as Staff;
        }),
      );
      setStaff(withPhotos);
      const { data: records, error: attendanceError } = await supabase
        .from("staff_attendance")
        .select(
          "id,staff_id,institute_id,attendance_date,status,sessions,wage_amount,note",
        )
        .eq("institute_id", iid)
        .eq("attendance_date", date);
      if (attendanceError) throw attendanceError;
      const mapped: Record<string, Selection> = {};
      (records ?? []).forEach((r: any) => {
        if (r.status === "absent" || r.status === "holiday")
          mapped[r.staff_id] = r.status;
        else {
          const valid = (r.sessions ?? []).filter(
            (v: unknown): v is Session =>
              v === "morning" || v === "evening" || v === "batch",
          );
          mapped[r.staff_id] = valid;
        }
      });
      setSaved(mapped);
      setSelections(mapped);
    } catch (e: any) {
      showAlert(
        "Unable to load attendance",
        e?.message ?? "Please try again.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [date]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const counts = useMemo(() => {
    const values = staff.map((s) => selections[s.id] ?? null);
    const marked = values.filter(
      (v) =>
        v === "absent" || v === "holiday" || (Array.isArray(v) && v.length > 0),
    ).length;
    return { marked, unmarked: values.length - marked };
  }, [staff, selections]);
  const changeDate = (offset: number) => {
    const d = parseDate(date);
    d.setDate(d.getDate() + offset);
    const next = iso(d);
    if (next > iso(new Date())) return;
    setShowDatePicker(false);
    setLoading(true);
    setSelections({});
    setSaved({});
    setDate(next);
  };
  const selectChoice = (id: string, choice: Exclude<Selection, null>) =>
    setSelections((prev) => {
      const current = prev[id] ?? null;
      if (choice === "absent" || choice === "holiday") {
        return { ...prev, [id]: current === choice ? null : choice };
      }
      if (!Array.isArray(current)) {
        return { ...prev, [id]: [choice] };
      }
      const next = current.includes(choice)
        ? current.filter((v) => v !== choice)
        : [...current, choice];
      return { ...prev, [id]: next.length ? next : null };
    });
  const save = async () => {
    if (!instituteId) {
      showAlert(
        "Institute not found",
        "Please reload this screen and try again.",
        "error",
      );
      return;
    }
    if (!staff.length) {
      showAlert(
        "No teachers",
        "There are no active teachers to mark.",
        "warning",
      );
      return;
    }
    const unmarked = staff.filter((p) => {
      const v = selections[p.id];
      return !(
        v === "absent" ||
        v === "holiday" ||
        (Array.isArray(v) && v.length > 0)
      );
    });
    if (unmarked.length) {
      showAlert(
        "Attendance incomplete",
        `Please mark attendance for ${unmarked.length} teacher(s) before saving.`,
        "warning",
      );
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      const payload = staff.map((person) => {
        const choice = selections[person.id]!;
        const status =
          choice === "absent"
            ? "absent"
            : choice === "holiday"
              ? "holiday"
              : "present";
        const sessions: Session[] =
          status === "present" && Array.isArray(choice) ? choice : [];
        let wage = 0;
        if (status === "present" && sessions.length) {
          if (person.salary_type === "batch")
            wage = sessions.length * Number(person.salary_amount);
          else if (person.salary_type === "daily")
            wage = Number(person.salary_amount);
          else
            wage =
              Number(person.salary_amount) /
              new Date(
                parseDate(date).getFullYear(),
                parseDate(date).getMonth() + 1,
                0,
              ).getDate();
        }
        return {
          staff_id: person.id,
          institute_id: instituteId,
          attendance_date: date,
          status,
          sessions,
          wage_amount: wage,
          updated_by: user?.id ?? null,
        };
      });
      // Existing staff_attendance table only; upsert uses the existing unique key.
      const { error } = await supabase
        .from("staff_attendance")
        .upsert(payload, { onConflict: "staff_id,attendance_date" });
      if (error) throw error;
      setSaved({ ...selections });
      showAlert(
        "Attendance saved",
        `Attendance for ${prettyDate(date)} has been saved for all ${staff.length} teachers.`,
        "success",
      );
    } catch (e: any) {
      showAlert(
        "Could not save attendance",
        e?.message ?? "Please check your permissions and try again.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View style={styles.top}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Feather name="arrow-left" size={24} color={WHITE} />
          </Pressable>
          <View>
            <Text style={styles.title}>Mark Attendance</Text>
            <Text style={styles.subtitle}>Teacher attendance register</Text>
          </View>
        </View>
        <View style={styles.dateCard}>
          <Pressable style={styles.dateArrow} onPress={() => changeDate(-1)}>
            <Feather name="chevron-left" size={26} color={NAVY} />
          </Pressable>
          <Pressable
            style={styles.dateMiddle}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateText}>{prettyDate(date)}</Text>
            <View style={styles.todayRow}>
              <Text style={styles.todayText}>
                {date === iso(new Date()) ? "Today" : "Tap to choose date"}
              </Text>
              <Feather name="chevron-down" size={17} color={MUTED} />
            </View>
          </Pressable>
          <Pressable
            disabled={date >= iso(new Date())}
            style={[
              styles.dateArrow,
              date >= iso(new Date()) && { opacity: 0.35 },
            ]}
            onPress={() => changeDate(1)}
          >
            <Feather name="chevron-right" size={26} color={NAVY} />
          </Pressable>
        </View>
        <Text style={styles.counts}>
          {counts.marked} marked · {counts.unmarked} not marked
        </Text>
      </View>
      {showDatePicker && (
        <DateTimePicker
          value={parseDate(date)}
          mode="date"
          maximumDate={new Date()}
          display="default"
          onValueChange={(selected: Date) => {
            if (selected) {
              setShowDatePicker(false);
              const next = iso(selected);
              setLoading(true);
              setSelections({});
              setSaved({});
              setDate(next);
            }
          }}
          onDismiss={() => setShowDatePicker(false)}
        />
      )}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={NAVY} />
          <Text style={styles.muted}>Loading teachers…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {staff.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="users" size={34} color={MUTED} />
              <Text style={styles.emptyText}>No active teachers found.</Text>
            </View>
          ) : (
            staff.map((person) => {
              const selected = selections[person.id] ?? null;
              const savedValue = saved[person.id] ?? null;
              const isSaved =
                JSON.stringify(savedValue) === JSON.stringify(selected) &&
                !!selected &&
                (selected === "absent" ||
                  selected === "holiday" ||
                  (Array.isArray(selected) && selected.length > 0));
              return (
                <View key={person.id} style={styles.teacherCard}>
                  <View style={styles.teacherHeader}>
                    {person.photo_url ? (
                      <Image
                        source={{ uri: person.photo_url }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Feather name="user" size={25} color={MUTED} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.teacherName}>{person.full_name}</Text>
                      <Text style={styles.teacherMeta}>
                        {isSaved
                          ? "Saved for selected date"
                          : selected
                            ? "Selection not saved"
                            : "Select attendance status"}
                      </Text>
                    </View>
                    {isSaved && (
                      <Feather name="check-circle" size={19} color="#16845B" />
                    )}
                  </View>
                  <View style={styles.options}>
                    {choices.map((choice) => {
                      const active =
                        choice.key === "absent" || choice.key === "holiday"
                          ? selected === choice.key
                          : Array.isArray(selected) &&
                            selected.includes(choice.key as Session);
                      return (
                        <Pressable
                          key={choice.key}
                          onPress={() => selectChoice(person.id, choice.key)}
                          style={[
                            styles.option,
                            active
                              ? {
                                  backgroundColor: choice.bg,
                                  borderColor: choice.color,
                                }
                              : null,
                          ]}
                        >
                          <Feather
                            name={choice.icon}
                            size={16}
                            color={active ? choice.color : MUTED}
                          />
                          <Text
                            style={[
                              styles.optionText,
                              active ? { color: choice.color } : null,
                            ]}
                          >
                            {choice.label}
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
      )}
      <View style={styles.bottom}>
        <Pressable
          disabled={saving || loading || staff.length === 0}
          style={[
            styles.saveButton,
            (saving || loading || !staff.length) && { opacity: 0.6 },
          ]}
          onPress={() => void save()}
        >
          {saving ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <>
              <Feather name="check-circle" size={20} color={WHITE} />
              <Text style={styles.saveText}>Save Attendance</Text>
            </>
          )}
        </Pressable>
      </View>
      <AppAlert
        {...alert}
        onCancel={() => setAlert((a) => ({ ...a, visible: false }))}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  top: { backgroundColor: NAVY, paddingBottom: 18 },
  header: {
    paddingTop: 35,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  back: { width: 40, height: 44, justifyContent: "center" },
  title: { fontSize: 25, fontWeight: "800", color: WHITE },
  subtitle: { fontSize: 13, color: "#A7BAC7", marginTop: 3 },
  dateCard: {
    marginHorizontal: 18,
    marginTop: 15,
    backgroundColor: "#F3F7FA",
    borderRadius: 22,
    padding: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateArrow: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  dateMiddle: { flex: 1, alignItems: "center", paddingVertical: 4 },
  dateText: {
    fontSize: 17,
    fontWeight: "800",
    color: NAVY,
    textAlign: "center",
  },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  todayText: { fontSize: 12, color: MUTED },
  counts: {
    color: "#B8C7D2",
    fontSize: 14,
    marginTop: 18,
    marginHorizontal: 20,
  },
  list: { padding: 16, paddingBottom: 115 },
  teacherCard: {
    backgroundColor: WHITE,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 13,
  },
  teacherHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 18, backgroundColor: BG },
  avatarFallback: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#EAF0F4",
    alignItems: "center",
    justifyContent: "center",
  },
  teacherName: { fontSize: 18, fontWeight: "800", color: NAVY },
  teacherMeta: { fontSize: 12, color: MUTED, marginTop: 5 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 15 },
  option: {
    flexGrow: 1,
    minWidth: "28%",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  optionText: { fontSize: 12, fontWeight: "700", color: "#58718D" },
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    paddingBottom: 18,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  saveButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  saveText: { color: WHITE, fontSize: 18, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: MUTED, fontSize: 14 },
  empty: { paddingTop: 70, alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15, color: MUTED },
});
