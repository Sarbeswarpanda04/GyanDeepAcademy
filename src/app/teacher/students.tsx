import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const NAVY = "#1D2D44";
const BLUE = "#3677D5";
const BG = "#F4F7FB";
const MUTED = "#718096";
const WHITE = "#FFFFFF";
const BORDER = "#E7EDF4";
const GREEN = "#159A82";

type Teacher = {
  institute_id: string;
  full_name: string;
  staff_id: string | null;
};

type Student = {
  id: string;
  full_name: string;
  roll_number: string | number | null;
  photo_path: string | null;
  class_id: string | null;
  status: string | null;
  phone?: string | null;
  photo_url?: string | null;
};

type InstituteClass = {
  id: string;
  name: string;
};

function rollSort(a: Student, b: Student) {
  const left = String(a.roll_number ?? "").trim();
  const right = String(b.roll_number ?? "").trim();
  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (
    left &&
    right &&
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber)
  ) {
    return leftNumber - rightNumber || a.full_name.localeCompare(b.full_name);
  }
  return (
    left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    }) || a.full_name.localeCompare(b.full_name)
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "S"
  );
}

function getPublicStudentPhoto(pathValue: string | null, instituteId: string) {
  if (!pathValue?.trim()) return null;
  const raw = pathValue.trim();

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const markers = [
        "/storage/v1/object/public/student-photos/",
        "/storage/v1/object/sign/student-photos/",
        "/storage/v1/object/authenticated/student-photos/",
      ];
      const marker = markers.find((item) => parsed.pathname.includes(item));
      if (!marker) return raw;
      let objectPath = decodeURIComponent(
        parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length),
      );
      objectPath = objectPath
        .replace(/^\/+/, "")
        .replace(/^student-photos\//, "");
      if (!objectPath.startsWith(`${instituteId}/`))
        objectPath = `${instituteId}/${objectPath}`;
      return supabase.storage.from("student-photos").getPublicUrl(objectPath)
        .data.publicUrl;
    } catch {
      return null;
    }
  }

  let objectPath = decodeURIComponent(raw.split("?")[0])
    .replace(/^\/+/, "")
    .replace(/^student-photos\//, "");
  if (!objectPath.startsWith(`${instituteId}/`))
    objectPath = `${instituteId}/${objectPath}`;
  return supabase.storage.from("student-photos").getPublicUrl(objectPath).data
    .publicUrl;
}

function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\\D/g, "");
  if (!digits) return "";
  // Student form generally stores an Indian mobile number.
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0"))
    return `91${digits.slice(1)}`;
  return digits;
}

async function openCall(phone: string | null | undefined) {
  const number = normalizePhone(phone);
  if (!number) {
    const { Alert } = await import("react-native");
    Alert.alert(
      "Phone number unavailable",
      "No phone number has been saved for this student.",
    );
    return;
  }
  await Linking.openURL(`tel:+${number}`);
}

