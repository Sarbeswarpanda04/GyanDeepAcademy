import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const MUTED = "#78909F";
const BORDER = "#DDE5EC";
const WHITE = "#FFFFFF";
const GREEN = "#397D40";
const RED = "#C94343";
const AMBER = "#A66A13";

type Staff = {
  id: string;
  institute_id: string;
  full_name: string;
  staff_type: string;
  salary_type: "monthly" | "daily" | "batch" | string;
  salary_amount: number;
  weekly_holidays: string[] | null;
  status: string;
};
type Attendance = {
  id: string;
  staff_id: string;
  institute_id: string;
  attendance_date: string;
  status: string;
  sessions: string[] | null;
  wage_amount?: number | null;
};
type SalaryPayment = {
  id: string;
  institute_id: string;
  staff_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  paid_date: string;
  payment_method: string | null;
  note: string | null;
  proof_image_path?: string | null;
  proof_image_url?: string | null;
  created_at?: string;
};
type SalaryRow = {
  staff: Staff;
  paidDays: number;
  absentDays: number;
  sessions: number;
  workingDays: number;
  calculated: number;
  alreadyPaid: number;
  balance: number;
  payments: SalaryPayment[];
};

const money = (value: number) =>
  `₹${Math.round((Number(value) || 0) * 100) / 100}`.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
