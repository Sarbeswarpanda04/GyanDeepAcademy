import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

type Student = {
  id: string;
  institute_id: string;
  full_name: string;
  roll_number: string;
  phone: string | null;
  photo_path: string | null;
  status: string;
  class_id: string;
  className: string;
  batches: string[];
  fee_frequency?: string;
  fee_amount?: number;
};
const navy = "#202F41",
  bg = "#F1F6FA",
  blue = "#3988E8";
export default function StudentsScreen() {
  const [rows, setRows] = useState<Student[]>([]),
    [classes, setClasses] = useState<{ id: string; name: string }[]>([]),
    [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState<"active" | "inactive" | "all">("active"),
    [classFilter, setClassFilter] = useState(""),
    [batchFilter, setBatchFilter] = useState(""),
    [filters, setFilters] = useState(false);
  const [alert, setAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AppAlertType;
  }>({ visible: false, title: "", message: "", type: "info" });
  const warn = (title: string, message: string, type: AppAlertType = "info") =>
    setAlert({ visible: true, title, message, type });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: ae,
      } = await supabase.auth.getUser();
      if (ae) throw ae;
      if (!user) throw new Error("Please sign in.");
      const { data: m, error: me } = await supabase
        .from("institute_members")
        .select("institute_id")
        .eq("user_id", user.id);
      if (me) throw me;
      if (!m?.length)
        throw new Error("Your account is not linked to an institute.");
      if (m.length !== 1) throw new Error("Select an active institute first.");
      const iid = m[0].institute_id;
      const [sr, cr, br] = await Promise.all([
        supabase
          .from("institute_students")
          .select(
            "id,institute_id,full_name,roll_number,phone,photo_path,status,class_id",
          )
          .eq("institute_id", iid)
          .order("created_at", { ascending: false }),
        supabase
          .from("institute_classes")
          .select("id,name")
          .eq("institute_id", iid)
          .order("name"),
        supabase
          .from("institute_batches")
          .select("id,name")
          .eq("institute_id", iid)
          .eq("is_active", true)
          .order("name"),
      ]);
      if (sr.error) throw sr.error;
      if (cr.error) throw cr.error;
      if (br.error) throw br.error;
      const raw = sr.data ?? [],
        c = cr.data ?? [],
        b = br.data ?? [];
      setClasses(c);
      setBatches(b);
      const ids = raw.map((s) => s.id);
      let links: any[] = [];
      let fees: any[] = [];
      if (ids.length) {
        const [lr, fr] = await Promise.all([
          supabase
            .from("institute_student_batches")
            .select("student_id,batch_id")
            .in("student_id", ids),
          supabase
            .from("institute_student_fees")
            .select("student_id,fee_frequency,fee_amount")
            .eq("institute_id", iid),
        ]);
        if (lr.error) throw lr.error;
        if (fr.error) throw fr.error;
        links = lr.data ?? [];
        fees = fr.data ?? [];
      }
      const classNames = new Map(c.map((x) => [x.id, x.name])),
        batchNames = new Map(b.map((x) => [x.id, x.name])),
        feeMap = new Map(fees.map((x) => [x.student_id, x]));
      const full = await Promise.all(
        raw.map(async (s) => {
          let url = null;
          if (s.photo_path) {
            const { data } = await supabase.storage
              .from("student-photos")
              .createSignedUrl(s.photo_path, 3600);
            url = data?.signedUrl ?? null;
          }
          const f = feeMap.get(s.id);
          return {
            ...s,
            photo_path: url,
            className: classNames.get(s.class_id) ?? "Class",
            batches: links
              .filter((l) => l.student_id === s.id)
              .map((l) => batchNames.get(l.batch_id))
              .filter(Boolean),
            fee_frequency: f?.fee_frequency,
            fee_amount: f?.fee_amount,
          };
        }),
      );
      setRows(full);
    } catch (e: any) {
      warn(
        "Unable to load students",
        e?.message ?? "Please try again.",
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
  const filtered = useMemo(
    () =>
      rows.filter(
        (s) =>
          (status === "all" || s.status === status) &&
          (!classFilter || s.class_id === classFilter) &&
          (!batchFilter ||
            s.batches.includes(
              batches.find((b) => b.id === batchFilter)?.name ?? "",
            )) &&
          `${s.full_name} ${s.roll_number} ${s.phone ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [rows, status, classFilter, batchFilter, batches, query],
  );
  const contact = async (phone: string | null, kind: "tel" | "wa") => {
    if (!phone) {
      warn("Phone unavailable", "No phone number is saved for this student.");
      return;
    }
    const url =
      kind === "tel"
        ? `tel:${phone}`
        : `https://wa.me/${phone.replace(/\D/g, "")}`;
    try {
      await Linking.openURL(url);
    } catch {
      warn("Cannot open app", "No compatible app was found.");
    }
  };
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <View style={st.screen}>
      <StatusBar barStyle="light-content" backgroundColor={navy} />
      <View style={st.top}>
        <View style={st.titleRow}>
          <Text style={st.title}>Students</Text>
          <Pressable
            style={st.circle}
            onPress={() => router.push("/add-students")}
          >
            <Feather name="user-plus" size={21} color="#FFF" />
          </Pressable>
          <Pressable style={st.circle} onPress={() => setFilters(!filters)}>
            <Feather name="sliders" size={21} color="#FFF" />
          </Pressable>
        </View>
        <View style={st.topFilters}>
          <View style={st.topChip}>
            <Feather name="map-pin" size={17} color="#C4D4E1" />
            <Text style={st.topChipText}>All Batches</Text>
          </View>
          <View style={st.topChip}>
            <Feather name="book-open" size={17} color="#C4D4E1" />
            <Text style={st.topChipText}>All Classes</Text>
          </View>
        </View>
      </View>
      <View style={st.body}>
        <View style={st.search}>
          <Feather name="search" size={18} color="#71869A" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, roll or phone"
            placeholderTextColor="#95A4B1"
            style={st.searchInput}
          />
        </View>
        {filters && (
          <View style={st.filterBox}>
            <Text style={st.filterTitle}>Class</Text>
            <ScrollView horizontal>
              {[{ id: "", name: "All" }, ...classes].map((c) => (
                <Pressable
                  key={c.id || "all"}
                  onPress={() => setClassFilter(c.id)}
                  style={[st.filterChip, classFilter === c.id && st.filterOn]}
                >
                  <Text
                    style={[
                      st.filterChipText,
                      classFilter === c.id && st.filterTextOn,
                    ]}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={st.filterTitle}>Batch</Text>
            <ScrollView horizontal>
              {[{ id: "", name: "All" }, ...batches].map((b) => (
                <Pressable
                  key={b.id || "all"}
                  onPress={() => setBatchFilter(b.id)}
                  style={[st.filterChip, batchFilter === b.id && st.filterOn]}
                >
                  <Text
                    style={[
                      st.filterChipText,
                      batchFilter === b.id && st.filterTextOn,
                    ]}
                  >
                    {b.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <View style={st.tabs}>
          {(["active", "inactive", "all"] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              style={[st.tab, status === s && st.tabOn]}
            >
              <Text style={[st.tabText, status === s && st.tabTextOn]}>
                {s === "active"
                  ? `Active ${count("active")}`
                  : s === "inactive"
                    ? `Inactive ${count("inactive")}`
                    : `All ${rows.length}`}
              </Text>
            </Pressable>
          ))}
        </View>
        {loading ? (
          <View style={st.center}>
            <ActivityIndicator size="large" color={blue} />
            <Text style={st.emptyText}>Loading students...</Text>
          </View>
        ) : !filtered.length ? (
          <View style={st.center}>
            <Feather name="users" size={36} color={blue} />
            <Text style={st.emptyTitle}>No students found</Text>
            <Text style={st.emptyText}>
              {rows.length
                ? "Try changing search or filters."
                : "Add your first student to get started."}
            </Text>
            <Pressable
              style={st.addButton}
              onPress={() => router.push("/add-students")}
            >
              <Text style={st.addText}>+ Add Student</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 100, gap: 12 }}>
            {filtered.map((s) => (
              <Pressable
                key={s.id}
                style={st.card}
                onPress={() =>
                  router.push({
                    pathname: "/student-details",
                    params: { id: s.id },
                  })
                }
              >
                <View style={st.studentRow}>
                  {s.photo_path ? (
                    <Image source={{ uri: s.photo_path }} style={st.avatar} />
                  ) : (
                    <View style={st.avatarEmpty}>
                      <Feather name="user" size={26} color="#7194B3" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={st.name}>{s.full_name}</Text>
                    <Text style={st.meta}>
                      {s.roll_number}
                      {s.phone ? ` · ${s.phone}` : ""}
                    </Text>
                    <Text style={st.className}>{s.className}</Text>
                    <Text style={st.meta}>
                      {s.fee_amount != null
                        ? `₹${Number(s.fee_amount).toLocaleString("en-IN")} · ${s.fee_frequency?.replace("_", " ")}`
                        : "Fee not configured"}
                    </Text>
                  </View>
                  <View
                    style={[
                      st.badge,
                      s.status === "active" ? st.active : st.inactive,
                    ]}
                  >
                    <Text style={st.badgeText}>
                      {s.status === "active" ? "Active" : "Inactive"}
                    </Text>
                  </View>
                </View>
                {!!s.batches.length && (
                  <Text style={st.batchText}>
                    Batches: {s.batches.join(", ")}
                  </Text>
                )}
                <View style={st.actions}>
                  <Pressable
                    style={st.wa}
                    onPress={() => void contact(s.phone, "wa")}
                  >
                    <Feather name="message-circle" size={18} color="#167653" />
                    <Text style={{ color: "#167653", fontWeight: "800" }}>
                      WhatsApp
                    </Text>
                  </Pressable>
                  <Pressable
                    style={st.call}
                    onPress={() => void contact(s.phone, "tel")}
                  >
                    <Feather name="phone" size={17} color={navy} />
                    <Text style={{ color: navy, fontWeight: "800" }}>Call</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
      <Pressable style={st.fab} onPress={() => router.push("/add-students")}>
        <Feather name="plus" size={24} color="#FFF" />
        <Text style={st.fabText}>Add</Text>
      </Pressable>
      <AppAlert
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onConfirm={() => setAlert((a) => ({ ...a, visible: false }))}
        onCancel={() => setAlert((a) => ({ ...a, visible: false }))}
      />
    </View>
  );
}
const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg },
  top: { backgroundColor: navy, padding: 18, paddingBottom: 18 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  title: { flex: 1, color: "#FFF", fontSize: 25, fontWeight: "800" },
  circle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#2D4158",
    alignItems: "center",
    justifyContent: "center",
  },
  topFilters: { flexDirection: "row", gap: 10 },
  topChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2D4158",
    borderRadius: 14,
    padding: 14,
  },
  topChipText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  body: { flex: 1, padding: 16 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
    backgroundColor: "#FFF",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E0E8EF",
    marginBottom: 12,
  },
  searchInput: { flex: 1, minHeight: 46, color: navy },
  filterBox: {
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
    gap: 8,
  },
  filterTitle: { fontSize: 12, fontWeight: "800", color: navy },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E0E8EF",
    marginRight: 7,
    marginVertical: 5,
  },
  filterOn: { backgroundColor: navy, borderColor: navy },
  filterChipText: { fontSize: 12, color: "#5C7082", fontWeight: "700" },
  filterTextOn: { color: "#FFF" },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 15 },
  tab: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E0E8EF",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tabOn: { backgroundColor: navy, borderColor: navy },
  tabText: { fontSize: 13, color: "#5C7082", fontWeight: "700" },
  tabTextOn: { color: "#FFF" },
  card: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E0E8EF",
    borderRadius: 22,
    padding: 14,
  },
  studentRow: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 18,
    backgroundColor: "#EAF1F7",
  },
  avatarEmpty: {
    width: 66,
    height: 66,
    borderRadius: 18,
    backgroundColor: "#EAF1F7",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 18, fontWeight: "800", color: navy },
  meta: { fontSize: 12, color: "#91A7B5", marginTop: 5 },
  className: {
    fontSize: 12,
    color: "#3F7D4C",
    fontWeight: "800",
    marginTop: 5,
  },
  badge: { borderRadius: 18, paddingHorizontal: 9, paddingVertical: 6 },
  active: { backgroundColor: "#E4F0FF" },
  inactive: { backgroundColor: "#FDE8E8" },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#2D65A5" },
  batchText: { fontSize: 11, color: "#7A8FA1", marginTop: 10 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  wa: {
    flex: 1,
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#E7F7EF",
    borderWidth: 1,
    borderColor: "#C7EAD8",
  },
  call: {
    flex: 1,
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#F0F5F9",
    borderWidth: 1,
    borderColor: "#E2EAF1",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: navy, marginTop: 12 },
  emptyText: {
    fontSize: 13,
    color: "#879BAA",
    marginTop: 8,
    textAlign: "center",
  },
  addButton: {
    backgroundColor: navy,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 15,
  },
  addText: { color: "#FFF", fontWeight: "800" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: navy,
    paddingHorizontal: 21,
    paddingVertical: 17,
    borderRadius: 25,
    elevation: 5,
  },
  fabText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
});
