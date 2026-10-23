import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const C = {
  navy: "#172B4D",
  blue: "#3677D5",
  pale: "#EEF5FF",
  bg: "#F4F7FB",
  white: "#FFFFFF",
  text: "#243247",
  muted: "#748198",
  border: "#E4EAF2",
  green: "#159A82",
  red: "#D95362",
  amber: "#D28A26",
  purple: "#7956C7",
};
type Role = "owner" | "teacher";
type Member = {
  institute_id: string;
  full_name: string;
  role: string;
  staff_id: string | null;
};
type ClassRow = { id: string; name: string };
type SubjectRow = { id: string; name: string; class_id?: string | null };
type ExamSubject = {
  id?: string;
  subject_id: string;
  subject_name: string;
  full_marks: number;
  pass_marks: number;
};
type Exam = {
  id: string;
  institute_id: string;
  name: string;
  exam_type: string;
  exam_date: string;
  start_time: string;
  duration_minutes: number;
  description: string | null;
  class_id: string;
  created_by_name: string;
  status: string;
  class_name?: string;
  subjects?: ExamSubject[];
  marks_count?: number;
};
type Student = {
  id: string;
  full_name: string;
  roll_number: string | number | null;
};
type MarkRow = {
  student_id: string;
  student_name: string;
  roll_number: string | number | null;
  full_marks: number;
  secured_marks: string;
  absent: boolean;
};

const DURATIONS = [
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "1 hour 30 min", value: 90 },
  { label: "2 hour", value: 120 },
  { label: "2 hour 30 min", value: 150 },
  { label: "3 hour", value: 180 },
];
const TYPES = ["Weekly Exam", "Monthly Exam", "Final Exam"];
const prettyDate = (s: string) => {
  if (!s) return "Date not set";
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
const displayDuration = (n: number) =>
  DURATIONS.find((x) => x.value === n)?.label ?? `${n} min`;
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
}) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.buttonSecondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      {icon && (
        <Feather name={icon} size={17} color={secondary ? C.navy : C.white} />
      )}
      <Text style={[s.buttonText, secondary && { color: C.navy }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}
function Input({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9AA6B8"
      multiline={multiline}
      keyboardType={keyboardType ?? "default"}
      style={[s.input, multiline && { height: 94, textAlignVertical: "top" }]}
    />
  );
}
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.choice, selected && s.choiceSelected]}
    >
      <Text
        style={[s.choiceText, selected && { color: C.blue, fontWeight: "800" }]}
      >
        {label}
      </Text>
      {selected && <Feather name="check-circle" size={16} color={C.blue} />}
    </TouchableOpacity>
  );
}

