import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";

const NAVY = "#172B4D";
const BG = "#F4F7FB";
const MUTED = "#77869A";
const BORDER = "#E5EAF1";
const WHITE = "#FFFFFF";
const GREEN = "#15966A";
const RED = "#D9535D";
const BLUE = "#4263EB";
const PURPLE = "#8B5CF6";

type FeePayment = {
  id: string;
  amount_paid: number | string | null;
  payment_date: string;
};
type SalaryPayout = {
  id: string;
  amount: number | string | null;
  paid_date: string;
};
type Expense = {
  id: string;
  name: string;
  total_amount: number | string | null;
  purchase_date: string;
  payment_mode?: string | null;
};

const numeric = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// Supabase projects commonly cap a response at 1,000 rows. Fetch in pages so
// the all-time wallet balance does not silently omit older transactions.
async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => any,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) throw error;

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

const money = (value: number) =>
  `₹${Math.round((value + Number.EPSILON) * 100) / 100}`.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );

const monthStart = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;

const monthEnd = (date: Date) => {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
};

const prettyMonth = (date: Date) =>
  date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

const isInMonth = (value: string, month: Date) => {
  const date = String(value ?? "").slice(0, 10);
  const start = monthStart(month);
  const nextMonthStart = monthStart(
    new Date(month.getFullYear(), month.getMonth() + 1, 1),
  );
  return date >= start && date < nextMonthStart;
};

function MetricCard({
  icon,
  label,
  amount,
  tint,
  iconColor,
  caption,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  amount: number;
  tint: string;
  iconColor: string;
  caption?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: tint }]}>
        <Feather name={icon} size={19} color={iconColor} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricAmount} numberOfLines={1} adjustsFontSizeToFit>
        {money(amount)}
      </Text>
      {!!caption && <Text style={styles.metricCaption}>{caption}</Text>}
    </View>
  );
}

