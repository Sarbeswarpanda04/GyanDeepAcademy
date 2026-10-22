import { Feather } from "@expo/vector-icons";
import { decode, encode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useRef, useState } from "react";
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
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ViewShot, { captureRef, type ViewShotRef } from "react-native-view-shot";
import {
  DEFAULT_STUDENT_ID_CARD_SETTINGS,
  loadStudentIdCardSettings,
  type StudentIdCardSettings,
} from "../lib/student-id-card-settings";
import { supabase } from "../lib/supabase";

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
  photo_path: string | null;
};

type Institute = {
  name: string | null;
  slogan: string | null;
  address: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  signature_url: string | null;
  email: string | null;
};

const navy = "#1E293B";
const primaryBlue = "#2563EB";
const accentSlate = "#64748B";
const CARD_PRINT_SIZE = {
  landscape: { width: 1013, height: 638 },
  portrait: { width: 638, height: 1013 },
} as const;
const PNG_PIXELS_PER_METER = 11811;

function addPngResolutionMetadata(base64: string) {
  const png = new Uint8Array(decode(base64));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => png[index] === byte)) {
    throw new Error("Could not prepare the captured ID card as a PNG.");
  }

  let offset = 8;
  let headerEnd = 0;
  const remainingChunks: Uint8Array[] = [];
  while (offset + 12 <= png.length) {
    const chunkLength =
      png[offset] * 0x1000000 +
      (png[offset + 1] << 16) +
      (png[offset + 2] << 8) +
      png[offset + 3];
    const chunkEnd = offset + chunkLength + 12;
    if (chunkEnd > png.length) {
      throw new Error("The captured ID card PNG is incomplete.");
    }

    const chunkType = String.fromCharCode(...png.slice(offset + 4, offset + 8));
    if (chunkType === "IHDR") {
      headerEnd = chunkEnd;
    } else if (headerEnd && chunkType !== "pHYs") {
      remainingChunks.push(png.slice(offset, chunkEnd));
    }
    offset = chunkEnd;
    if (chunkType === "IEND") break;
  }

  if (!headerEnd) {
    throw new Error("The captured ID card PNG has no image header.");
  }

  const physicalResolutionChunk = new Uint8Array(21);
  const chunkView = new DataView(physicalResolutionChunk.buffer);
  chunkView.setUint32(0, 9, false);
  physicalResolutionChunk.set([112, 72, 89, 115], 4);
  chunkView.setUint32(8, PNG_PIXELS_PER_METER, false);
  chunkView.setUint32(12, PNG_PIXELS_PER_METER, false);
  physicalResolutionChunk[16] = 1;

  let crc = 0xffffffff;
  for (let index = 4; index <= 16; index += 1) {
    crc ^= physicalResolutionChunk[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  chunkView.setUint32(17, (crc ^ 0xffffffff) >>> 0, false);

  const outputSize =
    headerEnd +
    physicalResolutionChunk.length +
    remainingChunks.reduce((size, chunk) => size + chunk.length, 0);
  const output = new Uint8Array(outputSize);
  output.set(png.slice(0, headerEnd));
  output.set(physicalResolutionChunk, headerEnd);
  let outputOffset = headerEnd + physicalResolutionChunk.length;
  for (const chunk of remainingChunks) {
    output.set(chunk, outputOffset);
    outputOffset += chunk.length;
  }
  return encode(output.buffer);
}

async function makePrintReadyPng(uri: string, filename: string) {
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error("The app cache is unavailable for the ID card image.");
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const printReadyBase64 = addPngResolutionMetadata(base64);
  const printReadyUri = `${cacheDirectory}${filename}-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(printReadyUri, printReadyBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return printReadyUri;
}

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

async function resolveStorageImage(storedValue: string | null, bucket: string) {
  if (!storedValue) return null;
  if (storedValue.startsWith("data:image/")) return storedValue;

  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/authenticated/${bucket}/`,
  ];

  const marker = markers.find((item) => storedValue.includes(item));
  const isExternalUrl = /^https?:\/\//i.test(storedValue) && !marker;

  if (isExternalUrl) return storedValue;

  const objectPath = marker
    ? storedValue
        .slice(storedValue.indexOf(marker) + marker.length)
        .split("?")[0]
        .split("/")
        .map(decodeURIComponent)
        .join("/")
    : storedValue
        .replace(new RegExp(`^${bucket}/`), "")
        .replace(/^\/+/, "")
        .split("?")[0];

  if (!objectPath) {
    throw new Error(`The ${bucket} image path is empty.`);
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, 3600);

  if (error) {
    throw new Error(`Could not create a ${bucket} image URL: ${error.message}`);
  }

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
    if (!latestLogo) return null;

    return await resolveStorageImage(
      `${instituteId}/${latestLogo.name}`,
      "institute-assets",
    );
  } catch (error) {
    console.warn("Could not find an institute logo:", error);
    return null;
  }
}

