import React, { useCallback, useMemo, useState } from "react";
import {
  Image,
  Linking,
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
import { LinearGradient } from "expo-linear-gradient";

import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

// ============================================================
// GYANDEEP ACADEMY — STANDARD UI PALETTE
// ============================================================

const PURPLE_DARK = "#4D0DB5";
const PURPLE = "#8B5CF6";
const LAVENDER = "#C4B5FD";
const BG = "#F3F3FF";
const WHITE = "#FFFFFF";
const TEXT = "#1F2937";
const MUTED = "#718096";
const BORDER = "#E8E3F5";

type IconName = React.ComponentProps<typeof Feather>["name"];

type Student = {
  id: string;
  institute_id: string;
  full_name: string;
  roll_number: string;
  phone: string | null;
  photo_path: string | null;
  status: string;
  class_id: string;
  className: string;
  batches: string[];
  fee_frequency?: string;
  fee_amount?: number;
};

type ClassOption = {
  id: string;
  name: string;
};

type BatchOption = {
  id: string;
  name: string;
};

// ============================================================
// SKELETON LOADING
// ============================================================

function SkeletonBlock({ style }: { style?: object }) {
  return <View style={[skeletonStyles.block, style]} />;
}

function StudentSkeleton() {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.studentRow}>
        <SkeletonBlock style={skeletonStyles.avatar} />

        <View style={skeletonStyles.details}>
          <SkeletonBlock style={skeletonStyles.name} />
          <SkeletonBlock style={skeletonStyles.meta} />
          <SkeletonBlock style={skeletonStyles.className} />
          <SkeletonBlock style={skeletonStyles.fee} />
        </View>

        <SkeletonBlock style={skeletonStyles.badge} />
      </View>

      <SkeletonBlock style={skeletonStyles.batch} />

      <View style={skeletonStyles.actions}>
        <SkeletonBlock style={skeletonStyles.actionButton} />
        <SkeletonBlock style={skeletonStyles.actionButton} />
      </View>
    </View>
  );
}

