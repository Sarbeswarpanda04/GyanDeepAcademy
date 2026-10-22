
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../../lib/supabase";
import AppAlert, { AppAlertType } from "../../components/AppAlert";

const NAVY = "#202F42";
const BG = "#F1F5F8";
const MUTED = "#58718A";
const BORDER = "#E1E8EF";
const WHITE = "#FFFFFF";

type SalaryType = "monthly" | "daily" | "batch";
type AttendanceStatus = "absent" | "holiday" | "present";
type Session = "morning" | "evening" | "batch";

type Staff = {
  id: string;
  institute_id: string;
  full_name: string;
  phone: string | null;
  photo_path: string | null;
  staff_type: string;
  salary_type: SalaryType;
  salary_amount: number;
  date_of_birth: string | null;
  weekly_holidays: string[] | null;
  status: string;
};

type AttendanceRow = {
  id?: string;
  staff_id: string;
  institute_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  sessions: Session[] | null;
  wage_amount: number;
  note?: string | null;
};

type Payout = {
  id: string;
  amount: number;
  paid_date: string;
  period_start: string;
  period_end: string;
  note: string | null;
  payment_method?: "cash" | "upi" | "bank" | null;
};

const money = (amount: number) =>
  `₹${Number(amount || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const monthLabel = (date: Date) =>
  date.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

const prettyDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const titleCase = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : "";

const STATUS: Record<
  "absent" | "holiday",
  { label: string; color: string; bg: string; border: string }
> = {
  absent: {
    label: "Absent",
    color: "#C62828",
    bg: "#FDE9E9",
    border: "#D92D2D",
  },
  holiday: {
    label: "Holiday",
    color: "#A96C13",
    bg: "#FFF3D9",
    border: "#D6A62C",
  },
};

const SESSION_THEME: Record<
  Session,
  { label: string; color: string; bg: string; border: string }
> = {
  morning: {
    label: "Morning",
    color: "#247A3C",
    bg: "#E5F6E9",
    border: "#43A35B",
  },
  evening: {
    label: "Evening",
    color: "#2456A6",
    bg: "#E6EEFF",
    border: "#4778D0",
  },
  batch: {
    label: "Batch",
    color: "#7046A8",
    bg: "#F0E8FF",
    border: "#8B65C7",
  },
};

export default function TeacherDetailsScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const staffId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [staff, setStaff] = useState<Staff | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<
    Record<string, AttendanceRow>
  >({});
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [yearPicker, setYearPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoCalculate, setAutoCalculate] = useState(true);
  const [manualAmount, setManualAmount] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [statusChoice, setStatusChoice] = useState<
    "absent" | "holiday" | null
  >(null);
  const [sessionChoices, setSessionChoices] = useState<Session[]>([]);
  const [attendanceSheet, setAttendanceSheet] = useState(false);
  const [deleteSheet, setDeleteSheet] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);

  const [alert, setAlert] = useState<{
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

  const showAlert = (
    title: string,
    message: string,
    type: AppAlertType = "info",
    onConfirm?: () => void
  ) => {
    setAlert({
      visible: true,
      title,
      message,
      type,
      onConfirm,
    });
  };

  const closeAlert = () => {
    setAlert((current) => ({
      ...current,
      visible: false,
      onConfirm: undefined,
    }));
  };

  const load = useCallback(async () => {
    if (!staffId) {
      setLoading(false);
      return;
    }

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again.");

      const { data: memberships, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id,role")
        .eq("user_id", user.id);

      if (membershipError) throw membershipError;
      if (!memberships?.length) {
        throw new Error("Your account is not linked to an institute.");
      }

      const membership = memberships[0];

      const { data: person, error: staffError } = await supabase
        .from("institute_staff")
        .select(
          "id,institute_id,full_name,phone,photo_path,staff_type,salary_type,salary_amount,date_of_birth,weekly_holidays,status"
        )
        .eq("id", staffId)
        .eq("institute_id", membership.institute_id)
        .single();

      if (staffError) throw staffError;

      setStaff(person as Staff);

      if (person.photo_path) {
        const { data: signed, error: photoError } = await supabase.storage
          .from("staff-photos")
          .createSignedUrl(person.photo_path, 3600);

        if (photoError) {
          console.warn("Teacher photo could not be loaded:", photoError.message);
        }

        setPhotoUrl(signed?.signedUrl ?? null);
      } else {
        setPhotoUrl(null);
      }

      const start = iso(
        new Date(month.getFullYear(), month.getMonth(), 1)
      );
      const end = iso(
        new Date(month.getFullYear(), month.getMonth() + 1, 0)
      );

      const { data: attendanceRows, error: attendanceError } = await supabase
        .from("staff_attendance")
        .select(
          "id,staff_id,institute_id,attendance_date,status,sessions,wage_amount,note"
        )
        .eq("staff_id", staffId)
        .eq("institute_id", membership.institute_id)
        .gte("attendance_date", start)
        .lte("attendance_date", end);

      if (attendanceError) throw attendanceError;

      const mapped: Record<string, AttendanceRow> = {};

      (attendanceRows ?? []).forEach((row: AttendanceRow) => {
        mapped[row.attendance_date] = {
          ...row,
          sessions: row.sessions ?? [],
        };
      });

      setAttendance(mapped);

      const { data: payoutRows, error: payoutError } = await supabase
        .from("staff_payouts")
        .select("id,amount,paid_date,period_start,period_end,note,payment_method")
        .eq("staff_id", staffId)
        .eq("institute_id", membership.institute_id)
        .order("paid_date", { ascending: false })
        .limit(20);

      if (payoutError) throw payoutError;

      setPayouts((payoutRows ?? []) as Payout[]);
    } catch (error: any) {
      showAlert(
        "Unable to load teacher",
        error?.message ?? "Please try again.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [staffId, month]);

  useFocusEffect(
    useCallback(() => {
      // Keep the teacher profile mounted while changing month/year.
      // Only the attendance and payout queries are refreshed by load().
      if (!staff) setLoading(true);
      void load();
    }, [load, staff])
  );

  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();

  const offset =
    (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;

  const dates = useMemo(
    () =>
      Array.from(
        { length: offset + daysInMonth },
        (_, index) => (index < offset ? null : index - offset + 1)
      ),
    [offset, daysInMonth]
  );

  const isWeeklyHoliday = (date: Date) =>
    (staff?.weekly_holidays ?? []).some(
      (day) =>
        day.toLowerCase() ===
        ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()]
    );

  const monthRows = Object.values(attendance);

  const presentCount = monthRows.filter(
    (row) => row.status === "present" && (row.sessions ?? []).length > 0
  ).length;

  const absentCount = monthRows.filter(
    (row) => row.status === "absent"
  ).length;

  const holidayCount = monthRows.filter(
    (row) => row.status === "holiday"
  ).length;

  const paidDays = monthRows.filter(
    (row) => row.status === "present" && (row.sessions ?? []).length > 0
  ).length;

  const calculatedAmount = useMemo(() => {
    if (!staff) return 0;

    return monthRows.reduce((total, row) => {
      const sessions = row.sessions ?? [];

      if (row.status !== "present" || sessions.length === 0) {
        return total;
      }

      if (staff.salary_type === "batch") {
        return total + sessions.length * Number(staff.salary_amount);
      }

      if (staff.salary_type === "daily") {
        return total + Number(staff.salary_amount);
      }

      return (
        total +
        (daysInMonth ? Number(staff.salary_amount) / daysInMonth : 0)
      );
    }, 0);
  }, [staff, attendance, daysInMonth]);

  // Open the attendance bottom sheet with the saved selection.
  const openAttendance = (date: string) => {
    const row = attendance[date];

    setSelectedDate(date);

    if (row?.status === "absent" || row?.status === "holiday") {
      setStatusChoice(row.status);
      setSessionChoices([]);
    } else {
      setStatusChoice(null);
      setSessionChoices(row?.sessions ?? []);
    }

    setAttendanceSheet(true);
  };

  // FIX: This function was missing and caused the ReferenceError.
  const toggleSession = (session: Session) => {
    setStatusChoice(null);

    setSessionChoices((current) =>
      current.includes(session)
        ? current.filter((item) => item !== session)
        : [...current, session]
    );
  };

  // Absent and Holiday are exclusive and clear all sessions.
  const chooseExclusiveStatus = (status: "absent" | "holiday") => {
    setStatusChoice((current) => (current === status ? null : status));
    setSessionChoices([]);
  };

  const saveAttendance = async () => {
    if (!staff || !selectedDate) return;

    if (!statusChoice && sessionChoices.length === 0) {
      showAlert(
        "Select attendance",
        "Choose Absent, Holiday, or at least one session.",
        "warning"
      );
      return;
    }

    setSavingAttendance(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      const status: AttendanceStatus =
        statusChoice === "absent" || statusChoice === "holiday"
          ? statusChoice
          : "present";

      const sessions: Session[] =
        status === "present" ? sessionChoices : [];

      let wage = 0;

      if (status === "present" && sessions.length > 0) {
        if (staff.salary_type === "batch") {
          wage = sessions.length * Number(staff.salary_amount);
        } else if (staff.salary_type === "daily") {
          wage = Number(staff.salary_amount);
        } else {
          wage = Number(staff.salary_amount) / daysInMonth;
        }
      }

      const payload = {
        staff_id: staff.id,
        institute_id: staff.institute_id,
        attendance_date: selectedDate,
        status,
        sessions,
        wage_amount: wage,
        updated_by: user?.id ?? null,
      };

      const { data, error } = await supabase
        .from("staff_attendance")
        .upsert(payload, {
          onConflict: "staff_id,attendance_date",
        })
        .select(
          "id,staff_id,institute_id,attendance_date,status,sessions,wage_amount,note"
        )
        .single();

      if (error) throw error;

      setAttendance((current) => ({
        ...current,
        [selectedDate]: {
          ...(data as AttendanceRow),
          sessions: (data as AttendanceRow).sessions ?? [],
        },
      }));

      setAttendanceSheet(false);

      const description =
        status === "absent" || status === "holiday"
          ? status === "absent"
            ? "Absent"
            : "Holiday"
          : sessions
              .map((session) => SESSION_THEME[session].label)
              .join(" + ");

      showAlert(
        "Attendance saved",
        `${prettyDate(selectedDate)} marked ${description}. ${
          wage > 0
            ? `${money(wage)} wage recorded.`
            : "No wages will be counted for this status."
        }`,
        "success"
      );
    } catch (error: any) {
      showAlert(
        "Could not save attendance",
        error?.message ?? "Please try again.",
        "error"
      );
    } finally {
      setSavingAttendance(false);
    }
  };

  const recordPayout = () => {
    if (!staff) return;
    const suggestedAmount = autoCalculate
      ? Math.max(0, calculatedAmount - totalPaid)
      : Number(manualAmount || 0);

    router.push({
      pathname: "/record-payout/[id]",
      params: {
        id: staff.id,
        instituteId: staff.institute_id,
        month: String(month.getMonth() + 1),
        year: String(month.getFullYear()),
        salaryAmount: String(suggestedAmount),
      },
    } as never);
  };

  const editPayout = (payout: Payout) => {
    if (!staff) return;
    router.push({
      pathname: "/record-payout/[id]",
      params: {
        id: staff.id,
        instituteId: staff.institute_id,
        month: String(month.getMonth() + 1),
        year: String(month.getFullYear()),
        payoutId: payout.id,
        amount: String(payout.amount),
        description: payout.note ?? "",
        paymentMethod: payout.payment_method ?? "cash",
        paidDate: payout.paid_date,
      },
    } as never);
  };

  const deletePayout = (payout: Payout) => {
    showAlert(
      "Delete payout?",
      `Delete ${money(Number(payout.amount))} paid on ${prettyDate(payout.paid_date)}?`,
      "warning",
      async () => {
        try {
          const { error } = await supabase
            .from("staff_payouts")
            .delete()
            .eq("id", payout.id)
            .eq("staff_id", staffId);
          if (error) throw error;
          setPayouts((current) => current.filter((item) => item.id !== payout.id));
          showAlert("Payout deleted", "The payout record was deleted.", "success");
        } catch (error: any) {
          showAlert(
            "Could not delete payout",
            error?.message ?? "Please check your permissions and try again.",
            "error"
          );
        }
      }
    );
  };

  const deleteTeacher = async () => {
    if (!staff) return;

    try {
      const relatedTables = ["staff_attendance", "staff_payouts"] as const;
      for (const table of relatedTables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("staff_id", staff.id);
        if (error) throw error;
      }

      const { data, error } = await supabase
        .from("institute_staff")
        .delete()
        .eq("id", staff.id)
        .eq("institute_id", staff.institute_id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Teacher was not deleted. Check your permissions.");
      }

      setDeleteSheet(false);
      showAlert("Teacher deleted", "The teacher has been removed.", "success", () =>
        router.replace("/teacher" as never),
      );
    } catch (error: any) {
      setDeleteSheet(false);
      showAlert(
        "Could not delete teacher",
        error?.message ?? "Please try again.",
        "error"
      );
    }
  };

  if (loading || !staff) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <ActivityIndicator size="large" color={NAVY} />
        <Text style={styles.muted}>Loading teacher details…</Text>
        <AppAlert {...alert} onCancel={closeAlert} />
      </View>
    );
  }

  const monthPayouts = payouts.filter(
    (payout) =>
      payout.period_start ===
      iso(new Date(month.getFullYear(), month.getMonth(), 1))
  );

  const totalPaid = monthPayouts.reduce(
    (total, payout) => total + Number(payout.amount),
    0
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
      >
        <LinearGradient
          colors={[NAVY, "#192638"]}
          style={styles.hero}
        >
          <View style={styles.toolbar}>
            <Pressable
              style={styles.iconButton}
              onPress={() => router.back()}
            >
              <Feather name="arrow-left" size={28} color={WHITE} />
            </Pressable>

            <View style={styles.toolbarRight}>
              <Pressable
                style={styles.iconButton}
                onPress={() =>
                  showAlert(
                    "Export attendance",
                    "Connect your PDF export workflow here to download attendance.",
                    "info"
                  )
                }
              >
                <Feather name="download" size={25} color={WHITE} />
              </Pressable>

              <Pressable
                style={styles.iconButton}
                onPress={() =>
                  router.push(`/edit-teacher/${staff.id}` as never)
                }
              >
                <Feather name="edit-2" size={25} color={WHITE} />
              </Pressable>

              <Pressable
                style={styles.iconButton}
                onPress={() => setDeleteSheet(true)}
              >
                <Feather name="trash-2" size={25} color={WHITE} />
              </Pressable>
            </View>
          </View>

          <View style={styles.personRow}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Feather name="user" size={42} color="#A7BAC7" />
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{staff.full_name}</Text>
              <Text style={styles.personMeta}>
                {titleCase(staff.staff_type)} · Coaching staff
              </Text>
              <Text style={styles.personMeta}>
                {staff.phone ? `+91 ${staff.phone}` : "No phone number"}
              </Text>
            </View>
          </View>

          <View style={styles.contactRow}>
            <Pressable
              style={styles.whatsapp}
              onPress={() => {
                if (!staff.phone) {
                  showAlert("No phone number", "Add a phone number first.", "warning");
                  return;
                }
                void Linking.openURL(
                  `https://wa.me/91${staff.phone.replace(/\D/g, "")}`
                );
              }}
            >
              <Feather name="message-circle" size={20} color="#14764F" />
              <Text style={styles.whatsappText}>WhatsApp</Text>
            </Pressable>

            <Pressable
              style={styles.callButton}
              onPress={() => {
                if (staff.phone) {
                  void Linking.openURL(`tel:${staff.phone}`);
                } else {
                  showAlert("No phone number", "Add a phone number first.", "warning");
                }
              }}
            >
              <Feather name="phone" size={20} color={WHITE} />
              <Text style={styles.callText}>Call</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.salaryTop}>
            <Text style={styles.cardLabel}>Salary</Text>
            <Text style={styles.salaryAmount}>
              {money(Number(staff.salary_amount))} /{" "}
              {staff.salary_type === "monthly"
                ? "month"
                : staff.salary_type === "daily"
                ? "day"
                : "batch"}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.autoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.autoTitle}>Calculate automatically</Text>
              <Text style={styles.muted}>
                {staff.salary_type === "batch"
                  ? "Batch rate × selected sessions"
                  : staff.salary_type === "daily"
                  ? "Daily wage × paid days"
                  : "Monthly salary prorated by calendar days"}
              </Text>
            </View>
            <Switch
              value={autoCalculate}
              onValueChange={setAutoCalculate}
              trackColor={{ false: "#D6DFE7", true: NAVY }}
              thumbColor={WHITE}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.monthHeader}>
            <Pressable
              style={styles.monthArrow}
              onPress={() =>
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() - 1, 1)
                )
              }
            >
              <Feather name="chevron-left" size={23} color={MUTED} />
            </Pressable>

            <View style={styles.monthTitleWrap}>
              <Pressable onPress={() => setYearPicker(true)} style={styles.yearTitleButton}>
                <Text style={styles.monthTitle}>{monthLabel(month)}</Text>
                <Feather name="chevron-down" size={17} color={NAVY} />
              </Pressable>
              <Text style={styles.monthSub}>
                {presentCount} present · {absentCount} absent · {holidayCount} holiday
              </Text>
            </View>

            <Pressable
              style={styles.monthArrow}
              onPress={() =>
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() + 1, 1)
                )
              }
            >
              <Feather name="chevron-right" size={23} color={MUTED} />
            </Pressable>
          </View>

          <View style={styles.calendarGrid}>
            {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekday}>
                {day}
              </Text>
            ))}

            {dates.map((day, index) => {
              if (!day) {
                return <View key={`blank-${index}`} style={styles.blankDay} />;
              }

              const date = iso(
                new Date(month.getFullYear(), month.getMonth(), day)
              );

              const row = attendance[date];
              const sessions = row?.sessions ?? [];
              const future = date > iso(new Date());
              const weeklyOff = isWeeklyHoliday(
                new Date(`${date}T12:00:00`)
              );

              const absent = row?.status === "absent";
              const holiday = row?.status === "holiday";
              const bothSessions =
                row?.status === "present" &&
                sessions.includes("morning") &&
                sessions.includes("evening");

              let theme:
                | { bg: string; border: string; color: string }
                | undefined;

              if (absent) {
                theme = STATUS.absent;
              } else if (holiday) {
                theme = STATUS.holiday;
              } else if (row?.status === "present" && sessions.length === 1) {
                theme = SESSION_THEME[sessions[0]];
              }

              return (
                <Pressable
                  key={date}
                  disabled={future}
                  onPress={() => openAttendance(date)}
                  style={[
                    styles.calendarDay,
                    theme
                      ? {
                          backgroundColor: theme.bg,
                          borderColor: theme.border,
                        }
                      : bothSessions
                      ? styles.bothSessionsDay
                      : weeklyOff
                      ? styles.offDay
                      : null,
                    date === iso(new Date()) && styles.today,
                    future && styles.futureDay,
                  ]}
                >
                  {bothSessions ? (
                    <LinearGradient
                      colors={["#43A35B", "#4778D0"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.dayGradient}
                    >
                      <Text style={[styles.calendarDayText, { color: WHITE }]}>
                        {day}
                      </Text>
                      <View
                        style={[styles.statusDot, { backgroundColor: WHITE }]}
                      />
                    </LinearGradient>
                  ) : (
                    <>
                      <Text
                        style={[
                          styles.calendarDayText,
                          theme ? { color: theme.color } : null,
                          !theme && weeklyOff ? styles.offText : null,
                        ]}
                      >
                        {day}
                      </Text>
                      {row?.status === "present" && sessions.length > 0 && (
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor:
                                theme?.border ?? SESSION_THEME.batch.border,
                            },
                          ]}
                        />
                      )}
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            {(["absent", "holiday"] as const).map((key) => (
              <View key={key} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendSwatch,
                    {
                      backgroundColor: STATUS[key].bg,
                      borderColor: STATUS[key].border,
                    },
                  ]}
                />
                <Text style={styles.legendText}>{STATUS[key].label}</Text>
              </View>
            ))}

            {(["morning", "evening", "batch"] as Session[]).map((key) => (
              <View key={key} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendSwatch,
                    {
                      backgroundColor: SESSION_THEME[key].bg,
                      borderColor: SESSION_THEME[key].border,
                    },
                  ]}
                />
                <Text style={styles.legendText}>
                  {SESSION_THEME[key].label}
                </Text>
              </View>
            ))}

            <View style={styles.legendItem}>
              <LinearGradient
                colors={["#43A35B", "#4778D0"]}
                style={styles.legendSwatch}
              />
              <Text style={styles.legendText}>Morning + Evening</Text>
            </View>
          </View>

          <Text style={styles.calendarHint}>
            Tap a date to mark attendance. Future dates cannot be marked.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {monthLabel(month)} salary
          </Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Present days</Text>
            <Text style={styles.summaryValue}>{paidDays} days</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Absent</Text>
            <Text style={styles.summaryValue}>{absentCount} days</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Holiday</Text>
            <Text style={styles.summaryValue}>{holidayCount} days</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Salary rate</Text>
            <Text style={styles.summaryValue}>
              {money(Number(staff.salary_amount))}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.payableRow}>
            <Text style={styles.payableLabel}>Payable · {paidDays} days</Text>
            <Text style={styles.payableAmount}>
              {money(autoCalculate ? Math.max(0, calculatedAmount - totalPaid) : Number(manualAmount || 0))}
            </Text>
          </View>

          {!autoCalculate && (
            <View style={styles.manualAmountWrap}>
              <Text style={styles.manualAmountLabel}>Manual payout amount (₹)</Text>
              <TextInput
                value={manualAmount}
                onChangeText={setManualAmount}
                keyboardType="decimal-pad"
                placeholder="Enter payout amount"
                placeholderTextColor="#9DB1BE"
                style={styles.manualAmountInput}
              />
            </View>
          )}

          <Pressable
            disabled={savingPayout}
            style={[
              styles.primaryButton,
              savingPayout && { opacity: 0.6 },
            ]}
            onPress={() => void recordPayout()}
          >
            {savingPayout ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <Text style={styles.primaryButtonText}>Record Payout</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment history</Text>

          {payouts.length === 0 ? (
            <Text style={styles.muted}>No payouts recorded yet.</Text>
          ) : (
            payouts.map((payout) => (
              <View key={payout.id} style={styles.payoutRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payoutDate}>
                    {prettyDate(payout.paid_date)}
                  </Text>
                  <Text style={styles.muted}>
                    {payout.period_start} – {payout.period_end}
                  </Text>
                  {!!payout.note && (
                    <Text style={styles.muted}>{payout.note}</Text>
                  )}
                </View>
                <View style={styles.payoutRight}>
                  <Text style={styles.payoutAmount}>
                    {money(Number(payout.amount))}
                  </Text>
                  <View style={styles.payoutActions}>
                    <Pressable
                      accessibilityLabel="Edit payout"
                      onPress={() => editPayout(payout)}
                      style={styles.payoutAction}
                    >
                      <Feather name="edit-2" size={16} color={NAVY} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Delete payout"
                      onPress={() => deletePayout(payout)}
                      style={styles.payoutAction}
                    >
                      <Feather name="trash-2" size={16} color="#C62828" />
                    </Pressable>
                  </View>
                  <Text style={styles.payoutMethod}>
                    {(payout.payment_method ?? "cash").toUpperCase()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Year picker bottom sheet */}
      <Modal
        visible={yearPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setYearPicker(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setYearPicker(false)} />
          <View style={styles.yearSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Choose year</Text>
            <Text style={styles.sheetSubtitle}>Select a year for the attendance calendar.</Text>
            <ScrollView style={{ maxHeight: 330 }} showsVerticalScrollIndicator={false}>
              {Array.from({ length: 21 }, (_, index) => new Date().getFullYear() - 10 + index).map((year) => (
                <Pressable
                  key={year}
                  onPress={() => {
                    setMonth(new Date(year, month.getMonth(), 1));
                    setYearPicker(false);
                  }}
                  style={[styles.yearOption, month.getFullYear() === year && styles.yearOptionActive]}
                >
                  <Text style={[styles.yearOptionText, month.getFullYear() === year && { color: WHITE }]}>
                    {year}
                  </Text>
                  {month.getFullYear() === year && <Feather name="check" size={18} color={WHITE} />}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.cancelButton} onPress={() => setYearPicker(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Attendance bottom sheet */}
      <Modal
        visible={attendanceSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setAttendanceSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setAttendanceSheet(false)}
          />

          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            <Pressable
              style={styles.sheetClose}
              onPress={() => setAttendanceSheet(false)}
            >
              <Feather name="x" size={23} color={WHITE} />
            </Pressable>

            <Text style={styles.sheetTitle}>
              {selectedDate ? prettyDate(selectedDate) : "Attendance"}
            </Text>

            <Text style={styles.sheetSubtitle}>
              {staff.full_name} ·{" "}
              {statusChoice
                ? titleCase(statusChoice)
                : sessionChoices.length
                ? sessionChoices
                    .map((session) => SESSION_THEME[session].label)
                    .join(" + ")
                : "Not marked"}
            </Text>

            <Text style={styles.sectionTitle}>Attendance status</Text>

            <View style={styles.choiceRow}>
              {(["absent", "holiday"] as const).map((status) => (
                <Pressable
                  key={status}
                  onPress={() => chooseExclusiveStatus(status)}
                  style={[
                    styles.choice,
                    statusChoice === status && {
                      backgroundColor: STATUS[status].bg,
                      borderColor: STATUS[status].border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.choiceDot,
                      { backgroundColor: STATUS[status].border },
                    ]}
                  />
                  <Text
                    style={[
                      styles.choiceText,
                      statusChoice === status && {
                        color: STATUS[status].color,
                      },
                    ]}
                  >
                    {STATUS[status].label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
              Sessions · select multiple
            </Text>

            <View style={styles.choiceRow}>
              {(["morning", "evening", "batch"] as Session[]).map(
                (session) => {
                  const selected = sessionChoices.includes(session);
                  const theme = SESSION_THEME[session];

                  return (
                    <Pressable
                      key={session}
                      onPress={() => toggleSession(session)}
                      style={[
                        styles.choice,
                        selected && {
                          backgroundColor: theme.bg,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.choiceDot,
                          { backgroundColor: theme.border },
                        ]}
                      />
                      <Text
                        style={[
                          styles.choiceText,
                          selected && { color: theme.color },
                        ]}
                      >
                        {theme.label}
                        {selected ? " ✓" : ""}
                      </Text>
                    </Pressable>
                  );
                }
              )}
            </View>

            <Text style={styles.sheetNote}>
              {statusChoice === "absent" || statusChoice === "holiday"
                ? "Wage for this date: ₹0"
                : staff.salary_type === "batch"
                ? `Estimated wage: ${money(
                    sessionChoices.length * Number(staff.salary_amount)
                  )} (${sessionChoices.length} selected session(s) × batch rate)`
                : staff.salary_type === "daily"
                ? `Estimated daily wage: ${money(
                    sessionChoices.length ? Number(staff.salary_amount) : 0
                  )}`
                : `Estimated wage: ${money(
                    sessionChoices.length
                      ? Number(staff.salary_amount) / daysInMonth
                      : 0
                  )} (monthly salary prorated per calendar day)`}
            </Text>

            <Pressable
              disabled={savingAttendance}
              style={[
                styles.primaryButton,
                savingAttendance && { opacity: 0.65 },
              ]}
              onPress={() => void saveAttendance()}
            >
              {savingAttendance ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <Text style={styles.primaryButtonText}>Save Attendance</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Delete confirmation bottom sheet */}
      <Modal
        visible={deleteSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setDeleteSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setDeleteSheet(false)}
          />

          <View style={styles.deleteSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.deleteIcon}>
              <Feather name="trash-2" size={26} color="#C62828" />
            </View>

            <Text style={styles.deleteTitle}>
              Delete {staff.full_name}?
            </Text>

            <Text style={styles.deleteMessage}>
              This removes the staff record. Related attendance and payout
              records may also be deleted if your database uses cascading
              foreign keys. This action cannot be undone.
            </Text>

            <Pressable
              style={styles.deleteButton}
              onPress={() => void deleteTeacher()}
            >
              <Text style={styles.deleteButtonText}>Delete Teacher</Text>
            </Pressable>

            <Pressable
              style={styles.cancelButton}
              onPress={() => setDeleteSheet(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <AppAlert {...alert} onCancel={closeAlert} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  page: { paddingBottom: 18 },
  loading: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  hero: { paddingHorizontal: 25, paddingTop: 16, paddingBottom: 28 },
  toolbar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toolbarRight: { flexDirection: "row", gap: 13 },
  iconButton: {
    width: 38,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 17,
    marginTop: 14,
  },
  avatar: {
    width: 106,
    height: 106,
    borderRadius: 30,
    backgroundColor: "#31475C",
  },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  personName: { fontSize: 27, fontWeight: "800", color: WHITE },
  personMeta: { fontSize: 15, color: "#A7BAC7", marginTop: 5 },
  contactRow: { flexDirection: "row", gap: 12, marginTop: 22 },
  whatsapp: {
    flex: 1,
    height: 58,
    borderRadius: 19,
    backgroundColor: "#E9F7EF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  whatsappText: { fontSize: 17, fontWeight: "700", color: "#14764F" },
  callButton: {
    flex: 1,
    height: 58,
    borderRadius: 19,
    backgroundColor: "#293B50",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  callText: { fontSize: 17, fontWeight: "700", color: WHITE },
  card: {
    marginHorizontal: 18,
    marginTop: 18,
    padding: 20,
    borderRadius: 25,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  salaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardLabel: { fontSize: 16, color: MUTED, fontWeight: "600" },
  salaryAmount: { fontSize: 21, fontWeight: "800", color: NAVY },
  separator: { height: 1, backgroundColor: "#E8EDF2", marginVertical: 18 },
  autoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  autoTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: NAVY,
    marginBottom: 7,
  },
  muted: { fontSize: 14, color: MUTED, lineHeight: 21 },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthArrow: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#F1F5F8",
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitleWrap: { alignItems: "center", flex: 1 },
  yearTitleButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5, paddingHorizontal: 8 },
  monthTitle: { fontSize: 18, fontWeight: "800", color: NAVY },
  monthSub: { fontSize: 13, color: "#8A9CAB", marginTop: 3 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: {
    width: "14.2857%",
    textAlign: "center",
    paddingVertical: 8,
    color: "#879AAA",
    fontWeight: "800",
    fontSize: 14,
  },
  blankDay: { width: "14.2857%", height: 65 },
  calendarDay: {
    width: "13.1%",
    height: 65,
    marginHorizontal: "0.59%",
    marginVertical: 3,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#E1E8EF",
    backgroundColor: "#F4F7FA",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayText: { fontSize: 16, fontWeight: "800", color: NAVY },
  bothSessionsDay: {
    backgroundColor: "transparent",
    borderColor: "#47976B",
    overflow: "hidden",
    padding: 0,
  },
  dayGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  offDay: { backgroundColor: "#EDF2F6", borderColor: "#A4B5C3" },
  offText: { color: "#A4B5C3" },
  today: { borderColor: "#C9A15E", borderWidth: 2 },
  futureDay: { opacity: 0.48 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginTop: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 18 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  legendText: { fontSize: 12, color: MUTED },
  calendarHint: { fontSize: 12, color: "#879AAA", marginTop: 12, lineHeight: 18 },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: NAVY,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 8,
    gap: 10,
  },
  summaryLabel: { fontSize: 15, color: MUTED, flex: 1 },
  summaryValue: { fontSize: 15, fontWeight: "600", color: NAVY },
  payableRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  payableLabel: { fontSize: 15, fontWeight: "700", color: NAVY },
  payableAmount: { fontSize: 27, fontWeight: "900", color: NAVY },
  manualAmountWrap: { marginTop: 14 },
  manualAmountLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: MUTED,
    marginBottom: 8,
  },
  manualAmountInput: {
    height: 52,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 17,
    color: NAVY,
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 17,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  primaryButtonText: { fontSize: 18, fontWeight: "800", color: WHITE },
  payoutRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#EDF1F5",
    gap: 10,
  },
  payoutDate: { fontSize: 15, fontWeight: "700", color: NAVY, marginBottom: 3 },
  payoutAmount: { fontSize: 16, fontWeight: "800", color: NAVY },
  payoutRight: { alignItems: "flex-end", gap: 6 },
  payoutActions: { flexDirection: "row", gap: 7 },
  payoutAction: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#F1F5F8", alignItems: "center", justifyContent: "center" },
  payoutMethod: { fontSize: 10, fontWeight: "800", color: MUTED, letterSpacing: 0.5 },
  yearSheet: { backgroundColor: WHITE, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 },
  yearOption: { minHeight: 48, borderRadius: 13, marginTop: 7, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F1F5F8" },
  yearOptionActive: { backgroundColor: NAVY },
  yearOptionText: { fontSize: 16, fontWeight: "700", color: NAVY },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,29,44,0.40)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 30,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 5,
    backgroundColor: "#D7E0E8",
    alignSelf: "center",
    marginBottom: 18,
  },
  sheetClose: {
    position: "absolute",
    top: -48,
    alignSelf: "center",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#748091",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: { fontSize: 24, fontWeight: "900", color: NAVY },
  sheetSubtitle: { fontSize: 15, color: MUTED, marginTop: 12, marginBottom: 22 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  choice: {
    flexGrow: 1,
    minWidth: "44%",
    minHeight: 56,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  choiceDot: { width: 10, height: 10, borderRadius: 5 },
  choiceText: { fontSize: 15, fontWeight: "700", color: MUTED },
  sheetNote: { fontSize: 14, color: MUTED, marginTop: 18, lineHeight: 21 },
  deleteSheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 30,
    alignItems: "center",
  },
  deleteIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#FDE9E9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  deleteTitle: { fontSize: 22, fontWeight: "900", color: NAVY },
  deleteMessage: {
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
  },
  deleteButton: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    backgroundColor: "#C62828",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  deleteButtonText: { fontSize: 16, fontWeight: "800", color: WHITE },
  cancelButton: {
    width: "100%",
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  cancelButtonText: { fontSize: 16, fontWeight: "700", color: MUTED },
});
