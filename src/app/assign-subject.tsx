// src/app/assign-subject.tsx

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const GREEN = "#397D40";
const MUTED = "#7D909E";
const BORDER = "#E4EBF0";
const WHITE = "#FFFFFF";

type ClassItem = {
  id: string;
  name: string;
  institute_id: string;
};

type SubjectItem = {
  id: string;
  name: string;
  class_id: string;
  institute_id: string;
};

type TeacherItem = {
  id: string;
  full_name: string;
  phone: string | null;
  staff_type: string | null;
  status: string | null;
};

type AssignmentItem = {
  id: string;
  institute_id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  assigned_by: string | null;
};

export default function AssignSubjectScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [instituteId, setInstituteId] = useState("");
  const [userId, setUserId] = useState("");

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [search, setSearch] = useState("");

  const [showTeacherPicker, setShowTeacherPicker] = useState(false);

  const [appAlert, setAppAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AppAlertType;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  }>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const showAppAlert = (
    title: string,
    message: string,
    type: AppAlertType = "info",
    onConfirm?: () => void,
    confirmLabel = "OK",
    cancelLabel?: string
  ) => {
    setAppAlert({
      visible: true,
      title,
      message,
      type,
      onConfirm,
      confirmLabel,
      cancelLabel,
    });
  };

  const closeAppAlert = () => {
    setAppAlert((current) => ({
      ...current,
      visible: false,
    }));
  };

  const closeTeacherPicker = () => {
    Keyboard.dismiss();
    setShowTeacherPicker(false);
    setSearch("");
  };

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        showAppAlert(
          "Session expired",
          "Please sign in again.",
          "warning",
          () => router.replace("/login" as never)
        );
        return;
      }

      setUserId(user.id);

      const { data: membership, error: memberError } = await supabase
        .from("institute_members")
        .select("institute_id, role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberError) throw memberError;

      if (!membership?.institute_id) {
        throw new Error("No institute is linked to this account.");
      }

      const role = String(membership.role ?? "").toLowerCase();

      if (!["owner", "manager"].includes(role)) {
        throw new Error(
          "Only an institute owner or manager can assign subjects."
        );
      }

      const institute = membership.institute_id as string;
      setInstituteId(institute);

      const [
        classesResult,
        subjectsResult,
        teachersResult,
        assignmentsResult,
      ] = await Promise.all([
        supabase
          .from("institute_classes")
          .select("id, name, institute_id")
          .eq("institute_id", institute)
          .eq("is_active", true)
          .order("name"),

        supabase
          .from("institute_subjects")
          .select("id, name, class_id, institute_id")
          .eq("institute_id", institute)
          .order("name"),

        supabase
          .from("institute_staff")
          .select("id, full_name, phone, staff_type, status")
          .eq("institute_id", institute)
          .order("full_name"),

        supabase
          .from("institute_subject_teachers")
          .select(
            "id, institute_id, class_id, subject_id, teacher_id, assigned_by"
          )
          .eq("institute_id", institute),
      ]);

      if (classesResult.error) throw classesResult.error;
      if (subjectsResult.error) throw subjectsResult.error;
      if (teachersResult.error) throw teachersResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      const classRows = (classesResult.data ?? []) as ClassItem[];
      const subjectRows = (subjectsResult.data ?? []) as SubjectItem[];

      const teacherRows = (
        (teachersResult.data ?? []) as TeacherItem[]
      ).filter((teacher) => {
        const status = (teacher.status ?? "active")
          .trim()
          .toLowerCase();

        const type = (teacher.staff_type ?? "")
          .trim()
          .toLowerCase();

        const active =
          !["inactive", "disabled", "terminated", "left"].includes(status);

        const teaching =
          type.includes("teach") || type === "faculty";

        return active && teaching;
      });

      setClasses(classRows);
      setSubjects(subjectRows);
      setTeachers(teacherRows);
      setAssignments(
        (assignmentsResult.data ?? []) as AssignmentItem[]
      );

      setSelectedClassId((current) =>
        classRows.some((item) => item.id === current)
          ? current
          : classRows[0]?.id ?? ""
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load subject assignments.";

      showAppAlert("Could not load data", message, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const classSubjects = useMemo(
    () =>
      subjects.filter(
        (subject) => subject.class_id === selectedClassId
      ),
    [subjects, selectedClassId]
  );

  const selectedSubject = classSubjects.find(
    (subject) => subject.id === selectedSubjectId
  );

  const currentAssignment = assignments.find(
    (assignment) => assignment.subject_id === selectedSubjectId
  );

  const assignedTeacher = teachers.find(
    (teacher) => teacher.id === currentAssignment?.teacher_id
  );

  const selectedTeacher = teachers.find(
    (teacher) => teacher.id === selectedTeacherId
  );

  const visibleTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return teachers;

    return teachers.filter(
      (teacher) =>
        teacher.full_name.toLowerCase().includes(query) ||
        (teacher.phone ?? "").toLowerCase().includes(query)
    );
  }, [teachers, search]);

  const openSubject = (subject: SubjectItem) => {
    setSelectedSubjectId(subject.id);

    // Start with the current teacher selected when editing an assignment.
    const assignment = assignments.find(
      (item) => item.subject_id === subject.id
    );

    setSelectedTeacherId(assignment?.teacher_id ?? "");
    setSearch("");
    Keyboard.dismiss();
    setShowTeacherPicker(true);
  };

  const toggleTeacher = (teacherId: string) => {
    // Tapping the same teacher again deselects them.
    setSelectedTeacherId((current) =>
      current === teacherId ? "" : teacherId
    );
  };

  const handleSave = async () => {
    if (
      !instituteId ||
      !userId ||
      !selectedClassId ||
      !selectedSubjectId
    ) {
      showAppAlert(
        "Select a subject",
        "Choose a class and subject first.",
        "warning"
      );
      return;
    }

    if (!selectedTeacherId) {
      showAppAlert(
        "Select a teacher",
        "Choose a teacher before saving the assignment.",
        "warning"
      );
      return;
    }

    const teacher = teachers.find(
      (item) => item.id === selectedTeacherId
    );

    if (!teacher) {
      showAppAlert(
        "Teacher unavailable",
        "Refresh the list and select an available teacher.",
        "warning"
      );
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("institute_subject_teachers")
        .upsert(
          {
            institute_id: instituteId,
            class_id: selectedClassId,
            subject_id: selectedSubjectId,
            teacher_id: selectedTeacherId,
            assigned_by: userId,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "institute_id,subject_id",
          }
        );

      if (error) throw error;

      const subjectName = selectedSubject?.name ?? "this subject";
      const teacherName = teacher.full_name;

      closeTeacherPicker();

      await loadData(false);

      showAppAlert(
        currentAssignment ? "Teacher updated" : "Subject assigned",
        `${teacherName} ${
          currentAssignment
            ? "is now assigned to"
            : "has been assigned to"
        } ${subjectName}.`,
        "success"
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save the assignment.";

      showAppAlert(
        "Assignment failed",
        `${message}\n\nCheck the Supabase table, unique constraint, and row-level security policies.`,
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = () => {
    if (!currentAssignment || !selectedSubject) return;

    showAppAlert(
      "Unassign teacher?",
      `Remove the current teacher from ${selectedSubject.name}?`,
      "warning",
      () => {
        void performUnassign();
      },
      "Unassign",
      "Cancel"
    );
  };

  const performUnassign = async () => {
  if (!currentAssignment || !selectedSubject) return;

  setSaving(true);

  try {
    const subjectName = selectedSubject.name;
    const assignmentId = currentAssignment.id;

    // Delete the assignment and return the deleted row.
    const { data: deletedRows, error } = await supabase
      .from("institute_subject_teachers")
      .delete()
      .eq("id", assignmentId)
      .eq("institute_id", instituteId)
      .select("id");

    if (error) {
      throw error;
    }

    // A successful request does not guarantee a row was deleted.
    if (!deletedRows || deletedRows.length === 0) {
      throw new Error(
        "The assignment was not deleted. Your Supabase DELETE policy may be missing or may not allow this operation."
      );
    }

    // Remove the assignment from local state immediately.
    setAssignments((previous) =>
      previous.filter((item) => item.id !== assignmentId)
    );

    setSelectedTeacherId("");
    closeTeacherPicker();

    showAppAlert(
      "Teacher unassigned",
      `The teacher assignment for ${subjectName} has been removed.`,
      "success"
    );

    // Refresh from the database to confirm the latest state.
    await loadData(false);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to remove the assignment.";

    showAppAlert(
      "Unassign failed",
      message,
      "error"
    );
  } finally {
    setSaving(false);
  }
};

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadingText}>
          Loading classes and subjects…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={22} color={WHITE} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Assign Subject</Text>
          <Text style={styles.headerSubtitle}>
            Manage teachers class-wise
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void loadData()}
          accessibilityLabel="Refresh assignments"
        >
          <Feather name="refresh-cw" size={19} color={WHITE} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadData(false);
            }}
            colors={[GREEN]}
          />
        }
      >
        {/* Intro */}
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Feather name="book-open" size={25} color={GREEN} />
          </View>

          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>
              Subject allocation
            </Text>
            <Text style={styles.introDescription}>
              Choose a class and tap a subject to assign, change, or
              remove its teacher.
            </Text>
          </View>
        </View>

        {/* Status legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={styles.legendGreen} />
            <Text style={styles.legendText}>Assigned</Text>
          </View>

          <View style={styles.legendItem}>
            <View style={styles.legendYellow} />
            <Text style={styles.legendText}>Pending</Text>
          </View>
        </View>

        {/* Class selector */}
        <Text style={styles.sectionTitle}>1. Select class</Text>

        {classes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="layers" size={28} color={MUTED} />
            <Text style={styles.emptyTitle}>No active classes</Text>
            <Text style={styles.emptyDescription}>
              Create or activate a class before assigning subjects.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.classList}
          >
            {classes.map((item) => {
              const selected = selectedClassId === item.id;

              const count = subjects.filter(
                (subject) => subject.class_id === item.id
              ).length;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.classChip,
                    selected && styles.classChipSelected,
                  ]}
                  onPress={() => {
                    setSelectedClassId(item.id);
                    setSelectedSubjectId("");
                    setSelectedTeacherId("");
                  }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.classChipText,
                      selected && styles.classChipTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>

                  <Text
                    style={[
                      styles.classChipCount,
                      selected && styles.classChipCountSelected,
                    ]}
                  >
                    {count} {count === 1 ? "subject" : "subjects"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Subject list */}
        <View style={styles.subjectHeadingRow}>
          <Text style={styles.sectionTitle}>2. Select subject</Text>
          <Text style={styles.countLabel}>
            {classSubjects.length} total
          </Text>
        </View>

        {classes.length > 0 && classSubjects.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="book" size={28} color={MUTED} />
            <Text style={styles.emptyTitle}>
              No subjects in this class
            </Text>
            <Text style={styles.emptyDescription}>
              Add subjects from the Create Subject section first.
            </Text>

            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => router.push("/subjects" as never)}
            >
              <Feather name="plus" size={17} color={GREEN} />
              <Text style={styles.outlineButtonText}>
                Create subject
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          classSubjects.map((subject) => {
            const assignment = assignments.find(
              (item) => item.subject_id === subject.id
            );

            const teacher = teachers.find(
              (item) => item.id === assignment?.teacher_id
            );

            const isAssigned = Boolean(assignment);
            const isSelected = selectedSubjectId === subject.id;

            return (
              <TouchableOpacity
                key={subject.id}
                style={[
                  styles.subjectCard,
                  isAssigned
                    ? styles.subjectCardAssigned
                    : styles.subjectCardUnassigned,
                  isSelected && styles.subjectCardSelected,
                ]}
                onPress={() => openSubject(subject)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.subjectIcon,
                    isAssigned
                      ? styles.subjectIconAssigned
                      : styles.subjectIconUnassigned,
                  ]}
                >
                  <Feather
                    name="book-open"
                    size={20}
                    color={isAssigned ? GREEN : "#A57B19"}
                  />
                </View>

                <View style={styles.subjectCopy}>
                  <Text style={styles.subjectName}>
                    {subject.name}
                  </Text>

                  <Text style={styles.subjectTeacher} numberOfLines={1}>
                    {teacher
                      ? `Teacher: ${teacher.full_name}`
                      : assignment
                        ? "Assigned teacher is unavailable"
                        : "No teacher assigned yet"}
                  </Text>

                  <Text
                    style={[
                      styles.tapHint,
                      isAssigned
                        ? styles.tapHintAssigned
                        : styles.tapHintUnassigned,
                    ]}
                  >
                    Tap to {isAssigned ? "manage assignment" : "assign teacher"}
                  </Text>
                </View>

                <View style={styles.subjectRight}>
                  <View
                    style={[
                      styles.statusBadge,
                      isAssigned
                        ? styles.assignedBadge
                        : styles.unassignedBadge,
                    ]}
                  >
                    <Feather
                      name={isAssigned ? "check-circle" : "clock"}
                      size={12}
                      color={isAssigned ? GREEN : "#947300"}
                    />
                    <Text
                      style={[
                        styles.statusBadgeText,
                        {
                          color: isAssigned ? GREEN : "#947300",
                        },
                      ]}
                    >
                      {isAssigned ? "Assigned" : "Pending"}
                    </Text>
                  </View>

                  <Feather
                    name="chevron-right"
                    size={20}
                    color={isAssigned ? GREEN : "#A57B19"}
                  />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Bottom-sheet teacher selector */}
      <Modal
        visible={showTeacherPicker}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeTeacherPicker}
      >
        <View style={styles.modalRoot}>
          <TouchableWithoutFeedback onPress={closeTeacherPicker}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>

          <View style={styles.bottomSheet}>
            {/* Drag indicator */}
            <View style={styles.dragIndicator} />

            {/* Sheet header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeadingCopy}>
                <Text style={styles.sheetEyebrow}>
                  TEACHER ALLOCATION
                </Text>

                <Text style={styles.sheetTitle}>
                  {selectedSubject?.name ?? "Choose teacher"}
                </Text>

                <Text style={styles.sheetSubtitle}>
                  {classes.find(
                    (item) => item.id === selectedClassId
                  )?.name ?? "Selected class"}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.sheetCloseButton}
                onPress={closeTeacherPicker}
                accessibilityLabel="Close teacher selector"
              >
                <Feather name="x" size={21} color={NAVY} />
              </TouchableOpacity>
            </View>

            {/* Current assignment */}
            <View style={styles.currentTeacherBox}>
              <View style={styles.currentTeacherIcon}>
                <Feather
                  name="user-check"
                  size={20}
                  color={assignedTeacher ? GREEN : MUTED}
                />
              </View>

              <View style={styles.currentTeacherCopy}>
                <Text style={styles.currentTeacherLabel}>
                  CURRENTLY ASSIGNED
                </Text>

                <Text style={styles.currentTeacherName}>
                  {assignedTeacher?.full_name ??
                    (currentAssignment
                      ? "Teacher record unavailable"
                      : "No teacher assigned")}
                </Text>

                <Text style={styles.currentTeacherPhone}>
                  {assignedTeacher?.phone ?? "Select a teacher below"}
                </Text>
              </View>
            </View>

            <Text style={styles.sheetSectionTitle}>
              {currentAssignment
                ? "Choose a teacher to change assignment"
                : "Choose a teacher"}
            </Text>

            {/* Search */}
            <View style={styles.searchBox}>
              <Feather name="search" size={18} color={MUTED} />

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search teacher or phone"
                placeholderTextColor={MUTED}
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
              />

              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Feather name="x-circle" size={18} color={MUTED} />
                </TouchableOpacity>
              )}
            </View>

            {/* Teacher list */}
            {teachers.length === 0 ? (
              <View style={styles.noTeachers}>
                <Feather name="users" size={30} color={MUTED} />
                <Text style={styles.emptyTitle}>
                  No available teachers
                </Text>
                <Text style={styles.emptyDescription}>
                  Add teaching staff and set their staff type to Teacher
                  or Teaching Staff.
                </Text>
              </View>
            ) : (
              <FlatList
                data={visibleTeachers}
                keyExtractor={(item) => item.id}
                style={styles.teacherList}
                contentContainerStyle={styles.teacherListContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                ListEmptyComponent={
                  <Text style={styles.noResults}>
                    No matching teachers found.
                  </Text>
                }
                renderItem={({ item }) => {
                  const active = selectedTeacherId === item.id;

                  const alreadyAssigned =
                    currentAssignment?.teacher_id === item.id;

                  return (
                    <TouchableOpacity
                      style={[
                        styles.teacherOption,
                        active && styles.teacherOptionSelected,
                      ]}
                      onPress={() => toggleTeacher(item.id)}
                      activeOpacity={0.75}
                    >
                      <View
                        style={[
                          styles.teacherAvatar,
                          active && styles.teacherAvatarSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.teacherAvatarText,
                            active && styles.teacherAvatarTextSelected,
                          ]}
                        >
                          {item.full_name
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.teacherOptionCopy}>
                        <Text style={styles.teacherOptionName}>
                          {item.full_name}
                        </Text>

                        <Text style={styles.teacherOptionPhone}>
                          {item.phone || "No phone number"}
                        </Text>
                      </View>

                      {alreadyAssigned && (
                        <View style={styles.currentLabel}>
                          <Text style={styles.currentLabelText}>
                            Current
                          </Text>
                        </View>
                      )}

                      <Feather
                        name={active ? "check-circle" : "circle"}
                        size={22}
                        color={active ? GREEN : "#B7C4CC"}
                      />
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            {/* Selection hint */}
            <Text style={styles.selectionHint}>
              {selectedTeacher
                ? `${selectedTeacher.full_name} selected. Tap them again to deselect.`
                : "Tap a teacher to select them."}
            </Text>

            {/* Action buttons */}
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeTeacherPicker}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              {currentAssignment && (
                <TouchableOpacity
                  style={styles.unassignButton}
                  disabled={saving}
                  onPress={handleUnassign}
                  activeOpacity={0.8}
                >
                  <Feather name="user-minus" size={17} color="#C43F45" />
                  <Text style={styles.unassignButtonText}>
                    Unassign
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!selectedTeacherId || saving) &&
                    styles.saveButtonDisabled,
                ]}
                disabled={!selectedTeacherId || saving}
                onPress={() => void handleSave()}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color={WHITE} size="small" />
                ) : (
                  <Feather
                    name={currentAssignment ? "refresh-cw" : "check"}
                    size={18}
                    color={WHITE}
                  />
                )}

                <Text style={styles.saveButtonText}>
                  {saving
                    ? "Saving..."
                    : currentAssignment
                      ? "Update"
                      : "Assign"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Your custom alert component */}
      <AppAlert
        visible={appAlert.visible}
        title={appAlert.title}
        message={appAlert.message}
        type={appAlert.type}
        confirmLabel={appAlert.confirmLabel ?? "OK"}
        cancelLabel={appAlert.cancelLabel}
        onConfirm={() => {
          const callback = appAlert.onConfirm;
          closeAppAlert();
          callback?.();
        }}
        onCancel={closeAppAlert}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },

  loadingScreen: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  loadingText: {
    color: MUTED,
    fontSize: 14,
  },

  header: {
    backgroundColor: NAVY,
    minHeight: 94,
    paddingTop: 35,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerText: {
    flex: 1,
  },

  headerTitle: {
    color: WHITE,
    fontSize: 21,
    fontWeight: "800",
  },

  headerSubtitle: {
    color: "#C8D4DE",
    fontSize: 12,
    marginTop: 4,
  },

  refreshButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    padding: 14,
    paddingBottom: 35,
    gap: 14,
  },

  introCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: WHITE,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
  },

  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#EAF4EE",
    alignItems: "center",
    justifyContent: "center",
  },

  introCopy: {
    flex: 1,
  },

  introTitle: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "800",
  },

  introDescription: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  legendRow: {
    flexDirection: "row",
    gap: 18,
    paddingHorizontal: 2,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  legendGreen: {
    width: 12,
    height: 12,
    borderRadius: 4,
    backgroundColor: "#72B987",
  },

  legendYellow: {
    width: 12,
    height: 12,
    borderRadius: 4,
    backgroundColor: "#E4C05C",
  },

  legendText: {
    fontSize: 11,
    color: MUTED,
    fontWeight: "600",
  },

  sectionTitle: {
    color: NAVY,
    fontSize: 17,
    fontWeight: "800",
  },

  classList: {
    gap: 9,
    paddingVertical: 2,
  },

  classChip: {
    minWidth: 110,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 15,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },

  classChipSelected: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },

  classChipText: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
  },

  classChipTextSelected: {
    color: WHITE,
  },

  classChipCount: {
    color: MUTED,
    fontSize: 11,
    marginTop: 5,
  },

  classChipCountSelected: {
    color: "#D5E1E8",
  },

  subjectHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  countLabel: {
    color: MUTED,
    fontSize: 12,
  },

  subjectCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 17,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },

  subjectCardAssigned: {
    backgroundColor: "#EAF6EE",
    borderColor: "#B8DEC3",
  },

  subjectCardUnassigned: {
    backgroundColor: "#FFF9EC",
    borderColor: "#F1E2B8",
  },

  subjectCardSelected: {
    borderColor: GREEN,
    borderWidth: 2,
  },

  subjectIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  subjectIconAssigned: {
    backgroundColor: "#D7EEDF",
  },

  subjectIconUnassigned: {
    backgroundColor: "#FFF0CD",
  },

  subjectCopy: {
    flex: 1,
    minWidth: 0,
  },

  subjectName: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
  },

  subjectTeacher: {
    color: "#607583",
    fontSize: 11,
    marginTop: 5,
  },

  tapHint: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: "600",
  },

  tapHintAssigned: {
    color: GREEN,
  },

  tapHintUnassigned: {
    color: "#947300",
  },

  subjectRight: {
    alignItems: "flex-end",
    gap: 7,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 7,
  },

  assignedBadge: {
    backgroundColor: "#D8EEDF",
  },

  unassignedBadge: {
    backgroundColor: "#FFF0CD",
  },

  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },

  emptyCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    alignItems: "center",
    gap: 8,
  },

  emptyTitle: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },

  emptyDescription: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },

  outlineButton: {
    borderWidth: 1,
    borderColor: GREEN,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginTop: 6,
  },

  outlineButtonText: {
    color: GREEN,
    fontSize: 12,
    fontWeight: "800",
  },

  // Bottom sheet
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(12, 24, 36, 0.55)",
  },

  bottomSheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 30 : 18,
    maxHeight: "88%",
  },

  dragIndicator: {
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#D6DEE4",
    alignSelf: "center",
    marginBottom: 16,
  },

  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 15,
  },

  sheetHeadingCopy: {
    flex: 1,
  },

  sheetEyebrow: {
    color: GREEN,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  sheetTitle: {
    color: NAVY,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 5,
  },

  sheetSubtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 3,
  },

  sheetCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#F0F3F5",
    alignItems: "center",
    justifyContent: "center",
  },

  currentTeacherBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 12,
    backgroundColor: "#F0F7F2",
    borderWidth: 1,
    borderColor: "#D8EBDD",
    borderRadius: 16,
    marginBottom: 17,
  },

  currentTeacherIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#DCEFE1",
    alignItems: "center",
    justifyContent: "center",
  },

  currentTeacherCopy: {
    flex: 1,
  },

  currentTeacherLabel: {
    color: GREEN,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  currentTeacherName: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },

  currentTeacherPhone: {
    color: MUTED,
    fontSize: 11,
    marginTop: 3,
  },

  sheetSectionTitle: {
    color: NAVY,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
  },

  searchBox: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F6F8",
    borderRadius: 13,
    paddingHorizontal: 12,
    gap: 9,
    marginBottom: 9,
  },

  searchInput: {
    flex: 1,
    minHeight: 45,
    color: NAVY,
    fontSize: 13,
    paddingVertical: 7,
  },

  teacherList: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 60,
  },

  teacherListContent: {
    paddingBottom: 4,
  },

  teacherOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 9,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EDF1F4",
    backgroundColor: WHITE,
    marginBottom: 7,
  },

  teacherOptionSelected: {
    backgroundColor: "#EAF6EE",
    borderColor: "#9BCDA8",
  },

  teacherAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EDF1F4",
    alignItems: "center",
    justifyContent: "center",
  },

  teacherAvatarSelected: {
    backgroundColor: "#CFE8D5",
  },

  teacherAvatarText: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "900",
  },

  teacherAvatarTextSelected: {
    color: GREEN,
  },

  teacherOptionCopy: {
    flex: 1,
    minWidth: 0,
  },

  teacherOptionName: {
    color: NAVY,
    fontSize: 13,
    fontWeight: "800",
  },

  teacherOptionPhone: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },

  currentLabel: {
    backgroundColor: "#D9EEDF",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },

  currentLabelText: {
    color: GREEN,
    fontSize: 9,
    fontWeight: "900",
  },

  noTeachers: {
    alignItems: "center",
    padding: 18,
    gap: 8,
  },

  noResults: {
    color: MUTED,
    fontSize: 12,
    textAlign: "center",
    padding: 18,
  },

  selectionHint: {
    color: MUTED,
    fontSize: 10,
    textAlign: "center",
    marginTop: 7,
    marginBottom: 12,
  },

  sheetActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: "#EDF1F4",
  },

  cancelButton: {
    minHeight: 47,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: "#F0F3F5",
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButtonText: {
    color: NAVY,
    fontSize: 12,
    fontWeight: "800",
  },

  unassignButton: {
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#F4D3D3",
  },

  unassignButtonText: {
    color: "#C43F45",
    fontSize: 11,
    fontWeight: "800",
  },

  saveButton: {
    flex: 1,
    minHeight: 47,
    borderRadius: 13,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
  },

  saveButtonDisabled: {
    opacity: 0.45,
  },

  saveButtonText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "900",
  },
});