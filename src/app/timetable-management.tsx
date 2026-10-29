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
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const NAVY = "#1F2937";
const BG = "#F3F3FF";
const WHITE = "#FFFFFF";
const MUTED = "#718096";
const BORDER = "#E8E3F5";
const GOLD = "#C4B5FD";
const PURPLE = "#611CD0";
const DEEP_PURPLE = "#44109D";
const VIVID_PURPLE = "#4C02F7";
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
type Day = (typeof DAYS)[number];
type ClassRow = { id: string; name: string; institute_id: string };
type Batch = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
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
type Subject = { id: string; name: string; class_id: string };
type Teacher = { id: string; full_name: string };
type Assignment = {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
};
type Entry = {
  id: string;
  institute_id: string;
  class_id: string;
  day_of_week: Day;
  batch_id: string;
  period_id: string;
  subject_id: string;
  teacher_id: string;
  subject?: Subject;
  teacher?: Teacher;
  batch?: Batch;
  period?: Period;
};
type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: AppAlertType;
  confirmLabel?: string;
};

const displayTime = (v: string) => {
  const [h = "0", m = "00"] = String(v).slice(0, 5).split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour) || !Number.isFinite(Number(m))) return v;
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
};

export default function TimetableManagementScreen() {
  const insets = useSafeAreaInsets();
  const [instituteId, setInstituteId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Day>(DAYS[0]);
  const [selectedSlot, setSelectedSlot] = useState<{
    batch: Batch;
    period: Period;
  } | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
  ) => setAlert({ visible: true, title, message, type, confirmLabel: "OK" });
  const closeAlert = () => setAlert((v) => ({ ...v, visible: false }));

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
      const { data: memberships, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id,role")
        .eq("user_id", user.id)
        .limit(2);
      if (membershipError) throw membershipError;
      if (!memberships?.length)
        throw new Error("Your account is not linked to an institute.");
      if (memberships.length > 1)
        throw new Error(
          "Your account belongs to multiple institutes. Select one active institute first.",
        );
      const iid = memberships[0].institute_id as string;
      setInstituteId(iid);

      const [
        classRes,
        batchRes,
        periodRes,
        subjectRes,
        staffRes,
        assignmentRes,
        entryRes,
      ] = await Promise.all([
        supabase
          .from("institute_classes")
          .select("id,name,institute_id")
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
          .select("id,name,class_id")
          .eq("institute_id", iid)
          .order("name"),
        supabase
          .from("institute_staff")
          .select("id,full_name")
          .eq("institute_id", iid)
          .eq("status", "active")
          .order("full_name"),
        supabase
          .from("institute_subject_teachers")
          .select("id,class_id,subject_id,teacher_id")
          .eq("institute_id", iid),
        supabase
          .from("institute_timetable_entries")
          .select(
            "id,institute_id,class_id,day_of_week,batch_id,period_id,subject_id,teacher_id",
          )
          .eq("institute_id", iid),
      ]);
      for (const result of [
        classRes,
        batchRes,
        periodRes,
        subjectRes,
        staffRes,
        assignmentRes,
        entryRes,
      ])
        if (result.error) throw result.error;
      const classRows = (classRes.data ?? []) as ClassRow[];
      setClasses(classRows);
      setSelectedClassId((current) =>
        current && classRows.some((c) => c.id === current)
          ? current
          : (classRows[0]?.id ?? null),
      );
      setBatches((batchRes.data ?? []) as Batch[]);
      setPeriods((periodRes.data ?? []) as Period[]);
      setSubjects((subjectRes.data ?? []) as Subject[]);
      setTeachers((staffRes.data ?? []) as Teacher[]);
      setAssignments((assignmentRes.data ?? []) as Assignment[]);
      setEntries((entryRes.data ?? []) as Entry[]);
    } catch (e: any) {
      showAlert(
        "Unable to load timetable",
        e?.message ?? "Please check your connection and Supabase setup.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const activeClass = classes.find((c) => c.id === selectedClassId) ?? null;
  const classBatches = useMemo(
    () => batches.filter((b) => (b.days_of_week ?? []).includes(selectedDay)),
    [batches, selectedDay],
  );
  const availableSlots = useMemo(
    () =>
      classBatches.flatMap((batch) =>
        periods
          .filter((p) => p.batch_id === batch.id)
          .map((period) => ({ batch, period })),
      ),
    [classBatches, periods],
  );
  const classEntries = useMemo(
    () =>
      entries.filter(
        (e) => e.class_id === selectedClassId && e.day_of_week === selectedDay,
      ),
    [entries, selectedClassId, selectedDay],
  );
  const eligibleSubjects = useMemo(() => {
    if (!selectedClassId) return [];
    const allowedIds = new Set(
      assignments
        .filter((a) => a.class_id === selectedClassId)
        .map((a) => a.subject_id),
    );
    return subjects.filter(
      (s) => s.class_id === selectedClassId && allowedIds.has(s.id),
    );
  }, [selectedClassId, subjects, assignments]);

  const openSlot = (batch: Batch, period: Period) => {
    setSelectedSlot({ batch, period });
    const existing = entries.find(
      (e) =>
        e.class_id === selectedClassId &&
        e.day_of_week === selectedDay &&
        e.batch_id === batch.id &&
        e.period_id === period.id,
    );
    setSelectedSubjectId(existing?.subject_id ?? null);
  };

  const saveEntry = async () => {
    // Snapshot the selected values before awaiting any network request.
    const iid = instituteId;
    const classId = selectedClassId;
    const day = selectedDay;
    const slot = selectedSlot;
    const subjectId = selectedSubjectId;

    if (!iid || !classId || !slot) return;
    if (!subjectId) {
      showAlert(
        "Choose a subject",
        "Select a subject that is assigned to this class and has a teacher assigned.",
        "warning",
      );
      return;
    }

    const assignment = assignments.find(
      (a) => a.class_id === classId && a.subject_id === subjectId,
    );
    if (!assignment) {
      showAlert(
        "Teacher assignment required",
        "This subject does not have an assigned teacher for the selected class. Assign a teacher first.",
        "warning",
      );
      return;
    }

    const existing = entries.find(
      (e) =>
        e.class_id === classId &&
        e.day_of_week === day &&
        e.batch_id === slot.batch.id &&
        e.period_id === slot.period.id,
    );

    // Only consider the same class/day/batch/period a duplicate.
    // The previous check ignored batch_id and could flag unrelated entries.
    const conflict = entries.find(
      (e) =>
        e.class_id === classId &&
        e.day_of_week === day &&
        e.batch_id === slot.batch.id &&
        e.period_id === slot.period.id &&
        e.id !== existing?.id,
    );
    if (conflict) {
      showAlert(
        "Period already occupied",
        "This class period already has an entry. Refresh the timetable and try again.",
        "warning",
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        institute_id: iid,
        class_id: classId,
        day_of_week: day,
        batch_id: slot.batch.id,
        period_id: slot.period.id,
        subject_id: subjectId,
        teacher_id: assignment.teacher_id,
      };

      const result = existing
        ? await supabase
            .from("institute_timetable_entries")
            .update(payload)
            .eq("id", existing.id)
            .eq("institute_id", iid)
            .select(
              "id,institute_id,class_id,day_of_week,batch_id,period_id,subject_id,teacher_id",
            )
            .single()
        : await supabase
            .from("institute_timetable_entries")
            .insert(payload)
            .select(
              "id,institute_id,class_id,day_of_week,batch_id,period_id,subject_id,teacher_id",
            )
            .single();

      if (result.error) throw result.error;
      if (!result.data) {
        throw new Error("Supabase did not return the saved timetable entry.");
      }

      // Verify the row is actually readable from the database before showing success.
      const verify = await supabase
        .from("institute_timetable_entries")
        .select(
          "id,institute_id,class_id,day_of_week,batch_id,period_id,subject_id,teacher_id",
        )
        .eq("institute_id", iid)
        .eq("class_id", classId)
        .eq("day_of_week", day)
        .eq("batch_id", slot.batch.id)
        .eq("period_id", slot.period.id)
        .maybeSingle();

      if (verify.error) throw verify.error;
      if (!verify.data) {
        throw new Error(
          "The save request returned successfully, but the entry could not be read back. Check Supabase RLS policies, triggers, and that the app and SQL editor use the same Supabase project.",
        );
      }

      // Replace local state with the verified database row.
      setEntries((current) => {
        const withoutSlot = current.filter(
          (e) =>
            !(
              e.class_id === classId &&
              e.day_of_week === day &&
              e.batch_id === slot.batch.id &&
              e.period_id === slot.period.id
            ),
        );
        return [...withoutSlot, verify.data as Entry];
      });

      setSelectedSlot(null);
      setSelectedSubjectId(null);
      showAlert(
        "Timetable saved",
        `${subjects.find((s) => s.id === subjectId)?.name ?? "Subject"} has been saved for ${day} in ${slot.batch.name}.`,
        "success",
      );
    } catch (e: any) {
      showAlert(
        "Unable to save timetable",
        e?.message ?? "Please try again.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = (entry: Entry) => {
    setAlert({
      visible: true,
      title: "Remove timetable entry?",
      message:
        "This will clear the subject and teacher from this class period.",
      type: "warning",
      confirmLabel: "Remove",
    });
    // Keep the action explicit and use the custom alert's confirm callback via a separate handler below.
    setPendingDelete(entry);
  };
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const confirmDelete = async () => {
    const entry = pendingDelete;
    closeAlert();
    setPendingDelete(null);
    if (!entry || !instituteId) return;
    try {
      const { error } = await supabase
        .from("institute_timetable_entries")
        .delete()
        .eq("id", entry.id)
        .eq("institute_id", instituteId);
      if (error) throw error;
      setEntries((current) => current.filter((e) => e.id !== entry.id));
      showAlert(
        "Entry removed",
        "The timetable period is now available for another subject.",
        "success",
      );
    } catch (e: any) {
      showAlert(
        "Unable to remove entry",
        e?.message ?? "Please try again.",
        "error",
      );
    }
  };

  const currentEntryFor = (batchId: string, periodId: string) =>
    classEntries.find(
      (e) => e.batch_id === batchId && e.period_id === periodId,
    );
  const subjectFor = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? "Subject";
  const teacherFor = (id: string) =>
    teachers.find((t) => t.id === id)?.full_name ?? "Teacher not found";

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={DEEP_PURPLE} />
      <LinearGradient
        colors={[PURPLE, DEEP_PURPLE, VIVID_PURPLE]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Math.max(insets.top, 14) + 8 }]}
      >
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={21} color={WHITE} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Timetable Management</Text>
          <Text style={styles.subtitle}>
            Set subjects and teachers for each class period
          </Text>
        </View>
        <Pressable onPress={() => void load()} style={styles.refresh}>
          <Feather name="refresh-cw" size={18} color={WHITE} />
        </Pressable>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingContent}>
          <View style={styles.skeletonHeading} />
          <View style={styles.skeletonClassRow}>
            {[0, 1, 2, 3].map((item) => (
              <View key={item} style={styles.skeletonClass} />
            ))}
          </View>
          <View style={styles.skeletonHeading} />
          <View style={styles.skeletonDayRow}>
            {[0, 1, 2, 3, 4, 5, 6].map((item) => (
              <View key={item} style={styles.skeletonDay} />
            ))}
          </View>
          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.skeletonPeriod}>
              <View style={styles.skeletonLineLong} />
              <View style={styles.skeletonLineShort} />
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Choose class</Text>
            <Text style={styles.sectionHint}>{classes.length} available</Text>
          </View>
          {classes.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="layers" size={25} color={MUTED} />
              <Text style={styles.emptyTitle}>No classes found</Text>
              <Text style={styles.muted}>
                Add classes before creating a timetable.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.classRow}
            >
              {classes.map((item, index) => (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedClassId(item.id)}
                  style={[
                    styles.classCard,
                    selectedClassId === item.id && styles.classCardSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.classIndex,
                      selectedClassId === item.id && styles.selectedText,
                    ]}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.className,
                      selectedClassId === item.id && styles.selectedText,
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Choose day</Text>
            <Text style={styles.sectionHint}>{selectedDay}</Text>
          </View>
          <View style={styles.daysGrid}>
            {DAYS.map((day) => (
              <Pressable
                key={day}
                onPress={() => setSelectedDay(day)}
                style={[
                  styles.dayChip,
                  selectedDay === day && styles.daySelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    selectedDay === day && styles.selectedText,
                  ]}
                >
                  {day.slice(0, 3)}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>
                {activeClass?.name ?? "Class timetable"}
              </Text>
              <Text style={styles.sectionHint}>
                {selectedDay} · Available batches and periods
              </Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{classEntries.length} set</Text>
            </View>
          </View>
          {!selectedClassId ? (
            <View style={styles.empty}>
              <Text style={styles.muted}>
                Select a class to view available periods.
              </Text>
            </View>
          ) : availableSlots.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="calendar" size={26} color={MUTED} />
              </View>
              <Text style={styles.emptyTitle}>No batches available</Text>
              <Text style={styles.muted}>
                No active batch is scheduled for {selectedDay}. Update the batch
                days or period schedule first.
              </Text>
            </View>
          ) : (
            availableSlots.map(({ batch, period }) => {
              const entry = currentEntryFor(batch.id, period.id);
              return (
                <View
                  key={`${batch.id}-${period.id}`}
                  style={styles.periodCard}
                >
                  <View style={styles.periodTime}>
                    <Text style={styles.periodNo}>
                      PERIOD {period.period_number}
                    </Text>
                    <Text style={styles.timeText}>
                      {displayTime(period.start_time)} –{" "}
                      {displayTime(period.end_time)}
                    </Text>
                    <Text style={styles.batchName}>{batch.name}</Text>
                  </View>
                  {entry ? (
                    <View style={styles.assignedBox}>
                      <View style={styles.assignedIcon}>
                        <Feather name="book-open" size={17} color="#611CD0" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subjectName}>
                          {subjectFor(entry.subject_id)}
                        </Text>
                        <Text style={styles.teacherName}>
                          <Feather name="user" size={12} color={MUTED} />{" "}
                          {teacherFor(entry.teacher_id)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => openSlot(batch, period)}
                        hitSlop={8}
                        style={styles.smallAction}
                      >
                        <Feather name="edit-2" size={15} color={NAVY} />
                      </Pressable>
                      <Pressable
                        onPress={() => removeEntry(entry)}
                        hitSlop={8}
                        style={styles.smallAction}
                      >
                        <Feather name="trash-2" size={15} color="#C64242" />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.assignButton}
                      onPress={() => openSlot(batch, period)}
                    >
                      <Feather name="plus-circle" size={17} color={NAVY} />
                      <Text style={styles.assignText}>
                        Assign subject & teacher
                      </Text>
                      <Feather name="chevron-right" size={18} color={MUTED} />
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
          <View style={styles.tip}>
            <Feather name="info" size={17} color="#611CD0" />
            <Text style={styles.tipText}>
              Subjects are filtered to the selected class and must have a
              teacher assignment in Teacher Management before they can be added
              here.
            </Text>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={!!selectedSlot}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedSlot(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.scrim}
            onPress={() => !saving && setSelectedSlot(null)}
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 18) },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>
                  {selectedSlot
                    ? `Period ${selectedSlot.period.period_number}`
                    : "Assign period"}
                </Text>
                <Text style={styles.sheetSub}>
                  {activeClass?.name} · {selectedDay} ·{" "}
                  {selectedSlot
                    ? `${displayTime(selectedSlot.period.start_time)} – ${displayTime(selectedSlot.period.end_time)}`
                    : ""}
                </Text>
                <Text style={styles.sheetBatch}>
                  {selectedSlot?.batch.name}
                </Text>
              </View>
              <Pressable
                onPress={() => setSelectedSlot(null)}
                style={styles.closeButton}
              >
                <Feather name="x" size={20} color={NAVY} />
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>Choose subject</Text>
            <ScrollView
              style={{ maxHeight: 300 }}
              showsVerticalScrollIndicator={false}
            >
              {eligibleSubjects.length === 0 ? (
                <View style={styles.emptyInline}>
                  <Feather name="alert-circle" size={22} color="#B27A1B" />
                  <Text style={styles.emptyTitle}>No assigned subjects</Text>
                  <Text style={styles.muted}>
                    Assign a subject and teacher to this class in Teacher
                    Management first.
                  </Text>
                </View>
              ) : (
                eligibleSubjects.map((subject) => {
                  const teacherAssignment = assignments.find(
                    (a) =>
                      a.class_id === selectedClassId &&
                      a.subject_id === subject.id,
                  );
                  const teacher = teachers.find(
                    (t) => t.id === teacherAssignment?.teacher_id,
                  );
                  const chosen = selectedSubjectId === subject.id;
                  return (
                    <Pressable
                      key={subject.id}
                      onPress={() => setSelectedSubjectId(subject.id)}
                      style={[
                        styles.subjectOption,
                        chosen && styles.subjectOptionSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.radioOuter,
                          chosen && styles.radioOuterSelected,
                        ]}
                      >
                        {chosen ? <View style={styles.radioInner} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionTitle}>{subject.name}</Text>
                        <Text style={styles.optionTeacher}>
                          {teacher?.full_name ?? "Assigned teacher unavailable"}
                        </Text>
                      </View>
                      <Feather
                        name="user-check"
                        size={17}
                        color={chosen ? NAVY : MUTED}
                      />
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <Pressable
              disabled={saving || eligibleSubjects.length === 0}
              onPress={() => void saveEntry()}
              style={[
                styles.saveButton,
                (saving || eligibleSubjects.length === 0) && { opacity: 0.55 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <>
                  <Feather name="check-circle" size={18} color={WHITE} />
                  <Text style={styles.saveText}>Save timetable</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <AppAlert
        {...alert}
        onCancel={closeAlert}
        onConfirm={
          pendingDelete && alert.title === "Remove timetable entry?"
            ? () => void confirmDelete()
            : closeAlert
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: PURPLE,
    paddingHorizontal: 16,
    paddingBottom: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  refresh: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: "800", color: WHITE },
  subtitle: { color: "#C0CCDB", fontSize: 12, marginTop: 4 },
  loadingContent: { flex: 1, paddingTop: 20, paddingBottom: 30 },
  skeletonHeading: {
    height: 18, width: 140, marginHorizontal: 16, marginTop: 8, marginBottom: 14,
    borderRadius: 8, backgroundColor: "#E7E0F8",
  },
  skeletonClassRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 18 },
  skeletonClass: { width: 66, height: 72, borderRadius: 15, backgroundColor: "#EAE4F8" },
  skeletonDayRow: { flexDirection: "row", gap: 5, paddingHorizontal: 16, marginBottom: 20 },
  skeletonDay: { flex: 1, height: 39, borderRadius: 12, backgroundColor: "#EAE4F8" },
  skeletonPeriod: {
    marginHorizontal: 16, marginBottom: 10, height: 108, borderRadius: 18,
    borderWidth: 1, borderColor: BORDER, backgroundColor: WHITE, padding: 14, gap: 12,
  },
  skeletonLineLong: { height: 14, width: "62%", borderRadius: 7, backgroundColor: "#EAE4F8" },
  skeletonLineShort: { height: 12, width: "38%", borderRadius: 7, backgroundColor: "#F0EAFE" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: MUTED, fontSize: 13, lineHeight: 19, textAlign: "center" },
  sectionHead: {
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: PURPLE, fontSize: 17, fontWeight: "800" },
  sectionHint: { color: MUTED, fontSize: 12, marginTop: 3 },
  classRow: { paddingHorizontal: 16, gap: 8 },
  classCard: {
    width: 66,
    height: 72,
    borderRadius: 15,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  classCardSelected: { backgroundColor: PURPLE, borderColor: PURPLE },
  classIndex: { fontSize: 10, fontWeight: "800", color: "#DDD6FE", marginBottom: 7 },
  className: { fontSize: 12, fontWeight: "800", color: PURPLE, maxWidth: 60 },
  selectedText: { color: WHITE },
  daysGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    gap: 5,
  },
  dayChip: {
    flex: 1,
    minWidth: 0,
    height: 39,
    borderRadius: 12,
    backgroundColor: WHITE,
    borderColor: BORDER,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  daySelected: { backgroundColor: PURPLE, borderColor: PURPLE },
  dayText: { color: PURPLE, fontSize: 12, fontWeight: "800" },
  countPill: {
    backgroundColor: "#F0EAFE",
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  countText: { color: PURPLE, fontSize: 11, fontWeight: "800" },
  periodCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  periodTime: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FAF9FF",
  },
  periodNo: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  timeText: { color: PURPLE, fontSize: 15, fontWeight: "800", marginTop: 4 },
  batchName: { color: MUTED, fontSize: 12, marginTop: 3 },
  assignButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  assignText: { flex: 1, color: PURPLE, fontSize: 13, fontWeight: "700" },
  assignedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
  },
  assignedIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#F0EAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  subjectName: { color: PURPLE, fontSize: 14, fontWeight: "800" },
  teacherName: { color: MUTED, fontSize: 12, marginTop: 4 },
  smallAction: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "#F5F1FF",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    marginHorizontal: 16,
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: "center",
    gap: 8,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#F0EAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: PURPLE,
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center",
  },
  tip: {
    flexDirection: "row",
    gap: 9,
    margin: 16,
    marginTop: 8,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#F5F0FF",
  },
  tipText: { flex: 1, color: "#5B21B6", fontSize: 12, lineHeight: 18 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(11,20,37,0.48)",
  },
  sheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 18,
    maxHeight: "82%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 3,
    backgroundColor: "#DDD6FE",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 21, color: PURPLE, fontWeight: "900" },
  sheetSub: { fontSize: 12, color: MUTED, marginTop: 5 },
  sheetBatch: {
    fontSize: 13,
    color: "#6D28D9",
    fontWeight: "800",
    marginTop: 5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F5F1FF",
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: { color: PURPLE, fontSize: 13, fontWeight: "800", marginBottom: 9 },
  subjectOption: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    padding: 13,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  subjectOptionSelected: { borderColor: PURPLE, backgroundColor: "#F3EEFF" },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#C4B5FD",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: { borderColor: PURPLE },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: PURPLE },
  optionTitle: { color: PURPLE, fontWeight: "800", fontSize: 14 },
  optionTeacher: { color: MUTED, fontSize: 12, marginTop: 4 },
  emptyInline: { padding: 20, alignItems: "center", gap: 8 },
  saveButton: {
    marginTop: 14,
    height: 50,
    borderRadius: 15,
    backgroundColor: PURPLE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  saveText: { color: WHITE, fontSize: 14, fontWeight: "800" },
});
