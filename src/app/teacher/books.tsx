import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Image,
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
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const C = {
  navy: "#241344",
  blue: "#611CD0",
  purpleDark: "#44109D",
  purpleBright: "#4C02F7",
  bg: "#F3F3FF",
  white: "#FFFFFF",
  muted: "#718096",
  border: "#E8E3F5",
  lavender: "#EDE7FF",
};

const BOOK_BUCKET = "institute-books";

const THUMB_BUCKET = "book-thumbnails";

type ClassItem = { id: string; name: string };

type SubjectItem = { id: string; name: string; class_id: string };

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
};

async function signedUrl(bucket: string, path: string | null, expires = 3600) {
  if (!path) return null;

  if (/^https?:\/\//i.test(path)) {
    const publicMarker = `/storage/v1/object/public/${bucket}/`;

    const signMarker = `/storage/v1/object/sign/${bucket}/`;

    if (path.includes(publicMarker)) return path;

    if (path.includes(signMarker)) {
      const objectPath = path

        .slice(path.indexOf(signMarker) + signMarker.length)

        .split("?")[0];

      const { data, error } = await supabase.storage

        .from(bucket)

        .createSignedUrl(decodeURIComponent(objectPath), expires);

      return error ? null : data.signedUrl;
    }

    if (!path.includes("/storage/v1/object/")) return path;

    return null;
  }

  const objectPath = path

    .replace(/^\/+/, "")

    .replace(new RegExp(`^${bucket}/`), "");

  const { data, error } = await supabase.storage

    .from(bucket)

    .createSignedUrl(objectPath, expires);

  return error ? null : data.signedUrl;
}

