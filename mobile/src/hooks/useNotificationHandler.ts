/**
 * useNotificationHandler.ts
 * ─────────────────────────────────────────────────────────────────────
 * Hook that handles notification taps (both foreground and cold-start)
 * and navigates the user to the Reminders screen via Expo Router.
 *
 * This hook must be mounted once in the root layout component so it
 * catches all notification interactions throughout the app lifecycle.
 *
 * Design decisions:
 *   • Uses a ref-based guard to prevent duplicate navigations when
 *     both the last-notification check and the listener fire for the
 *     same notification.
 *   • Does NOT auto-mark a dose as taken — the user must explicitly
 *     tap "Take Now" on the Reminders screen.
 *   • Validates the notification payload before navigating.
 * ─────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

/**
 * Extract and validate a medication reminder payload from a notification
 * response.  Returns null if the notification is not a medication
 * reminder or if the payload is malformed.
 */
function extractMedicationPayload(
  response: Notifications.NotificationResponse
): { medicationId: string; scheduledTime?: string; scheduledDate?: string } | null {
  const data = response.notification.request.content.data;
  if (!data || data.type !== 'medication_reminder') return null;
  if (typeof data.medicationId !== 'string' || !data.medicationId) return null;
  return {
    medicationId: data.medicationId as string,
    scheduledTime: data.scheduledTime as string | undefined,
    scheduledDate: data.scheduledDate as string | undefined,
  };
}

/**
 * Mount this hook in the root layout.
 *
 * When the user taps a medication reminder notification:
 *   1. The hook validates the payload.
 *   2. Navigates to `/(tabs)/reminders` via Expo Router.
 *
 * Handles both:
 *   • **Warm start**: App was in foreground/background, listener fires.
 *   • **Cold start**: App was killed, `getLastNotificationResponseAsync`
 *     returns the tapped notification before the listener is attached.
 */
export function useNotificationHandler() {
  const router = useRouter();
  /** Tracks the last-handled notification identifier to prevent double nav. */
  const lastHandledId = useRef<string | null>(null);

  useEffect(() => {
    function handleResponse(response: Notifications.NotificationResponse) {
      const notifId = response.notification.request.identifier;

      // Guard against duplicate handling
      if (lastHandledId.current === notifId) return;
      lastHandledId.current = notifId;

      const payload = extractMedicationPayload(response);
      if (!payload) return;

      // Navigate to the Reminders tab
      // Using setTimeout(0) ensures the navigation happens after the
      // current render cycle, preventing "navigation before mounting"
      // errors on cold starts.
      setTimeout(() => {
        try {
          router.push('/(tabs)/reminders' as any);
        } catch (err) {
          console.warn('[NotifHandler] Navigation failed:', err);
        }
      }, 100);
    }

    let subscription: Notifications.EventSubscription | null = null;
    try {
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (response) {
            handleResponse(response);
          }
        })
        .catch((err) => {
          console.warn('[NotifHandler] Failed to get last notification response:', err);
        });

      subscription = Notifications.addNotificationResponseReceivedListener(
        handleResponse
      );
    } catch (err) {
      console.warn('[NotifHandler] Notification listener unavailable:', err);
    }

    return () => {
      subscription?.remove();
    };
  }, [router]);
}