function CardField({
  label,
  value,
  inline = false,
}: {
  label: string;
  value: string;
  inline?: boolean;
}) {
  if (!value || value === "—") return null;

  return (
    <View style={[styles.cardField, inline && styles.cardFieldInline]}>
      <Text
        style={[styles.cardFieldLabel, inline && styles.cardFieldLabelInline]}
      >
        {label}
      </Text>
      <Text
        style={[styles.cardFieldValue, inline && styles.cardFieldValueInline]}
        numberOfLines={inline ? 1 : 2}
      >
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
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
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
                .select(
                  "name,slogan,address,contact_phone,logo_url,signature_url",
                )
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

          const [resolvedPhoto, resolvedLogo, resolvedSignature] =
            await Promise.all([
              resolveStorageImage(
                studentRecord.photo_path,
                "student-photos",
              ).catch((error) => {
                console.warn("Student ID card photo unavailable:", error);
                return null;
              }),
              resolveInstituteLogo(
                studentRecord.institute_id,
                instituteResult.data?.logo_url ?? null,
              ),
              resolveStorageImage(
                instituteResult.data?.signature_url ?? null,
                "institute-assets",
              ).catch((error) => {
                console.warn("Institute signature unavailable:", error);
                return null;
              }),
            ]);

          if (!active) return;

          setStudent(studentRecord);
          setInstitute(instituteResult.data ?? null);
          setClassName(classResult.data?.name ?? "");
          setBatches(batchNames);
          setPhotoUrl(resolvedPhoto);
          setLogoUrl(resolvedLogo);
          setSignatureUrl(resolvedSignature);
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

  const imageUris = [photoUrl, logoUrl, signatureUrl].filter(
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
    const size = isHorizontal
      ? CARD_PRINT_SIZE.landscape
      : CARD_PRINT_SIZE.portrait;
    const capturedUri = await captureRef(cardRef.current, {
      format: "png",
      quality: 1,
      result: "tmpfile",
      fileName: filename,
      width: size.width,
      height: size.height,
    });
    return makePrintReadyPng(capturedUri, filename);
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
          /[^a-zA-Z0-9-\_]/g,
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

  const width = Math.min(Dimensions.get("window").width - 32, 400);
  const previewHeight = isHorizontal
    ? width *
      (CARD_PRINT_SIZE.landscape.height / CARD_PRINT_SIZE.landscape.width)
    : width *
      (CARD_PRINT_SIZE.portrait.height / CARD_PRINT_SIZE.portrait.width);

  if (loading) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <ActivityIndicator size="large" color={primaryBlue} />
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
      label: "Father's Name",
      value: student.father_name ?? "",
    },
    settings.showBloodGroup && {
      label: "Blood Group",
      value: student.blood_group ?? "",
    },
    settings.showDateOfBirth && {
      label: "Date of Birth",
      value: formatDate(student.date_of_birth),
    },
    settings.showGender && {
      label: "Gender",
      value: student.gender ?? "",
    },
    settings.showAdmissionDate && {
      label: "Admission Date",
      value: formatDate(student.admission_date),
    },
    settings.showAddress && {
      label: "Address",
      value: student.address ?? "",
    },
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  const verticalFields = [
    { label: "Class", value: className },
    { label: "Roll No.", value: student.roll_number },
    { label: "Phone", value: student.phone ?? "" },
    settings.showDateOfBirth && {
      label: "Date of Birth",
      value: formatDate(student.date_of_birth),
    },
    settings.showBloodGroup && {
      label: "Blood Group",
      value: student.blood_group ?? "",
    },
    settings.showFatherName && {
      label: "Father's Name",
      value: student.father_name ?? "",
    },
    settings.showGender && {
      label: "Gender",
      value: student.gender ?? "",
    },
    settings.showAdmissionDate && {
      label: "Admission Date",
      value: formatDate(student.admission_date),
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

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.headerButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={22} color={navy} />
        </Pressable>
        <Text style={styles.headerTitle}>Student ID Card</Text>
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
          <Feather name="settings" size={20} color={navy} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.previewLabel}>
          {isHorizontal ? "LANDSCAPE PREVIEW" : "PORTRAIT ID CARD"}
        </Text>

        {/* ID Card Wrapper */}
        <ViewShot
          ref={cardRef}
          style={[
            styles.card,
            { width, height: previewHeight },
            isHorizontal ? styles.cardHorizontal : styles.cardVertical,
          ]}
        >
          {/* Card Top Header */}
          <View
            style={[
              styles.cardHeader,
              isHorizontal && styles.cardHeaderHorizontal,
            ]}
          >
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
                <Feather name="shield" size={20} color={primaryBlue} />
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
            </View>
          </View>

          {/* Card Body content */}
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
                    <Feather name="user" size={32} color={accentSlate} />
                  </View>
                )}
              </View>

              <View style={styles.horizontalInfo}>
                <Text style={styles.studentName} numberOfLines={2}>
                  {student.full_name}
                </Text>
                <View style={styles.mandatoryFields}>
                  <CardField label="Roll No." value={student.roll_number} />
                  <CardField
                    label="Phone"
                    value={student.phone ?? "—"}
                    inline
                  />
                  <CardField label="Class" value={className || "—"} />
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
                      <Feather name="user" size={40} color={accentSlate} />
                    </View>
                  )}
                </View>
                <Text style={styles.studentName} numberOfLines={2}>
                  {student.full_name}
                </Text>
              </View>

              <View style={styles.verticalFields}>
                {verticalFields.map((field) => (
                  <CardField
                    key={field.label}
                    label={field.label}
                    value={field.value}
                    inline={
                      !["Address", "Father's Name", "Admission Date"].includes(
                        field.label,
                      )
                    }
                  />
                ))}
              </View>
            </>
          )}

          {/* Verification QR and Signature Section */}
          <View
            style={[
              styles.cardVerificationRow,
              isHorizontal && styles.cardVerificationRowHorizontal,
            ]}
          >
            <View style={styles.qrBlock}>
              <QRCode
                value={JSON.stringify({
                  type: "STUDENT_ID",
                  studentId: student.id,
                  rollNumber: student.roll_number,
                })}
                size={isHorizontal ? 48 : 56}
                backgroundColor="#FFFFFF"
                color={navy}
                ecl="M"
              />
              {!isHorizontal && (
                <Text style={styles.qrCaption}>STUDENT ID QR</Text>
              )}
            </View>
            <View style={styles.signatureBlock}>
              {signatureUrl ? (
                <Image
                  source={{ uri: signatureUrl }}
                  style={styles.signatureImage}
                  resizeMode="contain"
                  onLoad={() => handleImageLoaded(signatureUrl)}
                  onError={({ nativeEvent }) => {
                    console.warn(
                      "Institute signature failed to render:",
                      nativeEvent.error,
                    );
                    handleImageLoaded(signatureUrl);
                  }}
                />
              ) : (
                <View style={styles.signatureImagePlaceholder} />
              )}
              <View style={styles.signatureLine} />
              <Text style={styles.signatureTitle}>Authorized Signature</Text>
              {!isHorizontal && (
                <Text style={styles.signatureAuthority}>
                  INSTITUTE AUTHORITY
                </Text>
              )}
            </View>
          </View>

          {/* Card Footer */}
          <View
            style={[
              styles.cardFooter,
              isHorizontal && styles.cardFooterHorizontal,
            ]}
          >
            <View style={styles.footerMain}>
              <Text style={styles.footerContact} numberOfLines={1}>
                INSTITUTE EMAIL: {institute.email}
              </Text>

              <Text
                style={[
                  styles.footerText,
                  student.status === "inactive" && styles.inactiveText,
                ]}
              >
                {student.status === "inactive" ? "INACTIVE" : "VALID STUDENT"}
              </Text>
            </View>
            {!isHorizontal && !!institute?.contact_phone && (
              <Text style={styles.footerContact} numberOfLines={1}>
                INSTITUTE CONTACT: {institute.contact_phone}
              </Text>
            )}
          </View>
        </ViewShot>

        {!imagesReady && imageUris.length > 0 && (
          <Text style={styles.imageHint}>Loading card assets...</Text>
        )}

        {/* Quick Settings Navigation */}
        <Pressable
          style={styles.settingsLink}
          onPress={() =>
            router.push({
              pathname: "/student-id-card-settings",
              params: { instituteId: student.institute_id },
            })
          }
        >
          <View style={styles.settingsIconCircle}>
            <Feather name="sliders" size={16} color={primaryBlue} />
          </View>
          <Text style={styles.settingsLinkText}>
            Customize ID Card Template
          </Text>
          <Feather name="chevron-right" size={18} color={accentSlate} />
        </Pressable>
      </ScrollView>

      {/* Action Footer */}
      <View
        style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <Pressable
          style={[styles.actionButton, styles.shareButton]}
          onPress={() => void shareCard()}
          disabled={busy || !imagesReady}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Feather name="share-2" size={18} color="#FFFFFF" />
              <Text style={styles.actionText}>Share Card</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.downloadButton]}
          onPress={() => void downloadCard()}
          disabled={busy || !imagesReady}
        >
          <Feather name="download" size={18} color="#FFFFFF" />
          <Text style={styles.actionText}>Save PNG</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8FAFC",
  },
  loadingText: { color: accentSlate, fontSize: 14, fontWeight: "500" },
  backLink: { color: primaryBlue, fontWeight: "600", padding: 10 },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  headerTitle: { color: navy, fontSize: 17, fontWeight: "700" },
  content: { padding: 16, alignItems: "center" },
  previewLabel: {
    alignSelf: "flex-start",
    color: accentSlate,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "700",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D8DEE8",
    shadowColor: "#132238",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardVertical: {},
  cardHorizontal: {},
  cardHeader: {
    minHeight: 82,
    backgroundColor: navy,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 13,
    borderBottomWidth: 3,
    borderBottomColor: "#D5AD5B",
  },
  cardHeaderHorizontal: { paddingVertical: 10 },
  instituteLogo: {
    width: 60,
    height: 60,
    borderRadius: 25,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#D5AD5B",
  },
  logoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 25,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#D5AD5B",
  },
  instituteIdentity: { flex: 1, minWidth: 0 },
  instituteName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  instituteSlogan: {
    color: "#ffbb00",
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
  },
  instituteContact: {
    color: "#CBD5E1",
    fontSize: 12,
    marginTop: 1,
    textAlign: "center",
  },
  verticalIdentity: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 7,
  },
  verticalPhotoFrame: {
    width: 130,
    height: 150,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E9EEF4",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: navy,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  verticalPhoto: { width: "100%", height: "100%" },
  horizontalBody: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  horizontalPhotoFrame: {
    width: 76,
    height: 94,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F1F5F9",
    borderWidth: 2,
    borderColor: "#E2E8F0",
  },
  horizontalPhoto: { width: "100%", height: "100%" },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  horizontalInfo: { flex: 1, minWidth: 0 },
  studentName: {
    color: navy,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 1,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  studentClass: {
    color: primaryBlue,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  studentRoll: {
    color: primaryBlue,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  mandatoryFields: { flexDirection: "row", flexWrap: "wrap", columnGap: 12 },
  optionalFields: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    marginTop: 2,
  },
  verticalFields: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 94,
    columnGap: 8,
    rowGap: 3,
  },
  cardField: { width: "47%", flexGrow: 1, marginTop: 4 },
  cardFieldInline: {
    flexDirection: "row",
    alignItems: "baseline",
    columnGap: 6,
  },
  cardFieldLabel: {
    color: accentSlate,
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardFieldLabelInline: { fontSize: 8, letterSpacing: 0.2, flexShrink: 0 },
  cardFieldValue: {
    color: navy,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  cardFieldValueInline: { flex: 1, marginTop: 0, fontSize: 9 },
  cardVerificationRow: {
    position: "absolute",
    bottom: 49,
    left: 18,
    right: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardVerificationRowHorizontal: { bottom: 28 },
  qrBlock: {
    backgroundColor: "#FFFFFF",
    padding: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  qrCaption: {
    color: navy,
    fontSize: 6,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: 0.4,
  },
  signatureBlock: {
    alignItems: "center",
    width: 130,
  },
  signatureImage: {
    width: 120,
    height: 30,
    resizeMode: "contain",
  },
  signatureImagePlaceholder: { width: 120, height: 30 },
  signatureLine: {
    width: "100%",
    height: 1,
    backgroundColor: "#64748B",
    marginBottom: 4,
  },
  signatureTitle: {
    color: navy,
    fontSize: 8,
    fontWeight: "700",
  },
  signatureAuthority: {
    color: accentSlate,
    fontSize: 6,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  cardFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: navy,
    paddingHorizontal: 12,
    borderTopWidth: 2,
    borderTopColor: "#D5AD5B",
  },
  cardFooterHorizontal: { height: 24 },
  footerMain: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    color: "#FFFFFF",
    fontSize: 7,
    letterSpacing: 0.55,
    fontWeight: "700",
  },
  footerContact: {
    color: "#D5AD5B",
    fontSize: 6,
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: 0.4,
  },
  inactiveText: { color: "#F87171" },
  imageHint: { color: accentSlate, fontSize: 12, marginTop: 12 },
  settingsLink: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  settingsIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsLinkText: { flex: 1, color: navy, fontSize: 14, fontWeight: "700" },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  shareButton: { backgroundColor: primaryBlue },
  downloadButton: { backgroundColor: navy },
  actionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
