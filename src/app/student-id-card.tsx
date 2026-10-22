import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ViewShot, { captureRef, type ViewShotRef } from "react-native-view-shot";
import { supabase } from "../lib/supabase";
import {
  DEFAULT_STUDENT_ID_CARD_SETTINGS,
  loadStudentIdCardSettings,
  type StudentIdCardSettings,
} from "../lib/student-id-card-settings";

type Student = {
  id: string;
  institute_id: string;
  status: string;
  full_name: string;
  roll_number: string;
  phone: string | null;
  father_name: string | null;
  class_id: string | null;
  admission_date: string | null;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  address: string | null;
  seat_number?: string | number | null;
  photo_path: string | null;
};

type Institute = {
  name: string | null;
  slogan: string | null;
  address: string | null;
  contact_phone: string | null;
  logo_url: string | null;
};

const navy = "#243448";
const blue = "#3A719A";
const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

async function resolveStorageImage(
  storedValue: string | null,
  bucket: string,
) {
  if (!storedValue) return null;

  const marker = `/storage/v1/object/public/${bucket}/`;
  const signedMarker = `/storage/v1/object/sign/${bucket}/`;
  const authenticatedMarker = `/storage/v1/object/authenticated/${bucket}/`;
  if (storedValue.includes(marker)) return storedValue;

  const privateMarker = [signedMarker, authenticatedMarker].find((item) =>
    storedValue.includes(item),
  );
  const objectPath = privateMarker
    ? storedValue
        .slice(storedValue.indexOf(privateMarker) + privateMarker.length)
        .split("?")[0]
        .split("/")
        .map(decodeURIComponent)
        .join("/")
    : storedValue;

  if (!privateMarker && /^https?:\/\//i.test(storedValue)) return storedValue;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

async function resolveInstituteLogo(
  instituteId: string,
  storedValue: string | null,
) {
  if (storedValue) {
    try {
      return await resolveStorageImage(storedValue, "institute-assets");
    } catch (error) {
      console.warn("Stored institute logo unavailable:", error);
    }
  }

  try {
    const { data, error } = await supabase.storage
      .from("institute-assets")
      .list(instituteId, {
        limit: 100,
        search: "logo-",
        sortBy: { column: "created_at", order: "desc" },
      });
    if (error) throw error;

    const latestLogo = data?.find(
      (item) => item.id && item.name.startsWith("logo-"),
    );
    return latestLogo
      ? resolveStorageImage(
          `${instituteId}/${latestLogo.name}`,
          "institute-assets",
        )
      : null;
  } catch (error) {
    console.warn("Could not find an institute logo:", error);
    return null;
  }
}

function CardField({ label, value }: { label: string; value: string }) {
  if (!value || value === "—") return null;
  return (
    <View style={styles.cardField}>
      <Text style={styles.cardFieldLabel}>{label}</Text>
      <Text style={styles.cardFieldValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function StudentIdCardScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const studentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const cardRef = useRef<ViewShotRef>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [institute, setInstitute] = useState<Institute | null>(null);
  const [className, setClassName] = useState("");
  const [batches, setBatches] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<StudentIdCardSettings>(
    DEFAULT_STUDENT_ID_CARD_SETTINGS,
  );
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function loadCard() {
        if (!studentId) {
          Alert.alert("ID card unavailable", "No student ID was provided.");
          setLoading(false);
          return;
        }

        setLoading(true);
        try {
          const { data: record, error: studentError } = await supabase
            .from("institute_students")
            .select("*")
            .eq("id", studentId)
            .single();
          if (studentError) throw studentError;
          if (!record) throw new Error("Student not found.");

          const studentRecord = record as Student;
          const [classResult, batchLinks, instituteResult, savedSettings] =
            await Promise.all([
              studentRecord.class_id
                ? supabase
                    .from("institute_classes")
                    .select("name")
                    .eq("id", studentRecord.class_id)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null }),
              supabase
                .from("institute_student_batches")
                .select("batch_id")
                .eq("student_id", studentRecord.id),
              supabase
                .from("institutes")
                .select("name,slogan,address,contact_phone,logo_url")
                .eq("id", studentRecord.institute_id)
                .maybeSingle(),
              loadStudentIdCardSettings(studentRecord.institute_id),
            ]);
          if (classResult.error) throw classResult.error;
          if (batchLinks.error) throw batchLinks.error;
          if (instituteResult.error) throw instituteResult.error;

          const batchIds = (batchLinks.data ?? []).map((item) => item.batch_id);
          let batchNames: string[] = [];
          if (batchIds.length) {
            const { data, error } = await supabase
              .from("institute_batches")
              .select("name")
              .eq("institute_id", studentRecord.institute_id)
              .in("id", batchIds);
            if (error) throw error;
            batchNames = (data ?? []).map((item) => item.name);
          }

          const [resolvedPhoto, resolvedLogo] = await Promise.all([
            resolveStorageImage(studentRecord.photo_path, "student-photos").catch(
              (error) => {
                console.warn("Student ID card photo unavailable:", error);
                return null;
              },
            ),
            resolveInstituteLogo(
              studentRecord.institute_id,
              instituteResult.data?.logo_url ?? null,
            ),
          ]);
          if (!active) return;

          setStudent(studentRecord);
          setInstitute(instituteResult.data ?? null);
          setClassName(classResult.data?.name ?? "");
          setBatches(batchNames);
          setPhotoUrl(resolvedPhoto);
          setLogoUrl(resolvedLogo);
          setSettings(savedSettings);
          setLoadedImages([]);
        } catch (error) {
          if (active) {
            Alert.alert(
              "Unable to load ID card",
              error instanceof Error ? error.message : "Please try again.",
            );
          }
        } finally {
          if (active) setLoading(false);
        }
      }
      void loadCard();
      return () => {
        active = false;
      };
    }, [studentId]),
  );

  const imageUris = [photoUrl, logoUrl].filter(
    (uri): uri is string => Boolean(uri),
  );
  const imagesReady = imageUris.every((uri) => loadedImages.includes(uri));
  const isHorizontal = settings.template === "horizontal";

  const handleImageLoaded = (uri: string) =>
    setLoadedImages((current) =>
      current.includes(uri) ? current : [...current, uri],
    );

  async function captureCard() {
    if (!cardRef.current || !student || !imagesReady) {
      throw new Error("Wait for the ID card preview to finish loading.");
    }
    const filename = `student-id-${student.roll_number.replace(
      /[^a-zA-Z0-9-_]/g,
      "",
    )}`;
    return captureRef(cardRef.current, {
      format: "png",
      quality: 1,
      result: "tmpfile",
      fileName: filename,
    });
  }

  async function shareCard() {
    setBusy(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        throw new Error("Sharing is not available on this device.");
      }
      const imageUri = await captureCard();
      await Sharing.shareAsync(imageUri, {
        mimeType: "image/png",
        dialogTitle: "Share student ID card",
        UTI: "public.png",
      });
    } catch (error) {
      Alert.alert(
        "Unable to share ID card",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadCard() {
    if (!student) {
      Alert.alert("ID card unavailable", "Student details have not loaded.");
      return;
    }
    setBusy(true);
    try {
      const imageUri = await captureCard();
      if (Platform.OS === "android") {
        const base64 = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const permission =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;

        const filename = `Student_ID_${student.roll_number.replace(
          /[^a-zA-Z0-9-_]/g,
          "_",
        )}`;
        const destination =
          await FileSystem.StorageAccessFramework.createFileAsync(
            permission.directoryUri,
            filename,
            "image/png",
          );
        await FileSystem.writeAsStringAsync(destination, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        Alert.alert("ID card saved", "The PNG image was saved successfully.");
      } else {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          throw new Error("Image saving is not available on this device.");
        }
        await Sharing.shareAsync(imageUri, {
          mimeType: "image/png",
          dialogTitle: "Save student ID card image",
          UTI: "public.png",
        });
      }
    } catch (error) {
      Alert.alert(
        "Unable to download ID card",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const width = Dimensions.get("window").width - 36;

  if (loading) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ActivityIndicator size="large" color={blue} />
        <Text style={styles.loadingText}>Preparing student ID card...</Text>
      </View>
    );
  }

  if (!student) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Student ID card is unavailable.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const shownFields = [
    settings.showFatherName && {
      label: "Father",
      value: student.father_name ?? "",
    },
    settings.showBloodGroup && {
      label: "Blood group",
      value: student.blood_group ?? "",
    },
    settings.showDateOfBirth && {
      label: "Date of birth",
      value: formatDate(student.date_of_birth),
    },
    settings.showGender && {
      label: "Gender",
      value: student.gender ?? "",
    },
    settings.showClass && {
      label: settings.useCourseLabel ? "Course" : "Class",
      value: className,
    },
    settings.showAdmissionDate && {
      label: "Admitted",
      value: formatDate(student.admission_date),
    },
    settings.showSeatNumber && {
      label: "Seat no.",
      value: student.seat_number == null ? "" : String(student.seat_number),
    },
    settings.showAddress && {
      label: "Address",
      value: student.address ?? "",
    },
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  const instituteName = institute?.name?.trim() || "";

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.headerButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={28} color={navy} />
        </Pressable>
        <Text style={styles.headerTitle}>Student ID card</Text>
        <Pressable
          style={styles.headerButton}
          onPress={() =>
            router.push({
              pathname: "/student-id-card-settings",
              params: { instituteId: student.institute_id },
            })
          }
          accessibilityLabel="ID card settings"
        >
          <Feather name="settings" size={21} color={navy} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 108 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.previewLabel}>
          {isHorizontal ? "LANDSCAPE PREVIEW" : "VERTICAL PREVIEW"}
        </Text>
        <ViewShot
          ref={cardRef}
          style={[
            styles.card,
            { width },
            isHorizontal ? styles.cardHorizontal : styles.cardVertical,
          ]}
        >
          <View style={[styles.cardHeader, isHorizontal && styles.cardHeaderHorizontal]}>
            {logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                style={styles.instituteLogo}
                resizeMode="contain"
                onLoad={() => handleImageLoaded(logoUrl)}
                onError={() => handleImageLoaded(logoUrl)}
              />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Feather name="home" size={20} color={navy} />
              </View>
            )}
            <View style={styles.instituteIdentity}>
              <Text style={styles.instituteName} numberOfLines={2}>
                {instituteName || "Institute"}
              </Text>
              {!!institute?.slogan && (
                <Text style={styles.instituteSlogan} numberOfLines={1}>
                  {institute.slogan}
                </Text>
              )}
              {!!institute?.address && (
                <Text style={styles.instituteContact} numberOfLines={1}>
                  {institute.address}
                </Text>
              )}
              {!!institute?.contact_phone && (
                <Text style={styles.instituteContact} numberOfLines={1}>
                  {institute.contact_phone}
                </Text>
              )}
            </View>
          </View>

          {isHorizontal ? (
            <View style={styles.horizontalBody}>
              <View style={styles.horizontalPhotoFrame}>
                {photoUrl ? (
                  <Image
                    source={{ uri: photoUrl }}
                    style={styles.horizontalPhoto}
                    resizeMode="cover"
                    onLoad={() => handleImageLoaded(photoUrl)}
                    onError={() => handleImageLoaded(photoUrl)}
                  />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Feather name="user" size={34} color="#8EA4B4" />
                  </View>
                )}
              </View>
              <View style={styles.horizontalInfo}>
                <Text style={styles.studentName} numberOfLines={2}>
                  {student.full_name}
                </Text>
                <View style={styles.mandatoryFields}>
                  <CardField label="Roll no." value={student.roll_number} />
                  <CardField label="Phone" value={student.phone ?? "—"} />
                  <CardField label="Batch" value={batches.join(", ") || "—"} />
                </View>
                {shownFields.length > 0 && (
                  <View style={styles.optionalFields}>
                    {shownFields.map((field) => (
                      <CardField
                        key={field.label}
                        label={field.label}
                        value={field.value}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>
          ) : (
            <>
              <View style={styles.verticalIdentity}>
                <View style={styles.verticalPhotoFrame}>
                  {photoUrl ? (
                    <Image
                      source={{ uri: photoUrl }}
                      style={styles.verticalPhoto}
                      resizeMode="cover"
                      onLoad={() => handleImageLoaded(photoUrl)}
                      onError={() => handleImageLoaded(photoUrl)}
                    />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Feather name="user" size={38} color="#8EA4B4" />
                    </View>
                  )}
                </View>
                <Text style={styles.studentName} numberOfLines={2}>
                  {student.full_name}
                </Text>
                <Text style={styles.studentRoll}>
                  Roll no. {student.roll_number}
                </Text>
              </View>
              <View style={styles.verticalFields}>
                <CardField label="Phone" value={student.phone ?? "—"} />
                <CardField label="Batch" value={batches.join(", ") || "—"} />
                {shownFields.map((field) => (
                  <CardField
                    key={field.label}
                    label={field.label}
                    value={field.value}
                  />
                ))}
              </View>
            </>
          )}
          <View style={[styles.cardFooter, isHorizontal && styles.cardFooterHorizontal]}>
            <Text style={styles.footerText}>STUDENT IDENTITY CARD</Text>
            <Text style={styles.footerText}>
              {student.status === "inactive" ? "INACTIVE" : "VALID STUDENT"}
            </Text>
          </View>
        </ViewShot>
        {!imagesReady && imageUris.length > 0 && (
          <Text style={styles.imageHint}>Loading card images...</Text>
        )}
        <Pressable
          style={styles.settingsLink}
          onPress={() =>
            router.push({
              pathname: "/student-id-card-settings",
              params: { instituteId: student.institute_id },
            })
          }
        >
          <Feather name="sliders" size={17} color={blue} />
          <Text style={styles.settingsLinkText}>Customize ID card</Text>
          <Feather name="chevron-right" size={18} color={blue} />
        </Pressable>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          style={[styles.actionButton, styles.shareButton]}
          onPress={() => void shareCard()}
          disabled={busy || !imagesReady}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Feather name="share-2" size={18} color="#FFFFFF" />
              <Text style={styles.actionText}>Share image</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.downloadButton]}
          onPress={() => void downloadCard()}
          disabled={busy || !imagesReady}
        >
          <Feather name="download" size={18} color="#FFFFFF" />
          <Text style={styles.actionText}>Download PNG</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F1F5F8" },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F1F5F8",
  },
  loadingText: { color: "#667C8E", fontSize: 14 },
  backLink: { color: blue, fontWeight: "700", padding: 10 },
  header: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E7ED",
  },
  headerButton: {
    width: 38,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, color: navy, fontSize: 20, fontWeight: "800" },
  content: { padding: 18, alignItems: "center" },
  previewLabel: {
    alignSelf: "flex-start",
    color: "#71869A",
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: "800",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E2E9",
    elevation: 5,
    shadowColor: "#152536",
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  cardVertical: { minHeight: 500 },
  cardHorizontal: { minHeight: 270 },
  cardHeader: {
    minHeight: 92,
    backgroundColor: navy,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 12,
  },
  cardHeaderHorizontal: { minHeight: 72, paddingVertical: 8 },
  instituteLogo: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  logoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  instituteIdentity: { flex: 1, minWidth: 0 },
  instituteName: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  instituteSlogan: { color: "#D5E0EA", fontSize: 10, marginTop: 3 },
  instituteContact: { color: "#D5E0EA", fontSize: 9, marginTop: 2 },
  verticalIdentity: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  verticalPhotoFrame: {
    width: 92,
    height: 104,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "#E7EEF3",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    elevation: 2,
  },
  verticalPhoto: { width: "100%", height: "100%" },
  horizontalBody: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 15,
    paddingVertical: 13,
    gap: 13,
  },
  horizontalPhotoFrame: {
    width: 78,
    height: 104,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: "#E7EEF3",
  },
  horizontalPhoto: { width: "100%", height: "100%" },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  horizontalInfo: { flex: 1, minWidth: 0 },
  studentName: {
    color: navy,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  studentRoll: {
    color: "#61778A",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  mandatoryFields: { flexDirection: "row", flexWrap: "wrap", columnGap: 12 },
  optionalFields: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    marginTop: 4,
  },
  verticalFields: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 8,
  },
  cardField: { minWidth: "40%", flexGrow: 1, marginTop: 5 },
  cardFieldLabel: {
    color: "#7A8D9D",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cardFieldValue: {
    color: navy,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  cardFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: navy,
    paddingHorizontal: 16,
  },
  cardFooterHorizontal: { minHeight: 28 },
  footerText: {
    color: "#FFFFFF",
    fontSize: 8,
    letterSpacing: 0.7,
    fontWeight: "800",
  },
  imageHint: { color: "#71869A", fontSize: 12, marginTop: 12 },
  settingsLink: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    marginTop: 18,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  settingsLinkText: { flex: 1, color: blue, fontSize: 14, fontWeight: "800" },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E7ED",
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shareButton: { backgroundColor: blue },
  downloadButton: { backgroundColor: navy },
  actionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
});
