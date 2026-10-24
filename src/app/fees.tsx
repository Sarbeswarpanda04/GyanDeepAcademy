
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import ViewShot from "react-native-view-shot";
import { useFocusEffect } from "expo-router";

import { supabase } from "../lib/supabase";
import InstituteHeader from "../components/InstituteHeader";
import FloatingTabBar from "../components/FloatingTabBar";
import AppAlert from "../components/AppAlert";

const NAVY = "#10264A";
const GOLD = "#F3C969";
const BG = "#F3F6FA";
const WHITE = "#FFFFFF";
const MUTED = "#7C899D";
const GREEN = "#188653";
const RED = "#D54848";
const AMBER = "#B7791F";
const BORDER = "#E5EAF1";

type Frequency =
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "one_time";

type Student = {
  id: string;
  full_name: string;
  roll_number: string;
  father_name: string | null;
  phone: string | null;
  class_id: string;
  admission_date: string;
  status: string;
};

type FeeSetting = {
  id: string;
  institute_id: string;
  student_id: string;
  fee_frequency: Frequency;
  fee_amount: number;
  billing_day: number | null;
};

type Payment = {
  id: string;
  institute_id: string;
  student_id: string;
  student_fee_id: string;
  billing_period_start: string;
  billing_period_end: string;
  amount_due: number;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  receipt_number: string | null;
  notes: string | null;
  created_at: string;
};

type BillingPeriod = {
  start: string;
  end: string;
  dueDate: string;
  label: string;
};

type FeeRow = {
  student: Student;
  fee: FeeSetting;
  period: BillingPeriod;
  paid: number;
  balance: number;
  amountDue: number;
  status: "Paid" | "Unpaid" | "Upcoming";
  payments: Payment[];
};

type IconName = React.ComponentProps<typeof Feather>["name"];

