import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import { supabase } from "../lib/supabase";
import AppAlert, { type AppAlertType } from "../components/AppAlert";
import { LinearGradient } from "expo-linear-gradient";

const NAVY = "#202F42";
const PURPLE = "#4C02F7";
const PURPLE_DARK = "#44109D";
const BG = "#F3F3FF";
const MUTED = "#718096";
const BORDER = "#E8E3F5";
const WHITE = "#FFFFFF";

type Session = "morning" | "evening" | "batch";
type ExclusiveChoice = "absent" | "holiday";
type Choice = ExclusiveChoice | Session;
type Selection = ExclusiveChoice | Session[] | null;

type Staff = {
  id: string;
  institute_id: string;
  full_name: string;
  photo_path: string | null;
  salary_type: string;
  salary_amount: number;
  weekly_holidays: string[] | null;
  photo_url: string | null;
};

const iso = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parseDate = (value: string): Date => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

const prettyDate = (value: string): string =>
  parseDate(value).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const choices: {
  key: Choice;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  bg: string;
}[] = [
  {
    key: "absent",
    label: "Absent",
    icon: "x-circle",
    color: "#C94F5B",
    bg: "#FDECEF",
  },
  {
    key: "holiday",
    label: "Holiday",
    icon: "sun",
    color: "#A96C13",
    bg: "#FFF2D9",
  },
  {
    key: "morning",
    label: "Morning",
    icon: "sunrise",
    color: "#3478B9",
    bg: "#E5F1FF",
  },
  {
    key: "evening",
    label: "Evening",
    icon: "sunset",
    color: "#7856A8",
    bg: "#F0EAFE",
  },
  {
    key: "batch",
    label: "Batch",
    icon: "users",
    color: "#16845B",
    bg: "#DDF7EB",
  },
];

