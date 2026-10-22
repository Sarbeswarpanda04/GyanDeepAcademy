import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
import { encode } from "base64-arraybuffer";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppAlert, { type AppAlertType } from "../components/AppAlert";
import { supabase } from "../lib/supabase";

type Student = {
  id: string;
  institute_id: string;
  full_name: string;
  roll_number: string;
  school_name: string | null;
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
  address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  slogan: string | null;
  logo_url: string | null;
  signature_url: string | null;
};

type StudentFee = {
  fee_amount: number;
  fee_frequency: string;
} | null;

function getFeeLabel(fee: StudentFee) {
  const frequency = fee?.fee_frequency.replace(/_/g, " ");
  return frequency === "monthly" ? "Monthly fee" : `Fee (${frequency ?? "—"})`;
}

type AlertState = {
  title: string;
  message: string;
  type: AppAlertType;
} | null;

const escapeHtml = (value: unknown): string => {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return String(value ?? "—").replace(
    /[&<>"']/g,
    (character) => entities[character],
  );
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(`${value}${value.length === 10 ? "T00:00:00" : ""}`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return fallback;
};

function makePdfHtml(
  student: Student,
  className: string,
  batches: string[],
  subjects: string[],
  fee: StudentFee,
  photoDataUri: string | null,
  logoDataUri: string | null,
  signatureDataUri: string | null,
  institute: Institute,
) {
  const row = (label: string, value: unknown) => `
    <div class="detail">
      <span class="detail-label">${escapeHtml(label)}</span>
      <span class="detail-value">${escapeHtml(value || "—")}</span>
    </div>`;
  const feeFrequency = fee?.fee_frequency.replace(/_/g, " ");
  const feeValue =
    fee == null
      ? "—"
      : `₹${Number(fee.fee_amount).toLocaleString("en-IN")} / ${feeFrequency}`;
  const instituteLines = [
    institute.contact_phone,
    institute.contact_email,
  ]
    .filter(Boolean)
    .map((value) => `<div class="institute-subtitle">${escapeHtml(value)}</div>`)
    .join("");

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: 210mm 297mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { width: 210mm; height: 297mm; margin: 0; }
      body { font-family: Arial, Helvetica, sans-serif; color: #1c2d43; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { position: relative; width: 210mm; height: 297mm; padding: 13mm; overflow: hidden; background: #fff; }
      .frame { position: absolute; inset: 7mm; border: 0.5mm solid #d8e1ea; pointer-events: none; }
      .top-rule { position: absolute; inset: 0 0 auto; height: 4mm; background: #183b64; }
      .brand { display: flex; align-items: center; min-height: 31mm; gap: 5mm; padding: 0 0 4mm; border-bottom: 0.4mm solid #dce4ec; }
      .brand-logo { flex: 0 0 25mm; width: 25mm; height: 25mm; object-fit: contain; }
      .brand-copy { flex: 1; min-width: 0; text-align: center; }
      .institute-name { display: inline-block; max-width: 100%; padding: 0 0 .7mm; border-bottom: 0.5mm solid #183b64; color: #263343; font-size: 16pt; font-weight: 700; line-height: 1.1; text-transform: uppercase; }
      .institute-slogan { margin-top: 1.6mm; color: #ef7b27; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
      .academic-line { margin-top: 1.3mm; color: #183b64; font-size: 7.5pt; }
      .institute-subtitle { margin-top: .8mm; color: #66778a; font-size: 7pt; line-height: 1.15; }
      .document-label { color: #bb8b3d; font-size: 6.5pt; font-weight: 700; letter-spacing: 1.1pt; text-transform: uppercase; margin-top: 1.5mm; }
      .profile { display: flex; gap: 7mm; align-items: center; margin-top: 9mm; padding: 7mm; background: #f4f7fa; border: 0.4mm solid #e0e7ef; border-radius: 2mm; }
      .student-photo { width: 35mm; height: 43mm; object-fit: cover; border: 0.6mm solid #d6e0e9; background: #edf2f6; }
      .profile-copy { flex: 1; }
      .student-name { margin: 0 0 5mm; color: #183b64; font-size: 19pt; font-weight: 700; }
      .identity-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 6mm; }
      .identity-label { color: #718196; font-size: 7pt; font-weight: 700; letter-spacing: .5pt; text-transform: uppercase; }
      .identity-value { margin-top: 1.3mm; color: #243c56; font-size: 10pt; font-weight: 600; }
      .section-heading { margin: 9mm 0 3mm; color: #183b64; font-size: 9pt; font-weight: 700; letter-spacing: 1pt; text-transform: uppercase; }
      .details { display: grid; grid-template-columns: 1fr 1fr; border-top: 0.3mm solid #dce4ec; border-left: 0.3mm solid #dce4ec; }
      .detail { min-height: 19mm; padding: 3.5mm 4mm; border-right: 0.3mm solid #dce4ec; border-bottom: 0.3mm solid #dce4ec; }
      .detail-wide { grid-column: 1 / -1; }
      .detail-label { display: block; color: #718196; font-size: 7pt; font-weight: 700; letter-spacing: .4pt; text-transform: uppercase; }
      .detail-value { display: block; margin-top: 2mm; color: #263c54; font-size: 10pt; line-height: 1.35; overflow-wrap: anywhere; }
      .signature-row { display: flex; justify-content: space-between; align-items: end; margin-top: 21mm; color: #63758a; font-size: 8pt; }
      .signature { width: 48mm; text-align: center; }
      .signature-mark { display: flex; height: 15mm; align-items: center; justify-content: center; }
      .signature-image { display: block; width: 40mm; height: 13mm; object-fit: contain; }
      .signature-label { display: block; padding-top: 2mm; border-top: 0.3mm solid #aebbc9; }
      .issued { margin-top: 7mm; padding-top: 4mm; border-top: 0.3mm solid #dce4ec; color: #8090a1; font-size: 7.5pt; text-align: center; }
    </style>
  </head>
  <body>
    <main class="sheet">
      <div class="top-rule"></div>
      <div class="frame"></div>
      <header class="brand">
        ${logoDataUri ? `<img class="brand-logo" src="${logoDataUri}" alt="" />` : ""}
        <div class="brand-copy">
          <div class="institute-name">${escapeHtml(institute.name)}</div>
          ${institute.slogan ? `<div class="institute-slogan">${escapeHtml(institute.slogan)}</div>` : ""}
          ${institute.address ? `<div class="academic-line">${escapeHtml(institute.address)}</div>` : ""}
          ${instituteLines}
          <div class="document-label">Student details document</div>
        </div>
      </header>
      <section class="profile">
        ${photoDataUri ? `<img class="student-photo" src="${photoDataUri}" alt="" />` : ""}
        <div class="profile-copy">
          <h1 class="student-name">${escapeHtml(student.full_name)}</h1>
          <div class="identity-grid">
            <div><div class="identity-label">Roll number</div><div class="identity-value">${escapeHtml(student.roll_number)}</div></div>
            <div><div class="identity-label">Class</div><div class="identity-value">${escapeHtml(className)}</div></div>
            <div><div class="identity-label">Admission date</div><div class="identity-value">${escapeHtml(formatDate(student.admission_date))}</div></div>
            <div><div class="identity-label">${escapeHtml(getFeeLabel(fee))}</div><div class="identity-value">${escapeHtml(feeValue)}</div></div>
          </div>
        </div>
      </section>
      <h2 class="section-heading">Personal details</h2>
      <section class="details">
        ${row("Father's name", student.father_name)}
        ${row("Phone", student.phone)}
        ${row("School", student.school_name)}
        ${row("Gender", student.gender)}
        ${row("Date of birth", formatDate(student.date_of_birth))}
        ${row("Blood group", student.blood_group)}
        ${row("Address", student.address)}
        ${row("Batches", batches.join(", "))}
        <div class="detail detail-wide">
          <span class="detail-label">Enrolled subjects</span>
          <span class="detail-value">${escapeHtml(subjects.join(", "))}</span>
        </div>
      </section>
      <div class="signature-row">
        <span>Issued ${escapeHtml(formatDate(new Date().toISOString().slice(0, 10)))}</span>
        <span class="signature">
          <span class="signature-mark">${signatureDataUri ? `<img class="signature-image" src="${signatureDataUri}" alt="" />` : ""}</span>
          <span class="signature-label">Authorized signature</span>
        </span>
      </div>
      <footer class="issued">${escapeHtml(institute.name)} · Student record</footer>
    </main>
  </body>
  </html>`;
}

async function resolveAssetUrl(storedValue: string | null, bucket: string) {
  if (!storedValue) return null;
  const storageMarkers = [
    { path: `/storage/v1/object/public/${bucket}/`, access: "public" },
    { path: `/storage/v1/object/sign/${bucket}/`, access: "private" },
    {
      path: `/storage/v1/object/authenticated/${bucket}/`,
      access: "private",
    },
  ];
  const matchedMarker = storageMarkers.find(({ path }) =>
    storedValue.includes(path),
  );
  if (matchedMarker?.access === "public") return storedValue;

  const objectPath = matchedMarker
    ? storedValue
        .slice(
          storedValue.indexOf(matchedMarker.path) +
            matchedMarker.path.length,
        )
        .split("?")[0]
        .split("/")
        .map((part) => decodeURIComponent(part))
        .join("/")
    : storedValue;

  if (!matchedMarker && /^https?:\/\//i.test(storedValue)) return storedValue;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

async function findLatestInstituteAsset(
  instituteId: string,
  assetPrefix: "logo-" | "signature-",
) {
  const { data, error } = await supabase.storage
    .from("institute-assets")
    .list(instituteId, {
      limit: 100,
      search: assetPrefix,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) throw error;

  const asset = data?.find(
    (item) => item.id && item.name.startsWith(assetPrefix),
  );
  return asset ? `${instituteId}/${asset.name}` : null;
}

async function toImageDataUri(url: string | null) {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load an image for the PDF (HTTP ${response.status}).`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (!contentType?.startsWith("image/")) {
    throw new Error("An image URL returned data that is not an image.");
  }

  return `data:${contentType};base64,${encode(await response.arrayBuffer())}`;
}

async function loadOptionalImage(
  storedValue: string | null,
  bucket: string,
  label: string,
  fallbackPath?: () => Promise<string | null>,
) {
  try {
    let url: string | null = null;
    let dataUri: string | null = null;

    if (storedValue) {
      try {
        url = await resolveAssetUrl(storedValue, bucket);
        dataUri = await toImageDataUri(url);
      } catch (error: unknown) {
        if (!fallbackPath) throw error;
      }
    }

    if (!dataUri && fallbackPath) {
      const discoveredPath = await fallbackPath();
      if (discoveredPath) {
        url = await resolveAssetUrl(discoveredPath, bucket);
        dataUri = await toImageDataUri(url);
      }
    }

    return {
      url,
      dataUri,
    };
  } catch (error: unknown) {
    console.warn(
      `Student PDF ${label} image unavailable:`,
      getErrorMessage(error, "Could not load image."),
    );
    return { url: null, dataUri: null };
  }
}

export default function StudentDetailsDocumentScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const studentId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [student, setStudent] = useState<Student | null>(null);
  const [institute, setInstitute] = useState<Institute>({
    name: null,
    address: null,
    contact_phone: null,
    contact_email: null,
    slogan: null,
    logo_url: null,
    signature_url: null,
  });
  const [className, setClassName] = useState("—");
  const [batches, setBatches] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [fee, setFee] = useState<StudentFee>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [instituteLogoUrl, setInstituteLogoUrl] = useState<string | null>(null);
  const [instituteSignatureUrl, setInstituteSignatureUrl] = useState<
    string | null
  >(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);
  const pdfBase64Ref = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadStudentDocument = async () => {
      if (!studentId) {
        setAlert({
          title: "Student unavailable",
          message: "No student ID was provided.",
          type: "error",
        });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const { data: studentRecord, error: studentError } = await supabase
          .from("institute_students")
          .select("*")
          .eq("id", studentId)
          .single();

        if (studentError) throw studentError;
        if (!studentRecord) throw new Error("Student not found.");

        const [
          classResult,
          batchLinksResult,
          subjectLinksResult,
          feeResult,
          instituteResult,
        ] =
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
              .from("institute_student_subjects")
              .select("subject_id")
              .eq("student_id", studentRecord.id),
            supabase
              .from("institute_student_fees")
              .select("fee_amount,fee_frequency")
              .eq("institute_id", studentRecord.institute_id)
              .eq("student_id", studentRecord.id)
              .maybeSingle(),
            supabase
              .from("institutes")
              .select(
                "name,address,contact_phone,contact_email,slogan,logo_url,signature_url",
              )
              .eq("id", studentRecord.institute_id)
              .maybeSingle(),
          ]);

        if (classResult.error) throw classResult.error;
        if (batchLinksResult.error) throw batchLinksResult.error;
        if (subjectLinksResult.error) throw subjectLinksResult.error;
        if (feeResult.error) throw feeResult.error;
        if (instituteResult.error) throw instituteResult.error;

        const batchIds = (batchLinksResult.data ?? []).map(
          (item) => item.batch_id,
        );
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

        const subjectIds = (subjectLinksResult.data ?? []).map(
          (item) => item.subject_id,
        );
        let subjectNames: string[] = [];

        if (subjectIds.length) {
          const { data, error } = await supabase
            .from("institute_subjects")
            .select("name")
            .eq("institute_id", studentRecord.institute_id)
            .in("id", subjectIds)
            .order("name");

          if (error) throw error;
          subjectNames = (data ?? []).map((item) => item.name);
        }

        const [photo, logo, signature] = await Promise.all([
          loadOptionalImage(
            studentRecord.photo_path,
            "student-photos",
            "student photo",
          ),
          loadOptionalImage(
            instituteResult.data?.logo_url ?? null,
            "institute-assets",
            "institute logo",
            () =>
              findLatestInstituteAsset(
              studentRecord.institute_id,
              "logo-",
            ),
          ),
          loadOptionalImage(
            instituteResult.data?.signature_url ?? null,
            "institute-assets",
            "institute signature",
          ),
        ]);

        if (cancelled) return;

        const instituteRecord = instituteResult.data ?? {
          name: null,
          address: null,
          contact_phone: null,
          contact_email: null,
          slogan: null,
          logo_url: null,
          signature_url: null,
        };
        const resolvedClassName = classResult.data?.name ?? "—";

        setStudent(studentRecord);
        setInstitute(instituteRecord);
        setClassName(resolvedClassName);
        setBatches(batchNames);
        setSubjects(subjectNames);
        setFee(feeResult.data);
        setPhotoUrl(photo.url);
        setInstituteLogoUrl(logo.url);
        setInstituteSignatureUrl(signature.url);

        const generatedPdf = await Print.printToFileAsync({
          html: makePdfHtml(
            studentRecord,
            resolvedClassName,
            batchNames,
            subjectNames,
            feeResult.data,
            photo.dataUri,
            logo.dataUri,
            signature.dataUri,
            instituteRecord,
          ),
          width: 595.28,
          height: 841.89,
          margins: { top: 0, right: 0, bottom: 0, left: 0 },
          base64: true,
        });

        if (!generatedPdf.base64) {
          throw new Error("The generated PDF data was empty.");
        }

        const cacheDirectory = FileSystem.cacheDirectory;
        if (!cacheDirectory) {
          throw new Error("The device cache folder is unavailable.");
        }

        const shareableUri = `${cacheDirectory}student-document-${studentRecord.id}-${Date.now()}.pdf`;
        await FileSystem.writeAsStringAsync(
          shareableUri,
          generatedPdf.base64,
          { encoding: FileSystem.EncodingType.Base64 },
        );

        if (!cancelled) {
          pdfBase64Ref.current = generatedPdf.base64;
          setPdfUri(shareableUri);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setAlert({
            title: "PDF preview failed",
            message: getErrorMessage(
              error,
              "Unable to create the student PDF.",
            ),
            type: "error",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadStudentDocument();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const downloadPdf = async () => {
    if (!pdfUri || !student || busy) return;

    setBusy(true);
    try {
      const base64 = pdfBase64Ref.current;
      if (!base64) {
        throw new Error("The generated PDF data is no longer available.");
      }

      const safeRollNumber = student.roll_number.replace(
        /[^a-z0-9_-]/gi,
        "_",
      );
      const filename = `Student_Details_${safeRollNumber || "record"}.pdf`;
      const filenameWithoutExtension = filename.slice(0, -".pdf".length);

      if (Platform.OS === "android") {
        const permission =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;

        const destination =
          await FileSystem.StorageAccessFramework.createFileAsync(
            permission.directoryUri,
            filenameWithoutExtension,
            "application/pdf",
          );
        await FileSystem.writeAsStringAsync(destination, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        if (!FileSystem.documentDirectory) {
          throw new Error("The device document folder is unavailable.");
        }
        const destination = `${FileSystem.documentDirectory}${filename}`;
        const existingFile = await FileSystem.getInfoAsync(destination);
        if (existingFile.exists) {
          await FileSystem.deleteAsync(destination);
        }
        await FileSystem.copyAsync({
          from: pdfUri,
          to: destination,
        });
      }

      setAlert({
        title: "PDF downloaded",
        message:
          Platform.OS === "android"
            ? "The student PDF was saved to the selected folder."
            : "The student PDF was saved in the app's Documents folder, available in Files.",
        type: "success",
      });
    } catch (error: unknown) {
      setAlert({
        title: "Download failed",
        message: getErrorMessage(error, "Could not save the PDF."),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const sharePdf = async () => {
    if (!pdfUri || busy) return;

    setBusy(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        throw new Error("PDF sharing is not supported on this device.");
      }
      const fileInfo = await FileSystem.getInfoAsync(pdfUri);
      if (!fileInfo.exists) {
        throw new Error("The generated PDF file is no longer available.");
      }
      await Sharing.shareAsync(pdfUri, {
        mimeType: "application/pdf",
        dialogTitle: "Share student PDF",
        UTI: "com.adobe.pdf",
      });
    } catch (error: unknown) {
      setAlert({
        title: "Share failed",
        message: getErrorMessage(error, "Could not share the PDF."),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.back}
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={28} color="#26364A" />
        </Pressable>
        <Text style={styles.headerTitle}>Student details document</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#26364A" />
          <Text style={styles.loadingText}>Preparing student PDF...</Text>
        </View>
      ) : student && pdfUri ? (
        <ScrollView contentContainerStyle={styles.previewArea}>
          <View style={styles.paper}>
            <View style={styles.academyHeader}>
              {instituteLogoUrl ? (
                <Image
                  source={{ uri: instituteLogoUrl }}
                  style={styles.logo}
                  resizeMode="contain"
                />
              ) : null}
              <View style={styles.academyCopy}>
                <Text style={styles.academyName}>
                  {institute.name}
                </Text>
                {!!institute.slogan && (
                  <Text style={styles.academySlogan}>
                    {institute.slogan}
                  </Text>
                )}
                {!!institute.address && (
                  <Text style={styles.academicLine}>
                    {institute.address}
                  </Text>
                )}
                {!!institute.contact_phone && (
                  <Text style={styles.small}>{institute.contact_phone}</Text>
                )}
                {!!institute.contact_email && (
                  <Text style={styles.small}>{institute.contact_email}</Text>
                )}
              </View>
            </View>

            <View style={styles.studentHero}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Feather name="user" size={36} color="#64748B" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>{student.full_name}</Text>
                <View style={styles.metaGrid}>
                  <Meta label="Roll number" value={student.roll_number} />
                  <Meta label="Class" value={className} />
                  <Meta
                    label="Admission date"
                    value={formatDate(student.admission_date)}
                  />
                  <Meta label={getFeeLabel(fee)} value={formatFee(fee)} />
                </View>
              </View>
            </View>

            <Text style={styles.section}>PERSONAL DETAILS</Text>
            <View style={styles.detailsGrid}>
              <Info label="Father's name" value={student.father_name} />
              <Info label="Phone" value={student.phone} />
              <Info label="School" value={student.school_name} />
              <Info label="Gender" value={student.gender} />
              <Info
                label="Date of birth"
                value={formatDate(student.date_of_birth)}
              />
              <Info label="Blood group" value={student.blood_group} />
              <Info label="Address" value={student.address} />
              <Info label="Batches" value={batches.join(", ")} />
              <Info
                label="Enrolled subjects"
                value={subjects.join(", ")}
                fullWidth
              />
            </View>
            <View style={styles.documentFooter}>
              <Text style={styles.issued}>
                Issued {formatDate(new Date().toISOString().slice(0, 10))}
              </Text>
              <View style={styles.signature}>
                {instituteSignatureUrl ? (
                  <Image
                    source={{ uri: instituteSignatureUrl }}
                    style={styles.signatureImage}
                    resizeMode="contain"
                  />
                ) : null}
                <Text style={styles.signatureLabel}>
                  Authorized signature
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Feather name="file-text" size={38} color="#64748B" />
          <Text style={styles.loadingText}>Unable to generate the PDF preview.</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.actionButton,
            styles.shareButton,
            (!pdfUri || busy) && styles.disabled,
          ]}
          onPress={() => void sharePdf()}
          disabled={!pdfUri || busy}
        >
          {busy ? (
            <ActivityIndicator color="#26364A" />
          ) : (
            <>
              <Feather name="share-2" size={19} color="#26364A" />
              <Text style={styles.shareText}>Share</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[
            styles.actionButton,
            styles.downloadButton,
            (!pdfUri || busy) && styles.disabled,
          ]}
          onPress={() => void downloadPdf()}
          disabled={!pdfUri || busy}
        >
          <Feather name="download" size={19} color="#FFFFFF" />
          <Text style={styles.downloadText}>Download</Text>
        </Pressable>
      </View>

      <AppAlert
        visible={!!alert}
        title={alert?.title ?? ""}
        message={alert?.message ?? ""}
        type={alert?.type ?? "info"}
        onCancel={() => setAlert(null)}
      />
    </SafeAreaView>
  );
}

function Meta({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.metaValue}>{value || "—"}</Text>
    </View>
  );
}

function formatFee(fee: StudentFee) {
  if (!fee) return "—";
  const frequency = fee.fee_frequency.replace(/_/g, " ");
  return `₹${Number(fee.fee_amount).toLocaleString("en-IN")} / ${frequency}`;
}

type InfoProps = {
  label: string;
  value?: string | number | null;
  fullWidth?: boolean;
};

function Info(props: InfoProps) {
  return (
    <View
      style={[
        styles.infoRow,
        props.fullWidth === true && styles.infoRowFullWidth,
      ]}
    >
      <Text style={styles.infoLabel}>{props.label}</Text>
      <Text style={styles.infoValue}>{props.value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#3B4D64" },
  header: {
    minHeight: 62,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  back: { padding: 5, marginRight: 12 },
  headerTitle: { fontSize: 21, fontWeight: "700", color: "#26364A" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: "#FFFFFF", fontSize: 15, textAlign: "center" },
  previewArea: { padding: 16, alignItems: "center" },
  paper: {
    width: "100%",
    maxWidth: 620,
    aspectRatio: 210 / 297,
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderWidth: 1,
    borderColor: "#D5DDE5",
    overflow: "hidden",
  },
  academyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#26364A",
    paddingBottom: 6,
  },
  logo: {
    width: 68,
    height: 62,
  },
  academyCopy: { flex: 1, minWidth: 0, alignItems: "center" },
  academyName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#263343",
    textAlign: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#183B64",
  },
  academySlogan: {
    marginTop: 3,
    color: "#EF7B27",
    fontSize: 7,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "uppercase",
  },
  academicLine: {
    marginTop: 3,
    color: "#183B64",
    fontSize: 6.5,
    textAlign: "center",
  },
  small: { fontSize: 6, color: "#64748B", marginTop: 1, textAlign: "center" },
  studentHero: {
    flexDirection: "row",
    gap: 9,
    padding: 8,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#B8C5D3",
    marginTop: 10,
    alignItems: "center",
  },
  photo: {
    width: 58,
    height: 74,
    resizeMode: "cover",
    backgroundColor: "#E2E8F0",
  },
  photoPlaceholder: { justifyContent: "center", alignItems: "center" },
  studentName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#183B64",
    marginBottom: 3,
  },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  metaItem: { width: "48%", marginTop: 5 },
  metaLabel: { fontSize: 6, color: "#64748B" },
  metaValue: { fontSize: 8, color: "#365F94", fontWeight: "600", marginTop: 2 },
  section: {
    color: "#183B64",
    paddingBottom: 5,
    marginTop: 10,
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#DCE4EC",
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#D5DDE5",
  },
  infoRow: {
    width: "50%",
    minHeight: 33,
    borderWidth: 1,
    borderColor: "#D5DDE5",
    marginTop: -1,
    marginLeft: -1,
    padding: 6,
  },
  infoRowFullWidth: { width: "100%" },
  infoLabel: { fontSize: 6, color: "#64748B", textTransform: "uppercase" },
  infoValue: { fontSize: 8, color: "#26364A", marginTop: 2 },
  documentFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 26,
  },
  issued: {
    fontSize: 7,
    color: "#64748B",
  },
  signature: {
    minWidth: 105,
    alignItems: "center",
  },
  signatureImage: {
    width: 100,
    height: 34,
  },
  signatureLabel: {
    width: "100%",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#AEBBC9",
    color: "#64748B",
    fontSize: 7,
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: 20,
    backgroundColor: "#F1F5F9",
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    gap: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  shareButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#26364A",
  },
  downloadButton: { backgroundColor: "#26364A" },
  disabled: { opacity: 0.5 },
  shareText: { fontSize: 16, color: "#26364A", fontWeight: "600" },
  downloadText: { fontSize: 16, color: "#FFFFFF", fontWeight: "600" },
});
