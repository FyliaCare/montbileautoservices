"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { Card, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { toast } from "sonner";
import { saveNotification } from "@/lib/firebase";
import { MessageCircle, Send, Inbox, CheckCheck } from "lucide-react";

export default function RiderMessagesPage() {
  const user = useAuthStore((s) => s.user);
  const { messages, addMessage, readMessage } = useFirebaseStore(useShallow((s) => ({
    messages: s.messages,
    addMessage: s.addMessage,
    readMessage: s.readMessage,
  })));

  const [showCompose, setShowCompose] = useState(false);
  const [msgContent, setMsgContent] = useState("");
  const [msgPriority, setMsgPriority] = useState<"normal" | "important" | "urgent">("normal");

  // Messages for this rider: broadcast or directly addressed (exclude own sent messages for inbox)
  const myMessages = useMemo(() =>
    Object.entries(messages)
      .filter(([, m]) => m.sender_id !== user?.id && (!m.recipient_id || m.recipient_id === user?.id))
      .map(([id, m]) => ({ ...m, id }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [messages, user?.id]
  );

  // Sent messages
  const sentMessages = useMemo(() =>
    Object.entries(messages)
      .filter(([, m]) => m.sender_id === user?.id)
      .map(([id, m]) => ({ ...m, id }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [messages, user?.id]
  );

  // Mark messages as read when viewing
  useEffect(() => {
    if (!user?.id) return;
    myMessages.forEach((msg) => {
      if (!msg.read_by?.[user.id]) {
        readMessage(msg.id, user.id);
      }
    });
  }, [myMessages, user?.id, readMessage]);

  const unreadCount = myMessages.filter((m) => !m.read_by?.[user?.id || ""]).length;

  const [tab, setTab] = useState<"inbox" | "sent">("inbox");

  const handleSend = async () => {
    if (!user || !msgContent.trim()) { toast.error("Enter a message"); return; }
    try {
      await addMessage({
        sender_id: user.id,
        sender_name: user.name,
        sender_role: "rider",
        content: msgContent.trim(),
        priority: msgPriority,
        read_by: { [user.id]: true },
        created_at: new Date().toISOString(),
      });
      await saveNotification({
        type: "message_received",
        title: msgPriority === "urgent" ? "🔴 Urgent Message" : "💬 New Message from Rider",
        message: `${user.name}: ${msgContent.trim().slice(0, 80)}`,
        icon: "💬",
        target_role: "management",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
      toast.success("Message sent to management");
      setShowCompose(false);
      setMsgContent("");
      setMsgPriority("normal");
    } catch {
      toast.error("Failed to send message");
    }
  };

  const priorityColors: Record<string, "green" | "gold" | "red"> = { normal: "green", important: "gold", urgent: "red" };
  const activeList = tab === "inbox" ? myMessages : sentMessages;

  return (
    <div className="px-4 pt-4 pb-28 space-y-4 animate-fade-in">
      <SectionHeader title="Messages" />
      {unreadCount > 0 && (
        <p className="text-xs text-bolt font-semibold -mt-2">{unreadCount} unread</p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-surface-700">
        <button
          onClick={() => setTab("inbox")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all ${
            tab === "inbox"
              ? "bg-white text-gray-900 shadow-sm dark:bg-surface-600 dark:text-white"
              : "text-gray-500"
          }`}
        >
          <Inbox className="h-3.5 w-3.5" /> Inbox
          {unreadCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-bolt text-[8px] font-bold text-white px-1">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all ${
            tab === "sent"
              ? "bg-white text-gray-900 shadow-sm dark:bg-surface-600 dark:text-white"
              : "text-gray-500"
          }`}
        >
          <Send className="h-3.5 w-3.5" /> Sent
        </button>
      </div>

      {/* Compose Button */}
      <Button onClick={() => setShowCompose(true)} variant="bolt" size="md" fullWidth
        icon={<MessageCircle className="h-4 w-4" />}>
        Message Management
      </Button>

      {/* Message List */}
      {activeList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3">{tab === "inbox" ? "📭" : "📤"}</div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            {tab === "inbox" ? "No messages" : "No sent messages"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {tab === "inbox" ? "Messages from management will appear here" : "Send a message to management"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeList.map((msg) => (
            <Card key={msg.id} padding="sm">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">{msg.sender_name}</p>
                    <Badge variant={priorityColors[msg.priority]}>{msg.priority}</Badge>
                    {tab === "inbox" && msg.read_by?.[user?.id || ""] && (
                      <CheckCheck className="h-3 w-3 text-bolt" />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">{msg.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {msg.recipient_name ? (
                      <span className="text-[10px] text-gray-400">→ {msg.recipient_name}</span>
                    ) : tab === "inbox" ? (
                      <span className="text-[10px] text-gray-400">📢 Broadcast</span>
                    ) : null}
                    <span className="text-[10px] text-gray-300">•</span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(msg.created_at).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Compose Sheet */}
      <BottomSheet open={showCompose} onClose={() => setShowCompose(false)} title="Send Message">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Priority</label>
            <div className="flex gap-2">
              {(["normal", "important", "urgent"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setMsgPriority(p)}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold capitalize transition-all ${
                    msgPriority === p
                      ? p === "urgent" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : p === "important" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-500 dark:bg-surface-700 dark:text-gray-400"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Message</label>
            <textarea
              value={msgContent}
              onChange={(e) => setMsgContent(e.target.value)}
              placeholder="Type your message to management..."
              className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-surface-600 dark:bg-surface-700 dark:text-white min-h-25 resize-none focus:outline-none focus:ring-2 focus:ring-bolt/30"
              maxLength={500}
            />
            <p className="text-right text-[10px] text-gray-400 mt-1">{msgContent.length}/500</p>
          </div>
          <Button onClick={handleSend} variant="bolt" size="lg" fullWidth
            icon={<Send className="h-4 w-4" />}>
            Send Message
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
