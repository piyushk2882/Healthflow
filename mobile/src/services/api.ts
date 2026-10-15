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

// Doctor Chat Types
export interface DoctorChatPatient {
  patientId: string;
  fullName: string;
  assignedAt: string;
  eventCount: number;
  medicationCount?: number;
  lastEvent: {
    title: string | null;
    eventDate: string;
    eventType: string;
  } | null;
}

export interface DoctorChatPatientsData {
  patients: DoctorChatPatient[];
}

export interface DoctorChatQueryData {
  patientId: string;
  patientName: string;
  query: string;
  response: string;
  healthEventsCount: number;
  medicationsCount?: number;
  activeMedicationsCount?: number;
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
  if (typeof error === 'string') {
    if (
      error.includes('fetch failed') ||
      error.includes('Network request failed') ||
      error.includes('Failed to fetch') ||
      error.includes('ECONNREFUSED') ||
      error.includes('ECONNRESET')
    ) {
      return `Unable to reach server. Please verify the backend is running at ${API_BASE_URL} and your connection is stable.`;
    }
    return error;
  }
  if (error?.message) {
    if (
      error.message.includes('Network request failed') ||
      error.message.includes('fetch failed') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('AbortError') ||
      error.message.includes('timed out')
    ) {
      return `Unable to reach server. Please verify the backend is running at ${API_BASE_URL} and your connection is stable.`;
    }
    return error.message;
  }
  return fallback;
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Generic authenticated fetch wrapper with timeout
 */
async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<{ success: boolean; data?: T; message?: string }> {
  const { timeoutMs = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = await getStoredToken();
    const isPublicAuthEndpoint = endpoint === '/api/auth/login' || endpoint === '/api/auth/signup';
    if (!token && !isPublicAuthEndpoint) {
      return { success: false, message: 'Please sign in to continue.' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    if (__DEV__) {
      console.log(`[API] ${fetchOptions.method || 'GET'} ${url} (timeout: ${timeoutMs}ms) [Auth: ${token ? 'Bearer token attached' : 'No token'}]`);
    }

    const response = await fetch(url, {
      ...fetchOptions,
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
    const isTimeout =
      controller.signal.aborted ||
      err.name === 'AbortError' ||
      err.name === 'CanceledError' ||
      (typeof err.message === 'string' &&
        (err.message.toLowerCase().includes('cancel') ||
          err.message.toLowerCase().includes('abort') ||
          err.message.toLowerCase().includes('timed out') ||
          err.message.toLowerCase().includes('timeout')));

    if (isTimeout) {
      return {
        success: false,
        message: 'Request timed out while waiting for AI response. Please try again.',
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
        timeoutMs: 90000,
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

  doctorChat: {
    /**
     * GET /api/chat/doctor/patients
     * Fetch all active patients assigned to the logged-in doctor.
     */
    getPatients: async () => {
      return request<DoctorChatPatientsData>('/api/chat/doctor/patients');
    },

    /**
     * POST /api/chat/doctor/query
     * Send a query about a specific patient's health data.
     */
    queryPatient: async (
      patientId: string,
      message: string,
      conversationHistory?: Array<{ role: string; content: string }>
    ) => {
      return request<DoctorChatQueryData>('/api/chat/doctor/query', {
        method: 'POST',
        body: JSON.stringify({ patientId, message, conversationHistory }),
        timeoutMs: 90000,
      });
    },
  },
};
