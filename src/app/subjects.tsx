
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";
import AppAlert, {
  type AppAlertType,
} from "../components/AppAlert";

type ClassItem = {
  id: string;
  name: string;
  is_active?: boolean;
};

type SubjectItem = {
  id: string;
  institute_id: string;
  class_id: string;
  name: string;
};

type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: AppAlertType;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
};

const C = {
  background: "#F2F8FF",
  white: "#FFFFFF",
  softBlue: "#E7F2FF",
  primary: "#3988E8",
  primaryDark: "#2169C4",
  border: "#D8E8F8",
  text: "#183653",
  secondary: "#71869C",
  muted: "#91A5BA",
  green: "#21815F",
  red: "#C94040",
};

const CHIP_PALETTE = [
  { bg: "#E4F1FF", fg: "#286DB7" },
  { bg: "#E3F6ED", fg: "#21815F" },
  { bg: "#FFF0DF", fg: "#A96521" },
  { bg: "#F0E9FF", fg: "#7551B5" },
  { bg: "#FFE8EF", fg: "#B94E72" },
  { bg: "#DDF7F8", fg: "#187E86" },
];

export default function SubjectsScreen() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [instituteId, setInstituteId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [formVisible, setFormVisible] = useState(false);

  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslate = useRef(new Animated.Value(20)).current;
  const mountedRef = useRef(true);
  const formClosingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const showAlert = useCallback(
    (
      title: string,
      message: string,
      type: AppAlertType = "info",
      options?: {
        confirmLabel?: string;
        cancelLabel?: string;
        onConfirm?: () => void;
      }
    ) => {
      setAlertState({
        visible: true,
        title,
        message,
        type,
        confirmLabel: options?.confirmLabel ?? "OK",
        cancelLabel: options?.cancelLabel,
        onConfirm: options?.onConfirm,
      });
    },
    []
  );

  const dismissAlert = useCallback(() => {
    setAlertState((current) => ({
      ...current,
      visible: false,
      onConfirm: undefined,
    }));
  }, []);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        if (!mountedRef.current) return;
        setInstituteId(null);
        setClasses([]);
        setSubjects([]);
        setCanManage(false);
        return;
      }

      const { data: memberships, error: membershipError } =
        await supabase
          .from("institute_members")
          .select("institute_id, role")
          .eq("user_id", user.id);

      if (membershipError) throw membershipError;

      if (!memberships || memberships.length === 0) {
        if (!mountedRef.current) return;
        setInstituteId(null);
        setClasses([]);
        setSubjects([]);
        setCanManage(false);
        return;
      }

      /*
       * This screen needs a single institute context.
       * If multiple memberships exist, don't silently load data
       * from an arbitrary institute.
       */
      if (memberships.length > 1) {
        if (!mountedRef.current) return;

        setInstituteId(null);
        setClasses([]);
        setSubjects([]);
        setCanManage(false);

        showAlert(
          "Multiple institutes found",
          "Your account belongs to more than one institute. Select your active institute in the app before managing subjects.",
          "warning"
        );
        return;
      }

      const membership = memberships[0];
      const currentInstituteId = membership.institute_id as string;
      const role = membership.role as string;

      const { data: classRows, error: classError } = await supabase
        .from("institute_classes")
        .select("id, name, is_active")
        .eq("institute_id", currentInstituteId)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (classError) throw classError;

      const { data: subjectRows, error: subjectError } = await supabase
        .from("institute_subjects")
        .select("id, institute_id, class_id, name")
        .eq("institute_id", currentInstituteId)
        .order("name", { ascending: true });

      if (subjectError) throw subjectError;

      if (!mountedRef.current) return;

      setInstituteId(currentInstituteId);
      setCanManage(role === "owner" || role === "manager");
      setClasses((classRows ?? []) as ClassItem[]);
      setSubjects((subjectRows ?? []) as SubjectItem[]);
    } catch (error: any) {
      console.error("Subjects load error:", error);

      if (mountedRef.current) {
        showAlert(
          "Unable to load subjects",
          error?.message ?? "Please try again.",
          "error"
        );
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [showAlert]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const refreshData = useCallback(() => {
    setRefreshing(true);
    loadData(false);
  }, [loadData]);

  const getClassSubjects = useCallback(
    (classId: string) =>
      subjects.filter((subject) => subject.class_id === classId),
    [subjects]
  );

  const openForm = useCallback(
    (classItem: ClassItem) => {
      if (!canManage) {
        const items = getClassSubjects(classItem.id);

        showAlert(
          classItem.name,
          items.length
            ? items.map((item) => `• ${item.name}`).join("\n")
            : "No subjects have been added to this class yet.",
          "info"
        );
        return;
      }

      Keyboard.dismiss();
      setSelectedClass(classItem);
      setSubjectName("");
      formClosingRef.current = false;
      formOpacity.setValue(0);
      formTranslate.setValue(20);
      setFormVisible(true);

      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(formTranslate, {
          toValue: 0,
          speed: 18,
          bounciness: 3,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [canManage, getClassSubjects, showAlert, formOpacity, formTranslate]
  );

  const closeForm = useCallback(
    (force = false) => {
      if (force) {
        formClosingRef.current = false;
        setFormVisible(false);
        setSelectedClass(null);
        setSubjectName("");
        formOpacity.setValue(0);
        formTranslate.setValue(20);
        return;
      }

      if (saving || formClosingRef.current) return;

      formClosingRef.current = true;
      Keyboard.dismiss();

      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(formTranslate, {
          toValue: 20,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (mountedRef.current) {
          setFormVisible(false);
          setSelectedClass(null);
          setSubjectName("");
        }
        formClosingRef.current = false;
      });
    },
    [saving, formOpacity, formTranslate]
  );

  const addSubject = useCallback(async () => {
    const cleanName = subjectName.trim();

    if (!instituteId || !selectedClass) {
      showAlert(
        "Class not selected",
        "Select a class before adding a subject.",
        "warning"
      );
      return;
    }

    if (!canManage) {
      showAlert(
        "Permission denied",
        "Only institute owners and managers can add subjects.",
        "warning"
      );
      return;
    }

    if (!cleanName) {
      showAlert(
        "Subject name required",
        "Enter a subject name to continue.",
        "warning"
      );
      return;
    }

    if (cleanName.length > 100) {
      showAlert(
        "Name too long",
        "Subject names must be 100 characters or fewer.",
        "warning"
      );
      return;
    }

    const duplicate = subjects.some(
      (subject) =>
        subject.class_id === selectedClass.id &&
        subject.name.trim().toLocaleLowerCase() ===
          cleanName.toLocaleLowerCase()
    );

    if (duplicate) {
      showAlert(
        "Subject already exists",
        `${cleanName} is already added to ${selectedClass.name}.`,
        "warning"
      );
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("institute_subjects")
        .insert({
          institute_id: instituteId,
          class_id: selectedClass.id,
          name: cleanName,
        })
        .select("id, institute_id, class_id, name")
        .single();

      if (error) {
        if (error.code === "23505") {
          showAlert(
            "Duplicate subject",
            "This subject already exists for the selected class.",
            "warning"
          );
          return;
        }
        throw error;
      }

      if (!data) {
        throw new Error("The database did not return the saved subject.");
      }

      const className = selectedClass.name;

      if (mountedRef.current) {
        setSubjects((previous) => {
          if (previous.some((item) => item.id === data.id)) {
            return previous;
          }
          return [...previous, data as SubjectItem].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
        });

        closeForm(true);
        showAlert(
          "Subject added",
          `${cleanName} has been added to ${className}.`,
          "success"
        );
      }
    } catch (error: any) {
      console.error("Add subject error:", error);

      if (mountedRef.current) {
        showAlert(
          "Unable to add subject",
          error?.message ?? "Please try again.",
          "error"
        );
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [
    subjectName,
    instituteId,
    selectedClass,
    canManage,
    subjects,
    showAlert,
    closeForm,
  ]);

  const deleteSubject = useCallback(
    async (subject: SubjectItem) => {
      if (!canManage || !instituteId || removingId) return;

      setRemovingId(subject.id);

      try {
        const { error } = await supabase
          .from("institute_subjects")
          .delete()
          .eq("id", subject.id)
          .eq("institute_id", instituteId);

        if (error) throw error;

        if (mountedRef.current) {
          setSubjects((previous) =>
            previous.filter((item) => item.id !== subject.id)
          );
          showAlert(
            "Subject removed",
            `${subject.name} has been removed successfully.`,
            "success"
          );
        }
      } catch (error: any) {
        console.error("Delete subject error:", error);

        if (mountedRef.current) {
          showAlert(
            "Unable to remove subject",
            error?.message ?? "Please try again.",
            "error"
          );
        }
      } finally {
        if (mountedRef.current) setRemovingId(null);
      }
    },
    [canManage, instituteId, removingId, showAlert]
  );

  const confirmDelete = useCallback(
    (subject: SubjectItem) => {
      if (!canManage) return;

      const parentClass = classes.find(
        (item) => item.id === subject.class_id
      );

      showAlert(
        "Remove subject?",
        `Remove "${subject.name}" from ${parentClass?.name ?? "this class"}?`,
        "warning",
        {
          confirmLabel: "Remove",
          cancelLabel: "Cancel",
          onConfirm: () => {
            void deleteSubject(subject);
          },
        }
      );
    },
    [canManage, classes, showAlert, deleteSubject]
  );

  const renderClassCard = (item: ClassItem, index: number) => {
    const classSubjects = getClassSubjects(item.id);
    const palette = CHIP_PALETTE[index % CHIP_PALETTE.length];

    return (
      <AnimatedClassCard
        key={item.id}
        item={item}
        index={index}
        subjectCount={classSubjects.length}
        onPress={() => openForm(item)}
      >
        <View style={styles.chipContainer}>
          {classSubjects.length === 0 ? (
            <Text style={styles.noSubjects}>
              No subjects added yet
            </Text>
          ) : (
            <>
              {classSubjects.map((subject) => (
                <View
                  key={subject.id}
                  style={[
                    styles.chip,
                    { backgroundColor: palette.bg },
                  ]}
                >
                  <Text
                    style={[styles.chipText, { color: palette.fg }]}
                    numberOfLines={2}
                  >
                    {subject.name}
                  </Text>

                  {canManage && (
                    <Pressable
                      hitSlop={6}
                      disabled={removingId === subject.id}
                      style={styles.chipRemove}
                      onPress={() => confirmDelete(subject)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${subject.name}`}
                    >
                      {removingId === subject.id ? (
                        <ActivityIndicator size="small" color={palette.fg} />
                      ) : (
                        <Feather
                          name="x"
                          size={12}
                          color={palette.fg}
                        />
                      )}
                    </Pressable>
                  )}
                </View>
              ))}
            </>
          )}
        </View>
      </AnimatedClassCard>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={C.background}
      />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={21} color={C.text} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Create Subject</Text>
          <Text style={styles.headerSubtitle}>
            Manage subjects class-wise
          </Text>
        </View>

        <Pressable
          onPress={refreshData}
          style={styles.refreshButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh subjects"
        >
          <Feather name="refresh-cw" size={18} color={C.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Feather name="book-open" size={27} color={C.primary} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Subjects by Class</Text>
            <Text style={styles.heroDescription}>
              Choose a class to view or manage its subjects.
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#DDEEFF" }]}>
              <Feather name="layers" size={18} color="#2877CE" />
            </View>
            <Text style={styles.statNumber}>{classes.length}</Text>
            <Text style={styles.statLabel}>Active classes</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#DFF7EE" }]}>
              <Feather name="book" size={18} color={C.green} />
            </View>
            <Text style={styles.statNumber}>{subjects.length}</Text>
            <Text style={styles.statLabel}>Total subjects</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Your Classes</Text>
            <Text style={styles.sectionSubtitle}>
              {canManage
                ? "Tap a class to add a subject"
                : "Tap a class to view its subjects"}
            </Text>
          </View>

          {canManage && (
            <View style={styles.manageBadge}>
              <Feather name="check-circle" size={12} color={C.primary} />
              <Text style={styles.manageBadgeText}>Manage</Text>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.loadingText}>Loading your classes...</Text>
          </View>
        ) : !instituteId ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="home" size={29} color={C.primary} />
            </View>
            <Text style={styles.emptyTitle}>No institute available</Text>
            <Text style={styles.emptyDescription}>
              Sign in and ensure your account is linked to an institute
              before managing subjects.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push("/classes")}
            >
              <Text style={styles.primaryButtonText}>Open Classes</Text>
              <Feather name="arrow-right" size={17} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : classes.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="layers" size={29} color={C.primary} />
            </View>
            <Text style={styles.emptyTitle}>No classes available</Text>
            <Text style={styles.emptyDescription}>
              Create a class first, then add subjects to it.
            </Text>
            {canManage && (
              <Pressable
                style={styles.primaryButton}
                onPress={() => router.push("/classes")}
              >
                <Feather name="plus" size={17} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Create a Class</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.grid}>
            {classes.map((item, index) => (
              <View key={item.id} style={styles.gridItem}>
                {renderClassCard(item, index)}
              </View>
            ))}
          </View>
        )}

        {instituteId && canManage && classes.length > 0 && (
          <Pressable
            style={styles.manageClassesButton}
            onPress={() => router.push("/classes")}
          >
            <Feather name="plus-circle" size={18} color={C.primary} />
            <Text style={styles.manageClassesText}>Manage Classes</Text>
            <Feather name="chevron-right" size={18} color={C.primary} />
          </Pressable>
        )}

        <View style={styles.footerNote}>
          <Feather name="info" size={15} color={C.secondary} />
          <Text style={styles.footerText}>
            Subjects are saved separately for each class. Removing a subject
            deletes its association with this class.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={formVisible}
        transparent
        animationType="none"
        statusBarTranslucent={Platform.OS === "android"}
        onRequestClose={() => closeForm()}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => closeForm()}
          />

          <Animated.View
            style={[
              styles.sheet,
              {
                opacity: formOpacity,
                transform: [{ translateY: formTranslate }],
                maxHeight: "90%",
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetContent}
            >
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <View style={styles.sheetIcon}>
                  <Feather name="book-open" size={23} color={C.primary} />
                </View>

                <Pressable
                  onPress={() => closeForm()}
                  disabled={saving}
                  style={styles.sheetClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close form"
                >
                  <Feather name="x" size={21} color={C.secondary} />
                </Pressable>
              </View>

              <Text style={styles.sheetTitle}>Add New Subject</Text>
              <Text style={styles.sheetSubtitle}>
                Add a subject to{" "}
                <Text style={styles.selectedClass}>
                  {selectedClass?.name ?? "your class"}
                </Text>
                .
              </Text>

              <Text style={styles.inputLabel}>Subject Name</Text>

              <View style={styles.inputWrapper}>
                <Feather name="book" size={18} color={C.primary} />
                <TextInput
                  value={subjectName}
                  onChangeText={setSubjectName}
                  placeholder="e.g. Mathematics"
                  placeholderTextColor={C.muted}
                  style={styles.textInput}
                  maxLength={100}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  editable={!saving}
                  onSubmitEditing={() => void addSubject()}
                />
                {subjectName.length > 0 && (
                  <Pressable
                    onPress={() => setSubjectName("")}
                    hitSlop={8}
                    accessibilityLabel="Clear subject name"
                  >
                    <Feather name="x-circle" size={17} color={C.muted} />
                  </Pressable>
                )}
              </View>

              <Text style={styles.characterCount}>
                {subjectName.length}/100 characters
              </Text>

              <Pressable
                style={[
                  styles.saveButton,
                  saving && styles.disabledButton,
                ]}
                onPress={() => void addSubject()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Feather
                      name="check-circle"
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={styles.saveButtonText}>Save Subject</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={styles.cancelButton}
                onPress={() => closeForm()}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <AppAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        confirmLabel={alertState.confirmLabel ?? "OK"}
        cancelLabel={alertState.cancelLabel}
        onConfirm={() => {
          const callback = alertState.onConfirm;
          dismissAlert();
          callback?.();
        }}
        onCancel={dismissAlert}
      />
    </View>
  );
}

function AnimatedClassCard({
  item,
  index,
  subjectCount,
  onPress,
  children,
}: {
  item: ClassItem;
  index: number;
  subjectCount: number;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        delay: Math.min(index * 45, 225),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        speed: 18,
        bounciness: 3,
        delay: Math.min(index * 45, 225),
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [index, opacity, translateY]);

  const animateScale = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      speed: 24,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.classCard,
        { opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      <Pressable
        style={styles.cardPressable}
        onPress={onPress}
        onPressIn={() => animateScale(0.975)}
        onPressOut={() => animateScale(1)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${subjectCount} subjects`}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.classIcon}>
              <Feather name="book-open" size={21} color={C.primary} />
            </View>
            <View style={styles.cardArrow}>
              <Feather
                name="arrow-up-right"
                size={17}
                color={C.primary}
              />
            </View>
          </View>

          <Text style={styles.className} numberOfLines={2}>
            {item.name}
          </Text>

          <View style={styles.subjectCountRow}>
            <View style={styles.countDot} />
            <Text style={styles.subjectCountText}>
              {subjectCount} {subjectCount === 1 ? "subject" : "subjects"}
            </Text>
          </View>

          <View style={styles.divider} />
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "android" ? 35 : 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5EFF9",
    backgroundColor: C.background,
  },
  backButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  headerCopy: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: C.text,
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: C.secondary,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: C.softBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E7F3FF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D4E9FF",
    padding: 17,
    marginBottom: 17,
  },
  heroIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  heroCopy: {
    flex: 1,
  },
  heroTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "800",
  },
  heroDescription: {
    color: C.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 25,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    backgroundColor: C.white,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#729BC2",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 7,
    elevation: 2,
  },
  statIcon: {
    width: 37,
    height: 37,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 23,
    fontWeight: "800",
    color: C.text,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: C.secondary,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  sectionCopy: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: C.text,
  },
  sectionSubtitle: {
    marginTop: 5,
    fontSize: 12,
    color: C.secondary,
  },
  manageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E3F1FF",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  manageBadgeText: {
    color: C.primaryDark,
    fontSize: 11,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
  },
  gridItem: {
    width: "100%",
    paddingHorizontal: 0,
    marginBottom: 10,
  },
  classCard: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#729BC2",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  cardPressable: {
    flex: 1,
  },
  cardContent: {
    padding: 12,
    minHeight: 174,
    backgroundColor: C.white,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  classIcon: {
    width: 41,
    height: 41,
    borderRadius: 14,
    backgroundColor: "#E4F1FF",
    alignItems: "center",
    justifyContent: "center",
  },
  cardArrow: {
    width: 29,
    height: 29,
    borderRadius: 10,
    backgroundColor: "#F0F7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  className: {
    fontSize: 16,
    fontWeight: "800",
    color: C.text,
    marginTop: 12,
  },
  subjectCountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 7,
    gap: 6,
  },
  countDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.primary,
  },
  subjectCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.secondary,
  },
  divider: {
    height: 1,
    backgroundColor: "#EAF1F8",
    marginVertical: 11,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 5,
  },
  chip: {
    width: "23%",
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  chipRemove: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 14,
    minHeight: 14,
  },
  noSubjects: {
    fontSize: 10,
    color: C.muted,
    lineHeight: 15,
  },
  loadingBox: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  loadingText: {
    color: C.secondary,
    fontSize: 13,
    marginTop: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 30,
    borderRadius: 22,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E4F1FF",
    marginBottom: 15,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyDescription: {
    color: C.secondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: C.primary,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  manageClassesButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 15,
    paddingHorizontal: 14,
    marginTop: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#C9E1FA",
    borderStyle: "dashed",
    backgroundColor: "#F8FBFF",
  },
  manageClassesText: {
    color: C.primaryDark,
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  footerNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 3,
    marginTop: 22,
  },
  footerText: {
    flex: 1,
    color: C.secondary,
    fontSize: 11,
    lineHeight: 17,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(17, 42, 68, 0.28)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: "#F8FBFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "#DCEBFA",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 25,
  },
  sheetContent: {
    flexGrow: 1,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 43,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D0DFEE",
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetIcon: {
    width: 49,
    height: 49,
    borderRadius: 16,
    backgroundColor: "#DDEEFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetClose: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF3FC",
  },
  sheetTitle: {
    fontSize: 23,
    fontWeight: "800",
    color: C.text,
    marginTop: 17,
  },
  sheetSubtitle: {
    color: C.secondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 23,
  },
  selectedClass: {
    color: C.primaryDark,
    fontWeight: "800",
  },
  inputLabel: {
    fontSize: 13,
    color: C.text,
    fontWeight: "700",
    marginBottom: 9,
  },
  inputWrapper: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#C9E1FA",
    backgroundColor: C.white,
  },
  textInput: {
    flex: 1,
    minHeight: 50,
    color: C.text,
    fontSize: 14,
    paddingVertical: 10,
  },
  characterCount: {
    color: C.muted,
    fontSize: 10,
    textAlign: "right",
    marginTop: 7,
    marginBottom: 22,
  },
  saveButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 15,
    backgroundColor: C.primary,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 3,
  },
  disabledButton: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    marginTop: 4,
  },
  cancelButtonText: {
    color: C.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
});
