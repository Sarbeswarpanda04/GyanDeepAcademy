
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
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
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

const NAVY = "#26374D";
const BG = "#F1F5F8";
const MUTED = "#9DB1BE";
const BORDER = "#DFE7ED";
const BUCKET = "institute-assets";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

type Institute = {
  id: string;
  name: string;
  address: string | null;
  contact_phone: string | null;
  slogan: string | null;
  contact_email: string | null;
  upi_id: string | null;
  logo_url: string | null;
  signature_url: string | null;
};

type DocumentNumber = {
  id: string;
  institute_id: string;
  label: string;
  phone: string;
  show_on_documents: boolean;
  is_owner_number: boolean;
};

type ImageKind = "logo" | "signature";

function getObjectPath(storedUrl: string | null): string | null {
  if (!storedUrl) return null;

  if (!storedUrl.startsWith("http")) {
    return storedUrl;
  }

  const markers = [
    `/storage/v1/object/public/${BUCKET}/`,
    `/storage/v1/object/sign/${BUCKET}/`,
    `/storage/v1/object/authenticated/${BUCKET}/`,
  ];

  for (const marker of markers) {
    const index = storedUrl.indexOf(marker);

    if (index >= 0) {
      const remaining = storedUrl.slice(index + marker.length).split("?")[0];
      return remaining
        .split("/")
        .map((part) => decodeURIComponent(part))
        .join("/");
    }
  }

  return null;
}

async function makeDisplayUrl(
  storedValue: string | null,
  bucketIsPublic: boolean
): Promise<string | null> {
  if (!storedValue) return null;

  const path = getObjectPath(storedValue);

  // Preserve an external URL if it is not a URL from our Storage bucket.
  if (!path) return storedValue;

  if (bucketIsPublic) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) throw error;
  return data.signedUrl;
}

