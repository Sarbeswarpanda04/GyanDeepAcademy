import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
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

import { router, useFocusEffect } from "expo-router";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { File } from "expo-file-system";

import * as ImagePicker from "expo-image-picker";

import { supabase } from "../lib/supabase";

const C = {
  navy: "#1D2D44",

  blue: "#3677D5",

  bg: "#F4F7FB",

  white: "#FFFFFF",

  muted: "#718096",

  border: "#E7EDF4",

  green: "#16845D",

  red: "#C94F5B",
};

const BOOK_BUCKET = "institute-books";

const THUMB_BUCKET = "book-thumbnails";

const MAX_PDF_BYTES = 50 * 1024 * 1024;

type ClassItem = {
  id: string;

  name: string;

  institute_id: string;

  is_active?: boolean;
};

type SubjectItem = {
  id: string;

  name: string;

  class_id: string;

  institute_id: string;
};

type Book = {
  id: string;

  institute_id: string;

  class_id: string;

  subject_id: string;

  name: string;

  pdf_path: string;

  thumbnail_path: string | null;

  file_size: number | null;

  updated_at: string;

  is_active: boolean;
};

type PickedFile = {
  uri: string;

  name: string;

  size?: number | null;

  mimeType?: string | null;

  base64?: string | null;
};

function extension(name: string, fallback: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);

  return match?.[1] ?? fallback;
}

function prettySize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "PDF book";

  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function friendlyError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

async function signedUrl(bucket: string, path: string | null, expires = 3600) {
  if (!path) return null;

  if (/^https?:\/\//i.test(path)) {
    const marker = `/storage/v1/object/sign/${bucket}/`;

    const publicMarker = `/storage/v1/object/public/${bucket}/`;

    if (path.includes(publicMarker)) return path;

    if (path.includes(marker)) {
      const objectPath = path

        .slice(path.indexOf(marker) + marker.length)

        .split("?")[0];

      const result = await supabase.storage

        .from(bucket)

        .createSignedUrl(decodeURIComponent(objectPath), expires);

      return result.error ? null : result.data.signedUrl;
    }

    return path;
  }

  const objectPath = path

    .replace(/^\/+/, "")

    .replace(new RegExp(`^${bucket}/`), "");

  const { data, error } = await supabase.storage

    .from(bucket)

    .createSignedUrl(objectPath, expires);

  return error ? null : data.signedUrl;
}