const money = (value: number) =>
  `₹${Math.max(0, value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

const dateOnly = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

const parseDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatDate = (value: string) =>
  parseDate(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const frequencyLabel = (frequency: Frequency) => {
  const labels: Record<Frequency, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    half_yearly: "Half-yearly",
    yearly: "Yearly",
    one_time: "One-time",
  };
  return labels[frequency];
};

function dueDateForMonth(year: number, month: number, day: number) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(day, 1), lastDay));
}

function addBillingMonths(date: Date, months: number) {
  const target = new Date(
    date.getFullYear(),
    date.getMonth() + months,
    1
  );
  return dueDateForMonth(
    target.getFullYear(),
    target.getMonth(),
    date.getDate()
  );
}

/**
 * Generates fee periods using billing_day and admission_date.
 * Payments are matched to exact period start/end dates.
 */
function getBillingPeriods(
  fee: FeeSetting,
  student: Student,
  now: Date
): BillingPeriod[] {
  const admission = parseDate(student.admission_date);
  const today = parseDate(dateOnly(now));

  if (fee.fee_frequency === "one_time") {
    return [{
      start: dateOnly(admission),
      end: dateOnly(admission),
      dueDate: dateOnly(admission),
      label: "One-time fee",
    }];
  }

  const interval =
    fee.fee_frequency === "monthly" ? 1 :
    fee.fee_frequency === "quarterly" ? 3 :
    fee.fee_frequency === "half_yearly" ? 6 : 12;

  const billingDay = Math.min(
    31,
    Math.max(1, fee.billing_day ?? admission.getDate())
  );

  let due = dueDateForMonth(
    admission.getFullYear(),
    admission.getMonth(),
    billingDay
  );

  // If admission happens after that month's billing day,
  // the first scheduled due date is the next cycle.
  if (due < admission) {
    due = addBillingMonths(due, interval);
  }

  let periodStart = admission;
  const periods: BillingPeriod[] = [];
  let guard = 0;

  // Only generate periods that are due or current.
  while (due <= today && guard < 240) {
    periods.push({
      start: dateOnly(periodStart),
      end: dateOnly(due),
      dueDate: dateOnly(due),
      label:
        interval === 1
          ? due.toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
            })
          : `${formatDate(dateOnly(periodStart))} – ${formatDate(
              dateOnly(due)
            )}`,
    });

    periodStart = due;
    due = addBillingMonths(due, interval);
    guard++;
  }

  // Include the next future period for the Upcoming filter.
  if (guard < 240) {
    periods.push({
      start: dateOnly(periodStart),
      end: dateOnly(due),
      dueDate: dateOnly(due),
      label:
        interval === 1
          ? due.toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
            })
          : `${formatDate(dateOnly(periodStart))} – ${formatDate(
              dateOnly(due)
            )}`,
    });
  }

  return periods;
}

function getStatus(
  balance: number,
  dueDate: string,
  today: string
): FeeRow["status"] {
  if (balance <= 0.009) return "Paid";
  return dueDate > today ? "Upcoming" : "Unpaid";
}


export default function FeesScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [instituteId, setInstituteId] = useState("");
  const [instituteName, setInstituteName] = useState("GyanDeep Academy");
  const [instituteLogoUrl, setInstituteLogoUrl] = useState<string | null>(null);
  const receiptViewRef = React.useRef<ViewShot>(null);
  const [canCollect, setCanCollect] = useState(false);

  type AppAlertType = "success" | "error" | "info" | "warning";

const [appAlert, setAppAlert] = useState<{
  visible: boolean;
  title: string;
  message: string;
  type: AppAlertType;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}>({
  visible: false,
  title: "",
  message: "",
  type: "info",
});

const showAppAlert = (
  title: string,
  message: string,
  type: AppAlertType = "info",
  options?: {
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  }
) => {
  setAppAlert({
    visible: true,
    title,
    message,
    type,
    ...options,
  });
};

const closeAppAlert = () => {
  setAppAlert((previous) => ({
    ...previous,
    visible: false,
    onConfirm: undefined,
  }));
};

  const [rows, setRows] = useState<FeeRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [fees, setFees] = useState<FeeSetting[]>([]);
  const [history, setHistory] = useState<Payment[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Paid" | "Unpaid" | "Upcoming"
  >("All");
  const [classFilter, setClassFilter] = useState("All");
  const [activeTab, setActiveTab] = useState<"Dues" | "History">("Dues");

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentPeriods, setStudentPeriods] = useState<FeeRow[]>([]);
  const [showStudentSheet, setShowStudentSheet] = useState(false);

  const [selected, setSelected] = useState<FeeRow | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(dateOnly(new Date()));
  const [notes, setNotes] = useState("");

  const [showEdit, setShowEdit] = useState(false);
  const [editRow, setEditRow] = useState<FeeRow | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    "amount"
  );
  const [discountText, setDiscountText] = useState("0");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDirty, setEditDirty] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
const [showEditTransaction, setShowEditTransaction] = useState(false);
const [transactionAmount, setTransactionAmount] = useState("");
const [transactionDate, setTransactionDate] = useState("");
const [transactionMethod, setTransactionMethod] = useState("cash");
const [transactionNotes, setTransactionNotes] = useState("");
  const [lastReceipt, setLastReceipt] = useState<{
    student: Student;
    row: FeeRow;
    payment: Payment;
  } | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const loadFees = useCallback(async () => {
    setErrorMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again to view fees.");

      const { data: membership, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership) throw new Error("No institute membership was found.");

      const activeInstituteId = membership.institute_id as string;
      setInstituteId(activeInstituteId);
      setCanCollect(["owner", "manager"].includes(membership.role));

      const [
        { data: studentData, error: studentError },
        { data: feeData, error: feeError },
        { data: paymentData, error: paymentError },
        { data: instituteData },
      ] = await Promise.all([
        supabase
          .from("institute_students")
          .select(
            "id, full_name, roll_number, father_name, phone, class_id, admission_date, status"
          )
          .eq("institute_id", activeInstituteId)
          .eq("status", "active")
          .order("full_name"),
        supabase
          .from("institute_student_fees")
          .select(
            "id, institute_id, student_id, fee_frequency, fee_amount, billing_day"
          )
          .eq("institute_id", activeInstituteId),
        supabase
          .from("institute_fee_payments")
          .select(
            "id, institute_id, student_id, student_fee_id, billing_period_start, billing_period_end, amount_due, amount_paid, payment_date, payment_method, receipt_number, notes, created_at"
          )
          .eq("institute_id", activeInstituteId)
          .order("payment_date", { ascending: false }),
        supabase
          .from("institutes")
          .select("*")
          .eq("id", activeInstituteId)
          .maybeSingle(),
      ]);

      if (studentError) throw studentError;
      if (feeError) throw feeError;
      if (paymentError) throw paymentError;

      const studentList = (studentData ?? []) as Student[];
      const feeList = (feeData ?? []) as FeeSetting[];
      const paymentList = (paymentData ?? []) as Payment[];

      setStudents(studentList);
      setFees(feeList);
      setHistory(paymentList);

      if (instituteData?.name) setInstituteName(instituteData.name);
      // Supports common logo column names without requiring a specific schema name.
      const logoCandidate = [
        instituteData?.logo_url,
        instituteData?.logo_path,
        instituteData?.logo,
        instituteData?.image_url,
        instituteData?.branding_logo_url,
      ].find((value) => typeof value === "string" && /^https?:\/\//i.test(value));
      setInstituteLogoUrl(typeof logoCandidate === "string" ? logoCandidate : null);

      const today = dateOnly(new Date());
      const nextRows: FeeRow[] = [];

      for (const fee of feeList) {
        const student = studentList.find(
          (item) => item.id === fee.student_id
        );
        if (!student) continue;

        const periods = getBillingPeriods(fee, student, new Date());

        for (const period of periods) {
          const periodPayments = paymentList.filter(
            (payment) =>
              payment.student_fee_id === fee.id &&
              payment.billing_period_start === period.start &&
              payment.billing_period_end === period.end
          );

          const paid = periodPayments.reduce(
            (sum, payment) => sum + Number(payment.amount_paid || 0),
            0
          );

          const amountDue = Number(fee.fee_amount);
          const balance = Math.max(0, amountDue - paid);

          nextRows.push({
            student,
            fee,
            period,
            paid,
            balance,
            amountDue,
            status: getStatus(balance, period.dueDate, today),
            payments: periodPayments,
          });
        }
      }

      nextRows.sort((a, b) => {
        if (a.status === "Unpaid" && b.status !== "Unpaid") return -1;
        if (a.status !== "Unpaid" && b.status === "Unpaid") return 1;
        return a.period.dueDate.localeCompare(b.period.dueDate);
      });

      setRows(nextRows);
    } catch (error: any) {
      console.error("Fees screen load error:", error);
      setErrorMessage(error?.message || "Unable to load fee records.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const run = async () => {
        setLoading(true);
        await loadFees();
        if (active) setLoading(false);
      };

      void run();

      return () => {
        active = false;
      };
    }, [loadFees])
  );

  const refresh = async () => {
    setRefreshing(true);
    await loadFees();
    setRefreshing(false);
  };

  const classOptions = useMemo(() => {
    const ids = [...new Set(students.map((s) => s.class_id))];
    return ids.map((id, index) => ({
      id,
      label: `Class ${index + 1}`,
    }));
  }, [students]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === "All" || row.status === statusFilter;
      const matchesClass =
        classFilter === "All" || row.student.class_id === classFilter;
      const matchesSearch =
        !term ||
        row.student.full_name.toLowerCase().includes(term) ||
        row.student.roll_number.toLowerCase().includes(term) ||
        (row.student.father_name ?? "").toLowerCase().includes(term);

      return matchesStatus && matchesClass && matchesSearch;
    });
  }, [rows, search, statusFilter, classFilter]);

  const totals = useMemo(() => {
    // Use each student's latest due/current period only to avoid summing
    // all historical periods into the headline summary.
    const latestByFee = new Map<string, FeeRow>();

    for (const row of rows) {
      const previous = latestByFee.get(row.fee.id);
      if (
        !previous ||
        row.period.start > previous.period.start
      ) {
        latestByFee.set(row.fee.id, row);
      }
    }

    return [...latestByFee.values()].reduce(
      (sum, row) => ({
        due: sum.due + row.amountDue,
        paid: sum.paid + row.paid,
        pending: sum.pending + row.balance,
        overdue:
          sum.overdue +
          (row.status === "Unpaid" && row.period.dueDate < dateOnly(new Date())
            ? row.balance
            : 0),
      }),
      { due: 0, paid: 0, pending: 0, overdue: 0 }
    );
  }, [rows]);

  const openStudent = (student: Student) => {
    const periods = rows
      .filter((row) => row.student.id === student.id)
      .sort((a, b) => b.period.start.localeCompare(a.period.start));

    setSelectedStudent(student);
    setStudentPeriods(periods);
    setShowStudentSheet(true);
  };

  const openPayment = (row: FeeRow) => {
    if (!canCollect) {
      showAppAlert("View only", "Only owners and managers can collect fees.", "warning");
      return;
    }

    setSelected(row);
    setAmountText(row.balance.toFixed(2));
    setMethod("cash");
    setPaymentDate(dateOnly(new Date()));
    setNotes("");
    setShowStudentSheet(false);
    setShowPayment(true);
  };

  const openEdit = (row: FeeRow) => {
    if (!canCollect) return;

    setEditRow(row);
    setEditAmount(String(row.fee.fee_amount));
    setDiscountText("0");
    setDiscountType("amount");
    setEditDueDate(row.period.dueDate);
    setEditDirty(false);
    setShowStudentSheet(false);
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!editRow || !canCollect) return;

    const baseAmount = Number(editAmount);
    const discount = Number(discountText || 0);

    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      showAppAlert("Invalid amount", "Enter a fee amount greater than zero.", "error");
      return;
    }

    if (!Number.isFinite(discount) || discount < 0) {
      showAppAlert("Invalid discount", "Enter a valid discount.", "error");
      return;
    }

    if (discountType === "percent" && discount > 100) {
      showAppAlert("Invalid discount", "Percentage discount cannot exceed 100%.", "error");
      return;
    }

    const finalAmount =
      discountType === "percent"
        ? baseAmount * (1 - discount / 100)
        : baseAmount - discount;

    if (finalAmount < 0) {
      showAppAlert("Invalid discount", "Discount cannot exceed the fee.", "error");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDueDate)) {
      showAppAlert("Invalid date", "Use YYYY-MM-DD for the due date.", "error");
      return;
    }

    setSaving(true);
    try {
      // Only fee_amount exists in the current schema. Discount and custom
      // due-date persistence require dedicated invoice columns/tables.
      // Save the final adjusted fee amount, but do not claim that the
      // discount breakdown or override date has been persisted.
      const { error } = await supabase
        .from("institute_student_fees")
        .update({ fee_amount: Math.round(finalAmount * 100) / 100 })
        .eq("id", editRow.fee.id)
        .eq("institute_id", instituteId);

      if (error) throw error;

      showAppAlert(
        "Fee amount saved",
        "The final fee amount was saved. The discount breakdown and custom due-date override are not persisted by the current database schema.",
        "success"
      );

      setShowEdit(false);
      await loadFees();
    } catch (error: any) {
      showAppAlert("Unable to save changes", error?.message || "Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const openEditTransaction = (payment: Payment) => {
  if (!canCollect) {
    showAppAlert(
      "View only",
      "Only owners and managers can edit transactions.",
      "warning"
    );
    return;
  }

  setEditingPayment(payment);
  setTransactionAmount(String(payment.amount_paid));
  setTransactionDate(payment.payment_date.slice(0, 10));
  setTransactionMethod(payment.payment_method || "cash");
  setTransactionNotes(payment.notes || "");
  setShowEditTransaction(true);
};

const saveTransactionEdit = async () => {
  if (!editingPayment || !instituteId || !canCollect) return;

  const amount = Number(transactionAmount);
  const date = transactionDate.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    showAppAlert(
      "Invalid amount",
      "Enter a transaction amount greater than zero.",
      "error"
    );
    return;
  }

  // Validate both the date format and the actual calendar date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showAppAlert("Invalid date", "Use YYYY-MM-DD for the payment date.", "error");
    return;
  }

  const parsedDate = new Date(`${date}T00:00:00`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    dateOnly(parsedDate) !== date
  ) {
    showAppAlert("Invalid date", "Enter a real calendar date.", "error");
    return;
  }

  setSaving(true);

  try {
    // Load the current fee amount and other payments for this exact period.
    const { data: feeRecord, error: feeError } = await supabase
      .from("institute_student_fees")
      .select("fee_amount")
      .eq("id", editingPayment.student_fee_id)
      .eq("institute_id", instituteId)
      .maybeSingle();

    if (feeError) throw feeError;
    if (!feeRecord) {
      throw new Error("The fee record could not be found.");
    }

    const { data: otherPayments, error: paymentsError } = await supabase
      .from("institute_fee_payments")
      .select("id, amount_paid")
      .eq("institute_id", instituteId)
      .eq("student_fee_id", editingPayment.student_fee_id)
      .eq("billing_period_start", editingPayment.billing_period_start)
      .eq("billing_period_end", editingPayment.billing_period_end)
      .neq("id", editingPayment.id);

    if (paymentsError) throw paymentsError;

    const paidByOtherTransactions = (otherPayments ?? []).reduce(
      (sum, payment) => sum + Number(payment.amount_paid || 0),
      0
    );

    const feeAmount = Number(feeRecord.fee_amount);
    if (paidByOtherTransactions + amount > feeAmount + 0.009) {
      throw new Error(
        `This amount would exceed the fee of ${money(feeAmount)}. ` +
        `Other transactions total ${money(paidByOtherTransactions)}.`
      );
    }

    const { error: updateError } = await supabase
      .from("institute_fee_payments")
      .update({
        amount_paid: Math.round(amount * 100) / 100,
        payment_date: date,
        payment_method: transactionMethod,
        notes: transactionNotes.trim() || null,
      })
      .eq("id", editingPayment.id)
      .eq("institute_id", instituteId);

    if (updateError) throw updateError;

    setShowEditTransaction(false);
    setEditingPayment(null);

    await loadFees();

    showAppAlert(
      "Transaction updated",
      "The payment transaction was updated successfully.",
      "success"
    );
  } catch (error: any) {
    showAppAlert(
      "Unable to update transaction",
      error?.message || "Please try again.",
      "error"
    );
  } finally {
    setSaving(false);
  }
};

const deleteTransaction = (payment: Payment) => {
  if (!canCollect) {
    showAppAlert(
      "View only",
      "Only owners and managers can delete transactions.",
      "warning"
    );
    return;
  }

  showAppAlert(
    "Delete transaction?",
    `Delete the payment of ${money(Number(payment.amount_paid))}? This action cannot be undone.`,
    "warning",
    {
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      onConfirm: () => {
        void confirmDeleteTransaction(payment);
      },
    }
  );
};

const confirmDeleteTransaction = async (payment: Payment) => {
  if (!canCollect || !instituteId) return;

  setSaving(true);

  try {
    const { error: deleteError } = await supabase
      .from("institute_fee_payments")
      .delete()
      .eq("id", payment.id)
      .eq("institute_id", instituteId);

    if (deleteError) throw deleteError;

    await loadFees();

    showAppAlert(
      "Transaction deleted",
      "The payment was deleted and the fee balance has been recalculated.",
      "success"
    );
  } catch (error: any) {
    showAppAlert(
      "Unable to delete transaction",
      error?.message || "Please try again.",
      "error"
    );
  } finally {
    setSaving(false);
  }
};

  const collectPayment = async () => {
    if (!selected || !instituteId || !canCollect) return;

    const amount = Number(amountText);

    if (!Number.isFinite(amount) || amount <= 0) {
      showAppAlert("Invalid amount", "Enter a valid payment amount.", "error");
      return;
    }

    if (amount > selected.balance + 0.009) {
      showAppAlert(
        "Amount exceeds balance",
        `The remaining balance is ${money(selected.balance)}.`,
        "warning"
      );
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      showAppAlert("Invalid payment date", "Use YYYY-MM-DD.", "error");
      return;
    }

    setSaving(true);

    try {
      const { data: currentPayments, error: readError } = await supabase
        .from("institute_fee_payments")
        .select("amount_paid")
        .eq("institute_id", instituteId)
        .eq("student_fee_id", selected.fee.id)
        .eq("billing_period_start", selected.period.start)
        .eq("billing_period_end", selected.period.end);

      if (readError) throw readError;

      const latestPaid = (currentPayments ?? []).reduce(
        (sum, item) => sum + Number(item.amount_paid || 0),
        0
      );

      const latestBalance = Math.max(
        0,
        Number(selected.fee.fee_amount) - latestPaid
      );

      if (amount > latestBalance + 0.009) {
        throw new Error(
          `Balance changed. Current balance is ${money(latestBalance)}. Refresh and retry.`
        );
      }

      // Allocate the number on the database so concurrent payments cannot collide.
      const { data: generatedReceiptNumber, error: receiptNumberError } =
        await supabase.rpc("next_fee_receipt_number");
      if (receiptNumberError) throw receiptNumberError;
      if (typeof generatedReceiptNumber !== "string" || !generatedReceiptNumber) {
        throw new Error("Could not generate a receipt number. Please try again.");
      }
      const receiptNumber = generatedReceiptNumber;

      const { data: inserted, error: insertError } = await supabase
        .from("institute_fee_payments")
        .insert({
          institute_id: instituteId,
          student_id: selected.student.id,
          student_fee_id: selected.fee.id,
          billing_period_start: selected.period.start,
          billing_period_end: selected.period.end,
          amount_due: Number(selected.fee.fee_amount),
          amount_paid: Math.round(amount * 100) / 100,
          payment_date: paymentDate,
          payment_method: method,
          receipt_number: receiptNumber,
          notes: notes.trim() || null,
        })
        .select(
          "id, institute_id, student_id, student_fee_id, billing_period_start, billing_period_end, amount_due, amount_paid, payment_date, payment_method, receipt_number, notes, created_at"
        )
        .single();

      if (insertError) throw insertError;

      const payment = inserted as Payment;

      const receiptRow: FeeRow = {
        ...selected,
        paid: selected.paid + amount,
        balance: Math.max(0, selected.balance - amount),
        payments: [...selected.payments, payment],
      };

      setLastReceipt({
        student: selected.student,
        row: receiptRow,
        payment,
      });
      setShowPayment(false);
      setShowReceipt(true);
      setSelected(null);

      await loadFees();
    } catch (error: any) {
      console.error("Fee payment error:", error);
      showAppAlert(
        "Payment not saved",
        error?.message || "Unable to record payment.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const openWhatsApp = async (student: Student, message: string) => {
    const phone = (student.phone || "").replace(/[^\d]/g, "");

    if (!phone) {
      showAppAlert("Phone number missing", "Add the student's WhatsApp number first.", "warning");
      return;
    }

    // Indian mobile numbers are stored as 10 digits; add India's country code.
    const internationalPhone =
      phone.length === 10 ? `91${phone}` : phone;

    const url =
      `https://wa.me/${internationalPhone}?text=${encodeURIComponent(message)}`;

    try {
      await Linking.openURL(url);
    } catch {
      showAppAlert("WhatsApp unavailable", "Install WhatsApp or check the phone number.", "error");
    }
  };

  const sendReminder = (row: FeeRow) => {
    const message =
      `Dear Parent,\n\n` +
      `This is a fee reminder from ${instituteName}.\n\n` +
      `Student: ${row.student.full_name}\n` +
      `Roll No.: ${row.student.roll_number}\n` +
      `Fee period: ${row.period.label}\n` +
      `Due date: ${formatDate(row.period.dueDate)}\n` +
      `Total fee: ${money(row.amountDue)}\n` +
      `Paid: ${money(row.paid)}\n` +
      `Outstanding: ${money(row.balance)}\n\n` +
      `Kindly pay the outstanding amount. Thank you.`;

    void openWhatsApp(row.student, message);
  };

  const buildReceiptMessage = () => {
    if (!lastReceipt) return "";
    const { student, row, payment } = lastReceipt;
    return (
      `${instituteName}\n` +
      `FEE PAYMENT RECEIPT\n\n` +
      `Receipt No.: ${payment.receipt_number || "—"}\n` +
      `Student: ${student.full_name}\n` +
      `Roll No.: ${student.roll_number}\n` +
      `Period: ${row.period.label}\n` +
      `Payment date: ${formatDate(payment.payment_date)}\n` +
      `Payment mode: ${payment.payment_method.replace(/_/g, " ")}\n` +
      `Amount received: ${money(Number(payment.amount_paid))}\n` +
      `Total fee: ${money(row.amountDue)}\n` +
      `Balance after payment: ${money(row.balance)}\n\n` +
      `Thank you.`
    );
  };

  const shareReceipt = async () => {
    if (!lastReceipt) return;

    const rawPhone = (lastReceipt.student.phone || "").replace(/[^\\d]/g, "");
    if (!rawPhone) {
      showAppAlert(
        "Phone number missing",
        "Add the student's WhatsApp number before sharing the receipt.",
        "warning"
      );
      return;
    }

    // WhatsApp text sharing works without the react-native-share native module.
    // Expo Go can open WhatsApp using this URL, but cannot attach a captured image
    // through the standard React Native Share API.
    const internationalPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const message = encodeURIComponent(buildReceiptMessage());
    const whatsappUrl = `https://wa.me/${internationalPhone}?text=${message}`;

    try {
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (!canOpen) {
        throw new Error("Unable to open WhatsApp. Please check that it is installed.");
      }
      await Linking.openURL(whatsappUrl);
    } catch (error: any) {
      showAppAlert(
        "Unable to open WhatsApp",
        error?.message || "Please install WhatsApp or use the Share Text option.",
        "error"
      );
    }
  };

  const shareReceiptText = async () => {
    if (!lastReceipt) return;
    try {
      await Share.share({ message: buildReceiptMessage() });
    } catch (error: any) {
      showAppAlert("Unable to share", error?.message || "Try again.", "error");
    }
  };

  const renderSummary = (
    title: string,
    value: string,
    icon: IconName,
    color: string
  ) => (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: `${color}15` }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={styles.summaryLabel}>{title}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );

  const renderFeeRow = ({ item }: { item: FeeRow }) => {
    const color =
      item.status === "Paid"
        ? GREEN
        : item.status === "Unpaid"
          ? RED
          : AMBER;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => openStudent(item.student)}
        style={styles.studentCard}
      >
        <View style={styles.studentTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.student.full_name.trim().charAt(0).toUpperCase() || "S"}
            </Text>
          </View>

          <View style={styles.studentInfo}>
            <Text style={styles.studentName} numberOfLines={1}>
              {item.student.full_name}
            </Text>
            <Text style={styles.studentMeta}>
              Roll No. {item.student.roll_number}
            </Text>
            <Text style={styles.studentMeta}>
              {frequencyLabel(item.fee.fee_frequency)} · Due{" "}
              {formatDate(item.period.dueDate)}
            </Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: `${color}15` }]}>
            <Text style={[styles.statusText, { color }]}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.amountGrid}>
          <View style={styles.amountCell}>
            <Text style={styles.amountLabel}>Fee</Text>
            <Text style={styles.amountValue}>{money(item.amountDue)}</Text>
          </View>
          <View style={styles.amountCell}>
            <Text style={styles.amountLabel}>Paid</Text>
            <Text style={[styles.amountValue, { color: GREEN }]}>
              {money(item.paid)}
            </Text>
          </View>
          <View style={styles.amountCell}>
            <Text style={styles.amountLabel}>Pending</Text>
            <Text style={[styles.amountValue, { color: RED }]}>
              {money(item.balance)}
            </Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.periodPill}>
            <Feather name="calendar" size={13} color={MUTED} />
            <Text style={styles.periodText} numberOfLines={1}>
              {item.period.label}
            </Text>
          </View>

          {item.balance > 0 && canCollect ? (
            <TouchableOpacity
              style={styles.collectButton}
              onPress={() => openPayment(item)}
            >
              <Feather name="plus-circle" size={15} color={WHITE} />
              <Text style={styles.collectButtonText}>Collect</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.paidLabel}>
              <Feather
                name={item.balance <= 0 ? "check-circle" : "clock"}
                size={15}
                color={item.balance <= 0 ? GREEN : MUTED}
              />
              <Text style={styles.paidLabelText}>
                {item.balance <= 0 ? "Fully paid" : "Upcoming"}
              </Text>
            </View>
          )}
        </View>

        {item.balance > 0 && item.student.phone ? (
          <TouchableOpacity
            style={styles.reminderButton}
            onPress={() => sendReminder(item)}
          >
            <Feather name="message-circle" size={16} color={GREEN} />
            <Text style={styles.reminderButtonText}>Send WhatsApp reminder</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderHistory = ({ item }: { item: Payment }) => {
    const student = students.find((s) => s.id === item.student_id);

    return (
      <View style={styles.historyCard}>
        <View style={styles.historyIcon}>
          <Feather name="check" size={18} color={GREEN} />
        </View>
        <View style={styles.historyInfo}>
          <Text style={styles.studentName} numberOfLines={1}>
            {student?.full_name ?? "Student"}
          </Text>
          <Text style={styles.studentMeta}>
            {formatDate(item.payment_date)} · {item.payment_method.replace(/_/g, " ")}
          </Text>
          <Text style={styles.receiptText}>
            Receipt: {item.receipt_number || item.id.slice(0, 8).toUpperCase()}
          </Text>
          <Text style={styles.studentMeta}>
            Period: {formatDate(item.billing_period_start)} –{" "}
            {formatDate(item.billing_period_end)}
          </Text>
        </View>
        <View style={styles.historyRight}>
  <Text style={styles.historyAmount}>
    +{money(Number(item.amount_paid))}
  </Text>

  {canCollect && (
    <View style={styles.transactionActions}>
      <TouchableOpacity
        style={styles.transactionEditButton}
        onPress={() => openEditTransaction(item)}
        disabled={saving}
      >
        <Feather name="edit-2" size={13} color={NAVY} />
        <Text style={styles.transactionEditText}>Edit</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.transactionDeleteButton}
        onPress={() => deleteTransaction(item)}
        disabled={saving}
      >
        <Feather name="trash-2" size={13} color={RED} />
        <Text style={styles.transactionDeleteText}>Delete</Text>
      </TouchableOpacity>
    </View>
  )}
</View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <InstituteHeader subtitle="Fees & payments" />

      <View style={styles.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Fees Management</Text>
          <Text style={styles.pageSubtitle}>
            Manage student fees, dues and payments
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
          <Feather name="refresh-cw" size={18} color={NAVY} />
        </TouchableOpacity>
      </View>

      {!!errorMessage && (
        <TouchableOpacity
          style={styles.errorBanner}
          onPress={() => setErrorMessage("")}
        >
          <Feather name="alert-circle" size={17} color={RED} />
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Feather name="x" size={16} color={RED} />
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <View style={styles.summaryGrid}>
          {renderSummary("Total fees", money(totals.due), "file-text", NAVY)}
          {renderSummary("Collected", money(totals.paid), "check-circle", GREEN)}
          {renderSummary("Pending", money(totals.pending), "clock", AMBER)}
          {renderSummary("Overdue", money(totals.overdue), "alert-circle", RED)}
        </View>

        <View style={styles.tabRow}>
          {(["Dues", "History"] as const).map((value) => (
            <TouchableOpacity
              key={value}
              style={[styles.tab, activeTab === value && styles.activeTab]}
              onPress={() => setActiveTab(value)}
            >
              <Feather
                name={value === "Dues" ? "users" : "clock"}
                size={16}
                color={activeTab === value ? GOLD : MUTED}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === value && styles.activeTabText,
                ]}
              >
                {value === "Dues" ? "Student fees" : "Payment history"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === "Dues" ? (
          <>
            <View style={styles.searchBox}>
              <Feather name="search" size={18} color={MUTED} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search student or roll number"
                placeholderTextColor={MUTED}
                style={styles.searchInput}
                returnKeyType="search"
              />
              {!!search && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Feather name="x-circle" size={18} color={MUTED} />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.filterLabel}>CLASS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  classFilter === "All" && styles.filterChipActive,
                ]}
                onPress={() => setClassFilter("All")}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    classFilter === "All" && styles.filterChipTextActive,
                  ]}
                >
                  All classes
                </Text>
              </TouchableOpacity>

              {classOptions.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.filterChip,
                    classFilter === item.id && styles.filterChipActive,
                  ]}
                  onPress={() => setClassFilter(item.id)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      classFilter === item.id && styles.filterChipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.filterLabel}>PAYMENT STATUS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {(["All", "Paid", "Unpaid", "Upcoming"] as const).map((value) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setStatusFilter(value)}
                  style={[
                    styles.filterChip,
                    statusFilter === value && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      statusFilter === value && styles.filterChipTextActive,
                    ]}
                  >
                    {value}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.listHeadingRow}>
              <Text style={styles.sectionHeading}>Student fee records</Text>
              <Text style={styles.countText}>{filteredRows.length} records</Text>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={NAVY} />
                <Text style={styles.emptyText}>Loading fees…</Text>
              </View>
            ) : filteredRows.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="file-text" size={34} color={MUTED} />
                <Text style={styles.emptyTitle}>No fee records found</Text>
                <Text style={styles.emptyText}>
                  Add a fee setting for a student, or change your filters.
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredRows}
                keyExtractor={(item, index) =>
                  `${item.fee.id}-${item.period.start}-${index}`
                }
                renderItem={renderFeeRow}
                scrollEnabled={false}
              />
            )}
          </>
        ) : (
          <>
            <Text style={styles.sectionHeading}>
              Recorded payments ({history.length})
            </Text>
            {loading ? (
              <ActivityIndicator size="large" color={NAVY} />
            ) : history.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="clock" size={34} color={MUTED} />
                <Text style={styles.emptyTitle}>No payments yet</Text>
                <Text style={styles.emptyText}>
                  Collected payments will appear here.
                </Text>
              </View>
            ) : (
              <FlatList
                data={history}
                keyExtractor={(item) => item.id}
                renderItem={renderHistory}
                scrollEnabled={false}
              />
            )}
          </>
        )}

        <Text style={styles.footer}>
          GyanDeep Academy · Learn Today, Lead Tomorrow
        </Text>
      </ScrollView>

      <FloatingTabBar />

      {/* Student details bottom sheet */}
      <Modal
        visible={showStudentSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStudentSheet(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.backdropTouch}
            activeOpacity={1}
            onPress={() => setShowStudentSheet(false)}
          />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {selectedStudent?.full_name.charAt(0).toUpperCase() || "S"}
                </Text>
              </View>
              <View style={styles.studentInfo}>
                <Text style={styles.modalTitle}>{selectedStudent?.full_name}</Text>
                <Text style={styles.modalSubtitle}>
                  Roll No. {selectedStudent?.roll_number}
                </Text>
                <Text style={styles.studentMeta}>
                  {selectedStudent?.father_name || "Parent name not added"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowStudentSheet(false)}
              >
                <Feather name="x" size={20} color={NAVY} />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetActions}>
              {canCollect && (
                <TouchableOpacity
                  style={styles.primaryAction}
                  onPress={() => {
                    const row = studentPeriods.find((r) => r.balance > 0);
                    if (row) openPayment(row);
                    else showAppAlert("No outstanding fees", "This student has no balance to collect.", "info");
                  }}
                >
                  <Feather name="check-circle" size={16} color={WHITE} />
                  <Text style={styles.primaryActionText}>Collect money</Text>
                </TouchableOpacity>
              )}

              {studentPeriods[0] && canCollect && (
                <TouchableOpacity
                  style={styles.secondaryAction}
                  onPress={() => openEdit(studentPeriods[0])}
                >
                  <Feather name="edit-3" size={16} color={NAVY} />
                  <Text style={styles.secondaryActionText}>Edit fee</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.sectionHeading}>Month-wise fee status</Text>
            <ScrollView
              style={{ maxHeight: 330 }}
              showsVerticalScrollIndicator={false}
            >
              {studentPeriods.map((row) => {
                const color =
                  row.status === "Paid"
                    ? GREEN
                    : row.status === "Unpaid"
                      ? RED
                      : AMBER;

                return (
                  <View key={`${row.fee.id}-${row.period.start}`} style={styles.periodCard}>
                    <View style={styles.periodHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentName}>{row.period.label}</Text>
                        <Text style={styles.studentMeta}>
                          Due {formatDate(row.period.dueDate)}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: `${color}15` }]}>
                        <Text style={[styles.statusText, { color }]}>{row.status}</Text>
                      </View>
                    </View>

                    <View style={styles.periodAmounts}>
                      <Text style={styles.studentMeta}>
                        Fee {money(row.amountDue)}
                      </Text>
                      <Text style={[styles.studentMeta, { color: GREEN }]}>
                        Paid {money(row.paid)}
                      </Text>
                      <Text style={[styles.studentMeta, { color: RED }]}>
                        Due {money(row.balance)}
                      </Text>
                    </View>

                    {row.balance > 0 && canCollect && (
                      <View style={styles.periodActions}>
                        <TouchableOpacity
                          style={styles.smallPrimaryButton}
                          onPress={() => openPayment(row)}
                        >
                          <Text style={styles.smallPrimaryText}>Mark as paid / collect</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.smallSecondaryButton}
                          onPress={() => sendReminder(row)}
                        >
                          <Feather name="message-circle" size={14} color={GREEN} />
                          <Text style={styles.smallSecondaryText}>Remind</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Payment entry */}
      <Modal
        visible={showPayment}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setShowPayment(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.backdropTouch}
            activeOpacity={1}
            onPress={() => !saving && setShowPayment(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.sheetKeyboard}
          >
            <View style={styles.sheetCard}>
              <View style={styles.sheetHandle} />
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Collect payment</Text>
                  <Text style={styles.modalSubtitle}>
                    {selected?.student.full_name}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalClose}
                  onPress={() => setShowPayment(false)}
                  disabled={saving}
                >
                  <Feather name="x" size={20} color={NAVY} />
                </TouchableOpacity>
              </View>

              {selected && (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.paymentBreakdown}>
                    <PaymentLine label="Billing period" value={selected.period.label} />
                    <PaymentLine label="Due date" value={formatDate(selected.period.dueDate)} />
                    <PaymentLine label="Total fee" value={money(selected.amountDue)} />
                    <PaymentLine label="Already paid" value={money(selected.paid)} />
                    <View style={styles.paymentDivider} />
                    <PaymentLine label="Remaining balance" value={money(selected.balance)} bold />
                  </View>

                  <Text style={styles.inputLabel}>Payment amount (₹)</Text>
                  <TextInput
                    value={amountText}
                    onChangeText={setAmountText}
                    keyboardType="decimal-pad"
                    placeholder="Enter amount"
                    placeholderTextColor={MUTED}
                    style={styles.amountInput}
                    editable={!saving}
                  />

                  <Text style={styles.inputLabel}>Payment date (YYYY-MM-DD)</Text>
                  <TextInput
                    value={paymentDate}
                    onChangeText={setPaymentDate}
                    placeholder="2026-10-24"
                    placeholderTextColor={MUTED}
                    style={styles.amountInput}
                    editable={!saving}
                  />

                  <Text style={styles.inputLabel}>Payment method</Text>
                  <View style={styles.methodRow}>
                    {[
                      { label: "Cash", value: "cash", icon: "credit-card" as IconName },
                      { label: "UPI", value: "upi", icon: "smartphone" as IconName },
                      { label: "Bank", value: "bank_transfer", icon: "briefcase" as IconName },
                    ].map((item) => (
                      <TouchableOpacity
                        key={item.value}
                        style={[
                          styles.methodButton,
                          method === item.value && styles.methodButtonActive,
                        ]}
                        onPress={() => setMethod(item.value)}
                        disabled={saving}
                      >
                        <Feather
                          name={item.icon}
                          size={17}
                          color={method === item.value ? GOLD : NAVY}
                        />
                        <Text
                          style={[
                            styles.methodText,
                            method === item.value && styles.methodTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Note (optional)</Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Transaction reference or remarks"
                    placeholderTextColor={MUTED}
                    style={[styles.amountInput, styles.notesInput]}
                    multiline
                    editable={!saving}
                  />

                  <TouchableOpacity
                    style={[styles.submitButton, saving && { opacity: 0.6 }]}
                    onPress={collectPayment}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color={WHITE} />
                    ) : (
                      <>
                        <Feather name="check-circle" size={18} color={GOLD} />
                        <Text style={styles.submitButtonText}>Confirm payment</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>


      {/* Edit transaction */}
<Modal
  visible={showEditTransaction}
  transparent
  animationType="slide"
  onRequestClose={() => !saving && setShowEditTransaction(false)}
>
  <View style={styles.modalBackdrop}>
    <TouchableOpacity
      style={styles.backdropTouch}
      activeOpacity={1}
      onPress={() => !saving && setShowEditTransaction(false)}
    />

    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.sheetKeyboard}
    >
      <View style={styles.sheetCard}>
        <View style={styles.sheetHandle} />

        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>Edit transaction</Text>
            <Text style={styles.modalSubtitle}>
              Receipt: {editingPayment?.receipt_number || "—"}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setShowEditTransaction(false)}
            disabled={saving}
          >
            <Feather name="x" size={20} color={NAVY} />
          </TouchableOpacity>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.inputLabel}>Payment amount (₹)</Text>
          <TextInput
            value={transactionAmount}
            onChangeText={setTransactionAmount}
            keyboardType="decimal-pad"
            style={styles.amountInput}
            placeholder="Enter amount"
            placeholderTextColor={MUTED}
            editable={!saving}
          />

          <Text style={styles.inputLabel}>Payment date (YYYY-MM-DD)</Text>
          <TextInput
            value={transactionDate}
            onChangeText={setTransactionDate}
            style={styles.amountInput}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={MUTED}
            editable={!saving}
          />

          <Text style={styles.inputLabel}>Payment method</Text>
          <View style={styles.methodRow}>
            {[
              { label: "Cash", value: "cash", icon: "credit-card" as IconName },
              { label: "UPI", value: "upi", icon: "smartphone" as IconName },
              {
                label: "Bank",
                value: "bank_transfer",
                icon: "briefcase" as IconName,
              },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.methodButton,
                  transactionMethod === option.value &&
                    styles.methodButtonActive,
                ]}
                onPress={() => setTransactionMethod(option.value)}
                disabled={saving}
              >
                <Feather
                  name={option.icon}
                  size={16}
                  color={transactionMethod === option.value ? GOLD : NAVY}
                />
                <Text
                  style={[
                    styles.methodText,
                    transactionMethod === option.value &&
                      styles.methodTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>Note (optional)</Text>
          <TextInput
            value={transactionNotes}
            onChangeText={setTransactionNotes}
            style={[styles.amountInput, styles.notesInput]}
            placeholder="Transaction reference or remarks"
            placeholderTextColor={MUTED}
            multiline
            editable={!saving}
          />

          <TouchableOpacity
            style={[styles.submitButton, saving && { opacity: 0.6 }]}
            onPress={saveTransactionEdit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <>
                <Feather name="save" size={18} color={GOLD} />
                <Text style={styles.submitButtonText}>
                  Save transaction
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </View>
</Modal>

      {/* Fee editing */}
      <Modal
        visible={showEdit}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setShowEdit(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.backdropTouch}
            activeOpacity={1}
            onPress={() => !saving && setShowEdit(false)}
          />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Edit fee details</Text>
                <Text style={styles.modalSubtitle}>
                  {editRow?.student.full_name}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowEdit(false)}
                disabled={saving}
              >
                <Feather name="x" size={20} color={NAVY} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Base fee amount (₹)</Text>
              <TextInput
                value={editAmount}
                onChangeText={(value) => {
                  setEditAmount(value);
                  setEditDirty(true);
                }}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                placeholder="Enter fee amount"
                placeholderTextColor={MUTED}
              />

              <Text style={styles.inputLabel}>Discount type</Text>
              <View style={styles.methodRow}>
                {([
                  { label: "Fixed ₹", value: "amount" as const },
                  { label: "Percent %", value: "percent" as const },
                ]).map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={[
                      styles.methodButton,
                      discountType === item.value && styles.methodButtonActive,
                    ]}
                    onPress={() => {
                      setDiscountType(item.value);
                      setEditDirty(true);
                    }}
                  >
                    <Text
                      style={[
                        styles.methodText,
                        discountType === item.value && styles.methodTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Discount</Text>
              <TextInput
                value={discountText}
                onChangeText={(value) => {
                  setDiscountText(value);
                  setEditDirty(true);
                }}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={MUTED}
              />

              <Text style={styles.inputLabel}>Due date (YYYY-MM-DD)</Text>
              <TextInput
                value={editDueDate}
                onChangeText={(value) => {
                  setEditDueDate(value);
                  setEditDirty(true);
                }}
                style={styles.amountInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={MUTED}
              />

              <View style={styles.paymentBreakdown}>
                <PaymentLine
                  label="Base fee"
                  value={money(Number(editAmount) || 0)}
                />
                <PaymentLine
                  label="Discount"
                  value={money(
                    discountType === "percent"
                      ? (Number(editAmount) || 0) * (Number(discountText) || 0) / 100
                      : Number(discountText) || 0
                  )}
                />
                <View style={styles.paymentDivider} />
                <PaymentLine
                  label="Final fee"
                  value={money(
                    Math.max(
                      0,
                      (Number(editAmount) || 0) -
                        (discountType === "percent"
                          ? (Number(editAmount) || 0) * (Number(discountText) || 0) / 100
                          : Number(discountText) || 0)
                    )
                  )}
                  bold
                />
              </View>

              <Text style={styles.noticeText}>
                The current database stores the final fee amount only. A
                discount breakdown and custom due-date override require
                additional database columns before they can be saved separately.
              </Text>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!editDirty || saving) && { opacity: 0.45 },
                ]}
                disabled={!editDirty || saving}
                onPress={saveEdit}
              >
                {saving ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <>
                    <Feather name="save" size={18} color={GOLD} />
                    <Text style={styles.submitButtonText}>Save changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Receipt preview */}
      <Modal
        visible={showReceipt}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReceipt(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.backdropTouch}
            activeOpacity={1}
            onPress={() => setShowReceipt(false)}
          />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <View style={styles.receiptImageViewport}>
            <ViewShot ref={receiptViewRef} style={styles.receiptShot} options={{ format: "png", quality: 1 }}>
            <View style={styles.receiptCard}>
              <View style={styles.receiptBrand}>
                <View style={styles.receiptLogo}>
                  {instituteLogoUrl ? (
                    <Image source={{ uri: instituteLogoUrl }} style={styles.receiptLogoImage} resizeMode="contain" />
                  ) : (
                    <Feather name="book-open" size={24} color={GOLD} />
                  )}
                </View>
                <Text style={styles.receiptInstitute}>{instituteName}</Text>
                <Text style={styles.receiptSubtitle}>FEE PAYMENT RECEIPT</Text>
              </View>

              {lastReceipt && (
                <>
                  <View style={styles.receiptSuccess}>
                    <Feather name="check-circle" size={28} color={GREEN} />
                    <Text style={styles.receiptSuccessText}>Payment recorded</Text>
                  </View>

                  <View style={styles.receiptAmountBox}>
                    <Text style={styles.receiptAmountLabel}>Amount received</Text>
                    <Text style={styles.receiptAmount}>
                      {money(Number(lastReceipt.payment.amount_paid))}
                    </Text>
                  </View>

                  <ReceiptLine
                    label="Receipt number"
                    value={lastReceipt.payment.receipt_number || "—"}
                  />
                  <ReceiptLine
                    label="Student"
                    value={lastReceipt.student.full_name}
                  />
                  <ReceiptLine
                    label="Roll number"
                    value={lastReceipt.student.roll_number}
                  />
                  <ReceiptLine
                    label="Fee period"
                    value={lastReceipt.row.period.label}
                  />
                  <ReceiptLine
                    label="Payment date"
                    value={formatDate(lastReceipt.payment.payment_date)}
                  />
                  <ReceiptLine
                    label="Payment mode"
                    value={lastReceipt.payment.payment_method.replace(/_/g, " ")}
                  />
                  <ReceiptLine
                    label="Total fee"
                    value={money(lastReceipt.row.amountDue)}
                  />
                  <ReceiptLine
                    label="Remaining balance"
                    value={money(lastReceipt.row.balance)}
                  />
                </>
              )}
            </View>
            </ViewShot>
            </View>

            <View style={styles.receiptActions}>
              <TouchableOpacity
                style={styles.primaryAction}
                onPress={shareReceipt}
              >
                <Feather name="message-circle" size={16} color={WHITE} />
                <Text style={styles.primaryActionText}>Share receipt on WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={shareReceiptText}
              >
                <Feather name="share-2" size={16} color={NAVY} />
                <Text style={styles.secondaryActionText}>Share receipt</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.noticeText}>
              Opens WhatsApp with the receipt details as a pre-filled message. Image attachment is not supported by this Expo Go-compatible option.
            </Text>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={() => setShowReceipt(false)}
            >
              <Text style={styles.submitButtonText}>Done</Text>
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
        onCancel={closeAppAlert}
      />
    </View>
  );
}

function PaymentLine({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.paymentLine}>
      <Text style={[styles.paymentLineLabel, bold && styles.boldText]}>
        {label}
      </Text>
      <Text style={[styles.paymentLineValue, bold && styles.boldText]}>
        {value}
      </Text>
    </View>
  );
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.receiptLine}>
      <Text style={styles.receiptLineLabel}>{label}</Text>
      <Text style={styles.receiptLineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 125 },

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },
  pageTitle: { fontSize: 23, fontWeight: "800", color: NAVY },
  pageSubtitle: { fontSize: 12, color: MUTED, marginTop: 4 },
  refreshButton: {
    width: 42,
    height: 42,
    backgroundColor: WHITE,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF0F0",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
  },
  errorText: { color: RED, fontSize: 12, flex: 1 },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },
  summaryCard: {
    width: "48%",
    flexGrow: 1,
    minHeight: 112,
    backgroundColor: WHITE,
    padding: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  summaryLabel: { color: MUTED, fontSize: 11, fontWeight: "600" },
  summaryValue: { color: NAVY, fontSize: 19, fontWeight: "800", marginTop: 4 },

  tabRow: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 15,
    backgroundColor: "#E6EBF3",
    marginBottom: 15,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 12,
  },
  activeTab: { backgroundColor: NAVY },
  tabText: { color: MUTED, fontSize: 12, fontWeight: "700" },
  activeTabText: { color: WHITE },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: WHITE,
    borderRadius: 14,
    paddingHorizontal: 13,
    height: 48,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  searchInput: { flex: 1, color: NAVY, fontSize: 13 },

  filterLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: MUTED,
    marginBottom: 8,
    marginTop: 2,
  },
  filterRow: { gap: 8, paddingBottom: 15 },
  filterChip: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  filterChipActive: { backgroundColor: NAVY, borderColor: NAVY },
  filterChipText: { color: MUTED, fontSize: 12, fontWeight: "700" },
  filterChipTextActive: { color: GOLD },

  listHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "800",
    color: NAVY,
    marginTop: 3,
    marginBottom: 12,
  },
  countText: { color: MUTED, fontSize: 11 },

  studentCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
    elevation: 2,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 7,
  },
  studentTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#E9EEF8",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: NAVY, fontSize: 18, fontWeight: "800" },
  studentInfo: { flex: 1, minWidth: 0 },
  studentName: { fontSize: 14, fontWeight: "800", color: NAVY },
  studentMeta: { fontSize: 11, color: MUTED, marginTop: 4 },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusText: { fontSize: 10, fontWeight: "800" },

  amountGrid: {
    flexDirection: "row",
    marginTop: 16,
    marginBottom: 13,
    paddingVertical: 12,
    backgroundColor: "#F7F9FC",
    borderRadius: 13,
  },
  amountCell: { flex: 1, alignItems: "center" },
  amountLabel: { color: MUTED, fontSize: 10, marginBottom: 5 },
  amountValue: { color: NAVY, fontSize: 13, fontWeight: "800" },

  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  periodPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  periodText: { color: MUTED, fontSize: 10, flexShrink: 1 },
  collectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: NAVY,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  collectButtonText: { color: WHITE, fontSize: 11, fontWeight: "800" },
  paidLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  paidLabelText: { color: GREEN, fontSize: 11, fontWeight: "700" },

  reminderButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CFE9D9",
    backgroundColor: "#F1FAF5",
    marginTop: 12,
  },
  reminderButtonText: { color: GREEN, fontSize: 12, fontWeight: "800" },

  historyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 14,
    borderRadius: 17,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  historyIcon: {
    width: 37,
    height: 37,
    borderRadius: 13,
    backgroundColor: "#E8F7EE",
    alignItems: "center",
    justifyContent: "center",
  },
  historyInfo: { flex: 1, minWidth: 0 },
  historyRight: {
    alignItems: "flex-end",
    gap: 10,
    maxWidth: 130,
  },
  historyAmount: { color: GREEN, fontSize: 13, fontWeight: "800" },
  transactionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
  },
  transactionEditButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#EEF3FC",
  },
  transactionEditText: { color: NAVY, fontSize: 10, fontWeight: "800" },
  transactionDeleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#FFF0F0",
  },
  transactionDeleteText: { color: RED, fontSize: 10, fontWeight: "800" },
  receiptText: { color: NAVY, fontSize: 10, marginTop: 5, fontWeight: "700" },

  loadingBox: { alignItems: "center", paddingVertical: 45 },
  emptyCard: {
    alignItems: "center",
    backgroundColor: WHITE,
    borderRadius: 18,
    padding: 28,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyTitle: { color: NAVY, fontSize: 15, fontWeight: "800", marginTop: 13 },
  emptyText: {
    color: MUTED,
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  footer: {
    textAlign: "center",
    color: MUTED,
    fontSize: 10,
    marginTop: 22,
    marginBottom: 15,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(9,22,43,0.48)",
    justifyContent: "flex-end",
  },
  backdropTouch: { ...StyleSheet.absoluteFillObject },
  sheetKeyboard: { justifyContent: "flex-end" },
  sheetCard: {
    backgroundColor: BG,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 32 : 22,
    maxHeight: "92%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 5,
    backgroundColor: "#CBD3E0",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 16,
  },
  modalTitle: { color: NAVY, fontSize: 19, fontWeight: "800" },
  modalSubtitle: { color: MUTED, fontSize: 12, marginTop: 4 },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9EDF4",
  },

  sheetActions: { flexDirection: "row", gap: 9, marginBottom: 20 },
  primaryAction: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: NAVY,
  },
  primaryActionText: { color: WHITE, fontSize: 12, fontWeight: "800" },
  secondaryAction: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryActionText: { color: NAVY, fontSize: 12, fontWeight: "800" },

  periodCard: {
    backgroundColor: WHITE,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 13,
    marginBottom: 10,
  },
  periodHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  periodAmounts: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 13,
  },
  periodActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  smallPrimaryButton: {
    flex: 1,
    backgroundColor: NAVY,
    padding: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  smallPrimaryText: { color: WHITE, fontSize: 10, fontWeight: "800" },
  smallSecondaryButton: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#EFF9F3",
  },
  smallSecondaryText: { color: GREEN, fontSize: 10, fontWeight: "800" },

  paymentBreakdown: {
    backgroundColor: WHITE,
    padding: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  paymentLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 6,
  },
  paymentLineLabel: { color: MUTED, fontSize: 12, flex: 1 },
  paymentLineValue: {
    color: NAVY,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    flexShrink: 1,
  },
  paymentDivider: { height: 1, backgroundColor: BORDER, marginVertical: 5 },
  boldText: { color: NAVY, fontWeight: "900" },

  inputLabel: {
    color: NAVY,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
    marginTop: 4,
  },
  amountInput: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    minHeight: 47,
    paddingHorizontal: 13,
    color: NAVY,
    fontSize: 14,
    marginBottom: 15,
  },
  notesInput: { minHeight: 75, paddingTop: 12, textAlignVertical: "top" },
  methodRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  methodButton: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingVertical: 12,
  },
  methodButtonActive: { backgroundColor: NAVY, borderColor: NAVY },
  methodText: { color: NAVY, fontSize: 11, fontWeight: "800" },
  methodTextActive: { color: GOLD },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: NAVY,
    borderRadius: 14,
    minHeight: 50,
    marginTop: 8,
    marginBottom: 15,
  },
  submitButtonText: { color: WHITE, fontSize: 13, fontWeight: "800" },

  noticeText: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 8,
  },

  receiptImageViewport: { backgroundColor: WHITE, borderRadius: 18, overflow: "hidden" },
  receiptShot: { backgroundColor: WHITE },
  receiptLogoImage: { width: 48, height: 48, borderRadius: 12 },
  receiptCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: BORDER,
  },
  receiptBrand: { alignItems: "center", paddingBottom: 15 },
  receiptLogo: {
    width: 48,
    height: 48,
    backgroundColor: NAVY,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  receiptInstitute: { color: NAVY, fontSize: 19, fontWeight: "900" },
  receiptSubtitle: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 5,
  },
  receiptSuccess: {
    alignItems: "center",
    padding: 12,
    backgroundColor: "#F0FAF4",
    borderRadius: 12,
    marginBottom: 12,
  },
  receiptSuccessText: { color: GREEN, fontSize: 12, fontWeight: "800", marginTop: 5 },
  receiptAmountBox: {
    backgroundColor: NAVY,
    alignItems: "center",
    borderRadius: 14,
    padding: 15,
    marginBottom: 14,
  },
  receiptAmountLabel: { color: "#D6DEEB", fontSize: 11 },
  receiptAmount: { color: GOLD, fontSize: 27, fontWeight: "900", marginTop: 4 },
  receiptLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F5",
  },
  receiptLineLabel: { color: MUTED, fontSize: 11, flex: 1 },
  receiptLineValue: {
    color: NAVY,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
    flex: 1,
  },
  receiptActions: { flexDirection: "row", gap: 9, marginTop: 13 },
});