export default function WalletScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [instituteName, setInstituteName] = useState("Institute Wallet");
  const [collections, setCollections] = useState<FeePayment[]>([]);
  const [payouts, setPayouts] = useState<SalaryPayout[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const loadWallet = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setErrorMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user)
        throw new Error("Please sign in again to view the institute wallet.");

      const { data: membership, error: membershipError } = await supabase
        .from("institute_members")
        .select("institute_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership?.institute_id) {
        throw new Error("No institute is linked to this account.");
      }

      const instituteId = String(membership.institute_id);
      const [instituteResult, feeRows, payoutRows, expenseRows] =
        await Promise.all([
          supabase
            .from("institutes")
            .select("name")
            .eq("id", instituteId)
            .maybeSingle(),
          fetchAllRows<FeePayment>((from, to) =>
            supabase
              .from("institute_fee_payments")
              .select("id, amount_paid, payment_date")
              .eq("institute_id", instituteId)
              .order("payment_date", { ascending: false })
              .range(from, to),
          ),
          fetchAllRows<SalaryPayout>((from, to) =>
            supabase
              .from("staff_payouts")
              .select("id, amount, paid_date")
              .eq("institute_id", instituteId)
              .order("paid_date", { ascending: false })
              .range(from, to),
          ),
          fetchAllRows<Expense>((from, to) =>
            supabase
              .from("institute_expenses")
              .select("id, name, total_amount, purchase_date, payment_mode")
              .eq("institute_id", instituteId)
              .order("purchase_date", { ascending: false })
              .range(from, to),
          ),
        ]);

      if (instituteResult.data?.name)
        setInstituteName(instituteResult.data.name);
      setCollections(feeRows);
      setPayouts(payoutRows);
      setExpenses(expenseRows);
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
          : [details?.message, details?.details, details?.hint, details?.code]
              .filter(Boolean)
              .join("\n") || "Could not load wallet data.";
      console.error("Wallet load failed:", error);
      setErrorMessage(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWallet(true);
    }, [loadWallet]),
  );

  const today = new Date();
  const currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const selectedMonthLabel = prettyMonth(selectedMonth);
  const isCurrentMonth =
    selectedMonth.getFullYear() === currentMonthDate.getFullYear() &&
    selectedMonth.getMonth() === currentMonthDate.getMonth();

  const changeMonth = (offset: number) => {
    setSelectedMonth((previous) =>
      new Date(previous.getFullYear(), previous.getMonth() + offset, 1),
    );
  };

  const summary = useMemo(() => {
    const allCollected = collections.reduce(
      (sum, row) => sum + numeric(row.amount_paid),
      0,
    );
    const allSalaryPaid = payouts.reduce(
      (sum, row) => sum + numeric(row.amount),
      0,
    );
    const allExpenses = expenses.reduce(
      (sum, row) => sum + numeric(row.total_amount),
      0,
    );

    const thisMonthCollections = collections
      .filter((row) => isInMonth(row.payment_date, selectedMonth))
      .reduce((sum, row) => sum + numeric(row.amount_paid), 0);
    const thisMonthSalary = payouts
      .filter((row) => isInMonth(row.paid_date, selectedMonth))
      .reduce((sum, row) => sum + numeric(row.amount), 0);
    const thisMonthExpenses = expenses
      .filter((row) => isInMonth(row.purchase_date, selectedMonth))
      .reduce((sum, row) => sum + numeric(row.total_amount), 0);

    return {
      allCollected,
      allSalaryPaid,
      allExpenses,
      totalBalance: allCollected - allSalaryPaid - allExpenses,
      thisMonthCollections,
      thisMonthSalary,
      thisMonthExpenses,
      monthBalance: thisMonthCollections - thisMonthSalary - thisMonthExpenses,
    };
  }, [collections, payouts, expenses, selectedMonth]);

  const recentActivity = useMemo(() => {
    const rows = [
      ...collections.map((row) => ({
        id: `fee-${row.id}`,
        title: "Student fee collected",
        date: row.payment_date,
        amount: numeric(row.amount_paid),
        kind: "income" as const,
        icon: "trending-up" as const,
      })),
      ...payouts.map((row) => ({
        id: `salary-${row.id}`,
        title: "Staff salary paid",
        date: row.paid_date,
        amount: numeric(row.amount),
        kind: "expense" as const,
        icon: "users" as const,
      })),
      ...expenses.map((row) => ({
        id: `expense-${row.id}`,
        title: row.name || "Institute expense",
        date: row.purchase_date,
        amount: numeric(row.total_amount),
        kind: "expense" as const,
        icon: "shopping-bag" as const,
      })),
    ];
    return rows
      .filter((row) => isInMonth(row.date, selectedMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [collections, payouts, expenses, selectedMonth]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadWallet(false);
            }}
            tintColor={GREEN}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerIcon}>
              <Feather name="briefcase" size={21} color={WHITE} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>MANAGE INSTITUTE</Text>
              <Text style={styles.headerTitle}>Wallet</Text>
              <Text style={styles.headerSubtitle}>
                {instituteName} · Financial overview
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh wallet"
              style={styles.refreshButton}
              onPress={() => {
                setRefreshing(true);
                void loadWallet(false);
              }}
            >
              <Feather name="refresh-cw" size={18} color={WHITE} />
            </Pressable>
          </View>
          <View style={styles.balanceCard}>
            <View style={styles.balanceTopRow}>
              <View>
                <Text style={styles.balanceLabel}>TOTAL WALLET BALANCE</Text>
                <Text style={styles.balanceHint}>
                  Collected − salary paid − expenses
                </Text>
              </View>
              <View style={styles.walletBadge}>
                <Feather name="shield" size={14} color="#B9F6D8" />
                <Text style={styles.walletBadgeText}>Overview</Text>
              </View>
            </View>
            {loading ? (
              <ActivityIndicator color={WHITE} style={styles.balanceLoader} />
            ) : (
              <Text
                style={styles.balanceAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {money(summary.totalBalance)}
              </Text>
            )}
            <View style={styles.balanceDivider} />
            <View style={styles.balanceFooter}>
              <View>
                <Text style={styles.balanceFooterLabel}>Total collected</Text>
                <Text style={styles.balanceFooterValue}>
                  {money(summary.allCollected)}
                </Text>
              </View>
              <View style={styles.balanceFooterRight}>
                <Text style={styles.balanceFooterLabel}>Total outflow</Text>
                <Text style={styles.balanceFooterValue}>
                  {money(summary.allSalaryPaid + summary.allExpenses)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {errorMessage ? (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={20} color={RED} />
              <View style={styles.errorCopy}>
                <Text style={styles.errorTitle}>Unable to load wallet</Text>
                <Text style={styles.errorText}>{errorMessage}</Text>
                <Pressable
                  style={styles.retryButton}
                  onPress={() => void loadWallet(true)}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeading}>
            <View style={styles.monthHeadingCopy}>
              <Text style={styles.sectionTitle}>Monthly summary</Text>
              <Text style={styles.sectionSubtitle}>{selectedMonthLabel}</Text>
            </View>
            <View style={styles.monthControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View previous month"
                style={styles.monthArrow}
                onPress={() => changeMonth(-1)}
              >
                <Feather name="chevron-left" size={21} color={NAVY} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View next month"
                disabled={isCurrentMonth}
                style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]}
                onPress={() => changeMonth(1)}
              >
                <Feather name="chevron-right" size={21} color={isCurrentMonth ? "#B8C1CC" : NAVY} />
              </Pressable>
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <MetricCard
              icon="activity"
              label="Monthly net balance"
              amount={summary.monthBalance}
              tint="#E2F8EE"
              iconColor={GREEN}
              caption="Selected month net cash flow"
            />
            <MetricCard
              icon="download"
              label="Student fee collection"
              amount={summary.thisMonthCollections}
              tint="#E8EEFF"
              iconColor={BLUE}
              caption="Fees received in selected month"
            />
            <MetricCard
              icon="users"
              label="Staff salary paid"
              amount={summary.thisMonthSalary}
              tint="#F0E9FF"
              iconColor={PURPLE}
              caption="Salary paid in selected month"
            />
            <MetricCard
              icon="shopping-bag"
              label="Other expenses"
              amount={summary.thisMonthExpenses}
              tint="#FFE9E8"
              iconColor={RED}
              caption="Expenses in selected month"
            />
          </View>

          <View style={styles.breakdownCard}>
            <View style={styles.breakdownTitleRow}>
              <View style={styles.breakdownIcon}>
                <Feather name="pie-chart" size={18} color={NAVY} />
              </View>
              <View style={styles.breakdownTitleCopy}>
                <Text style={styles.breakdownTitle}>Monthly cash flow</Text>
                <Text style={styles.breakdownSubtitle}>For {selectedMonthLabel}</Text>
              </View>
            </View>

            <View style={styles.flowRow}>
              <View style={[styles.flowSymbol, { backgroundColor: "#E2F8EE" }]}>
                <Feather name="plus" size={17} color={GREEN} />
              </View>
              <View style={styles.flowCopy}>
                <Text style={styles.flowTitle}>Student fee collection</Text>
                <Text style={styles.flowSubtitle}>Income</Text>
              </View>
              <Text style={[styles.flowAmount, { color: GREEN }]}>
                +{money(summary.thisMonthCollections)}
              </Text>
            </View>
            <View style={styles.flowLine} />
            <View style={styles.flowRow}>
              <View style={[styles.flowSymbol, { backgroundColor: "#F0E9FF" }]}>
                <Feather name="users" size={17} color={PURPLE} />
              </View>
              <View style={styles.flowCopy}>
                <Text style={styles.flowTitle}>Staff salary</Text>
                <Text style={styles.flowSubtitle}>Salary paid in selected month</Text>
              </View>
              <Text style={[styles.flowAmount, { color: RED }]}>
                −{money(summary.thisMonthSalary)}
              </Text>
            </View>
            <View style={styles.flowLine} />
            <View style={styles.flowRow}>
              <View style={[styles.flowSymbol, { backgroundColor: "#FFE9E8" }]}>
                <Feather name="shopping-bag" size={17} color={RED} />
              </View>
              <View style={styles.flowCopy}>
                <Text style={styles.flowTitle}>Other expenses</Text>
                <Text style={styles.flowSubtitle}>
                  Purchases and operating costs
                </Text>
              </View>
              <Text style={[styles.flowAmount, { color: RED }]}>
                −{money(summary.thisMonthExpenses)}
              </Text>
            </View>

            <View style={styles.netRow}>
              <View>
                <Text style={styles.netLabel}>Net for {selectedMonthLabel}</Text>
                <Text style={styles.netHint}>
                  Monthly collections less monthly outflow
                </Text>
              </View>
              <Text
                style={[
                  styles.netAmount,
                  { color: summary.monthBalance < 0 ? RED : GREEN },
                ]}
              >
                {money(summary.monthBalance)}
              </Text>
            </View>
          </View>

          <View style={styles.activityHeader}>
            <View>
              <Text style={styles.sectionTitle}>Recent activity</Text>
              <Text style={styles.sectionSubtitle}>
                Transactions for {selectedMonthLabel}
              </Text>
            </View>
            <View style={styles.activityIcon}>
              <Feather name="clock" size={17} color={NAVY} />
            </View>
          </View>

          <View style={styles.activityCard}>
            {loading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={GREEN} />
                <Text style={styles.emptyText}>Loading wallet activity…</Text>
              </View>
            ) : recentActivity.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Feather name="inbox" size={24} color={MUTED} />
                </View>
                <Text style={styles.emptyTitle}>No transactions for this month</Text>
                <Text style={styles.emptyText}>
                  Student fee payments, staff payouts and expenses recorded in {selectedMonthLabel} will appear here.
                </Text>
              </View>
            ) : (
              recentActivity.map((item, index) => (
                <View key={item.id}>
                  <View style={styles.activityRow}>
                    <View
                      style={[
                        styles.activityItemIcon,
                        {
                          backgroundColor:
                            item.kind === "income" ? "#E2F8EE" : "#FFF0EF",
                        },
                      ]}
                    >
                      <Feather
                        name={item.icon}
                        size={17}
                        color={item.kind === "income" ? GREEN : RED}
                      />
                    </View>
                    <View style={styles.activityCopy}>
                      <Text style={styles.activityTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.activityDate}>{item.date}</Text>
                    </View>
                    <Text
                      style={[
                        styles.activityAmount,
                        { color: item.kind === "income" ? GREEN : RED },
                      ]}
                    >
                      {item.kind === "income" ? "+" : "−"}
                      {money(item.amount)}
                    </Text>
                  </View>
                  {index < recentActivity.length - 1 && (
                    <View style={styles.activityDivider} />
                  )}
                </View>
              ))
            )}
          </View>

          <Text style={styles.disclaimer}>
            Monthly net is calculated as collections minus salaries and expenses
            recorded in the selected calendar month. It does not include the
            opening wallet balance. All-time balance uses all records returned
            by Supabase for the institute.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  scrollContent: { paddingBottom: 34 },
  header: {
    backgroundColor: NAVY,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: "#B8C8DE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  headerTitle: { color: WHITE, fontSize: 27, fontWeight: "800", marginTop: 2 },
  headerSubtitle: { color: "#C8D4E4", fontSize: 12, marginTop: 3 },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  balanceCard: {
    marginTop: 23,
    padding: 19,
    borderRadius: 23,
    backgroundColor: "#243D5D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  balanceTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  balanceLabel: {
    color: "#D4E1F1",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  balanceHint: { color: "#A9BCD4", fontSize: 11, marginTop: 6 },
  walletBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "rgba(21,150,106,0.18)",
  },
  walletBadgeText: { color: "#B9F6D8", fontSize: 10, fontWeight: "700" },
  balanceAmount: {
    color: WHITE,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 17,
  },
  balanceLoader: { alignSelf: "flex-start", marginTop: 20, marginBottom: 5 },
  balanceDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.13)",
    marginVertical: 18,
  },
  balanceFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  balanceFooterRight: { alignItems: "flex-end" },
  balanceFooterLabel: { color: "#A9BCD4", fontSize: 11 },
  balanceFooterValue: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 5,
  },
  body: { paddingHorizontal: 16, paddingTop: 23 },
  errorCard: {
    flexDirection: "row",
    gap: 11,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFF0EF",
    borderWidth: 1,
    borderColor: "#FFD5D2",
    marginBottom: 20,
  },
  errorCopy: { flex: 1 },
  errorTitle: { color: NAVY, fontSize: 14, fontWeight: "800" },
  errorText: { color: "#8D4141", fontSize: 12, lineHeight: 18, marginTop: 5 },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: WHITE,
  },
  retryText: { color: NAVY, fontSize: 12, fontWeight: "800" },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 8,
  },
  sectionTitle: { color: NAVY, fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { color: MUTED, fontSize: 12, marginTop: 4 },
  monthHeadingCopy: { flex: 1 },
  monthControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthArrow: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  monthArrowDisabled: { backgroundColor: "#F0F3F7" },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#E5F8EF",
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  livePillText: {
    color: "#137A58",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  metricCard: {
    width: "48%",
    flexGrow: 1,
    minWidth: "46%",
    backgroundColor: WHITE,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 143,
  },
  metricIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  metricLabel: { color: MUTED, fontSize: 11, fontWeight: "600", minHeight: 28 },
  metricAmount: { color: NAVY, fontSize: 21, fontWeight: "800", marginTop: 4 },
  metricCaption: { color: "#9AA6B6", fontSize: 10, marginTop: 5 },
  breakdownCard: {
    backgroundColor: WHITE,
    borderRadius: 21,
    padding: 17,
    marginTop: 22,
    borderWidth: 1,
    borderColor: BORDER,
  },
  breakdownTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 12,
  },
  breakdownIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: "#EEF2F8",
    alignItems: "center",
    justifyContent: "center",
  },
  breakdownTitleCopy: { flex: 1 },
  breakdownTitle: { color: NAVY, fontSize: 15, fontWeight: "800" },
  breakdownSubtitle: { color: MUTED, fontSize: 11, marginTop: 3 },
  flowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  flowSymbol: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  flowCopy: { flex: 1 },
  flowTitle: { color: NAVY, fontSize: 12, fontWeight: "700" },
  flowSubtitle: { color: MUTED, fontSize: 10, marginTop: 4 },
  flowAmount: { fontSize: 12, fontWeight: "800" },
  flowLine: { height: 1, backgroundColor: "#EFF2F6", marginLeft: 47 },
  netRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 10,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#F5F8FC",
  },
  netLabel: { color: NAVY, fontSize: 13, fontWeight: "800" },
  netHint: { color: MUTED, fontSize: 10, marginTop: 4, maxWidth: 190 },
  netAmount: { fontSize: 18, fontWeight: "800" },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 25,
    marginBottom: 13,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#E8EDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  activityCard: {
    backgroundColor: WHITE,
    borderRadius: 19,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
  },
  activityItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  activityCopy: { flex: 1 },
  activityTitle: { color: NAVY, fontSize: 12, fontWeight: "700" },
  activityDate: { color: MUTED, fontSize: 10, marginTop: 5 },
  activityAmount: { fontSize: 12, fontWeight: "800" },
  activityDivider: { height: 1, backgroundColor: "#EFF2F6", marginLeft: 48 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 14,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#F0F3F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTitle: { color: NAVY, fontSize: 14, fontWeight: "800" },
  emptyText: {
    color: MUTED,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 7,
  },
  disclaimer: {
    color: "#8794A5",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 16,
    marginBottom: 5,
  },
});
