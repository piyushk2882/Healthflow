/**
 * notifications.ts
 * ─────────────────────────────────────────────────────────────────────
 * Core local-notification service for HealthFlow.
 *
 * Responsibilities:
 *   1. Request & track notification permission.
 *   2. Create the Android notification channel ("Medication Reminders").
 *   3. Configure foreground presentation behaviour.
 *   4. Provide low-level helpers for scheduling, cancelling, and listing
 *      local notifications (used by medicationReminders.ts).
 *
 * This file intentionally does NOT know about medications or schedules.
 * It is a thin, reusable wrapper around expo-notifications.
 * ─────────────────────────────────────────────────────────────────────
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Linking } from 'react-native';

// =====================================================================
// Constants
// =====================================================================

/** Android notification channel created at startup. */
export const MEDICATION_CHANNEL_ID = 'medication-reminders';

// =====================================================================
// 1. Channel Setup (Android)
// =====================================================================

/**
 * Create the "Medication Reminders" channel on Android.
 * Must be called before any notification is scheduled.
 * Calling it multiple times is safe – the OS only creates once.
 */
export async function configureNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL_ID, {
        name: 'Medication Reminders',
        description: 'Reminders to take your scheduled medications',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        enableLights: true,
        lightColor: '#0a6859',
      });
    } catch (err) {
      console.warn('[Notifications] setNotificationChannelAsync error:', err);
    }
  }
}

// =====================================================================
// 2. Foreground Behaviour
// =====================================================================

/**
 * Configure how notifications behave when the app is in the foreground.
 * We show the alert and play a sound so the user sees the reminder even
 * while using the app.
 */
export function configureForegroundHandler(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        // Android-specific: route to our channel
        priority: Notifications.AndroidNotificationPriority.HIGH,
      }),
    });
  } catch (err) {
    console.warn('[Notifications] setNotificationHandler error:', err);
  }
}

// =====================================================================
// 3. Permission
// =====================================================================

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Return the current notification permission status without prompting.
 */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status as PermissionStatus;
  } catch (err) {
    console.warn('[Notifications] getPermissionsAsync error:', err);
    return 'undetermined';
  }
}

/**
 * Request notification permission from the user.
 *
 * @returns The resulting permission status.
 *
 * If the permission was previously denied by the OS (and can no longer
 * be re-requested), this function returns `'denied'` and the caller
 * should offer a link to system settings.
 */
export async function requestPermission(): Promise<PermissionStatus> {
  try {
    // expo-notifications only works on real devices for push tokens,
    // but local notifications work on simulators too.
    if (!Device.isDevice && Platform.OS === 'android') {
      return 'granted';
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return 'granted';

    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
      },
    });

    return status as PermissionStatus;
  } catch (err) {
    console.warn('[Notifications] requestPermissionsAsync error:', err);
    return 'denied';
  }
}

/**
 * Open the OS-level app settings page so the user can manually enable
 * notifications after denying permission.
 */
export function openNotificationSettings(): void {
  try {
    Linking.openSettings();
  } catch (err) {
    console.warn('[Notifications] openSettings error:', err);
  }
}

// =====================================================================
// 4. Scheduling Helpers
// =====================================================================

export interface ScheduleLocalNotificationParams {
  /** Stable identifier used to prevent duplicates & enable cancellation. */
  identifier: string;
  title: string;
  body: string;
  /** Exact date & time to fire the notification (local timezone). */
  triggerDate: Date;
  /** Arbitrary JSON payload attached to the notification. */
  data?: Record<string, unknown>;
}

/**
 * Schedule a single local notification at an exact date/time.
 *
 * Uses a date-based trigger (seconds from now) rather than a repeating
 * calendar trigger so we can precisely honour medication start/end
 * dates without over-scheduling.
 *
 * @returns The notification identifier assigned by the system.
 */
export async function scheduleLocalNotification(
  params: ScheduleLocalNotificationParams
): Promise<string> {
  const { identifier, title, body, triggerDate, data } = params;

  try {
    return await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        sound: 'default',
        data: data ?? {},
        ...(Platform.OS === 'android'
          ? { channelId: MEDICATION_CHANNEL_ID }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        ...(Platform.OS === 'android'
          ? { channelId: MEDICATION_CHANNEL_ID }
          : {}),
      },
    });
  } catch (err) {
    console.warn(`[Notifications] Failed to schedule notification ${identifier}:`, err);
    return identifier;
  }
}

/**
 * Cancel a single scheduled notification by its stable identifier.
 */
export async function cancelNotification(identifier: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (err) {
    console.warn(`[Notifications] Failed to cancel notification ${identifier}:`, err);
  }
}

/**
 * Cancel ALL scheduled notifications (used during full re-sync).
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('[Notifications] Failed to cancel all notifications:', err);
  }
}

/**
 * Return the identifiers of all currently scheduled notifications.
 */
export async function getScheduledNotificationIds(): Promise<Set<string>> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return new Set(scheduled.map((n) => n.identifier));
  } catch (err) {
    console.warn('[Notifications] Failed to get scheduled notification IDs:', err);
    return new Set<string>();
  }
}

/**
 * Return all currently scheduled notifications (for debugging/tests).
 */
export async function getAllScheduledNotifications() {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('[Notifications] Failed to get all scheduled notifications:', err);
    return [];
  }
}
