import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import AppAlert, { AppAlertType } from "../components/AppAlert";

const N = "#202F42",
  BG = "#F1F5F8",
  M = "#8192A3",
  B = "#E1E8EF",
  G = "#17856B",
  R = "#D95362",
  W = "#FFFFFF",
  BUCKET = "institute-assets";
type Mode = "Cash" | "UPI" | "Bank transfer" | "Card" | "Other";
type Expense = {
  id: string;
  institute_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  purchase_date: string;
  description: string | null;
  image_url: string | null;
  payment_mode: Mode;
  created_at: string;
};
const MODES: Mode[] = [
  "Cash",
  "UPI",
  "Bank transfer",
  "Card",
  "Other",
];
const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());
const niceDate = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const [iid, setIid] = useState("");
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "month">("all");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<Mode>("Cash");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [datePicker, setDatePicker] = useState(false);
  const [imageSourceModal, setImageSourceModal] = useState(false);
  const [appAlert, setAppAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AppAlertType;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  }>({ visible: false, title: "", message: "", type: "info" });
  const showAlert = (
    title: string,
    message: string,
    type: AppAlertType = "info",
    opts?: {
      confirmLabel?: string;
      cancelLabel?: string;
      onConfirm?: () => void;
    },
  ) => setAppAlert({ visible: true, title, message, type, ...opts });
  const closeAlert = () =>
    setAppAlert((a) => ({
      ...a,
      visible: false,
      onConfirm: undefined,
      cancelLabel: undefined,
    }));
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setErr("");
    try {
      const {
        data: { user },
        error: ae,
      } = await supabase.auth.getUser();
      if (ae) throw ae;
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: member, error: me } = await supabase
        .from("institute_members")
        .select("institute_id,role")
        .eq("user_id", user.id)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();
      if (me) throw me;
      if (!member?.institute_id)
        throw new Error("No owner institute is linked to this login.");
      setIid(member.institute_id);
      const { data, error } = await supabase
        .from("institute_expenses")
        .select("*")
        .eq("institute_id", member.institute_id)
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as Expense[]);
    } catch (e: any) {
      setErr(e?.message ?? "Unable to load expenses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const monthRows = useMemo(
    () =>
      rows.filter(
        (x) => x.purchase_date >= monthStart && x.purchase_date <= today(),
      ),
    [rows, monthStart],
  );
  const total = rows.reduce(
    (a, x) => a + Number(x.total_amount ?? x.quantity * x.unit_price),
    0,
  );
  const monthly = monthRows.reduce(
    (a, x) => a + Number(x.total_amount ?? x.quantity * x.unit_price),
    0,
  );
  const shown = useMemo(
    () =>
      (filter === "month" ? monthRows : rows).filter((x) => {
        const q = search.trim().toLowerCase();
        return (
          !q ||
          x.name.toLowerCase().includes(q) ||
          (x.description ?? "").toLowerCase().includes(q) ||
          x.payment_mode.toLowerCase().includes(q)
        );
      }),
    [filter, monthRows, rows, search],
  );
  const reset = () => {
    setEditing(null);
    setName("");
    setQty("1");
    setPrice("");
    setDate(today());
    setDescription("");
    setMode("Cash");
    setImageUri(null);
    setImageUrl(null);
    setDatePicker(false);
  };
  const add = () => {
    reset();
    setModal(true);
  };
  const edit = (x: Expense) => {
    setEditing(x);
    setName(x.name);
    setQty(String(x.quantity));
    setPrice(String(x.unit_price));
    setDate(x.purchase_date);
    setDescription(x.description ?? "");
    setMode(x.payment_mode);
    setImageUri(null);
    setImageUrl(x.image_url);
    setModal(true);
  };
  const amount =
    Math.max(0, Number(qty || 0)) * Math.max(0, Number(price || 0));
  const useSelectedImage = (asset: ImagePicker.ImagePickerAsset) => {
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      showAlert("Image too large", "Choose an image under 5 MB.", "warning");
      return;
    }
    setImageUri(asset.uri);
    setImageUrl(null);
  };
  const pickImage = async () => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) {
      showAlert(
        "Permission required",
        "Allow photo-library access to select an item photo or receipt.",
        "warning",
      );
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!r.canceled && r.assets[0]) useSelectedImage(r.assets[0]);
  };
  const takePhoto = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) {
      showAlert(
        "Camera permission required",
        "Allow camera access to take a photo of the item or receipt.",
        "warning",
      );
      return;
    }
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!r.canceled && r.assets[0]) useSelectedImage(r.assets[0]);
  };
  const chooseImageSource = () => setImageSourceModal(true);
  const chooseCamera = () => {
    setImageSourceModal(false);
    setTimeout(() => void takePhoto(), 180);
  };
  const chooseGallery = () => {
    setImageSourceModal(false);
    setTimeout(() => void pickImage(), 180);
  };
  const save = async () => {
    if (!iid || saving) return;
    if (!name.trim())
      return showAlert(
        "Name required",
        "Enter the expense or item name.",
        "warning",
      );
    const q = Number(qty),
      p = Number(price);
    if (!Number.isFinite(q) || q <= 0)
      return showAlert(
        "Invalid quantity",
        "Quantity must be greater than zero.",
        "warning",
      );
    if (!Number.isFinite(p) || p < 0)
      return showAlert("Invalid price", "Enter a valid price.", "warning");
    setSaving(true);
    try {
      let finalImage = imageUrl;
      if (imageUri) {
        let base64: string;
        try {
          base64 = await FileSystem.readAsStringAsync(imageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch (readError: any) {
          throw new Error(
            `Unable to read the selected photo (${readError?.message ?? "file access failed"}). Please choose the image again or take a new photo.`,
          );
        }
        if (!base64)
          throw new Error(
            "The selected image is empty. Please choose it again.",
          );
        const arrayBuffer = decode(base64);
        const cleanUri = imageUri.split("?")[0].toLowerCase();
        const mime = cleanUri.endsWith(".png")
          ? "image/png"
          : cleanUri.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";
        const ext =
          mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
        const path = `${iid}/expenses/${Date.now()}.${ext}`;
        const { error: ue } = await supabase.storage
          .from(BUCKET)
          .upload(path, arrayBuffer, { contentType: mime, upsert: false });
        if (ue)
          throw new Error(
            `Image upload failed: ${ue.message}. ${BUCKET} bucket/policy: ${ue.message}`,
          );
        finalImage = supabase.storage.from(BUCKET).getPublicUrl(path)
          .data.publicUrl;
      }
      const payload = {
        institute_id: iid,
        name: name.trim(),
        quantity: q,
        unit_price: p,
        purchase_date: date,
        description: description.trim() || null,
        image_url: finalImage,
        payment_mode: mode,
      };
      const result = editing
        ? await supabase
            .from("institute_expenses")
            .update(payload)
            .eq("id", editing.id)
            .eq("institute_id", iid)
        : await supabase.from("institute_expenses").insert(payload);
      if (result.error) throw result.error;
      setModal(false);
      reset();
      await load(true);
      showAlert(
        editing ? "Expense updated" : "Expense saved",
        `${name.trim()} · ${money(q * p)}`,
        "success",
      );
    } catch (e: any) {
      showAlert(
        "Could not save expense",
        e?.message ?? "Please try again.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = (x: Expense) =>
    showAlert(
      "Delete expense?",
      `Delete "${x.name}"? This action cannot be undone.`,
      "warning",
      {
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        onConfirm: async () => {
          const { error } = await supabase
            .from("institute_expenses")
            .delete()
            .eq("id", x.id)
            .eq("institute_id", iid);
          if (error) {
            showAlert("Delete failed", error.message, "error");
            return;
          }
          setRows((old) => old.filter((y) => y.id !== x.id));
          showAlert("Expense deleted", `"${x.name}" was removed.`, "success");
        },
      },
    );
  const card = ({ item: x }: { item: Expense }) => (
    <View style={s.card}>
      <View style={s.row}>
        {x.image_url ? (
          <Image source={{ uri: x.image_url }} style={s.thumb} />
        ) : (
          <View style={s.thumbBlank}>
            <Feather name="shopping-bag" size={21} color={N} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.itemName}>{x.name}</Text>
          <Text style={s.meta}>
            {niceDate(x.purchase_date)} · {x.payment_mode}
          </Text>
          <Text style={s.meta}>
            {x.quantity} × {money(x.unit_price)}
          </Text>
        </View>
        <Text style={s.amount}>{money(x.total_amount)}</Text>
      </View>
      {!!x.description && <Text style={s.desc}>{x.description}</Text>}
      <View style={s.actions}>
        <TouchableOpacity style={s.action} onPress={() => edit(x)}>
          <Feather name="edit-2" size={15} color={N} />
          <Text style={s.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={() => remove(x)}>
          <Feather name="trash-2" size={15} color={R} />
          <Text style={[s.actionText, { color: R }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" backgroundColor={N} />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={W} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Expenses</Text>
          <Text style={s.headerSub}>Institute purchases & spending</Text>
        </View>
        <TouchableOpacity style={s.add} onPress={add}>
          <Feather name="plus" size={18} color={N} />
          <Text style={s.addText}>Add</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
      >
        <View style={s.summaries}>
          <View style={[s.summary, { backgroundColor: N }]}>
            <Feather name="trending-up" size={20} color={W} />
            <Text style={s.sumLabelLight}>Total expenses</Text>
            <Text style={s.sumValueLight}>{money(total)}</Text>
            <Text style={s.sumFootLight}>{rows.length} records</Text>
          </View>
          <View style={[s.summary, { backgroundColor: "#E4F4ED" }]}>
            <Feather name="calendar" size={20} color={G} />
            <Text style={s.sumLabelDark}>This month</Text>
            <Text style={s.sumValueDark}>{money(monthly)}</Text>
            <Text style={s.sumFootDark}>{monthRows.length} records</Text>
          </View>
        </View>
        <View style={s.search}>
          <Feather name="search" size={18} color={M} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search expense, note or payment"
            placeholderTextColor={M}
            style={s.searchInput}
          />
        </View>
        <View style={s.filterRow}>
          <Text style={s.sectionTitle}>Expense history</Text>
          <View style={{ flexDirection: "row", gap: 7 }}>
            {(["all", "month"] as const).map((v) => (
              <TouchableOpacity
                key={v}
                style={[s.pill, filter === v && s.pillActive]}
                onPress={() => setFilter(v)}
              >
                <Text style={[s.pillText, filter === v && { color: W }]}>
                  {v === "all" ? "All" : "This month"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={N} />
            <Text style={s.meta}>Loading expenses…</Text>
          </View>
        ) : err ? (
          <View style={s.empty}>
            <Text style={{ color: R, textAlign: "center" }}>{err}</Text>
            <TouchableOpacity onPress={() => void load()}>
              <Text style={s.actionText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : shown.length ? (
          <FlatList
            data={shown}
            keyExtractor={(x) => x.id}
            renderItem={card}
            scrollEnabled={false}
            contentContainerStyle={{ gap: 10 }}
          />
        ) : (
          <View style={s.empty}>
            <Feather name="clipboard" size={28} color={N} />
            <Text style={s.itemName}>No expenses found</Text>
            <Text style={s.meta}>
              {search
                ? "Try a different search."
                : "Add your first institute purchase."}
            </Text>
            <TouchableOpacity style={s.primary} onPress={add}>
              <Text style={s.primaryText}>Add expense</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <Modal
        visible={modal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: BG }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.modalHead}>
            <TouchableOpacity onPress={() => setModal(false)}>
              <Text style={s.meta}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>
              {editing ? "Edit expense" : "Add expense"}
            </Text>
            <TouchableOpacity onPress={() => void save()} disabled={saving}>
              <Text style={{ color: G, fontWeight: "900" }}>
                {saving ? "Saving…" : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={s.form}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.hint}>
              Record an item, purchase or institute expense.
            </Text>
            <Text style={s.label}>Expense / item name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Whiteboard, stationery, electricity"
              style={s.input}
            />
            <View style={s.two}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Quantity *</Text>
                <TextInput
                  value={qty}
                  onChangeText={setQty}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  style={s.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Price per item (₹) *</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  style={s.input}
                />
              </View>
            </View>
            <View style={s.totalBox}>
              <Text style={{ color: "#477463", fontWeight: "700" }}>
                Total expense
              </Text>
              <Text style={s.totalValue}>{money(amount)}</Text>
            </View>
            <Text style={s.label}>Date of purchase *</Text>
            <TouchableOpacity
              style={s.dateField}
              onPress={() => setDatePicker(true)}
            >
              <Feather name="calendar" size={18} color={N} />
              <Text style={{ flex: 1, color: N }}>{niceDate(date)}</Text>
              <Feather name="chevron-down" size={17} color={M} />
            </TouchableOpacity>
            {datePicker && (
              <DateTimePicker
                value={new Date(`${date}T12:00:00`)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={new Date()}
                onValueChange={(event, d) => {
                  if (Platform.OS !== "ios") setDatePicker(false);
                  if (d) setDate(iso(d));
                }}
                onDismiss={() => setDatePicker(false)}
              />
            )}
            <Text style={s.label}>Payment mode *</Text>
            <View style={s.modes}>
              {MODES.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[s.modePill, mode === v && s.modeSelected]}
                  onPress={() => setMode(v)}
                >
                  <Text
                    style={{
                      color: mode === v ? G : N,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    {v}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
              placeholder="Purpose, vendor or receipt notes"
              style={[s.input, { minHeight: 88 }]}
            />
            <Text style={s.label}>Image / receipt (optional)</Text>
            <TouchableOpacity style={s.imageBox} onPress={chooseImageSource}>
              {imageUri || imageUrl ? (
                <Image
                  source={{ uri: imageUri ?? imageUrl! }}
                  style={{ width: "100%", height: 160 }}
                />
              ) : (
                <>
                  <Feather name="camera" size={24} color={N} />
                  <Text style={s.meta}>
                    Tap to take a photo or choose from gallery
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {(imageUri || imageUrl) && (
              <TouchableOpacity
                onPress={() => {
                  setImageUri(null);
                  setImageUrl(null);
                }}
              >
                <Text style={{ color: R, marginTop: 7, }}>Remove image</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.submit}
              disabled={saving}
              onPress={() => void save()}
            >
              {saving ? (
                <ActivityIndicator color={W} />
              ) : (
                <>
                  <Feather name="check" size={18} color={W} />
                  <Text style={s.submitText}>
                    {editing ? "Update expense" : "Save expense"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={imageSourceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setImageSourceModal(false)}
      >
        <View style={s.sourceOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setImageSourceModal(false)}
          />
          <View style={s.sourceSheet}>
            <View style={s.sourceHandle} />
            <View style={s.sourceHeadingIcon}>
              <Feather name="image" size={23} color={G} />
            </View>
            <Text style={s.sourceTitle}>Add expense photo</Text>
            <Text style={s.sourceSubtitle}>
              Attach a picture of the purchased item or a receipt.
            </Text>
            <TouchableOpacity
              style={s.sourceOption}
              activeOpacity={0.8}
              onPress={chooseCamera}
            >
              <View style={[s.sourceIcon, { backgroundColor: "#E5F5EF" }]}>
                <Feather name="camera" size={22} color={G} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sourceOptionTitle}>Take a photo</Text>
                <Text style={s.sourceOptionSub}>Open your device camera</Text>
              </View>
              <Feather name="chevron-right" size={20} color={M} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.sourceOption}
              activeOpacity={0.8}
              onPress={chooseGallery}
            >
              <View style={[s.sourceIcon, { backgroundColor: "#E8EFF8" }]}>
                <Feather name="image" size={22} color={N} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sourceOptionTitle}>Choose from gallery</Text>
                <Text style={s.sourceOptionSub}>Select an existing photo</Text>
              </View>
              <Feather name="chevron-right" size={20} color={M} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.sourceCancel}
              onPress={() => setImageSourceModal(false)}
            >
              <Text style={s.sourceCancelText}>Cancel</Text>
            </TouchableOpacity>
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
        onConfirm={appAlert.onConfirm}
        onCancel={closeAlert}
      />
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: N,
    paddingHorizontal: 15,
    paddingBottom: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#34465C",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 24, fontWeight: "900", color: W },
  headerSub: { fontSize: 12, color: "#C2CEDB", marginTop: 3 },
  add: {
    backgroundColor: W,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addText: { color: N, fontWeight: "900" },
  content: { padding: 14, paddingBottom: 40, gap: 14 },
  summaries: { flexDirection: "row", gap: 10 },
  summary: {
    flex: 1,
    minWidth: 0,
    borderRadius: 19,
    padding: 14,
    minHeight: 145,
  },
  sumLabelLight: {
    fontSize: 12,
    color: "#C8D3E0",
    marginTop: 10,
    fontWeight: "700",
  },
  sumValueLight: { fontSize: 19, color: W, fontWeight: "900", marginTop: 8 },
  sumFootLight: { fontSize: 11, color: "#C8D3E0", marginTop: 5 },
  sumLabelDark: {
    fontSize: 12,
    color: "#4F7667",
    marginTop: 10,
    fontWeight: "700",
  },
  sumValueDark: {
    fontSize: 19,
    color: "#12664F",
    fontWeight: "900",
    marginTop: 8,
  },
  sumFootDark: { fontSize: 11, color: "#4F7667", marginTop: 5 },
  search: {
    backgroundColor: W,
    borderWidth: 1,
    borderColor: B,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 47,
  },
  searchInput: { flex: 1, color: N, paddingVertical: 10, fontSize: 13 },
  filterRow: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: N },
  pill: {
    borderWidth: 1,
    borderColor: B,
    backgroundColor: W,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  pillActive: { backgroundColor: N, borderColor: N },
  pillText: { fontSize: 12, color: N, fontWeight: "800" },
  card: {
    backgroundColor: W,
    borderWidth: 1,
    borderColor: B,
    borderRadius: 17,
    padding: 13,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  thumb: { width: 100, height: 100, borderRadius: 13 },
  thumbBlank: {
    width: 70,
    height: 70,
    borderRadius: 13,
    backgroundColor: "#E9EFF5",
    alignItems: "center",
    justifyContent: "center",
  },
  itemName: { color: N, fontSize: 18, fontWeight: "900" },
  meta: { color: M, fontSize: 14, marginTop: 4 },
  amount: { color: G, fontSize: 18, fontWeight: "900" },
  desc: { color: "#58697A", fontSize: 12, marginTop: 2, lineHeight: 17 },
  actions: {
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
    marginTop: 11,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 18,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { color: N, fontSize: 12, fontWeight: "800" },
  center: { alignItems: "center", padding: 28, gap: 10 },
  empty: {
    backgroundColor: W,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: B,
    alignItems: "center",
    padding: 24,
    gap: 9,
  },
  primary: {
    backgroundColor: N,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  primaryText: { color: W, fontWeight: "900" },
  modalHead: {
    backgroundColor: W,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: B,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { color: N, fontSize: 17, fontWeight: "900" },
  form: { padding: 17, paddingBottom: 42 },
  hint: { fontSize: 12, color: M, lineHeight: 18, marginBottom: 12 },
  label: {
    color: N,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 14,
    marginBottom: 7,
  },
  input: {
    backgroundColor: W,
    borderWidth: 1,
    borderColor: B,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: N,
    fontSize: 14,
    minHeight: 45,
  },
  two: { flexDirection: "row", gap: 10 },
  totalBox: {
    marginTop: 13,
    padding: 14,
    borderRadius: 13,
    backgroundColor: "#E4F4ED",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalValue: { color: G, fontSize: 20, fontWeight: "900" },
  dateField: {
    backgroundColor: W,
    borderWidth: 1,
    borderColor: B,
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  modes: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  modePill: {
    borderWidth: 1,
    borderColor: B,
    backgroundColor: W,
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  modeSelected: { borderColor: G, backgroundColor: "#E5F5EF" },
  imageBox: {
    minHeight: 100,
    backgroundColor: W,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: B,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
  },
  submit: {
    marginTop: 22,
    minHeight: 49,
    borderRadius: 14,
    backgroundColor: N,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  submitText: { color: W, fontSize: 14, fontWeight: "900" },
  sourceOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,31,48,0.48)",
    justifyContent: "flex-end",
  },
  sourceSheet: {
    backgroundColor: W,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 32 : 24,
  },
  sourceHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#DCE3EA",
    marginBottom: 20,
  },
  sourceHeadingIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "#E5F5EF",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  sourceTitle: {
    color: N,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  sourceSubtitle: {
    color: M,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 18,
  },
  sourceOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: B,
    borderRadius: 17,
    marginBottom: 10,
    backgroundColor: "#FBFCFE",
  },
  sourceIcon: {
    width: 60,
    height: 60,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceOptionTitle: { color: N, fontSize: 14, fontWeight: "900" },
  sourceOptionSub: { color: M, fontSize: 11, marginTop: 4 },
  sourceCancel: {
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: "#F0F3F6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 3,
  },
  sourceCancelText: { color: N, fontSize: 14, fontWeight: "800" },
});
