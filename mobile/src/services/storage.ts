/**
 * safeStorage — Robust, cross-platform key-value persistence.
 *
 * Layer 1: In-memory Map for instant, synchronous access.
 * Layer 2: Web -> window.localStorage.
 * Layer 3: Native (Expo Go / iOS / Android) -> expo-secure-store.
 *
 * Reads and deletes degrade safely if native storage is unavailable. Writes
 * reject on failure so callers never mistake a memory-only value for a saved
 * login session.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const memoryStore = new Map<string, string>();

function sanitize(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = sanitize(key);

    // 1. Fast in-memory cache check
    if (memoryStore.has(k)) {
      return memoryStore.get(k)!;
    }

    // 2. Web -> localStorage
    if (Platform.OS === 'web') {
      try {
        const val = typeof window !== 'undefined' ? (window.localStorage?.getItem(k) ?? null) : null;
        if (val !== null) {
          memoryStore.set(k, val);
        }
        return val;
      } catch {
        return null;
      }
    }

    // 3. Native -> expo-secure-store
    try {
      const isAvailable = await SecureStore.isAvailableAsync().catch(() => false);
      if (isAvailable) {
        const val = await SecureStore.getItemAsync(k);
        if (val !== null) {
          memoryStore.set(k, val);
        }
        return val;
      }
    } catch (e) {
      console.warn('[safeStorage] Native secure store read error:', e);
    }

    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const k = sanitize(key);

    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.localStorage) {
        throw new Error('Persistent storage is unavailable in this browser.');
      }
      window.localStorage.setItem(k, value);
      memoryStore.set(k, value);
      return;
    }

    try {
      const isAvailable = await SecureStore.isAvailableAsync().catch(() => false);
      if (!isAvailable) {
        throw new Error('Secure storage is unavailable on this device.');
      }
      await SecureStore.setItemAsync(k, value);
      memoryStore.set(k, value);
    } catch (e) {
      console.warn('[safeStorage] Native secure store write error:', e);
      throw e;
    }
  },

  async removeItem(key: string): Promise<void> {
    const k = sanitize(key);
    memoryStore.delete(k);

    if (Platform.OS === 'web') {
      try {
        window.localStorage?.removeItem(k);
      } catch {
        // ignore
      }
      return;
    }

    try {
      const isAvailable = await SecureStore.isAvailableAsync().catch(() => false);
      if (isAvailable) {
        await SecureStore.deleteItemAsync(k);
      }
    } catch (e) {
      console.warn('[safeStorage] Native secure store remove error:', e);
    }
  },
};