export default function StaffAttendanceScreen() {
  const [date, setDate] = useState(iso(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [saved, setSaved] = useState<Record<string, Selection>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [instituteId, setInstituteId] = useState("");

  const currentYear = new Date().getFullYear();

  const yearOptions = Array.from(
    { length: currentYear + 11 - 1900 },
    (_, index) => currentYear + 10 - index,
  );

  const daysInMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0,
  ).getDate();

  const firstWeekday = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1,
  ).getDay();

  const calendarCells = [
    ...Array(firstWeekday).fill(0),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const openAttendanceCalendar = () => {
    setCalendarMonth(parseDate(date));
    setShowYearPicker(false);
    setShowDatePicker(true);
  };

  const selectAttendanceDate = (value: string) => {
    if (value > iso(new Date())) return;

    setShowDatePicker(false);
    setShowYearPicker(false);

    if (value !== date) {
      setLoading(true);
      setSelections({});
      setSaved({});
      setDate(value);
    }
  };

  const [alert, setAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: AppAlertType;
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
  ) => {
    setAlert({ visible: true, title, message, type });
  };

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again.");

      const { data: members, error: memberError } = await supabase
        .from("institute_members")
        .select("institute_id,role")
        .eq("user_id", user.id);

      if (memberError) throw memberError;

      if (!members?.length) {
        throw new Error("Your account is not linked to an institute.");
      }

      if (members.length !== 1) {
        throw new Error(
          "This account has multiple institute memberships. Select an institute first.",
        );
      }

      const iid = members[0].institute_id as string;
      setInstituteId(iid);

      const { data: people, error: staffError } = await supabase
        .from("institute_staff")
        .select(
          "id,institute_id,full_name,photo_path,salary_type,salary_amount,weekly_holidays",
        )
        .eq("institute_id", iid)
        .eq("status", "active")
        .order("full_name");

      if (staffError) throw staffError;

      const withPhotos: Staff[] = await Promise.all(
        (people ?? []).map(async (person: any) => {
          let photo_url: string | null = null;

          if (person.photo_path) {
            const { data } = await supabase.storage
              .from("staff-photos")
              .createSignedUrl(person.photo_path, 3600);

            photo_url = data?.signedUrl ?? null;
          }

          return { ...person, photo_url } as Staff;
        }),
      );

      setStaff(withPhotos);

      const { data: records, error: attendanceError } = await supabase
        .from("staff_attendance")
        .select(
          "id,staff_id,institute_id,attendance_date,status,sessions,wage_amount,note",
        )
        .eq("institute_id", iid)
        .eq("attendance_date", date);

      if (attendanceError) throw attendanceError;

      const mapped: Record<string, Selection> = {};

      (records ?? []).forEach((record: any) => {
        if (record.status === "absent" || record.status === "holiday") {
          mapped[record.staff_id] = record.status;
        } else {
          const valid = (record.sessions ?? []).filter(
            (value: unknown): value is Session =>
              value === "morning" || value === "evening" || value === "batch",
          );

          mapped[record.staff_id] = valid.length ? valid : null;
        }
      });

      setSaved(mapped);
      setSelections(mapped);
    } catch (error: any) {
      showAlert(
        "Unable to load attendance",
        error?.message ?? "Please try again.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const counts = useMemo(() => {
    const values = staff.map((person) => selections[person.id] ?? null);

    const marked = values.filter(
      (value) =>
        value === "absent" ||
        value === "holiday" ||
        (Array.isArray(value) && value.length > 0),
    ).length;

    return {
      marked,
      unmarked: values.length - marked,
    };
  }, [staff, selections]);

  const changeDate = (offset: number) => {
    const nextDate = parseDate(date);
    nextDate.setDate(nextDate.getDate() + offset);

    const next = iso(nextDate);

    if (next > iso(new Date())) return;

    setShowDatePicker(false);
    setLoading(true);
    setSelections({});
    setSaved({});
    setDate(next);
  };

  const selectChoice = (id: string, choice: Choice): void => {
    setSelections((previous) => {
      const current: Selection = previous[id] ?? null;

      // Absent and Holiday are exclusive statuses.
      if (choice === "absent" || choice === "holiday") {
        return {
          ...previous,
          [id]: current === choice ? null : choice,
        };
      }

      // Morning, Evening and Batch can be selected together.
      const currentSessions: Session[] = Array.isArray(current) ? current : [];

      const nextSessions: Session[] = currentSessions.includes(choice)
        ? currentSessions.filter((session) => session !== choice)
        : [...currentSessions, choice];

      return {
        ...previous,
        [id]: nextSessions.length > 0 ? nextSessions : null,
      };
    });
  };

  const save = async () => {
    if (!instituteId) {
      showAlert(
        "Institute not found",
        "Please reload this screen and try again.",
        "error",
      );
      return;
    }

    if (!staff.length) {
      showAlert(
        "No teachers",
        "There are no active teachers to mark.",
        "warning",
      );
      return;
    }

    const unmarked = staff.filter((person) => {
      const value = selections[person.id];

      return !(
        value === "absent" ||
        value === "holiday" ||
        (Array.isArray(value) && value.length > 0)
      );
    });

    if (unmarked.length) {
      showAlert(
        "Attendance incomplete",
        `Please mark attendance for ${unmarked.length} teacher(s) before saving.`,
        "warning",
      );
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again.");

      const payload = staff.map((person) => {
        const choice = selections[person.id];

        if (!choice) {
          throw new Error(`Please mark attendance for ${person.full_name}.`);
        }

        const status =
          choice === "absent"
            ? "absent"
            : choice === "holiday"
              ? "holiday"
              : "present";

        const sessions: Session[] =
          status === "present" && Array.isArray(choice) ? choice : [];

        let wage = 0;

        if (status === "present" && sessions.length > 0) {
          const salary = Number(person.salary_amount) || 0;

          if (person.salary_type === "batch") {
            wage = sessions.length * salary;
          } else if (person.salary_type === "daily") {
            wage = salary;
          } else {
            const selectedDate = parseDate(date);

            const daysInMonth = new Date(
              selectedDate.getFullYear(),
              selectedDate.getMonth() + 1,
              0,
            ).getDate();

            wage = salary / daysInMonth;
          }
        }

        return {
          staff_id: person.id,
          institute_id: instituteId,
          attendance_date: date,
          status,
          sessions,
          wage_amount: wage,
          updated_by: user.id,
        };
      });

      // Uses the existing staff_attendance table and unique key.
      const { error } = await supabase
        .from("staff_attendance")
        .upsert(payload, {
          onConflict: "staff_id,attendance_date",
        });

      if (error) throw error;

      setSaved({ ...selections });

      showAlert(
        "Attendance saved",
        `Attendance for ${prettyDate(date)} has been saved for all ${staff.length} teachers.`,
        "success",
      );
    } catch (error: any) {
      showAlert(
        "Could not save attendance",
        error?.message ?? "Please check your permissions and try again.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <LinearGradient
        colors={["#611CD0", "#44109D", "#4C02F7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.top}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Feather name="arrow-left" size={24} color={WHITE} />
          </Pressable>

          <View>
            <Text style={styles.title}>Mark Attendance</Text>
            <Text style={styles.subtitle}>Teacher attendance register</Text>
          </View>
        </View>

        <View style={styles.dateCard}>
          <Pressable
            style={styles.dateArrow}
            onPress={() => changeDate(-1)}
            accessibilityLabel="Previous day"
          >
            <Feather name="chevron-left" size={26} color={NAVY} />
          </Pressable>

          <Pressable style={styles.dateMiddle} onPress={openAttendanceCalendar}>
            <Text style={styles.dateText}>{prettyDate(date)}</Text>

            <View style={styles.todayRow}>
              <Text style={styles.todayText}>
                {date === iso(new Date()) ? "Today" : "Tap to choose date"}
              </Text>
              <Feather name="chevron-down" size={17} color={MUTED} />
            </View>
          </Pressable>

          <Pressable
            disabled={date >= iso(new Date())}
            style={[
              styles.dateArrow,
              date >= iso(new Date()) && styles.disabledDateArrow,
            ]}
            onPress={() => changeDate(1)}
            accessibilityLabel="Next day"
          >
            <Feather name="chevron-right" size={26} color={NAVY} />
          </Pressable>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressTopRow}>
            <View>
              <Text style={styles.progressLabel}>Attendance progress</Text>
              <Text style={styles.progressValue}>
                {counts.marked}{" "}
                <Text style={styles.progressOf}>/ {staff.length}</Text>
              </Text>
            </View>
            <View style={styles.progressPercentBadge}>
              <Text style={styles.progressPercent}>
                {staff.length
                  ? Math.round((counts.marked / staff.length) * 100)
                  : 0}
                %
              </Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${staff.length ? (counts.marked / staff.length) * 100 : 0}%`,
                },
              ]}
            />
          </View>
          <View style={styles.progressLegend}>
            <View style={styles.legendItem}>
              <View style={styles.legendDotDone} />
              <Text style={styles.legendText}>{counts.marked} marked</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendDotPending} />
              <Text style={styles.legendText}>{counts.unmarked} pending</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDatePicker(false);
          setShowYearPicker(false);
        }}
      >
        <View style={styles.calendarModalRoot}>
          <Pressable
            style={styles.calendarShade}
            onPress={() => {
              setShowDatePicker(false);
              setShowYearPicker(false);
            }}
          />
          <View style={styles.calendarSheet}>
            <View style={styles.calendarHandle} />
            <Text style={styles.calendarSheetTitle}>
              Select attendance date
            </Text>

            <View style={styles.datePicker}>
              <View style={styles.calendarTop}>
                <View>
                  <Text style={styles.calendarEyebrow}>ATTENDANCE DATE</Text>
                  <Text style={styles.calendarHint}>Choose a date</Text>
                </View>
                <Pressable
                  style={styles.todayButton}
                  onPress={() => {
                    setCalendarMonth(new Date());
                    setShowYearPicker(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Go to current month"
                >
                  <Feather name="calendar" size={14} color={PURPLE} />
                  <Text style={styles.todayButtonText}>Today</Text>
                </Pressable>
              </View>

              <View style={styles.monthRow}>
                <Pressable
                  style={styles.monthArrow}
                  onPress={() => {
                    setShowYearPicker(false);
                    setCalendarMonth(
                      new Date(
                        calendarMonth.getFullYear(),
                        calendarMonth.getMonth() - 1,
                        1,
                      ),
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                >
                  <Feather name="chevron-left" size={22} color={PURPLE} />
                </Pressable>

                <Pressable
                  style={styles.monthTitleButton}
                  onPress={() => setShowYearPicker((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel="Choose year"
                  accessibilityState={{ expanded: showYearPicker }}
                >
                  <Text style={styles.monthTitle}>
                    {calendarMonth.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                  <Feather
                    name={showYearPicker ? "chevron-up" : "chevron-down"}
                    size={17}
                    color={PURPLE}
                  />
                </Pressable>

                <Pressable
                  style={styles.monthArrow}
                  onPress={() => {
                    setShowYearPicker(false);
                    setCalendarMonth(
                      new Date(
                        calendarMonth.getFullYear(),
                        calendarMonth.getMonth() + 1,
                        1,
                      ),
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                >
                  <Feather name="chevron-right" size={22} color={PURPLE} />
                </Pressable>
              </View>

              {showYearPicker ? (
                <View style={styles.yearPickerPanel}>
                  <Text style={styles.yearPickerTitle}>Select year</Text>
                  <ScrollView
                    style={styles.yearList}
                    contentContainerStyle={styles.yearListContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    {yearOptions.map((year) => {
                      const selectedYear = calendarMonth.getFullYear() === year;
                      return (
                        <Pressable
                          key={year}
                          style={[
                            styles.yearOption,
                            selectedYear && styles.yearOptionActive,
                          ]}
                          onPress={() => {
                            setCalendarMonth(
                              new Date(year, calendarMonth.getMonth(), 1),
                            );
                            setShowYearPicker(false);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: selectedYear }}
                        >
                          <Text
                            style={[
                              styles.yearOptionText,
                              selectedYear && styles.yearOptionTextActive,
                            ]}
                          >
                            {year}
                          </Text>
                          {selectedYear && (
                            <Feather
                              name="check-circle"
                              size={19}
                              color={PURPLE}
                            />
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <>
                  <View style={styles.calendarGrid}>
                    {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                      <Text
                        key={`${day}${index}`}
                        style={styles.calendarWeekday}
                      >
                        {day}
                      </Text>
                    ))}

                    {calendarCells.map((day, index) => {
                      if (day === 0) {
                        return (
                          <View
                            key={`blank${index}`}
                            style={styles.calendarDayCell}
                          />
                        );
                      }

                      const value = [
                        calendarMonth.getFullYear(),
                        String(calendarMonth.getMonth() + 1).padStart(2, "0"),
                        String(day).padStart(2, "0"),
                      ].join("-");
                      const isSelected = value === date;
                      const isToday = value === iso(new Date());
                      const isFuture = value > iso(new Date());

                      return (
                        <Pressable
                          key={day}
                          disabled={isFuture}
                          style={[
                            styles.calendarDayCell,
                            isSelected && styles.calendarDayCellSelected,
                            !isSelected &&
                              isToday &&
                              styles.calendarDayCellToday,
                            isFuture && styles.calendarDayCellDisabled,
                          ]}
                          onPress={() => selectAttendanceDate(value)}
                          accessibilityRole="button"
                          accessibilityLabel={`${day} ${calendarMonth.toLocaleDateString("en-US", { month: "long" })} ${calendarMonth.getFullYear()}`}
                          accessibilityState={{
                            selected: isSelected,
                            disabled: isFuture,
                          }}
                        >
                          <Text
                            style={[
                              styles.calendarDayText,
                              isSelected && styles.calendarDayTextSelected,
                              !isSelected &&
                                isToday &&
                                styles.calendarDayTextToday,
                              isFuture && styles.calendarDayTextDisabled,
                            ]}
                          >
                            {day}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.calendarFooter}>
                    <View style={styles.calendarLegendDot} />
                    <Text style={styles.calendarFooterText}>Today</Text>
                    <View
                      style={[
                        styles.calendarLegendDot,
                        styles.calendarLegendDotSelected,
                      ]}
                    />
                    <Text style={styles.calendarFooterText}>Selected date</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={NAVY} />
          <Text style={styles.muted}>Loading teachers…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {staff.length > 0 && (
            <View style={styles.listHeading}>
              <View>
                <Text style={styles.listTitle}>Teacher register</Text>
                <Text style={styles.listSubtitle}>
                  Select the applicable attendance for each teacher
                </Text>
              </View>
              <View style={styles.staffCountBadge}>
                <Feather name="users" size={13} color={PURPLE_DARK} />
                <Text style={styles.staffCountText}>{staff.length}</Text>
              </View>
            </View>
          )}
          {staff.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="users" size={34} color={MUTED} />
              <Text style={styles.emptyText}>No active teachers found.</Text>
            </View>
          ) : (
            staff.map((person) => {
              const selected = selections[person.id] ?? null;
              const savedValue = saved[person.id] ?? null;

              const isSaved =
                JSON.stringify(savedValue) === JSON.stringify(selected) &&
                selected !== null &&
                (!Array.isArray(selected) || selected.length > 0);

              return (
                <View
                  key={person.id}
                  style={[
                    styles.teacherCard,
                    isSaved && styles.teacherCardSaved,
                  ]}
                >
                  <View style={styles.teacherHeader}>
                    {person.photo_url ? (
                      <Image
                        source={{ uri: person.photo_url }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Feather name="user" size={25} color={MUTED} />
                      </View>
                    )}

                    <View style={styles.teacherInfo}>
                      <Text style={styles.teacherName}>{person.full_name}</Text>

                      <View style={styles.teacherMetaRow}>
                        <View
                          style={[
                            styles.statusDot,
                            isSaved
                              ? styles.statusDotSaved
                              : selected
                                ? styles.statusDotPending
                                : styles.statusDotEmpty,
                          ]}
                        />
                        <Text style={styles.teacherMeta}>
                          {isSaved
                            ? "Attendance saved"
                            : selected
                              ? "Unsaved changes"
                              : "Awaiting attendance"}
                        </Text>
                      </View>
                    </View>

                    {isSaved && (
                      <Feather name="check-circle" size={19} color="#16845B" />
                    )}
                  </View>

                  <View style={styles.optionHeadingRow}>
                    <Text style={styles.optionHeading}>Attendance status</Text>
                    <Text style={styles.optionHint}>
                      Multiple sessions allowed
                    </Text>
                  </View>
                  <View style={styles.options}>
                    {choices.map((choice) => {
                      const active =
                        choice.key === "absent" || choice.key === "holiday"
                          ? selected === choice.key
                          : Array.isArray(selected) &&
                            selected.includes(choice.key as Session);

                      return (
                        <Pressable
                          key={choice.key}
                          onPress={() => selectChoice(person.id, choice.key)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={[
                            styles.option,
                            active && {
                              backgroundColor: choice.bg,
                              borderColor: choice.color,
                            },
                          ]}
                        >
                          <Feather
                            name={choice.icon}
                            size={16}
                            color={active ? choice.color : MUTED}
                          />

                          <Text
                            style={[
                              styles.optionText,
                              active && { color: choice.color },
                            ]}
                          >
                            {choice.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <View style={styles.bottom}>
        <Pressable
          disabled={saving || loading || staff.length === 0}
          style={[
            styles.saveButton,
            (saving || loading || !staff.length) && styles.saveButtonDisabled,
          ]}
          onPress={() => void save()}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={["#611CD0", "#44109D", "#4C02F7"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.saveButtonGradient}
          >
            {saving ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <>
                <Feather name="check-circle" size={20} color={WHITE} />
                <Text style={styles.saveText}>Save Attendance</Text>
                <Feather name="arrow-right" size={19} color={WHITE} />
              </>
            )}
          </LinearGradient>
        </Pressable>
        <Text style={styles.bottomHint}>
          {counts.unmarked === 0 && staff.length > 0
            ? "All teachers are marked for this date"
            : `${counts.unmarked} teacher${counts.unmarked === 1 ? "" : "s"} still need attendance`}
        </Text>
      </View>

      <AppAlert
        {...alert}
        onCancel={() =>
          setAlert((current) => ({
            ...current,
            visible: false,
          }))
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  top: {
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: WHITE,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: "#E2D7FF",
    marginTop: 4,
    fontWeight: "500",
  },
  calendarModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(17,35,52,0.38)",
  },
  calendarShade: { ...StyleSheet.absoluteFill },
  calendarSheet: {
    maxHeight: "88%",
    backgroundColor: WHITE,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
  },
  calendarHandle: {
    width: 43,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D0DCE6",
    alignSelf: "center",
    marginBottom: 17,
  },
  calendarSheetTitle: {
    color: NAVY,
    fontSize: 21,
    fontWeight: "800",
    marginBottom: 15,
  },
  datePicker: {
    backgroundColor: WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 4,
  },
  calendarTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  calendarEyebrow: {
    color: PURPLE,
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "800",
    marginBottom: 4,
  },
  calendarHint: { color: MUTED, fontSize: 13, fontWeight: "500" },
  todayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3EEFF",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  todayButtonText: { color: PURPLE, fontSize: 12, fontWeight: "800" },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthTitle: { color: NAVY, fontSize: 16, fontWeight: "800" },
  monthArrow: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F6F2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F3EEFF",
  },
  yearPickerPanel: {
    borderWidth: 1,
    borderColor: "#E9E0FF",
    borderRadius: 15,
    backgroundColor: "#FCFBFF",
    padding: 10,
  },
  yearPickerTitle: {
    color: NAVY,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  yearList: { maxHeight: 300 },
  yearListContent: { paddingBottom: 4 },
  yearOption: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0ECF8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
  },
  yearOptionActive: { backgroundColor: "#F0E8FF" },
  yearOptionText: { color: "#1F2937", fontSize: 14, fontWeight: "600" },
  yearOptionTextActive: { color: PURPLE, fontWeight: "800" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarWeekday: {
    width: "14.285%",
    textAlign: "center",
    color: "#96AAB9",
    fontWeight: "800",
    paddingVertical: 10,
  },
  calendarDayCell: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    marginVertical: 1,
  },
  calendarDayCellSelected: { backgroundColor: PURPLE },
  calendarDayCellToday: {
    borderWidth: 1.5,
    borderColor: "#C4B5FD",
  },
  calendarDayCellDisabled: { opacity: 0.3 },
  calendarDayText: { color: "#1F2937", fontSize: 14, fontWeight: "600" },
  calendarDayTextSelected: { color: WHITE, fontWeight: "800" },
  calendarDayTextToday: { color: PURPLE, fontWeight: "800" },
  calendarDayTextDisabled: { color: "#9AA5AF" },
  calendarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#F0ECF8",
    marginTop: 10,
    paddingTop: 12,
  },
  calendarLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C4B5FD",
  },
  calendarLegendDotSelected: { backgroundColor: PURPLE, marginLeft: 10 },
  calendarFooterText: { color: MUTED, fontSize: 11, fontWeight: "600" },

  dateCard: {
    marginHorizontal: 18,
    marginTop: 20,
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#24104F",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  dateArrow: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#F4F0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  disabledDateArrow: {
    opacity: 0.35,
  },
  dateMiddle: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "800",
    color: NAVY,
    textAlign: "center",
  },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  todayText: {
    fontSize: 12,
    color: PURPLE_DARK,
    fontWeight: "700",
  },
  progressCard: {
    marginHorizontal: 18,
    marginTop: 14,
    padding: 15,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  progressTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    color: "#E7DEFF",
    fontSize: 12,
    fontWeight: "600",
  },
  progressValue: {
    color: WHITE,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 2,
  },
  progressOf: {
    color: "#D5C7FF",
    fontSize: 15,
    fontWeight: "600",
  },
  progressPercentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  progressPercent: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "900",
  },
  progressTrack: {
    height: 7,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
    marginTop: 12,
  },
  progressFill: {
    height: "100%",
    borderRadius: 10,
    backgroundColor: WHITE,
  },
  progressLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDotDone: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#A7F3D0",
  },
  legendDotPending: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FDE68A",
  },
  legendText: {
    color: "#F0EAFE",
    fontSize: 11,
    fontWeight: "600",
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 145,
  },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  listTitle: {
    color: NAVY,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  listSubtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
  },
  staffCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EDE7FF",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  staffCountText: {
    color: PURPLE_DARK,
    fontSize: 12,
    fontWeight: "800",
  },
  teacherCard: {
    backgroundColor: WHITE,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 13,
    shadowColor: "#34215F",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.045,
    shadowRadius: 9,
    elevation: 2,
  },
  teacherCardSaved: {
    borderColor: "#CDEBDD",
  },
  teacherHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: BG,
    borderWidth: 2,
    borderColor: "#EEE8FF",
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#F0EBFF",
    borderWidth: 1,
    borderColor: "#E5DAFF",
    alignItems: "center",
    justifyContent: "center",
  },
  teacherInfo: {
    flex: 1,
    minWidth: 0,
  },
  teacherName: {
    fontSize: 16,
    fontWeight: "800",
    color: NAVY,
  },
  teacherMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotSaved: { backgroundColor: "#16845B" },
  statusDotPending: { backgroundColor: "#D99122" },
  statusDotEmpty: { backgroundColor: "#A0AEC0" },
  teacherMeta: {
    fontSize: 11,
    color: MUTED,
    fontWeight: "600",
  },
  optionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 17,
    marginBottom: 9,
  },
  optionHeading: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  optionHint: {
    color: "#9AA4B2",
    fontSize: 10,
    fontWeight: "500",
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  option: {
    flexGrow: 1,
    flexBasis: "28%",
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FCFBFF",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  optionText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
  },
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 22,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    shadowColor: "#25164D",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 12,
  },
  saveButton: {
    borderRadius: 17,
    overflow: "hidden",
  },
  saveButtonGradient: {
    minHeight: 56,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "900",
    flex: 1,
    textAlign: "center",
  },
  bottomHint: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  muted: {
    color: MUTED,
    fontSize: 14,
  },
  empty: {
    backgroundColor: WHITE,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 42,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: MUTED,
    fontWeight: "600",
  },
});
