
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const WHITE = "#FFFFFF";
const MUTED = "#9DB1BE";
const RED = "#C53E3E";

type Role = "owner" | "manager" | "teacher";

type Staff = {
  id: string;
  full_name: string;
  phone: string | null;
  staff_type?: string | null;
  status?: string | null;
};

const PERMISSIONS = [
  { key: "attendance", label: "Mark & view attendance" },
  { key: "students", label: "View students" },
  { key: "fees", label: "View & record fees" },
  { key: "exams", label: "Exams & tests" },
  { key: "notices", label: "Send notices" },
  { key: "reports", label: "Download reports" },
  { key: "materials", label: "Share study material" },
] as const;

type PermissionKey = (typeof PERMISSIONS)[number]["key"];

type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: AppAlertType;
  after?: () => void;
};

const emptyPermissions = (): Record<PermissionKey, boolean> => ({
  attendance: false,
  students: false,
  fees: false,
  exams: false,
  notices: false,
  reports: false,
  materials: false,
});

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(-10);
}

function readErrorMessage(error: any) {
  return error?.message ?? "An unexpected error occurred. Please try again.";
}

export default function AddTeamMemberScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    role?: string;
    mode?: string;
    memberId?: string;
  }>();

  const isEdit = params.mode === "edit";
  const memberId = String(params.memberId ?? "");
  const initialRole = String(params.role ?? "").toLowerCase();

  const [role, setRole] = useState<Role>(
    (["owner", "manager", "teacher"].includes(initialRole)
      ? initialRole
      : "teacher") as Role,
  );

  const [step, setStep] = useState<"role" | "form">(
    isEdit || params.role ? "form" : "role",
  );

  const [instituteId, setInstituteId] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [staffOpen, setStaffOpen] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);

  const [permissions, setPermissions] =
    useState<Record<PermissionKey, boolean>>(emptyPermissions);

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
    type: AppAlertType = "error",
    after?: () => void,
  ) => {
    setAlert({ visible: true, title, message, type, after });
  };

  useEffect(() => {
    let alive = true;

    async function initialize() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) throw new Error("Please sign in first.");

        const { data: memberships, error: membershipError } = await supabase
          .from("institute_members")
          .select("institute_id,role")
          .eq("user_id", user.id)
          .limit(2);

        if (membershipError) throw membershipError;

        if (!memberships?.length) {
          throw new Error("Your account is not linked to an institute.");
        }

        if (memberships.length > 1) {
          throw new Error("Select an active institute first.");
        }

        const callerRole = String(memberships[0].role ?? "").toLowerCase();

        if (!["owner", "manager"].includes(callerRole)) {
          throw new Error("Only owners and managers can manage team members.");
        }

        const currentInstituteId = memberships[0].institute_id;

        if (alive) setInstituteId(currentInstituteId);

        const { data: staffRows, error: staffError } = await supabase
          .from("institute_staff")
          .select("id,full_name,phone,staff_type,status")
          .eq("institute_id", currentInstituteId)
          .eq("status", "active")
          .order("full_name");

        if (staffError) throw staffError;

        const staffList = (staffRows ?? []) as Staff[];

        if (alive) setStaff(staffList);

        if (isEdit) {
          if (!memberId) {
            throw new Error("The team member ID is missing.");
          }

          const { data: member, error: memberError } = await supabase
            .from("institute_team_members")
            .select(
              "id,institute_id,role,full_name,phone,staff_id,permissions,is_active",
            )
            .eq("id", memberId)
            .eq("institute_id", currentInstituteId)
            .maybeSingle();

          if (memberError) throw memberError;
          if (!member) {
            throw new Error("Team member not found or access denied.");
          }

          if (!["owner", "manager", "teacher"].includes(member.role)) {
            throw new Error("This team member has an unsupported role.");
          }

          const savedPermissions = member.permissions ?? {};
          const restoredPermissions = emptyPermissions();

          for (const permission of PERMISSIONS) {
            restoredPermissions[permission.key] =
              savedPermissions[permission.key] === true;
          }

          const linkedStaff =
            staffList.find((person) => person.id === member.staff_id) ?? null;

          if (alive) {
            setRole(member.role as Role);
            setName(member.full_name ?? "");
            setPhone(normalizePhone(member.phone));
            setSelectedStaff(linkedStaff);
            setPermissions(restoredPermissions);
          }
        }
      } catch (error: any) {
        showAlert(
          isEdit ? "Unable to load member" : "Unable to open team form",
          readErrorMessage(error),
          "error",
          () => router.back(),
        );
      } finally {
        if (alive) setLoading(false);
      }
    }

    void initialize();

    return () => {
      alive = false;
    };
  }, [isEdit, memberId]);

  const chooseRole = (nextRole: Role) => {
    setRole(nextRole);
    setStep("form");

    const enableAll = nextRole === "owner" || nextRole === "manager";

    setPermissions({
      attendance: enableAll,
      students: enableAll,
      fees: enableAll,
      exams: enableAll,
      notices: enableAll,
      reports: enableAll,
      materials: enableAll,
    });

    setSelectedStaff(null);
    setName("");
    setPhone("");
    setPin("");
    setConfirmPin("");
  };

  const selectStaff = (person: Staff) => {
    setSelectedStaff(person);
    setName(person.full_name ?? "");
    setPhone(normalizePhone(person.phone));
    setStaffOpen(false);
  };

  const teacherOptions = staff.filter(
    (person) =>
      !person.staff_type ||
      person.staff_type.toLowerCase().includes("teacher"),
  );

  const canSave =
    !!instituteId &&
    !!name.trim() &&
    /^\d{10}$/.test(phone) &&
    (isEdit || /^\d{4}$/.test(pin)) &&
    (!pin || /^\d{4}$/.test(pin)) &&
    (!pin || pin === confirmPin) &&
    (role !== "teacher" || !!selectedStaff) &&
    !saving &&
    !loading;

  const save = async () => {
    if (!name.trim()) {
      showAlert("Name required", "Enter the member's full name.", "warning");
      return;
    }

    if (!/^\d{10}$/.test(phone)) {
      showAlert(
        "Invalid mobile number",
        "Enter a valid 10-digit mobile number.",
        "warning",
      );
      return;
    }

    if (role === "teacher" && !selectedStaff) {
      showAlert(
        "Choose a staff member",
        "Select an existing teacher from Staff.",
        "warning",
      );
      return;
    }

    if (!isEdit && !/^\d{4}$/.test(pin)) {
      showAlert("Invalid PIN", "Enter a 4-digit login PIN.", "warning");
      return;
    }

    if (pin && !/^\d{4}$/.test(pin)) {
      showAlert("Invalid PIN", "The new PIN must contain 4 digits.", "warning");
      return;
    }

    if (pin && pin !== confirmPin) {
      showAlert("PIN mismatch", "Both PIN entries must match.", "warning");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Your session expired. Sign in again.");

      const payload: Record<string, unknown> = {
        instituteId,
        memberId,
        fullName: name.trim(),
        phone,
        staffId: role === "teacher" ? selectedStaff?.id ?? null : null,
        permissions,
      };

      let functionName: string;

      if (isEdit) {
        functionName = "update-team-member";

        // Leave the existing PIN unchanged unless a new PIN was entered.
        if (pin) payload.pin = pin;
      } else {
        functionName = "add-team-member";
        payload.role = role;
        payload.pin = pin;
      }

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: payload,
      });

      if (error) {
        let message = readErrorMessage(error);

        try {
          const context = error.context;
          if (context && typeof context.clone === "function") {
            const response = context.clone();
            const responseText = await response.text();

            console.error(`[${functionName}] HTTP status:`, response.status);
            console.error(`[${functionName}] Response body:`, responseText);

            if (responseText) {
              try {
                const body = JSON.parse(responseText);
                // Edge Functions commonly return { error: "..." }, not only { message: "..." }.
                message = body?.error ?? body?.message ?? message;
              } catch {
                message = responseText;
              }
            }
          }
        } catch (diagnosticError) {
          console.error(
            `[${functionName}] Could not read error response:`,
            diagnosticError,
          );
        }

        throw new Error(message);
      }

      if (!data?.success) {
        throw new Error(
          data?.error ??
            data?.message ??
            `The server did not confirm that the member was ${
              isEdit ? "updated" : "added"
            }.`,
        );
      }

      setPin("");
      setConfirmPin("");

      showAlert(
        isEdit ? "Changes saved" : "Member added",
        isEdit
          ? `${name.trim()}'s details have been updated.`
          : `${name.trim()} has been added to the team.`,
        "success",
        () => router.replace("/team" as never),
      );
    } catch (error: any) {
      console.error(`[${isEdit ? "update-team-member" : "add-team-member"}]`, error);
      showAlert(
        isEdit ? "Could not update member" : "Could not add team member",
        readErrorMessage(error),
      );
    } finally {
      setSaving(false);
    }
  };

  const heading = isEdit
    ? "Edit team member"
    : role === "owner"
      ? "Add Owner"
      : role === "manager"
        ? "Add Manager"
        : "Add Teacher";

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top, 12) + 10 },
        ]}
      >
        <Pressable
          style={styles.back}
          onPress={() => {
            if (!isEdit && step === "form" && !params.role) {
              setStep("role");
            } else {
              router.back();
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={28} color={NAVY} />
        </Pressable>

        <Text style={styles.headerTitle}>{step === "role" ? "Team" : heading}</Text>
      </View>

      {loading ? (
        <ActivityIndicator
          color={NAVY}
          size="large"
          style={{ marginTop: 40 }}
        />
      ) : step === "role" ? (
        <View style={styles.roleWrap}>
          <Text style={styles.sheetTitle}>Add to team</Text>
          <Text style={styles.subtitle}>Pick a role</Text>

          {(
            [
              {
                role: "owner",
                title: "Owner",
                desc: "Manage the institute and its team",
                icon: "grid",
              },
              {
                role: "manager",
                title: "Manager",
                desc: "Manage students, fees, attendance and more",
                icon: "user-check",
              },
              {
                role: "teacher",
                title: "Teacher",
                desc: "Access permitted features and assigned batches",
                icon: "book-open",
              },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.role}
              style={styles.roleCard}
              onPress={() => chooseRole(item.role)}
            >
              <Feather name={item.icon} size={28} color={NAVY} />
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>{item.title}</Text>
                <Text style={styles.roleDesc}>{item.desc}</Text>
              </View>
              <Feather name="chevron-right" size={25} color={MUTED} />
            </Pressable>
          ))}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.form,
              { paddingBottom: Math.max(insets.bottom, 18) + 28 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {role === "teacher" && (
              <Pressable
                style={styles.staffPicker}
                onPress={() => setStaffOpen(true)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerLabel}>Pick from staff</Text>
                  <Text style={styles.pickerValue}>
                    {selectedStaff
                      ? selectedStaff.full_name
                      : "Choose an existing teacher"}
                  </Text>
                  {selectedStaff?.phone ? (
                    <Text style={styles.staffPhone}>
                      {selectedStaff.phone}
                    </Text>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={25} color="#536B82" />
              </Pressable>
            )}

            <Text style={styles.fieldLabel}>Full name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Anita Verma"
              placeholderTextColor="#9CA6B4"
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Mobile number *</Text>
            <View style={styles.phoneWrap}>
              <Text style={styles.countryCode}>+91</Text>
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={(value) =>
                  setPhone(value.replace(/\D/g, "").slice(-10))
                }
                placeholder="10-digit number"
                placeholderTextColor="#9CA6B4"
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>

            <View style={styles.pinHeadingRow}>
              <Text style={styles.fieldLabel}>
                {isEdit ? "Change login PIN (optional)" : "4-digit login PIN *"}
              </Text>
              <View style={styles.pinBadge}>
                <Text style={styles.pinBadgeText}>
                  {isEdit ? "Optional" : "Required"}
                </Text>
              </View>
            </View>

            <View style={styles.pinWrap}>
              <TextInput
                style={styles.pinInput}
                value={pin}
                onChangeText={(value) =>
                  setPin(value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder={isEdit ? "Leave blank to keep current PIN" : "Enter 4-digit PIN"}
                placeholderTextColor="#9CA6B4"
                keyboardType="number-pad"
                secureTextEntry={!showPin}
                maxLength={4}
              />
              <Pressable
                onPress={() => setShowPin((current) => !current)}
                hitSlop={10}
              >
                <Feather
                  name={showPin ? "eye-off" : "eye"}
                  size={20}
                  color={NAVY}
                />
              </Pressable>
            </View>

            <Text style={styles.helperText}>
              {isEdit
                ? "Leave the PIN blank to keep the current login PIN."
                : "The member will use this PIN with their registered mobile number."}
            </Text>

            {(!isEdit || pin.length > 0) && (
              <>
                <Text style={styles.fieldLabel}>Confirm login PIN *</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPin}
                  onChangeText={(value) =>
                    setConfirmPin(value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="Re-enter 4-digit PIN"
                  placeholderTextColor="#9CA6B4"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                />
                {confirmPin.length === 4 && pin !== confirmPin ? (
                  <Text style={styles.errorText}>PINs do not match.</Text>
                ) : null}
              </>
            )}

            <Text style={styles.permissionsHeading}>What can they access?</Text>

            {PERMISSIONS.map((permission) => (
              <View key={permission.key} style={styles.permissionRow}>
                <Text style={styles.permissionText}>{permission.label}</Text>
                <Switch
                  value={permissions[permission.key]}
                  onValueChange={(value) =>
                    setPermissions((current) => ({
                      ...current,
                      [permission.key]: value,
                    }))
                  }
                  trackColor={{ false: "#C8D4DC", true: "#9AC7A0" }}
                  thumbColor={permissions[permission.key] ? "#43814A" : WHITE}
                />
              </View>
            ))}

            <Pressable
              style={[styles.saveButton, !canSave && styles.disabled]}
              disabled={!canSave}
              onPress={save}
            >
              {saving ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <Text style={styles.saveText}>
                  {isEdit
                    ? "Save changes"
                    : role === "teacher"
                      ? "Add teacher"
                      : `Add ${role}`}
                </Text>
              )}
            </Pressable>

            {isEdit && (
              <Text style={styles.securityNote}>
                Changes are saved through the update-team-member backend
                function. Your existing PIN stays unchanged unless you enter a
                new one.
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal
        visible={staffOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setStaffOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setStaffOpen(false)}
          />
          <View
            style={[
              styles.staffSheet,
              { paddingBottom: Math.max(insets.bottom, 18) },
            ]}
          >
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Pick from staff</Text>
                <Text style={styles.subtitle}>Choose an existing teacher</Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={() => setStaffOpen(false)}
              >
                <Feather name="x" size={22} color={NAVY} />
              </Pressable>
            </View>

            {teacherOptions.length === 0 ? (
              <Text style={styles.noStaff}>
                No active teachers found. Add a teacher in Staff first.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 340 }}>
                {teacherOptions.map((person) => (
                  <Pressable
                    key={person.id}
                    style={styles.staffOption}
                    onPress={() => selectStaff(person)}
                  >
                    <Text style={styles.staffName}>{person.full_name}</Text>
                    <Text style={styles.staffPhone}>
                      {person.phone ?? "No phone number saved"}
                      {person.staff_type ? ` · ${person.staff_type}` : ""}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <AppAlert
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        confirmLabel="OK"
        onConfirm={() => {
          const after = alert.after;
          setAlert((current) => ({
            ...current,
            visible: false,
            after: undefined,
          }));
          after?.();
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
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF2",
  },
  back: { width: 34, height: 38, justifyContent: "center" },
  headerTitle: { fontSize: 27, fontWeight: "900", color: NAVY },
  roleWrap: { padding: 22, gap: 16 },
  sheetTitle: { fontSize: 25, fontWeight: "900", color: NAVY },
  subtitle: {
    fontSize: 15,
    color: "#536B82",
    fontWeight: "600",
    marginTop: 3,
    marginBottom: 6,
  },
  roleCard: {
    backgroundColor: "#F5F7FA",
    borderRadius: 24,
    padding: 20,
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  roleTitle: { fontSize: 19, fontWeight: "900", color: NAVY },
  roleDesc: {
    fontSize: 14,
    lineHeight: 21,
    color: "#536B82",
    fontWeight: "600",
    marginTop: 2,
  },
  form: { padding: 18, gap: 12 },
  staffPicker: {
    borderWidth: 1.5,
    borderColor: "#DCE5EC",
    borderRadius: 22,
    padding: 18,
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    backgroundColor: WHITE,
  },
  pickerLabel: { fontSize: 15, color: "#536B82", fontWeight: "600" },
  pickerValue: {
    fontSize: 17,
    color: NAVY,
    fontWeight: "800",
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 16,
    color: NAVY,
    fontWeight: "700",
    marginTop: 3,
  },
  input: {
    height: 58,
    backgroundColor: WHITE,
    borderWidth: 1.5,
    borderColor: "#DADFE5",
    borderRadius: 15,
    paddingHorizontal: 18,
    fontSize: 16,
    color: NAVY,
  },
  phoneWrap: {
    height: 60,
    backgroundColor: WHITE,
    borderWidth: 1.5,
    borderColor: "#DADFE5",
    borderRadius: 15,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  countryCode: { fontSize: 17, fontWeight: "800", color: NAVY },
  phoneInput: { flex: 1, fontSize: 16, color: NAVY },
  pinHeadingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  pinBadge: {
    backgroundColor: "#E8EEF5",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  pinBadgeText: { color: NAVY, fontSize: 11, fontWeight: "800" },
  pinWrap: {
    minHeight: 58,
    backgroundColor: WHITE,
    borderWidth: 1.5,
    borderColor: "#DADFE5",
    borderRadius: 15,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pinInput: { flex: 1, fontSize: 16, color: NAVY, paddingVertical: 12 },
  helperText: { fontSize: 12, color: "#64788A", marginTop: -5 },
  errorText: {
    color: RED,
    fontSize: 13,
    fontWeight: "700",
    marginTop: -6,
  },
  permissionsHeading: {
    fontSize: 20,
    fontWeight: "900",
    color: NAVY,
    marginTop: 8,
    marginBottom: 2,
  },
  permissionRow: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: "#E5EBF0",
    borderRadius: 21,
    minHeight: 68,
    paddingHorizontal: 17,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  permissionText: {
    fontSize: 15,
    fontWeight: "600",
    color: NAVY,
    flex: 1,
  },
  saveButton: {
    minHeight: 60,
    backgroundColor: NAVY,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    paddingHorizontal: 16,
  },
  disabled: { backgroundColor: "#CBD0D7" },
  saveText: { color: WHITE, fontSize: 18, fontWeight: "800" },
  securityNote: {
    fontSize: 12,
    lineHeight: 18,
    color: "#718393",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,25,40,0.38)",
    justifyContent: "flex-end",
  },
  staffSheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 22,
    minHeight: 300,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  staffOption: {
    borderWidth: 1.5,
    borderColor: "#DCE5EC",
    borderRadius: 19,
    padding: 16,
    marginBottom: 10,
  },
  staffName: { fontSize: 18, fontWeight: "900", color: NAVY },
  staffPhone: {
    fontSize: 14,
    color: "#536B82",
    fontWeight: "600",
    marginTop: 3,
  },
  noStaff: {
    paddingVertical: 26,
    textAlign: "center",
    color: MUTED,
    fontSize: 15,
  },
});