const monthKey = (year: number, monthIndex: number) =>
  `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
const dateOnly = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const titleCase = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
};
const daysInMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
const isoWeekdayName = (date: Date) =>
  [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][date.getDay()];

function getWorkingDays(month: string, weeklyHolidays: string[] | null) {
  const days = daysInMonth(month);
  const holidays = new Set((weeklyHolidays ?? []).map((x) => x.toLowerCase()));
  let count = 0;
  const [year, mon] = month.split("-").map(Number);
  for (let day = 1; day <= days; day++) {
    const date = new Date(year, mon - 1, day);
    if (!holidays.has(isoWeekdayName(date).toLowerCase())) count++;
  }
  return Math.max(1, count);
}
function getMonthRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return { start: `${month}-01`, end: dateOnly(new Date(year, mon, 0)) };
}
function calculateSalary(
  staff: Staff,
  attendance: Attendance[],
  month: string,
) {
  // Match the calculation used on the Teacher Details screen exactly:
  // count only attendance marked present with at least one selected session.
  // Monthly salary is prorated by calendar days in the selected month,
  // daily salary is paid once per qualifying attendance date, and batch
  // salary is paid per selected session. Do not substitute stored wage_amount.
  const monthAttendance = attendance.filter(
    (row) => row.attendance_date?.slice(0, 7) === month,
  );
  const unique = new Map<string, Attendance>();
  monthAttendance.forEach((row) => unique.set(row.attendance_date, row));

  let paidDays = 0;
  let absentDays = 0;
  let sessions = 0;
  let amount = 0;
  const salaryRate = Number(staff.salary_amount) || 0;
  const calendarDays = daysInMonth(month);

  for (const row of unique.values()) {
    const status = String(row.status || "").toLowerCase();
    const selectedSessions = Array.isArray(row.sessions) ? row.sessions : [];

    if (status === "absent") {
      absentDays += 1;
      continue;
    }
    if (status !== "present" || selectedSessions.length === 0) {
      // Holidays, unmarked days, and present records without sessions are unpaid.
      continue;
    }

    paidDays += 1;
    sessions += selectedSessions.length;

    if (staff.salary_type === "batch") {
      amount += selectedSessions.length * salaryRate;
    } else if (staff.salary_type === "daily") {
      amount += salaryRate;
    } else if (staff.salary_type === "monthly") {
      amount += calendarDays > 0 ? salaryRate / calendarDays : 0;
    }
  }

  return {
    paidDays,
    absentDays,
    sessions,
    workingDays: calendarDays,
    calculated: Math.round((amount + Number.EPSILON) * 100) / 100,
  };
}

function StaffSalaryScreen() {
  const now = new Date();
  const [salaryMonth, setSalaryMonth] = useState(
    monthKey(now.getFullYear(), now.getMonth()),
  );
  const [staff, setStaff] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [instituteId, setInstituteId] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [amountText, setAmountText] = useState("");
  const [paymentDate, setPaymentDate] = useState(dateOnly(new Date()));
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [proofImage, setProofImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [appAlert, setAppAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AppAlertType;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  }>({ visible: false, title: "", message: "", type: "info" });

  const alert = (
    title: string,
    message: string,
    type: AppAlertType = "info",
    options?: {
      confirmLabel?: string;
      cancelLabel?: string;
      onConfirm?: () => void;
    },
  ) => setAppAlert({ visible: true, title, message, type, ...options });
  const closeAlert = () =>
    setAppAlert((p) => ({ ...p, visible: false, onConfirm: undefined }));

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again.");
      const { data: members, error: memberError } = await supabase
        .from("institute_members")
        .select("institute_id, role")
        .eq("user_id", user.id);
      if (memberError) throw memberError;
      if (!members?.length)
        throw new Error("Your account is not linked to an institute.");
      if (members.length !== 1)
        throw new Error("Select one active institute first.");
      const activeInstituteId = members[0].institute_id as string;
      setInstituteId(activeInstituteId);
      setRole(String(members[0].role || "").toLowerCase());

      const { data: staffData, error: staffError } = await supabase
        .from("institute_staff")
        .select(
          "id,institute_id,full_name,staff_type,salary_type,salary_amount,weekly_holidays,status",
        )
        .eq("institute_id", activeInstituteId)
        .eq("status", "active")
        .order("full_name");
      if (staffError) throw staffError;

      const { start, end } = getMonthRange(salaryMonth);
      const { data: attendanceData, error: attendanceError } = await supabase
        .from("staff_attendance")
        .select(
          "id,staff_id,institute_id,attendance_date,status,sessions,wage_amount",
        )
        .eq("institute_id", activeInstituteId)
        .gte("attendance_date", start)
        .lte("attendance_date", end);
      if (attendanceError) throw attendanceError;

      const { data: paymentData, error: paymentError } = await supabase
        .from("staff_payouts")
        .select(
          "id,institute_id,staff_id,period_start,period_end,amount,paid_date,payment_method,note,proof_image_path,created_at",
        )
        .eq("institute_id", activeInstituteId)
        .eq("period_start", `${salaryMonth}-01`);
      if (paymentError) throw paymentError;

      const paymentRows = (paymentData ?? []) as SalaryPayment[];
      const paymentsWithProof = await Promise.all(
        paymentRows.map(async (payment) => {
          if (!payment.proof_image_path)
            return { ...payment, proof_image_url: null };
          const { data: signed, error: signedError } = await supabase.storage
            .from("staff-salary-proofs")
            .createSignedUrl(payment.proof_image_path, 3600);
          return {
            ...payment,
            proof_image_url: signedError ? null : (signed?.signedUrl ?? null),
          };
        }),
      );

      setStaff((staffData ?? []) as Staff[]);
      setAttendance((attendanceData ?? []) as Attendance[]);
      setPayments(paymentsWithProof);
    } catch (error: unknown) {
      // Supabase/PostgREST errors are often plain objects, not Error instances.
      // Extract their real message so schema, table, and RLS issues are visible.
      const details = error as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      } | null;
      const message =
        error instanceof Error
          ? error.message
          : [
              details?.message,
              details?.details,
              details?.hint,
              details?.code ? `Code: ${details.code}` : "",
            ]
              .filter(Boolean)
              .join("\n") ||
            "Unknown error. Check the Supabase table names, columns, and RLS policies.";
      console.error("Staff salary load failed:", error);
      alert("Unable to load salary records", message, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [salaryMonth]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const rows = useMemo<SalaryRow[]>(
    () =>
      staff.map((person) => {
        const calculation = calculateSalary(
          person,
          attendance.filter((a) => a.staff_id === person.id),
          salaryMonth,
        );
        const staffPayments = payments.filter((p) => p.staff_id === person.id);
        const alreadyPaid = staffPayments.reduce(
          (sum, p) => sum + Number(p.amount || 0),
          0,
        );
        return {
          staff: person,
          ...calculation,
          alreadyPaid,
          balance: Math.max(0, calculation.calculated - alreadyPaid),
          payments: staffPayments,
        };
      }),
    [staff, attendance, payments, salaryMonth],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        !q ||
        r.staff.full_name.toLowerCase().includes(q) ||
        r.staff.staff_type.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          calculated: acc.calculated + r.calculated,
          paid: acc.paid + r.alreadyPaid,
          balance: acc.balance + r.balance,
        }),
        { calculated: 0, paid: 0, balance: 0 },
      ),
    [rows],
  );

  const canManage = ["owner", "manager"].includes(role);

  const openPay = (row: SalaryRow) => {
    if (!canManage) {
      alert(
        "View only",
        "Only institute owners and managers can record salary payments.",
        "warning",
      );
      return;
    }
    setSelectedStaff(row.staff);
    setAmountText(row.balance.toFixed(2));
    setPaymentDate(dateOnly(new Date()));
    setPaymentMethod("cash");
    setNotes("");
    setProofImage(null);
    setShowPaymentForm(true);
  };

  const chooseProofImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert(
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
      });
      if (!result.canceled && result.assets?.[0])
        setProofImage(result.assets[0]);
    } catch (error) {
      console.error("Payment proof image picker failed:", error);
      alert(
        "Unable to select image",
        "Please try selecting the screenshot again.",
        "error",
      );
    }
  };

  const savePayment = async () => {
    if (!selectedStaff || !instituteId || !canManage) return;
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert(
        "Invalid amount",
        "Enter a payment amount greater than zero.",
        "error",
      );
      return;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ||
      Number.isNaN(new Date(`${paymentDate}T00:00:00`).getTime()) ||
      dateOnly(new Date(`${paymentDate}T00:00:00`)) !== paymentDate
    ) {
      alert(
        "Invalid date",
        "Enter a valid date in YYYY-MM-DD format.",
        "error",
      );
      return;
    }
    const row = rows.find((r) => r.staff.id === selectedStaff.id);
    if (!row) return;
    if (amount > row.balance + 0.009) {
      alert(
        "Amount exceeds salary balance",
        `Remaining salary is ${money(row.balance)}.`,
        "warning",
      );
      return;
    }
    setSaving(true);
    try {
      let proofPath: string | null = null;
      if (proofImage && paymentMethod !== "cash") {
        const uri = proofImage.uri;
        const extensionFromName = proofImage.fileName
          ?.split(".")
          .pop()
          ?.toLowerCase();
        const extensionFromMime = proofImage.mimeType
          ?.split("/")
          .pop()
          ?.toLowerCase();
        const extension = (
          extensionFromName && /^[a-z0-9]+$/.test(extensionFromName)
            ? extensionFromName
            : extensionFromMime && /^[a-z0-9]+$/.test(extensionFromMime)
              ? extensionFromMime
              : "jpg"
        ).replace("jpeg", "jpg");
        const contentType =
          proofImage.mimeType ||
          (extension === "png" ? "image/png" : "image/jpeg");
        const response = await fetch(uri);
        const fileBlob = await response.blob();
        proofPath = `${instituteId}/${selectedStaff.id}/${salaryMonth}/${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("staff-salary-proofs")
          .upload(proofPath, fileBlob, { contentType, upsert: false });
        if (uploadError) throw uploadError;
      }

      const [yearText, monthText] = salaryMonth.split("-");
      const monthStart = `${salaryMonth}-01`;
      const monthEnd = dateOnly(
        new Date(Number(yearText), Number(monthText), 0),
      );
      const { data, error } = await supabase
        .from("staff_payouts")
        .insert({
          institute_id: instituteId,
          staff_id: selectedStaff.id,
          period_start: monthStart,
          period_end: monthEnd,
          amount: Math.round(amount * 100) / 100,
          paid_date: paymentDate,
          payment_method:
            paymentMethod === "bank_transfer" ? "bank" : paymentMethod,
          note: notes.trim() || null,
          proof_image_path: proofPath,
        })
        .select("id")
        .single();
      if (error) {
        if (proofPath) {
          await supabase.storage
            .from("staff-salary-proofs")
            .remove([proofPath]);
        }
        throw error;
      }
      if (!data) throw new Error("No salary payment was created.");
      setShowPaymentForm(false);
      setSelectedStaff(null);
      await load();
      alert(
        "Salary payment recorded",
        `${money(amount)} recorded for ${selectedStaff.full_name} for ${monthLabel(salaryMonth)}.`,
        "success",
      );
    } catch (error: unknown) {
      const details = error as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      } | null;
      const message =
        error instanceof Error
          ? error.message
          : [
              details?.message,
              details?.details,
              details?.hint,
              details?.code ? `Code: ${details.code}` : "",
            ]
              .filter(Boolean)
              .join("\n") ||
            "Unknown error. Check the salary table and RLS policies.";
      console.error("Staff salary payment save failed:", error);
      alert("Unable to record salary", message, "error");
    } finally {
      setSaving(false);
    }
  };

  const changeMonth = (offset: number) => {
    const [y, m] = salaryMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    setSalaryMonth(monthKey(d.getFullYear(), d.getMonth()));
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <View style={styles.top}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Staff Salary</Text>
            <Text style={styles.subtitle}>
              Attendance-based monthly salary and payment records
            </Text>
          </View>
          <View style={styles.headerIcon}>
            <Feather name="dollar-sign" size={23} color={WHITE} />
          </View>
        </View>
        <View style={styles.monthSelector}>
          <Pressable style={styles.monthArrow} onPress={() => changeMonth(-1)}>
            <Feather name="chevron-left" size={22} color={WHITE} />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.monthLabel}>{monthLabel(salaryMonth)}</Text>
            <Text style={styles.monthHint}>Salary period</Text>
          </View>
          <Pressable style={styles.monthArrow} onPress={() => changeMonth(1)}>
            <Feather name="chevron-right" size={22} color={WHITE} />
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Calculated</Text>
            <Text style={styles.summaryValue}>{money(totals.calculated)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Paid</Text>
            <Text style={[styles.summaryValue, { color: GREEN }]}>
              {money(totals.paid)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Remaining</Text>
            <Text style={[styles.summaryValue, { color: RED }]}>
              {money(totals.balance)}
            </Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Feather name="search" size={17} color={MUTED} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search staff name or role"
            placeholderTextColor={MUTED}
            style={styles.searchInput}
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={NAVY} />
            <Text style={styles.muted}>Loading salary records…</Text>
          </View>
        ) : filteredRows.length === 0 ? (
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load();
                }}
              />
            }
            contentContainerStyle={styles.empty}
          >
            <Feather name="users" size={35} color={MUTED} />
            <Text style={styles.emptyTitle}>No staff records found</Text>
            <Text style={styles.muted}>
              Add active staff members and record their attendance to calculate
              salary.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 30 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load();
                }}
              />
            }
          >
            {filteredRows.map((row) => (
              <View key={row.staff.id} style={styles.staffCard}>
                <View style={styles.staffTop}>
                  <View style={styles.avatar}>
                    <Feather name="user" size={22} color={NAVY} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffName}>{row.staff.full_name}</Text>
                    <Text style={styles.staffMeta}>
                      {titleCase(row.staff.staff_type)} ·{" "}
                      {row.staff.salary_type} rate{" "}
                      {money(Number(row.staff.salary_amount))}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          row.balance <= 0.009 ? "#E8F6EC" : "#FFF4DF",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: row.balance <= 0.009 ? GREEN : AMBER,
                        fontSize: 10,
                        fontWeight: "800",
                      }}
                    >
                      {row.balance <= 0.009
                        ? "PAID"
                        : row.alreadyPaid > 0
                          ? "PART PAID"
                          : "PENDING"}
                    </Text>
                  </View>
                </View>
                <View style={styles.metrics}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Paid days</Text>
                    <Text style={styles.metricValue}>{row.paidDays}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Absent</Text>
                    <Text style={[styles.metricValue, { color: RED }]}>
                      {row.absentDays}
                    </Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Sessions</Text>
                    <Text style={styles.metricValue}>{row.sessions}</Text>
                  </View>
                </View>
                <View style={styles.salaryLine}>
                  <Text style={styles.lineLabel}>Calculated salary</Text>
                  <Text style={styles.lineValue}>{money(row.calculated)}</Text>
                </View>
                <View style={styles.salaryLine}>
                  <Text style={styles.lineLabel}>Already paid</Text>
                  <Text style={[styles.lineValue, { color: GREEN }]}>
                    {money(row.alreadyPaid)}
                  </Text>
                </View>
                <View style={[styles.salaryLine, styles.balanceLine]}>
                  <Text style={styles.balanceLabel}>Balance</Text>
                  <Text style={styles.balanceValue}>{money(row.balance)}</Text>
                </View>
                {row.payments.length > 0 ? (
                  <View style={styles.historyWrap}>
                    <Text style={styles.historyTitle}>
                      Payment history · {row.payments.length}
                    </Text>
                    {[...row.payments]
                      .sort(
                        (a, b) =>
                          b.paid_date.localeCompare(a.paid_date) ||
                          (b.created_at ?? "").localeCompare(
                            a.created_at ?? "",
                          ),
                      )
                      .map((payment) => (
                        <View key={payment.id} style={styles.historyItem}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyAmount}>
                              {money(Number(payment.amount))}
                            </Text>
                            <Text style={styles.historyMeta}>
                              {payment.paid_date} ·{" "}
                              {titleCase(
                                (payment.payment_method || "cash").replace(
                                  /_/g,
                                  " ",
                                ),
                              )}
                            </Text>
                            {payment.note ? (
                              <Text style={styles.historyNote}>
                                {payment.note}
                              </Text>
                            ) : null}
                          </View>
                          {payment.proof_image_url ? (
                            <Pressable
                              style={styles.proofButton}
                              onPress={() =>
                                void Linking.openURL(payment.proof_image_url!)
                              }
                            >
                              <Feather name="image" size={14} color={NAVY} />
                              <Text style={styles.proofButtonText}>
                                View proof
                              </Text>
                            </Pressable>
                          ) : payment.proof_image_path ? (
                            <Text style={styles.proofUnavailable}>
                              Proof unavailable
                            </Text>
                          ) : null}
                        </View>
                      ))}
                  </View>
                ) : null}
                {canManage && row.balance > 0.009 && (
                  <Pressable
                    style={styles.payButton}
                    onPress={() => openPay(row)}
                  >
                    <Feather name="check-circle" size={17} color={WHITE} />
                    <Text style={styles.payButtonText}>
                      {row.alreadyPaid > 0
                        ? "Record another payment"
                        : "Record salary payment"}
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {showPaymentForm && selectedStaff && (
        <View style={styles.formOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !saving && setShowPaymentForm(false)}
          />
          <View style={styles.formCard}>
            <View style={styles.formHandle} />
            <View style={styles.formHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>Record salary payment</Text>
                <Text style={styles.formSubtitle}>
                  {selectedStaff.full_name} · {monthLabel(salaryMonth)}
                </Text>
              </View>
              <Pressable onPress={() => !saving && setShowPaymentForm(false)}>
                <Feather name="x" size={22} color={NAVY} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Payment amount (₹)</Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                style={styles.input}
                editable={!saving}
              />
              <Text style={styles.inputLabel}>Payment date (YYYY-MM-DD)</Text>
              <TextInput
                value={paymentDate}
                onChangeText={setPaymentDate}
                style={styles.input}
                editable={!saving}
              />
              <Text style={styles.inputLabel}>Payment method</Text>
              <View style={styles.methodRow}>
                {[
                  { label: "Cash", value: "cash" },
                  { label: "UPI", value: "upi" },
                  { label: "Bank", value: "bank_transfer" },
                ].map((m) => (
                  <Pressable
                    key={m.value}
                    onPress={() => setPaymentMethod(m.value)}
                    style={[
                      styles.methodButton,
                      paymentMethod === m.value && styles.methodActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.methodText,
                        paymentMethod === m.value && { color: WHITE },
                      ]}
                    >
                      {m.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {paymentMethod !== "cash" ? (
                <View style={styles.proofSection}>
                  <Text style={styles.inputLabel}>
                    Payment screenshot / bank proof (optional)
                  </Text>
                  <Pressable
                    style={styles.uploadButton}
                    onPress={chooseProofImage}
                    disabled={saving}
                  >
                    <Feather name="upload" size={17} color={NAVY} />
                    <Text style={styles.uploadButtonText}>
                      {proofImage
                        ? "Change selected image"
                        : "Upload screenshot or image"}
                    </Text>
                  </Pressable>
                  {proofImage ? (
                    <View style={styles.proofPreviewWrap}>
                      <Image
                        source={{ uri: proofImage.uri }}
                        style={styles.proofPreview}
                        resizeMode="cover"
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyAmount} numberOfLines={2}>
                          {proofImage.fileName ||
                            "Payment proof image selected"}
                        </Text>
                        <Pressable
                          onPress={() => setProofImage(null)}
                          disabled={saving}
                        >
                          <Text style={styles.removeProofText}>
                            Remove image
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.proofHint}>
                      Attach a UPI receipt, transaction screenshot, or bank
                      transfer confirmation.
                    </Text>
                  )}
                </View>
              ) : null}
              <Text style={styles.inputLabel}>Note (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                style={[
                  styles.input,
                  { minHeight: 72, textAlignVertical: "top" },
                ]}
                multiline
                editable={!saving}
                placeholder="Payment reference or remarks"
                placeholderTextColor={MUTED}
              />
              <Pressable
                style={[styles.payButton, saving && { opacity: 0.6 }]}
                onPress={savePayment}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <>
                    <Feather name="save" size={17} color={WHITE} />
                    <Text style={styles.payButtonText}>Save payment</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      )}

      <AppAlert {...appAlert} onCancel={closeAlert} />
    </View>
  );
}

export default StaffSalaryScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  top: {
    backgroundColor: NAVY,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  title: { color: WHITE, fontSize: 27, fontWeight: "800" },
  subtitle: { color: "#C0CED8", fontSize: 12, marginTop: 5, lineHeight: 18 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#35495E",
    alignItems: "center",
    justifyContent: "center",
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#293B50",
    borderRadius: 16,
    padding: 6,
    marginTop: 8,
  },
  monthArrow: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { color: WHITE, fontSize: 16, fontWeight: "800" },
  monthHint: { color: "#A7BAC7", fontSize: 10, marginTop: 3 },
  body: { flex: 1, paddingHorizontal: 15, paddingTop: 14 },
  summaryGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
  summaryCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: BORDER,
  },
  summaryLabel: { color: MUTED, fontSize: 10, fontWeight: "700" },
  summaryValue: { color: NAVY, fontSize: 15, fontWeight: "900", marginTop: 6 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, height: 44, color: NAVY, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: {
    color: MUTED,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 7,
  },
  empty: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: { color: NAVY, fontSize: 17, fontWeight: "800", marginTop: 14 },
  staffCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
  },
  staffTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#E9EFF5",
    alignItems: "center",
    justifyContent: "center",
  },
  staffName: { color: NAVY, fontSize: 15, fontWeight: "800" },
  staffMeta: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
    textTransform: "capitalize",
  },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  metrics: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 12 },
  metric: { flex: 1, backgroundColor: "#F6F8FA", borderRadius: 10, padding: 9 },
  metricLabel: { color: MUTED, fontSize: 10 },
  metricValue: { color: NAVY, fontSize: 15, fontWeight: "800", marginTop: 4 },
  salaryLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
  },
  lineLabel: { color: MUTED, fontSize: 12 },
  lineValue: { color: NAVY, fontSize: 13, fontWeight: "800" },
  balanceLine: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 3,
    paddingTop: 10,
  },
  balanceLabel: { color: NAVY, fontSize: 13, fontWeight: "800" },
  balanceValue: { color: RED, fontSize: 15, fontWeight: "900" },
  paymentInfo: { color: MUTED, fontSize: 10, marginTop: 6 },
  historyWrap: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  historyTitle: {
    color: NAVY,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 5,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F4",
  },
  historyAmount: { color: NAVY, fontSize: 12, fontWeight: "800" },
  historyMeta: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
    textTransform: "capitalize",
  },
  historyNote: { color: MUTED, fontSize: 10, marginTop: 3 },
  proofButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  proofButtonText: { color: NAVY, fontSize: 10, fontWeight: "800" },
  proofUnavailable: { color: MUTED, fontSize: 9 },
  proofSection: {
    backgroundColor: "#EAF0F5",
    borderRadius: 12,
    padding: 11,
    marginBottom: 10,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#A8B8C6",
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 10,
  },
  uploadButtonText: { color: NAVY, fontSize: 12, fontWeight: "800" },
  proofHint: { color: MUTED, fontSize: 10, lineHeight: 15, marginTop: 8 },
  proofPreviewWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  proofPreview: {
    width: 64,
    height: 64,
    borderRadius: 9,
    backgroundColor: WHITE,
  },
  removeProofText: {
    color: RED,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 7,
  },
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  payButtonText: { color: WHITE, fontSize: 12, fontWeight: "800" },
  formOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10,24,42,0.5)",
    justifyContent: "flex-end",
    zIndex: 10,
  },
  formCard: {
    backgroundColor: BG,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: "88%",
  },
  formHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 5,
    backgroundColor: "#CBD3E0",
    marginBottom: 15,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  formTitle: { color: NAVY, fontSize: 18, fontWeight: "900" },
  formSubtitle: { color: MUTED, fontSize: 11, marginTop: 4 },
  inputLabel: {
    color: NAVY,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
    marginTop: 5,
  },
  input: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    minHeight: 45,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: NAVY,
    fontSize: 13,
    marginBottom: 12,
  },
  methodRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  methodButton: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 11,
    backgroundColor: WHITE,
  },
  methodActive: { backgroundColor: NAVY, borderColor: NAVY },
  methodText: { color: NAVY, fontSize: 11, fontWeight: "800" },
});