export default function InstituteProfileScreen() {
  const [institute, setInstitute] = useState<Institute | null>(null);
  const [numbers, setNumbers] = useState<DocumentNumber[]>([]);

  const [name, setName] = useState("");
  const [slogan, setSlogan] = useState("Learn Today Lead Tomorrow");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [upi, setUpi] = useState("");

  const [logoDisplayUrl, setLogoDisplayUrl] = useState<string | null>(null);
  const [signatureDisplayUrl, setSignatureDisplayUrl] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<ImageKind | null>(null);
  const [bucketIsPublic, setBucketIsPublic] = useState(true);

  const [numbersVisible, setNumbersVisible] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [numberSaving, setNumberSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        router.replace("/login");
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id")
        .eq("user_id", authData.user.id)
        .eq("role", "owner")
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership) {
        router.replace("/institute-setup");
        return;
      }

      const { data, error } = await supabase
        .from("institutes")
        .select(
          "id,name,address,contact_phone,slogan,contact_email,upi_id,logo_url,signature_url"
        )
        .eq("id", membership.institute_id)
        .single();

      if (error) throw error;

      const profile = data as Institute;
      setInstitute(profile);
      setName(profile.name ?? "");
      setSlogan(profile.slogan ?? "");
      setAddress(profile.address ?? "");
      setPhone(profile.contact_phone ?? "");
      setEmail(profile.contact_email ?? "");
      setUpi(profile.upi_id ?? "");

      // Read bucket visibility. If bucket metadata cannot be read,
      // keep the configured public-bucket default.
      const { data: bucket, error: bucketError } =
        await supabase.storage.getBucket(BUCKET);

      const isPublic = !bucketError && bucket
        ? bucket.public
        : bucketIsPublic;

      setBucketIsPublic(isPublic);

      const [logoUrl, signatureUrl] = await Promise.all([
        makeDisplayUrl(profile.logo_url, isPublic),
        makeDisplayUrl(profile.signature_url, isPublic),
      ]);

      setLogoDisplayUrl(logoUrl);
      setSignatureDisplayUrl(signatureUrl);

      const { data: rows, error: numbersError } = await supabase
        .from("institute_document_numbers")
        .select(
          "id,institute_id,label,phone,show_on_documents,is_owner_number"
        )
        .eq("institute_id", profile.id)
        .order("created_at", { ascending: true });

      if (numbersError) throw numbersError;

      setNumbers((rows ?? []) as DocumentNumber[]);
    } catch (error: unknown) {
      Alert.alert(
        "Unable to load profile",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [bucketIsPublic]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile() {
    if (!institute) return;

    if (name.trim().length < 2) {
      Alert.alert("Invalid name", "Enter at least two characters.");
      return;
    }

    if (
      email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("institutes")
        .update({
          name: name.trim(),
          slogan: slogan.trim() || null,
          address: address.trim() || null,
          contact_phone: phone.trim() || null,
          contact_email: email.trim() || null,
          upi_id: upi.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", institute.id);

      if (error) throw error;

      Alert.alert("Saved", "Institute profile updated successfully.");
      await load();
    } catch (error: unknown) {
      Alert.alert(
        "Save failed",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(kind: ImageKind) {
    if (!institute) return;

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Allow photo access to select an image."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: kind === "logo" ? [1, 1] : [3, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];

    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      Alert.alert("Image too large", "Choose an image smaller than 5 MB.");
      return;
    }

    const extension = (
      asset.fileName?.split(".").pop() ||
      (asset.mimeType === "image/png" ? "png" : "jpg")
    ).toLowerCase();

    if (!["jpg", "jpeg", "png", "webp"].includes(extension)) {
      Alert.alert("Unsupported format", "Choose JPG, PNG, or WebP.");
      return;
    }

    setUploading(kind);

    let uploadedPath: string | null = null;

    try {
      // Use Expo FileSystem's File API instead of fetch(uri).blob().
      // arrayBuffer() reads the selected local file directly.
      const localFile = new File(asset.uri);
      const bytes = await localFile.arrayBuffer();

      if (bytes.byteLength === 0) {
        throw new Error("The selected image is empty.");
      }

      if (bytes.byteLength > MAX_FILE_SIZE) {
        throw new Error("The selected image exceeds the 5 MB limit.");
      }

      const path = `${institute.id}/${kind}-${Date.now()}.${extension}`;

      const { data: uploaded, error: uploadError } =
        await supabase.storage.from(BUCKET).upload(path, bytes, {
          contentType:
            asset.mimeType ??
            (extension === "png"
              ? "image/png"
              : extension === "webp"
                ? "image/webp"
                : "image/jpeg"),
          upsert: false,
        });

      if (uploadError) throw uploadError;
      uploadedPath = uploaded.path;

      // Verify the object exists at the returned storage path.
      const { data: fileList, error: listError } = await supabase.storage
        .from(BUCKET)
        .list(institute.id, {
          search: uploaded.path.split("/").pop() ?? "",
        });

      if (listError) throw listError;

      const filename = uploaded.path.split("/").pop();
      const exists = fileList?.some((file) => file.name === filename);

      if (!exists) {
        throw new Error(
          "Upload completed, but the file was not found at the expected path."
        );
      }

      // Persist a stable URL for public buckets and a stable object path
      // for private buckets. Never persist an expiring signed URL.
      let storedValue = uploaded.path;

      if (bucketIsPublic) {
        const { data } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(uploaded.path);

        storedValue = data.publicUrl;
      }

      const update =
        kind === "logo"
          ? { logo_url: storedValue }
          : { signature_url: storedValue };

      const { error: updateError } = await supabase
        .from("institutes")
        .update({
          ...update,
          updated_at: new Date().toISOString(),
        })
        .eq("id", institute.id);

      if (updateError) throw updateError;

      const displayUrl = await makeDisplayUrl(
        storedValue,
        bucketIsPublic
      );

      if (kind === "logo") {
        setLogoDisplayUrl(displayUrl);
      } else {
        setSignatureDisplayUrl(displayUrl);
      }

      await load();

      Alert.alert(
        kind === "logo" ? "Logo updated" : "Signature updated",
        "Your image has been uploaded and saved."
      );
    } catch (error: unknown) {
      Alert.alert(
        kind === "logo" ? "Logo upload failed" : "Signature upload failed",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setUploading(null);
    }
  }

  async function addDocumentNumber() {
    if (!institute) return;

    const cleanPhone = newPhone.trim();

    if (cleanPhone.length < 7 || cleanPhone.length > 20) {
      Alert.alert("Invalid number", "Enter a valid contact number.");
      return;
    }

    if (numbers.length >= 4) {
      Alert.alert("Limit reached", "You can add up to four numbers.");
      return;
    }

    setNumberSaving(true);

    try {
      const { error } = await supabase
        .from("institute_document_numbers")
        .insert({
          institute_id: institute.id,
          label: newLabel.trim() || "Other number",
          phone: cleanPhone,
          show_on_documents: true,
          is_owner_number: false,
        });

      if (error) throw error;

      setNewLabel("");
      setNewPhone("");
      Keyboard.dismiss();

      await load();
      Alert.alert("Added", "Document contact number added.");
    } catch (error: unknown) {
      Alert.alert(
        "Could not add number",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setNumberSaving(false);
    }
  }

  async function toggleDocumentNumber(
    item: DocumentNumber,
    enabled: boolean
  ) {
    if (!institute) return;

    const { error } = await supabase
      .from("institute_document_numbers")
      .update({ show_on_documents: enabled })
      .eq("id", item.id)
      .eq("institute_id", institute.id);

    if (error) {
      Alert.alert("Update failed", error.message);
      return;
    }

    setNumbers((previous) =>
      previous.map((number) =>
        number.id === item.id
          ? { ...number, show_on_documents: enabled }
          : number
      )
    );
  }

  function deleteDocumentNumber(item: DocumentNumber) {
    if (!institute) return;

    if (item.is_owner_number) {
      Alert.alert("Owner number", "The owner number cannot be deleted here.");
      return;
    }

    Alert.alert("Delete number", `Delete ${item.phone}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("institute_document_numbers")
            .delete()
            .eq("id", item.id)
            .eq("institute_id", institute.id);

          if (error) {
            Alert.alert("Delete failed", error.message);
            return;
          }

          setNumbers((previous) =>
            previous.filter((number) => number.id !== item.id)
          );
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={NAVY} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Institute Profile</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.logoCard}
            onPress={() => void uploadImage("logo")}
            disabled={uploading !== null}
          >
            {logoDisplayUrl ? (
              <Image
                source={{ uri: logoDisplayUrl }}
                style={styles.logo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text style={styles.logoMark}>GD</Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={styles.logoTitle}>
                {name || "Your institute"}
              </Text>
              <Text style={styles.helpText}>
                {uploading === "logo"
                  ? "Uploading logo..."
                  : "Change logo · square, 1024 px or larger"}
              </Text>
            </View>

            {uploading === "logo" ? (
              <ActivityIndicator color={NAVY} />
            ) : (
              <Text style={styles.chevron}>›</Text>
            )}
          </TouchableOpacity>

          <Card title="BASIC DETAILS">
            <Field label="Institute name *" value={name} onChangeText={setName} />
            <Field
              label="Slogan (optional)"
              value={slogan}
              onChangeText={setSlogan}
            />
            <Text style={styles.helpText}>
              Shown on receipts and student ID cards.
            </Text>
          </Card>

          <Card title="CONTACT">
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>☎</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>Owner's number</Text>
                <Text style={styles.helpText}>
                  {phone || "Not provided"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.infoRow}
              onPress={() => setNumbersVisible(true)}
            >
              <Text style={styles.infoIcon}>▣</Text>
              <Text style={[styles.infoTitle, { flex: 1 }]}>
                Numbers on documents
              </Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <Field label="Address" value={address} onChangeText={setAddress} />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
          </Card>

          <Card title="PAYMENTS">
            <Field label="UPI ID (optional)" value={upi} onChangeText={setUpi} />
            <Text style={styles.helpText}>
              Shared in WhatsApp fee reminders so students can pay you directly.
            </Text>
          </Card>

          <Card title="SIGNATURE">
            <Text style={styles.helpText}>
              Printed above "Authorised signatory" on receipts and reports.
            </Text>

            <View style={styles.signatureBox}>
              {signatureDisplayUrl ? (
                <Image
                  source={{ uri: signatureDisplayUrl }}
                  style={styles.signatureImage}
                  resizeMode="contain"
                />
              ) : (
                <Text style={styles.helpText}>No signature yet</Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => void uploadImage("signature")}
              disabled={uploading !== null}
            >
              {uploading === "signature" ? (
                <ActivityIndicator color={NAVY} />
              ) : (
                <Text style={styles.outlineButtonText}>Upload signature</Text>
              )}
            </TouchableOpacity>
          </Card>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => void saveProfile()}
            disabled={saving || uploading !== null}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveText}>Save changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={numbersVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setNumbersVisible(false);
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.scrim}
            onPress={() => {
              Keyboard.dismiss();
              setNumbersVisible(false);
            }}
          />

          <KeyboardAvoidingView
            style={styles.sheetKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          >
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeadingRow}>
                <Text style={styles.sheetTitle}>Numbers on documents</Text>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setNumbersVisible(false);
                  }}
                >
                  <Text style={styles.closeText}>×</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.helpText}>
                Shown on ID cards, receipts and reports — up to 4 (
                {numbers.length} of 4 used).
              </Text>

              <ScrollView
                style={styles.numberList}
                contentContainerStyle={{ paddingBottom: 20 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {numbers.map((item) => (
                  <View style={styles.numberRow} key={item.id}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoTitle}>
                        {item.is_owner_number ? "Owners" : item.label}
                      </Text>
                      <Text style={styles.numberPhone}>{item.phone}</Text>
                      {!item.is_owner_number && (
                        <Text style={styles.helpText}>{item.label}</Text>
                      )}
                    </View>

                    <Switch
                      value={item.show_on_documents}
                      onValueChange={(value) =>
                        void toggleDocumentNumber(item, value)
                      }
                      trackColor={{ true: NAVY, false: "#D4DCE3" }}
                    />

                    {!item.is_owner_number && (
                      <TouchableOpacity
                        style={{ paddingLeft: 12 }}
                        onPress={() => deleteDocumentNumber(item)}
                      >
                        <Text style={styles.deleteText}>⌫</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {numbers.length < 4 && (
                  <View style={styles.addForm}>
                    <Text style={styles.fieldLabel}>Label</Text>
                    <TextInput
                      style={styles.input}
                      value={newLabel}
                      onChangeText={setNewLabel}
                      placeholder="e.g. Office number"
                      returnKeyType="next"
                    />

                    <Text style={styles.fieldLabel}>Phone number</Text>
                    <TextInput
                      style={styles.input}
                      value={newPhone}
                      onChangeText={setNewPhone}
                      placeholder="Enter phone number"
                      keyboardType="phone-pad"
                      returnKeyType="done"
                    />

                    <TouchableOpacity
                      style={styles.outlineButton}
                      onPress={() => void addDocumentNumber()}
                      disabled={numberSaving}
                    >
                      {numberSaving ? (
                        <ActivityIndicator color={NAVY} />
                      ) : (
                        <Text style={styles.outlineButtonText}>
                          Add a number
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={
          keyboardType === "email-address" ? "none" : "sentences"
        }
        placeholder={label}
        placeholderTextColor="#9CA3AF"
        returnKeyType="next"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  back: { width: 36 },
  backText: { fontSize: 35, color: NAVY, lineHeight: 38 },
  pageTitle: { color: NAVY, fontSize: 22, fontWeight: "800" },
  content: { padding: 17, paddingBottom: 28, gap: 17 },
  logoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 23,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 17,
    minHeight: 115,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  logo: { width: 70, height: 70, borderRadius: 13 },
  logoPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 13,
    backgroundColor: "#F5F7F9",
    justifyContent: "center",
    alignItems: "center",
  },
  logoMark: { color: NAVY, fontSize: 25, fontWeight: "900" },
  logoTitle: { color: NAVY, fontSize: 16, fontWeight: "800" },
  helpText: { color: "#536D84", fontSize: 13, lineHeight: 20, marginTop: 4 },
  chevron: { color: "#C2D0DA", fontSize: 29 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 23,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 17,
  },
  cardTitle: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 16,
  },
  field: { marginBottom: 16 },
  fieldLabel: { color: "#111827", fontSize: 14, marginBottom: 7 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#D7D7D7",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  infoRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EEF2",
    marginHorizontal: -17,
    paddingHorizontal: 20,
  },
  infoIcon: { color: "#536D84", fontSize: 22, width: 26 },
  infoTitle: { color: NAVY, fontSize: 16, fontWeight: "800" },
  signatureBox: {
    height: 105,
    marginTop: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E6EBF0",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  signatureImage: { width: "90%", height: 90 },
  outlineButton: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: NAVY,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 12,
  },
  outlineButtonText: { color: NAVY, fontSize: 16, fontWeight: "700" },
  saveButton: {
    minHeight: 58,
    backgroundColor: NAVY,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#FFFFFF", fontSize: 20 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheetKeyboard: { maxHeight: "90%", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 24 : 14,
    maxHeight: "100%",
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D6DDE4",
    alignSelf: "center",
    marginBottom: 15,
  },
  sheetHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: { color: NAVY, fontSize: 22, fontWeight: "800", flex: 1 },
  closeText: { color: NAVY, fontSize: 32, paddingHorizontal: 8 },
  numberList: { flexShrink: 1 },
  numberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EEF2",
  },
  numberPhone: { color: NAVY, fontSize: 18, fontWeight: "800", marginTop: 7 },
  deleteText: { color: "#D83232", fontSize: 25 },
  addForm: { paddingTop: 17, paddingBottom: 18 },
});
