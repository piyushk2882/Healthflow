import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  api,
  getStoredToken,
  setStoredToken,
  removeStoredToken,
  getStoredUser,
  setStoredUser,
  removeStoredUser,
  setAuthToken,
  User,
} from '@/services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string; user?: User }>;
  signup: (
    fullName: string,
    email: string,
    password: string,
    doctorData?: {
      role?: 'patient' | 'caregiver';
      specialization?: string;
      licenseNumber?: string;
      hospitalName?: string;
      experienceYears?: string | number;
    }
  ) => Promise<{ success: boolean; message?: string; user?: User; verificationPending?: boolean }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize Auth state from storage on launch
  useEffect(() => {
    async function loadStoredAuth() {
      try {
        const storedToken = await getStoredToken();
        const storedUser = await getStoredUser();

        if (storedToken) {
          setAuthToken(storedToken);
          setToken(storedToken);
          setUser(storedUser);

          // Verify token validity in background
          const meRes = await api.auth.getMe();
          const meUser = (meRes as any).user || meRes.data?.user;
          if (meRes.success && meUser) {
            setUser(meUser);
            await setStoredUser(meUser);
          } else if (!meRes.success) {
            // Token expired or invalid on backend -> clean up stale session
            console.log('[Auth] Stored token is invalid or expired. Resetting session.');
            setAuthToken(null);
            setToken(null);
            setUser(null);
            await removeStoredToken();
            await removeStoredUser();
          }
        }
      } catch (e) {
        console.warn('Failed to load auth state from storage', e);
      } finally {
        setIsLoading(false);
      }
    }

    loadStoredAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.auth.login({ email, password });
      const session = (res as any).session || (res as any).data?.session || res.data?.session;
      const loggedUser = (res as any).user || (res as any).data?.user || res.data?.user || null;
      const accessToken =
        session?.access_token ||
        (res as any).access_token ||
        (res as any).token ||
        (res as any).data?.access_token ||
        (res as any).data?.token;

      if (res.success && accessToken) {
        await setStoredToken(accessToken);
        if (loggedUser) {
          await setStoredUser(loggedUser);
        }

        setAuthToken(accessToken);
        setToken(accessToken);
        setUser(loggedUser);

        return { success: true, message: 'Login successful', user: loggedUser };
      }

      return {
        success: false,
        message: res.message || 'Invalid credentials. Please check your email and password.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Unable to connect to the authentication service.',
      };
    }
  };

  const signup = async (
    fullName: string,
    email: string,
    password: string,
    doctorData?: {
      role?: 'patient' | 'caregiver';
      specialization?: string;
      licenseNumber?: string;
      hospitalName?: string;
      experienceYears?: string | number;
    }
  ) => {
    try {
      const res = await api.auth.signup({
        fullName,
        email,
        password,
        ...doctorData,
      });
      const session = (res as any).session || (res as any).data?.session || res.data?.session;
      const loggedUser = (res as any).user || (res as any).data?.user || res.data?.user || null;
      const accessToken =
        session?.access_token ||
        (res as any).access_token ||
        (res as any).token ||
        (res as any).data?.access_token ||
        (res as any).data?.token;

      const isDoctorPending = loggedUser?.role === 'DOCTOR' && loggedUser?.doctor?.verificationStatus === 'PENDING';

      if (res.success && accessToken) {
        await setStoredToken(accessToken);
        if (loggedUser) {
          await setStoredUser(loggedUser);
        }

        setAuthToken(accessToken);
        setToken(accessToken);
        setUser(loggedUser);

        return {
          success: true,
          message: res.message || 'Account created successfully',
          user: loggedUser,
          verificationPending: isDoctorPending,
        };
      } else if (res.success) {
        return {
          success: true,
          message: res.message || 'Account created! Please sign in with your email and password.',
          user: loggedUser,
          verificationPending: isDoctorPending,
        };
      }

      return {
        success: false,
        message: res.message || 'Could not create account. Please try again.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Unable to complete registration at this time.',
      };
    }
  };

  const logout = async () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    await removeStoredToken();
    await removeStoredUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token,
        login,
        signup,
        logout,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
