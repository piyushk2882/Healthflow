/**
 * medicationReminders.ts
 * ─────────────────────────────────────────────────────────────────────
 * Medication-specific reminder scheduling service for HealthFlow.
 *
 * Responsibilities:
 *   1. Fetch ACTIVE medications + schedules from the backend API.
 *   2. Compute upcoming dose times within a rolling scheduling window.
 *   3. Reconcile (diff) against currently-scheduled notifications to
 *      add new ones and cancel stale ones — preventing duplicates.
 *   4. Respect medication start_date, end_date, and status.
 *   5. Generate stable notification identifiers so that re-syncs are
 *      idempotent across app restarts.
 *
 * Design decisions:
 *   • Rolling window: 3 days ahead.  Keeps the notification tray
 *     manageable on Android (≤ 64 scheduled per app) and iOS.
 *     Re-synced whenever the app returns to the foreground.
 *   • Stable ID format:  `med-<medicationId>-<YYYY-MM-DD>-<HH:mm>`
 *     This is deterministic from the data so duplicate avoidance is
 *     automatic — scheduling the same (med, date, time) twice is a
 *     no-op because expo-notifications replaces by identifier.
 *   • Does NOT mark doses as missed/taken — that is the user's
 *     explicit action via the Reminders screen.
 * ─────────────────────────────────────────────────────────────────────
 */

import {
  scheduleLocalNotification,
  cancelNotification,
  getScheduledNotificationIds,
  getPermissionStatus,
} from './notifications';
import { api, Medication } from './api';

// =====================================================================
// Constants
// =====================================================================

/** How many days ahead to pre-schedule reminders. */
export const SCHEDULING_WINDOW_DAYS = 3;

/** Maximum notifications to schedule concurrently (iOS max is 64; keep buffer). */
export const MAX_SCHEDULED_NOTIFICATIONS = 60;

/** Prefix for all medication reminder notification IDs. */
export const NOTIF_ID_PREFIX = 'med';

// =====================================================================
// Stable ID Generation
// =====================================================================

/**
 * Generate a deterministic notification identifier for a specific
 * medication dose on a specific date.
 *
 * Format: `med-<medicationId>-<YYYY-MM-DD>-<HH:mm>`
 */
export function makeNotifId(
  medicationId: string,
  dateStr: string,
  timeStr: string
): string {
  // Normalise time to HH:mm (drop seconds if present)
  const normTime = timeStr.slice(0, 5);
  return `${NOTIF_ID_PREFIX}-${medicationId}-${dateStr}-${normTime}`;
}

/**
 * Check whether a notification ID belongs to the medication reminder
 * system (as opposed to other app notifications).
 */
export function isMedicationNotifId(id: string): boolean {
  return id.startsWith(`${NOTIF_ID_PREFIX}-`);
}

// =====================================================================
// Date Helpers (local timezone)
// =====================================================================

/** Format a Date into "YYYY-MM-DD" in local timezone. */
export function toLocalDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Build a Date from a local "YYYY-MM-DD" string and a "HH:mm" time.
 * The result is a Date in the device's local timezone.
 */
export function localDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/**
 * Get the start-of-day Date (00:00:00.000) for a "YYYY-MM-DD" string
 * in local timezone.
 */
export function startOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Return an array of date strings covering the scheduling window
 * from today through today + SCHEDULING_WINDOW_DAYS.
 */
export function getWindowDates(referenceDate: Date = new Date()): string[] {
  const dates: string[] = [];
  for (let i = 0; i <= SCHEDULING_WINDOW_DAYS; i++) {
    const d = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() + i
    );
    dates.push(toLocalDateStr(d));
  }
  return dates;
}

// =====================================================================
// Core: Compute Desired Notifications
// =====================================================================

export interface DesiredNotification {
  id: string;
  medicationId: string;
  medicationName: string;
  dose: string;
  triggerDate: Date;
  dateStr: string;
  timeStr: string;
}

