import React, { useEffect, useState } from "react";
import { Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import {
  ActivityIndicator,
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
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import AppAlert, { AppAlertType } from "../../components/AppAlert";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const MUTED = "#58718A";
const BORDER = "#DDE5EC";
const WHITE = "#FFFFFF";
type PaymentMethod = "cash" | "upi" | "bank";

const getParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const money = (amount: number) =>
  `₹${Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function RecordPayoutScreen() {
  const params = useLocalSearchParams<{
    id: string | string[];
    instituteId?: string | string[];
    month?: string | string[];
    year?: string | string[];
    salaryAmount?: string | string[];
    payoutId?: string | string[];
    amount?: string | string[];
    description?: string | string[];
    paymentMethod?: string | string[];
    paidDate?: string | string[];
  }>();

  const staffId = getParam(params.id) ?? "";
  const instituteId = getParam(params.instituteId) ?? "";
  const payoutId = getParam(params.payoutId);
  const month = Number(getParam(params.month) ?? new Date().getMonth() + 1);
  const year = Number(getParam(params.year) ?? new Date().getFullYear());
  const monthDate = new Date(year, month - 1, 1);
  const [amount, setAmount] = useState(
    getParam(params.amount) ?? getParam(params.salaryAmount) ?? "",
  );
  const [description, setDescription] = useState(
    getParam(params.description) ?? "",
  );
  const [method, setMethod] = useState<PaymentMethod>(
    (getParam(params.paymentMethod) as PaymentMethod) || "cash",
  );
  const [paidDate, setPaidDate] = useState(() => {
    const raw = getParam(params.paidDate);
    return raw ? new Date(`${raw}T12:00:00`) : new Date();
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proofImage, setProofImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [existingProofPath, setExistingProofPath] = useState<string | null>(
    null,
  );
  const [existingProofUri, setExistingProofUri] = useState<string | null>(null);
  const [loadingExistingProof, setLoadingExistingProof] = useState(false);

  // When editing a payout, load its saved proof path and create a temporary
  // URL so the previously uploaded image is visible before choosing a new one.
  useEffect(() => {
    let active = true;

    const loadExistingProof = async () => {
      if (!payoutId || !staffId || !instituteId) return;
      setLoadingExistingProof(true);
      try {
        const { data, error } = await supabase
          .from("staff_payouts")
          .select("proof_image_path")
          .eq("id", payoutId)
          .eq("staff_id", staffId)
          .eq("institute_id", instituteId)
          .maybeSingle();

        if (error) throw error;
        const path = data?.proof_image_path;
        if (!path || !active) return;

        setExistingProofPath(path);
        const { data: signed, error: signedError } = await supabase.storage
          .from("staff-salary-proofs")
          .createSignedUrl(path, 60 * 60);

        if (signedError) throw signedError;
        if (active && signed?.signedUrl) setExistingProofUri(signed.signedUrl);
      } catch (error) {
        console.warn("Unable to load existing payout proof:", error);
      } finally {
        if (active) setLoadingExistingProof(false);
      }
    };

    void loadExistingProof();
    return () => {
      active = false;
    };
  }, [payoutId, staffId, instituteId]);
  const [alert, setAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AppAlertType;
    onConfirm?: () => void;
  }>({ visible: false, title: "", message: "", type: "info" });

  const showAlert = (
    title: string,
    message: string,
    type: AppAlertType = "info",
    onConfirm?: () => void,
  ) => setAlert({ visible: true, title, message, type, onConfirm });

  const closeAlert = () =>
    setAlert((current) => ({
      ...current,
      visible: false,
      onConfirm: undefined,
    }));

  const chooseProofImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert(
          "Photo permission needed",
          "Allow photo-library access to attach a payment screenshot.",
          "warning",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0])
        setProofImage(result.assets[0]);
    } catch (error: any) {
      showAlert(
        "Unable to select image",
        error?.message ?? "Please try again.",
        "error",
      );
    }
  };

  const savePayout = async () => {
    const parsedAmount = Number(amount);
    if (!staffId || !instituteId) {
      showAlert(
        "Missing details",
        "Open this page from the teacher details screen.",
        "error",
      );
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showAlert(
        "Invalid amount",
        "Enter a payout amount greater than ₹0.",
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
      if (!user)
        throw new Error("Your session has expired. Please sign in again.");

      let proofPath: string | null = null;
      if (proofImage && method !== "cash") {
        const fileNameExt = proofImage.fileName
          ?.split(".")
          .pop()
          ?.toLowerCase();
        const mimeExt = proofImage.mimeType?.split("/").pop()?.toLowerCase();
        const extension = (
          fileNameExt && /^[a-z0-9]+$/.test(fileNameExt)
            ? fileNameExt
            : mimeExt && /^[a-z0-9]+$/.test(mimeExt)
              ? mimeExt
              : "jpg"
        ).replace("jpeg", "jpg");
        const contentType =
          proofImage.mimeType ||
          (extension === "png" ? "image/png" : "image/jpeg");
        // ImagePicker provides base64 directly. Upload an ArrayBuffer instead of
        // fetch(uri).blob(), which can be slow or unreliable in React Native.
        if (!proofImage.base64) {
          throw new Error(
            "The selected image could not be read. Please choose the image again.",
          );
        }
        const imageBuffer = decode(proofImage.base64);
        proofPath = `${instituteId}/${staffId}/${iso(new Date(year, month - 1, 1))}/${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("staff-salary-proofs")
          .upload(proofPath, imageBuffer, {
            contentType,
            upsert: false,
          });
        if (uploadError) {
          throw new Error(
            `Payment proof upload failed: ${uploadError.message}`,
          );
        }
      }

      const payload = {
        staff_id: staffId,
        institute_id: instituteId,
        amount: parsedAmount,
        paid_date: iso(paidDate),
        period_start: iso(new Date(year, month - 1, 1)),
        period_end: iso(new Date(year, month, 0)),
        note: description.trim() || null,
        payment_method: method,
        created_by: user.id,
        ...(proofPath ? { proof_image_path: proofPath } : {}),
      };

      const result = payoutId
        ? await supabase
            .from("staff_payouts")
            .update({
              amount: payload.amount,
              paid_date: payload.paid_date,
              period_start: payload.period_start,
              period_end: payload.period_end,
              note: payload.note,
              payment_method: payload.payment_method,
              ...(proofPath ? { proof_image_path: proofPath } : {}),
            })
            .eq("id", payoutId)
            .eq("staff_id", staffId)
            .eq("institute_id", instituteId)
            .select("id")
            .single()
        : await supabase
            .from("staff_payouts")
            .insert(payload)
            .select("id")
            .single();

      if (result.error) {
        if (proofPath)
          await supabase.storage
            .from("staff-salary-proofs")
            .remove([proofPath]);
        throw new Error(`Payout database save failed: ${result.error.message}`);
      }
      showAlert(
        payoutId ? "Payout updated" : "Payout saved",
        `${money(parsedAmount)} ${payoutId ? "updated" : "saved"} successfully.`,
        "success",
        () => router.back(),
      );
    } catch (error: any) {
      showAlert(
        "Could not save payout",
        error?.message ??
          "An unexpected error occurred. Please check your storage bucket and database permissions, then try again.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="chevron-left" size={28} color={NAVY} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {payoutId ? "Edit Payout" : "Record Payout"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.periodLabel}>
          {monthDate.toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })}{" "}
          salary
        </Text>

        <Text style={styles.label}>Amount</Text>
        <View style={styles.amountBox}>
          <Text style={styles.rupee}>₹</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="Enter amount"
            placeholderTextColor="#A5B5C0"
            style={styles.amountInput}
          />
        </View>

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Advance, Diwali bonus"
          placeholderTextColor="#A5B5C0"
          style={styles.textInput}
          maxLength={250}
        />

        <Text style={styles.label}>Paid via</Text>
        <View style={styles.methodsRow}>
          {(["cash", "upi", "bank"] as PaymentMethod[]).map((item) => {
            const selected = method === item;
            const label =
              item === "upi" ? "UPI" : item === "bank" ? "Bank" : "Cash";
            return (
              <Pressable
                key={item}
                onPress={() => setMethod(item)}
                style={[
                  styles.methodButton,
                  selected && styles.methodButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.methodText,
                    selected && styles.methodTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {method !== "cash" ? (
          <View style={styles.proofSection}>
            <Text style={styles.label}>
              Payment screenshot / proof (optional)
            </Text>
            <Pressable
              style={styles.uploadButton}
              onPress={() => void chooseProofImage()}
              disabled={saving}
            >
              <Feather name="upload" size={18} color={NAVY} />
              <Text style={styles.uploadButtonText}>
                {proofImage
                  ? "Change screenshot"
                  : "Upload screenshot or image"}
              </Text>
            </Pressable>
            {proofImage || existingProofUri ? (
              <View style={styles.proofPreviewRow}>
                <Image
                  source={{
                    uri: proofImage?.uri ?? existingProofUri ?? undefined,
                  }}
                  style={styles.proofPreview}
                  resizeMode="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.proofFileName} numberOfLines={2}>
                    {proofImage?.fileName ||
                      (existingProofPath
                        ? existingProofPath.split("/").pop()
                        : "Payment screenshot selected")}
                  </Text>
                  {proofImage ? (
                    <Pressable
                      onPress={() => setProofImage(null)}
                      disabled={saving}
                    >
                      <Text style={styles.removeProof}>Cancel replacement</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.proofHint}>
                      Saved proof. Choose another image above to replace it.
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <Text style={styles.proofHint}>
                {loadingExistingProof
                  ? "Loading saved payment proof..."
                  : "Attach a UPI transaction screenshot or bank transfer receipt."}
              </Text>
            )}
          </View>
        ) : null}

        <Text style={styles.label}>Payment date</Text>
        <Pressable
          style={styles.dateButton}
          onPress={() => setDatePickerOpen(true)}
        >
          <Feather name="calendar" size={21} color={MUTED} />
          <Text style={styles.dateText}>
            {paidDate.toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </Text>
          <Feather name="chevron-down" size={20} color={MUTED} />
        </Pressable>

        {datePickerOpen && (
          <DateTimePicker
            value={paidDate}
            mode="date"
            maximumDate={new Date()}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event, selectedDate) => {
              if (Platform.OS !== "ios" || event.type === "dismissed") {
                setDatePickerOpen(false);
              }
              if (selectedDate) setPaidDate(selectedDate);
            }}
          />
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          disabled={saving}
          onPress={() => void savePayout()}
          style={[styles.saveButton, saving && { opacity: 0.65 }]}
        >
          {saving ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text style={styles.saveButtonText}>
              {payoutId ? "Update Payout" : "Save Payout"}
            </Text>
          )}
        </Pressable>
      </View>

      <AppAlert {...alert} onCancel={closeAlert} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    minHeight: 72,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF2",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 23, fontWeight: "800", color: NAVY },
  content: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 30 },
  periodLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: MUTED,
    marginBottom: 28,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: MUTED,
    marginBottom: 12,
    marginTop: 20,
  },
  amountBox: {
    height: 62,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  rupee: { fontSize: 23, fontWeight: "700", color: MUTED, marginRight: 10 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: "700", color: NAVY },
  textInput: {
    minHeight: 62,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 17,
    fontSize: 18,
    color: NAVY,
  },
  methodsRow: { flexDirection: "row", gap: 12 },
  methodButton: {
    flex: 1,
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  methodButtonSelected: { backgroundColor: NAVY, borderColor: NAVY },
  methodText: { fontSize: 17, fontWeight: "700", color: MUTED },
  methodTextSelected: { color: WHITE },
  dateButton: {
    height: 62,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 17,
    gap: 12,
  },
  dateText: { flex: 1, fontSize: 19, fontWeight: "700", color: NAVY },
  proofSection: {
    marginTop: 14,
    padding: 13,
    borderRadius: 15,
    backgroundColor: "#EAF0F5",
    borderWidth: 1,
    borderColor: BORDER,
  },
  uploadButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#9AABBA",
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 10,
  },
  uploadButtonText: { color: NAVY, fontSize: 14, fontWeight: "800" },
  proofPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 12,
  },
  proofPreview: {
    width: 70,
    height: 70,
    borderRadius: 10,
    backgroundColor: WHITE,
  },
  proofFileName: { color: NAVY, fontSize: 13, fontWeight: "700" },
  removeProof: {
    color: "#C62828",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 7,
  },
  proofHint: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 9 },
  bottomBar: {
    backgroundColor: WHITE,
    paddingHorizontal: 22,
    paddingTop: 15,
    paddingBottom: 25,
  },
  saveButton: {
    height: 62,
    borderRadius: 18,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { fontSize: 19, fontWeight: "800", color: WHITE },
});
