"use client";

import React, { useState, useMemo } from "react";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import { Card, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Toggle } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/loading";
import { formatCurrency } from "@/lib/utils";
import { DEFAULTS } from "@/lib/constants";
import { saveNotification } from "@/lib/firebase";
import type { Settings } from "@/lib/types";
import { toast } from "sonner";
import {
  Settings2, Sun, Moon, Monitor, Bell, LogOut, Zap,
  Pencil, Banknote, Target, Users, Calendar, Wallet,
  MapPin, Truck as TruckIcon, Globe, Smartphone,
  MessageCircle, Send, CalendarDays, AlertTriangle,
  FileText, Clock, CheckCircle, XCircle, Search,
  Satellite, Plus, Trash2, Radio, Wifi, WifiOff, Link2
} from "lucide-react";
import type { TrackerConfig, TrackerDevice } from "@/lib/types";

type Tab = "general" | "business" | "comms" | "tracker" | "about";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { settings, patchSettings, riders, leaveRequests, editLeaveRequest,
    incidents, editIncident, messages, addMessage, readMessage, removeMessage, documents, addDocument, removeDocument,
    trackerConfig, setTrackerConfig, patchTrackerConfig, addTrackerDevice, deleteTrackerDevice } = useFirebaseStore(useShallow((s) => ({
    settings: s.settings,
    patchSettings: s.patchSettings,
    riders: s.riders,
    leaveRequests: s.leaveRequests,
    editLeaveRequest: s.editLeaveRequest,
    incidents: s.incidents,
    editIncident: s.editIncident,
    messages: s.messages,
    addMessage: s.addMessage,
    readMessage: s.readMessage,
    removeMessage: s.removeMessage,
    documents: s.documents,
    addDocument: s.addDocument,
    removeDocument: s.removeDocument,
    trackerConfig: s.trackerConfig,
    setTrackerConfig: s.setTrackerConfig,
    patchTrackerConfig: s.patchTrackerConfig,
    addTrackerDevice: s.addTrackerDevice,
    deleteTrackerDevice: s.deleteTrackerDevice,
  })));
  const logout = useAuthStore((s) => s.logout);
  const { theme, setTheme, notificationsEnabled, toggleNotifications } = useUIStore(useShallow((s) => ({
    theme: s.theme,
    setTheme: s.setTheme,
    notificationsEnabled: s.notificationsEnabled,
    toggleNotifications: s.toggleNotifications,
  })));
  const [tab, setTab] = useState<Tab>("general");
  const [editSheet, setEditSheet] = useState(false);

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "general", label: "General", icon: Settings2 },
    { key: "business", label: "Business", icon: Banknote },
    { key: "comms", label: "Comms", icon: MessageCircle },
    { key: "tracker", label: "Tracker", icon: Satellite },
    { key: "about", label: "About", icon: Globe },
  ];

  return (
    <div className="space-y-5 p-4 pb-28 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10">
          <Settings2 className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Configure your app</p>
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
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-bold transition-all ${
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

      {tab === "general" && (
        <GeneralTab
          theme={theme}
          setTheme={setTheme}
          notificationsEnabled={notificationsEnabled}
          toggleNotifications={toggleNotifications}
          logout={logout}
        />
      )}

      {tab === "business" && (
        <BusinessTab
          settings={settings}
          onEdit={() => setEditSheet(true)}
        />
      )}

      {tab === "about" && <AboutTab />}

      {tab === "tracker" && (
        <TrackerTab
          trackerConfig={trackerConfig}
          riders={riders}
          setTrackerConfig={setTrackerConfig}
          patchTrackerConfig={patchTrackerConfig}
          addTrackerDevice={addTrackerDevice}
          deleteTrackerDevice={deleteTrackerDevice}
        />
      )}

      {tab === "comms" && user && (
        <CommsTab
          user={user}
          riders={riders}
          leaveRequests={leaveRequests}
          editLeaveRequest={editLeaveRequest}
          incidents={incidents}
          editIncident={editIncident}
          messages={messages}
          addMessage={addMessage}
          readMessage={readMessage}
          removeMessage={removeMessage}
          documents={documents}
          addDocument={addDocument}
          removeDocument={removeDocument}
        />
      )}

      {editSheet && (
        <EditSettingsSheet
          settings={settings}
          onClose={() => setEditSheet(false)}
        />
      )}
    </div>
  );
}