/**
 * Given a list of medications (with embedded schedules), compute every
 * notification that should exist within the scheduling window.
 *
 * Rules:
 *   - Only ACTIVE medications.
 *   - Only dates within [startDate, endDate] (if endDate is set).
 *   - Only future times (not in the past).
 *   - One notification per (medication, date, scheduledTime).
 */
export function computeDesiredNotifications(
  medications: Medication[],
  referenceNow: Date = new Date()
): DesiredNotification[] {
  const windowDates = getWindowDates(referenceNow);
  const desired: DesiredNotification[] = [];

  for (const med of medications) {
    // Skip non-active medications
    if (med.status !== 'ACTIVE') continue;

    const schedules = med.schedules || [];
    if (schedules.length === 0) continue;

    // Parse medication date boundaries
    const medStart = med.startDate ? startOfDay(med.startDate.slice(0, 10)) : null;
    const medEnd = med.endDate ? startOfDay(med.endDate.slice(0, 10)) : null;

    for (const dateStr of windowDates) {
      const dayStart = startOfDay(dateStr);

      // Skip if before medication start date
      if (medStart && dayStart < medStart) continue;
      // Skip if after medication end date
      if (medEnd && dayStart > medEnd) continue;

      for (const schedule of schedules) {
        const timeStr = schedule.scheduledTime.slice(0, 5); // HH:mm
        const triggerDate = localDateTime(dateStr, timeStr);

        // Don't schedule in the past
        if (triggerDate <= referenceNow) continue;

        const id = makeNotifId(med.id, dateStr, timeStr);
        const doseText = schedule.dose || med.dosage || med.frequency || '1 dose';

        desired.push({
          id,
          medicationId: med.id,
          medicationName: med.name,
          dose: doseText,
          triggerDate,
          dateStr,
          timeStr,
        });
      }
    }
  }

  return desired;
}

// =====================================================================
// Core: Sync / Reconcile & Diagnostics
// =====================================================================

export interface SyncResult {
  scheduled: number;
  cancelled: number;
  kept: number;
  permissionDenied: boolean;
  apiFailed: boolean;
  errorMessage?: string;
  truncatedCount: number;
}

export interface ReminderDiagnostics {
  permissionStatus: string;
  eligibleDosesInWindow: number;
  pendingScheduledCount: number;
  totalScheduledCount: number;
  lastSyncTime: string | null;
  lastSyncError: string | null;
  lastSyncStats: {
    scheduled: number;
    cancelled: number;
    kept: number;
  };
  truncatedDosesCount: number;
  isSyncing: boolean;
  schedulingWindowDays: number;
  maxScheduledLimit: number;
}

/**
 * Pure diffing algorithm that compares desired notifications against
 * currently scheduled notification IDs.
 *
 * Exported for automated unit testing.
 */
export function reconcileNotificationDiff(
  desired: DesiredNotification[],
  currentIds: Set<string>
): { toSchedule: DesiredNotification[]; toCancel: string[]; kept: string[] } {
  const desiredIds = new Set(desired.map((d) => d.id));
  const toCancel: string[] = [];
  const kept: string[] = [];
  const toSchedule: DesiredNotification[] = [];

  for (const existingId of currentIds) {
    if (isMedicationNotifId(existingId) && !desiredIds.has(existingId)) {
      toCancel.push(existingId);
    }
  }

  for (const notif of desired) {
    if (currentIds.has(notif.id)) {
      kept.push(notif.id);
    } else {
      toSchedule.push(notif);
    }
  }

  return { toSchedule, toCancel, kept };
}

// Internal mutex and diagnostic state
let activeSyncPromise: Promise<SyncResult> | null = null;
let syncQueued = false;

interface DiagnosticState {
  lastSyncTime: string | null;
  lastSyncError: string | null;
  lastSyncStats: {
    scheduled: number;
    cancelled: number;
    kept: number;
  };
  eligibleDosesInWindow: number;
  truncatedCount: number;
  isSyncing: boolean;
}

