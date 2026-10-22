import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const NAVY = "#172B4D";
const BG = "#F3F6FA";
const WHITE = "#FFFFFF";
const MUTED = "#718096";
const BORDER = "#DFE6EF";
const GOLD = "#D6A84F";
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
type Day = (typeof DAYS)[number];
type Institute = {
  id: string;
  name: string;
  address: string | null;
  contact_phone: string | null;
  logo_url?: string | null;
  logo_path?: string | null;
};
type ClassRow = { id: string; name: string };
type Batch = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: string[] | null;
  is_active: boolean;
};
type Period = {
  id: string;
  batch_id: string;
  period_number: number;
  start_time: string;
  end_time: string;
};
type Subject = { id: string; name: string; class_id: string };
type Teacher = { id: string; full_name: string };
type Entry = {
  id: string;
  class_id: string;
  day_of_week: Day;
  batch_id: string;
  period_id: string;
  subject_id: string;
  teacher_id: string;
};
type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: AppAlertType;
  confirmLabel?: string;
};

const timeLabel = (value?: string) => {
  if (!value) return "—";
  const [hh, mm] = value.slice(0, 5).split(":");
  const h = Number(hh);
  if (!Number.isFinite(h)) return value;
  return `${h % 12 || 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
};
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

export default function TimetableViewScreen() {
  const insets = useSafeAreaInsets();
  const [institute, setInstitute] = useState<Institute | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [classFilter, setClassFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [filterMode, setFilterMode] = useState<"all" | "class" | "teacher">(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [alert, setAlert] = useState<AlertState>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });
  const showAlert = (
    title: string,
    message: string,
    type: AppAlertType = "info",
  ) => setAlert({ visible: true, title, message, type, confirmLabel: "OK" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: memberships, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id")
        .eq("user_id", user.id)
        .limit(2);
      if (membershipError) throw membershipError;
      if (!memberships?.length)
        throw new Error("Your account is not linked to an institute.");
      if (memberships.length !== 1)
        throw new Error(
          "Select one active institute before viewing the timetable.",
        );
      const iid = memberships[0].institute_id as string;
      const [inst, cls, batch, period, subject, staff, entriesResult] =
        await Promise.all([
          supabase.from("institutes").select("*").eq("id", iid).maybeSingle(),
          supabase
            .from("institute_classes")
            .select("id,name")
            .eq("institute_id", iid)
            .order("name"),
          supabase
            .from("institute_batches")
            .select("id,name,start_time,end_time,days_of_week,is_active")
            .eq("institute_id", iid)
            .eq("is_active", true)
            .order("start_time"),
          supabase
            .from("institute_batch_periods")
            .select("id,batch_id,period_number,start_time,end_time")
            .eq("institute_id", iid)
            .order("period_number"),
          supabase
            .from("institute_subjects")
            .select("id,name,class_id")
            .eq("institute_id", iid)
            .order("name"),
          supabase
            .from("institute_staff")
            .select("id,full_name")
            .eq("institute_id", iid)
            .eq("status", "active")
            .order("full_name"),
          supabase
            .from("institute_timetable_entries")
            .select(
              "id,class_id,day_of_week,batch_id,period_id,subject_id,teacher_id",
            )
            .eq("institute_id", iid),
        ]);
      for (const result of [
        inst,
        cls,
        batch,
        period,
        subject,
        staff,
        entriesResult,
      ])
        if (result.error) throw result.error;
      setInstitute(inst.data as Institute | null);
      setClasses((cls.data ?? []) as ClassRow[]);
      setBatches((batch.data ?? []) as Batch[]);
      setPeriods((period.data ?? []) as Period[]);
      setSubjects((subject.data ?? []) as Subject[]);
      setTeachers((staff.data ?? []) as Teacher[]);
      setEntries((entriesResult.data ?? []) as Entry[]);
    } catch (error: any) {
      showAlert(
        "Unable to load timetable",
        error?.message ?? "Please check your connection and Supabase setup.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const rows = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            (filterMode !== "class" ||
              classFilter === "all" ||
              entry.class_id === classFilter) &&
            (filterMode !== "teacher" ||
              teacherFilter === "all" ||
              entry.teacher_id === teacherFilter),
        )
        .map((entry) => {
          const cls = classes.find((x) => x.id === entry.class_id);
          const batch = batches.find((x) => x.id === entry.batch_id);
          const period = periods.find((x) => x.id === entry.period_id);
          const subject = subjects.find((x) => x.id === entry.subject_id);
          const teacher = teachers.find((x) => x.id === entry.teacher_id);
          return {
            ...entry,
            className: cls?.name ?? "Class",
            batchName: batch?.name ?? "Batch",
            subjectName: subject?.name ?? "—",
            teacherName: teacher?.full_name ?? "—",
            periodNumber: period?.period_number ?? 0,
            start: period?.start_time ?? batch?.start_time ?? "",
            end: period?.end_time ?? batch?.end_time ?? "",
          };
        })
        .sort(
          (a, b) =>
            DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week) ||
            a.start.localeCompare(b.start) ||
            a.className.localeCompare(b.className),
        ),
    [
      entries,
      filterMode,
      classFilter,
      teacherFilter,
      classes,
      batches,
      periods,
      subjects,
      teachers,
    ],
  );

  const exportPdf = async () => {
    if (!rows.length) {
      showAlert(
        "No timetable entries",
        "There are no assigned periods for the selected filter yet.",
        "warning",
      );
      return;
    }
    setExporting(true);
    try {
      const instituteName = institute?.name || "Institute Timetable";
      const filterLabel =
        filterMode === "class"
          ? `Class: ${classes.find((x) => x.id === classFilter)?.name ?? "All classes"}`
          : filterMode === "teacher"
            ? `Teacher: ${teachers.find((x) => x.id === teacherFilter)?.full_name ?? "All teachers"}`
            : "All Classes";
      const pages = DAYS.map((day) => {
        const dayRows = rows.filter((row) => row.day_of_week === day);
        if (!dayRows.length) return "";
        const body = dayRows
          .map(
            (r) =>
              `<tr><td>${esc(r.className)}</td><td>${esc(r.batchName)}</td><td>${esc(timeLabel(r.start))} – ${esc(timeLabel(r.end))}</td><td>${esc(r.periodNumber ? `Period ${r.periodNumber}` : "Period")}</td><td class="subject">${esc(r.subjectName)}</td><td>${esc(r.teacherName)}</td></tr>`,
          )
          .join("");
        return `<section class="day-page"><div class="day-title">${esc(day)} Timetable</div><table><thead><tr><th>Class</th><th>Batch</th><th>Time</th><th>Period</th><th>Subject</th><th>Assigned Teacher</th></tr></thead><tbody>${body}</tbody></table><div class="page-foot">${esc(instituteName)} · ${esc(filterLabel)} · ${esc(day)}</div></section>`;
      })
        .filter(Boolean)
        .join("");
      const initials = instituteName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((x) => x[0])
        .join("")
        .toUpperCase();
      const logoHtml =
        institute?.logo_url && /^https?:\/\//i.test(institute.logo_url)
          ? `<img class="logo-img" src="${esc(institute.logo_url)}" />`
          : `<div class="logo">${esc(initials || "GD")}</div>`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1b2b43;margin:0}.brand{display:flex;align-items:center;gap:14px;border-bottom:3px solid #d6a84f;padding-bottom:10px;margin-bottom:12px}.logo{width:56px;height:56px;border-radius:14px;background:#172b4d;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px;flex-shrink:0}.logo-img{width:56px;height:56px;object-fit:contain;flex-shrink:0}.inst-name{font-size:23px;font-weight:800;color:#172b4d;margin:0}.contact{font-size:10px;color:#5d6c80;margin-top:5px}.report-title{margin-left:auto;text-align:right;font-size:13px;font-weight:700;color:#172b4d}.day-page{page-break-after:always;break-after:page}.day-page:last-child{page-break-after:auto;break-after:auto}.day-title{font-size:16px;font-weight:800;margin:10px 0 8px;color:#172b4d}.filter{font-size:10px;color:#5d6c80;margin-top:4px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#172b4d;color:#fff;font-size:10px;text-align:left;padding:8px 7px;border:1px solid #172b4d}td{font-size:10px;padding:7px;border:1px solid #d9e1eb;vertical-align:middle;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f2f5f9}.subject{font-weight:700;color:#172b4d}.page-foot{font-size:9px;color:#7b8798;text-align:right;margin-top:8px}.empty{padding:18px;text-align:center;color:#718096}</style></head><body>
      <div class="brand">${logoHtml}<div><h1 class="inst-name">${esc(instituteName)}</h1><div class="contact">${esc(institute?.address || "Institute address not added")}${institute?.contact_phone ? ` &nbsp; | &nbsp; Contact: ${esc(institute.contact_phone)}` : ""}</div></div><div class="report-title">MASTER TIMETABLE<div class="filter">${esc(filterLabel)}</div></div></div>
      ${pages || '<div class="empty">No timetable entries available for this filter.</div>'}</body></html>`;
      // Request a base64 payload from expo-print and write it ourselves.
      // This avoids copying Print's protected cache/Print/*.pdf URI, which
      // some Android Expo Go builds mark as unreadable to expo-file-system.
      const result = await Print.printToFileAsync({
        html,
        width: 842,
        height: 595,
        base64: true,
      });

      let shareUri: string | null = null;
      try {
        const base64Pdf = (result as typeof result & { base64?: string })
          .base64;
        if (!base64Pdf) {
          throw new Error(
            "The PDF generator did not return PDF data for sharing.",
          );
        }

        const rootDir =
          FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
        if (!rootDir)
          throw new Error("No writable app directory is available.");
        const shareDir = `${rootDir}timetable-pdfs/`;
        await FileSystem.makeDirectoryAsync(shareDir, {
          intermediates: true,
        }).catch(() => undefined);
        shareUri = `${shareDir}gyandeep-timetable-${Date.now()}.pdf`;
        await FileSystem.writeAsStringAsync(shareUri, base64Pdf, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (!(await Sharing.isAvailableAsync())) {
          throw new Error("PDF sharing is not available on this device.");
        }

        await Sharing.shareAsync(shareUri, {
          mimeType: "application/pdf",
          dialogTitle: `${instituteName} Timetable`,
          UTI: "com.adobe.pdf",
        });
      } catch (shareError: any) {
        console.warn(
          "PDF sharing failed; opening print dialog instead:",
          shareError?.message ?? shareError,
        );
        // Print from the generated URI even if the share copy could not be made.
        await Print.printAsync({ uri: result.uri });
        showAlert(
          "Print dialog opened",
          "The share sheet could not open. In the print dialog, choose Save as PDF; you can then share the saved file from your device.",
          "info",
        );
      }
    } catch (error: any) {
      showAlert(
        "Unable to export timetable",
        error?.message ?? "Check that expo-print is installed and try again.",
        "error",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View
        style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}
      >
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={21} color={WHITE} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Timetable Viewer</Text>
          <Text style={styles.headerSub}>Print-ready · A4 landscape</Text>
        </View>
        <View style={styles.headerIcon}>
          <Feather name="printer" size={21} color={NAVY} />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.instituteCard}>
          {institute?.logo_url && /^https?:\/\//i.test(institute.logo_url) ? (
            <Image
              source={{ uri: institute.logo_url }}
              style={styles.logoImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.logo}>
              <Feather name="book-open" size={25} color={WHITE} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.instituteName}>
              {institute?.name ?? "Your Institute"}
            </Text>
            <Text style={styles.instituteMeta}>
              {institute?.address || "Add institute address in settings"}
            </Text>
            <Text style={styles.instituteMeta}>
              {institute?.contact_phone
                ? `Contact: ${institute.contact_phone}`
                : "Contact number not added"}
            </Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Filter timetable</Text>
        <View style={styles.filterModes}>
          {(
            [
              { id: "all", label: "All classes", icon: "grid" },
              { id: "class", label: "Class-wise", icon: "book-open" },
              { id: "teacher", label: "Teacher-wise", icon: "users" },
            ] as const
          ).map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setFilterMode(m.id)}
              style={[
                styles.modeChip,
                filterMode === m.id && styles.modeChipActive,
              ]}
            >
              <Feather
                name={m.icon}
                size={15}
                color={filterMode === m.id ? WHITE : NAVY}
              />
              <Text
                style={[
                  styles.modeText,
                  filterMode === m.id && styles.modeTextActive,
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {filterMode === "class" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Pressable
              onPress={() => setClassFilter("all")}
              style={[styles.chip, classFilter === "all" && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  classFilter === "all" && styles.chipTextActive,
                ]}
              >
                All classes
              </Text>
            </Pressable>
            {classes.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setClassFilter(c.id)}
                style={[styles.chip, classFilter === c.id && styles.chipActive]}
              >
                <Text
                  style={[
                    styles.chipText,
                    classFilter === c.id && styles.chipTextActive,
                  ]}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {filterMode === "teacher" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Pressable
              onPress={() => setTeacherFilter("all")}
              style={[
                styles.chip,
                teacherFilter === "all" && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  teacherFilter === "all" && styles.chipTextActive,
                ]}
              >
                All teachers
              </Text>
            </Pressable>
            {teachers.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setTeacherFilter(t.id)}
                style={[
                  styles.chip,
                  teacherFilter === t.id && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    teacherFilter === t.id && styles.chipTextActive,
                  ]}
                >
                  {t.full_name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <View style={styles.previewHeading}>
          <View>
            <Text style={styles.sectionTitle}>Timetable preview</Text>
            <Text style={styles.previewSub}>
              {rows.length} scheduled periods · grouped by weekday
            </Text>
          </View>
          <View style={styles.a4Badge}>
            <Feather name="file-text" size={14} color="#8A650E" />
            <Text style={styles.a4Text}>A4 LANDSCAPE</Text>
          </View>
        </View>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={NAVY} />
            <Text style={styles.muted}>Loading timetable…</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="calendar" size={30} color={MUTED} />
            <Text style={styles.emptyTitle}>No timetable entries yet</Text>
            <Text style={styles.muted}>
              Assign subjects and teachers in Timetable Management first.
            </Text>
          </View>
        ) : (
          DAYS.filter((d) => rows.some((r) => r.day_of_week === d)).map(
            (day) => (
              <View key={day} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayTitle}>{day}</Text>
                  <Text style={styles.dayCount}>
                    {rows.filter((r) => r.day_of_week === day).length} periods
                  </Text>
                </View>
                {rows
                  .filter((r) => r.day_of_week === day)
                  .map((r) => (
                    <View key={r.id} style={styles.entryRow}>
                      <View style={styles.timeCol}>
                        <Text style={styles.time}>{timeLabel(r.start)}</Text>
                        <Text style={styles.timeDash}>
                          to {timeLabel(r.end)}
                        </Text>
                      </View>
                      <View style={styles.entryMain}>
                        <Text style={styles.subjectName}>{r.subjectName}</Text>
                        <Text style={styles.teacherName}>{r.teacherName}</Text>
                        <Text style={styles.meta}>
                          {r.className} · {r.batchName} · Period{" "}
                          {r.periodNumber || "—"}
                        </Text>
                      </View>
                    </View>
                  ))}
              </View>
            ),
          )
        )}
        <Pressable
          disabled={loading || exporting || rows.length === 0}
          onPress={() => void exportPdf()}
          style={[
            styles.exportButton,
            (loading || exporting || rows.length === 0) && { opacity: 0.55 },
          ]}
        >
          <Feather
            name={exporting ? "loader" : "download"}
            size={19}
            color={WHITE}
          />
          <Text style={styles.exportText}>
            {exporting ? "Preparing PDF…" : "Export / Share A4 PDF"}
          </Text>
        </Pressable>
        <Text style={styles.note}>
          PDF pages are formatted in landscape orientation. Each weekday with
          scheduled periods gets a separate page. Subject and assigned teacher
          are shown together with class, batch, and period time.
        </Text>
      </ScrollView>
      <AppAlert
        {...alert}
        onCancel={() => setAlert((a) => ({ ...a, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: 18,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#2B4161",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: WHITE },
  headerSub: { fontSize: 12, color: "#C1CBD8", marginTop: 3 },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 16, paddingBottom: 40, gap: 13 },
  instituteCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  logo: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  instituteName: { fontSize: 17, fontWeight: "800", color: NAVY },
  instituteMeta: { fontSize: 12, color: MUTED, marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: NAVY },
  filterModes: { flexDirection: "row", gap: 7 },
  modeChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 5,
  },
  modeChipActive: { backgroundColor: NAVY, borderColor: NAVY },
  modeText: { fontSize: 11, fontWeight: "700", color: NAVY },
  modeTextActive: { color: WHITE },
  chips: { gap: 8, paddingVertical: 3 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: { backgroundColor: "#E7EEF8", borderColor: NAVY },
  chipText: { fontSize: 12, color: NAVY, fontWeight: "600" },
  chipTextActive: { fontWeight: "800" },
  previewHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  previewSub: { fontSize: 12, color: MUTED, marginTop: 4 },
  a4Badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF4D6",
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
  },
  a4Text: { fontSize: 9, fontWeight: "800", color: "#8A650E" },
  dayCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  dayHeader: {
    backgroundColor: "#EAF0F8",
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayTitle: { fontSize: 15, fontWeight: "800", color: NAVY },
  dayCount: { fontSize: 11, fontWeight: "700", color: MUTED },
  entryRow: {
    flexDirection: "row",
    padding: 13,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: 12,
  },
  timeCol: {
    width: 83,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    paddingRight: 8,
    justifyContent: "center",
  },
  time: { fontSize: 12, fontWeight: "800", color: NAVY },
  timeDash: { fontSize: 10, color: MUTED, marginTop: 3 },
  entryMain: { flex: 1 },
  subjectName: { fontSize: 14, fontWeight: "800", color: NAVY },
  teacherName: {
    fontSize: 12,
    color: "#237A5B",
    fontWeight: "700",
    marginTop: 3,
  },
  meta: { fontSize: 10, color: MUTED, marginTop: 5 },
  center: { padding: 30, alignItems: "center", gap: 10 },
  muted: { fontSize: 12, color: MUTED, textAlign: "center", marginTop: 5 },
  emptyCard: {
    backgroundColor: WHITE,
    padding: 25,
    borderRadius: 18,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: NAVY },
  exportButton: {
    backgroundColor: NAVY,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  exportText: { fontSize: 14, fontWeight: "800", color: WHITE },
  note: {
    fontSize: 11,
    color: MUTED,
    lineHeight: 17,
    textAlign: "center",
    paddingHorizontal: 8,
  },
});