export default function BooksManagementScreen() {
  const insets = useSafeAreaInsets();

  const [instituteId, setInstituteId] = useState("");

  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [subjects, setSubjects] = useState<SubjectItem[]>([]);

  const [books, setBooks] = useState<Book[]>([]);

  const [selectedClassId, setSelectedClassId] = useState("");

  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [saving, setSaving] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);

  const [editing, setEditing] = useState<Book | null>(null);

  const [bookName, setBookName] = useState("");

  const [pickedPdf, setPickedPdf] = useState<PickedFile | null>(null);

  const [pickedThumb, setPickedThumb] = useState<PickedFile | null>(null);

  const [existingThumbUrl, setExistingThumbUrl] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    setErrorMessage("");

    try {
      const {
        data: { user },

        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        router.replace("/" as never);

        return;
      }

      const { data: memberships, error: memberError } = await supabase

        .from("institute_members")

        .select("institute_id,role")

        .eq("user_id", user.id);

      if (memberError) throw memberError;

      const membership = (memberships ?? []).find((row: any) =>
        ["owner", "manager"].includes(String(row.role).toLowerCase()),
      );

      if (!membership?.institute_id)
        throw new Error("No owner/manager institute membership was found.");

      const institute = membership.institute_id as string;

      setInstituteId(institute);

      const [classResult, subjectResult, bookResult] = await Promise.all([
        supabase

          .from("institute_classes")

          .select("id,name,institute_id,is_active")

          .eq("institute_id", institute)

          .eq("is_active", true)

          .order("name"),

        supabase

          .from("institute_subjects")

          .select("id,name,class_id,institute_id")

          .eq("institute_id", institute)

          .order("name"),

        supabase

          .from("institute_books")

          .select(
            "id,institute_id,class_id,subject_id,name,pdf_path,thumbnail_path,file_size,updated_at,is_active",
          )

          .eq("institute_id", institute)

          .eq("is_active", true)

          .order("updated_at", { ascending: false }),
      ]);

      if (classResult.error) throw classResult.error;

      if (subjectResult.error) throw subjectResult.error;

      if (bookResult.error) throw bookResult.error;

      setClasses((classResult.data ?? []) as ClassItem[]);

      setSubjects((subjectResult.data ?? []) as SubjectItem[]);

      setBooks((bookResult.data ?? []) as Book[]);

      setSelectedClassId((old) =>
        (classResult.data ?? []).some((x: any) => x.id === old)
          ? old
          : (classResult.data?.[0]?.id ?? ""),
      );
    } catch (error) {
      setErrorMessage(friendlyError(error));
    } finally {
      setLoading(false);

      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const classSubjects = useMemo(
    () => subjects.filter((subject) => subject.class_id === selectedClassId),

    [subjects, selectedClassId],
  );

  useEffect(() => {
    setSelectedSubjectId((old) =>
      classSubjects.some((subject) => subject.id === old) ? old : "",
    );
  }, [classSubjects]);

  const filteredBooks = useMemo(
    () =>
      books.filter(
        (book) =>
          book.class_id === selectedClassId &&
          (!selectedSubjectId || book.subject_id === selectedSubjectId),
      ),

    [books, selectedClassId, selectedSubjectId],
  );

  const selectedClass = classes.find((item) => item.id === selectedClassId);

  const selectedSubject = subjects.find(
    (item) => item.id === selectedSubjectId,
  );

  const resetModal = () => {
    setModalVisible(false);

    setEditing(null);

    setBookName("");

    setPickedPdf(null);

    setPickedThumb(null);

    setExistingThumbUrl(null);
  };

  const openAdd = () => {
    if (!selectedClassId || !selectedSubjectId) {
      Alert.alert(
        "Choose class and subject",

        "Select a class and a subject before adding a book.",
      );

      return;
    }

    setEditing(null);

    setBookName("");

    setPickedPdf(null);

    setPickedThumb(null);

    setExistingThumbUrl(null);

    setModalVisible(true);
  };

  const openEdit = async (book: Book) => {
    setEditing(book);

    setBookName(book.name);

    setPickedPdf(null);

    setPickedThumb(null);

    setExistingThumbUrl(await signedUrl(THUMB_BUCKET, book.thumbnail_path));

    setModalVisible(true);
  };

  const choosePdf = async () => {
    try {
      // Use Expo SDK 57's FileSystem picker instead of DocumentPicker.
      // It returns a File with the native Android file access grant.
      const result = await File.pickFileAsync({
        mimeTypes: ["application/pdf"],
        multipleFiles: false,
      });

      if (result.canceled || !result.result) return;

      const file = result.result;
      const originalName = (file.name || "book").trim();

      if (file.size > MAX_PDF_BYTES) {
        Alert.alert(
          "File too large",
          "Please choose a PDF smaller than 50 MB.",
        );
        return;
      }

      // Android document providers sometimes return a valid PDF with a missing
      // extension or a generic MIME type. Read it first, then validate its PDF
      // signature instead of rejecting it based on the filename alone.
      const base64 = await file.base64();
      if (!base64) {
        throw new Error(
          "Android returned an empty file. Please choose the PDF again.",
        );
      }

      // A PDF header begins with %PDF-, represented as JVBERi0 in Base64.
      if (!base64.startsWith("JVBERi0")) {
        Alert.alert(
          "PDF required",
          "The selected file does not appear to be a valid PDF. Please choose a PDF file.",
        );
        return;
      }

      const name = originalName.toLowerCase().endsWith(".pdf")
        ? originalName
        : `${originalName.replace(/\.[^.]+$/, "")}.pdf`;

      setPickedPdf({
        uri: file.uri,
        name,
        size: file.size,
        mimeType: "application/pdf",
        base64,
      });
    } catch (error) {
      console.error("PDF picker/read failed:", error);
      Alert.alert("Could not select PDF", friendlyError(error));
    }
  };

  const chooseThumbnail = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],

        allowsEditing: true,

        aspect: [3, 4],

        quality: 0.78,

        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      setPickedThumb({
        uri: asset.uri,

        name: `cover.${extension(asset.uri, "jpg")}`,

        mimeType: asset.mimeType ?? "image/jpeg",

        base64: asset.base64 ?? null,
      });
    } catch (error) {
      Alert.alert("Could not select cover", friendlyError(error));
    }
  };

  const uploadFile = async (
    file: PickedFile,
    bucket: string,
    path: string,
    contentType: string,
  ) => {
    if (bucket === BOOK_BUCKET && file.size && file.size > MAX_PDF_BYTES) {
      throw new Error("The PDF exceeds the 50 MB upload limit.");
    }

    if (!file.base64) {
      throw new Error(
        `Could not read \"${file.name}\" from Android's file picker. Please update Expo Document Picker and try again.`,
      );
    }

    const binary = globalThis.atob(file.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (!bytes.length) throw new Error(`\"${file.name}\" is empty.`);
    if (bucket === BOOK_BUCKET && bytes.byteLength > MAX_PDF_BYTES) {
      throw new Error("The PDF exceeds the 50 MB upload limit.");
    }

    const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
      upsert: true,
      contentType,
      cacheControl: "3600",
    });

    if (error) throw new Error(`Upload failed: ${error.message}`);
    return path;
  };

  const saveBook = async () => {
    if (!instituteId || !selectedClassId || !selectedSubjectId) {
      Alert.alert("Missing selection", "Choose a class and subject first.");

      return;
    }

    if (!bookName.trim()) {
      Alert.alert("Book name required", "Enter the name of the book.");

      return;
    }

    if (!editing && !pickedPdf) {
      Alert.alert("PDF required", "Choose the book PDF before saving.");

      return;
    }

    setSaving(true);

    const uploadedPaths: { bucket: string; path: string }[] = [];

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Your session expired. Please sign in again.");

      let pdfPath = editing?.pdf_path ?? "";

      let thumbPath = editing?.thumbnail_path ?? null;

      let fileSize = editing?.file_size ?? null;

      const safeBase = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (pickedPdf) {
        pdfPath = `${instituteId}/${selectedClassId}/${selectedSubjectId}/${safeBase}.pdf`;

        await uploadFile(pickedPdf, BOOK_BUCKET, pdfPath, "application/pdf");

        uploadedPaths.push({ bucket: BOOK_BUCKET, path: pdfPath });

        fileSize = pickedPdf.size ?? null;
      }

      if (pickedThumb) {
        const ext = extension(pickedThumb.name, "jpg");

        thumbPath = `${instituteId}/${selectedClassId}/${selectedSubjectId}/${safeBase}-cover.${ext}`;

        await uploadFile(
          pickedThumb,

          THUMB_BUCKET,

          thumbPath,

          pickedThumb.mimeType || "image/jpeg",
        );

        uploadedPaths.push({ bucket: THUMB_BUCKET, path: thumbPath });
      }

      const payload = {
        institute_id: instituteId,

        class_id: selectedClassId,

        subject_id: selectedSubjectId,

        name: bookName.trim(),

        pdf_path: pdfPath,

        thumbnail_path: thumbPath,

        file_size: fileSize,

        is_active: true,

        updated_at: new Date().toISOString(),

        ...(editing ? {} : { created_by: user.id }),
      };

      const result = editing
        ? await supabase

            .from("institute_books")

            .update(payload)

            .eq("id", editing.id)

            .eq("institute_id", instituteId)

            .select("id")

            .single()
        : await supabase

            .from("institute_books")

            .insert(payload)

            .select("id")

            .single();

      if (result.error) throw result.error;

      // Clean up replaced objects only after the database update succeeds.

      if (editing && pickedPdf && editing.pdf_path !== pdfPath) {
        await supabase.storage.from(BOOK_BUCKET).remove([editing.pdf_path]);
      }

      if (
        editing &&
        pickedThumb &&
        editing.thumbnail_path &&
        editing.thumbnail_path !== thumbPath
      ) {
        await supabase.storage

          .from(THUMB_BUCKET)

          .remove([editing.thumbnail_path]);
      }

      resetModal();

      await loadData(false);

      Alert.alert(
        "Book saved",

        `${bookName.trim()} is now available for teachers.`,
      );
    } catch (error) {
      // Leave uploaded objects available for debugging/retry; the database remains unchanged on failed insert/update.

      Alert.alert("Could not save book", friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteBook = (book: Book) => {
    Alert.alert(
      "Remove book",

      `Remove "${book.name}" from the teacher library?`,

      [
        { text: "Cancel", style: "cancel" },

        {
          text: "Remove",

          style: "destructive",

          onPress: async () => {
            try {
              const { error } = await supabase

                .from("institute_books")

                .update({
                  is_active: false,

                  updated_at: new Date().toISOString(),
                })

                .eq("id", book.id)

                .eq("institute_id", instituteId);

              if (error) throw error;

              setBooks((old) => old.filter((item) => item.id !== book.id));
            } catch (error) {
              Alert.alert("Could not remove book", friendlyError(error));
            }
          },
        },
      ],
    );
  };

  const coverUrl = (book: Book) => signedUrl(THUMB_BUCKET, book.thumbnail_path);

  if (loading)
    return (
      <View style={s.center}>
        <StatusBar backgroundColor={C.bg} barStyle="dark-content" />

        <ActivityIndicator color={C.blue} size="large" />

        <Text style={s.muted}>Loading book library…</Text>
      </View>
    );

  return (
    <View style={s.screen}>
      <StatusBar backgroundColor={C.navy} barStyle="light-content" />

      <View style={[s.header, { paddingTop: Math.max(insets.top, 10) + 10 }]}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={21} color={C.white} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>LEARNING RESOURCES</Text>

          <Text style={s.title}>Books Library</Text>

          <Text style={s.headerSub}>Upload and manage class-wise PDFs</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);

              void loadData(false);
            }}
            tintColor={C.blue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {errorMessage ? (
          <View style={s.errorBox}>
            <Feather name="alert-circle" size={18} color={C.red} />

            <Text style={s.errorText}>{errorMessage}</Text>

            <TouchableOpacity onPress={() => void loadData()}>
              <Text style={s.retry}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={s.label}>CHOOSE CLASS</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {classes.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                s.classChip,

                selectedClassId === item.id && s.classChipActive,
              ]}
              onPress={() => {
                setSelectedClassId(item.id);

                setSelectedSubjectId("");
              }}
            >
              <Text
                style={[
                  s.classChipText,

                  selectedClassId === item.id && s.classChipTextActive,
                ]}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.sectionRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>
              {selectedClass?.name ?? "Select a class"}
            </Text>

            <Text style={s.sectionSub}>
              Choose a subject to view or manage books
            </Text>
          </View>

          <View style={s.count}>
            <Text style={s.countText}>{filteredBooks.length}</Text>
          </View>
        </View>

        <View style={s.subjectGrid}>
          {classSubjects.map((subject) => {
            const count = books.filter(
              (book) =>
                book.class_id === selectedClassId &&
                book.subject_id === subject.id,
            ).length;

            const active = selectedSubjectId === subject.id;

            return (
              <TouchableOpacity
                key={subject.id}
                style={[s.subjectCard, active && s.subjectCardActive]}
                onPress={() => setSelectedSubjectId(subject.id)}
              >
                <View style={[s.subjectIcon, active && s.subjectIconActive]}>
                  <Feather
                    name="book-open"
                    size={18}
                    color={active ? C.white : C.blue}
                  />
                </View>

                <Text
                  style={[s.subjectName, active && { color: C.white }]}
                  numberOfLines={2}
                >
                  {subject.name}
                </Text>

                <Text style={[s.subjectCount, active && { color: "#DDE9FA" }]}>
                  {count} {count === 1 ? "book" : "books"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!selectedClassId ? (
          <View style={s.empty}>
            <Feather name="layers" size={30} color={C.blue} />

            <Text style={s.emptyTitle}>No classes available</Text>

            <Text style={s.emptySub}>Add classes before uploading books.</Text>
          </View>
        ) : !classSubjects.length ? (
          <View style={s.empty}>
            <Feather name="book-open" size={30} color={C.blue} />

            <Text style={s.emptyTitle}>No subjects for this class</Text>

            <Text style={s.emptySub}>
              Add subjects in Subject Management first.
            </Text>
          </View>
        ) : !selectedSubjectId ? (
          <View style={s.hint}>
            <Feather name="mouse-pointer" size={18} color={C.blue} />

            <Text style={s.hintText}>
              Select a subject above to view its books. Tap a book card to edit
              it, or tap Add a book to upload a PDF.
            </Text>
          </View>
        ) : (
          <View style={s.booksSection}>
            <View style={s.sectionRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.sectionTitle}>{selectedSubject?.name}</Text>

                <Text style={s.sectionSub}>
                  {selectedClass?.name} · {filteredBooks.length} available
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={s.addBookCard}
              onPress={openAdd}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add a book"
            >
              <View style={s.addBookIcon}>
                <Feather name="plus" size={25} color={C.blue} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={s.addBookTitle}>Add a book</Text>

                <Text style={s.addBookSubtitle}>
                  Tap to upload a PDF for {selectedSubject?.name}.
                </Text>
              </View>

              <Feather name="chevron-right" size={20} color={C.blue} />
            </TouchableOpacity>

            {filteredBooks.map((book) => (
              <BookAdminCard
                key={book.id}
                book={book}
                onEdit={() => void openEdit(book)}
                onDelete={() => deleteBook(book)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && resetModal()}
      >
        <View style={s.modalBackdrop}>
          <View
            style={[
              s.modalSheet,

              { paddingBottom: Math.max(insets.bottom, 18) },
            ]}
          >
            <View style={s.modalHandle} />

            <View style={s.modalTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>
                  {editing ? "Update book" : "Add a book"}
                </Text>

                <Text style={s.modalSubtitle}>
                  {selectedClass?.name} · {selectedSubject?.name}
                </Text>
              </View>

              <TouchableOpacity
                disabled={saving}
                onPress={resetModal}
                style={s.closeButton}
              >
                <Feather name="x" size={20} color={C.navy} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={s.inputLabel}>BOOK NAME *</Text>

              <TextInput
                value={bookName}
                onChangeText={setBookName}
                placeholder="e.g. Mathematics Textbook"
                placeholderTextColor="#9AA6B5"
                style={s.input}
                maxLength={120}
              />

              <Text style={s.inputLabel}>BOOK COVER (OPTIONAL)</Text>

              <TouchableOpacity
                style={s.filePicker}
                onPress={() => void chooseThumbnail()}
              >
                <View style={s.coverPreview}>
                  {pickedThumb ? (
                    <Image
                      source={{ uri: pickedThumb.uri }}
                      style={s.coverImage}
                    />
                  ) : existingThumbUrl ? (
                    <Image
                      source={{ uri: existingThumbUrl }}
                      style={s.coverImage}
                    />
                  ) : (
                    <Feather name="image" size={23} color={C.blue} />
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.fileTitle}>
                    {pickedThumb
                      ? pickedThumb.name
                      : existingThumbUrl
                        ? "Current cover selected"
                        : "Choose thumbnail image"}
                  </Text>

                  <Text style={s.fileSub}>JPG, PNG or WebP · optional</Text>
                </View>

                <Feather name="chevron-right" size={18} color={C.muted} />
              </TouchableOpacity>

              <Text style={s.inputLabel}>
                BOOK PDF {editing ? "(OPTIONAL IF KEEPING CURRENT PDF)" : "*"}
              </Text>

              <TouchableOpacity
                style={s.pdfPicker}
                onPress={() => void choosePdf()}
              >
                <View style={s.pdfIcon}>
                  <Feather name="file-text" size={23} color={C.red} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.fileTitle}>
                    {pickedPdf?.name ??
                      (editing ? "Keep current PDF" : "Choose PDF file")}
                  </Text>

                  <Text style={s.fileSub}>
                    {pickedPdf
                      ? prettySize(pickedPdf.size)
                      : editing
                        ? "Choose a new file only to replace it"
                        : "PDF only · maximum 50 MB"}
                  </Text>
                </View>

                <Feather name="upload-cloud" size={20} color={C.blue} />
              </TouchableOpacity>

              <View style={s.notice}>
                <Feather name="zap" size={16} color={C.green} />

                <Text style={s.noticeText}>
                  PDFs are stored in Supabase Storage and served with
                  short-lived signed links. A fresh link is generated when a
                  teacher opens a book.
                </Text>
              </View>

              <TouchableOpacity
                disabled={saving}
                style={[s.saveButton, saving && { opacity: 0.65 }]}
                onPress={() => void saveBook()}
              >
                {saving ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <>
                    <Feather name="check-circle" size={18} color={C.white} />

                    <Text style={s.saveText}>
                      {editing ? "Save changes" : "Upload book"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function BookAdminCard({
  book,

  onEdit,

  onDelete,
}: {
  book: Book;

  onEdit: () => void;

  onDelete: () => void;
}) {
  const [cover, setCover] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void signedUrl(THUMB_BUCKET, book.thumbnail_path).then((url) => {
      if (active) setCover(url);
    });

    return () => {
      active = false;
    };
  }, [book.thumbnail_path]);

  return (
    <TouchableOpacity style={s.bookCard} onPress={onEdit} activeOpacity={0.85}>
      <View style={s.bookThumb}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={s.bookCover}
            resizeMode="cover"
          />
        ) : (
          <View style={s.bookPlaceholder}>
            <Feather name="book-open" size={29} color={C.blue} />

            <Text style={s.placeholderPdf}>PDF</Text>
          </View>
        )}
      </View>

      <View style={s.bookDetails}>
        <Text style={s.bookName} numberOfLines={2}>
          {book.name}
        </Text>

        <Text style={s.bookMeta}>
          {prettySize(book.file_size)} · Updated{" "}
          {new Date(book.updated_at).toLocaleDateString("en-IN")}
        </Text>

        <View style={s.bookActions}>
          <Text style={s.smallActionText}>Tap card to edit / replace</Text>

          <TouchableOpacity style={s.deleteAction} onPress={onDelete}>
            <Feather name="trash-2" size={14} color={C.red} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  center: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    gap: 12,

    backgroundColor: C.bg,
  },

  muted: { color: C.muted, fontSize: 13 },

  header: {
    backgroundColor: C.navy,

    paddingHorizontal: 18,

    paddingBottom: 22,

    borderBottomLeftRadius: 26,

    borderBottomRightRadius: 26,

    flexDirection: "row",

    alignItems: "center",

    gap: 12,
  },

  back: {
    width: 42,

    height: 42,

    borderRadius: 14,

    borderWidth: 1,

    borderColor: "#526174",

    alignItems: "center",

    justifyContent: "center",
  },

  eyebrow: {
    color: "#AFC8EA",

    fontSize: 9,

    fontWeight: "900",

    letterSpacing: 1.4,
  },

  title: { color: C.white, fontSize: 25, fontWeight: "900", marginTop: 4 },

  headerSub: { color: "#C6D3E0", fontSize: 11, marginTop: 4 },

  addButton: {
    backgroundColor: C.white,

    borderRadius: 13,

    paddingHorizontal: 12,

    paddingVertical: 11,

    flexDirection: "row",

    alignItems: "center",

    gap: 5,
  },

  addButtonText: { color: C.navy, fontSize: 12, fontWeight: "900" },

  content: { padding: 18, paddingBottom: 35 },

  label: {
    color: C.muted,

    fontSize: 10,

    fontWeight: "900",

    letterSpacing: 1.2,

    marginBottom: 10,
  },

  chipRow: { gap: 8, paddingBottom: 7 },

  classChip: {
    paddingHorizontal: 16,

    paddingVertical: 11,

    borderRadius: 13,

    backgroundColor: C.white,

    borderWidth: 1,

    borderColor: C.border,
  },

  classChipActive: { backgroundColor: C.blue, borderColor: C.blue },

  classChipText: { color: C.navy, fontWeight: "800", fontSize: 12 },

  classChipTextActive: { color: C.white },

  sectionRow: {
    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    gap: 12,

    marginTop: 20,

    marginBottom: 13,
  },

  sectionTitle: { color: C.navy, fontSize: 18, fontWeight: "900" },

  sectionSub: { color: C.muted, fontSize: 11, marginTop: 4 },

  count: {
    minWidth: 34,

    paddingHorizontal: 10,

    paddingVertical: 7,

    borderRadius: 10,

    backgroundColor: "#E5EEFC",

    alignItems: "center",
  },

  countText: { color: C.blue, fontWeight: "900", fontSize: 12 },

  subjectGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },

  subjectCard: {
    width: "31.5%",

    minHeight: 105,

    borderRadius: 16,

    padding: 11,

    backgroundColor: C.white,

    borderWidth: 1,

    borderColor: C.border,
  },

  subjectCardActive: { backgroundColor: C.navy, borderColor: C.navy },

  subjectIcon: {
    width: 32,

    height: 32,

    borderRadius: 10,

    backgroundColor: "#EAF2FF",

    alignItems: "center",

    justifyContent: "center",

    marginBottom: 8,
  },

  subjectIconActive: { backgroundColor: "#41546D" },

  subjectName: { color: C.navy, fontSize: 11, fontWeight: "900" },

  subjectCount: { color: C.muted, fontSize: 10, marginTop: 5 },

  booksSection: { marginTop: 4 },

  uploadCta: {
    backgroundColor: C.blue,

    borderRadius: 11,

    paddingHorizontal: 12,

    paddingVertical: 9,

    flexDirection: "row",

    alignItems: "center",

    gap: 6,
  },

  uploadCtaText: { color: C.white, fontSize: 11, fontWeight: "900" },

  addBookCard: {
    flexDirection: "row",

    alignItems: "center",

    gap: 12,

    backgroundColor: "#EAF2FF",

    borderWidth: 1,

    borderColor: "#C8DAF7",

    borderStyle: "dashed",

    borderRadius: 18,

    padding: 14,

    marginBottom: 12,
  },

  addBookIcon: {
    width: 48,

    height: 48,

    borderRadius: 14,

    backgroundColor: C.white,

    alignItems: "center",

    justifyContent: "center",
  },

  addBookTitle: { color: C.navy, fontSize: 14, fontWeight: "900" },

  addBookSubtitle: {
    color: "#526A86",

    fontSize: 11,

    lineHeight: 16,

    marginTop: 4,
  },

  bookCard: {
    flexDirection: "row",

    gap: 13,

    backgroundColor: C.white,

    borderWidth: 1,

    borderColor: C.border,

    borderRadius: 18,

    padding: 12,

    marginBottom: 11,
  },

  bookThumb: {
    width: 74,

    height: 94,

    borderRadius: 12,

    overflow: "hidden",

    backgroundColor: "#EAF2FF",
  },

  bookCover: { width: "100%", height: "100%" },

  bookPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },

  placeholderPdf: {
    color: C.blue,

    fontSize: 9,

    fontWeight: "900",

    marginTop: 5,
  },

  bookDetails: { flex: 1, justifyContent: "center" },

  bookName: { color: C.navy, fontSize: 14, fontWeight: "900" },

  bookMeta: { color: C.muted, fontSize: 10, marginTop: 6 },

  bookActions: {
    flexDirection: "row",

    alignItems: "center",

    gap: 8,

    marginTop: 11,
  },

  smallAction: {
    flexDirection: "row",

    alignItems: "center",

    gap: 6,

    backgroundColor: "#EAF2FF",

    borderRadius: 10,

    paddingHorizontal: 10,

    paddingVertical: 8,
  },

  smallActionText: { color: C.blue, fontSize: 10, fontWeight: "900" },

  deleteAction: {
    width: 34,

    height: 32,

    borderRadius: 10,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#FFF0F1",
  },

  empty: {
    alignItems: "center",

    backgroundColor: C.white,

    borderRadius: 18,

    borderWidth: 1,

    borderColor: C.border,

    padding: 25,

    marginTop: 12,
  },

  emptyTitle: { color: C.navy, fontSize: 15, fontWeight: "900", marginTop: 12 },

  emptySub: {
    color: C.muted,

    fontSize: 12,

    lineHeight: 18,

    textAlign: "center",

    marginTop: 6,
  },

  hint: {
    flexDirection: "row",

    alignItems: "center",

    gap: 10,

    padding: 14,

    borderRadius: 14,

    backgroundColor: "#EAF2FF",

    marginTop: 15,
  },

  hintText: { flex: 1, color: "#35516F", fontSize: 12, lineHeight: 18 },

  errorBox: {
    backgroundColor: "#FFF0F1",

    padding: 12,

    borderRadius: 13,

    flexDirection: "row",

    gap: 8,

    alignItems: "center",

    marginBottom: 12,
  },

  errorText: { color: C.red, flex: 1, fontSize: 12 },

  retry: { color: C.blue, fontWeight: "900" },

  modalBackdrop: {
    flex: 1,

    justifyContent: "flex-end",

    backgroundColor: "rgba(11,22,38,0.52)",
  },

  modalSheet: {
    backgroundColor: C.white,

    borderTopLeftRadius: 27,

    borderTopRightRadius: 27,

    paddingHorizontal: 20,

    paddingTop: 10,

    maxHeight: "92%",
  },

  modalHandle: {
    width: 42,

    height: 4,

    borderRadius: 2,

    backgroundColor: "#D6DEE8",

    alignSelf: "center",

    marginBottom: 16,
  },

  modalTitleRow: {
    flexDirection: "row",

    alignItems: "center",

    marginBottom: 20,
  },

  modalTitle: { color: C.navy, fontSize: 22, fontWeight: "900" },

  modalSubtitle: { color: C.muted, fontSize: 12, marginTop: 5 },

  closeButton: {
    width: 38,

    height: 38,

    borderRadius: 12,

    backgroundColor: "#F1F4F8",

    alignItems: "center",

    justifyContent: "center",
  },

  inputLabel: {
    color: C.muted,

    fontSize: 10,

    fontWeight: "900",

    letterSpacing: 1,

    marginBottom: 8,

    marginTop: 6,
  },

  input: {
    backgroundColor: "#F8FAFD",

    borderWidth: 1,

    borderColor: C.border,

    borderRadius: 13,

    paddingHorizontal: 14,

    paddingVertical: Platform.OS === "ios" ? 13 : 10,

    color: C.navy,

    fontSize: 14,

    marginBottom: 15,
  },

  filePicker: {
    flexDirection: "row",

    alignItems: "center",

    gap: 12,

    padding: 12,

    borderRadius: 14,

    borderWidth: 1,

    borderColor: C.border,

    marginBottom: 15,
  },

  coverPreview: {
    width: 46,

    height: 58,

    borderRadius: 8,

    backgroundColor: "#EAF2FF",

    alignItems: "center",

    justifyContent: "center",

    overflow: "hidden",
  },

  coverImage: { width: "100%", height: "100%" },

  fileTitle: { color: C.navy, fontSize: 12, fontWeight: "800" },

  fileSub: { color: C.muted, fontSize: 10, marginTop: 4 },

  pdfPicker: {
    flexDirection: "row",

    alignItems: "center",

    gap: 12,

    padding: 13,

    borderRadius: 14,

    borderWidth: 1,

    borderColor: C.border,

    marginBottom: 13,

    backgroundColor: "#FFFAFA",
  },

  pdfIcon: {
    width: 43,

    height: 46,

    borderRadius: 11,

    backgroundColor: "#FFECEF",

    alignItems: "center",

    justifyContent: "center",
  },

  notice: {
    flexDirection: "row",

    alignItems: "flex-start",

    gap: 8,

    backgroundColor: "#EAF8F1",

    padding: 12,

    borderRadius: 12,

    marginBottom: 17,
  },

  noticeText: { flex: 1, color: "#32664F", fontSize: 10, lineHeight: 15 },

  saveButton: {
    backgroundColor: C.navy,

    minHeight: 50,

    borderRadius: 14,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: 9,

    marginBottom: 10,
  },

  saveText: { color: C.white, fontSize: 13, fontWeight: "900" },
});
