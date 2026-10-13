import { safeStorage } from './storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const STORAGE_KEY_TOKEN = 'healthflow_token';
const STORAGE_KEY_USER = 'healthflow_user';

/**
 * Dynamically resolves the API base URL:
 * 1. Checks EXPO_PUBLIC_API_URL environment variable if provided.
 * 2. If running on Web, uses http://localhost:5000.
 * 3. If running in Expo Go / Dev Client, extracts the computer's LAN IP from hostUri so physical phones can reach the server.
 * 4. Fallback for Android Emulator: http://10.0.2.2:5000.
 * 5. Fallback for iOS Simulator / Web: http://localhost:5000.
 */
export function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:5000';
  }

  // Constants.expoConfig?.hostUri is "192.168.x.x:8081" when connected via Metro
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri && typeof hostUri === 'string') {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:5000`;
    }
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000';
  }

  return 'http://localhost:5000';
}

export const API_BASE_URL = getApiBaseUrl();

export interface DoctorInfo {
  id: string;
  specialization: string;
  licenseNumber: string;
  hospitalName?: string | null;
  experienceYears?: number | null;
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface User {
  id: string;
  email?: string;
  fullName?: string;
  role?: 'PATIENT' | 'DOCTOR' | 'ADMIN';
  doctor?: DoctorInfo | null;
  user_metadata?: {
    full_name?: string;
    role?: string;
  };
}

export type MedicationStatus = 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'DISCONTINUED';
export type MedicationLogStatus = 'PENDING' | 'TAKEN' | 'MISSED' | 'SKIPPED';

export interface MedicationSchedule {
  id: string;
  scheduledTime: string;
  dose: string | null;
  createdAt?: string;
}

export interface MedicationLog {
  id: string;
  medicationId?: string;
  scheduledTime: string;
  takenAt: string | null;
  status: MedicationLogStatus;
  notes: string | null;
  createdAt?: string;
}

export interface Medication {
  id: string;
  patientId?: string;
  name: string;
  dosage: string | null;
  frequency: string;
  instructions: string | null;
  startDate: string;
  endDate: string | null;
  status: MedicationStatus;
  prescribedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  schedules?: MedicationSchedule[];
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: User;
  session?: AuthSession;
  data?: {
    user?: User;
    session?: AuthSession;
  };
}

export interface TimelineEntity {
  entityType: string;
  entityValue: string;
  metadata?: Record<string, unknown>;
}

export interface TimelineEvent {
  id: string;
  eventType: string;
  title: string | null;
  description: string | null;
  eventDate: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  entities: TimelineEntity[];
}

export interface TimelineDateGroup {
  date: string;
  events: TimelineEvent[];
}

export interface TimelinePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TimelineResponseData {
  timeline: TimelineDateGroup[];
  pagination: TimelinePagination;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender: 'PATIENT' | 'AI';
  message: string;
  health_event_id?: string | null;
  created_at?: string;
}

export interface ChatResponseData {
  conversationId: string;
  patientMessage: ChatMessage;
  aiMessage: ChatMessage;
  healthEvent?: TimelineEvent | null;
  extraction?: {
    action: string;
    title: string | null;
    eventType?: string;
    description?: string | null;
    entities: Array<{ entityType: string; entityValue: string }>;
    assistantResponse: string;
  };
}

let cachedToken: string | null = null;
let cachedUser: User | null = null;

/**
 * Direct in-memory token setters for immediate synchronization
 */
export function setAuthToken(token: string | null): void {
  cachedToken = token;
}

export function getAuthToken(): string | null {
  return cachedToken;
}

/**
 * Storage helpers with in-memory caching
 */
export async function getStoredToken(): Promise<string | null> {
  if (cachedToken) {
    return cachedToken;
  }
  try {
    const token = await safeStorage.getItem(STORAGE_KEY_TOKEN);
    if (token) {
      cachedToken = token;
    }
    return token;
  } catch (err) {
    console.warn('[API] Error reading token from safeStorage:', err);
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  await safeStorage.setItem(STORAGE_KEY_TOKEN, token);
  cachedToken = token;
}

export async function removeStoredToken(): Promise<void> {
  cachedToken = null;
  try {
    await safeStorage.removeItem(STORAGE_KEY_TOKEN);
  } catch (err) {
    console.warn('[API] Error removing token from safeStorage:', err);
  }
}

export async function getStoredUser(): Promise<User | null> {
  if (cachedUser) {
    return cachedUser;
  }
  try {
    const data = await safeStorage.getItem(STORAGE_KEY_USER);
    if (data) {
      cachedUser = JSON.parse(data);
    }
    return cachedUser;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: User): Promise<void> {
  cachedUser = user;
  try {
    await safeStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
  } catch (err) {
    console.warn('[API] Error saving user to safeStorage:', err);
  }
}

export async function removeStoredUser(): Promise<void> {
  cachedUser = null;
  try {
    await safeStorage.removeItem(STORAGE_KEY_USER);
  } catch (err) {
    console.warn('[API] Error removing user from safeStorage:', err);
  }
}

/**
 * Clean user-facing error message extractor
 */
function sanitizeErrorMessage(error: any, fallback = 'Something went wrong. Please try again.'): string {
  if (typeof error === 'string') return error;
  if (error?.message) {
    if (
      error.message.includes('Network request failed') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('AbortError') ||
      error.message.includes('timed out')
    ) {
      return `Unable to reach server at ${API_BASE_URL}. Please verify the backend is running on port 5000.`;
    }
    return error.message;
  }
  return fallback;
}

/**
 * Generic authenticated fetch wrapper with timeout
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; message?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const token = await getStoredToken();
    const isPublicAuthEndpoint = endpoint === '/api/auth/login' || endpoint === '/api/auth/signup';
    if (!token && !isPublicAuthEndpoint) {
      return { success: false, message: 'Please sign in to continue.' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    if (__DEV__) {
      console.log(`[API] ${options.method || 'GET'} ${url} [Auth: ${token ? 'Bearer token attached' : 'No token'}]`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      const message = json?.message || `Request failed with status ${response.status}`;
      return {
        success: false,
        message: sanitizeErrorMessage(message),
      };
    }

    return json;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        success: false,
        message: `Connection timed out. Could not reach ${API_BASE_URL}`,
      };
    }
    return {
      success: false,
      message: sanitizeErrorMessage(err),
    };
  }
}

/**
 * API Endpoints
 */
export const api = {
  auth: {
    login: async (credentials: { email: string; password: string }) => {
      return request<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
    },

    signup: async (data: {
      fullName: string;
      email: string;
      password: string;
      role?: 'patient' | 'caregiver' | 'PATIENT' | 'DOCTOR';
      specialization?: string;
      licenseNumber?: string;
      hospitalName?: string;
      experienceYears?: string | number;
    }) => {
      return request<AuthResponse>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    getMe: async () => {
      return request<{ user: User }>('/api/auth/me');
    },
  },

  timeline: {
    getTimeline: async (page = 1, limit = 20) => {
      // NOTE: Never pass patient_id. The backend derives patient from JWT!
      return request<TimelineResponseData>(`/api/health-timeline?page=${page}&limit=${limit}`);
    },
  },

  chat: {
    sendMessage: async (message: string, conversationId?: string) => {
      return request<ChatResponseData>('/api/chat/message', {
        method: 'POST',
        body: JSON.stringify({ message, conversationId }),
      });
    },
  },

  medications: {
    getDoctorPatients: async () => {
      return request<{ patients: Array<{ patientId: string; fullName: string; assignedAt: string }> }>(
        '/api/medications/patients/active'
      );
    },

    list: async (status?: string, patientId?: string) => {
      const params = new URLSearchParams();
      if (status && status !== 'ALL') params.append('status', status);
      if (patientId) params.append('patientId', patientId);
      const query = params.toString() ? `?${params.toString()}` : '';
      return request<{ medications: Medication[] }>(`/api/medications${query}`);
    },

    getById: async (id: string) => {
      return request<{ medication: Medication }>(`/api/medications/${id}`);
    },

    create: async (data: {
      name: string;
      dosage?: string;
      frequency: string;
      instructions?: string;
      startDate: string;
      endDate?: string;
      status?: MedicationStatus;
      patientId?: string;
    }) => {
      return request<{ medication: Medication }>('/api/medications', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: async (
      id: string,
      data: Partial<{
        name: string;
        dosage?: string;
        frequency: string;
        instructions?: string;
        startDate: string;
        endDate?: string;
        status: MedicationStatus;
      }>
    ) => {
      return request<{ medication: Medication }>(`/api/medications/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    delete: async (id: string) => {
      return request<{ message: string }>(`/api/medications/${id}`, {
        method: 'DELETE',
      });
    },

    listSchedules: async (medicationId: string) => {
      return request<{ schedules: MedicationSchedule[] }>(`/api/medications/${medicationId}/schedules`);
    },

    createSchedule: async (medicationId: string, data: { scheduledTime: string; dose?: string }) => {
      return request<{ schedule: MedicationSchedule }>(`/api/medications/${medicationId}/schedules`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    updateSchedule: async (
      medicationId: string,
      scheduleId: string,
      data: { scheduledTime?: string; dose?: string }
    ) => {
      return request<{ schedule: MedicationSchedule }>(`/api/medications/${medicationId}/schedules/${scheduleId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    deleteSchedule: async (medicationId: string, scheduleId: string) => {
      return request<{ message: string }>(`/api/medications/${medicationId}/schedules/${scheduleId}`, {
        method: 'DELETE',
      });
    },

    listLogs: async (medicationId: string) => {
      return request<{ logs: MedicationLog[] }>(`/api/medications/${medicationId}/logs`);
    },

    createLog: async (
      medicationId: string,
      data: {
        scheduledTime: string;
        status: MedicationLogStatus;
        takenAt?: string;
        notes?: string;
      }
    ) => {
      return request<{ log: MedicationLog }>(`/api/medications/${medicationId}/logs`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  },
};