function sizeLabel(bytes: number | null) {
  if (!bytes) return "PDF book";

  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function TeacherBooksScreen() {
  const insets = useSafeAreaInsets();

  const [instituteId, setInstituteId] = useState("");

  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [subjects, setSubjects] = useState<SubjectItem[]>([]);

  const [books, setBooks] = useState<Book[]>([]);

  const [selectedClassId, setSelectedClassId] = useState("");

  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [covers, setCovers] = useState<Record<string, string | null>>({});

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
        router.replace("/teacher/teacher-login" as never);

        return;
      }

      const { data: member, error: memberError } = await supabase

        .from("institute_team_members")

        .select("institute_id,role,is_active")

        .eq("user_id", user.id)

        .eq("role", "teacher")

        .eq("is_active", true)

        .maybeSingle();

      if (memberError) throw memberError;

      if (!member?.institute_id)
        throw new Error("Your active teacher profile could not be found.");

      setInstituteId(member.institute_id);

      const [classResult, subjectResult, bookResult] = await Promise.all([
        supabase

          .from("institute_classes")

          .select("id,name")

          .eq("institute_id", member.institute_id)

          .eq("is_active", true)

          .order("name"),

        supabase

          .from("institute_subjects")

          .select("id,name,class_id")

          .eq("institute_id", member.institute_id)

          .order("name"),

        supabase

          .from("institute_books")

          .select(
            "id,institute_id,class_id,subject_id,name,pdf_path,thumbnail_path,file_size,updated_at",
          )

          .eq("institute_id", member.institute_id)

          .eq("is_active", true)

          .order("name"),
      ]);

      if (classResult.error) throw classResult.error;

      if (subjectResult.error) throw subjectResult.error;

      if (bookResult.error) throw bookResult.error;

      setClasses((classResult.data ?? []) as ClassItem[]);

      setSubjects((subjectResult.data ?? []) as SubjectItem[]);

      setBooks((bookResult.data ?? []) as Book[]);

      setSelectedClassId((old) =>
        (classResult.data ?? []).some((item: any) => item.id === old)
          ? old
          : (classResult.data?.[0]?.id ?? ""),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the book library.",
      );
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

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase();

    return books.filter(
      (book) =>
        book.class_id === selectedClassId &&
        (!selectedSubjectId || book.subject_id === selectedSubjectId) &&
        (!q || book.name.toLowerCase().includes(q)),
    );
  }, [books, selectedClassId, selectedSubjectId, search]);

  useEffect(() => {
    let alive = true;

    const missing = filteredBooks.filter(
      (book) => book.thumbnail_path && !(book.id in covers),
    );

    if (missing.length) {
      void Promise.all(
        missing.map(
          async (book) =>
            [
              book.id,

              await signedUrl(THUMB_BUCKET, book.thumbnail_path),
            ] as const,
        ),
      ).then((entries) => {
        if (alive)
          setCovers((old) => ({ ...old, ...Object.fromEntries(entries) }));
      });
    }

    return () => {
      alive = false;
    };
  }, [filteredBooks, covers]);

  const openBook = (book: Book) => {
    router.push({
      pathname: "/teacher/book-viewer",

      params: { bookId: book.id },
    } as never);
  };

  if (loading)
    return (
      <View style={s.center}>
        <StatusBar backgroundColor={C.bg} barStyle="dark-content" />

        <ActivityIndicator size="large" color={C.blue} />

        <Text style={s.muted}>Loading books…</Text>
      </View>
    );

  return (
    <View style={s.screen}>
      <StatusBar backgroundColor={C.navy} barStyle="light-content" />

      <LinearGradient
        colors={["#611CD0", "#44109D", "#4C02F7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={21} color={C.white} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>STUDY RESOURCES</Text>

          <Text style={s.title}>Books Library</Text>

          <Text style={s.headerSub}>Your class-wise learning materials</Text>
        </View>

        <View style={s.headerIcon}>
          <Feather name="book-open" size={22} color={C.white} />
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
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
      >
        {errorMessage ? (
          <View style={s.errorBox}>
            <Feather name="alert-circle" size={18} color="#C94F5B" />

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
          contentContainerStyle={s.chips}
        >
          {classes.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[s.chip, selectedClassId === item.id && s.chipActive]}
              onPress={() => {
                setSelectedClassId(item.id);

                setSelectedSubjectId("");
              }}
            >
              <Text
                style={[
                  s.chipText,

                  selectedClassId === item.id && s.chipTextActive,
                ]}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.searchBox}>
          <Feather name="search" size={17} color={C.muted} />

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search books by name…"
            placeholderTextColor="#9AA6B5"
            style={s.searchInput}
          />
        </View>

        <Text style={s.sectionTitle}>Subjects</Text>

        <Text style={s.sectionSub}>Select a subject to filter its books</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.subjectChips}
        >
          <TouchableOpacity
            style={[s.subjectChip, !selectedSubjectId && s.subjectChipActive]}
            onPress={() => setSelectedSubjectId("")}
          >
            <Text
              style={[
                s.subjectChipText,

                !selectedSubjectId && s.subjectChipTextActive,
              ]}
            >
              All subjects
            </Text>
          </TouchableOpacity>

          {classSubjects.map((subject) => (
            <TouchableOpacity
              key={subject.id}
              style={[
                s.subjectChip,

                selectedSubjectId === subject.id && s.subjectChipActive,
              ]}
              onPress={() => setSelectedSubjectId(subject.id)}
            >
              <Text
                style={[
                  s.subjectChipText,

                  selectedSubjectId === subject.id && s.subjectChipTextActive,
                ]}
              >
                {subject.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.booksHeading}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>
              {classes.find((x) => x.id === selectedClassId)?.name ?? "Books"}
            </Text>

            <Text style={s.sectionSub}>
              {selectedSubjectId
                ? classSubjects.find((x) => x.id === selectedSubjectId)?.name
                : "All subjects"}{" "}
              · {filteredBooks.length} books
            </Text>
          </View>

          <View style={s.countPill}>
            <Text style={s.countText}>{filteredBooks.length}</Text>
          </View>
        </View>

        {!classes.length ? (
          <View style={s.empty}>
            <Feather name="layers" size={30} color={C.blue} />

            <Text style={s.emptyTitle}>No classes available</Text>

            <Text style={s.emptyText}>
              Books will appear here when your institute adds them.
            </Text>
          </View>
        ) : !filteredBooks.length ? (
          <View style={s.empty}>
            <Feather name="book-open" size={30} color={C.blue} />

            <Text style={s.emptyTitle}>No books found</Text>

            <Text style={s.emptyText}>
              Try another subject or check back after your institute uploads
              books.
            </Text>
          </View>
        ) : (
          <View style={s.bookGrid}>
            {filteredBooks.map((book) => (
              <TouchableOpacity
                key={book.id}
                style={s.bookCard}
                activeOpacity={0.8}
                onPress={() => openBook(book)}
              >
                <View style={s.cover}>
                  {covers[book.id] ? (
                    <Image
                      source={{ uri: covers[book.id]! }}
                      style={s.coverImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={s.coverFallback}>
                      <Feather name="book-open" size={31} color={C.blue} />

                      <Text style={s.pdfBadge}>PDF</Text>
                    </View>
                  )}

                  <View style={s.openBadge}>
                    <Feather name="book-open" size={13} color={C.white} />
                  </View>
                </View>

                <View style={s.bookInfo}>
                  <Text style={s.bookName} numberOfLines={2}>
                    {book.name}
                  </Text>

                  <Text style={s.bookSubject} numberOfLines={1}>
                    {classSubjects.find(
                      (subject) => subject.id === book.subject_id,
                    )?.name ??
                      subjects.find((subject) => subject.id === book.subject_id)
                        ?.name ??
                      "Subject"}
                  </Text>

                  <View style={s.metaRow}>
                    <Feather name="file-text" size={11} color={C.muted} />

                    <Text style={s.metaText}>{sizeLabel(book.file_size)}</Text>
                  </View>

                  <View style={s.readRow}>
                    <Text style={s.readText}>Read book</Text>

                    <Feather name="arrow-up-right" size={14} color={C.blue} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
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

    paddingHorizontal: 20,

    paddingBottom: 22,

    borderBottomLeftRadius: 26,

    borderBottomRightRadius: 26,

    flexDirection: "row",

    alignItems: "center",

    gap: 12,

    
  paddingTop: 35,
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
    color: "#E9DDFF",

    fontSize: 9,

    fontWeight: "900",

    letterSpacing: 1.4,
  },

  title: { color: C.white, fontSize: 25, fontWeight: "900", marginTop: 4 },

  headerSub: { color: "#F0EAFE", fontSize: 11, marginTop: 4 },

  headerIcon: {
    width: 44,

    height: 44,

    borderRadius: 15,

    backgroundColor: "rgba(255,255,255,0.16)",

    alignItems: "center",

    justifyContent: "center",
  },

  content: { padding: 18, paddingBottom: 34 },

  errorBox: {
    backgroundColor: "#FFF0F1",

    padding: 12,

    borderRadius: 13,

    flexDirection: "row",

    gap: 8,

    alignItems: "center",

    marginBottom: 12,
  },

  errorText: { color: "#C94F5B", flex: 1, fontSize: 12 },

  retry: { color: C.blue, fontWeight: "900" },

  label: {
    color: C.muted,

    fontSize: 10,

    fontWeight: "900",

    letterSpacing: 1.2,

    marginBottom: 10,
  },

  chips: { gap: 8, paddingBottom: 6 },

  chip: {
    paddingHorizontal: 16,

    paddingVertical: 11,

    borderRadius: 13,

    backgroundColor: C.white,

    borderWidth: 1,

    borderColor: C.border,
  },

  chipActive: { backgroundColor: C.blue, borderColor: C.blue },

  chipText: { color: C.navy, fontSize: 12, fontWeight: "800" },

  chipTextActive: { color: C.white },

  searchBox: {
    flexDirection: "row",

    alignItems: "center",

    gap: 9,

    backgroundColor: C.white,

    borderWidth: 1,

    borderColor: C.border,

    borderRadius: 14,

    paddingHorizontal: 13,

    marginTop: 13,

    marginBottom: 22,
  },

  searchInput: { flex: 1, minHeight: 44, color: C.navy, fontSize: 13 },

  sectionTitle: { color: C.navy, fontSize: 18, fontWeight: "900" },

  sectionSub: { color: C.muted, fontSize: 11, marginTop: 4 },

  subjectChips: { gap: 8, paddingVertical: 12 },

  subjectChip: {
    borderRadius: 12,

    backgroundColor: C.white,

    borderWidth: 1,

    borderColor: C.border,

    paddingHorizontal: 13,

    paddingVertical: 9,
  },

  subjectChipActive: { backgroundColor: "#EDE7FF", borderColor: "#C4B5FD" },

  subjectChipText: { color: C.navy, fontSize: 11, fontWeight: "800" },

  subjectChipTextActive: { color: C.blue },

  booksHeading: {
    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    gap: 10,

    marginTop: 15,

    marginBottom: 13,
  },

  countPill: {
    backgroundColor: "#EDE7FF",

    borderRadius: 10,

    paddingHorizontal: 11,

    paddingVertical: 7,
  },

  countText: { color: C.blue, fontSize: 11, fontWeight: "900" },

  bookGrid: {
    flexDirection: "row",

    flexWrap: "wrap",

    justifyContent: "space-between",

    rowGap: 13,
  },

  bookCard: {
    width: "48.3%",

    backgroundColor: C.white,

    borderRadius: 17,

    borderWidth: 1,

    borderColor: C.border,

    overflow: "hidden",
  },

  cover: { height: 154, backgroundColor: "#EDE7FF", position: "relative" },

  coverImage: { width: "100%", height: "100%" },

  coverFallback: {
    flex: 1,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#EDE7FF",
  },

  pdfBadge: { color: C.blue, fontSize: 10, fontWeight: "900", marginTop: 8 },

  openBadge: {
    position: "absolute",

    right: 9,

    top: 9,

    width: 27,

    height: 27,

    borderRadius: 9,

    backgroundColor: C.navy,

    alignItems: "center",

    justifyContent: "center",
  },

  bookInfo: { padding: 11 },

  bookName: { color: C.navy, fontSize: 13, fontWeight: "900", minHeight: 35 },

  bookSubject: { color: C.blue, fontSize: 10, fontWeight: "800", marginTop: 6 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },

  metaText: { color: C.muted, fontSize: 10 },

  readRow: {
    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    borderTopWidth: 1,

    borderTopColor: C.border,

    paddingTop: 9,

    marginTop: 10,
  },

  readText: { color: C.blue, fontSize: 11, fontWeight: "900" },

  empty: {
    alignItems: "center",

    backgroundColor: C.white,

    borderRadius: 18,

    borderWidth: 1,

    borderColor: C.border,

    padding: 25,

    marginTop: 10,
  },

  emptyTitle: { color: C.navy, fontSize: 15, fontWeight: "900", marginTop: 12 },

  emptyText: {
    color: C.muted,

    fontSize: 12,

    lineHeight: 18,

    textAlign: "center",

    marginTop: 6,
  },
});
