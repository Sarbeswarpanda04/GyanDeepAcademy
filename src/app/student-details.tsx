import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const navy = "#202F41";
const bg = "#F1F6FA";
const muted = "#9BAFBD";
const blue = "#3566AD";

type StudentDetails = {
  id: string;
  institute_id: string;
  full_name: string;
  roll_number: string;
  phone: string | null;
  photo_path: string | null;
  status: string;
  class_id: string;
  seat_number?: string | number | null;
};

type FeeDetails = {
  fee_amount: number;
  fee_frequency: string;
};

type StudentConfirmationAction = "activate" | "inactive" | "delete" | null;

function ActionRow({
  icon,
  title,
  color = navy,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.actionRow} onPress={onPress}>
      <View style={styles.actionIcon}>
        <Feather name={icon} size={25} color={color} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Feather name="chevron-right" size={24} color="#C4D2DC" />
    </Pressable>
  );
}

export default function StudentDetailsScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const studentId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [menuVisible, setMenuVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmationAction, setConfirmationAction] =
    useState<StudentConfirmationAction>(null);
  const [appAlert, setAppAlert] = useState<{
    title: string;
    message: string;
    type: AppAlertType;
    confirmLabel?: string;
    onConfirm?: () => void;
  } | null>(null);
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [className, setClassName] = useState("Class");
  const [batchNames, setBatchNames] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [fee, setFee] = useState<FeeDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const showAppAlert = useCallback(
    (
      title: string,
      message: string,
      type: AppAlertType = "info",
      onConfirm?: () => void,
      confirmLabel?: string,
    ) => {
      setAppAlert({ title, message, type, onConfirm, confirmLabel });
    },
    [],
  );

  const loadStudent = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      showAppAlert("Student unavailable", "No student ID was provided.", "error");
      return;
    }

    setLoading(true);

    try {
      const { data: s, error: studentError } = await supabase
        .from("institute_students")
        .select(
          "id,institute_id,full_name,roll_number,phone,photo_path,status,class_id",
        )
        .eq("id", studentId)
        .single();

      if (studentError) throw studentError;

      setStudent(s);

      const [classResult, feeResult, batchResult] = await Promise.all([
        supabase
          .from("institute_classes")
          .select("name")
          .eq("id", s.class_id)
          .maybeSingle(),

        supabase
          .from("institute_student_fees")
          .select("fee_amount,fee_frequency")
          .eq("institute_id", s.institute_id)
          .eq("student_id", s.id)
          .maybeSingle(),

        supabase
          .from("institute_student_batches")
          .select("batch_id")
          .eq("student_id", s.id),
      ]);

      if (classResult.error) throw classResult.error;
      if (feeResult.error) throw feeResult.error;
      if (batchResult.error) throw batchResult.error;

      setClassName(classResult.data?.name ?? "Class");
      setFee(feeResult.data ?? null);

      const batchIds = (batchResult.data ?? []).map((item) => item.batch_id);

      if (batchIds.length) {
        const { data: batches, error } = await supabase
          .from("institute_batches")
          .select("id,name")
          .eq("institute_id", s.institute_id)
          .in("id", batchIds);

        if (error) throw error;
        setBatchNames((batches ?? []).map((item) => item.name));
      } else {
        setBatchNames([]);
      }

      if (s.photo_path) {
        const { data, error } = await supabase.storage
          .from("student-photos")
          .createSignedUrl(s.photo_path, 3600);

        if (error) console.warn("Student photo:", error.message);
        setPhotoUrl(data?.signedUrl ?? null);
      } else {
        setPhotoUrl(null);
      }
    } catch (error: any) {
      showAppAlert(
        "Unable to load student",
        error?.message ?? "Please try again.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [showAppAlert, studentId]);

  useFocusEffect(
    useCallback(() => {
      void loadStudent();
    }, [loadStudent]),
  );

  const openContact = async (kind: "tel" | "wa") => {
    if (!student?.phone) {
      showAppAlert("Phone unavailable", "No phone number is saved.", "warning");
      return;
    }

    const number = student.phone.replace(/\D/g, "");
    const url =
      kind === "tel" ? `tel:${student.phone}` : `https://wa.me/${number}`;

    try {
      await Linking.openURL(url);
    } catch {
      showAppAlert("Cannot open app", "No compatible app was found.", "error");
    }
  };

  const confirmStudentAction = async () => {
    if (!student?.id || !confirmationAction || actionLoading) return;

    const action = confirmationAction;
    setActionLoading(true);
    let studentDeleted = false;

    try {
      if (action !== "delete") {
        const nextStatus = action === "activate" ? "active" : "inactive";
        const { data, error } = await supabase
          .from("institute_students")
          .update({ status: nextStatus })
          .eq("id", student.id)
          .eq("institute_id", student.institute_id)
          .select("id")
          .single();

        if (error) throw error;
        if (!data) {
          throw new Error(
            action === "activate"
              ? "Student was not activated."
              : "Student status was not updated.",
          );
        }

        setStudent({ ...student, status: nextStatus });
        setConfirmationAction(null);
        showAppAlert(
          action === "activate" ? "Student activated" : "Student marked inactive",
          action === "activate"
            ? "Student is back on the active roster."
            : "Student will no longer appear in the active roster.",
          "success",
        );
        return;
      }

      const relatedTables = [
        "institute_student_batches",
        "institute_student_subjects",
        "institute_student_fees",
      ] as const;

      for (const table of relatedTables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("student_id", student.id);

        if (error) throw error;
      }

      const { data, error } = await supabase
        .from("institute_students")
        .delete()
        .eq("id", student.id)
        .eq("institute_id", student.institute_id)
        .select("id")
        .single();

      if (error) throw error;
      if (!data) {
        throw new Error("Student was not deleted. Check your permissions.");
      }

      studentDeleted = true;
      setConfirmationAction(null);
    } catch (error: any) {
      setConfirmationAction(null);
      showAppAlert(
        action === "activate"
          ? "Activation failed"
          : action === "inactive"
            ? "Unable to update student"
            : "Unable to delete student",
        error?.message ??
          (action === "delete"
            ? "Deletion failed. Related records or permissions may need attention."
            : "Could not update this student's status."),
        "error",
      );
    } finally {
      setActionLoading(false);
      if (studentDeleted) {
        showAppAlert(
          "Student deleted",
          "The student has been removed.",
          "success",
          () => router.replace("/students"),
        );
      }
    }
  };

  const showNotConnected = (feature: string) => {
    showAppAlert(
      feature,
      `The ${feature.toLowerCase()} feature needs to be connected to your app's data and screen.`,
      "info",
    );
  };

  const appAlertModal = (
    <AppAlert
      visible={!!appAlert}
      title={appAlert?.title ?? ""}
      message={appAlert?.message ?? ""}
      type={appAlert?.type ?? "info"}
      confirmLabel={appAlert?.confirmLabel}
      onConfirm={() => {
        const onConfirm = appAlert?.onConfirm;
        setAppAlert(null);
        onConfirm?.();
      }}
      onCancel={() => setAppAlert(null)}
    />
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor={navy} />
        <ActivityIndicator size="large" color={blue} />
        <Text style={styles.loadingText}>Loading student profile...</Text>
        {appAlertModal}
      </View>
    );
  }

  if (!student) {
    return (
      <View style={styles.loading}>
        <Feather name="user-x" size={42} color={muted} />
        <Text style={styles.loadingText}>Student not found.</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>Go back</Text>
        </Pressable>
        {appAlertModal}
      </View>
    );
  }

  const amount = Number(fee?.fee_amount ?? 0);
  const frequency = (fee?.fee_frequency ?? "").replace(/_/g, " ");

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={navy} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <View style={styles.navRow}>
            <Pressable style={styles.navButton} onPress={() => router.back()}>
              <Feather name="arrow-left" size={25} color="#FFFFFF" />
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable
              style={styles.navButton}
              onPress={() =>
                router.push({
                  pathname: "/student-details-document",
                  params: { id: student.id },
                })
              }
              accessibilityLabel="Download student details document"
            >
              <Feather name="download" size={24} color="#FFFFFF" />
            </Pressable>

            <Pressable
              style={styles.navButton}
              onPress={() =>
                router.push({
                  pathname: "/add-students",
                  params: {
                    id: student.id,
                    mode: "edit",
                  },
                })
              }
            >
              <Feather name="edit-2" size={22} color="#FFFFFF" />
            </Pressable>

            <Pressable
              style={styles.navButton}
              onPress={() => setMenuVisible(true)}
            >
              <Feather name="more-vertical" size={23} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.profile}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Feather name="user" size={40} color="#7194B3" />
              </View>
            )}

            <View style={styles.profileInfo}>
              <Text style={styles.studentName}>{student.full_name}</Text>
              {student.status === "inactive" && (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>Inactive</Text>
                </View>
              )}
              <Text style={styles.studentMeta}>
                {className} · Roll {student.roll_number}
              </Text>
              <Text style={styles.studentMeta}>
                {student.phone ?? "No phone number"}
              </Text>
              {!!batchNames.length && (
                <Text style={styles.studentMeta}>{batchNames.join(", ")}</Text>
              )}
            </View>
          </View>

          <View style={styles.contactButtons}>
            <Pressable
              style={styles.whatsappButton}
              onPress={() => void openContact("wa")}
            >
              <Feather name="message-circle" size={23} color="#FFFFFF" />
              <Text style={styles.whatsappText}>WhatsApp</Text>
            </Pressable>

            <Pressable
              style={styles.callButton}
              onPress={() => void openContact("tel")}
            >
              <Feather name="phone" size={22} color="#FFFFFF" />
              <Text style={styles.callText}>Call</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Fee status</Text>
          <View style={styles.feeStats}>
            <View style={styles.feeStat}>
              <Text style={styles.statLabel}>Pending</Text>
              <Text style={styles.pendingAmount}>—</Text>
            </View>
            <View style={styles.feeStat}>
              <Text style={styles.statLabel}>Collected</Text>
              <Text style={styles.collectedAmount}>—</Text>
            </View>
            <View style={styles.feeStat}>
              <Text style={styles.statLabel}>Fee amount</Text>
              <Text style={styles.upcomingAmount}>
                ₹{amount.toLocaleString("en-IN")}
              </Text>
            </View>
          </View>
          <Text style={styles.helperText}>
            Pending and collected totals will appear when payment records are
            connected.
          </Text>
        </View>

        <View style={styles.actionsCard}>
          <ActionRow
            icon="calendar"
            title="Attendance history"
            onPress={() => showNotConnected("Attendance history")}
          />
          <View style={styles.separator} />
          <ActionRow
            icon="credit-card"
            title="Download ID card"
            onPress={() => showNotConnected("Download ID card")}
          />
          <View style={styles.separator} />
          <ActionRow
            icon="message-circle"
            title="Send reminder on WhatsApp"
            color="#22C96B"
            onPress={() => {
              const message = `Hello, this is a fee reminder from GyanDeep Academy for ${student.full_name}.`;
              if (!student.phone) {
                showAppAlert(
                  "Phone unavailable",
                  "No phone number is saved.",
                  "warning",
                );
                return;
              }
              const url = `https://wa.me/${student.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
              void Linking.openURL(url).catch(() =>
                showAppAlert("Cannot open app", "Please try again.", "error"),
              );
            }}
          />
        </View>

        <View style={styles.paymentsCard}>
          <View style={styles.paymentHeading}>
            <Text style={styles.sectionTitle}>Payments</Text>
            <Pressable onPress={() => showNotConnected("Receipts")} hitSlop={8}>
              <Text style={styles.receiptsText}>Receipts</Text>
            </Pressable>
          </View>

          <View style={styles.paymentItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentMonth}>
                {fee ? "Configured student fee" : "Fee not configured"}
              </Text>
              <Text style={styles.paymentPeriod}>
                {fee
                  ? `${frequency || "Fee frequency not specified"}`
                  : "Add a fee configuration to get started"}
              </Text>
            </View>

            <View style={styles.paymentRight}>
              <Text style={styles.paymentAmount}>
                ₹{amount.toLocaleString("en-IN")}
              </Text>
              <View style={styles.upcomingBadge}>
                <Text style={styles.upcomingBadgeText}>
                  {fee ? "Configured" : "Not set"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.studentInfoCard}>
          <Text style={styles.sectionTitle}>Student information</Text>
          <View style={styles.infoLine}>
            <Text style={styles.infoLabel}>Roll number</Text>
            <Text style={styles.infoValue}>{student.roll_number}</Text>
          </View>
          <View style={styles.infoLine}>
            <Text style={styles.infoLabel}>Class</Text>
            <Text style={styles.infoValue}>{className}</Text>
          </View>
          <View style={styles.infoLine}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>
              {student.status === "active" ? "Active" : "Inactive"}
            </Text>
          </View>
          <View style={styles.infoLine}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>
              {student.phone || "Not provided"}
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Pressable
        style={styles.fab}
        onPress={() => showNotConnected("Add payment entry")}
      >
        <Feather name="plus" size={25} color="#FFFFFF" />
        <Text style={styles.fabText}>Add Entry</Text>
      </Pressable>

      <Modal
        visible={menuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.menuOverlay}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setMenuVisible(false)}
          />

          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />

            <View style={styles.menuStudent}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.menuAvatar} />
              ) : (
                <View style={styles.menuAvatarPlaceholder}>
                  <Feather name="user" size={30} color="#64748B" />
                </View>
              )}

              <View style={{ flex: 1 }}>
                <Text style={styles.menuStudentName}>
                  {student.full_name ?? "Student"}
                </Text>
                <Text style={styles.menuStudentRoll}>
                  {student.roll_number ?? ""}
                </Text>
              </View>
            </View>

            <View style={styles.menuDivider} />

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push({
                  pathname: "/add-students",
                  params: { id: student.id, mode: "edit" },
                });
              }}
            >
              <Feather name="edit-2" size={24} color="#526A80" />
              <Text style={styles.menuItemText}>Edit details</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                showAppAlert(
                  "Mark absent for dates",
                  "Attendance screen needs to be connected.",
                  "info",
                );
              }}
            >
              <Feather name="calendar" size={24} color="#526A80" />
              <Text style={styles.menuItemText}>Mark absent for dates</Text>
            </Pressable>

            {student.status === "inactive" ? (
              <Pressable
                style={styles.menuItem}
                disabled={actionLoading}
                onPress={() => {
                  setMenuVisible(false);
                  setConfirmationAction("activate");
                }}
              >
                <Feather name="check-circle" size={24} color="#4CAF50" />
                <Text style={styles.menuItemText}>Activate student</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.menuItem}
                disabled={actionLoading}
                onPress={() => {
                  setMenuVisible(false);
                  setConfirmationAction("inactive");
                }}
              >
                <Feather name="slash" size={24} color="#526A80" />
                <Text style={styles.menuItemText}>Mark inactive</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.menuItem}
              disabled={actionLoading}
              onPress={() => {
                setMenuVisible(false);
                setConfirmationAction("delete");
              }}
            >
              <Feather name="trash-2" size={24} color="#E53935" />
              <Text style={[styles.menuItemText, { color: "#E53935" }]}>
                Delete student
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={confirmationAction !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!actionLoading) setConfirmationAction(null);
        }}
      >
        <View style={styles.confirmationOverlay}>
          <Pressable
            style={styles.confirmationBackdrop}
            disabled={actionLoading}
            onPress={() => setConfirmationAction(null)}
          />

          <View style={styles.confirmationSheet}>
            <Pressable
              style={styles.confirmationClose}
              accessibilityRole="button"
              accessibilityLabel="Close confirmation"
              disabled={actionLoading}
              onPress={() => setConfirmationAction(null)}
            >
              <Feather name="x" size={25} color="#FFFFFF" />
            </Pressable>

            <View style={styles.confirmationIcon}>
              <Feather
                name={
                  confirmationAction === "delete"
                    ? "trash-2"
                    : confirmationAction === "activate"
                      ? "check-circle"
                      : "slash"
                }
                size={38}
                color={confirmationAction === "activate" ? "#4CAF50" : "#DC3B3B"}
              />
            </View>

            <Text style={styles.confirmationTitle}>
              {confirmationAction === "delete"
                ? `Delete ${student.full_name}?`
                : confirmationAction === "activate"
                  ? `Activate ${student.full_name}?`
                  : `Mark ${student.full_name} inactive?`}
            </Text>
            <Text style={styles.confirmationMessage}>
              {confirmationAction === "delete"
                ? "This permanently removes the student and their known batch, subject, and fee configuration records. Other related records may prevent deletion. This can't be undone."
                : confirmationAction === "activate"
                  ? "They'll return to the active roster and can be included in attendance."
                  : "They'll stop appearing in the active roster and won't be marked for attendance. You can reactivate them later."}
            </Text>

            <View style={styles.confirmationButtons}>
              <Pressable
                style={styles.confirmationCancel}
                disabled={actionLoading}
                onPress={() => setConfirmationAction(null)}
              >
                <Text style={styles.confirmationCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmationSubmit,
                  confirmationAction === "activate" &&
                    styles.confirmationActivate,
                  actionLoading && styles.confirmationDisabled,
                ]}
                disabled={actionLoading}
                onPress={() => void confirmStudentAction()}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmationSubmitText}>
                    {confirmationAction === "delete"
                      ? "Delete student"
                      : confirmationAction === "activate"
                        ? "Activate student"
                        : "Mark inactive"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {appAlertModal}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg },
  loading: {
    flex: 1,
    backgroundColor: bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { color: navy, fontSize: 15, fontWeight: "600" },
  scrollContent: { paddingBottom: 20 },
  header: {
    backgroundColor: navy,
    paddingHorizontal: 22,
    paddingTop: 35,
    paddingBottom: 24,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 2,
  },
  navButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#2D4158",
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    marginBottom: 25,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 25,
    backgroundColor: "#EAF1F7",
  },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  profileInfo: { flex: 1, gap: 5 },
  studentName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 2,
  },
  studentMeta: { color: "#cde5f8", fontSize: 14, fontWeight: "600" },
  inactiveBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#FDE8E8",
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  inactiveBadgeText: { color: "#B42318", fontSize: 12, fontWeight: "700" },
  contactButtons: { flexDirection: "row", gap: 12 },
  whatsappButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#02bb52",
    borderRadius: 19,
  },
  whatsappText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  callButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#006eff",
    borderRadius: 19,
  },
  callText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 18,
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 27,
  },
  sectionTitle: { color: "#536C83", fontSize: 20, fontWeight: "800" },
  feeStats: { flexDirection: "row", gap: 10, marginTop: 18 },
  feeStat: {
    flex: 1,
    minHeight: 112,
    paddingHorizontal: 10,
    paddingVertical: 15,
    backgroundColor: "#F7F9FB",
    borderRadius: 22,
    justifyContent: "center",
  },
  statLabel: { color: muted, fontSize: 12, fontWeight: "600" },
  pendingAmount: { color: navy, fontSize: 25, fontWeight: "800", marginTop: 8 },
  collectedAmount: {
    color: "#3F7D4C",
    fontSize: 25,
    fontWeight: "800",
    marginTop: 8,
  },
  upcomingAmount: {
    color: blue,
    fontSize: 23,
    fontWeight: "800",
    marginTop: 8,
  },
  helperText: { color: "#8497A6", fontSize: 11, marginTop: 12, lineHeight: 17 },
  actionsCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 16,
    marginHorizontal: 16,
    paddingHorizontal: 18,
    borderRadius: 27,
  },
  actionRow: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  actionIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: "#EDF2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { flex: 1, color: navy, fontSize: 16, fontWeight: "800" },
  separator: { height: 1, backgroundColor: "#EDF1F4" },
  paymentsCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 16,
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 27,
  },
  paymentHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  receiptsText: { color: navy, fontSize: 16, fontWeight: "800" },
  paymentItem: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28,
    gap: 12,
  },
  paymentMonth: { color: navy, fontSize: 17, fontWeight: "800" },
  paymentPeriod: { color: muted, fontSize: 13, marginTop: 7 },
  paymentRight: { alignItems: "flex-end", gap: 8 },
  paymentAmount: { color: navy, fontSize: 19, fontWeight: "800" },
  upcomingBadge: {
    backgroundColor: "#E7EFFC",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  upcomingBadgeText: { color: blue, fontSize: 12, fontWeight: "800" },
  studentInfoCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 16,
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 27,
  },
  menuOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  menuBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  menuSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 28,
  },
  menuHandle: {
    width: 42,
    height: 5,
    borderRadius: 5,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 26,
  },
  menuStudent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 14,
  },
  menuAvatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#E2E8F0",
  },
  menuAvatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  menuStudentName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1E293B",
  },
  menuStudentRoll: {
    fontSize: 16,
    color: "#94A3B8",
    marginTop: 3,
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginTop: 12,
    marginBottom: 8,
  },
  menuItem: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 30,
    gap: 30,
  },
  menuItemText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1E293B",
  },
  confirmationOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.38)",
  },
  confirmationBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  confirmationSheet: {
    position: "relative",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 66,
    paddingBottom: 34,
  },
  confirmationClose: {
    position: "absolute",
    top: -48,
    alignSelf: "center",
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "#64748B",
  },
  confirmationIcon: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 30,
    backgroundColor: "#FCE8E8",
    marginBottom: 28,
  },
  confirmationTitle: {
    color: "#1E293B",
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
  },
  confirmationMessage: {
    color: "#334155",
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 36,
  },
  confirmationButtons: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: 14,
  },
  confirmationCancel: {
    flex: 1,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#DDE5EC",
    backgroundColor: "#FFFFFF",
  },
  confirmationCancelText: {
    color: "#26384A",
    fontSize: 18,
    fontWeight: "700",
  },
  confirmationSubmit: {
    flex: 1,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#E53935",
    paddingHorizontal: 8,
  },
  confirmationActivate: { backgroundColor: "#21864A" },
  confirmationDisabled: { opacity: 0.7 },
  confirmationSubmitText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  infoLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F4",
  },
  infoLabel: { color: muted, fontSize: 14 },
  infoValue: {
    flex: 1,
    textAlign: "right",
    color: navy,
    fontSize: 14,
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 22,
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: navy,
    paddingHorizontal: 24,
    borderRadius: 27,
    elevation: 6,
  },
  fabText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  backButton: {
    backgroundColor: navy,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backText: { color: "#FFFFFF", fontWeight: "800" },
});