export default function ExamScreens({
  role,
  mode,
}: {
  role: Role;
  mode: "list" | "create" | "marks" | "marksheet";
}) {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ examId?: string; edit?: string }>();
  const examId = typeof params.examId === "string" ? params.examId : "";
  const editing = mode === "create" && (params.edit === "1" || !!examId);
  const [member, setMember] = useState<Member | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [examType, setExamType] = useState(TYPES[0]);
  const [examDate, setExamDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [pickerKind, setPickerKind] = useState<"date" | "time" | null>(null);
  const [pickerDraft, setPickerDraft] = useState<Date>(new Date());
  const [durationMenuOpen, setDurationMenuOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([]);
  const [assignedSubjectIds, setAssignedSubjectIds] = useState<
    { class_id: string; subject_id: string }[]
  >([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [marksSubjectId, setMarksSubjectId] = useState("");
  const [markRows, setMarkRows] = useState<MarkRow[]>([]);
  const [existingMarks, setExistingMarks] = useState(false);
  const [marksheetPreviewOpen, setMarksheetPreviewOpen] = useState(false);
  const [marksheetHtml, setMarksheetHtml] = useState("");
  const [marksheetPdfUri, setMarksheetPdfUri] = useState("");
  const [marksheetPdfName, setMarksheetPdfName] = useState("marksheet.pdf");
  const title =
    mode === "list"
      ? "Exams"
      : mode === "create"
        ? editing
          ? "Edit exam"
          : "Create exam"
        : mode === "marks"
          ? "Add marks"
          : "Marksheet";
  const goBack = () => router.back();

  const loadBase = useCallback(async () => {
    setError("");
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.replace(
          (role === "owner"
            ? "/owner/login"
            : "/teacher/teacher-login") as never,
        );
        return;
      }
      let m: Member;
      if (role === "owner") {
        // Owners are stored in institute_members, not institute_team_members.
        const { data: owner, error: ownerError } = await supabase
          .from("institute_members")
          .select("institute_id,user_id,role")
          .eq("user_id", user.id)
          .eq("role", "owner")
          .maybeSingle();

        if (ownerError) throw ownerError;
        if (!owner) {
          throw new Error(
            "No owner membership is linked to this login. Sign in with the institute owner account.",
          );
        }

        m = {
          institute_id: owner.institute_id,
          full_name:
            user.user_metadata?.full_name ??
            user.user_metadata?.name ??
            user.email ??
            "Institute owner",
          role: "owner",
          staff_id: null,
        };
      } else {
        const { data: teacher, error: teacherError } = await supabase
          .from("institute_team_members")
          .select("institute_id,full_name,role,staff_id,is_active")
          .eq("user_id", user.id)
          .eq("role", "teacher")
          .eq("is_active", true)
          .maybeSingle();

        if (teacherError) throw teacherError;
        if (!teacher) {
          throw new Error("No active teacher profile is linked to this login.");
        }

        m = teacher as Member;
      }

      setMember(m);
      const [cr, sr] = await Promise.all([
        supabase
          .from("institute_classes")
          .select("id,name")
          .eq("institute_id", m.institute_id)
          .order("name"),
        supabase
          .from("institute_subjects")
          .select("id,name,class_id")
          .eq("institute_id", m.institute_id)
          .order("name"),
      ]);
      if (cr.error) throw cr.error;
      if (sr.error) throw sr.error;
      setClasses((cr.data ?? []) as ClassRow[]);
      setSubjects((sr.data ?? []) as SubjectRow[]);
      if (role === "teacher") {
        if (!m.staff_id)
          throw new Error(
            "Your teacher account is not linked to a staff record. Contact the institute owner.",
          );
        const { data: assigned, error: ae } = await supabase
          .from("institute_timetable_entries")
          .select("class_id,subject_id")
          .eq("institute_id", m.institute_id)
          .eq("teacher_id", m.staff_id);
        if (ae) throw ae;
        setAssignedSubjectIds(
          (assigned ?? [])
            .filter((r: any) => r.class_id && r.subject_id)
            .map((r: any) => ({
              class_id: r.class_id,
              subject_id: r.subject_id,
            })),
        );
      } else {
        // Use the actual class-subject combinations configured in the timetable.
        // Do not treat every institute subject as available for every class.
        const { data: mappings, error: mappingError } = await supabase
          .from("institute_timetable_entries")
          .select("class_id,subject_id")
          .eq("institute_id", m.institute_id);
        if (mappingError) throw mappingError;
        setAssignedSubjectIds(
          (mappings ?? [])
            .filter((r: any) => r.class_id && r.subject_id)
            .map((r: any) => ({
              class_id: r.class_id,
              subject_id: r.subject_id,
            }))
            .filter(
              (r: any, index: number, all: any[]) =>
                all.findIndex(
                  (x: any) =>
                    x.class_id === r.class_id && x.subject_id === r.subject_id,
                ) === index,
            ),
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role]);
  const loadExams = useCallback(async () => {
    if (!member) return;
    try {
      let q = supabase
        .from("institute_exams")
        .select(
          "id,institute_id,name,exam_type,exam_date,start_time,duration_minutes,description,class_id,created_by_name,status,created_by_role",
        )
        .eq("institute_id", member.institute_id)
        .order("exam_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (role === "teacher")
        q = q.eq(
          "created_by_user_id",
          (await supabase.auth.getUser()).data.user?.id ?? "",
        );
      const { data, error: e } = await q;
      if (e) throw e;
      const rows = (data ?? []) as any[];
      const [subRes, marksRes] = await Promise.all([
        supabase
          .from("institute_exam_subjects")
          .select("id,exam_id,subject_id,full_marks,pass_marks,subject_name")
          .eq("institute_id", member.institute_id),
        supabase
          .from("institute_exam_marks")
          .select("id,exam_id")
          .eq("institute_id", member.institute_id),
      ]);
      if (subRes.error) throw subRes.error;
      if (marksRes.error) throw marksRes.error;
      const classMap = new Map(classes.map((x) => [x.id, x.name]));
      setExams(
        rows.map((e) => ({
          ...e,
          class_name: classMap.get(e.class_id) ?? "Class",
          subjects: (subRes.data ?? [])
            .filter((x: any) => x.exam_id === e.id)
            .map((x: any) => ({
              id: x.id,
              subject_id: x.subject_id,
              subject_name: x.subject_name,
              full_marks: x.full_marks,
              pass_marks: x.pass_marks,
            })),
          marks_count: (marksRes.data ?? []).filter(
            (x: any) => x.exam_id === e.id,
          ).length,
        })) as Exam[],
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [member, role, classes]);
  useEffect(() => {
    void loadBase();
  }, [loadBase]);
  useEffect(() => {
    if (member && mode === "list") void loadExams();
  }, [member, mode, loadExams]);

  // Default the create-exam class to Class 10 when available.
  useEffect(() => {
    if (mode !== "create" || editing || classId || classes.length === 0) return;
    const classTen = classes.find((c) => /(?:class\s*)?10(?:th)?/i.test(c.name));
    if (classTen) setClassId(classTen.id);
  }, [mode, editing, classId, classes]);

  const loadExistingExam = useCallback(async () => {
    if (!member || !examId || mode !== "create") return;
    try {
      const { data: row, error: re } = await supabase
        .from("institute_exams")
        .select("*")
        .eq("id", examId)
        .eq("institute_id", member.institute_id)
        .single();
      if (re) throw re;
      setName(row.name);
      setExamType(row.exam_type);
      setExamDate(row.exam_date);
      setStartTime(String(row.start_time).slice(0, 5));
      setDuration(row.duration_minutes);
      setDescription(row.description ?? "");
      setClassId(row.class_id);
      const { data: subs, error: se } = await supabase
        .from("institute_exam_subjects")
        .select("id,subject_id,subject_name,full_marks,pass_marks")
        .eq("exam_id", examId)
        .eq("institute_id", member.institute_id);
      if (se) throw se;
      setExamSubjects(
        (subs ?? []).map((x: any) => ({
          ...x,
          full_marks: Number(x.full_marks),
          pass_marks: Number(x.pass_marks),
        })),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [member, examId, mode]);
  useEffect(() => {
    void loadExistingExam();
  }, [loadExistingExam]);

  const loadMarks = useCallback(async () => {
    if (!member || !examId || mode !== "marks") return;
    setLoading(true);
    setError("");
    try {
      const { data: ex, error: ee } = await supabase
        .from("institute_exams")
        .select("id,class_id")
        .eq("id", examId)
        .eq("institute_id", member.institute_id)
        .single();
      if (ee) throw ee;
      const { data: subs, error: se } = await supabase
        .from("institute_exam_subjects")
        .select("subject_id,subject_name,full_marks,pass_marks")
        .eq("exam_id", examId)
        .eq("institute_id", member.institute_id);
      if (se) throw se;
      const subList = (subs ?? []) as any[];
      setExamSubjects(
        subList.map((x: any) => ({
          subject_id: x.subject_id,
          subject_name: x.subject_name,
          full_marks: Number(x.full_marks),
          pass_marks: Number(x.pass_marks),
        })),
      );
      if (!marksSubjectId && subList.length)
        setMarksSubjectId(subList[0].subject_id);
      const activeSubject = marksSubjectId || subList[0]?.subject_id;
      if (!activeSubject) {
        setMarkRows([]);
        return;
      }
      const subject = subList.find((x) => x.subject_id === activeSubject);
      if (!subject) throw new Error("Choose a subject for this exam.");
      const { data: students, error: ste } = await supabase
        .from("institute_students")
        .select("id,full_name,roll_number")
        .eq("institute_id", member.institute_id)
        .eq("class_id", ex.class_id)
        .eq("status", "active")
        .order("roll_number");
      if (ste) throw ste;
      const { data: saved, error: se2 } = await supabase
        .from("institute_exam_marks")
        .select("student_id,secured_marks,is_absent")
        .eq("exam_id", examId)
        .eq("subject_id", activeSubject)
        .eq("institute_id", member.institute_id);
      if (se2) throw se2;
      const savedMap = new Map(
        (saved ?? []).map((x: any) => [x.student_id, x]),
      );
      setExistingMarks((saved ?? []).length > 0);
      setMarkRows(
        ((students ?? []) as Student[]).map((st) => {
          const m: any = savedMap.get(st.id);
          return {
            student_id: st.id,
            student_name: st.full_name,
            roll_number: st.roll_number,
            full_marks: Number(subject.full_marks),
            secured_marks: m ? String(m.secured_marks) : "",
            absent: m?.is_absent ?? false,
          };
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [member, examId, mode, marksSubjectId]);
  useEffect(() => {
    void loadMarks();
  }, [loadMarks]);

  const availableSubjects = useMemo(
    () => subjects.filter((subject) => {
      if (!classId) return false;
      const belongsToClass = !subject.class_id || subject.class_id === classId;
      const teacherAssigned = role === "owner" || assignedSubjectIds.some(
        (assignment) => assignment.class_id === classId && assignment.subject_id === subject.id,
      );
      return belongsToClass && teacherAssigned;
    }),
    [subjects, role, assignedSubjectIds, classId],
  );

  const openPicker = (kind: "date" | "time") => {
    let initial = new Date();
    if (kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
      const [year, month, day] = examDate.split("-").map(Number);
      initial = new Date(year, month - 1, day, 12, 0, 0);
    } else if (kind === "time" && /^\d{2}:\d{2}$/.test(startTime)) {
      const [hours, minutes] = startTime.split(":").map(Number);
      initial.setHours(hours, minutes, 0, 0);
    }
    setPickerDraft(initial);
    setPickerKind(kind);
  };

  const onNativePickerChange = (event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === "android") setPickerKind(null);
    if (event.type === "dismissed" || !value) return;
    setPickerDraft(value);
    if (Platform.OS === "android") {
      if (pickerKind === "date") {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, "0");
        const d = String(value.getDate()).padStart(2, "0");
        setExamDate(`${y}-${m}-${d}`);
      } else {
        setStartTime(`${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`);
      }
    }
  };

  const commitPicker = () => {
    if (pickerKind === "date") {
      const y = pickerDraft.getFullYear();
      const m = String(pickerDraft.getMonth() + 1).padStart(2, "0");
      const d = String(pickerDraft.getDate()).padStart(2, "0");
      setExamDate(`${y}-${m}-${d}`);
    } else if (pickerKind === "time") {
      setStartTime(`${String(pickerDraft.getHours()).padStart(2, "0")}:${String(pickerDraft.getMinutes()).padStart(2, "0")}`);
    }
    setPickerKind(null);
  };
  const changeExamSubject = (id: string) => {
    setSelectedSubjectId(id);
  };
  const addSubject = () => {
    if (!selectedSubjectId) {
      Alert.alert("Choose a subject", "Select a subject before adding it.");
      return;
    }
    if (examSubjects.some((x) => x.subject_id === selectedSubjectId)) {
      Alert.alert("Already added", "This subject is already included.");
      return;
    }
    const subject = subjects.find((x) => x.id === selectedSubjectId);
    if (!subject) return;
    setExamSubjects((p) => [
      ...p,
      {
        subject_id: subject.id,
        subject_name: subject.name,
        full_marks: 100,
        pass_marks: 35,
      },
    ]);
    setSelectedSubjectId("");
  };
  const updateSub = (
    id: string,
    key: "full_marks" | "pass_marks",
    value: string,
  ) =>
    setExamSubjects((p) =>
      p.map((x) =>
        x.subject_id === id
          ? { ...x, [key]: value === "" ? 0 : Number(value) }
          : x,
      ),
    );
  const validateStep = () => {
    if (step === 1) {
      if (
        !name.trim() ||
        !examDate ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
      ) {
        Alert.alert(
          "Complete exam details",
          "Enter exam name, date, and start time in HH:MM format.",
        );
        return false;
      }
      return true;
    }
    if (step === 2) {
      if (!classId) {
        Alert.alert("Choose a class", "Select the class for this exam.");
        return false;
      }
      if (!examSubjects.length) {
        Alert.alert(
          "Add a subject",
          "Add at least one subject with full and pass marks.",
        );
        return false;
      }
      if (
        examSubjects.some(
          (x) =>
            x.full_marks <= 0 ||
            x.pass_marks < 0 ||
            x.pass_marks > x.full_marks,
        )
      ) {
        Alert.alert(
          "Check marks",
          "Full marks must be above zero and pass marks cannot exceed full marks.",
        );
        return false;
      }
      return true;
    }
    return true;
  };
  const saveExam = async () => {
    if (!member || saving) return;
    setSaving(true);
    setError("");
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Please sign in again.");
      const payload = {
        institute_id: member.institute_id,
        name: name.trim(),
        exam_type: examType,
        exam_date: examDate,
        start_time: startTime,
        duration_minutes: duration,
        description: description.trim() || null,
        class_id: classId,
        created_by_user_id: user.id,
        created_by_name: member.full_name,
        created_by_role: role,
        updated_at: new Date().toISOString(),
      };
      if (!classId) throw new Error("Choose a class before saving the exam.");
      if (!examSubjects.length) throw new Error("Add at least one subject before saving the exam.");
      console.log("[ExamScreens] save exam diagnostic", {
        userId: user.id,
        screenRole: role,
        memberInstituteId: member.institute_id,
        selectedClassId: classId,
        createdByUserId: payload.created_by_user_id,
        createdByRole: payload.created_by_role,
      });
      let id = examId;
      if (editing) {
        const { error: e } = await supabase
          .from("institute_exams")
          .update(payload)
          .eq("id", examId)
          .eq("institute_id", member.institute_id);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase
          .from("institute_exams")
          .insert(payload)
          .select("id")
          .single();
        if (e) throw e;
        id = data.id;
      }
      if (editing) {
        const { error: e } = await supabase
          .from("institute_exam_subjects")
          .delete()
          .eq("exam_id", id)
          .eq("institute_id", member.institute_id);
        if (e) throw e;
      }
      const { error: se } = await supabase
        .from("institute_exam_subjects")
        .insert(
          examSubjects.map((x) => ({
            institute_id: member.institute_id,
            exam_id: id,
            subject_id: x.subject_id,
            subject_name: x.subject_name,
            full_marks: x.full_marks,
            pass_marks: x.pass_marks,
          })),
        );
      if (se) throw se;
      Alert.alert(
        editing ? "Exam updated" : "Exam created",
        editing
          ? "The exam details have been updated."
          : "The exam is ready. You can add marks when the exam is completed.",
        [
          {
            text: "View exams",
            onPress: () =>
              router.replace(
                (role === "owner" ? "/exams" : "/teacher/exams") as never,
              ),
          },
        ],
      );
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      Alert.alert("Unable to save exam", message);
    } finally {
      setSaving(false);
    }
  };
  const saveMarks = async () => {
    if (!member || !examId || saving) return;
    setSaving(true);
    setError("");
    try {
      const { data: examSub, error: ese } = await supabase
        .from("institute_exam_subjects")
        .select("subject_id,full_marks,pass_marks")
        .eq("exam_id", examId)
        .eq("subject_id", marksSubjectId)
        .eq("institute_id", member.institute_id)
        .single();
      if (ese) throw ese;
      const payload = markRows.map((r) => {
        const secured = r.absent ? 0 : Number(r.secured_marks);
        if (
          !r.absent &&
          (r.secured_marks.trim() === "" ||
            !Number.isFinite(secured) ||
            secured < 0 ||
            secured > Number(examSub.full_marks))
        )
          throw new Error(
            `Enter valid marks for ${r.student_name} (0–${examSub.full_marks}).`,
          );
        return {
          institute_id: member.institute_id,
          exam_id: examId,
          subject_id: marksSubjectId,
          student_id: r.student_id,
          full_marks: Number(examSub.full_marks),
          secured_marks: r.absent ? 0 : secured,
          is_absent: r.absent,
          updated_at: new Date().toISOString(),
        };
      });
      // Upsert uses the unique key (exam_id, subject_id, student_id).
      const { error: e } = await supabase
        .from("institute_exam_marks")
        .upsert(payload, {
          onConflict: "exam_id,subject_id,student_id",
        });
      if (e) throw e;
      Alert.alert(
        "Marks saved",
        "Student marks have been saved successfully.",
        [
          {
            text: "Back to exams",
            onPress: () =>
              router.replace(
                (role === "owner" ? "/exams" : "/teacher/exams") as never,
              ),
          },
        ],
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const shareMarksheetPdf = async () => {
    if (!marksheetPdfUri) { Alert.alert("PDF not ready", "Generate the marksheet PDF first."); return; }
    try {
      const Sharing = await import("expo-sharing");
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device does not provide a compatible share sheet.");
        return;
      }
      await Sharing.shareAsync(marksheetPdfUri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Save or share marksheet PDF" });
    } catch (e) { Alert.alert("Unable to share PDF", errorMessage(e)); }
  };

  const generateMarksheet = async () => {
    if (!member || !examId) return;
    setSaving(true);
    setError("");
    try {
      const { data: exam, error: ee } = await supabase
        .from("institute_exams")
        .select("*")
        .eq("id", examId)
        .eq("institute_id", member.institute_id)
        .single();
      if (ee) throw ee;
      const { data: subs, error: se } = await supabase
        .from("institute_exam_subjects")
        .select("*")
        .eq("exam_id", examId)
        .eq("institute_id", member.institute_id);
      if (se) throw se;
      const { data: students, error: ste } = await supabase
        .from("institute_students")
        .select("id,full_name,roll_number,class_id")
        .eq("institute_id", member.institute_id)
        .eq("class_id", exam.class_id)
        .eq("status", "active")
        .order("roll_number");
      if (ste) throw ste;
      const { data: marks, error: me } = await supabase
        .from("institute_exam_marks")
        .select("*")
        .eq("exam_id", examId)
        .eq("institute_id", member.institute_id);
      if (me) throw me;
      const className =
        classes.find((x) => x.id === exam.class_id)?.name ?? "Class";
      const esc = (value: unknown) => String(value ?? "—")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

      // Institute branding is optional. If the project uses a different schema,
      // the PDF still renders a clean typographic logo instead of failing.
      let instituteName = "GYANDEEP ACADEMY";
      let instituteLogoUrl = "";
      let instituteAddress = "";
      let institutePhone = "";
      try {
        const { data: institute } = await supabase
          .from("institutes")
          .select("*")
          .eq("id", member.institute_id)
          .maybeSingle();
        if (institute) {
          instituteName = institute.name || institute.institute_name || instituteName;
          instituteLogoUrl = institute.logo_url || institute.logo || institute.logo_uri || "";
          instituteAddress = institute.address || institute.full_address || "";
          institutePhone = institute.phone || institute.phone_number || "";
        }
      } catch (_) { /* branding lookup is best-effort */ }

      // Resolve assigned teachers for this class and exam subjects.
      const teacherBySubject = new Map<string, string[]>();
      try {
        const subjectIds = (subs ?? []).map((sub: any) => sub.subject_id).filter(Boolean);
        const { data: timetable } = await supabase
          .from("institute_timetable_entries")
          .select("class_id,subject_id,teacher_id")
          .eq("institute_id", member.institute_id)
          .eq("class_id", exam.class_id)
          .in("subject_id", subjectIds);
        const staffIds = [...new Set((timetable ?? []).map((row: any) => row.teacher_id).filter(Boolean))];
        if (staffIds.length) {
          const { data: staff } = await supabase
            .from("institute_team_members")
            .select("staff_id,full_name,role,is_active")
            .eq("institute_id", member.institute_id)
            .in("staff_id", staffIds)
            .eq("is_active", true);
          const staffMap = new Map((staff ?? []).map((row: any) => [row.staff_id, row.full_name]));
          for (const row of timetable ?? []) {
            const teacherName = staffMap.get((row as any).teacher_id);
            if (!teacherName) continue;
            const list = teacherBySubject.get((row as any).subject_id) ?? [];
            if (!list.includes(String(teacherName))) list.push(String(teacherName));
            teacherBySubject.set((row as any).subject_id, list);
          }
        }
      } catch (_) { /* missing assignment data should not prevent PDF creation */ }

      const subjectHeaders = (subs ?? []).map((sub: any) =>
        `<th>${esc(sub.subject_name)}<small>Full: ${esc(sub.full_marks)} · Pass: ${esc(sub.pass_marks)}</small></th>`
      ).join("");
      const studentRows = (students ?? []).map((st: any, index: number) => {
        const cells = (subs ?? []).map((sub: any) => {
          const mark = (marks ?? []).find((x: any) => x.student_id === st.id && x.subject_id === sub.subject_id);
          const score = mark ? (mark.is_absent ? "AB" : esc(mark.secured_marks)) : "—";
          return `<td class="score">${score}<span class="denom"> / ${esc(sub.full_marks)}</span></td>`;
        }).join("");
        const total = (subs ?? []).reduce((sum: number, sub: any) => {
          const mark = (marks ?? []).find((x: any) => x.student_id === st.id && x.subject_id === sub.subject_id);
          return sum + (mark && !mark.is_absent ? Number(mark.secured_marks) || 0 : 0);
        }, 0);
        const max = (subs ?? []).reduce((sum: number, sub: any) => sum + Number(sub.full_marks || 0), 0);
        const allSubjectsPassed = (subs ?? []).length > 0 && (subs ?? []).every((sub: any) => {
          const mark = (marks ?? []).find((x: any) => x.student_id === st.id && x.subject_id === sub.subject_id);
          return Boolean(mark) && !mark.is_absent && Number(mark.secured_marks) >= Number(sub.pass_marks);
        });
        const result = allSubjectsPassed ? "PASS" : "NEEDS REVIEW";
        return `<tr><td class="serial">${index + 1}</td><td>${esc(st.roll_number)}</td><td class="student">${esc(st.full_name)}</td>${cells}<td class="total">${total}<span class="denom"> / ${max}</span></td><td class="result ${allSubjectsPassed ? "pass" : "review"}">${result}</td></tr>`;
      }).join("");
      const totalMax = (subs ?? []).reduce((sum: number, sub: any) => sum + Number(sub.full_marks || 0), 0);
      const logoMarkup = instituteLogoUrl
        ? `<img class="logo" src="${esc(instituteLogoUrl)}" alt="Institute logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/><div class="logo-fallback" style="display:none">GD</div>`
        : `<div class="logo-fallback">GD</div>`;
      const subjectSignatures = (subs ?? []).map((sub: any) => {
        const teachers = teacherBySubject.get(sub.subject_id) ?? [];
        return `<div class="signature subject-sign"><div class="sign-line"></div><strong>${esc(teachers.length ? teachers.join(", ") : "Assigned subject teacher")}</strong><span>${esc(sub.subject_name)} Teacher</span></div>`;
      }).join("");
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      @page{size:A4 portrait;margin:12mm 10mm 14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1d2d49;margin:0;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{width:100%;margin:0 auto}.topbar{height:7px;background:#1d3761;margin-bottom:15px}.brand{display:flex;align-items:center;gap:14px;border-bottom:2px solid #1d3761;padding-bottom:12px}.logo,.logo-fallback{width:68px;height:68px;object-fit:contain;border:1px solid #dce4ef;border-radius:10px;padding:4px}.logo-fallback{display:flex;align-items:center;justify-content:center;background:#1d3761;color:#fff;font-size:23px;font-weight:800;letter-spacing:-1px}.brand-copy{flex:1}.institute{font-size:22px;font-weight:800;letter-spacing:.5px;color:#1d3761;margin:0 0 5px;text-transform:uppercase}.address{font-size:9px;color:#68768b;margin:2px 0}.doc-label{display:inline-block;margin-top:6px;background:#eaf1fb;color:#244c80;border-radius:3px;padding:5px 9px;font-weight:700;font-size:10px;letter-spacing:1.3px}.title-row{display:flex;justify-content:space-between;align-items:flex-end;margin:17px 0 10px}.exam-title{font-size:17px;font-weight:800;margin:0 0 4px;color:#182c4c}.muted{color:#68768b}.ref{border:1px solid #dce4ef;padding:7px 9px;border-radius:5px;text-align:right;font-size:9px}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:12px 0 14px}.meta-item{border:1px solid #dce4ef;border-radius:5px;padding:8px;background:#fbfcfe;min-height:42px}.meta-label{font-size:8px;color:#718096;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px}.meta-value{font-weight:700;font-size:10px;color:#253b5d}.section-heading{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;margin:16px 0 7px;color:#1d3761}.table-wrap{width:100%}table{width:100%;border-collapse:collapse;table-layout:auto;font-size:8.5px}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#1d3761;color:#fff;text-align:center;padding:8px 5px;border:1px solid #1d3761;font-weight:700}th small{display:block;font-weight:400;font-size:7px;margin-top:4px;color:#e0e9f6}td{padding:7px 5px;border:1px solid #d9e1eb;text-align:center;vertical-align:middle}tbody tr:nth-child(even){background:#f4f7fb}.serial{color:#718096;width:24px}.student{text-align:left;font-weight:700;min-width:100px}.score,.total{white-space:nowrap}.denom{color:#8490a2;font-size:7px}.total{font-weight:800;background:#eef3fa}.result{font-size:7.5px;font-weight:800;letter-spacing:.3px}.pass{color:#13765e}.review{color:#9b6420}.summary{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}.summary-box{border:1px solid #dce4ef;border-radius:5px;padding:8px 12px;min-width:100px}.summary-label{font-size:8px;color:#718096;text-transform:uppercase}.summary-value{font-size:13px;font-weight:800;margin-top:4px;color:#1d3761}.note{margin-top:12px;padding:8px 10px;background:#f4f7fb;border-left:3px solid #7c9cc8;color:#596a82;font-size:8px;line-height:1.5}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:38px;page-break-inside:avoid}.signature{text-align:center;min-width:0}.sign-line{border-top:1px solid #65758b;height:8px;margin-bottom:5px}.signature strong{display:block;font-size:9px;color:#1d2d49;line-height:1.3}.signature span{display:block;font-size:8px;color:#68768b;margin-top:3px}.subject-signs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:22px;page-break-inside:avoid}.subject-sign{margin-top:14px}.footer{border-top:1px solid #dce4ef;margin-top:24px;padding-top:8px;display:flex;justify-content:space-between;color:#8a95a6;font-size:7.5px}.watermark{position:fixed;bottom:0;left:0;right:0;text-align:center;color:#d0d8e4;font-size:7px}@media print{body{width:auto}.sheet{width:auto}.topbar{break-after:avoid}}</style></head><body><div class="sheet"><div class="topbar"></div><header class="brand">${logoMarkup}<div class="brand-copy"><h1 class="institute">${esc(instituteName)}</h1>${instituteAddress ? `<p class="address">${esc(instituteAddress)}</p>` : ""}${institutePhone ? `<p class="address">Contact: ${esc(institutePhone)}</p>` : ""}<div class="doc-label">OFFICIAL EXAMINATION MARKSHEET</div></div></header><div class="title-row"><div><h2 class="exam-title">${esc(exam.name)}</h2><div class="muted">Academic performance record</div></div><div class="ref"><b>MARKSHEET</b><br><span class="muted">Generated ${esc(new Date().toLocaleDateString("en-IN"))}</span></div></div><div class="meta"><div class="meta-item"><div class="meta-label">Class / Section</div><div class="meta-value">${esc(className)}</div></div><div class="meta-item"><div class="meta-label">Examination</div><div class="meta-value">${esc(exam.exam_type)}</div></div><div class="meta-item"><div class="meta-label">Exam date</div><div class="meta-value">${esc(prettyDate(exam.exam_date))}</div></div><div class="meta-item"><div class="meta-label">Subjects</div><div class="meta-value">${(subs ?? []).length} · ${totalMax} total marks</div></div></div><div class="section-heading">Student-wise result statement</div><div class="table-wrap"><table><thead><tr><th>#</th><th>Roll no.</th><th>Student name</th>${subjectHeaders}<th>Total</th><th>Result</th></tr></thead><tbody>${studentRows}</tbody></table></div><div class="note">Result is calculated using the pass marks configured for each subject. “AB” indicates absent; a dash indicates marks have not been entered. Please verify the entries before issuing the official copy.</div><div class="section-heading">Verification & signatures</div><div class="signatures"><div class="signature"><div class="sign-line"></div><strong>Class Teacher</strong><span>${esc(className)} · Signature</span></div><div class="signature"><div class="sign-line"></div><strong>Examination In-charge</strong><span>Signature & date</span></div><div class="signature"><div class="sign-line"></div><strong>Principal / Institute Owner</strong><span>Authorized signature</span></div></div><div class="section-heading">Subject teacher verification</div><div class="subject-signs">${subjectSignatures}</div><div class="footer"><span>${esc(instituteName)} · Confidential student record</span><span>Generated digitally by GyanDeep Academy</span></div></div></body></html>`;
      if (!(subs ?? []).length) {
        Alert.alert("No subjects found", "Add at least one subject to this exam before generating the marksheet.");
        return;
      }
      if (!(students ?? []).length) {
        Alert.alert("No active students", "There are no active students in this exam's class.");
        return;
      }

      // Generate a PDF and persist it by writing the returned base64 bytes.
      // This avoids Android's temporary Print cache URI permission problem.
      const Print = await import("expo-print");
      const Sharing = await import("expo-sharing");
      const FileSystem = await import("expo-file-system/legacy");
      const file = await Print.printToFileAsync({ html, base64: true });
      const safeName = String(exam.name || "exam-marksheet")
        .replace(/[^a-z0-9-_]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "exam-marksheet";
      const directory = FileSystem.documentDirectory;
      if (!directory) throw new Error("The app document directory is unavailable. Please rebuild and reopen the app.");
      const destination = `${directory}${safeName}-${Date.now()}.pdf`;
      if (!file.base64) throw new Error("PDF generation did not return file data. Please try again.");
      await FileSystem.writeAsStringAsync(destination, file.base64, { encoding: FileSystem.EncodingType.Base64 });
      setMarksheetHtml(html);
      setMarksheetPdfUri(destination);
      setMarksheetPdfName(`${safeName}.pdf`);
      setMarksheetPreviewOpen(true);
      Alert.alert("PDF ready", "Your marksheet PDF has been generated. Preview it, then share or save it to your device.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <View style={[s.header, { paddingTop: Math.max(insets.top, 8) + 8 }]}>
      <TouchableOpacity onPress={goBack} style={s.back}>
        <Feather name="arrow-left" size={21} color={C.navy} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>{title}</Text>
        <Text style={s.headerSub}>
          {role === "owner"
            ? "Institute exam management"
            : "Your assigned classes and subjects"}
        </Text>
      </View>
      {mode === "list" && (
        <TouchableOpacity
          onPress={() =>
            router.push(
              (role === "owner"
                ? "/exams/create"
                : "/teacher/exams/create") as never,
            )
          }
          style={s.addIcon}
        >
          <Feather name="plus" size={21} color={C.white} />
        </TouchableOpacity>
      )}
    </View>
  );
  const frame = (children: React.ReactNode) => (
    <View style={s.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      {Platform.OS === "android" && pickerKind ? (
        <DateTimePicker value={pickerDraft} mode={pickerKind} display="default" onChange={onNativePickerChange}
          minimumDate={pickerKind === "date" ? new Date(new Date().setHours(0, 0, 0, 0)) : undefined} />
      ) : null}
      <Modal visible={Platform.OS === "ios" && !!pickerKind} transparent animationType="fade" onRequestClose={() => setPickerKind(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{pickerKind === "date" ? "Choose exam date" : "Choose start time"}</Text>
            {pickerKind ? <DateTimePicker value={pickerDraft} mode={pickerKind} display="spinner" onChange={onNativePickerChange}
              minimumDate={pickerKind === "date" ? new Date(new Date().setHours(0, 0, 0, 0)) : undefined} /> : null}
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalAction, s.modalCancel]} onPress={() => setPickerKind(null)}><Text style={s.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[s.modalAction, s.modalConfirm]} onPress={commitPicker}><Text style={s.modalConfirmText}>Confirm</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={durationMenuOpen} transparent animationType="fade" onRequestClose={() => setDurationMenuOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Select exam duration</Text>
            {DURATIONS.map((item) => (
              <TouchableOpacity key={item.value} style={[s.durationOption, duration === item.value && s.durationOptionSelected]} onPress={() => { setDuration(item.value); setDurationMenuOpen(false); }}>
                <Text style={[s.durationOptionText, duration === item.value && s.durationOptionTextSelected]}>{item.label}</Text>
                {duration === item.value ? <Feather name="check-circle" size={18} color={C.blue} /> : null}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.modalAction, s.modalCancel, { marginTop: 10, alignSelf: "stretch" }]} onPress={() => setDurationMenuOpen(false)}><Text style={s.modalCancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      {header}
      {children}
    </View>
  );
  if (loading)
    return frame(
      <View style={s.center}>
        <ActivityIndicator color={C.blue} size="large" />
        <Text style={s.muted}>Loading exam workspace…</Text>
      </View>,
    );
  if (error && !member)
    return frame(
      <View style={s.center}>
        <Feather name="alert-circle" size={34} color={C.red} />
        <Text style={s.error}>{error}</Text>
        <Button
          label="Try again"
          onPress={() => {
            setLoading(true);
            void loadBase();
          }}
        />
      </View>,
    );

  if (mode === "list")
    return frame(
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadBase();
              // loadExams is triggered by the member/classes effect after refreshed state updates.
            }}
            tintColor={C.blue}
          />
        }
      >
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Feather name="clipboard" size={25} color={C.white} />
          </View>
          <Text style={s.heroTitle}>Exam centre</Text>
          <Text style={s.heroText}>
            {role === "owner"
              ? "Create exams for any subject and track institute-wide marks."
              : "Create exams for subjects assigned to you and manage student marks."}
          </Text>
          <View style={s.stats}>
            <View>
              <Text style={s.statNumber}>{exams.length}</Text>
              <Text style={s.statLabel}>Exams</Text>
            </View>
            <View>
              <Text style={s.statNumber}>
                {exams.filter((x) => x.status === "published").length}
              </Text>
              <Text style={s.statLabel}>Published</Text>
            </View>
            <View>
              <Text style={s.statNumber}>
                {exams.filter((x) => (x.marks_count ?? 0) > 0).length}
              </Text>
              <Text style={s.statLabel}>With marks</Text>
            </View>
          </View>
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}
        {exams.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Feather name="calendar" size={25} color={C.blue} />
            </View>
            <Text style={s.emptyTitle}>No exams yet</Text>
            <Text style={s.muted}>Create your first exam to get started.</Text>
            <Button
              label="Create exam"
              icon="plus"
              onPress={() =>
                router.push(
                  (role === "owner"
                    ? "/exams/create"
                    : "/teacher/exams/create") as never,
                )
              }
            />
          </View>
        ) : (
          exams.map((ex) => (
            <View key={ex.id} style={s.examCard}>
              <View style={s.examTop}>
                <View style={s.typePill}>
                  <Text style={s.typeText}>{ex.exam_type}</Text>
                </View>
                <Text style={s.dateText}>{prettyDate(ex.exam_date)}</Text>
              </View>
              <Text style={s.examName}>{ex.name}</Text>
              <Text style={s.classLabel}>
                {ex.class_name} · {displayDuration(ex.duration_minutes)}
              </Text>
              <View style={s.subjectWrap}>
                {(ex.subjects ?? []).map((sub) => (
                  <View key={sub.subject_id} style={s.subjectPill}>
                    <Text style={s.subjectPillText}>
                      {sub.subject_name} · {sub.full_marks} marks
                    </Text>
                  </View>
                ))}
              </View>
              {role === "owner" && (
                <Text style={s.createdBy}>
                  Created by {ex.created_by_name || "Institute owner"}
                </Text>
              )}
              {ex.description ? (
                <Text style={s.description}>{ex.description}</Text>
              ) : null}
              <View style={s.cardActions}>
                <TouchableOpacity
                  style={s.action}
                  onPress={() =>
                    router.push({
                      pathname: (role === "owner"
                        ? "/exams/marks"
                        : "/teacher/exams/marks") as never,
                      params: { examId: ex.id },
                    })
                  }
                >
                  <Feather name="edit-3" size={16} color={C.blue} />
                  <Text style={s.actionText}>Add marks</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.action}
                  onPress={() =>
                    router.push({
                      pathname: (role === "owner"
                        ? "/exams/create"
                        : "/teacher/exams/create") as never,
                      params: { examId: ex.id, edit: "1" },
                    })
                  }
                >
                  <Feather name="edit" size={16} color={C.purple} />
                  <Text style={[s.actionText, { color: C.purple }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.action}
                  onPress={() =>
                    router.push({
                      pathname: (role === "owner"
                        ? "/exams/marksheet"
                        : "/teacher/exams/marksheet") as never,
                      params: { examId: ex.id },
                    })
                  }
                >
                  <Feather name="file-text" size={16} color={C.green} />
                  <Text style={[s.actionText, { color: C.green }]}>
                    Marksheet
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>,
    );

  if (mode === "create")
    return frame(
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        <View style={s.stepper}>
          <View style={[s.stepDot, step >= 1 && s.stepDotActive]}>
            <Text style={[s.stepDotText, step >= 1 && { color: C.white }]}>
              1
            </Text>
          </View>
          <View
            style={[s.stepLine, step >= 2 && { backgroundColor: C.blue }]}
          />
          <View style={[s.stepDot, step >= 2 && s.stepDotActive]}>
            <Text style={[s.stepDotText, step >= 2 && { color: C.white }]}>
              2
            </Text>
          </View>
          <View
            style={[s.stepLine, step >= 3 && { backgroundColor: C.blue }]}
          />
          <View style={[s.stepDot, step >= 3 && s.stepDotActive]}>
            <Text style={[s.stepDotText, step >= 3 && { color: C.white }]}>
              3
            </Text>
          </View>
        </View>
        <Text style={s.sectionTitle}>
          {step === 1
            ? "Exam details"
            : step === 2
              ? "Class & subjects"
              : "Review exam"}
        </Text>
        <Text style={s.sectionSub}>
          {step === 1
            ? "Set the schedule and basic information."
            : step === 2
              ? "Choose the class and configure subject marks."
              : "Check everything before creating the exam."}
        </Text>
        {step === 1 ? (
          <View style={s.panel}>
            <Field label="Exam name">
              <Input
                value={name}
                onChangeText={setName}
                placeholder="e.g. Mathematics Monthly Test"
              />
            </Field>
            <Field label="Exam type">
              <View style={s.choices}>
                {TYPES.map((t) => (
                  <Choice
                    key={t}
                    label={t}
                    selected={examType === t}
                    onPress={() => setExamType(t)}
                  />
                ))}
              </View>
            </Field>
            <Field label="Exam date">
              <TouchableOpacity style={s.pickerField} onPress={() => openPicker("date")} accessibilityRole="button">
                <Feather name="calendar" size={18} color={C.blue} />
                <Text style={s.pickerFieldText}>{examDate ? prettyDate(examDate) : "Choose exam date"}</Text>
                <Feather name="chevron-down" size={18} color={C.muted} />
              </TouchableOpacity>
            </Field>
            <Field label="Start time">
              <TouchableOpacity style={s.pickerField} onPress={() => openPicker("time")} accessibilityRole="button">
                <Feather name="clock" size={18} color={C.blue} />
                <Text style={s.pickerFieldText}>{startTime || "Choose start time"}</Text>
                <Feather name="chevron-down" size={18} color={C.muted} />
              </TouchableOpacity>
            </Field>
            <Field label="Duration">
              <TouchableOpacity style={s.pickerField} onPress={() => setDurationMenuOpen(true)} accessibilityRole="button">
                <Feather name="clock" size={18} color={C.blue} />
                <Text style={s.pickerFieldText}>{displayDuration(duration)}</Text>
                <Feather name="chevron-down" size={18} color={C.muted} />
              </TouchableOpacity>
            </Field>
            <Field label="Description (optional)">
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder="Instructions or syllabus details"
                multiline
              />
            </Field>
          </View>
        ) : null}
        {step === 2 ? (
          <View style={s.panel}>
            <Field label="Select class">
              <View style={s.choices}>
                {classes.map((c) => (
                  <Choice
                    key={c.id}
                    label={c.name}
                    selected={classId === c.id}
                    onPress={() => {
                      if (classId !== c.id) {
                        setClassId(c.id);
                        setExamSubjects([]);
                        setSelectedSubjectId("");
                      }
                    }}
                  />
                ))}
              </View>
            </Field>
            <Field label="Add subject">
              <View style={s.choices}>
                {availableSubjects
                  .filter(
                    (sub) => !examSubjects.some((x) => x.subject_id === sub.id),
                  )
                  .map((sub) => (
                    <Choice
                      key={sub.id}
                      label={sub.name}
                      selected={selectedSubjectId === sub.id}
                      onPress={() => changeExamSubject(sub.id)}
                    />
                  ))}
              </View>
              <Button
                label="Add selected subject"
                icon="plus"
                secondary
                onPress={addSubject}
                disabled={!selectedSubjectId}
              />
            </Field>
            {examSubjects.map((sub) => (
              <View key={sub.subject_id} style={s.marksConfig}>
                <View style={{ flex: 1 }}>
                  <Text style={s.marksSubjectName}>{sub.subject_name}</Text>
                  <Text style={s.mutedSmall}>Set subject-wise marks</Text>
                </View>
                <View style={s.marksInputWrap}>
                  <Text style={s.marksInputLabel}>Full</Text>
                  <TextInput
                    keyboardType="numeric"
                    value={String(sub.full_marks)}
                    onChangeText={(v) =>
                      updateSub(sub.subject_id, "full_marks", v)
                    }
                    style={s.miniInput}
                  />
                </View>
                <View style={s.marksInputWrap}>
                  <Text style={s.marksInputLabel}>Pass</Text>
                  <TextInput
                    keyboardType="numeric"
                    value={String(sub.pass_marks)}
                    onChangeText={(v) =>
                      updateSub(sub.subject_id, "pass_marks", v)
                    }
                    style={s.miniInput}
                  />
                </View>
                <TouchableOpacity
                  onPress={() =>
                    setExamSubjects((p) =>
                      p.filter((x) => x.subject_id !== sub.subject_id),
                    )
                  }
                >
                  <Feather name="x-circle" size={20} color={C.red} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        {step === 3 ? (
          <View style={s.panel}>
            <View style={s.reviewHero}>
              <Feather name="check-circle" size={28} color={C.green} />
              <Text style={s.reviewTitle}>{name || "Untitled exam"}</Text>
              <Text style={s.muted}>{examType}</Text>
            </View>
            {[
              ["Exam date", prettyDate(examDate)],
              ["Start time", startTime],
              ["Duration", displayDuration(duration)],
              [
                "Class",
                classes.find((c) => c.id === classId)?.name ?? "Not selected",
              ],
              ["Subjects", String(examSubjects.length)],
              ["Created by", member?.full_name ?? ""],
            ].map(([k, v]) => (
              <View key={k} style={s.reviewRow}>
                <Text style={s.muted}>{k}</Text>
                <Text style={s.reviewValue}>{v}</Text>
              </View>
            ))}
            {examSubjects.map((sub) => (
              <View key={sub.subject_id} style={s.reviewSubject}>
                <Text style={s.reviewValue}>{sub.subject_name}</Text>
                <Text style={s.muted}>
                  {sub.full_marks} full · {sub.pass_marks} pass
                </Text>
              </View>
            ))}
            {description ? (
              <Text style={s.description}>{description}</Text>
            ) : null}
          </View>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={s.footerButtons}>
          {step > 1 && (
            <View style={{ flex: 1 }}>
              <Button
                label="Back"
                secondary
                onPress={() => setStep((x) => x - 1)}
              />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Button
              label={
                step < 3
                  ? "Next step"
                  : saving
                    ? "Saving…"
                    : editing
                      ? "Save changes"
                      : "Create exam"
              }
              icon={step < 3 ? "arrow-right" : "check"}
              disabled={saving}
              onPress={() => {
                if (!validateStep()) return;
                if (step < 3) setStep((x) => x + 1);
                else void saveExam();
              }}
            />
          </View>
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>,
    );

  if (mode === "marks")
    return frame(
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadMarks();
            }}
          />
        }
      >
        <View style={s.heroCompact}>
          <Text style={s.heroTitle}>Enter student marks</Text>
          <Text style={s.heroText}>
            Absent students are automatically assigned zero marks and their
            score field is locked.
          </Text>
        </View>
        <Field label="Subject">
          <View style={s.choices}>
            {/* Subject labels loaded directly from the exam */}
            {examSubjects.length === 0
              ? null
              : examSubjects.map((x) => (
                  <Choice
                    key={x.subject_id}
                    label={x.subject_name}
                    selected={marksSubjectId === x.subject_id}
                    onPress={() => {
                      if (marksSubjectId !== x.subject_id) {
                        setMarkRows([]);
                        setMarksSubjectId(x.subject_id);
                      }
                    }}
                  />
                ))}
          </View>
        </Field>
        {error ? <Text style={s.error}>{error}</Text> : null}
        {markRows.length === 0 ? (
          <View style={s.empty}>
            <Feather name="users" size={28} color={C.muted} />
            <Text style={s.muted}>
              No active students found for this class and subject.
            </Text>
          </View>
        ) : (
          markRows.map((r, i) => (
            <View key={r.student_id} style={s.studentMarkCard}>
              <View style={s.studentAvatar}>
                <Text style={s.avatarText}>
                  {r.student_name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((x) => x[0])
                    .join("")
                    .toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.studentName}>{r.student_name}</Text>
                <Text style={s.mutedSmall}>
                  Roll no. {r.roll_number ?? "—"} · Full marks {r.full_marks}
                </Text>
                <View style={s.markControls}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.marksInputLabel}>Secured marks</Text>
                    <TextInput
                      keyboardType="numeric"
                      editable={!r.absent}
                      value={r.absent ? "0" : r.secured_marks}
                      onChangeText={(v) =>
                        setMarkRows((p) =>
                          p.map((x, j) =>
                            i === j ? { ...x, secured_marks: v } : x,
                          ),
                        )
                      }
                      placeholder={`0–${r.full_marks}`}
                      style={[
                        s.input,
                        s.securedInput,
                        r.absent && {
                          backgroundColor: "#F0F2F5",
                          color: C.muted,
                        },
                      ]}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      setMarkRows((p) =>
                        p.map((x, j) =>
                          i === j
                            ? {
                                ...x,
                                absent: !x.absent,
                                secured_marks: !x.absent ? "0" : "",
                              }
                            : x,
                        ),
                      )
                    }
                    style={[s.absentToggle, r.absent && s.absentToggleOn]}
                  >
                    <Feather
                      name={r.absent ? "check-square" : "square"}
                      size={17}
                      color={r.absent ? C.white : C.muted}
                    />
                    <Text
                      style={[s.absentText, r.absent && { color: C.white }]}
                    >
                      Absent
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
        <View style={{ marginTop: 14 }}>
          <Button
            label={saving ? "Saving marks…" : "Save all marks"}
            icon="save"
            disabled={saving || !markRows.length}
            onPress={() => void saveMarks()}
          />
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>,
    );

  return frame(
    <ScrollView contentContainerStyle={s.content}>
      {marksheetPdfUri ? (
        <View style={s.pdfReadyCard}>
          <Feather name="file-text" size={22} color={C.green} />
          <View style={{ flex: 1 }}>
            <Text style={s.pdfReadyTitle}>PDF generated successfully</Text>
            <Text style={s.mutedSmall}>{marksheetPdfName}</Text>
          </View>
          <TouchableOpacity onPress={() => setMarksheetPreviewOpen(true)} style={s.smallAction}>
            <Text style={s.smallActionText}>Preview</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={s.hero}>
        <View style={s.heroIcon}>
          <Feather name="file-text" size={25} color={C.white} />
        </View>
        <Text style={s.heroTitle}>Generate marksheet PDF</Text>
        <Text style={s.heroText}>
          Create a printable subject-wise marksheet for all active students in
          this exam's class. Saved marks are included; unentered marks show as a
          dash.
        </Text>
      </View>
      <View style={s.panel}>
        <Text style={s.sectionTitle}>Included in the PDF</Text>
        {[
          "Exam name, type, and date",
          "Class and student roll numbers",
          "Subject-wise secured and full marks",
          "Total marks for each student",
          "Signature lines for class teacher and owner",
        ].map((t) => (
          <View key={t} style={s.bullet}>
            <Feather name="check-circle" size={17} color={C.green} />
            <Text style={s.bulletText}>{t}</Text>
          </View>
        ))}
        <Text style={s.mutedSmall}>
          Use Share to save the PDF to your device or send it through a
          supported app.
        </Text>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {!marksheetPdfUri ? (
        <Button label={saving ? "Generating PDF…" : "Generate PDF"} icon="file-text" disabled={saving} onPress={() => void generateMarksheet()} />
      ) : (
        <View style={{ gap: 10 }}>
          <Button label="Preview PDF" icon="eye" onPress={() => setMarksheetPreviewOpen(true)} />
          <Button label="Share / Download PDF" icon="share-2" onPress={() => void shareMarksheetPdf()} />
          <Button label="Generate again" icon="refresh-cw" secondary onPress={() => void generateMarksheet()} disabled={saving} />
        </View>
      )}
      <Modal visible={marksheetPreviewOpen} animationType="slide" onRequestClose={() => setMarksheetPreviewOpen(false)}>
        <View style={[s.screen, { paddingTop: Math.max(insets.top, 8) }]}>
          <View style={s.previewHeader}>
            <TouchableOpacity onPress={() => setMarksheetPreviewOpen(false)} style={s.back}><Feather name="x" size={21} color={C.navy} /></TouchableOpacity>
            <View style={{ flex: 1 }}><Text style={s.headerTitle}>Marksheet Preview</Text><Text style={s.headerSub}>{marksheetPdfName}</Text></View>
          </View>
          <WebView originWhitelist={["*"]} source={{ html: marksheetHtml }} style={{ flex: 1, backgroundColor: "#fff" }} />
          <View style={s.previewActions}>
            <TouchableOpacity style={s.previewActionSecondary} onPress={() => setMarksheetPreviewOpen(false)}><Text style={s.previewActionSecondaryText}>Close</Text></TouchableOpacity>
            <TouchableOpacity style={s.previewActionPrimary} onPress={() => void shareMarksheetPdf()}><Feather name="share-2" size={17} color={C.white} /><Text style={s.previewActionPrimaryText}>Share / Save PDF</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={{ height: 30 }} />
    </ScrollView>,
  );
}

const s = StyleSheet.create({
  pickerField: { minHeight: 50, borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: C.white, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  pickerFieldText: { flex: 1, color: C.text, fontSize: 14, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 28, 48, 0.45)", justifyContent: "center", alignItems: "center", padding: 22 },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: C.white, borderRadius: 20, padding: 18 },
  modalTitle: { fontSize: 17, fontWeight: "900", color: C.navy, marginBottom: 12 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  modalAction: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  modalCancel: { backgroundColor: C.pale },
  modalConfirm: { backgroundColor: C.blue },
  modalCancelText: { color: C.navy, fontWeight: "800" },
  modalConfirmText: { color: C.white, fontWeight: "800" },
  durationOption: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, marginTop: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  durationOptionSelected: { borderColor: C.blue, backgroundColor: C.pale },
  durationOptionText: { color: C.text, fontWeight: "700" },
  durationOptionTextSelected: { color: C.blue, fontWeight: "900" },
  pdfReadyCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 14 },
  pdfReadyTitle: { color: C.navy, fontWeight: "900", fontSize: 14 },
  smallAction: { backgroundColor: C.pale, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9 },
  smallActionText: { color: C.blue, fontWeight: "900" },
  previewHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 12, gap: 12, backgroundColor: C.white },
  previewActions: { flexDirection: "row", gap: 10, padding: 14, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border },
  previewActionSecondary: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, backgroundColor: C.pale, alignItems: "center", justifyContent: "center" },
  previewActionSecondaryText: { color: C.navy, fontWeight: "900" },
  previewActionPrimary: { flex: 1, flexDirection: "row", gap: 9, minHeight: 48, borderRadius: 12, backgroundColor: C.blue, alignItems: "center", justifyContent: "center" },
  previewActionPrimaryText: { color: C.white, fontWeight: "900" },
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 14,
    gap: 12,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: C.navy },
  headerSub: { fontSize: 12, color: C.muted, marginTop: 3 },
  addIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 18, paddingBottom: 20, gap: 14 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  hero: {
    backgroundColor: C.navy,
    borderRadius: 24,
    padding: 20,
    gap: 8,
    overflow: "hidden",
  },
  heroCompact: {
    backgroundColor: C.navy,
    borderRadius: 20,
    padding: 18,
    gap: 7,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  heroTitle: { fontSize: 23, fontWeight: "900", color: C.white },
  heroText: { fontSize: 13, lineHeight: 19, color: "#D8E3F4" },
  stats: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    marginTop: 12,
    paddingTop: 14,
    justifyContent: "space-between",
  },
  statNumber: { fontSize: 22, fontWeight: "900", color: C.white },
  statLabel: { fontSize: 11, color: "#C4D3E9", marginTop: 3 },
  empty: {
    backgroundColor: C.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: C.navy },
  muted: { fontSize: 13, color: C.muted, lineHeight: 19 },
  mutedSmall: { fontSize: 11, color: C.muted, marginTop: 3 },
  examCard: {
    backgroundColor: C.white,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 9,
  },
  examTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typePill: {
    backgroundColor: C.pale,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  typeText: { color: C.blue, fontWeight: "800", fontSize: 11 },
  dateText: { fontSize: 12, color: C.muted, fontWeight: "700" },
  examName: { fontSize: 18, fontWeight: "900", color: C.navy },
  classLabel: { fontSize: 13, color: C.muted },
  subjectWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  subjectPill: {
    backgroundColor: "#F5F7FA",
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  subjectPillText: { fontSize: 11, color: C.text, fontWeight: "700" },
  createdBy: { fontSize: 11, color: C.muted, fontStyle: "italic" },
  description: { fontSize: 12, color: C.muted, lineHeight: 18 },
  cardActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 10,
    justifyContent: "space-between",
    gap: 5,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  actionText: { fontSize: 12, fontWeight: "800", color: C.blue },
  button: {
    minHeight: 48,
    backgroundColor: C.blue,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
  },
  buttonSecondary: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  buttonText: { fontSize: 14, fontWeight: "900", color: C.white },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E1E7F0",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { backgroundColor: C.blue },
  stepDotText: { fontSize: 13, fontWeight: "900", color: C.muted },
  stepLine: {
    width: 55,
    height: 3,
    backgroundColor: "#E1E7F0",
    marginHorizontal: 7,
    borderRadius: 2,
  },
  sectionTitle: { fontSize: 20, fontWeight: "900", color: C.navy },
  sectionSub: { fontSize: 13, color: C.muted, lineHeight: 19, marginTop: -8 },
  panel: {
    backgroundColor: C.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 14,
  },
  field: { gap: 7 },
  label: { fontSize: 12, fontWeight: "900", color: C.text },
  input: {
    minHeight: 47,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: C.text,
    backgroundColor: "#FBFCFE",
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  choiceSelected: { borderColor: C.blue, backgroundColor: C.pale },
  choiceText: { fontSize: 12, color: C.text, fontWeight: "700" },
  marksConfig: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  marksSubjectName: { fontSize: 13, fontWeight: "900", color: C.navy },
  marksInputWrap: { width: 58, gap: 4 },
  marksInputLabel: { fontSize: 10, color: C.muted, fontWeight: "800" },
  miniInput: {
    height: 38,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    textAlign: "center",
    fontSize: 13,
    color: C.text,
    padding: 4,
  },
  footerButtons: { flexDirection: "row", gap: 10 },
  reviewHero: { alignItems: "center", paddingVertical: 10, gap: 6 },
  reviewTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: C.navy,
    textAlign: "center",
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingVertical: 10,
    gap: 15,
  },
  reviewValue: {
    fontSize: 13,
    fontWeight: "800",
    color: C.text,
    textAlign: "right",
    flexShrink: 1,
  },
  reviewSubject: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F7F9FC",
    borderRadius: 11,
    padding: 10,
  },
  error: { color: C.red, fontSize: 13, lineHeight: 19 },
  studentMarkCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 13,
    flexDirection: "row",
    gap: 11,
  },
  studentAvatar: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "900", color: C.blue },
  studentName: { fontSize: 14, fontWeight: "900", color: C.navy },
  markControls: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  securedInput: { marginTop: 5, minHeight: 41 },
  absentToggle: {
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  absentToggleOn: { backgroundColor: C.red, borderColor: C.red },
  absentText: { fontSize: 12, color: C.muted, fontWeight: "800" },
  bullet: { flexDirection: "row", alignItems: "center", gap: 9 },
  bulletText: { fontSize: 13, color: C.text, flex: 1 },
  typePillSmall: { backgroundColor: C.pale },
});