async function openWhatsApp(
  phone: string | null | undefined,
  studentName: string,
) {
  const number = normalizePhone(phone);
  if (!number) {
    const { Alert } = await import("react-native");
    Alert.alert(
      "Phone number unavailable",
      "No phone number has been saved for this student.",
    );
    return;
  }
  const message = `Hello, I am contacting you regarding ${studentName} from the institute.`;
  await Linking.openURL(
    `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
  );
}

export default function TeacherStudentsScreen() {
  const insets = useSafeAreaInsets();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [classes, setClasses] = useState<InstituteClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [failedPhotos, setFailedPhotos] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError("");
    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) {
        router.replace("/teacher/teacher-login" as never);
        return;
      }

      const { data: member, error: memberError } = await supabase
        .from("institute_team_members")
        .select("institute_id,full_name,staff_id,role,is_active")
        .eq("user_id", authData.user.id)
        .eq("role", "teacher")
        .eq("is_active", true)
        .maybeSingle();

      if (memberError) throw memberError;
      if (!member)
        throw new Error("No active teacher profile is linked to this login.");

      setTeacher(member as Teacher);

      const { data: classRows, error: classError } = await supabase
        .from("institute_classes")
        .select("id,name")
        .eq("institute_id", member.institute_id)
        .order("name", { ascending: true });

      if (classError) throw classError;

      const classList = (classRows ?? []) as InstituteClass[];
      setClasses(classList);

      const { data: studentRows, error: studentError } = await supabase
        .from("institute_students")
        .select("id,full_name,roll_number,photo_path,class_id,status,phone")
        .eq("institute_id", member.institute_id)
        .eq("status", "active");

      if (studentError) throw studentError;

      const enriched = ((studentRows ?? []) as Student[])
        .map((student) => ({
          ...student,
          photo_url: getPublicStudentPhoto(
            student.photo_path,
            member.institute_id,
          ),
        }))
        .sort(rollSort);

      setStudents(enriched);
      setFailedPhotos({});
    } catch (e) {
      console.error("[teacher-students] Load failed:", e);
      setError(e instanceof Error ? e.message : "Unable to load students.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleClasses = classes.slice(0, 5);
  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students
      .filter(
        (student) => !selectedClassId || student.class_id === selectedClassId,
      )
      .filter((student) => {
        if (!term) return true;
        return (
          student.full_name.toLowerCase().includes(term) ||
          String(student.roll_number ?? "")
            .toLowerCase()
            .includes(term)
        );
      })
      .sort(rollSort);
  }, [students, selectedClassId, search]);

  const selectedClassName = selectedClassId
    ? (classes.find((item) => item.id === selectedClassId)?.name ??
      "Selected class")
    : "All students";

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.loadingText}>Loading students…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View
        style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 12 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="arrow-left" size={20} color={WHITE} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>TEACHER PORTAL</Text>
            <Text style={styles.title}>Students</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {teacher?.full_name
                ? `Welcome, ${teacher.full_name}`
                : "Student directory"}
            </Text>
          </View>
          <View style={styles.headerIcon}>
            <Feather name="users" size={22} color={WHITE} />
          </View>
        </View>
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Feather name="user-check" size={21} color={BLUE} />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryLabel}>{selectedClassName}</Text>
            <Text style={styles.summaryNumber}>
              {filteredStudents.length} students
            </Text>
          </View>
          <View style={styles.summaryTotal}>
            <Text style={styles.summaryTotalNumber}>{students.length}</Text>
            <Text style={styles.summaryTotalLabel}>TOTAL</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
      >
        <View style={styles.sectionHeading}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Browse by class</Text>
            <Text style={styles.sectionCaption}>
              Choose a class to filter the student list
            </Text>
          </View>
          <Text style={styles.countPill}>{classes.length} classes</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.classRow}
        >
          <TouchableOpacity
            style={[
              styles.classCard,
              !selectedClassId && styles.classCardSelected,
            ]}
            onPress={() => setSelectedClassId(null)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: !selectedClassId }}
          >
            <View
              style={[
                styles.classIcon,
                !selectedClassId && styles.classIconSelected,
              ]}
            >
              <Feather
                name="users"
                size={17}
                color={!selectedClassId ? WHITE : BLUE}
              />
            </View>
            <Text
              style={[
                styles.classCardName,
                !selectedClassId && styles.classCardNameSelected,
              ]}
            >
              All
            </Text>
            <Text
              style={[
                styles.classCardCaption,
                !selectedClassId && styles.classCardCaptionSelected,
              ]}
            >
              Students
            </Text>
          </TouchableOpacity>

          {visibleClasses.map((item, index) => {
            const active = selectedClassId === item.id;
            const count = students.filter(
              (student) => student.class_id === item.id,
            ).length;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.classCard, active && styles.classCardSelected]}
                onPress={() => setSelectedClassId(active ? null : item.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View
                  style={[
                    styles.classIcon,
                    active && styles.classIconSelected,
                    !active && {
                      backgroundColor:
                        CLASS_COLORS[index % CLASS_COLORS.length] + "18",
                    },
                  ]}
                >
                  <Feather
                    name="book-open"
                    size={17}
                    color={
                      active ? WHITE : CLASS_COLORS[index % CLASS_COLORS.length]
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.classCardName,
                    active && styles.classCardNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text
                  style={[
                    styles.classCardCaption,
                    active && styles.classCardCaptionSelected,
                  ]}
                >
                  {count} students
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {classes.length > 5 ? (
          <Text style={styles.classLimitNote}>
            Showing the first 5 classes. Use search or ask your institute owner
            to arrange the class list.
          </Text>
        ) : null}

        <View style={styles.listHeading}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>{selectedClassName}</Text>
            <Text style={styles.sectionCaption}>Sorted by roll number</Text>
          </View>
          <Text style={styles.countPill}>{filteredStudents.length} shown</Text>
        </View>

        <View style={styles.searchBox}>
          <Feather name="search" size={18} color={MUTED} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or roll number"
            placeholderTextColor="#98A5B5"
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="Search students by name or roll number"
          />
          {search.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearch("")}
              accessibilityLabel="Clear search"
            >
              <Feather name="x-circle" size={18} color={MUTED} />
            </TouchableOpacity>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={20} color="#C94F5B" />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Could not load students</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                onPress={() => {
                  setLoading(true);
                  void load();
                }}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : filteredStudents.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="users" size={28} color={BLUE} />
            </View>
            <Text style={styles.emptyTitle}>No students found</Text>
            <Text style={styles.emptyText}>
              {search
                ? "Try a different name or roll number."
                : "There are no active students for this selection."}
            </Text>
          </View>
        ) : (
          <View style={styles.studentList}>
            {filteredStudents.map((student, index) => {
              const className =
                classes.find((item) => item.id === student.class_id)?.name ??
                "Class not assigned";
              const showPhoto =
                !!student.photo_url && !failedPhotos[student.id];
              return (
                <View key={student.id} style={styles.studentCard}>
                  <View style={styles.studentMainRow}>
                    <View style={styles.rollBadge}>
                      <Text style={styles.rollBadgeText}>
                        {student.roll_number === null ||
                        student.roll_number === ""
                          ? "—"
                          : String(student.roll_number)}
                      </Text>
                    </View>
                    <View style={styles.avatar}>
                      {showPhoto ? (
                        <Image
                          source={{ uri: student.photo_url! }}
                          style={styles.avatarImage}
                          onError={() =>
                            setFailedPhotos((current) => ({
                              ...current,
                              [student.id]: true,
                            }))
                          }
                        />
                      ) : (
                        <Text style={styles.avatarInitials}>
                          {initials(student.full_name)}
                        </Text>
                      )}
                    </View>
                    <View style={styles.studentInfo}>
                      <Text style={styles.studentName} numberOfLines={1}>
                        {student.full_name}
                      </Text>
                      <Text style={styles.studentClass} numberOfLines={1}>
                        {className}
                      </Text>
                      <Text style={styles.studentPhone} numberOfLines={1}>
                        {student.phone?.trim() || "No phone number saved"}
                      </Text>
                    </View>
                    <View style={styles.studentStatus}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusText}>Active</Text>
                    </View>
                  </View>
                  <View style={styles.contactActions}>
                    <TouchableOpacity
                      style={[
                        styles.contactButton,
                        styles.callButton,
                        !normalizePhone(student.phone) &&
                          styles.contactButtonDisabled,
                      ]}
                      onPress={() => void openCall(student.phone)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${student.full_name}`}
                    >
                      <Feather
                        name="phone"
                        size={15}
                        color={
                          normalizePhone(student.phone) ? "#FFFFFF" : MUTED
                        }
                      />
                      <Text
                        style={[
                          styles.contactButtonText,
                          !normalizePhone(student.phone) &&
                            styles.contactButtonTextDisabled,
                        ]}
                      >
                        Call
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.contactButton,
                        styles.whatsappButton,
                        !normalizePhone(student.phone) &&
                          styles.contactButtonDisabled,
                      ]}
                      onPress={() =>
                        void openWhatsApp(student.phone, student.full_name)
                      }
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`WhatsApp ${student.full_name}`}
                    >
                      <Feather
                        name="message-circle"
                        size={15}
                        color={
                          normalizePhone(student.phone) ? "#FFFFFF" : MUTED
                        }
                      />
                      <Text
                        style={[
                          styles.contactButtonText,
                          !normalizePhone(student.phone) &&
                            styles.contactButtonTextDisabled,
                        ]}
                      >
                        WhatsApp
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const CLASS_COLORS = ["#3677D5", "#159A82", "#805AD5", "#D28A26", "#D65B69"];

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
    padding: 24,
  },
  loadingText: { color: MUTED, marginTop: 12, fontSize: 14, fontWeight: "600" },
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#526174",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  eyebrow: {
    color: "#AFC8EA",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: { color: WHITE, fontSize: 25, fontWeight: "900", marginTop: 3 },
  subtitle: { color: "#C6D3E0", fontSize: 11, marginTop: 3 },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#30435D",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCard: {
    marginTop: 19,
    borderRadius: 18,
    backgroundColor: WHITE,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#E8F0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCopy: { flex: 1 },
  summaryLabel: { color: MUTED, fontSize: 11, fontWeight: "700" },
  summaryNumber: { color: NAVY, fontSize: 19, fontWeight: "900", marginTop: 2 },
  summaryTotal: {
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    paddingLeft: 14,
  },
  summaryTotalNumber: { color: BLUE, fontSize: 19, fontWeight: "900" },
  summaryTotalLabel: {
    color: MUTED,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 2,
  },
  body: { flex: 1 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 23,
    marginBottom: 12,
  },
  sectionTitle: { color: NAVY, fontSize: 18, fontWeight: "900" },
  sectionCaption: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 4 },
  countPill: {
    color: BLUE,
    backgroundColor: "#E5EEFC",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
  },
  classRow: { paddingHorizontal: 18, paddingBottom: 3, gap: 9 },
  classCard: {
    width: 100,
    minHeight: 112,
    backgroundColor: WHITE,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    justifyContent: "center",
  },
  classCardSelected: { backgroundColor: BLUE, borderColor: BLUE },
  classIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "#E8F0FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  classIconSelected: { backgroundColor: "rgba(255,255,255,0.2)" },
  classCardName: { color: NAVY, fontSize: 12, fontWeight: "900" },
  classCardNameSelected: { color: WHITE },
  classCardCaption: {
    color: MUTED,
    fontSize: 9,
    fontWeight: "600",
    marginTop: 4,
  },
  classCardCaptionSelected: { color: "#DDE9FA" },
  classLimitNote: {
    color: MUTED,
    fontSize: 10,
    paddingHorizontal: 18,
    marginTop: 7,
  },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 18,
    marginTop: 24,
    marginBottom: 12,
  },
  searchBox: {
    marginHorizontal: 18,
    marginBottom: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 13,
    minHeight: 47,
  },
  searchInput: { flex: 1, color: NAVY, fontSize: 13, paddingVertical: 10 },
  studentList: { paddingHorizontal: 18, gap: 10 },
  studentCard: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 11,
    gap: 11,
  },
  studentMainRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  studentPhone: { color: MUTED, fontSize: 10, marginTop: 4 },
  contactActions: {
    flexDirection: "row",
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
  },
  contactButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  callButton: { backgroundColor: BLUE },
  whatsappButton: { backgroundColor: "#159A55" },
  contactButtonDisabled: { backgroundColor: "#EDF1F5" },
  contactButtonText: { color: WHITE, fontSize: 11, fontWeight: "900" },
  contactButtonTextDisabled: { color: MUTED },
  rollBadge: {
    minWidth: 35,
    height: 34,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "#EDF3FD",
    alignItems: "center",
    justifyContent: "center",
  },
  rollBadgeText: { color: BLUE, fontSize: 11, fontWeight: "900" },
  avatar: {
    width: 47,
    height: 47,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#E7F0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitials: { color: BLUE, fontSize: 15, fontWeight: "900" },
  studentInfo: { flex: 1, minWidth: 0 },
  studentName: { color: NAVY, fontSize: 13, fontWeight: "900" },
  studentClass: { color: MUTED, fontSize: 11, marginTop: 5 },
  studentStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E7F8F0",
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN },
  statusText: { color: "#16845D", fontSize: 9, fontWeight: "800" },
  emptyState: {
    alignItems: "center",
    padding: 28,
    marginHorizontal: 18,
    marginTop: 5,
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#E8F0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: NAVY, fontSize: 15, fontWeight: "900", marginTop: 13 },
  emptyText: {
    color: MUTED,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 5,
  },
  errorCard: {
    marginHorizontal: 18,
    padding: 16,
    borderRadius: 16,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: "#F2D7DA",
    flexDirection: "row",
    gap: 10,
  },
  errorTitle: { color: NAVY, fontSize: 14, fontWeight: "900" },
  errorText: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 5 },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: NAVY,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 9,
  },
  retryText: { color: WHITE, fontSize: 11, fontWeight: "800" },
});
