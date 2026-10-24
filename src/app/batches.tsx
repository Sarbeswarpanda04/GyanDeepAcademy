
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import InstituteHeader from "../components/InstituteHeader";
import FloatingTabBar from "../components/FloatingTabBar";
import AppAlert, { type AppAlertType } from "../components/AppAlert";

type BatchType = "morning" | "evening" | "custom";

type WeekDay = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

const WEEK_DAYS: WeekDay[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DEFAULT_DAYS: WeekDay[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

type AppAlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: AppAlertType;
  confirmLabel?: string;
};

type BatchPeriod = {
  id?: string;
  period_number: number;
  start_time: string;
  end_time: string;
};

type Batch = {
  id: string;
  institute_id: string;
  name: string;
  batch_type: BatchType;
  start_time: string;
  end_time: string;
  is_active: boolean;
  days_of_week: WeekDay[];
  created_at: string;
};

const NAVY = "#172B4D";
const GOLD = "#D6A84F";
const BG = "#F5F7FB";
const MUTED = "#748094";
const BORDER = "#E2E7EF";
const GREEN = "#18865B";
const RED = "#D64545";

function timeToDisplay(value: string) {
  const parts = value.slice(0, 5).split(":");
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);

  if (
    parts.length !== 2 ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return value;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function normalizeTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function typeLabel(type: BatchType) {
  if (type === "morning") return "Morning";
  if (type === "evening") return "Evening";
  return "Custom";
}

export default function BatchesScreen() {
  const insets = useSafeAreaInsets();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [instituteId, setInstituteId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [appAlert, setAppAlert] = useState<AppAlertState>({
    visible: false,
    title: "",
    message: "",
    type: "info",
    confirmLabel: "OK",
  });

  const showAppAlert = useCallback((
    title: string,
    message: string,
    type: AppAlertType = "info",
    confirmLabel = "OK"
  ) => {
    setAppAlert({ visible: true, title, message, type, confirmLabel });
  }, []);

  const closeAppAlert = useCallback(() => {
    setAppAlert((current) => ({ ...current, visible: false }));
  }, []);

  const [formVisible, setFormVisible] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [menuBatch, setMenuBatch] = useState<Batch | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<Batch | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "delete" | "toggle" | null
  >(null);

  const [name, setName] = useState("");
  const [batchType, setBatchType] = useState<BatchType>("morning");
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("09:00");
  const [active, setActive] = useState(true);
  const [selectedDays, setSelectedDays] = useState<WeekDay[]>(DEFAULT_DAYS);
  const [periods, setPeriods] = useState<BatchPeriod[]>([
    { period_number: 1, start_time: "07:00", end_time: "07:45" },
    { period_number: 2, start_time: "07:45", end_time: "08:30" },
    { period_number: 3, start_time: "08:30", end_time: "09:15" },
  ]);

  const loadBatches = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

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

      // Use the current user's institute membership.
      const { data: memberships, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id, role")
        .eq("user_id", user.id)
        .limit(2);

      if (membershipError) throw membershipError;

      if (!memberships || memberships.length === 0) {
        setInstituteId(null);
        setBatches([]);
        setCanManage(false);
        return;
      }

      // This version supports one active institute per signed-in session.
      // If the user belongs to multiple institutes, select the correct
      // institute from your institute switcher before loading this page.
      if (memberships.length > 1) {
        showAppAlert(
          "Choose an institute",
          "Your account belongs to multiple institutes. Open your institute selector and choose an institute before managing batches.",
          "warning"
        );
        setInstituteId(null);
        setBatches([]);
        setCanManage(false);
        return;
      }

      const membership = memberships[0];
      setInstituteId(membership.institute_id);
      setCanManage(
        membership.role === "owner" || membership.role === "manager"
      );

      const { data, error } = await supabase
        .from("institute_batches")
        .select(
          "id, institute_id, name, batch_type, start_time, end_time, is_active, days_of_week, created_at"
        )
        .eq("institute_id", membership.institute_id)
        .order("start_time", { ascending: true });

      if (error) throw error;

      setBatches((data ?? []) as Batch[]);
    } catch (error: any) {
      showAppAlert(
        "Unable to load batches",
        error?.message ?? "Please check your connection and try again.",
        "error"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBatches();
    }, [loadBatches])
  );

  const resetForm = () => {
    setName("");
    setBatchType("morning");
    setStartTime("07:00");
    setEndTime("09:00");
    setActive(true);
    setSelectedDays(DEFAULT_DAYS);
    setPeriods([
      { period_number: 1, start_time: "07:00", end_time: "07:45" },
      { period_number: 2, start_time: "07:45", end_time: "08:30" },
      { period_number: 3, start_time: "08:30", end_time: "09:15" },
    ]);
    setEditingBatch(null);
  };

  const openCreateForm = () => {
    resetForm();
    setFormVisible(true);
  };

  const openEditForm = async (batch: Batch) => {
    setEditingBatch(batch);
    setName(batch.name);
    setBatchType(batch.batch_type);
    setStartTime(batch.start_time.slice(0, 5));
    setEndTime(batch.end_time.slice(0, 5));
    setActive(batch.is_active);
    setSelectedDays((batch.days_of_week ?? DEFAULT_DAYS) as WeekDay[]);
    setMenuBatch(null);
    setFormVisible(true);
    try {
      const { data, error } = await supabase
        .from("institute_batch_periods")
        .select("id, period_number, start_time, end_time")
        .eq("batch_id", batch.id)
        .eq("institute_id", batch.institute_id)
        .order("period_number", { ascending: true });

      if (error) throw error;
      setPeriods(
        (data ?? []).map((period: any) => ({
          id: period.id,
          period_number: period.period_number,
          start_time: String(period.start_time).slice(0, 5),
          end_time: String(period.end_time).slice(0, 5),
        }))
      );
    } catch (error: any) {
      showAppAlert(
        "Unable to load periods",
        error?.message ?? "Please check the batch-period table in Supabase.",
        "error"
      );
      setPeriods([]);
    }
  };

  const toggleDay = (day: WeekDay) => {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : WEEK_DAYS.filter((item) => [...current, day].includes(item))
    );
  };

  const setPeriodCount = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!value.trim()) {
      setPeriods([]);
      return;
    }
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 20) return;

    setPeriods((current) => {
      if (parsed <= current.length) {
        return current.slice(0, parsed).map((period, index) => ({
          ...period,
          period_number: index + 1,
        }));
      }
      const next = [...current];
      for (let index = current.length; index < parsed; index += 1) {
        const startMinutes = 7 * 60 + index * 45;
        const endMinutes = startMinutes + 45;
        const format = (minutes: number) =>
          `${String(Math.floor((minutes % 1440) / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        next.push({
          period_number: index + 1,
          start_time: format(startMinutes),
          end_time: format(endMinutes),
        });
      }
      return next.map((period, index) => ({ ...period, period_number: index + 1 }));
    });
  };

  const updatePeriod = (
    index: number,
    field: "start_time" | "end_time",
    value: string
  ) => {
    setPeriods((current) =>
      current.map((period, periodIndex) =>
        periodIndex === index ? { ...period, [field]: value } : period
      )
    );
  };

  const closeForm = () => {
    if (saving) return;
    setFormVisible(false);
    resetForm();
  };

  const saveBatch = async () => {
    if (!canManage || !instituteId) {
      showAppAlert(
        "Permission required",
        "Only institute owners and managers can create or edit batches.",
        "warning"
      );
      return;
    }

    const cleanName = name.trim();
    const normalizedStart = normalizeTime(startTime);
    const normalizedEnd = normalizeTime(endTime);

    if (selectedDays.length === 0) {
      showAppAlert("Choose class days", "Select at least one day of the week for this batch.", "warning");
      return;
    }
    if (!cleanName) {
      showAppAlert("Batch name required", "Enter a name for this batch.", "warning");
      return;
    }
    if (!normalizedStart || !normalizedEnd) {
      showAppAlert("Invalid time", "Enter valid 24-hour times, for example 07:00 and 09:30.", "warning");
      return;
    }
    if (normalizedStart === normalizedEnd) {
      showAppAlert("Invalid duration", "The batch start time and end time cannot be the same.", "warning");
      return;
    }
    if (periods.length > 20) {
      showAppAlert("Too many periods", "A batch can have up to 20 periods.", "warning");
      return;
    }

    const normalizedPeriods: Array<{
      institute_id: string;
      batch_id: string;
      period_number: number;
      start_time: string;
      end_time: string;
    }> = [];

    for (let index = 0; index < periods.length; index += 1) {
      const period = periods[index];
      const periodStart = normalizeTime(period.start_time);
      const periodEnd = normalizeTime(period.end_time);
      if (!periodStart || !periodEnd || periodStart === periodEnd) {
        showAppAlert(
          "Invalid period time",
          `Enter valid start and end times for Period ${index + 1}.`,
          "warning"
        );
        return;
      }
      normalizedPeriods.push({
        institute_id: instituteId,
        batch_id: editingBatch?.id ?? "",
        period_number: index + 1,
        start_time: periodStart,
        end_time: periodEnd,
      });
    }

    setSaving(true);
    try {
      const payload = {
        institute_id: instituteId,
        name: cleanName,
        batch_type: batchType,
        start_time: normalizedStart,
        end_time: normalizedEnd,
        is_active: active,
        days_of_week: WEEK_DAYS.filter((day) => selectedDays.includes(day)),
      };

      let batchId = editingBatch?.id;
      if (editingBatch) {
        const { error } = await supabase
          .from("institute_batches")
          .update(payload)
          .eq("id", editingBatch.id)
          .eq("institute_id", instituteId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("institute_batches")
          .insert(payload)
          .select("id")
          .single();
        if (error) {
          if (error.code === "23505") {
            throw new Error("A batch with this name already exists in your institute.");
          }
          throw error;
        }
        batchId = data.id;
      }

      if (!batchId) throw new Error("Batch saved, but its ID could not be determined.");

      // Replace the batch's period schedule so edits and deletions stay in sync.
      const { error: deletePeriodsError } = await supabase
        .from("institute_batch_periods")
        .delete()
        .eq("batch_id", batchId)
        .eq("institute_id", instituteId);
      if (deletePeriodsError) throw deletePeriodsError;

      if (normalizedPeriods.length) {
        const rowsToInsert = normalizedPeriods.map((period) => ({
          ...period,
          batch_id: batchId,
        }));
        const { error: insertPeriodsError } = await supabase
          .from("institute_batch_periods")
          .insert(rowsToInsert);
        if (insertPeriodsError) throw insertPeriodsError;
      }

      setFormVisible(false);
      resetForm();
      await loadBatches(false);
      showAppAlert("Success", editingBatch ? "Batch updated successfully." : "Batch created successfully.", "success");
    } catch (error: any) {
      showAppAlert("Could not save batch", error?.message ?? "Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const performConfirmedAction = async () => {
    if (!confirmBatch || !confirmAction || !instituteId || !canManage) return;

    const target = confirmBatch;
    const action = confirmAction;

    setConfirmBatch(null);
    setConfirmAction(null);
    setSaving(true);

    try {
      if (action === "delete") {
        const { error } = await supabase
          .from("institute_batches")
          .delete()
          .eq("id", target.id)
          .eq("institute_id", instituteId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("institute_batches")
          .update({ is_active: !target.is_active })
          .eq("id", target.id)
          .eq("institute_id", instituteId);

        if (error) throw error;
      }

      await loadBatches(false);

      showAppAlert(
        "Success",
        action === "delete"
          ? "Batch deleted successfully."
          : target.is_active
            ? "Batch deactivated."
            : "Batch activated.",
        "success"
      );
    } catch (error: any) {
      showAppAlert(
        "Action failed",
        error?.message ?? "Please try again.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const renderBatch = ({ item }: { item: Batch }) => (
    <View style={styles.batchCard}>
      <View style={styles.cardTop}>
        <View style={styles.batchIcon}>
          <Feather name="users" size={21} color={NAVY} />
        </View>

        <View style={styles.batchInfo}>
          <Text style={styles.batchName}>{item.name}</Text>
          <Text style={styles.batchType}>{typeLabel(item.batch_type)} batch</Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            item.is_active ? styles.activeBadge : styles.inactiveBadge,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: item.is_active ? GREEN : MUTED },
            ]}
          >
            {item.is_active ? "Active" : "Inactive"}
          </Text>
        </View>

        {canManage && (
          <Pressable
            style={styles.moreButton}
            onPress={() => setMenuBatch(item)}
            hitSlop={8}
          >
            <Feather name="more-vertical" size={20} color={NAVY} />
          </Pressable>
        )}
      </View>

      <View style={styles.timePanel}>
        <View style={styles.timeCell}>
          <Feather name="sunrise" size={16} color={GOLD} />
          <View>
            <Text style={styles.timeLabel}>START TIME</Text>
            <Text style={styles.timeValue}>
              {timeToDisplay(item.start_time)}
            </Text>
          </View>
        </View>

        <View style={styles.timeDivider} />

        <View style={styles.timeCell}>
          <Feather name="sunset" size={16} color={GOLD} />
          <View>
            <Text style={styles.timeLabel}>END TIME</Text>
            <Text style={styles.timeValue}>
              {timeToDisplay(item.end_time)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <InstituteHeader subtitle="Batch management" />

      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <Text style={styles.pageTitle}>Batches</Text>
          <Text style={styles.pageSubtitle}>
            Organize classes by schedule and timing
          </Text>
        </View>

        {canManage && (
          <Pressable style={styles.addButton} onPress={openCreateForm}>
            <Feather name="plus" size={18} color={NAVY} />
            <Text style={styles.addButtonText}>Create</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{batches.length}</Text>
          <Text style={styles.summaryLabel}>Total batches</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>
            {batches.filter((batch) => batch.is_active).length}
          </Text>
          <Text style={styles.summaryLabel}>Active batches</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>
            {batches.filter((batch) => !batch.is_active).length}
          </Text>
          <Text style={styles.summaryLabel}>Inactive batches</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={styles.stateText}>Loading batches...</Text>
        </View>
      ) : !instituteId ? (
        <View style={styles.centerState}>
          <Feather name="home" size={38} color={MUTED} />
          <Text style={styles.emptyTitle}>No institute selected</Text>
          <Text style={styles.stateText}>
            Open your institute setup or institute selector before managing
            batches.
          </Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => router.push("/settings")}
          >
            <Text style={styles.retryText}>Open Settings</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={batches}
          keyExtractor={(item) => item.id}
          renderItem={renderBatch}
          contentContainerStyle={[
            styles.listContent,
            batches.length === 0 && styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadBatches(false);
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Feather name="layers" size={34} color={NAVY} />
              </View>
              <Text style={styles.emptyTitle}>No batches yet</Text>
              <Text style={styles.stateText}>
                Create a morning, evening, or custom batch and set its
                schedule.
              </Text>
              {canManage && (
                <Pressable
                  style={styles.emptyCreateButton}
                  onPress={openCreateForm}
                >
                  <Feather name="plus" size={18} color={NAVY} />
                  <Text style={styles.addButtonText}>Create first batch</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}

      <FloatingTabBar />

      {/* Create / Edit Batch */}
      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeForm}
          />

          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 18) },
            ]}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>
                  {editingBatch ? "Edit batch" : "Create batch"}
                </Text>
                <Text style={styles.sheetSubtitle}>
                  Set the batch name and schedule
                </Text>
              </View>
              <Pressable
                onPress={closeForm}
                style={styles.closeButton}
                disabled={saving}
              >
                <Feather name="x" size={21} color={NAVY} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.formContent}
            >
              <Text style={styles.fieldLabel}>BATCH TYPE</Text>
              <View style={styles.typeRow}>
                {(
                  [
                    { key: "morning", label: "Morning", icon: "sunrise" },
                    { key: "evening", label: "Evening", icon: "sunset" },
                    { key: "custom", label: "Custom", icon: "clock" },
                  ] as const
                ).map((option) => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.typeOption,
                      batchType === option.key && styles.typeOptionSelected,
                    ]}
                    onPress={() => {
                      setBatchType(option.key);
                      if (option.key === "morning") {
                        setName("Morning Batch");
                        setStartTime("07:00");
                        setEndTime("09:00");
                      } else if (option.key === "evening") {
                        setName("Evening Batch");
                        setStartTime("16:00");
                        setEndTime("18:00");
                      } else if (
                        name === "Morning Batch" ||
                        name === "Evening Batch"
                      ) {
                        setName("");
                      }
                    }}
                  >
                    <Feather
                      name={option.icon}
                      size={18}
                      color={batchType === option.key ? GOLD : MUTED}
                    />
                    <Text
                      style={[
                        styles.typeOptionText,
                        batchType === option.key &&
                          styles.typeOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>BATCH NAME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Class 10 Morning Batch"
                placeholderTextColor="#A0A8B5"
                maxLength={80}
                returnKeyType="next"
              />

              <Text style={styles.fieldLabel}>CLASS DAYS</Text>
              <Text style={styles.daysHint}>Select every day this batch will run.</Text>
              <View style={styles.daysGrid}>
                {WEEK_DAYS.map((day) => {
                  const selected = selectedDays.includes(day);
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() => toggleDay(day)}
                      style={[styles.dayChip, selected && styles.dayChipSelected]}
                    >
                      {selected ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
                      <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>
                        {day.slice(0, 3)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>BATCH TIMING</Text>
              <View style={styles.timeInputRow}>
                <View style={styles.timeInputColumn}>
                  <Text style={styles.inputHint}>Start time (24-hour)</Text>
                  <View style={styles.timeInputWrap}>
                    <Feather name="clock" size={17} color={GOLD} />
                    <TextInput
                      style={styles.timeInput}
                      value={startTime}
                      onChangeText={setStartTime}
                      placeholder="07:00"
                      placeholderTextColor="#A0A8B5"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                </View>

                <View style={styles.timeInputColumn}>
                  <Text style={styles.inputHint}>End time (24-hour)</Text>
                  <View style={styles.timeInputWrap}>
                    <Feather name="clock" size={17} color={GOLD} />
                    <TextInput
                      style={styles.timeInput}
                      value={endTime}
                      onChangeText={setEndTime}
                      placeholder="09:00"
                      placeholderTextColor="#A0A8B5"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.timeExample}>
                Example: 07:00 = 7:00 AM · 18:30 = 6:30 PM
              </Text>

              <Text style={styles.fieldLabel}>NUMBER OF PERIODS</Text>
              <TextInput
                style={styles.input}
                value={String(periods.length)}
                onChangeText={setPeriodCount}
                placeholder="e.g. 6"
                placeholderTextColor="#A0A8B5"
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.periodHint}>
                Set the count, then enter the start and end time for each period.
              </Text>

              {periods.map((period, index) => (
                <View key={period.id ?? period.period_number} style={styles.periodCard}>
                  <View style={styles.periodHeader}>
                    <View style={styles.periodNumber}>
                      <Text style={styles.periodNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.periodTitle}>Period {index + 1}</Text>
                  </View>
                  <View style={styles.timeInputRow}>
                    <View style={styles.timeInputColumn}>
                      <Text style={styles.inputHint}>Start time (24-hour)</Text>
                      <View style={styles.timeInputWrap}>
                        <Feather name="clock" size={16} color={GOLD} />
                        <TextInput
                          style={styles.timeInput}
                          value={period.start_time}
                          onChangeText={(value) => updatePeriod(index, "start_time", value)}
                          placeholder="07:00"
                          placeholderTextColor="#A0A8B5"
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                        />
                      </View>
                    </View>
                    <View style={styles.timeInputColumn}>
                      <Text style={styles.inputHint}>End time (24-hour)</Text>
                      <View style={styles.timeInputWrap}>
                        <Feather name="clock" size={16} color={GOLD} />
                        <TextInput
                          style={styles.timeInput}
                          value={period.end_time}
                          onChangeText={(value) => updatePeriod(index, "end_time", value)}
                          placeholder="07:45"
                          placeholderTextColor="#A0A8B5"
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              ))}

              <Pressable
                style={styles.activeToggleRow}
                onPress={() => setActive((value) => !value)}
              >
                <View style={styles.activeToggleText}>
                  <Text style={styles.toggleTitle}>Batch is active</Text>
                  <Text style={styles.toggleSubtitle}>
                    {active
                      ? "This batch will be available for use."
                      : "This batch will be marked inactive."}
                  </Text>
                </View>
                <View
                  style={[
                    styles.switchTrack,
                    active && styles.switchTrackActive,
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      active && styles.switchThumbActive,
                    ]}
                  />
                </View>
              </Pressable>

              <Pressable
                style={[
                  styles.saveButton,
                  saving && styles.disabledButton,
                ]}
                onPress={saveBatch}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={NAVY} />
                ) : (
                  <>
                    <Feather
                      name="check-circle"
                      size={18}
                      color={NAVY}
                    />
                    <Text style={styles.saveButtonText}>
                      {editingBatch ? "Save changes" : "Create batch"}
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Three-dot action menu */}
      <Modal
        visible={!!menuBatch}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuBatch(null)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuBatch(null)}
        >
          <View style={styles.menuSheet}>
            <Text style={styles.menuHeading}>{menuBatch?.name}</Text>

            <Pressable
              style={styles.menuItem}
              onPress={() => menuBatch && openEditForm(menuBatch)}
            >
              <Feather name="edit-2" size={18} color={NAVY} />
              <Text style={styles.menuItemText}>Edit batch</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                if (!menuBatch) return;
                setConfirmBatch(menuBatch);
                setConfirmAction("toggle");
                setMenuBatch(null);
              }}
            >
              <Feather
                name={menuBatch?.is_active ? "pause-circle" : "play-circle"}
                size={18}
                color={NAVY}
              />
              <Text style={styles.menuItemText}>
                {menuBatch?.is_active ? "Deactivate batch" : "Activate batch"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                if (!menuBatch) return;
                setConfirmBatch(menuBatch);
                setConfirmAction("delete");
                setMenuBatch(null);
              }}
            >
              <Feather name="trash-2" size={18} color={RED} />
              <Text style={[styles.menuItemText, { color: RED }]}>
                Delete batch
              </Text>
            </Pressable>

            <Pressable
              style={styles.cancelMenuButton}
              onPress={() => setMenuBatch(null)}
            >
              <Text style={styles.cancelMenuText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Confirm delete / activate / deactivate */}
      <Modal
        visible={!!confirmBatch && !!confirmAction}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setConfirmBatch(null);
          setConfirmAction(null);
        }}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View
              style={[
                styles.confirmIcon,
                confirmAction === "delete"
                  ? styles.deleteIcon
                  : styles.actionIcon,
              ]}
            >
              <Feather
                name={confirmAction === "delete" ? "trash-2" : "power"}
                size={25}
                color={confirmAction === "delete" ? RED : NAVY}
              />
            </View>

            <Text style={styles.confirmTitle}>
              {confirmAction === "delete"
                ? "Delete batch?"
                : confirmBatch?.is_active
                  ? "Deactivate batch?"
                  : "Activate batch?"}
            </Text>

            <Text style={styles.confirmDescription}>
              {confirmAction === "delete"
                ? `This will permanently delete "${confirmBatch?.name}". This action cannot be undone.`
                : confirmBatch?.is_active
                  ? `Are you sure you want to deactivate "${confirmBatch?.name}"?`
                  : `Do you want to activate "${confirmBatch?.name}"?`}
            </Text>

            <View style={styles.confirmActions}>
              <Pressable
                style={styles.confirmCancel}
                onPress={() => {
                  setConfirmBatch(null);
                  setConfirmAction(null);
                }}
                disabled={saving}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.confirmProceed,
                  confirmAction === "delete" && styles.confirmDelete,
                ]}
                onPress={performConfirmedAction}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmProceedText}>
                    {confirmAction === "delete"
                      ? "Delete"
                      : confirmBatch?.is_active
                        ? "Deactivate"
                        : "Activate"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <AppAlert
        visible={appAlert.visible}
        title={appAlert.title}
        message={appAlert.message}
        type={appAlert.type}
        confirmLabel={appAlert.confirmLabel ?? "OK"}
        onCancel={closeAppAlert}
        onConfirm={closeAppAlert}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  headingRow: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headingText: {
    flex: 1,
    paddingRight: 10,
  },
  pageTitle: {
    fontSize: 27,
    fontWeight: "800",
    color: NAVY,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 5,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GOLD,
    paddingHorizontal: 15,
    height: 43,
    borderRadius: 13,
    gap: 7,
  },
  addButtonText: {
    color: NAVY,
    fontWeight: "800",
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: NAVY,
    textAlign: "center",
  },
  summaryLabel: {
    fontSize: 10,
    color: MUTED,
    textAlign: "center",
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 3,
    paddingBottom: 120,
    gap: 12,
  },
  batchCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 15,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  batchIcon: {
    height: 43,
    width: 43,
    borderRadius: 13,
    backgroundColor: "#EEF2F8",
    alignItems: "center",
    justifyContent: "center",
  },
  batchInfo: {
    flex: 1,
  },
  batchDays: {
    color: "#53657D",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 5,
  },
  batchName: {
    fontSize: 15,
    fontWeight: "800",
    color: NAVY,
  },
  batchType: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  activeBadge: {
    backgroundColor: "#E7F6EE",
  },
  inactiveBadge: {
    backgroundColor: "#EEF0F4",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  moreButton: {
    width: 27,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  timePanel: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F8F9FC",
    flexDirection: "row",
    alignItems: "center",
  },
  timeCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  timeDivider: {
    height: 31,
    width: 1,
    backgroundColor: BORDER,
    marginHorizontal: 12,
  },
  timeLabel: {
    fontSize: 9,
    letterSpacing: 0.5,
    color: MUTED,
    fontWeight: "700",
  },
  timeValue: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingBottom: 100,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 30,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 25,
    backgroundColor: "#E9EEF6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: NAVY,
    textAlign: "center",
    marginTop: 14,
  },
  stateText: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: GOLD,
  },
  retryText: {
    color: NAVY,
    fontWeight: "800",
  },
  emptyCreateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 20,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(13,24,42,0.48)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 21,
    paddingTop: 10,
    maxHeight: "92%",
  },
  sheetHandle: {
    width: 43,
    height: 5,
    borderRadius: 5,
    backgroundColor: "#D9DEE7",
    alignSelf: "center",
    marginBottom: 18,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 21,
  },
  sheetTitle: {
    fontSize: 23,
    fontWeight: "800",
    color: NAVY,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 5,
  },
  closeButton: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: "#F0F3F8",
    alignItems: "center",
    justifyContent: "center",
  },
  formContent: {
    paddingBottom: 12,
  },
  fieldLabel: {
    color: NAVY,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.7,
    marginBottom: 9,
    marginTop: 5,
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 21,
  },
  typeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  typeOptionSelected: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  typeOptionText: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
  },
  typeOptionTextSelected: {
    color: "#FFFFFF",
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    minHeight: 49,
    paddingHorizontal: 14,
    fontSize: 14,
    color: NAVY,
    backgroundColor: "#FFFFFF",
    marginBottom: 21,
  },
  daysHint: {
    color: MUTED,
    fontSize: 11,
    marginTop: -3,
    marginBottom: 11,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 21,
  },
  dayChip: {
    minWidth: 69,
    minHeight: 40,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  dayChipSelected: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  dayChipText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
  },
  dayChipTextSelected: {
    color: "#FFFFFF",
  },
  timeInputRow: {
    flexDirection: "row",
    gap: 12,
  },
  timeInputColumn: {
    flex: 1,
  },
  inputHint: {
    color: MUTED,
    fontSize: 11,
    marginBottom: 8,
  },
  timeInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 49,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 11,
  },
  timeInput: {
    flex: 1,
    color: NAVY,
    fontSize: 15,
    fontWeight: "700",
    paddingVertical: 10,
  },
  timeExample: {
    color: MUTED,
    fontSize: 11,
    marginTop: 9,
    marginBottom: 17,
  },
  periodHint: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
    marginTop: -13,
    marginBottom: 14,
  },
  periodCard: {
    backgroundColor: "#F8F9FC",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    padding: 12,
    marginBottom: 10,
  },
  periodHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 12,
  },
  periodNumber: {
    width: 27,
    height: 27,
    borderRadius: 9,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  periodNumberText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  periodTitle: {
    color: NAVY,
    fontSize: 13,
    fontWeight: "800",
  },
  activeToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    padding: 14,
    marginBottom: 20,
  },
  activeToggleText: {
    flex: 1,
    paddingRight: 10,
  },
  toggleTitle: {
    color: NAVY,
    fontWeight: "800",
    fontSize: 13,
  },
  toggleSubtitle: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },
  switchTrack: {
    width: 44,
    height: 25,
    borderRadius: 15,
    backgroundColor: "#D7DCE5",
    padding: 3,
    justifyContent: "center",
  },
  switchTrackActive: {
    backgroundColor: GREEN,
  },
  switchThumb: {
    height: 19,
    width: 19,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  switchThumbActive: {
    alignSelf: "flex-end",
  },
  saveButton: {
    height: 51,
    backgroundColor: GOLD,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  disabledButton: {
    opacity: 0.65,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: NAVY,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(13,24,42,0.38)",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 28,
  },
  menuSheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 17,
  },
  menuHeading: {
    fontSize: 16,
    fontWeight: "800",
    color: NAVY,
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    minHeight: 49,
    borderTopWidth: 1,
    borderTopColor: "#F0F2F6",
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: NAVY,
  },
  cancelMenuButton: {
    marginTop: 10,
    backgroundColor: "#F1F3F7",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 13,
  },
  cancelMenuText: {
    fontWeight: "800",
    color: NAVY,
  },
  confirmBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(13,24,42,0.52)",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 23,
    alignItems: "center",
  },
  confirmIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  deleteIcon: {
    backgroundColor: "#FCEAEA",
  },
  actionIcon: {
    backgroundColor: "#E9EEF6",
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: NAVY,
    textAlign: "center",
  },
  confirmDescription: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 9,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
    width: "100%",
  },
  confirmCancel: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#F0F2F6",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelText: {
    color: NAVY,
    fontWeight: "800",
  },
  confirmProceed: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDelete: {
    backgroundColor: RED,
  },
  confirmProceedText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