function StudentListSkeleton() {
  return (
    <View style={skeletonStyles.list}>
      {[0, 1, 2, 3].map((item) => (
        <StudentSkeleton key={item} />
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  list: {
    gap: 12,
    paddingBottom: 110,
  },
  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 12,
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  block: {
    backgroundColor: "#E8E3F5",
    borderRadius: 7,
  },
  avatar: {
    width: 72,
    height: 78,
    borderRadius: 16,
  },
  details: {
    flex: 1,
    minWidth: 0,
    gap: 9,
    paddingTop: 3,
  },
  name: {
    width: "82%",
    height: 16,
  },
  meta: {
    width: "65%",
    height: 11,
  },
  className: {
    width: "45%",
    height: 12,
  },
  fee: {
    width: "72%",
    height: 11,
  },
  badge: {
    width: 53,
    height: 23,
    borderRadius: 14,
  },
  batch: {
    width: "65%",
    height: 11,
    marginTop: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    height: 45,
    borderRadius: 13,
  },
});

// ============================================================
// STUDENTS SCREEN
// ============================================================

export default function StudentsScreen() {
  const [rows, setRows] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">(
    "active"
  );
  const [classFilter, setClassFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [filters, setFilters] = useState(false);
  const [openTopFilter, setOpenTopFilter] = useState<
    "class" | "batch" | null
  >(null);

  const [alert, setAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AppAlertType;
  }>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const warn = (
    title: string,
    message: string,
    type: AppAlertType = "info"
  ) => {
    setAlert({ visible: true, title, message, type });
  };

  // ----------------------------------------------------------
  // LOAD STUDENTS AND RELATED DATA FROM SUPABASE
  // ----------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in.");

      const { data: memberships, error: membershipError } =
        await supabase
          .from("institute_members")
          .select("institute_id")
          .eq("user_id", user.id);

      if (membershipError) throw membershipError;

      if (!memberships?.length) {
        throw new Error(
          "Your account is not linked to an institute."
        );
      }

      if (memberships.length !== 1) {
        throw new Error("Select an active institute first.");
      }

      const instituteId = memberships[0].institute_id;

      const [studentResult, classResult, batchResult] =
        await Promise.all([
          supabase
            .from("institute_students")
            .select(
              "id,institute_id,full_name,roll_number,phone,photo_path,status,class_id"
            )
            .eq("institute_id", instituteId)
            .order("created_at", { ascending: false }),

          supabase
            .from("institute_classes")
            .select("id,name")
            .eq("institute_id", instituteId)
            .order("name"),

          supabase
            .from("institute_batches")
            .select("id,name")
            .eq("institute_id", instituteId)
            .eq("is_active", true)
            .order("name"),
        ]);

      if (studentResult.error) throw studentResult.error;
      if (classResult.error) throw classResult.error;
      if (batchResult.error) throw batchResult.error;

      const rawStudents = studentResult.data ?? [];
      const classData = classResult.data ?? [];
      const batchData = batchResult.data ?? [];

      setClasses(classData);
      setBatches(batchData);

      const studentIds = rawStudents.map((student) => student.id);

      let batchLinks: { student_id: string; batch_id: string }[] = [];
      let feeRows: {
        student_id: string;
        fee_frequency: string;
        fee_amount: number;
      }[] = [];

      if (studentIds.length > 0) {
        const [linkResult, feeResult] = await Promise.all([
          supabase
            .from("institute_student_batches")
            .select("student_id,batch_id")
            .in("student_id", studentIds),

          supabase
            .from("institute_student_fees")
            .select("student_id,fee_frequency,fee_amount")
            .eq("institute_id", instituteId),
        ]);

        if (linkResult.error) throw linkResult.error;
        if (feeResult.error) throw feeResult.error;

        batchLinks = linkResult.data ?? [];
        feeRows = feeResult.data ?? [];
      }

      const classNames = new Map(
        classData.map((item) => [item.id, item.name])
      );

      const batchNames = new Map(
        batchData.map((item) => [item.id, item.name])
      );

      const feeMap = new Map(
        feeRows.map((item) => [item.student_id, item])
      );

      const fullStudents: Student[] = await Promise.all(
        rawStudents.map(async (student) => {
          let photoUrl: string | null = null;

          if (student.photo_path) {
            const { data: photoData, error: photoError } =
              await supabase.storage
                .from("student-photos")
                .createSignedUrl(student.photo_path, 3600);

            if (!photoError) {
              photoUrl = photoData?.signedUrl ?? null;
            }
          }

          const fee = feeMap.get(student.id);

          return {
            ...student,
            photo_path: photoUrl,
            className:
              classNames.get(student.class_id) ?? "Class",
            batches: batchLinks
              .filter((link) => link.student_id === student.id)
              .map((link) => batchNames.get(link.batch_id))
              .filter((name): name is string => Boolean(name)),
            fee_frequency: fee?.fee_frequency,
            fee_amount:
              fee?.fee_amount == null
                ? undefined
                : Number(fee.fee_amount),
          };
        })
      );

      setRows(fullStudents);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Please try again.";

      warn("Unable to load students", message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // ----------------------------------------------------------
  // SEARCH AND FILTERS
  // ----------------------------------------------------------

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const selectedBatchName =
      batches.find((batch) => batch.id === batchFilter)?.name ?? "";

    return rows.filter((student) => {
      const matchesStatus =
        status === "all" || student.status === status;

      const matchesClass =
        !classFilter || student.class_id === classFilter;

      const matchesBatch =
        !batchFilter || student.batches.includes(selectedBatchName);

      const searchableText =
        `${student.full_name} ${student.roll_number} ${
          student.phone ?? ""
        }`.toLowerCase();

      const matchesQuery = searchableText.includes(normalizedQuery);

      return (
        matchesStatus &&
        matchesClass &&
        matchesBatch &&
        matchesQuery
      );
    });
  }, [rows, status, classFilter, batchFilter, batches, query]);

  const count = (value: string) =>
    rows.filter((student) => student.status === value).length;

  // ----------------------------------------------------------
  // PHONE AND WHATSAPP ACTIONS
  // ----------------------------------------------------------

  const contact = async (
    phone: string | null,
    kind: "tel" | "wa"
  ) => {
    if (!phone?.trim()) {
      warn(
        "Phone unavailable",
        "No phone number is saved for this student."
      );
      return;
    }

    const url =
      kind === "tel"
        ? `tel:${phone.trim()}`
        : `https://wa.me/${phone.replace(/\D/g, "")}`;

    try {
      await Linking.openURL(url);
    } catch {
      warn("Cannot open app", "No compatible app was found.");
    }
  };

  // ----------------------------------------------------------
  // SCREEN UI
  // ----------------------------------------------------------

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={PURPLE_DARK}
        translucent={false}
      />

      {/* Purple gradient header */}
      <LinearGradient
        colors={["#611CD0", "#44109D", "#4C02F7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.top}
      >
        <View style={styles.titleRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>GYANDEEP ACADEMY</Text>
            <Text style={styles.title}>Students</Text>
            <Text style={styles.headerSubtitle}>
              Manage your students and batches
            </Text>
          </View>

          <Pressable
            style={styles.circle}
            onPress={() => router.push("/add-students")}
            accessibilityRole="button"
            accessibilityLabel="Add student"
          >
            <Feather
              name="user-plus"
              size={20}
              color={WHITE}
            />
          </Pressable>

          <Pressable
            style={styles.circle}
            onPress={() => setFilters((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel="Toggle filters"
          >
            <Feather
              name="sliders"
              size={20}
              color={WHITE}
            />
          </Pressable>
        </View>

        {/* Quick class and batch filters */}
        <View style={styles.topFilters}>
          <Pressable
            style={styles.topChip}
            onPress={() =>
              setOpenTopFilter((current) =>
                current === "batch" ? null : "batch"
              )
            }
          >
            <Feather
              name="layers"
              size={16}
              color={LAVENDER}
            />

            <Text style={styles.topChipText} numberOfLines={1}>
              {batches.find((batch) => batch.id === batchFilter)?.name ??
                "All Batches"}
            </Text>

            <Feather
              name={
                openTopFilter === "batch"
                  ? "chevron-up"
                  : "chevron-down"
              }
              size={16}
              color={WHITE}
            />
          </Pressable>

          <Pressable
            style={styles.topChip}
            onPress={() =>
              setOpenTopFilter((current) =>
                current === "class" ? null : "class"
              )
            }
          >
            <Feather
              name="book-open"
              size={16}
              color={LAVENDER}
            />

            <Text style={styles.topChipText} numberOfLines={1}>
              {classes.find((item) => item.id === classFilter)?.name ??
                "All Classes"}
            </Text>

            <Feather
              name={
                openTopFilter === "class"
                  ? "chevron-up"
                  : "chevron-down"
              }
              size={16}
              color={WHITE}
            />
          </Pressable>
        </View>

        {/* Dropdown menu */}
        {openTopFilter && (
          <View style={styles.topFilterMenu}>
            <ScrollView
              style={styles.topFilterOptions}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {[
                {
                  id: "",
                  name:
                    openTopFilter === "batch"
                      ? "All Batches"
                      : "All Classes",
                },
                ...(openTopFilter === "batch" ? batches : classes),
              ].map((option) => (
                <Pressable
                  key={option.id || "all"}
                  style={styles.topFilterOption}
                  onPress={() => {
                    if (openTopFilter === "batch") {
                      setBatchFilter(option.id);
                    } else {
                      setClassFilter(option.id);
                    }

                    setOpenTopFilter(null);
                  }}
                >
                  <Text style={styles.topFilterOptionText}>
                    {option.name}
                  </Text>

                  {((openTopFilter === "batch" &&
                    batchFilter === option.id) ||
                    (openTopFilter === "class" &&
                      classFilter === option.id)) && (
                    <Feather
                      name="check"
                      size={16}
                      color={PURPLE}
                    />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </LinearGradient>

      {/* Main content */}
      <View style={styles.body}>
        {/* Search */}
        <View style={styles.search}>
          <Feather
            name="search"
            size={18}
            color={MUTED}
          />

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, roll or phone"
            placeholderTextColor="#95A4B1"
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="Search students"
          />

          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Feather
                name="x-circle"
                size={18}
                color={MUTED}
              />
            </Pressable>
          )}
        </View>

        {/* Expanded filters */}
        {filters && (
          <View style={styles.filterBox}>
            <View style={styles.filterHeadingRow}>
              <Feather
                name="sliders"
                size={16}
                color={PURPLE}
              />
              <Text style={styles.filterHeading}>
                Filter students
              </Text>
              <Pressable
                style={styles.clearFilters}
                onPress={() => {
                  setClassFilter("");
                  setBatchFilter("");
                  setQuery("");
                }}
              >
                <Text style={styles.clearFiltersText}>Clear all</Text>
              </Pressable>
            </View>

            <Text style={styles.filterTitle}>Class</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[{ id: "", name: "All Classes" }, ...classes].map(
                (item) => (
                  <Pressable
                    key={item.id || "all-classes"}
                    onPress={() => setClassFilter(item.id)}
                    style={[
                      styles.filterChip,
                      classFilter === item.id && styles.filterOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        classFilter === item.id && styles.filterTextOn,
                      ]}
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                )
              )}
            </ScrollView>

            <Text style={styles.filterTitle}>Batch</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[{ id: "", name: "All Batches" }, ...batches].map(
                (item) => (
                  <Pressable
                    key={item.id || "all-batches"}
                    onPress={() => setBatchFilter(item.id)}
                    style={[
                      styles.filterChip,
                      batchFilter === item.id && styles.filterOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        batchFilter === item.id && styles.filterTextOn,
                      ]}
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                )
              )}
            </ScrollView>
          </View>
        )}

        {/* Status tabs */}
        <View style={styles.tabs}>
          {(["active", "inactive", "all"] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setStatus(value)}
              style={[
                styles.tab,
                status === value && styles.tabOn,
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  status === value && styles.tabTextOn,
                ]}
              >
                {value === "active"
                  ? `Active ${count("active")}`
                  : value === "inactive"
                    ? `Inactive ${count("inactive")}`
                    : `All ${rows.length}`}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Skeleton, empty state, or student list */}
        {loading ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.skeletonContent}
          >
            <StudentListSkeleton />
          </ScrollView>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Feather
                name="users"
                size={32}
                color={PURPLE}
              />
            </View>

            <Text style={styles.emptyTitle}>
              No students found
            </Text>

            <Text style={styles.emptyText}>
              {rows.length
                ? "Try changing your search or filters."
                : "Add your first student to get started."}
            </Text>

            {rows.length === 0 && (
              <Pressable
                style={styles.addButton}
                onPress={() => router.push("/add-students")}
              >
                <Feather
                  name="plus"
                  size={18}
                  color={WHITE}
                />
                <Text style={styles.addText}>Add Student</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.studentList}
          >
            {filtered.map((student) => (
              <Pressable
                key={student.id}
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: "/student-details",
                    params: { id: student.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`View ${student.full_name} details`}
              >
                <View style={styles.studentRow}>
                  {student.photo_path ? (
                    <Image
                      source={{ uri: student.photo_path }}
                      style={styles.avatar}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.avatarEmpty}>
                      <Feather
                        name="user"
                        size={27}
                        color={PURPLE}
                      />
                    </View>
                  )}

                  <View style={styles.studentDetails}>
                    <Text style={styles.name} numberOfLines={2}>
                      {student.full_name}
                    </Text>

                    <Text style={styles.meta} numberOfLines={1}>
                      Roll: {student.roll_number}
                    </Text>

                    {student.phone ? (
                      <Text style={styles.meta} numberOfLines={1}>
                        {student.phone}
                      </Text>
                    ) : null}

                    <View style={styles.classPill}>
                      <Feather
                        name="book-open"
                        size={12}
                        color={PURPLE_DARK}
                      />
                      <Text style={styles.className} numberOfLines={1}>
                        {student.className}
                      </Text>
                    </View>

                    <Text style={styles.feeText} numberOfLines={2}>
                      {student.fee_amount != null
                        ? `₹${Number(student.fee_amount).toLocaleString(
                            "en-IN"
                          )} · ${student.fee_frequency?.replace(/_/g, " ") ?? "Fee"}`
                        : "Fee not configured"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.badge,
                      student.status === "active"
                        ? styles.active
                        : styles.inactive,
                    ]}
                  >
                    <View
                      style={[
                        styles.badgeDot,
                        student.status === "active"
                          ? styles.activeDot
                          : styles.inactiveDot,
                      ]}
                    />
                    <Text
                      style={[
                        styles.badgeText,
                        student.status !== "active" &&
                          styles.inactiveBadgeText,
                      ]}
                    >
                      {student.status === "active"
                        ? "Active"
                        : "Inactive"}
                    </Text>
                  </View>
                </View>

                {student.batches.length > 0 && (
                  <View style={styles.batchRow}>
                    <Feather
                      name="layers"
                      size={13}
                      color={MUTED}
                    />
                    <Text style={styles.batchText} numberOfLines={2}>
                      {student.batches.join(", ")}
                    </Text>
                  </View>
                )}

                <View style={styles.actions}>
                  <Pressable
                    style={styles.wa}
                    onPress={(event) => {
                      event.stopPropagation();
                      void contact(student.phone, "wa");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`WhatsApp ${student.full_name}`}
                  >
                    <Feather
                      name="message-circle"
                      size={17}
                      color={WHITE}
                    />
                    <Text style={styles.actionButtonText}>
                      WhatsApp
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.call}
                    onPress={(event) => {
                      event.stopPropagation();
                      void contact(student.phone, "tel");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${student.full_name}`}
                  >
                    <Feather
                      name="phone"
                      size={16}
                      color={WHITE}
                    />
                    <Text style={styles.actionButtonText}>
                      Call
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Floating add button */}
      {!loading && (
        <Pressable
          style={styles.fab}
          onPress={() => router.push("/add-students")}
          accessibilityRole="button"
          accessibilityLabel="Add a student"
        >
          <Feather name="plus" size={22} color={WHITE} />
          <Text style={styles.fabText}>Add Student</Text>
        </Pressable>
      )}

      <AppAlert
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onConfirm={() =>
          setAlert((current) => ({ ...current, visible: false }))
        }
        onCancel={() =>
          setAlert((current) => ({ ...current, visible: false }))
        }
      />
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },

  top: {
    paddingTop: 35,
    paddingHorizontal: 18,
    paddingBottom: 19,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    overflow: "hidden",
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 18,
  },

  headerText: {
    flex: 1,
    minWidth: 0,
  },

  eyebrow: {
    color: LAVENDER,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 4,
  },

  title: {
    color: WHITE,
    fontSize: 27,
    fontWeight: "800",
  },

  headerSubtitle: {
    color: "#F3EFFF",
    fontSize: 11,
    marginTop: 4,
  },

  circle: {
    width: 41,
    height: 41,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },

  topFilters: {
    flexDirection: "row",
    gap: 10,
  },

  topChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.19)",
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 13,
  },

  topChipText: {
    flex: 1,
    color: WHITE,
    fontWeight: "700",
    fontSize: 12,
  },

  topFilterMenu: {
    backgroundColor: WHITE,
    borderRadius: 14,
    marginTop: 10,
    overflow: "hidden",
  },

  topFilterOptions: {
    maxHeight: 220,
  },

  topFilterOption: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },

  topFilterOptionText: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "600",
  },

  body: {
    flex: 1,
    padding: 16,
  },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
    backgroundColor: WHITE,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },

  searchInput: {
    flex: 1,
    minHeight: 46,
    color: TEXT,
    fontSize: 14,
  },

  filterBox: {
    backgroundColor: WHITE,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
    gap: 8,
  },

  filterHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 4,
  },

  filterHeading: {
    flex: 1,
    color: TEXT,
    fontSize: 13,
    fontWeight: "800",
  },

  clearFilters: {
    paddingVertical: 5,
    paddingHorizontal: 7,
  },

  clearFiltersText: {
    color: PURPLE_DARK,
    fontSize: 12,
    fontWeight: "700",
  },

  filterTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: TEXT,
    marginTop: 4,
  },

  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 7,
    marginVertical: 5,
    backgroundColor: WHITE,
  },

  filterOn: {
    backgroundColor: PURPLE_DARK,
    borderColor: PURPLE_DARK,
  },

  filterChipText: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "700",
  },

  filterTextOn: {
    color: WHITE,
  },

  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },

  tab: {
    flex: 1,
    alignItems: "center",
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    paddingHorizontal: 7,
    paddingVertical: 10,
  },

  tabOn: {
    backgroundColor: PURPLE_DARK,
    borderColor: PURPLE_DARK,
  },

  tabText: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "700",
  },

  tabTextOn: {
    color: WHITE,
  },

  skeletonContent: {
    paddingBottom: 110,
  },

  studentList: {
    paddingBottom: 110,
    gap: 12,
  },

  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 12,
  },

  studentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },

  avatar: {
    width: 72,
    height: 78,
    borderRadius: 16,
    backgroundColor: "#E8E3F5",
  },

  avatarEmpty: {
    width: 72,
    height: 78,
    borderRadius: 16,
    backgroundColor: "#F0EBFF",
    alignItems: "center",
    justifyContent: "center",
  },

  studentDetails: {
    flex: 1,
    minWidth: 0,
  },

  name: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    color: TEXT,
  },

  meta: {
    fontSize: 11,
    color: MUTED,
    marginTop: 5,
  },

  classPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F0EBFF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 7,
    maxWidth: "100%",
  },

  className: {
    fontSize: 11,
    color: PURPLE_DARK,
    fontWeight: "800",
    flexShrink: 1,
  },

  feeText: {
    fontSize: 11,
    color: MUTED,
    marginTop: 7,
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  active: {
    backgroundColor: "#E8F7EE",
  },

  inactive: {
    backgroundColor: "#FDECEC",
  },

  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  activeDot: {
    backgroundColor: "#16834A",
  },

  inactiveDot: {
    backgroundColor: "#D62828",
  },

  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#16834A",
  },

  inactiveBadgeText: {
    color: "#D62828",
  },

  batchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 12,
  },

  batchText: {
    flex: 1,
    fontSize: 11,
    color: MUTED,
    lineHeight: 16,
  },

  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  actionButtonText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "800",
  },

  wa: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 13,
    backgroundColor: "#128C50",
  },

  call: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 13,
    backgroundColor: PURPLE_DARK,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#F0EBFF",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
    marginTop: 14,
  },

  emptyText: {
    fontSize: 13,
    color: MUTED,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 19,
  },

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: PURPLE_DARK,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 13,
    marginTop: 16,
  },

  addText: {
    color: WHITE,
    fontWeight: "800",
    fontSize: 13,
  },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PURPLE_DARK,
    paddingHorizontal: 19,
    paddingVertical: 15,
    borderRadius: 25,
    elevation: 5,
    shadowColor: PURPLE_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },

  fabText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "800",
  },
});