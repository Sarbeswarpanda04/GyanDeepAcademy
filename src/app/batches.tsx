
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

type BatchType = "morning" | "evening" | "custom";

type Batch = {
  id: string;
  institute_id: string;
  name: string;
  batch_type: BatchType;
  start_time: string;
  end_time: string;
  is_active: boolean;
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
        Alert.alert(
          "Choose an institute",
          "Your account belongs to multiple institutes. Open your institute selector and choose an institute before managing batches."
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
          "id, institute_id, name, batch_type, start_time, end_time, is_active, created_at"
        )
        .eq("institute_id", membership.institute_id)
        .order("start_time", { ascending: true });

      if (error) throw error;

      setBatches((data ?? []) as Batch[]);
    } catch (error: any) {
      Alert.alert(
        "Unable to load batches",
        error?.message ?? "Please check your connection and try again."
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
    setEditingBatch(null);
  };

  const openCreateForm = () => {
    resetForm();
    setFormVisible(true);
  };

  const openEditForm = (batch: Batch) => {
    setEditingBatch(batch);
    setName(batch.name);
    setBatchType(batch.batch_type);
    setStartTime(batch.start_time.slice(0, 5));
    setEndTime(batch.end_time.slice(0, 5));
    setActive(batch.is_active);
    setMenuBatch(null);
    setFormVisible(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormVisible(false);
    resetForm();
  };

  const saveBatch = async () => {
    if (!canManage || !instituteId) {
      Alert.alert(
        "Permission required",
        "Only institute owners and managers can create or edit batches."
      );
      return;
    }

    const cleanName = name.trim();
    const normalizedStart = normalizeTime(startTime);
    const normalizedEnd = normalizeTime(endTime);

    if (!cleanName) {
      Alert.alert("Batch name required", "Enter a name for this batch.");
      return;
    }

    if (!normalizedStart || !normalizedEnd) {
      Alert.alert(
        "Invalid time",
        "Enter valid 24-hour times, for example 07:00 and 09:30."
      );
      return;
    }

    if (normalizedStart === normalizedEnd) {
      Alert.alert(
        "Invalid duration",
        "The batch start time and end time cannot be the same."
      );
      return;
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
      };

      let error;

      if (editingBatch) {
        const result = await supabase
          .from("institute_batches")
          .update(payload)
          .eq("id", editingBatch.id)
          .eq("institute_id", instituteId);

        error = result.error;
      } else {
        const result = await supabase
          .from("institute_batches")
          .insert(payload);

        error = result.error;
      }

      if (error) {
        if (error.code === "23505") {
          throw new Error(
            "A batch with this name already exists in your institute."
          );
        }
        throw error;
      }

      setFormVisible(false);
      resetForm();
      await loadBatches(false);

      Alert.alert(
        "Success",
        editingBatch
          ? "Batch updated successfully."
          : "Batch created successfully."
      );
    } catch (error: any) {
      Alert.alert(
        "Could not save batch",
        error?.message ?? "Please try again."
      );
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

      Alert.alert(
        "Success",
        action === "delete"
          ? "Batch deleted successfully."
          : target.is_active
            ? "Batch deactivated."
            : "Batch activated."
      );
    } catch (error: any) {
      Alert.alert(
        "Action failed",
        error?.message ?? "Please try again."
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
    ...StyleSheet.absoluteFillObject,
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