/* ─── General Tab ─── */
function GeneralTab({
  theme,
  setTheme,
  notificationsEnabled,
  toggleNotifications,
  logout,
}: {
  theme: string;
  setTheme: (t: "light" | "dark" | "system") => void;
  notificationsEnabled: boolean;
  toggleNotifications: () => void;
  logout: () => void;
}) {
  const themeOptions = [
    { key: "light" as const, icon: Sun, label: "Light" },
    { key: "dark" as const, icon: Moon, label: "Dark" },
    { key: "system" as const, icon: Monitor, label: "System" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <SectionHeader title="Appearance" />
      <Card>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">Theme</p>
            <p className="text-xs text-gray-500">Choose your appearance</p>
          </div>
          <div className="flex gap-2 rounded-xl bg-gray-100 p-1 dark:bg-surface-700">
            {themeOptions.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all ${
                    theme === t.key
                      ? "bg-gold text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <SectionHeader title="Preferences" />
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-surface-700">
            <Bell className="h-4 w-4 text-gold" />
          </div>
          <div className="flex-1">
            <Toggle
              label="Push Notifications"
              description="Receive alerts for trips and logs"
              checked={notificationsEnabled}
              onChange={toggleNotifications}
            />
          </div>
        </div>
      </Card>

      <SectionHeader title="Account" />
      <Button variant="danger" fullWidth onClick={logout}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
}

/* ─── Business Tab ─── */
function BusinessTab({
  settings,
  onEdit,
}: {
  settings: Settings | null;
  onEdit: () => void;
}) {
  const rows: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
    { label: "Fare per trip", value: formatCurrency(settings?.fare || DEFAULTS.fare), icon: Banknote, color: "text-gold" },
    { label: "Passengers/trip", value: `${settings?.pax || DEFAULTS.pax}`, icon: Users, color: "text-bolt" },
    { label: "Target trips/day", value: `${settings?.trips || DEFAULTS.trips}`, icon: Target, color: "text-gold" },
    { label: "Daily target", value: formatCurrency(settings?.remit_d || DEFAULTS.dailyTarget), icon: Banknote, color: "text-bolt" },
    { label: "Rider daily pay", value: formatCurrency(settings?.rider_daily_pay || DEFAULTS.riderDailyPay), icon: Users, color: "text-gold" },    { label: "Rider monthly salary", value: formatCurrency(settings?.rider_monthly_salary || DEFAULTS.riderMonthlySalary), icon: Wallet, color: "text-bolt" },    { label: "Remittance", value: "Rider submits all earnings", icon: Wallet, color: "text-bolt" },
    { label: "Rider wage (%)", value: `${settings?.wage || DEFAULTS.wage}%`, icon: Users, color: "text-gold" },
    { label: "Fleet size", value: `${settings?.fleet || DEFAULTS.fleet}`, icon: TruckIcon, color: "text-bolt" },
    { label: "Working days/mo", value: `${settings?.wdays || 26}`, icon: Calendar, color: "text-gold" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <SectionHeader title="Business Settings" />
        <Button size="sm" variant="bolt" onClick={onEdit}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
        </Button>
      </div>
      <Card>
        <div className="divide-y divide-gray-100 dark:divide-surface-600">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-surface-700">
                  <row.icon className={`h-4 w-4 ${row.color}`} />
                </div>
                <span className="text-sm font-medium text-gray-500">{row.label}</span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white tabular">{row.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ─── About Tab ─── */
function AboutTab() {
  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="text-center">
        <div className="space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-bolt to-bolt-dark shadow-lg shadow-bolt/30">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">Montbile Auto Services</h2>
          <p className="text-xs font-medium text-gray-500">Pragya Fleet Management App</p>
          <p className="text-xs font-bold text-bolt">Version 2.0.0</p>
        </div>
      </Card>
      <Card>
        <div className="divide-y divide-gray-100 dark:divide-surface-600">
          {[
            { label: "Location", value: "Takoradi, Ghana", icon: MapPin, color: "text-gold" },
            { label: "Vehicle Type", value: "Pragya Tricycles", icon: TruckIcon, color: "text-bolt" },
            { label: "Currency", value: "Ghana Cedis (GH\u20B5)", icon: Banknote, color: "text-gold" },
            { label: "Platform", value: "Progressive Web App", icon: Smartphone, color: "text-bolt" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-surface-700">
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                </div>
                <span className="text-sm font-medium text-gray-500">{item.label}</span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ─── Comms Tab (Messages, Leave Requests, Incidents, Documents) ─── */
function CommsTab({
  user,
  riders,
  leaveRequests,
  editLeaveRequest,
  incidents,
  editIncident,
  messages,
  addMessage,
  readMessage,
  removeMessage,
  documents,
  addDocument,
  removeDocument,
}: {
  user: { id: string; name: string };
  riders: Record<string, import("@/lib/types").Rider>;
  leaveRequests: Record<string, import("@/lib/types").LeaveRequest>;
  editLeaveRequest: (id: string, updates: Partial<import("@/lib/types").LeaveRequest>) => Promise<void>;
  incidents: Record<string, import("@/lib/types").IncidentReport>;
  editIncident: (id: string, updates: Partial<import("@/lib/types").IncidentReport>) => Promise<void>;
  messages: Record<string, import("@/lib/types").Message>;
  addMessage: (msg: import("@/lib/types").Message) => Promise<string>;
  readMessage: (id: string, userId: string) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
  documents: Record<string, import("@/lib/types").Document>;
  addDocument: (doc: import("@/lib/types").Document) => Promise<string>;
  removeDocument: (id: string) => Promise<void>;
}) {
  type CommsSection = "messages" | "leave" | "incidents" | "docs";
  const [section, setSection] = useState<CommsSection>("messages");
  const [showCompose, setShowCompose] = useState(false);
  const [showDocForm, setShowDocForm] = useState(false);

  // Message form
  const [msgContent, setMsgContent] = useState("");
  const [msgPriority, setMsgPriority] = useState("normal");
  const [msgRecipient, setMsgRecipient] = useState("broadcast");

  // Document form
  const [docName, setDocName] = useState("");
  const [docCategory, setDocCategory] = useState("registration");
  const [docTricycle, setDocTricycle] = useState("");
  const [docExpiry, setDocExpiry] = useState("");
  const [docNotes, setDocNotes] = useState("");

  const riderList = useMemo(() =>
    Object.entries(riders).map(([id, r]) => ({ ...r, id })), [riders]);

  const messageList = useMemo(() =>
    Object.entries(messages)
      .map(([id, m]) => ({ ...m, id }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [messages]);

  const pendingLeaves = useMemo(() =>
    Object.entries(leaveRequests)
      .map(([id, l]) => ({ ...l, id }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [leaveRequests]);

  const incidentList = useMemo(() =>
    Object.entries(incidents)
      .map(([id, i]) => ({ ...i, id }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [incidents]);

  const docList = useMemo(() =>
    Object.entries(documents)
      .map(([id, d]) => ({ ...d, id }))
      .sort((a, b) => (b.expiry_date || "").localeCompare(a.expiry_date || "")),
    [documents]);

  const handleSendMessage = async () => {
    if (!msgContent.trim()) { toast.error("Enter a message"); return; }
    try {
      const recipient = msgRecipient === "broadcast" ? undefined : msgRecipient;
      const recipientName = recipient ? riderList.find(r => r.id === recipient)?.name : undefined;
      await addMessage({
        sender_id: user.id,
        sender_name: user.name,
        sender_role: "owner",
        recipient_id: recipient,
        recipient_name: recipientName,
        content: msgContent.trim(),
        priority: msgPriority as "normal" | "important" | "urgent",
        read_by: {},
        created_at: new Date().toISOString(),
      });
      await saveNotification({
        type: "message_received",
        title: msgPriority === "urgent" ? "🔴 Urgent Message" : "💬 New Message",
        message: `${user.name}: ${msgContent.trim().slice(0, 80)}`,
        icon: "💬",
        target_role: recipient ? "rider" : "all",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
      toast.success("Message sent");
      setShowCompose(false);
      setMsgContent("");
    } catch { toast.error("Failed to send"); }
  };

  const handleLeaveAction = async (id: string, status: "approved" | "rejected") => {
    try {
      await editLeaveRequest(id, { status, reviewed_by: user.name, reviewed_at: new Date().toISOString() });
      const leave = leaveRequests[id];
      if (leave) {
        await saveNotification({
          type: status === "approved" ? "leave_approved" : "leave_rejected",
          title: status === "approved" ? "✅ Leave Approved" : "❌ Leave Rejected",
          message: `Your leave request (${leave.start_date} to ${leave.end_date}) was ${status}`,
          icon: status === "approved" ? "✅" : "❌",
          target_role: "rider",
          actor: user.name,
          read: false,
          created_at: new Date().toISOString(),
        }).catch(() => {});
      }
      toast.success(`Leave ${status}`);
    } catch { toast.error("Failed to update"); }
  };

  const handleIncidentStatus = async (id: string, status: "investigating" | "resolved") => {
    try {
      const updates: Record<string, unknown> = { status };
      if (status === "resolved") updates.resolved_at = new Date().toISOString();
      await editIncident(id, updates as Partial<import("@/lib/types").IncidentReport>);
      toast.success(`Incident ${status}`);
    } catch { toast.error("Failed to update"); }
  };

  const handleAddDoc = async () => {
    if (!docName.trim()) { toast.error("Enter document name"); return; }
    try {
      await addDocument({
        name: docName.trim(),
        category: docCategory as "registration" | "insurance" | "roadworthy" | "permit" | "invoice" | "other",
        tricycle_id: docTricycle || undefined,
        expiry_date: docExpiry || undefined,
        notes: docNotes || undefined,
        created_at: new Date().toISOString(),
      });
      toast.success("Document added");
      setShowDocForm(false);
      setDocName("");
      setDocExpiry("");
      setDocNotes("");
    } catch { toast.error("Failed to add"); }
  };

  const sections: { key: CommsSection; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { key: "messages", label: "Msgs", icon: MessageCircle, count: messageList.length },
    { key: "leave", label: "Leave", icon: CalendarDays, count: pendingLeaves.filter(l => l.status === "pending").length },
    { key: "incidents", label: "Alerts", icon: AlertTriangle, count: incidentList.filter(i => i.status !== "resolved").length },
    { key: "docs", label: "Docs", icon: FileText, count: docList.length },
  ];

  const priorityColors: Record<string, string> = { normal: "green", important: "gold", urgent: "red" };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-surface-700">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-bold transition-all relative ${
                section === s.key
                  ? "bg-white text-gray-900 shadow-sm dark:bg-surface-600 dark:text-white"
                  : "text-gray-500"
              }`}>
              <Icon className="h-3.5 w-3.5" />
              {s.label}
              {(s.count || 0) > 0 && section !== s.key && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-bolt text-[8px] font-bold text-white">
                  {s.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Messages Section */}
      {section === "messages" && (
        <>
          <Button onClick={() => setShowCompose(true)} variant="bolt" size="md" fullWidth
            icon={<Send className="h-4 w-4" />}>
            Compose Message
          </Button>
          {messageList.length === 0 ? (
            <EmptyState icon="💬" title="No messages" message="Send your first message to riders" />
          ) : (
            <div className="space-y-2">
              {messageList.slice(0, 20).map((msg) => {
                const isUnread = !msg.read_by?.[user.id];
                return (
                  <Card key={msg.id} padding="sm">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-gray-900 dark:text-white">{msg.sender_name}</p>
                          <Badge variant={priorityColors[msg.priority] as "green" | "gold" | "red"}>
                            {msg.priority}
                          </Badge>
                          {isUnread && <span className="flex h-2 w-2 rounded-full bg-bolt" />}
                        </div>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{msg.content}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-400">
                            {msg.recipient_name ? `→ ${msg.recipient_name}` : "📢 Broadcast"}
                          </span>
                          <span className="text-[10px] text-gray-300">•</span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(msg.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {isUnread && (
                          <button
                            onClick={() => readMessage(msg.id, user.id)}
                            className="rounded-lg px-2 py-1 text-[10px] font-bold text-bolt hover:bg-bolt/10 transition-colors"
                          >
                            Read
                          </button>
                        )}
                        <button
                          onClick={() => removeMessage(msg.id)}
                          className="rounded-lg px-2 py-1 text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Leave Requests Section */}
      {section === "leave" && (
        <>
          {pendingLeaves.length === 0 ? (
            <EmptyState icon="📅" title="No leave requests" message="Riders can submit leave requests from their profile" />
          ) : (
            <div className="space-y-2">
              {pendingLeaves.map((leave) => (
                <Card key={leave.id} padding="sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{leave.rider_name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {leave.start_date} → {leave.end_date}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{leave.reason}</p>
                    </div>
                    {leave.status === "pending" ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleLeaveAction(leave.id, "approved")}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-bolt/10 text-bolt hover:bg-bolt/20 transition-colors"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleLeaveAction(leave.id, "rejected")}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <Badge variant={leave.status === "approved" ? "green" : "red"}>
                        {leave.status}
                      </Badge>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Incidents Section */}
      {section === "incidents" && (
        <>
          {incidentList.length === 0 ? (
            <EmptyState icon="✅" title="No incidents" message="No incidents have been reported" />
          ) : (
            <div className="space-y-2">
              {incidentList.map((inc) => (
                <Card key={inc.id} padding="sm">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{inc.incident_type}</p>
                          <Badge variant={inc.severity === "high" ? "red" : inc.severity === "medium" ? "gold" : "green"}>
                            {inc.severity}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">{inc.rider_name} • {inc.tricycle_id}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{inc.description}</p>
                        {inc.location && <p className="text-[10px] text-gray-400 mt-0.5">📍 {inc.location}</p>}
                      </div>
                      <Badge variant={inc.status === "resolved" ? "green" : inc.status === "investigating" ? "blue" : "gold"}>
                        {inc.status}
                      </Badge>
                    </div>
                    {inc.status !== "resolved" && (
                      <div className="flex gap-2 pt-1">
                        {inc.status === "reported" && (
                          <Button size="sm" variant="outline" onClick={() => handleIncidentStatus(inc.id, "investigating")}>
                            Investigate
                          </Button>
                        )}
                        <Button size="sm" variant="bolt" onClick={() => handleIncidentStatus(inc.id, "resolved")}
                          icon={<CheckCircle className="h-3 w-3" />}>
                          Resolve
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Documents Section */}
      {section === "docs" && (
        <>
          <Button onClick={() => setShowDocForm(true)} variant="bolt" size="md" fullWidth
            icon={<FileText className="h-4 w-4" />}>
            Add Document
          </Button>
          {docList.length === 0 ? (
            <EmptyState icon="📄" title="No documents" message="Add vehicle documents to track expiry dates" />
          ) : (
            <div className="space-y-2">
              {docList.map((doc) => {
                const isExpiring = doc.expiry_date && new Date(doc.expiry_date) < new Date(Date.now() + 30 * 86400000);
                const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                return (
                  <Card key={doc.id} padding="sm"
                    className={isExpired ? "border-l-4 border-l-danger" : isExpiring ? "border-l-4 border-l-gold" : ""}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{doc.name}</p>
                        <p className="text-[11px] text-gray-500 capitalize">{doc.category}{doc.tricycle_id ? ` • ${doc.tricycle_id}` : ""}</p>
                        {doc.expiry_date && (
                          <p className={`text-[10px] font-medium mt-0.5 ${isExpired ? "text-danger" : isExpiring ? "text-gold" : "text-gray-400"}`}>
                            {isExpired ? "⚠️ EXPIRED" : isExpiring ? "⏰ Expiring soon" : "Valid"} — {doc.expiry_date}
                          </p>
                        )}
                      </div>
                      <button onClick={() => removeDocument(doc.id).catch(() => {})}
                        className="p-1.5 text-gray-300 hover:text-danger transition-colors rounded-lg hover:bg-danger/10">
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Compose Message Sheet */}
      <BottomSheet open={showCompose} onClose={() => setShowCompose(false)} title="Send Message">
        <div className="space-y-4 p-1">
          <Select label="Send To" value={msgRecipient} onChange={(e) => setMsgRecipient(e.target.value)}
            options={[
              { value: "broadcast", label: "📢 All Riders (Broadcast)" },
              ...riderList.map(r => ({ value: r.id, label: r.name })),
            ]} />
          <Select label="Priority" value={msgPriority} onChange={(e) => setMsgPriority(e.target.value)}
            options={[
              { value: "normal", label: "🟢 Normal" },
              { value: "important", label: "🟡 Important" },
              { value: "urgent", label: "🔴 Urgent" },
            ]} />
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">Message</label>
            <textarea value={msgContent} onChange={(e) => setMsgContent(e.target.value)}
              rows={3} placeholder="Type your message..."
              className="w-full rounded-xl border border-gray-200 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-bolt resize-none" />
          </div>
          <Button onClick={handleSendMessage} variant="bolt" size="lg" fullWidth
            icon={<Send className="h-5 w-5" />}>
            Send Message
          </Button>
        </div>
      </BottomSheet>

      {/* Add Document Sheet */}
      <BottomSheet open={showDocForm} onClose={() => setShowDocForm(false)} title="Add Document">
        <div className="space-y-4 p-1">
          <Input label="Document Name" value={docName} onChange={(e) => setDocName(e.target.value)}
            placeholder="e.g. Vehicle Insurance #001" />
          <Select label="Category" value={docCategory} onChange={(e) => setDocCategory(e.target.value)}
            options={[
              { value: "registration", label: "Registration" },
              { value: "insurance", label: "Insurance" },
              { value: "roadworthy", label: "Roadworthy" },
              { value: "permit", label: "Permit" },
              { value: "invoice", label: "Invoice" },
              { value: "other", label: "Other" },
            ]} />
          <Input label="Vehicle ID (optional)" value={docTricycle} onChange={(e) => setDocTricycle(e.target.value)}
            placeholder="e.g. tricycle-1" />
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">Expiry Date</label>
            <input type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white outline-none focus:border-bolt" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">Notes</label>
            <textarea value={docNotes} onChange={(e) => setDocNotes(e.target.value)}
              rows={2} placeholder="Any additional notes..."
              className="w-full rounded-xl border border-gray-200 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-bolt resize-none" />
          </div>
          <Button onClick={handleAddDoc} variant="bolt" size="lg" fullWidth
            icon={<FileText className="h-5 w-5" />}>
            Save Document
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

/* ─── GPS Tracker Tab ─── */
function TrackerTab({
  trackerConfig,
  riders,
  setTrackerConfig,
  patchTrackerConfig,
  addTrackerDevice,
  deleteTrackerDevice,
}: {
  trackerConfig: TrackerConfig | null;
  riders: Record<string, import("@/lib/types").Rider>;
  setTrackerConfig: (config: TrackerConfig) => Promise<void>;
  patchTrackerConfig: (updates: Partial<TrackerConfig>) => Promise<void>;
  addTrackerDevice: (id: string, device: TrackerDevice) => Promise<void>;
  deleteTrackerDevice: (id: string) => Promise<void>;
}) {
  const [showSetup, setShowSetup] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [saving, setSaving] = useState(false);

  // Setup form
  const [account, setAccount] = useState(trackerConfig?.account || "");
  const [password, setPassword] = useState(trackerConfig?.password || "");
  const [serverUrl, setServerUrl] = useState(trackerConfig?.server_url || "https://www.dagps.net");

  // Add device form
  const [deviceImei, setDeviceImei] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [deviceRider, setDeviceRider] = useState("");

  const riderList = useMemo(() =>
    Object.entries(riders).map(([id, r]) => ({ ...r, id })), [riders]);

  const deviceList = useMemo(() =>
    trackerConfig?.devices
      ? Object.entries(trackerConfig.devices).map(([id, d]) => ({ ...d, id }))
      : [],
    [trackerConfig?.devices]);

  const isConfigured = !!trackerConfig?.account;

  const handleSaveConfig = async () => {
    if (!account.trim()) { toast.error("Enter your device IMEI number"); return; }
    if (!password.trim()) { toast.error("Enter your DAGPS password"); return; }
    setSaving(true);
    try {
      if (trackerConfig) {
        await patchTrackerConfig({
          account: account.trim(),
          password: password.trim(),
          server_url: serverUrl.trim() || "https://www.dagps.net",
        });
      } else {
        await setTrackerConfig({
          platform: "dagps",
          account: account.trim(),
          password: password.trim(),
          server_url: serverUrl.trim() || "https://www.dagps.net",
          devices: {},
          enabled: true,
          poll_interval_seconds: 30,
        });
      }
      toast.success("Tracker config saved");
      setShowSetup(false);
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const handleAddDevice = async () => {
    if (!deviceImei.trim()) { toast.error("Enter device IMEI"); return; }
    if (!deviceName.trim()) { toast.error("Enter device name"); return; }
    setSaving(true);
    try {
      const id = `tracker-${deviceImei.trim()}`;
      const riderMatch = riderList.find(r => r.id === deviceRider);
      await addTrackerDevice(id, {
        imei: deviceImei.trim(),
        name: deviceName.trim(),
        rider_id: deviceRider || undefined,
        rider_name: riderMatch?.name,
        enabled: true,
        added_at: new Date().toISOString(),
      });
      toast.success("Device added");
      setShowAddDevice(false);
      setDeviceImei("");
      setDeviceName("");
      setDeviceRider("");
    } catch { toast.error("Failed to add device"); }
    finally { setSaving(false); }
  };

  const handleToggleEnabled = async () => {
    try {
      await patchTrackerConfig({ enabled: !trackerConfig?.enabled });
      toast.success(trackerConfig?.enabled ? "Tracker disabled" : "Tracker enabled");
    } catch { toast.error("Failed to update"); }
  };

  const handleRemoveDevice = async (id: string) => {
    try {
      await deleteTrackerDevice(id);
      toast.success("Device removed");
    } catch { toast.error("Failed to remove"); }
  };

  const handleToggleDevice = async (device: typeof deviceList[0]) => {
    try {
      await addTrackerDevice(device.id, { ...device, id: undefined, enabled: !device.enabled } as unknown as TrackerDevice);
      toast.success(device.enabled ? "Device disabled" : "Device enabled");
    } catch { toast.error("Failed to update"); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Status Banner */}
      <Card className={isConfigured
        ? "border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10"
        : "border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10"}>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isConfigured ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
            <Satellite className={`h-5 w-5 ${isConfigured ? "text-emerald-600" : "text-amber-600"}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {isConfigured ? "DAGPS Tracker Connected" : "GPS Tracker Not Configured"}
            </p>
            <p className="text-[11px] text-gray-500">
              {isConfigured
                ? `${deviceList.length} device${deviceList.length !== 1 ? "s" : ""} • ${trackerConfig?.enabled ? "Active" : "Paused"}`
                : "Connect your DAGPS hardware tracker"}
            </p>
          </div>
          {isConfigured && (
            <div className={`flex h-3 w-3 rounded-full ${trackerConfig?.enabled ? "bg-emerald-500" : "bg-gray-400"}`} />
          )}
        </div>
      </Card>

      {/* Setup / Edit Credentials */}
      <SectionHeader title="DAGPS Login" />
      <Card>
        <div className="space-y-3">
          {isConfigured ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-bolt" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">dagps.net</span>
                </div>
                <Badge variant={trackerConfig?.enabled ? "green" : "default"}>
                  {trackerConfig?.enabled ? "Active" : "Paused"}
                </Badge>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-surface-600">
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-gray-500">IMEI Login</span>
                  <span className="text-xs font-bold text-gray-900 dark:text-white">{trackerConfig?.account}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-gray-500">Server</span>
                  <span className="text-xs font-bold text-gray-900 dark:text-white">{trackerConfig?.server_url}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-gray-500">Poll Interval</span>
                  <span className="text-xs font-bold text-gray-900 dark:text-white">{trackerConfig?.poll_interval_seconds}s</span>
                </div>
                {trackerConfig?.last_poll && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-gray-500">Last Poll</span>
                    <span className="text-xs font-bold text-gray-900 dark:text-white">
                      {new Date(trackerConfig.last_poll).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {trackerConfig?.last_error && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-gray-500">Last Error</span>
                    <span className="text-xs font-bold text-red-500 line-clamp-1">{trackerConfig.last_error}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => {
                  setAccount(trackerConfig?.account || "");
                  setPassword(trackerConfig?.password || "");
                  setServerUrl(trackerConfig?.server_url || "https://www.dagps.net");
                  setShowSetup(true);
                }}>
                  <Pencil className="mr-1 h-3 w-3" /> Edit
                </Button>
                <Button size="sm" variant={trackerConfig?.enabled ? "danger" : "bolt"} className="flex-1"
                  onClick={handleToggleEnabled}>
                  {trackerConfig?.enabled ? <><WifiOff className="mr-1 h-3 w-3" /> Pause</> : <><Wifi className="mr-1 h-3 w-3" /> Enable</>}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center space-y-3 py-2">
              <Radio className="h-8 w-8 text-gray-300 mx-auto" />
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">Connect Your DAGPS Tracker</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Log in with your device IMEI number and password to sync your hardware GPS tracker with the fleet map
                </p>
              </div>
              <Button variant="bolt" size="md" onClick={() => setShowSetup(true)}>
                <Satellite className="mr-2 h-4 w-4" /> Set Up Tracker
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Devices */}
      {isConfigured && (
        <>
          <div className="flex items-center justify-between">
            <SectionHeader title={`Devices (${deviceList.length})`} />
            <Button size="sm" variant="bolt" onClick={() => setShowAddDevice(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Device
            </Button>
          </div>

          {deviceList.length === 0 ? (
            <EmptyState icon="📡" title="No devices" message="Add your GPS tracker device using its IMEI number" />
          ) : (
            <div className="space-y-2">
              {deviceList.map((device) => (
                <Card key={device.id} padding="sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bolt/10">
                        <Satellite className="h-5 w-5 text-bolt" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{device.name}</p>
                        <p className="text-[11px] text-gray-500">
                          IMEI: <span className="font-mono">{device.imei}</span>
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {device.rider_name ? `Assigned to ${device.rider_name}` : "Unassigned"}
                          {device.last_seen && ` • Last seen ${new Date(device.last_seen).toLocaleString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleDevice(device)}
                        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${device.enabled !== false ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-surface-600'}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${device.enabled !== false ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}`} />
                      </button>
                      <button onClick={() => handleRemoveDevice(device.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* How It Works Info */}
      <Card className="bg-gray-50 dark:bg-surface-700/50">
        <div className="space-y-3">
          <p className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">How It Works</p>
          <div className="space-y-2">
            {[
              { step: "1", text: "Enter your device IMEI and password (default: 123456) above" },
              { step: "2", text: "Add your tracker device using its IMEI number (on the device sticker)" },
              { step: "3", text: "Assign the device to a rider so it shows on the fleet map" },
              { step: "4", text: "The tracker daemon polls DAGPS every 10-30s and updates the map in real-time" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bolt text-[10px] font-black text-white shrink-0">{item.step}</span>
                <p className="text-[11px] text-gray-600 dark:text-gray-400">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30 p-2.5 mt-2">
            <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              ⚡ Requires Firebase Blaze plan (free tier generously covers small usage). Deploy the Cloud Function with: <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">firebase deploy --only functions</code>
            </p>
          </div>
        </div>
      </Card>

      {/* Setup Sheet */}
      <BottomSheet open={showSetup} onClose={() => setShowSetup(false)} title="DAGPS Tracker Setup">
        <div className="space-y-4 p-1">
          <Input label="Device IMEI Number" value={account} onChange={(e) => setAccount(e.target.value)}
            placeholder="e.g. 352672109749028" />
          <Input label="DAGPS Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Default: 123456" />
          <Input label="Server URL" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://www.dagps.net" />
          <Button onClick={handleSaveConfig} variant="bolt" size="lg" fullWidth loading={saving}
            icon={<Satellite className="h-5 w-5" />}>
            Save Configuration
          </Button>
        </div>
      </BottomSheet>

      {/* Add Device Sheet */}
      <BottomSheet open={showAddDevice} onClose={() => setShowAddDevice(false)} title="Add Tracker Device">
        <div className="space-y-4 p-1">
          <Input label="Device IMEI" value={deviceImei} onChange={(e) => setDeviceImei(e.target.value)}
            placeholder="15-digit IMEI number" />
          <Input label="Device Name" value={deviceName} onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g. Bike 1 Tracker" />
          <Select label="Assign to Rider (optional)" value={deviceRider} onChange={(e) => setDeviceRider(e.target.value)}
            options={[
              { value: "", label: "— Not assigned —" },
              ...riderList.map(r => ({ value: r.id, label: r.name })),
            ]} />
          <Button onClick={handleAddDevice} variant="bolt" size="lg" fullWidth loading={saving}
            icon={<Plus className="h-5 w-5" />}>
            Add Device
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

/* ─── Edit Settings Sheet ─── */
function EditSettingsSheet({
  settings,
  onClose,
}: {
  settings: Settings | null;
  onClose: () => void;
}) {
  const patchSettings = useFirebaseStore((s) => s.patchSettings);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fare: String(settings?.fare ?? DEFAULTS.fare),
    pax: String(settings?.pax ?? DEFAULTS.pax),
    trips: String(settings?.trips ?? DEFAULTS.trips),
    remit_d: String(settings?.remit_d ?? DEFAULTS.dailyTarget),
    rider_daily_pay: String(settings?.rider_daily_pay ?? DEFAULTS.riderDailyPay),
    rider_monthly_salary: String(settings?.rider_monthly_salary ?? DEFAULTS.riderMonthlySalary),
    wage: String(settings?.wage ?? DEFAULTS.wage),
    fleet: String(settings?.fleet ?? DEFAULTS.fleet),
    wdays: String(settings?.wdays ?? 26),
  });

  async function handleSave() {
    setSaving(true);
    try {
      await patchSettings({
        fare: parseFloat(form.fare) || DEFAULTS.fare,
        pax: parseInt(form.pax) || DEFAULTS.pax,
        trips: parseInt(form.trips) || DEFAULTS.trips,
        remit_d: parseFloat(form.remit_d) || DEFAULTS.dailyTarget,
        rider_daily_pay: parseFloat(form.rider_daily_pay) || DEFAULTS.riderDailyPay,
        rider_monthly_salary: parseFloat(form.rider_monthly_salary) || DEFAULTS.riderMonthlySalary,
        wage: parseFloat(form.wage) || DEFAULTS.wage,
        fleet: parseInt(form.fleet) || DEFAULTS.fleet,
        wdays: parseInt(form.wdays) || 26,
      });
      toast.success("Settings updated");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Edit Business Settings">
      <div className="space-y-4 p-4">
        <Input
          label="Fare per trip (GH₵)"
          type="number"
          value={form.fare}
          onChange={(e) => setForm({ ...form, fare: e.target.value })}
        />
        <Input
          label="Passengers per trip"
          type="number"
          value={form.pax}
          onChange={(e) => setForm({ ...form, pax: e.target.value })}
        />
        <Input
          label="Target trips per day"
          type="number"
          value={form.trips}
          onChange={(e) => setForm({ ...form, trips: e.target.value })}
        />
        <Input
          label="Daily target per rider (GH₵)"
          type="number"
          value={form.remit_d}
          onChange={(e) => setForm({ ...form, remit_d: e.target.value })}
        />
        <Input
          label="Rider daily pay (GH₵)"
          type="number"
          value={form.rider_daily_pay}
          onChange={(e) => setForm({ ...form, rider_daily_pay: e.target.value })}
        />
        <Input          label="Rider monthly salary (GH\u20b5)"
          type="number"
          value={form.rider_monthly_salary}
          onChange={(e) => setForm({ ...form, rider_monthly_salary: e.target.value })}
        />
        <Input          label="Rider wage (%)"
          type="number"
          value={form.wage}
          onChange={(e) => setForm({ ...form, wage: e.target.value })}
        />
        <Input
          label="Fleet size"
          type="number"
          value={form.fleet}
          onChange={(e) => setForm({ ...form, fleet: e.target.value })}
        />
        <Input
          label="Working days per month"
          type="number"
          value={form.wdays}
          onChange={(e) => setForm({ ...form, wdays: e.target.value })}
        />
        <Button fullWidth loading={saving} onClick={handleSave}>
          Save Settings
        </Button>
      </div>
    </BottomSheet>
  );
}
