"use client";

import React, { useState, useMemo } from "react";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { Card, StatCard, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { EmptyState } from "@/components/ui/loading";
import { formatCurrency, formatDate, todayISO, uid } from "@/lib/utils";
import { EXPENSE_CATEGORIES, DEFAULTS } from "@/lib/constants";
import type { DailyLog, Expense, Payment, Remittance } from "@/lib/types";
import { toast } from "sonner";
import {
  Wallet, TrendingUp, TrendingDown, Navigation,
  Plus, CreditCard, Receipt, ClipboardList, BarChart3,
  Calendar, Banknote, ArrowDownRight, ArrowUpRight,
  CheckCircle2, XCircle, Clock, FileText, Calculator
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

type Tab = "overview" | "daily" | "expenses" | "payments" | "remittance" | "pnl";

export default function FinancePage() {
  const {
    dailyLogs, expenses, payments, riders, settings, appTrips, appShifts,
    appRemittances, editRemittance,
  } = useFirebaseStore(useShallow((s) => ({
    dailyLogs: s.dailyLogs,
    expenses: s.expenses,
    payments: s.payments,
    riders: s.riders,
    settings: s.settings,
    appTrips: s.appTrips,
    appShifts: s.appShifts,
    appRemittances: s.appRemittances,
    editRemittance: s.editRemittance,
  })));

  const [tab, setTab] = useState<Tab>("overview");
  const [sheet, setSheet] = useState<"daily" | "expense" | "payment" | null>(null);

  const totalRevenue = useMemo(() =>
    Object.values(dailyLogs).reduce((s, l) => s + (l.total_revenue || 0), 0), [dailyLogs]);
  const totalExpenses = useMemo(() =>
    Object.values(expenses).reduce((s, e) => s + (e.amount || 0), 0), [expenses]);

  // Include live trip earnings from active shifts (not yet in dailyLogs)
  const liveEarnings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hasActiveShift = Object.values(appShifts).some(s => s.status === "active");
    if (!hasActiveShift) return 0;
    return Object.values(appTrips)
      .filter(t => t.created_at?.startsWith(today))
      .reduce((s, t) => s + (t.fare_amount || 0), 0);
  }, [appTrips, appShifts]);
  const displayRevenue = totalRevenue + liveEarnings;

  const profit = displayRevenue - totalExpenses;

  // Separate capital investments from rider/operational payments
  const { capitalInvested, riderPayments } = useMemo(() => {
    let cap = 0;
    let rider = 0;
    Object.values(payments).forEach((p) => {
      const ref = (p.reference || "").toLowerCase() + (p.notes || "").toLowerCase();
      if (ref.includes("capital") || ref.includes("startup") || ref.includes("investment") || ref.includes("seed")) {
        cap += p.amount || 0;
      } else {
        rider += p.amount || 0;
      }
    });
    return { capitalInvested: cap, riderPayments: rider };
  }, [payments]);
  const totalPayments = capitalInvested + riderPayments;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "daily", label: "Daily", icon: ClipboardList },
    { key: "expenses", label: "Expenses", icon: Receipt },
    { key: "payments", label: "Payments", icon: CreditCard },
    { key: "remittance", label: "Remit", icon: Banknote },
    { key: "pnl", label: "P&L", icon: FileText },
  ];

  // Expense breakdown by category for pie chart
  const expenseBreakdown = useMemo(() => {
    const byCategory: Record<string, number> = {};
    Object.values(expenses).forEach((e) => {
      const cat = e.category || "Other";
      byCategory[cat] = (byCategory[cat] || 0) + e.amount;
    });
    return Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  return (
    <div className="space-y-5 p-4 pb-28 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10">
          <Wallet className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">Finance</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Manage your money</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-surface-700">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] font-bold transition-all ${
                tab === t.key
                  ? "bg-white text-gray-900 shadow-sm dark:bg-surface-600 dark:text-white"
                  : "text-gray-500"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === "overview" && (
        <OverviewTab
          totalRevenue={displayRevenue}
          totalExpenses={totalExpenses}
          profit={profit}
          capitalInvested={capitalInvested}
          riderPayments={riderPayments}
          expenseBreakdown={expenseBreakdown}
        />
      )}

      {tab === "daily" && (
        <DailyLogTab
          dailyLogs={dailyLogs}
          onAdd={() => setSheet("daily")}
        />
      )}

      {tab === "expenses" && (
        <ExpensesTab
          expenses={expenses}
          onAdd={() => setSheet("expense")}
        />
      )}

      {tab === "payments" && (
        <PaymentsTab
          payments={payments}
          onAdd={() => setSheet("payment")}
        />
      )}

      {tab === "remittance" && (
        <RemittanceTab
          remittances={appRemittances}
          editRemittance={editRemittance}
          settings={settings}
        />
      )}

      {tab === "pnl" && (
        <PnLTab
          dailyLogs={dailyLogs}
          expenses={expenses}
          payments={payments}
          appRemittances={appRemittances}
          settings={settings}
          riders={riders}
        />
      )}

      {/* Add Forms */}
      {sheet === "daily" && (
        <AddDailyLogSheet
          riders={riders}
          settings={settings}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "expense" && (
        <AddExpenseSheet onClose={() => setSheet(null)} />
      )}
      {sheet === "payment" && (
        <AddPaymentSheet riders={riders} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

/* ─── Overview Tab ─── */
const PIE_COLORS = ["#F5A623", "#34D399", "#3B82F6", "#EF4444", "#A855F7", "#EC4899", "#F97316", "#14B8A6"];

function OverviewTab({
  totalRevenue, totalExpenses, profit, capitalInvested, riderPayments, expenseBreakdown,
}: {
  totalRevenue: number; totalExpenses: number; profit: number; capitalInvested: number; riderPayments: number;
  expenseBreakdown: Array<{ name: string; value: number }>;
}) {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Hero profit card */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-surface-700 to-surface-800 p-5">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gold/10 blur-2xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Operating Profit</p>
          <p className={`mt-1 text-3xl font-black tabular ${profit >= 0 ? "text-bolt" : "text-danger"}`}>
            {formatCurrency(profit)}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            {profit >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-bolt" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-danger" />
            )}
            <span className="text-xs font-medium text-gray-400">Revenue minus operational expenses</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
        <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} color="gold" />
        <StatCard label="Total Expenses" value={formatCurrency(totalExpenses)} color="danger" />
      </div>
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
        <StatCard label="Capital Invested" value={formatCurrency(capitalInvested)} sub="Seed funding" color="bolt" />
        {riderPayments > 0 && (
          <StatCard label="Rider Payments" value={formatCurrency(riderPayments)} sub="Wages & bonuses" color="forest" />
        )}
      </div>

      {/* Expense Breakdown Chart */}
      {expenseBreakdown.length > 0 && (
        <>
          <SectionHeader title="Expense Breakdown" />
          <Card>
            <div className="flex items-center gap-4">
              <div className="h-32 w-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={28}
                      outerRadius={55}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {expenseBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#1F2937", border: "none", borderRadius: "12px",
                        fontSize: "11px", fontWeight: 700, color: "#fff", padding: "6px 10px",
                      }}
                      formatter={(value) => [formatCurrency(Number(value)), ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {expenseBreakdown.slice(0, 5).map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate max-w-25">{item.name}</span>
                    </div>
                    <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 tabular">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ─── Daily Log Tab ─── */
function DailyLogTab({
  dailyLogs,
  onAdd,
}: {
  dailyLogs: Record<string, DailyLog>;
  onAdd: () => void;
}) {
  const sorted = Object.entries(dailyLogs)
    .map(([id, l]) => ({ ...l, id }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <SectionHeader title={`Daily Logs (${sorted.length})`} />
        <Button size="sm" variant="bolt" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Log
        </Button>
      </div>
      {sorted.length === 0 ? (
        <EmptyState title="No daily logs" message="Add your first daily log" />
      ) : (
        <div className="space-y-2">
          {sorted.map((log) => (
            <Card key={log.id} padding="sm" className="flex items-center justify-between tap-active">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/10">
                  <Navigation className="h-4 w-4 text-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{log.rider}</p>
                  <p className="text-[11px] text-gray-500">
                    {formatDate(log.date)} • {log.trips} trips • Fuel: {formatCurrency(log.fuel_cost || 0)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-gold tabular">{formatCurrency(log.total_revenue)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Expenses Tab ─── */
function ExpensesTab({
  expenses,
  onAdd,
}: {
  expenses: Record<string, Expense>;
  onAdd: () => void;
}) {
  const sorted = Object.entries(expenses)
    .map(([id, e]) => ({ ...e, id }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalExp = sorted.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <SectionHeader title={`Expenses (${sorted.length})`} />
        <Button size="sm" variant="bolt" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Expense
        </Button>
      </div>

      {sorted.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-red-500/10 to-red-600/5 border border-red-500/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10">
              <TrendingDown className="h-5 w-5 text-danger" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Total Spent</p>
              <p className="text-xl font-black text-danger tabular">{formatCurrency(totalExp)}</p>
            </div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title="No expenses" message="Track your first expense" />
      ) : (
        <div className="space-y-2">
          {sorted.map((exp) => (
            <Card key={exp.id} padding="sm" className="flex items-center justify-between tap-active">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/10">
                  <Receipt className="h-4 w-4 text-danger" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{exp.description}</p>
                  <p className="text-[11px] text-gray-500">
                    {formatDate(exp.date)} • <Badge variant="gray">{exp.category}</Badge>
                  </p>
                </div>
              </div>
              <p className="text-sm font-black text-danger tabular">{formatCurrency(exp.amount)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Payments Tab ─── */
function PaymentsTab({
  payments,
  onAdd,
}: {
  payments: Record<string, Payment>;
  onAdd: () => void;
}) {
  const sorted = Object.entries(payments)
    .map(([id, p]) => ({ ...p, id }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalPay = sorted.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <SectionHeader title={`Payments (${sorted.length})`} />
        <Button size="sm" variant="bolt" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Payment
        </Button>
      </div>

      {sorted.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-bolt/10 to-bolt/5 border border-bolt/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bolt/10">
              <Banknote className="h-5 w-5 text-bolt" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Total Paid</p>
              <p className="text-xl font-black text-bolt tabular">{formatCurrency(totalPay)}</p>
            </div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title="No payments" message="Record your first payment" />
      ) : (
        <div className="space-y-2">
          {sorted.map((pay) => (
            <Card key={pay.id} padding="sm" className="flex items-center justify-between tap-active">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bolt/10">
                  <CreditCard className="h-4 w-4 text-bolt" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{pay.reference || "Payment"}</p>
                  <p className="text-[11px] text-gray-500">
                    {formatDate(pay.date)} • {pay.method}
                    {pay.notes && ` • ${pay.notes}`}
                  </p>
                </div>
              </div>
              <p className="text-sm font-black text-bolt tabular">{formatCurrency(pay.amount)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Add Daily Log Sheet ─── */
function AddDailyLogSheet({
  riders,
  settings,
  onClose,
}: {
  riders: Record<string, import("@/lib/types").Rider>;
  settings: import("@/lib/types").Settings | null;
  onClose: () => void;
}) {
  const { addDailyLog, addNotification } = useFirebaseStore(useShallow((s) => ({
    addDailyLog: s.addDailyLog,
    addNotification: s.addNotification,
  })));
  const [saving, setSaving] = useState(false);

  const riderList = Object.entries(riders).map(([id, r]) => ({
    value: r.name,
    label: r.name,
  }));

  const fare = settings?.fare || DEFAULTS.fare;
  const pax = settings?.pax || DEFAULTS.pax;

  const [form, setForm] = useState({
    rider: riderList[0]?.value || "",
    trips: "",
    fuel_cost: "",
    date: todayISO(),
  });

  const trips = parseInt(form.trips) || 0;
  const fuelCost = parseFloat(form.fuel_cost) || 0;
  const revenue = trips * fare * pax;
  const remittance = settings?.remit_d || DEFAULTS.dailyTarget;

  async function handleSave() {
    if (!form.rider || trips <= 0) {
      toast.error("Enter rider and trips");
      return;
    }
    setSaving(true);
    try {
      const log: DailyLog = {
        rider: form.rider,
        date: form.date,
        bike: 1,
        trips,
        fare,
        passengers: pax,
        fare_revenue: revenue,
        extra_income: 0,
        total_revenue: revenue,
        fuel_cost: fuelCost,
        notes: "",
      };
      await addDailyLog(log);
      await addNotification({
        type: "daily_log_submitted",
        title: "Daily Log Added",
        message: `${form.rider}: ${trips} trips, ${formatCurrency(revenue)}`,
        icon: "📋",
        target_role: "all",
        read: false,
        created_at: new Date().toISOString(),
      });
      toast.success("Daily log added");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Add Daily Log">
      <div className="space-y-4 p-4">
        <Select
          label="Rider"
          value={form.rider}
          onChange={(e) => setForm({ ...form, rider: e.target.value })}
          options={riderList}
        />
        <Input
          label="Trips"
          type="number"
          value={form.trips}
          onChange={(e) => setForm({ ...form, trips: e.target.value })}
          placeholder="Number of trips"
        />
        <Input
          label="Fuel Cost (GH₵)"
          type="number"
          value={form.fuel_cost}
          onChange={(e) => setForm({ ...form, fuel_cost: e.target.value })}
          placeholder="0.00"
        />
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />

        {/* Preview */}
        <Card className="bg-gray-50 dark:bg-surface-700">
          <div className="flex justify-between py-1 text-sm">
            <span className="text-gray-500">Revenue</span>
            <span className="font-bold text-gold tabular">{formatCurrency(revenue)}</span>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-gray-500">Remittance</span>
            <span className="font-bold tabular">{formatCurrency(remittance)}</span>
          </div>
        </Card>

        <Button fullWidth loading={saving} onClick={handleSave}>
          Save Daily Log
        </Button>
      </div>
    </BottomSheet>
  );
}

/* ─── Add Expense Sheet ─── */
function AddExpenseSheet({ onClose }: { onClose: () => void }) {
  const { addExpense, addNotification } = useFirebaseStore(useShallow((s) => ({
    addExpense: s.addExpense,
    addNotification: s.addNotification,
  })));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    category: EXPENSE_CATEGORIES[0] as string,
    date: todayISO(),
  });

  async function handleSave() {
    if (!form.description || !form.amount) {
      toast.error("Fill in all fields");
      return;
    }
    setSaving(true);
    try {
      const expense: Expense = {
        description: form.description,
        amount: parseFloat(form.amount),
        category: form.category,
        date: form.date,
        payment_method: "cash",
        recorded_by: "management",
      };
      await addExpense(expense);
      await addNotification({
        type: "expense_added",
        title: "Expense Recorded",
        message: `${form.category}: ${formatCurrency(expense.amount)} — ${form.description}`,
        icon: "💸",
        target_role: "management",
        read: false,
        created_at: new Date().toISOString(),
      });
      toast.success("Expense added");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Add Expense">
      <div className="space-y-4 p-4">
        <Input
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What was the expense for?"
        />
        <Input
          label="Amount (GH₵)"
          type="number"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="0.00"
        />
        <Select
          label="Category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <Button fullWidth loading={saving} onClick={handleSave}>
          Save Expense
        </Button>
      </div>
    </BottomSheet>
  );
}

/* ─── Add Payment Sheet ─── */
function AddPaymentSheet({
  riders,
  onClose,
}: {
  riders: Record<string, import("@/lib/types").Rider>;
  onClose: () => void;
}) {
  const { addPayment, addNotification } = useFirebaseStore(useShallow((s) => ({
    addPayment: s.addPayment,
    addNotification: s.addNotification,
  })));
  const [saving, setSaving] = useState(false);

  const riderList = Object.entries(riders).map(([, r]) => ({
    value: r.name,
    label: r.name,
  }));

  const [form, setForm] = useState({
    rider: riderList[0]?.value || "",
    amount: "",
    type: "salary",
    note: "",
    date: todayISO(),
  });

  async function handleSave() {
    if (!form.rider || !form.amount) {
      toast.error("Fill in rider and amount");
      return;
    }
    setSaving(true);
    try {
      const payment: Payment = {
        amount: parseFloat(form.amount),
        method: form.type,
        reference: form.rider,
        notes: form.note,
        date: form.date,
        recorded_by: "management",
      };
      await addPayment(payment);
      await addNotification({
        type: "payment_recorded",
        title: "Payment Made",
        message: `${form.rider}: ${formatCurrency(payment.amount)} (${form.type})`,
        icon: "💰",
        target_role: "all",
        read: false,
        created_at: new Date().toISOString(),
      });
      toast.success("Payment recorded");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Add Payment">
      <div className="space-y-4 p-4">
        <Select
          label="Rider"
          value={form.rider}
          onChange={(e) => setForm({ ...form, rider: e.target.value })}
          options={riderList}
        />
        <Input
          label="Amount (GH₵)"
          type="number"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="0.00"
        />
        <Select
          label="Payment Type"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          options={[
            { value: "salary", label: "Salary" },
            { value: "bonus", label: "Bonus" },
            { value: "advance", label: "Advance" },
            { value: "fuel", label: "Fuel" },
            { value: "other", label: "Other" },
          ]}
        />
        <Input
          label="Note (optional)"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="Any additional notes"
        />
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <Button fullWidth loading={saving} onClick={handleSave}>
          Save Payment
        </Button>
      </div>
    </BottomSheet>
  );
}

/* ─── Remittance Tab ─── */
function RemittanceTab({
  remittances,
  editRemittance,
  settings,
}: {
  remittances: Record<string, Remittance>;
  editRemittance: (id: string, updates: Partial<Remittance>) => Promise<void>;
  settings: ReturnType<typeof useFirebaseStore.getState>["settings"];
}) {
  const sorted = Object.entries(remittances)
    .map(([id, r]) => ({ ...r, id }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const totalRemitted = sorted.reduce((s, r) => s + r.amount, 0);
  const confirmed = sorted.filter((r) => r.status === "confirmed");
  const pending = sorted.filter((r) => r.status === "pending");
  const disputed = sorted.filter((r) => r.status === "disputed");

  const handleConfirm = async (id: string) => {
    try {
      await editRemittance(id, { status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: "management" });
      toast.success("Remittance confirmed");
    } catch {
      toast.error("Failed to confirm");
    }
  };

  const handleDispute = async (id: string) => {
    try {
      await editRemittance(id, { status: "disputed" });
      toast.error("Remittance disputed");
    } catch {
      toast.error("Failed to dispute");
    }
  };

  const statusColor = (status: string) => {
    if (status === "confirmed") return "green" as const;
    if (status === "disputed") return "red" as const;
    return "gold" as const;
  };

  const statusIcon = (status: string) => {
    if (status === "confirmed") return <CheckCircle2 className="h-4 w-4 text-bolt" />;
    if (status === "disputed") return <XCircle className="h-4 w-4 text-danger" />;
    return <Clock className="h-4 w-4 text-gold" />;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Confirmed" value={`₵${Math.round(confirmed.reduce((s, r) => s + r.amount, 0))}`} color="bolt" />
        <StatCard label="Pending" value={`${pending.length}`} color="gold" />
        <StatCard label="Disputed" value={`${disputed.length}`} color="danger" />
      </div>

      {/* Total remitted */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-gold" />
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Total Remitted</p>
          </div>
          <p className="text-lg font-black text-bolt tabular">{formatCurrency(totalRemitted)}</p>
        </div>
      </Card>

      {/* Remittance list */}
      {sorted.length === 0 ? (
        <EmptyState title="No remittances" message="Rider remittances will appear here" />
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => (
            <Card key={r.id} padding="sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {statusIcon(r.status)}
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{r.rider_name || r.rider_id}</p>
                    <p className="text-[11px] text-gray-500">
                      {formatDate(r.remittance_date)} • {r.payment_method}
                    </p>
                    {r.expected_amount && (
                      <p className="text-[10px] text-gray-400">
                        Expected: {formatCurrency(r.expected_amount)}
                        {r.amount < r.expected_amount && (
                          <span className="text-danger ml-1">({formatCurrency(r.amount - r.expected_amount)})</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <p className="text-sm font-black text-gray-900 dark:text-white tabular">{formatCurrency(r.amount)}</p>
                  <Badge variant={statusColor(r.status)}>
                    {r.status}
                  </Badge>
                </div>
              </div>
              {r.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="bolt"
                    size="sm"
                    onClick={() => handleConfirm(r.id)}
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDispute(r.id)}
                    icon={<XCircle className="h-3.5 w-3.5" />}
                  >
                    Dispute
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── P&L Tab ─── */
function PnLTab({
  dailyLogs, expenses, payments, appRemittances, settings, riders,
}: {
  dailyLogs: Record<string, DailyLog>;
  expenses: Record<string, Expense>;
  payments: Record<string, Payment>;
  appRemittances: Record<string, Remittance>;
  settings: import("@/lib/types").Settings | null;
  riders: Record<string, import("@/lib/types").Rider>;
}) {
  const [period, setPeriod] = useState<"week" | "month" | "all">("month");

  const dailyTarget = settings?.remit_d || DEFAULTS.dailyTarget;
  const wdays = settings?.wdays || 26;

  const pnlData = useMemo(() => {
    const now = new Date();
    let startDate = "";
    if (period === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString().slice(0, 10);
    } else if (period === "month") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      startDate = d.toISOString().slice(0, 10);
    }

    const filteredLogs = Object.values(dailyLogs).filter(l => !startDate || l.date >= startDate);
    const filteredExp = Object.values(expenses).filter(e => !startDate || e.date >= startDate);
    const filteredRemit = Object.values(appRemittances).filter(r => !startDate || r.created_at.slice(0, 10) >= startDate);

    const totalRevenue = filteredLogs.reduce((s, l) => s + (l.total_revenue || 0), 0);
    const totalFuel = filteredLogs.reduce((s, l) => s + (l.fuel_cost || 0), 0);
    const totalTrips = filteredLogs.reduce((s, l) => s + (l.trips || 0), 0);
    // Rider pay is a flat daily rate (GH₵50/day), NOT a percentage
    const riderDailyPay = settings?.rider_daily_pay || settings?.wage || DEFAULTS.riderDailyPay;
    const daysLogged = filteredLogs.length;
    const totalWage = riderDailyPay * daysLogged;
    const totalExpenses = filteredExp.reduce((s, e) => s + (e.amount || 0), 0);
    const totalRemittances = filteredRemit.reduce((s, r) => s + (r.amount || 0), 0);

    const grossProfit = totalRevenue - totalFuel;
    const operatingExpenses = totalExpenses + totalWage;
    const netProfit = grossProfit - operatingExpenses;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue, totalFuel, totalTrips, totalWage, totalExpenses,
      totalRemittances, grossProfit, operatingExpenses, netProfit, margin,
      daysLogged, riderDailyPay,
    };
  }, [dailyLogs, expenses, appRemittances, settings, period]);

  // Monthly forecast
  const forecast = useMemo(() => {
    const dailyAvgRevenue = pnlData.daysLogged > 0 ? pnlData.totalRevenue / pnlData.daysLogged : 0;
    const dailyAvgExpense = pnlData.daysLogged > 0 ? (pnlData.totalExpenses + pnlData.totalFuel + pnlData.totalWage) / pnlData.daysLogged : 0;
    const projectedMonthlyRevenue = dailyAvgRevenue * wdays;
    const projectedMonthlyExpense = dailyAvgExpense * wdays;
    const projectedProfit = projectedMonthlyRevenue - projectedMonthlyExpense;
    const breakEvenTripsPerDay = pnlData.totalTrips > 0 && pnlData.daysLogged > 0
      ? Math.ceil(dailyAvgExpense / (pnlData.totalRevenue / pnlData.totalTrips))
      : 0;
    return { projectedMonthlyRevenue, projectedMonthlyExpense, projectedProfit, breakEvenTripsPerDay };
  }, [pnlData, wdays]);

  // Revenue by week chart data
  const weeklyChart = useMemo(() => {
    const weeks: Record<string, number> = {};
    Object.values(dailyLogs).forEach(l => {
      const d = new Date(l.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(5, 10);
      weeks[key] = (weeks[key] || 0) + (l.total_revenue || 0);
    });
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([week, revenue]) => ({ week, revenue }));
  }, [dailyLogs]);

  const pnlRows: { label: string; amount: number; bold?: boolean; color?: string; indent?: boolean }[] = [
    { label: "Revenue", amount: pnlData.totalRevenue, bold: true, color: "text-bolt" },
    { label: "Fuel Cost", amount: -pnlData.totalFuel, indent: true },
    { label: "Gross Profit", amount: pnlData.grossProfit, bold: true, color: pnlData.grossProfit >= 0 ? "text-bolt" : "text-danger" },
    { label: `Rider Wages (₵${pnlData.riderDailyPay}/day × ${pnlData.daysLogged}d)`, amount: -pnlData.totalWage, indent: true },
    { label: "Operating Expenses", amount: -pnlData.totalExpenses, indent: true },
    { label: "Net Profit/(Loss)", amount: pnlData.netProfit, bold: true, color: pnlData.netProfit >= 0 ? "text-bolt" : "text-danger" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Period selector */}
      <div className="flex gap-2">
        {(["week", "month", "all"] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              period === p ? "bg-gold text-white shadow-md" : "bg-gray-100 text-gray-500 dark:bg-surface-700 dark:text-gray-400"
            }`}>
            {p === "week" ? "7 Days" : p === "month" ? "30 Days" : "All Time"}
          </button>
        ))}
      </div>

      {/* P&L Statement */}
      <SectionHeader title="Profit & Loss Statement" />
      <Card>
        <div className="divide-y divide-gray-100 dark:divide-surface-600">
          {pnlRows.map(row => (
            <div key={row.label} className={`flex items-center justify-between py-2.5 ${row.indent ? "pl-4" : ""}`}>
              <span className={`text-sm ${row.bold ? "font-bold text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>
                {row.label}
              </span>
              <span className={`text-sm font-bold tabular ${row.color || (row.indent ? "text-gray-500" : "")}`}>
                {formatCurrency(Math.abs(row.amount))}
                {row.amount < 0 && !row.bold && <span className="text-[10px] text-gray-400 ml-0.5">DR</span>}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-surface-600 flex items-center justify-between">
          <span className="text-xs text-gray-400">Profit Margin</span>
          <span className={`text-sm font-black tabular ${pnlData.margin >= 0 ? "text-bolt" : "text-danger"}`}>
            {pnlData.margin.toFixed(1)}%
          </span>
        </div>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
        <StatCard label="Days Logged" value={pnlData.daysLogged} color="default" />
        <StatCard label="Total Trips" value={pnlData.totalTrips} color="bolt" />
        <StatCard label="Remittances" value={formatCurrency(pnlData.totalRemittances)} color="gold" />
        <StatCard label="Break-even/day" value={`${forecast.breakEvenTripsPerDay} trips`} color="default" />
      </div>

      {/* Forecast */}
      <SectionHeader title="Monthly Forecast" />
      <Card className="bg-linear-to-br from-gold/5 to-bolt/5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Projected Revenue</span>
            <span className="text-sm font-bold text-bolt tabular">{formatCurrency(forecast.projectedMonthlyRevenue)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Projected Expenses</span>
            <span className="text-sm font-bold text-danger tabular">{formatCurrency(forecast.projectedMonthlyExpense)}</span>
          </div>
          <div className="border-t border-gray-200 dark:border-surface-600 pt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900 dark:text-white">Projected Profit</span>
            <span className={`text-lg font-black tabular ${forecast.projectedProfit >= 0 ? "text-bolt" : "text-danger"}`}>
              {formatCurrency(forecast.projectedProfit)}
            </span>
          </div>
          <p className="text-[10px] text-gray-400">
            Based on {pnlData.daysLogged} days of data • {wdays} working days/month
          </p>
        </div>
      </Card>

      {/* Revenue Trend Chart */}
      {weeklyChart.length > 1 && (
        <>
          <SectionHeader title="Revenue Trend" />
          <Card>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} width={45}
                    tickFormatter={(v) => `₵${v}`} />
                  <Tooltip
                    contentStyle={{
                      background: "#1F2937", border: "none", borderRadius: "12px",
                      fontSize: "11px", fontWeight: 700, color: "#fff", padding: "6px 10px",
                    }}
                    formatter={(value) => [formatCurrency(Number(value)), "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="#34D399" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