const diagnosticsState: DiagnosticState = {
  lastSyncTime: null,
  lastSyncError: null,
  lastSyncStats: { scheduled: 0, cancelled: 0, kept: 0 },
  eligibleDosesInWindow: 0,
  truncatedCount: 0,
  isSyncing: false,
};

/**
 * Main synchronisation entry point.
 *
 * Implements an in-flight concurrency mutex lock:
 *   - If a sync is already running, queues a follow-up sync to run immediately
 *     after and returns the active promise.
 *   - Guarantees that two reconciliation passes never execute concurrently,
 *     preventing race conditions and duplicate scheduling.
 */
export async function syncMedicationReminders(): Promise<SyncResult> {
  if (activeSyncPromise) {
    syncQueued = true;
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    try {
      diagnosticsState.isSyncing = true;
      let result = await executeReconciliation();
      while (syncQueued) {
        syncQueued = false;
        result = await executeReconciliation();
      }
      return result;
    } finally {
      diagnosticsState.isSyncing = false;
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

/**
 * Internal single-pass reconciliation logic.
 */
async function executeReconciliation(): Promise<SyncResult> {
  const result: SyncResult = {
    scheduled: 0,
    cancelled: 0,
    kept: 0,
    permissionDenied: false,
    apiFailed: false,
    truncatedCount: 0,
  };

  // 1. Check notification permission
  const permission = await getPermissionStatus();
  if (permission !== 'granted') {
    result.permissionDenied = true;
    diagnosticsState.lastSyncError = `Permission not granted (${permission})`;
    return result;
  }

  // 2. Fetch active medications from backend
  // CRITICAL: If the API fails or device is offline, DO NOT wipe existing notifications!
  let medications: Medication[] = [];
  try {
    const res = await api.medications.list('ACTIVE');
    if (!res.success || !res.data?.medications) {
      const errMsg = res.message || 'API responded with unsuccessful status';
      result.apiFailed = true;
      result.errorMessage = errMsg;
      diagnosticsState.lastSyncError = errMsg;
      console.warn('[MedReminders] Sync skipped due to API response:', errMsg);
      return result;
    }
    medications = res.data.medications;
  } catch (err: any) {
    const errMsg = err?.message || 'Network error fetching medications';
    result.apiFailed = true;
    result.errorMessage = errMsg;
    diagnosticsState.lastSyncError = errMsg;
    console.warn('[MedReminders] Sync skipped due to network error:', errMsg);
    return result;
  }

  // 3. Compute desired notifications
  const allDesired = computeDesiredNotifications(medications);
  diagnosticsState.eligibleDosesInWindow = allDesired.length;

  // 4. Enforce platform scheduling limit (cap to 60 for iOS 64 limit and Android AlarmManager)
  // Sort chronologically to prioritize the earliest doses
  let desired = allDesired;
  if (allDesired.length > MAX_SCHEDULED_NOTIFICATIONS) {
    result.truncatedCount = allDesired.length - MAX_SCHEDULED_NOTIFICATIONS;
    diagnosticsState.truncatedCount = result.truncatedCount;
    if (__DEV__) {
      console.warn(
        `[MedReminders] Doses in window (${allDesired.length}) exceeds platform limit (${MAX_SCHEDULED_NOTIFICATIONS}). Truncating to earliest.`
      );
    }
    desired = allDesired
      .slice()
      .sort((a, b) => a.triggerDate.getTime() - b.triggerDate.getTime())
      .slice(0, MAX_SCHEDULED_NOTIFICATIONS);
  } else {
    diagnosticsState.truncatedCount = 0;
  }

  // 5. Query currently scheduled notification IDs from OS
  const currentIds = await getScheduledNotificationIds();

  // 6. Reconcile diff (cancel obsolete, schedule missing, keep valid)
  const diff = reconcileNotificationDiff(desired, currentIds);

  for (const staleId of diff.toCancel) {
    try {
      await cancelNotification(staleId);
      result.cancelled++;
    } catch {
      // Ignore cancellation errors for already-fired notifications
    }
  }

  result.kept = diff.kept.length;

  for (const notif of diff.toSchedule) {
    try {
      await scheduleLocalNotification({
        identifier: notif.id,
        title: 'Medication Reminder',
        body: `Time to take ${notif.medicationName} — ${notif.dose}`,
        triggerDate: notif.triggerDate,
        data: {
          type: 'medication_reminder',
          medicationId: notif.medicationId,
          scheduledTime: notif.timeStr,
          scheduledDate: notif.dateStr,
        },
      });
      result.scheduled++;
    } catch (err) {
      console.warn(`[MedReminders] Failed to schedule ${notif.id}:`, err);
    }
  }

  // Record successful sync diagnostic metrics
  diagnosticsState.lastSyncTime = new Date().toISOString();
  diagnosticsState.lastSyncError = null;
  diagnosticsState.lastSyncStats = {
    scheduled: result.scheduled,
    cancelled: result.cancelled,
    kept: result.kept,
  };

  if (__DEV__) {
    console.log(
      `[MedReminders] Sync complete: ${result.scheduled} scheduled, ` +
        `${result.cancelled} cancelled, ${result.kept} unchanged`
    );
  }

  return result;
}

/**
 * Return current diagnostic snapshot of the medication reminder system.
 * Useful for development diagnostics and automated testing.
 */
export async function getReminderDiagnostics(): Promise<ReminderDiagnostics> {
  const permissionStatus = await getPermissionStatus();
  const currentIds = await getScheduledNotificationIds();
  const medicationNotifCount = Array.from(currentIds).filter(isMedicationNotifId).length;

  return {
    permissionStatus,
    eligibleDosesInWindow: diagnosticsState.eligibleDosesInWindow,
    pendingScheduledCount: medicationNotifCount,
    totalScheduledCount: currentIds.size,
    lastSyncTime: diagnosticsState.lastSyncTime,
    lastSyncError: diagnosticsState.lastSyncError,
    lastSyncStats: diagnosticsState.lastSyncStats,
    truncatedDosesCount: diagnosticsState.truncatedCount,
    isSyncing: diagnosticsState.isSyncing,
    schedulingWindowDays: SCHEDULING_WINDOW_DAYS,
    maxScheduledLimit: MAX_SCHEDULED_NOTIFICATIONS,
  };
}

/**
 * Cancel all medication-related notifications.
 * Called when a patient logs out or all medications become inactive.
 */
export async function cancelAllMedicationReminders(): Promise<number> {
  const currentIds = await getScheduledNotificationIds();
  let cancelled = 0;

  for (const id of currentIds) {
    if (isMedicationNotifId(id)) {
      try {
        await cancelNotification(id);
        cancelled++;
      } catch {
        // Already fired or invalid
      }
    }
  }

  if (__DEV__) {
    console.log(`[MedReminders] Cancelled all: ${cancelled} notifications`);
  }

  return cancelled;
}

/**
 * Cancel reminders for a specific medication ID.
 * Called after a medication is discontinued, paused, or deleted.
 */
export async function cancelRemindersForMedication(
  medicationId: string
): Promise<number> {
  const currentIds = await getScheduledNotificationIds();
  let cancelled = 0;

  const prefix = `${NOTIF_ID_PREFIX}-${medicationId}-`;

  for (const id of currentIds) {
    if (id.startsWith(prefix)) {
      try {
        await cancelNotification(id);
        cancelled++;
      } catch {
        // Already fired or invalid
      }
    }
  }

  if (__DEV__) {
    console.log(
      `[MedReminders] Cancelled ${cancelled} reminders for medication ${medicationId}`
    );
  }

  return cancelled;
}
