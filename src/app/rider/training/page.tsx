"use client";

import React, { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { Card } from "@/components/ui/card";
import { DEFAULTS } from "@/lib/constants";
import { useFirebaseStore } from "@/stores/firebase-store";
import { formatCurrency } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Play,
  Square,
  Plus,
  Fuel,
  MapPin,
  Target,
  Wallet,
  Mic,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  BookOpen,
  Shield,
  Phone,
  Zap,
  Navigation,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ─── Training Module Data ───
interface TrainingSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  lessons: {
    title: string;
    content: React.ReactNode;
  }[];
}

export default function TrainingPage() {
  const user = useAuthStore((s) => s.user);
  const settings = useFirebaseStore((s) => s.settings);
  const router = useRouter();
  const [expandedSection, setExpandedSection] = useState<string | null>("getting-started");
  const [expandedLesson, setExpandedLesson] = useState<string | null>("getting-started-0");
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());

  const fare = settings?.fare || DEFAULTS.fare;
  const dailyTarget = settings?.remit_d || DEFAULTS.dailyTarget;
  const riderDailyPay = settings?.rider_daily_pay || DEFAULTS.riderDailyPay;
  const riderMonthlySalary = settings?.rider_monthly_salary || DEFAULTS.riderMonthlySalary;

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  const toggleLesson = (id: string) => {
    setExpandedLesson(expandedLesson === id ? null : id);
  };

  const markComplete = (id: string) => {
    setCompletedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sections: TrainingSection[] = [
    {
      id: "getting-started",
      title: "Getting Started",
      icon: <Zap className="h-5 w-5" />,
      color: "text-bolt",
      lessons: [
        {
          title: "Welcome to Montbile Auto Services",
          content: (
            <div className="space-y-3">
              <p>Welcome to the Montbile Auto Services platform! This app helps you manage your daily tricycle operations efficiently.</p>
              <div className="rounded-xl bg-bolt/10 p-3">
                <p className="text-xs font-bold text-bolt">What you can do:</p>
                <ul className="mt-1.5 space-y-1 text-xs text-bolt/80">
                  <li>• Start and end your daily shift</li>
                  <li>• Log trips and track earnings</li>
                  <li>• Go online/offline during your shift</li>
                  <li>• Track your daily target and bonuses</li>
                  <li>• Log fuel purchases</li>
                  <li>• Use voice commands with Hey Monty</li>
                  <li>• Submit remittance to management</li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          title: "Your Dashboard Overview",
          content: (
            <div className="space-y-3">
              <p>Your home screen shows everything at a glance:</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Play className="h-4 w-4 text-bolt mt-0.5 shrink-0" />
                  <p><strong>Shift Card</strong> — Start/end your shift and see your timer</p>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-gold mt-0.5 shrink-0" />
                  <p><strong>Earnings & Trips</strong> — Today&apos;s stats at a glance</p>
                </div>
                <div className="flex items-start gap-2">
                  <Target className="h-4 w-4 text-bolt mt-0.5 shrink-0" />
                  <p><strong>Daily Target</strong> — Progress bar showing how close you are to {formatCurrency(dailyTarget)}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Wallet className="h-4 w-4 text-bolt mt-0.5 shrink-0" />
                  <p><strong>Management Owes You</strong> — Your daily pay + bonus breakdown</p>
                </div>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "shift-management",
      title: "Shift Management",
      icon: <Clock className="h-5 w-5" />,
      color: "text-bolt",
      lessons: [
        {
          title: "Starting Your Shift",
          content: (
            <div className="space-y-3">
              <p>To start your shift:</p>
              <ol className="space-y-2 list-decimal list-inside">
                <li>Tap the <strong>&quot;Start Shift&quot;</strong> button on your home screen</li>
                <li>Complete the <strong>Vehicle Inspection Checklist</strong>:
                  <ul className="ml-5 mt-1 space-y-0.5 list-disc text-xs text-gray-500">
                    <li>Engine starts properly 🔧</li>
                    <li>Brakes working 🛑</li>
                    <li>Lights & horn working 💡</li>
                    <li>Tires in good shape 🛞</li>
                    <li>Enough fuel ⛽</li>
                  </ul>
                </li>
                <li>Tap <strong>&quot;All Good — Start Shift&quot;</strong> to begin</li>
              </ol>
              <div className="rounded-xl bg-gold/10 p-3">
                <p className="text-xs font-bold text-gold-dark">💡 Tip: You can still start your shift even if some items fail, but management will be notified of the issues you flagged.</p>
              </div>
              <div className="rounded-xl bg-danger/10 p-3">
                <p className="text-xs font-bold text-danger">⚠️ Important: You can only start ONE shift per day. Make sure you&apos;re ready before starting!</p>
              </div>
            </div>
          ),
        },
        {
          title: "Going Online & Offline",
          content: (
            <div className="space-y-3">
              <p>During your shift, you can toggle between <strong>Online</strong> and <strong>Offline</strong> as many times as you want.</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500 mt-1 shrink-0" />
                  <div>
                    <p className="font-bold text-sm">Online</p>
                    <p className="text-xs text-gray-500">GPS tracking is active. Your location appears on management&apos;s map as a green tricycle.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-3 w-3 rounded-full bg-gray-400 mt-1 shrink-0" />
                  <div>
                    <p className="font-bold text-sm">Offline</p>
                    <p className="text-xs text-gray-500">GPS is paused. Your marker turns grey on the map. Good for breaks or parking.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-bolt/10 p-3">
                <p className="text-xs font-bold text-bolt">📍 When you start a shift, you&apos;re automatically set to Online. Use the toggle slider on your shift card to switch.</p>
              </div>
              <p className="text-xs text-gray-500">You can still log trips and fuel whether online or offline.</p>
            </div>
          ),
        },
        {
          title: "Ending Your Shift",
          content: (
            <div className="space-y-3">
              <p>When you&apos;re done for the day:</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>Tap the red <strong>&quot;End&quot;</strong> button</li>
                <li>You&apos;ll see a <strong>confirmation screen</strong> showing your stats</li>
                <li>If you haven&apos;t hit your target, you&apos;ll get a warning</li>
                <li>Tap <strong>&quot;End Shift&quot;</strong> to confirm, or <strong>&quot;Keep Riding&quot;</strong> to continue</li>
                <li>After ending, you&apos;ll see a <strong>shift summary</strong></li>
              </ol>
              <div className="rounded-xl bg-danger/10 p-3">
                <p className="text-xs font-bold text-danger">⚠️ Once you end your shift, you CANNOT restart it for the day. Make sure you&apos;re truly done!</p>
              </div>
              <div className="rounded-xl bg-bolt/10 p-3">
                <p className="text-xs font-bold text-bolt">💡 After ending your shift, go to the Earnings tab to submit your remittance to management.</p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "trips-earnings",
      title: "Trips & Earnings",
      icon: <Navigation className="h-5 w-5" />,
      color: "text-gold",
      lessons: [
        {
          title: "Logging a Trip",
          content: (
            <div className="space-y-3">
              <p>After each trip with passengers:</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>Tap the <strong>&quot;Trip&quot;</strong> button (orange)</li>
                <li>The default fare is <strong>{formatCurrency(fare)}</strong></li>
                <li>Use quick amounts or type a custom fare</li>
                <li>Tap <strong>&quot;Confirm Trip&quot;</strong></li>
              </ol>
              <div className="rounded-xl bg-gold/10 p-3">
                <p className="text-xs font-bold text-gold-dark">🪙 You&apos;ll see a coin animation each time — that&apos;s your money stacking up!</p>
              </div>
              <p className="text-xs text-gray-500">You can also say <strong>&quot;Hey Monty, log a trip&quot;</strong> to use voice.</p>
            </div>
          ),
        },
        {
          title: "Understanding Your Daily Target",
          content: (
            <div className="space-y-3">
              <p>Your daily remittance target is <strong>{formatCurrency(dailyTarget)}</strong>.</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Target className="h-4 w-4 text-bolt mt-0.5 shrink-0" />
                  <p>The progress bar on your dashboard shows how close you are</p>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-gold mt-0.5 shrink-0" />
                  <p>When you hit 100%, you&apos;ve reached your target!</p>
                </div>
              </div>
              <div className="rounded-xl bg-bolt/10 p-3">
                <p className="text-xs font-bold text-bolt">🎯 Anything you earn ABOVE {formatCurrency(dailyTarget)} becomes your BONUS — sent to your account!</p>
              </div>
            </div>
          ),
        },
        {
          title: "Pay & Bonus Structure",
          content: (
            <div className="space-y-3">
              <p>Here&apos;s how you get paid:</p>
              <div className="space-y-2">
                <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold">Daily Pay</span>
                    <span className="text-sm font-black text-bolt">{formatCurrency(riderDailyPay)}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">Paid to you physically each day</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold">Monthly Salary</span>
                    <span className="text-sm font-black text-bolt">{formatCurrency(riderMonthlySalary)}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">Fixed monthly amount</p>
                </div>
                <div className="rounded-xl bg-gold/10 p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gold-dark">Bonus</span>
                    <span className="text-sm font-black text-gold">Earnings above {formatCurrency(dailyTarget)}</span>
                  </div>
                  <p className="text-[10px] text-gold-dark/70 mt-0.5">Sent to your account — you keep everything above target!</p>
                </div>
              </div>
            </div>
          ),
        },
        {
          title: "Submitting Remittance",
          content: (
            <div className="space-y-3">
              <p>At the end of your shift, you must <strong>submit ALL your earnings</strong> to management.</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>Go to the <strong>Earnings</strong> tab</li>
                <li>Review your total earnings</li>
                <li>Submit the full amount to management</li>
                <li>Management will physically pay you back your <strong>{formatCurrency(riderDailyPay)} daily pay</strong></li>
                <li>Any bonus above target gets <strong>sent to your account</strong></li>
              </ol>
              <div className="rounded-xl bg-bolt/10 p-3">
                <p className="text-xs font-bold text-bolt">💰 Example: You earn {formatCurrency(400)}. You submit all {formatCurrency(400)}. Management pays you {formatCurrency(riderDailyPay)} + {formatCurrency(25)} bonus = {formatCurrency(75)} back.</p>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "fuel-expenses",
      title: "Fuel & Expenses",
      icon: <Fuel className="h-5 w-5" />,
      color: "text-gold",
      lessons: [
        {
          title: "Logging Fuel Purchases",
          content: (
            <div className="space-y-3">
              <p>Whenever you buy fuel during your shift:</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>Tap the <strong>&quot;Fuel&quot;</strong> button (gold)</li>
                <li>Enter the <strong>cost in GH₵</strong></li>
                <li>Optionally enter <strong>litres</strong></li>
                <li>Use quick amounts or type a custom amount</li>
                <li>Tap <strong>&quot;Log Fuel&quot;</strong></li>
              </ol>
              <div className="rounded-xl bg-gold/10 p-3">
                <p className="text-xs font-bold text-gold-dark">⛽ Management is notified of every fuel purchase. Keep receipts!</p>
              </div>
              <p className="text-xs text-gray-500">You can also say <strong>&quot;Hey Monty, log fuel 20 cedis&quot;</strong> to use voice.</p>
            </div>
          ),
        },
      ],
    },
    {
      id: "voice-commands",
      title: "Hey Monty Voice Bot",
      icon: <Mic className="h-5 w-5" />,
      color: "text-bolt",
      lessons: [
        {
          title: "Using Voice Commands",
          content: (
            <div className="space-y-3">
              <p>Monty is your voice assistant! You can tap the floating <strong>microphone button</strong> (bottom-right) to speak commands.</p>
              <div className="rounded-xl bg-bolt/10 p-3">
                <p className="text-xs font-bold text-bolt">🎙️ You can drag the Monty button anywhere on screen for easy access!</p>
              </div>
              <p className="font-bold text-sm mt-2">Here&apos;s what you can say:</p>
              <div className="space-y-1.5">
                {[
                  { cmd: "\"Start my shift\"", desc: "Begins your shift" },
                  { cmd: "\"End my shift\"", desc: "Ends your shift" },
                  { cmd: "\"Log a trip\"", desc: "Logs a trip at default fare" },
                  { cmd: "\"Log trip 5 cedis\"", desc: "Logs a custom fare trip" },
                  { cmd: "\"Log fuel 20 cedis\"", desc: "Logs a fuel purchase" },
                  { cmd: "\"Go online\"", desc: "Turns GPS on" },
                  { cmd: "\"Go offline\"", desc: "Turns GPS off" },
                  { cmd: "\"How much have I earned?\"", desc: "Checks earnings" },
                  { cmd: "\"How many trips?\"", desc: "Checks trip count" },
                  { cmd: "\"Am I on target?\"", desc: "Checks daily target progress" },
                  { cmd: "\"What do they owe me?\"", desc: "Checks what management owes" },
                  { cmd: "\"What&apos;s my bonus?\"", desc: "Checks today's bonus" },
                  { cmd: "\"Help\"", desc: "Lists all commands" },
                ].map((item) => (
                  <div key={item.cmd} className="flex items-center gap-2 text-xs">
                    <code className="rounded bg-gray-100 dark:bg-surface-700 px-1.5 py-0.5 text-bolt font-bold">{item.cmd}</code>
                    <span className="text-gray-500">→ {item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ),
        },
      ],
    },
    {
      id: "safety",
      title: "Safety & Rules",
      icon: <Shield className="h-5 w-5" />,
      color: "text-danger",
      lessons: [
        {
          title: "Vehicle Safety",
          content: (
            <div className="space-y-3">
              <p>Always complete the vehicle inspection before driving. Report any issues immediately through the checklist.</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-4 w-4 text-bolt shrink-0" />
                  <span>Check engine, brakes, lights, horn, and tires daily</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-4 w-4 text-bolt shrink-0" />
                  <span>Ensure sufficient fuel before starting</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-4 w-4 text-bolt shrink-0" />
                  <span>Report any mechanical issues to management</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-4 w-4 text-bolt shrink-0" />
                  <span>Never overload — maximum {DEFAULTS.pax} passengers</span>
                </div>
              </div>
              <div className="rounded-xl bg-danger/10 p-3">
                <p className="text-xs font-bold text-danger">🚨 If you flag vehicle issues in the checklist, management will be notified immediately. Don&apos;t ignore safety concerns!</p>
              </div>
            </div>
          ),
        },
        {
          title: "Rider Rules",
          content: (
            <div className="space-y-3">
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-bolt font-bold">1.</span>
                  <span>Always log every trip accurately — no skipping</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-bolt font-bold">2.</span>
                  <span>Submit ALL earnings to management at end of shift</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-bolt font-bold">3.</span>
                  <span>Keep GPS online while actively driving</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-bolt font-bold">4.</span>
                  <span>Be courteous to passengers at all times</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-bolt font-bold">5.</span>
                  <span>Log all fuel purchases with amounts</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-bolt font-bold">6.</span>
                  <span>Do not end shift until you&apos;re truly done for the day</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <span className="text-bolt font-bold">7.</span>
                  <span>Go offline when taking breaks or parked for long</span>
                </li>
              </ul>
            </div>
          ),
        },
        {
          title: "Emergency Contacts",
          content: (
            <div className="space-y-3">
              <p>In case of emergency, contact:</p>
              <div className="space-y-2">
                <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 flex items-center gap-3">
                  <Phone className="h-5 w-5 text-bolt" />
                  <div>
                    <p className="text-sm font-bold">Management</p>
                    <p className="text-xs text-gray-500">Contact your fleet manager immediately</p>
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-danger" />
                  <div>
                    <p className="text-sm font-bold">Accident/Emergency</p>
                    <p className="text-xs text-gray-500">Call 112 (Ghana emergency) or nearest police</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-bolt/10 p-3">
                <p className="text-xs font-bold text-bolt">💡 If you&apos;re involved in an incident, report it through the app so management is notified.</p>
              </div>
            </div>
          ),
        },
      ],
    },
  ];

  const totalLessons = sections.reduce((sum, s) => sum + s.lessons.length, 0);
  const completedCount = completedLessons.size;
  const overallProgress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  return (
    <div className="space-y-5 p-4 pb-28">
      {/* Header */}
      <div className="animate-fade-in">
        <button
          onClick={() => router.push("/rider")}
          className="flex items-center gap-1.5 text-gray-400 hover:text-bolt transition-colors mb-3 tap-active"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-xs font-bold">Back to Dashboard</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bolt/10">
            <BookOpen className="h-6 w-6 text-bolt" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              Training Centre
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Learn everything about the platform
            </p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <Card className="animate-slide-up">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Your Progress</p>
          <span className={`text-sm font-extrabold tabular ${overallProgress >= 100 ? "text-bolt" : "text-gold"}`}>
            {overallProgress}%
          </span>
        </div>
        <div className="h-3 rounded-full bg-gray-100 dark:bg-surface-600 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              overallProgress >= 100
                ? "bg-linear-to-r from-bolt to-bolt-dark"
                : "bg-linear-to-r from-gold to-gold-dark"
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {completedCount} of {totalLessons} lessons completed
        </p>
        {overallProgress >= 100 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-bolt/10 p-3">
            <span className="text-lg">🎉</span>
            <p className="text-xs font-bold text-bolt">All training completed! You&apos;re a pro rider now!</p>
          </div>
        )}
      </Card>

      {/* Sections */}
      <div className="space-y-3 animate-fade-in">
        {sections.map((section) => {
          const sectionOpen = expandedSection === section.id;
          const sectionCompleted = section.lessons.every((_, i) =>
            completedLessons.has(`${section.id}-${i}`)
          );

          return (
            <div key={section.id} className="rounded-2xl border border-gray-200/50 dark:border-surface-600/50 overflow-hidden">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-3 p-4 bg-white dark:bg-surface-800 hover:bg-gray-50 dark:hover:bg-surface-750 transition-colors tap-active"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  sectionCompleted ? "bg-bolt/10" : "bg-gray-100 dark:bg-surface-700"
                }`}>
                  {sectionCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-bolt" />
                  ) : (
                    <span className={section.color}>{section.icon}</span>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{section.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {section.lessons.filter((_, i) => completedLessons.has(`${section.id}-${i}`)).length} / {section.lessons.length} lessons
                  </p>
                </div>
                {sectionOpen ? (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                )}
              </button>

              {/* Lessons */}
              {sectionOpen && (
                <div className="border-t border-gray-100 dark:border-surface-700">
                  {section.lessons.map((lesson, i) => {
                    const lessonId = `${section.id}-${i}`;
                    const lessonOpen = expandedLesson === lessonId;
                    const completed = completedLessons.has(lessonId);

                    return (
                      <div key={lessonId} className="border-b border-gray-100 dark:border-surface-700 last:border-b-0">
                        <button
                          onClick={() => toggleLesson(lessonId)}
                          className="w-full flex items-center gap-3 p-3.5 pl-5 hover:bg-gray-50 dark:hover:bg-surface-750 transition-colors tap-active"
                        >
                          <div className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${
                            completed ? "bg-bolt/15" : "bg-gray-100 dark:bg-surface-700"
                          }`}>
                            {completed ? (
                              <CheckCircle2 className="h-4 w-4 text-bolt" />
                            ) : (
                              <span className="text-[10px] font-black text-gray-400">{i + 1}</span>
                            )}
                          </div>
                          <p className={`flex-1 text-left text-sm font-semibold ${
                            completed ? "text-bolt" : "text-gray-700 dark:text-gray-300"
                          }`}>
                            {lesson.title}
                          </p>
                          {lessonOpen ? (
                            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                          )}
                        </button>

                        {lessonOpen && (
                          <div className="px-5 pb-4 pt-1">
                            <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                              {lesson.content}
                            </div>
                            <button
                              onClick={() => markComplete(lessonId)}
                              className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all tap-active w-full justify-center ${
                                completed
                                  ? "bg-bolt/10 text-bolt"
                                  : "bg-gray-100 text-gray-600 hover:bg-bolt/10 hover:text-bolt dark:bg-surface-700 dark:text-gray-400"
                              }`}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              {completed ? "Completed ✓" : "Mark as Complete"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
