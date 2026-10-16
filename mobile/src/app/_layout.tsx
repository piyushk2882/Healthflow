import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/theme';
import {
  configureNotificationChannel,
  configureForegroundHandler,
  requestPermission,
} from '@/services/notifications';
import { syncMedicationReminders, cancelAllMedicationReminders } from '@/services/medicationReminders';
import { useNotificationHandler } from '@/hooks/useNotificationHandler';

// Configure foreground notification behaviour immediately (module-level)
// so it is active before any component mounts.
configureForegroundHandler();

function NavigationGuard() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Handle notification taps → navigate to Reminders
  useNotificationHandler();

  // Track whether we have already initialised notifications for this session
  const notifInitialised = useRef(false);

  // ─── Notification initialisation (runs once after login) ───
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    if (notifInitialised.current) return;

    // Only patients receive medication reminders
    const isPatient = user?.role === 'PATIENT';
    if (!isPatient) return;

    notifInitialised.current = true;

    (async () => {
      try {
        await configureNotificationChannel();
        const status = await requestPermission();
        if (status === 'granted') {
          await syncMedicationReminders();
        }
      } catch (err) {
        console.warn('[Layout] Notification init error:', err);
      }
    })();
  }, [isAuthenticated, isLoading, user?.role]);

  // ─── Re-sync reminders when app returns to foreground ───
  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'PATIENT') return;

    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'active') {
        syncMedicationReminders().catch((err) => {
          console.warn('[Layout] Foreground sync error:', err);
        });
      }
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, user?.role]);

  // ─── Cancel all reminders on logout ───
  useEffect(() => {
    if (!isAuthenticated && notifInitialised.current) {
      notifInitialised.current = false;
      cancelAllMedicationReminders().catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLoading) return;

    const inTabsGroup = segments[0] === '(tabs)';

    if (!isAuthenticated && inTabsGroup) {
      // User is logged out but inside tabs -> send to welcome
      router.replace('/welcome' as any);
    } else if (isAuthenticated && !inTabsGroup) {
      // User is logged in but on auth/welcome screen -> send to tabs
      router.replace('/(tabs)' as any);
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <NavigationGuard />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

