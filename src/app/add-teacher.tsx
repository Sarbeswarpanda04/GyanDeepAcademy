
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const MUTED = "#617789";
const BORDER = "#DDE5EC";
const WHITE = "#FFFFFF";

const HOLIDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type SalaryType = "monthly" | "daily" | "batch";

const dateISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const prettyDate = (value: string) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Select date";

function base64ToBytes(base64: string): Uint8Array {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    if (char === "=") break;
    const value = alphabet.indexOf(char);
    if (value < 0) continue;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(output);
}

export default function AddTeacherScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const teacherId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isEditing = Boolean(teacherId);
  const [appAlert, setAppAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AppAlertType;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    visible: false,
    title: "",
    message: "",
    type: "info",
    confirmLabel: "OK",
  });

  const showAppAlert = (
    title: string,
    message?: string,
    buttons?: Array<{ text?: string; onPress?: () => void; style?: string }>
  ) => {
    const confirm = buttons?.[0];
    const cancel = buttons?.[1];
    const normalizedTitle = title.toLowerCase();
    const type: AppAlertType =
      /fail|error|unable|invalid|cannot|could not|permission required|not linked|expired/.test(normalizedTitle)
        ? "error"
        : /success|added|updated/.test(normalizedTitle)
          ? "success"
          : /required|holiday|future|warning/.test(normalizedTitle)
            ? "warning"
            : "info";

    setAppAlert({
      visible: true,
      title,
      message: message ?? "",
      type,
      confirmLabel: confirm?.text ?? "OK",
      cancelLabel: cancel?.text,
      onConfirm: confirm?.onPress,
      onCancel: cancel?.onPress,
    });
  };

  const closeAppAlert = () => setAppAlert((current) => ({ ...current, visible: false }));

  const [instituteId, setInstituteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [photo, setPhoto] = useState("");
  const [photoSelected, setPhotoSelected] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [staffType, setStaffType] = useState("Teacher");

  const [salaryType, setSalaryType] = useState<SalaryType>("monthly");
  const [amount, setAmount] = useState("");
  const [weeklyHolidays, setWeeklyHolidays] = useState<string[]>(["Sun"]);

  const [dob, setDob] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  useEffect(() => {
    let mounted = true;

    async function loadInstitute() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) throw new Error("Please sign in first.");

        const { data: memberships, error } = await supabase
          .from("institute_members")
          .select("institute_id, role")
          .eq("user_id", user.id);

        if (error) throw error;
        if (!memberships?.length) {
          throw new Error("Your account is not linked to an institute.");
        }
        if (memberships.length !== 1) {
          throw new Error("Select one active institute first.");
        }
        if (!["owner", "manager"].includes(memberships[0].role)) {
          throw new Error("Only owners and managers can manage teachers.");
        }

        const activeInstituteId = memberships[0].institute_id;
        if (mounted) setInstituteId(activeInstituteId);

        // In edit mode, load the existing teacher and prefill the same form.
        if (teacherId) {
          const { data: person, error: personError } = await supabase
            .from("institute_staff")
            .select("id,full_name,phone,photo_path,staff_type,salary_type,salary_amount,date_of_birth,weekly_holidays,status")
            .eq("id", teacherId)
            .eq("institute_id", activeInstituteId)
            .maybeSingle();

          if (personError) throw personError;
          if (!person) throw new Error("Teacher record was not found.");
          if (!mounted) return;

          setName(person.full_name ?? "");
          setPhone(person.phone ?? "");
          setStaffType((person.staff_type ?? "teacher").toLowerCase().replace(/^\w/, (letter: string) => letter.toUpperCase()));
          setSalaryType((person.salary_type ?? "monthly") as SalaryType);
          setAmount(String(person.salary_amount ?? ""));
          setWeeklyHolidays(Array.isArray(person.weekly_holidays) && person.weekly_holidays.length
            ? person.weekly_holidays
            : ["Sun"]);
          setDob(person.date_of_birth ?? "");

          if (person.photo_path) {
            const { data: photoData } = await supabase.storage
              .from("staff-photos")
              .createSignedUrl(person.photo_path, 3600);
            if (mounted) setPhoto(photoData?.signedUrl ?? "");
          }
        }
      } catch (error: any) {
        showAppAlert(
          "Cannot open form",
          error?.message ?? "Please try again."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadInstitute();
    return () => {
      mounted = false;
    };
  }, []);

  const choosePhoto = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showAppAlert(
          "Permission required",
          "Allow photo library access to select a teacher photo."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhoto(result.assets[0].uri);
        setPhotoSelected(true);
      }
    } catch (error: any) {
      showAppAlert(
        "Photo selection failed",
        error?.message ?? "Could not open the photo library."
      );
    }
  };

  const toggleHoliday = (day: string) => {
    setWeeklyHolidays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day]
    );
  };

  async function uploadTeacherPhoto(staffId: string): Promise<string> {
    if (!photo) {
      throw new Error("Select a teacher photo before uploading.");
    }

    // Use the MIME type supplied by the picker when available.
    const selectedAsset = photo;
    const extensionFromUri = selectedAsset
      .split("?")[0]
      .split(".")
      .pop()
      ?.toLowerCase();

    const mimeType =
      extensionFromUri === "png"
        ? "image/png"
        : extensionFromUri === "webp"
          ? "image/webp"
          : "image/jpeg";

    const extension =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : "jpg";

    // expo-file-system reads local picker URIs; fetch(uri) can fail on devices.
    const base64 = await FileSystem.readAsStringAsync(selectedAsset, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64) {
      throw new Error("The selected image is empty. Please select it again.");
    }

    const bytes = base64ToBytes(base64);
    if (!bytes.length) {
      throw new Error("Could not decode the selected image.");
    }

    const path = `${instituteId}/${staffId}/profile.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("staff-photos")
      .upload(path, bytes, {
        upsert: true,
        contentType: mimeType,
      });

    if (uploadError) {
      throw new Error(`Supabase Storage: ${uploadError.message}`);
    }

    const { error: updateError } = await supabase
      .from("institute_staff")
      .update({ photo_path: path })
      .eq("id", staffId)
      .eq("institute_id", instituteId);

    if (updateError) {
      throw new Error(`Could not save photo path: ${updateError.message}`);
    }

    return path;
  }

  const saveTeacher = async () => {
    if (!instituteId) {
      showAppAlert(
        "Institute unavailable",
        "Reopen this page and try again."
      );
      return;
    }

    if (!name.trim()) {
      showAppAlert("Name required", "Enter the teacher's full name.");
      return;
    }

    if (phone.trim() && !/^\d{10}$/.test(phone.trim())) {
      showAppAlert("Invalid phone", "Enter a 10-digit mobile number.");
      return;
    }

    const salaryAmount = Number(amount);
    if (
      !amount.trim() ||
      !Number.isFinite(salaryAmount) ||
      salaryAmount < 0
    ) {
      showAppAlert("Invalid salary", "Enter a valid salary amount.");
      return;
    }

    if (!weeklyHolidays.length) {
      showAppAlert("Weekly holidays", "Select at least one holiday.");
      return;
    }

    if (dob && dob > dateISO(new Date())) {
      showAppAlert("Invalid date", "Date of birth cannot be in the future.");
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

      const { data: membership, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id, role")
        .eq("user_id", user.id)
        .eq("institute_id", instituteId)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (
        !membership ||
        !["owner", "manager"].includes(membership.role)
      ) {
        throw new Error("You do not have permission to manage teachers.");
      }

      const teacherValues = {
        institute_id: instituteId,
        full_name: name.trim(),
        phone: phone.trim() || null,
        staff_type: staffType.toLowerCase(),
        salary_type: salaryType,
        salary_amount: salaryAmount,
        weekly_holidays: weeklyHolidays,
        date_of_birth: dob || null,
      };

      let savedTeacherId = teacherId;

      if (isEditing && teacherId) {
        const { error: updateError } = await supabase
          .from("institute_staff")
          .update(teacherValues)
          .eq("id", teacherId)
          .eq("institute_id", instituteId);
        if (updateError) throw updateError;
      } else {
        const { data: staff, error: insertError } = await supabase
          .from("institute_staff")
          .insert({
            ...teacherValues,
            status: "active",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;
        if (!staff?.id) throw new Error("Teacher was created but no ID was returned.");
        savedTeacherId = staff.id;
      }

      // Only upload when the user selects a new photo; keep the existing photo otherwise.
      if (photoSelected && photo && savedTeacherId) {
        try {
          await uploadTeacherPhoto(savedTeacherId);
        } catch (photoError: any) {
          showAppAlert(
            isEditing ? "Teacher updated, photo upload failed" : "Teacher created, photo upload failed",
            `${photoError?.message ?? "Unknown photo error"}\n\nThe teacher details were saved, but the new photo could not be uploaded.`,
            [
              { text: "Back to Teachers", onPress: () => router.replace("/teacher" as never) },
              { text: "Stay here", style: "cancel" },
            ]
          );
          return;
        }
      }

      showAppAlert(
        isEditing ? "Teacher updated" : "Teacher added",
        `${name.trim()} ${isEditing ? "has been updated" : "has been added"} successfully${photoSelected ? " with photo" : ""}.`,
        [{ text: "OK", onPress: () => router.replace("/teacher" as never) }]
      );
    } catch (error: any) {
      showAppAlert(
        "Could not save teacher",
        error?.message ?? "Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const salaryLabel =
    salaryType === "monthly"
      ? "Monthly salary (₹)"
      : salaryType === "daily"
        ? "Daily wages (₹)"
        : "Batch wages (₹)";

  const changeMonth = (delta: number) => {
    setCalendarMonth(
      new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() + delta,
        1
      )
    );
  };

  const daysInMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0
  ).getDate();

  const firstDay =
    (new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1
    ).getDay() + 6) % 7;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={25} color={WHITE} />
        </Pressable>
        <Text style={styles.headerTitle}>{isEditing ? "Edit Teacher" : "Add Teacher"}</Text>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={NAVY} />
          <Text style={styles.loadingText}>{isEditing ? "Loading teacher details…" : "Preparing form…"}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={styles.photoArea} onPress={choosePhoto}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Feather name="camera" size={34} color="#9CB0BD" />
              </View>
            )}
            <Text style={styles.photoLabel}>
              {photo ? "Change photo" : "Add photo"}
            </Text>
          </Pressable>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Anita Sharma"
            placeholderTextColor="#9DB1BE"
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.label}>Phone number</Text>
          <View style={styles.phoneInput}>
            <Text style={styles.countryCode}>+91</Text>
            <View style={styles.phoneDivider} />
            <TextInput
              value={phone}
              onChangeText={(value) =>
                setPhone(value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="10-digit number (optional)"
              placeholderTextColor="#9DB1BE"
              keyboardType="phone-pad"
              style={styles.phoneText}
              maxLength={10}
            />
          </View>

          <Text style={styles.label}>Staff type</Text>
          <View style={styles.chips}>
            {[
              "Teacher",
              "Peon",
              "Driver",
              "Accountant",
              "Receptionist",
              "Other",
            ].map((item) => {
              const selected = staffType === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setStaffType(item)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Salary type</Text>
          <View style={styles.salarySegment}>
            {(
              [
                { label: "Monthly", value: "monthly" },
                { label: "Daily", value: "daily" },
                { label: "Batch", value: "batch" },
              ] as const
            ).map((item) => {
              const selected = salaryType === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setSalaryType(item.value)}
                  style={[
                    styles.salarySegmentItem,
                    selected && styles.salarySegmentSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.salarySegmentText,
                      selected && styles.salarySegmentTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{salaryLabel}</Text>
          <View style={styles.moneyInput}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor="#9DB1BE"
              keyboardType="decimal-pad"
              style={styles.moneyText}
            />
          </View>

          <Text style={styles.label}>
            Weekly holidays{" "}
            <Text style={styles.optional}>(select multiple)</Text>
          </Text>
          <View style={styles.holidays}>
            {HOLIDAYS.map((day) => {
              const selected = weeklyHolidays.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggleHoliday(day)}
                  style={[styles.day, selected && styles.daySelected]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      selected && styles.dayTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>
            Date of birth{" "}
            <Text style={styles.optional}>(optional)</Text>
          </Text>
          <Pressable
            style={styles.dateInput}
            onPress={() => {
              setCalendarMonth(
                dob ? new Date(`${dob}T12:00:00`) : new Date()
              );
              setDateOpen(true);
            }}
          >
            <Text style={[styles.dateText, !dob && styles.placeholderText]}>
              {dob ? prettyDate(dob) : "Select date"}
            </Text>
            <Feather name="calendar" size={21} color={MUTED} />
          </Pressable>

          {!!dob && (
            <Pressable onPress={() => setDob("")}>
              <Text style={styles.clearDate}>Clear date</Text>
            </Pressable>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Pressable
          disabled={loading || saving}
          onPress={() => void saveTeacher()}
          style={[
            styles.saveButton,
            (loading || saving) && styles.saveButtonDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text style={styles.saveText}>{isEditing ? "Update Teacher" : "Save Teacher"}</Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={dateOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDateOpen(false)}
      >
        <View style={styles.modalShade}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarHeader}>
              <Pressable onPress={() => changeMonth(-1)} hitSlop={10}>
                <Feather name="chevron-left" size={25} color={NAVY} />
              </Pressable>
              <Text style={styles.calendarTitle}>
                {calendarMonth.toLocaleDateString("en-IN", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              <Pressable onPress={() => changeMonth(1)} hitSlop={10}>
                <Feather name="chevron-right" size={25} color={NAVY} />
              </Pressable>
            </View>

            <View style={styles.calendarGrid}>
              {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                <Text key={`${day}-${index}`} style={styles.weekday}>
                  {day}
                </Text>
              ))}

              {Array.from({ length: firstDay }, (_, index) => (
                <View key={`blank-${index}`} style={styles.dayBlank} />
              ))}

              {Array.from({ length: daysInMonth }, (_, index) => {
                const day = index + 1;
                const value = dateISO(
                  new Date(
                    calendarMonth.getFullYear(),
                    calendarMonth.getMonth(),
                    day
                  )
                );
                const selected = value === dob;
                const future = value > dateISO(new Date());

                return (
                  <Pressable
                    key={day}
                    disabled={future}
                    onPress={() => {
                      setDob(value);
                      setDateOpen(false);
                    }}
                    style={[
                      styles.calendarDay,
                      selected && styles.calendarSelected,
                      future && styles.futureDay,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        selected && styles.calendarDayTextSelected,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={styles.cancelDate}
              onPress={() => setDateOpen(false)}
            >
              <Text style={styles.cancelDateText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <AppAlert
        visible={appAlert.visible}
        title={appAlert.title}
        message={appAlert.message}
        type={appAlert.type}
        confirmLabel={appAlert.confirmLabel}
        cancelLabel={appAlert.cancelLabel}
        onConfirm={() => {
          const callback = appAlert.onConfirm;
          closeAppAlert();
          callback?.();
        }}
        onCancel={() => {
          const callback = appAlert.onCancel;
          closeAppAlert();
          callback?.();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: WHITE },
  header: {
    height: 78,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: "35",
    paddingHorizontal: 18,
    gap: 14,
  },
  backButton: {
    width: 34,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: WHITE },
  content: { paddingHorizontal: 18, paddingBottom: 22 },
  photoArea: { alignItems: "center", paddingTop: 28, paddingBottom: 28 },
  photoPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 30,
    backgroundColor: BG,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#C8D5DE",
    alignItems: "center",
    justifyContent: "center",
  },
  photo: {
    width: 112,
    height: 112,
    borderRadius: 30,
    backgroundColor: BG,
  },
  photoLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#6585A2",
    marginTop: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: MUTED,
    marginTop: 20,
    marginBottom: 10,
  },
  optional: { fontWeight: "500", fontSize: 13, color: "#94A7B4" },
  input: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 16,
    fontSize: 17,
    color: NAVY,
  },
  phoneInput: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  countryCode: { fontSize: 16, fontWeight: "800", color: MUTED },
  phoneDivider: {
    width: 1,
    height: 30,
    backgroundColor: BORDER,
    marginHorizontal: 13,
  },
  phoneText: { flex: 1, fontSize: 16, color: NAVY },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 28,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  chipSelected: { backgroundColor: NAVY, borderColor: NAVY },
  chipText: { fontSize: 15, fontWeight: "600", color: MUTED },
  chipTextSelected: { color: WHITE },
  salarySegment: {
    backgroundColor: "#EDF1F5",
    padding: 5,
    borderRadius: 18,
    flexDirection: "row",
    gap: 3,
  },
  salarySegmentItem: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
  },
  salarySegmentSelected: { backgroundColor: WHITE },
  salarySegmentText: { fontSize: 15, fontWeight: "700", color: MUTED },
  salarySegmentTextSelected: { color: NAVY },
  moneyInput: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rupee: { fontSize: 19, fontWeight: "800", color: MUTED },
  moneyText: { flex: 1, fontSize: 18, color: NAVY },
  holidays: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  day: {
    minWidth: 50,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  daySelected: { backgroundColor: NAVY, borderColor: NAVY },
  dayText: { fontSize: 14, fontWeight: "700", color: MUTED },
  dayTextSelected: { color: WHITE },
  dateInput: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: { fontSize: 16, color: NAVY },
  placeholderText: { color: "#9DB1BE" },
  clearDate: {
    color: "#C34C57",
    fontWeight: "700",
    marginTop: 8,
    alignSelf: "flex-end",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: "#E5EBF0",
  },
  saveButton: {
    height: 60,
    borderRadius: 17,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: { opacity: 0.65 },
  saveText: { fontSize: 20, fontWeight: "800", color: WHITE },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: MUTED, marginTop: 10 },
  modalShade: {
    flex: 1,
    backgroundColor: "#0008",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  calendarModal: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: WHITE,
    borderRadius: 22,
    padding: 18,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  calendarTitle: { fontSize: 17, fontWeight: "800", color: NAVY },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: {
    width: "14.2857%",
    textAlign: "center",
    paddingVertical: 8,
    color: MUTED,
    fontWeight: "700",
  },
  dayBlank: { width: "14.2857%", height: 42 },
  calendarDay: {
    width: "14.2857%",
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  calendarSelected: { backgroundColor: NAVY },
  futureDay: { opacity: 0.3 },
  calendarDayText: { color: NAVY, fontWeight: "600" },
  calendarDayTextSelected: { color: WHITE },
  cancelDate: { marginTop: 12, alignSelf: "flex-end", padding: 10 },
  cancelDateText: { color: NAVY, fontWeight: "800" },
});
