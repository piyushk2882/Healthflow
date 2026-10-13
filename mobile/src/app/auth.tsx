import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import { Toast } from '@/components/Toast';

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ initialRole?: string; initialMode?: string }>();
  const { login, signup, logout } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>(
    params.initialMode === 'signup' ? 'signup' : 'signin'
  );
  const [role, setRole] = useState<'patient' | 'caregiver'>(
    params.initialRole === 'caregiver' ? 'caregiver' : 'patient'
  );

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Doctor/Caregiver specific fields
  const [specialization, setSpecialization] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [pendingDoctor, setPendingDoctor] = useState<{ fullName?: string; licenseNumber?: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [showToast, setShowToast] = useState(false);

  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      triggerToast('Please enter both email and password', 'error');
      return;
    }

    if (mode === 'signup' && !fullName.trim()) {
      triggerToast('Please enter your full name', 'error');
      return;
    }

    if (mode === 'signup' && role === 'caregiver') {
      if (!specialization.trim()) {
        triggerToast('Please enter your medical specialization', 'error');
        return;
      }
      if (!licenseNumber.trim()) {
        triggerToast('Please enter your medical license/registration number', 'error');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        const res = await login(email.trim(), password);
        if (res.success) {
          if (res.user?.role === 'DOCTOR' && res.user?.doctor?.verificationStatus === 'PENDING') {
            setPendingDoctor({
              fullName: res.user.fullName,
              licenseNumber: res.user.doctor.licenseNumber,
            });
            triggerToast('Account is pending administrator approval', 'info');
            return;
          }

          triggerToast('Welcome back! Syncing your logs...');
          setTimeout(() => {
            router.replace('/(tabs)' as any);
          }, 800);
        } else {
          triggerToast(res.message || 'Login failed. Please try again.', 'error');
        }
      } else {
        const doctorData = role === 'caregiver' ? {
          role: 'caregiver' as const,
          specialization: specialization.trim(),
          licenseNumber: licenseNumber.trim(),
          hospitalName: hospitalName.trim() || undefined,
          experienceYears: experienceYears.trim() || undefined,
        } : { role: 'patient' as const };

        const res = await signup(fullName.trim(), email.trim(), password, doctorData);
        if (res.success) {
          if (res.verificationPending) {
            setPendingDoctor({
              fullName: fullName.trim(),
              licenseNumber: licenseNumber.trim(),
            });
            triggerToast('Caregiver registration submitted! Verification is pending.', 'info');
            return;
          }

          triggerToast(res.message || 'Account created successfully!');
          setTimeout(() => {
            router.replace('/(tabs)' as any);
          }, 800);
        } else {
          triggerToast(res.message || 'Registration failed. Please try again.', 'error');
        }
      }
    } catch (err: any) {
      triggerToast(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBiometrics = () => {
    triggerToast('Biometric authentication simulated! Welcome back.');
    // Demo quick login if user wishes
  };

  return (
    <SafeAreaView style={styles.container}>
      <Toast
        visible={showToast}
        message={toastMessage}
        type={toastType}
        onDismiss={() => setShowToast(false)}
      />

      {/* Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <View style={styles.headerLeafIcon}>
            <Ionicons name="leaf" size={16} color={Colors.primary} />
          </View>
          <Text style={styles.headerTitle}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>
        </View>

        <View style={styles.headerUserIcon}>
          <Ionicons name="person" size={16} color={Colors.onPrimary} />
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* Reassuring Ambient Banner */}
          <View style={styles.bannerCard}>
            <View style={styles.bannerRow}>
              <View style={styles.bannerAvatar}>
                <Ionicons name="heart" size={28} color={Colors.primary} />
              </View>
              <View style={styles.bannerTextCol}>
                <View style={styles.pillBadge}>
                  <Ionicons name="heart" size={12} color={Colors.secondary} />
                  <Text style={styles.pillBadgeText}>We're here for you</Text>
                </View>
                <Text style={styles.bannerHeading}>
                  {mode === 'signin' ? 'Welcome back' : 'Start your journey'}
                </Text>
                <Text style={styles.bannerSubtext}>
                  {mode === 'signin'
                    ? 'Sign in to keep your care team and daily logs in sync.'
                    : 'Create your private, supportive health space today.'}
                </Text>
              </View>
            </View>
          </View>

          {pendingDoctor ? (
            <View style={styles.pendingCard}>
              <View style={styles.pendingIconWrap}>
                <Ionicons name="time" size={48} color={Colors.secondary} />
              </View>

              <Text style={styles.pendingTitle}>Registration Under Review</Text>
              <Text style={styles.pendingSubtitle}>
                Dr. {pendingDoctor.fullName || 'Doctor / Caregiver'}
              </Text>

              <View style={styles.pendingDetailBox}>
                <View style={styles.pendingDetailRow}>
                  <Text style={styles.pendingDetailLabel}>License Number:</Text>
                  <Text style={styles.pendingDetailValue}>{pendingDoctor.licenseNumber || 'Submitted'}</Text>
                </View>
                <View style={styles.pendingDetailRow}>
                  <Text style={styles.pendingDetailLabel}>Verification Status:</Text>
                  <View style={styles.pendingStatusBadge}>
                    <Text style={styles.pendingStatusBadgeText}>PENDING APPROVAL</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.pendingExplainer}>
                To maintain patient safety and clinical compliance, Caregiver and Doctor accounts require administrator verification before access to patient records is granted.
              </Text>

              <TouchableOpacity
                style={styles.checkStatusButton}
                onPress={async () => {
                  try {
                    const meRes = await api.auth.getMe();
                    const meDoc = (meRes as any).user?.doctor || (meRes as any).data?.user?.doctor;
                    if (meDoc?.verificationStatus === 'APPROVED') {
                      triggerToast('Your doctor account has been approved! Welcome.');
                      setPendingDoctor(null);
                      router.replace('/(tabs)' as any);
                    } else {
                      triggerToast('Verification is still pending review. Please check back shortly.', 'info');
                    }
                  } catch {
                    triggerToast('Could not reach server to check status.', 'error');
                  }
                }}
                activeOpacity={0.85}>
                <Ionicons name="refresh" size={18} color={Colors.onPrimary} />
                <Text style={styles.checkStatusButtonText}>Check Status</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.pendingLogoutButton}
                onPress={async () => {
                  await logout();
                  setPendingDoctor(null);
                  setMode('signin');
                }}
                activeOpacity={0.85}>
                <Ionicons name="log-out-outline" size={18} color={Colors.error} />
                <Text style={styles.pendingLogoutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Tab Switcher: Sign In vs Create Account */}
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tabButton, mode === 'signin' && styles.tabButtonActive]}
                  onPress={() => setMode('signin')}
                  activeOpacity={0.8}>
                  <Ionicons
                    name="log-in-outline"
                    size={18}
                    color={mode === 'signin' ? Colors.primary : Colors.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.tabButtonText,
                      mode === 'signin' && styles.tabButtonTextActive,
                    ]}>
                    Sign In
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabButton, mode === 'signup' && styles.tabButtonActive]}
                  onPress={() => setMode('signup')}
                  activeOpacity={0.8}>
                  <Ionicons
                    name="person-add-outline"
                    size={18}
                    color={mode === 'signup' ? Colors.primary : Colors.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.tabButtonText,
                      mode === 'signup' && styles.tabButtonTextActive,
                    ]}>
                    Create Account
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Role Selector */}
              <View style={styles.roleContainer}>
                <Text style={styles.fieldLabel}>I am logging in as</Text>
                <View style={styles.roleGrid}>
                  <TouchableOpacity
                    style={[styles.roleCard, role === 'patient' && styles.roleCardActive]}
                    onPress={() => setRole('patient')}
                    activeOpacity={0.8}>
                    <Ionicons
                      name="person"
                      size={20}
                      color={role === 'patient' ? Colors.onPrimaryFixedVariant : Colors.onSurfaceVariant}
                    />
                    <Text
                      style={[
                        styles.roleCardText,
                        role === 'patient' && styles.roleCardTextActive,
                      ]}>
                      Patient
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.roleCard, role === 'caregiver' && styles.roleCardActive]}
                    onPress={() => setRole('caregiver')}
                    activeOpacity={0.8}>
                    <Ionicons
                      name="medkit"
                      size={20}
                      color={role === 'caregiver' ? Colors.onPrimaryFixedVariant : Colors.onSurfaceVariant}
                    />
                    <Text
                      style={[
                        styles.roleCardText,
                        role === 'caregiver' && styles.roleCardTextActive,
                      ]}>
                      Caregiver
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Form Fields */}
              <View style={styles.formContainer}>
                {mode === 'signup' && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Full Name</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="person-outline" size={20} color={Colors.outline} style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. Sarah Jenkins"
                        placeholderTextColor={Colors.outlineVariant}
                        value={fullName}
                        onChangeText={setFullName}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="mail-outline" size={20} color={Colors.outline} style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="name@example.com"
                      placeholderTextColor={Colors.outlineVariant}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={20} color={Colors.outline} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.textInput, { paddingRight: 44 }]}
                      placeholder="Enter your password"
                      placeholderTextColor={Colors.outlineVariant}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.passwordToggle}
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={Colors.outline}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Doctor/Caregiver specific fields during registration */}
                {mode === 'signup' && role === 'caregiver' && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Medical Specialization *</Text>
                      <View style={styles.inputWrapper}>
                        <Ionicons name="medkit-outline" size={20} color={Colors.outline} style={styles.inputIcon} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="e.g. General Medicine, Cardiology"
                          placeholderTextColor={Colors.outlineVariant}
                          value={specialization}
                          onChangeText={setSpecialization}
                          autoCapitalize="words"
                        />
                      </View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Medical License / Reg Number *</Text>
                      <View style={styles.inputWrapper}>
                        <Ionicons name="ribbon-outline" size={20} color={Colors.outline} style={styles.inputIcon} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="e.g. MED-847291"
                          placeholderTextColor={Colors.outlineVariant}
                          value={licenseNumber}
                          onChangeText={setLicenseNumber}
                          autoCapitalize="characters"
                        />
                      </View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Hospital or Clinic Affiliation (Optional)</Text>
                      <View style={styles.inputWrapper}>
                        <Ionicons name="business-outline" size={20} color={Colors.outline} style={styles.inputIcon} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="e.g. City General Hospital"
                          placeholderTextColor={Colors.outlineVariant}
                          value={hospitalName}
                          onChangeText={setHospitalName}
                        />
                      </View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Years of Clinical Experience (Optional)</Text>
                      <View style={styles.inputWrapper}>
                        <Ionicons name="time-outline" size={20} color={Colors.outline} style={styles.inputIcon} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="e.g. 5"
                          placeholderTextColor={Colors.outlineVariant}
                          value={experienceYears}
                          onChangeText={setExperienceYears}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  </>
                )}

                {mode === 'signin' && (
                  <View style={styles.helpersRow}>
                    <TouchableOpacity
                      style={styles.rememberMeRow}
                      onPress={() => setRememberMe(!rememberMe)}
                      activeOpacity={0.7}>
                      <Ionicons
                        name={rememberMe ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={rememberMe ? Colors.primary : Colors.outline}
                      />
                      <Text style={styles.rememberMeText}>Remember me</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => triggerToast('Password reset link sent to your email', 'info')}>
                      <Text style={styles.forgotText}>Forgot password?</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Submit Button */}
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handleSubmit}
                  disabled={isSubmitting}
                  activeOpacity={0.85}>
                  {isSubmitting ? (
                    <ActivityIndicator color={Colors.onPrimary} size="small" />
                  ) : (
                    <>
                      <Text style={styles.submitButtonText}>
                        {mode === 'signin' ? 'Sign In' : 'Create Care Account'}
                      </Text>
                      <Ionicons name="arrow-forward" size={20} color={Colors.onPrimary} />
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* HIPAA Pill */}
              <View style={styles.hipaaPill}>
                <Ionicons name="shield-checkmark" size={18} color={Colors.primary} />
                <Text style={styles.hipaaText}>HIPAA compliant 256-bit encrypted health logs</Text>
              </View>

              {/* Social / Biometrics Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or continue with</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Biometrics & Google */}
              <View style={styles.socialGrid}>
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={handleBiometrics}
                  activeOpacity={0.8}>
                  <Ionicons name="finger-print" size={22} color={Colors.primary} />
                  <Text style={styles.socialButtonText}>Face / Touch ID</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => triggerToast('Google Sign In connecting...', 'info')}
                  activeOpacity={0.8}>
                  <Ionicons name="logo-google" size={20} color="#4285F4" />
                  <Text style={styles.socialButtonText}>Google</Text>
                </TouchableOpacity>
              </View>

              {/* Footer toggle */}
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>
                  {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
                </Text>
                <TouchableOpacity
                  onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                  <Text style={styles.footerAction}>
                    {mode === 'signin' ? 'Sign up' : 'Sign in'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    backgroundColor: Colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  headerLeafIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(10, 104, 89, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.labelMedium,
    color: Colors.onSurface,
  },
  headerUserIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
    paddingBottom: Spacing.eight,
  },
  bannerCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 20,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    ...Shadows.card,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  bannerAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.soft,
  },
  bannerTextCol: {
    flex: 1,
    gap: Spacing.half,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(253, 174, 145, 0.25)',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 9999,
    alignSelf: 'flex-start',
    gap: 4,
  },
  pillBadgeText: {
    ...Typography.caption,
    color: Colors.secondary,
    fontSize: 11,
  },
  bannerHeading: {
    ...Typography.headlineMedium,
    color: Colors.onSurface,
    fontWeight: '700',
  },
  bannerSubtext: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 9999,
    padding: 4,
    marginBottom: Spacing.four,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 9999,
    gap: Spacing.one,
  },
  tabButtonActive: {
    backgroundColor: Colors.surfaceContainerLowest,
    ...Shadows.soft,
  },
  tabButtonText: {
    ...Typography.labelMedium,
    color: Colors.onSurfaceVariant,
  },
  tabButtonTextActive: {
    color: Colors.primary,
  },
  roleContainer: {
    marginBottom: Spacing.four,
  },
  fieldLabel: {
    ...Typography.labelMedium,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.two,
  },
  roleGrid: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  roleCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: 14,
    backgroundColor: Colors.surfaceContainerLow,
  },
  roleCardActive: {
    backgroundColor: 'rgba(163, 242, 222, 0.45)',
    borderWidth: 1,
    borderColor: Colors.primaryFixedDim,
  },
  roleCardText: {
    ...Typography.labelMedium,
    color: Colors.onSurfaceVariant,
  },
  roleCardTextActive: {
    color: Colors.onPrimaryFixedVariant,
    fontWeight: '700',
  },
  formContainer: {
    gap: Spacing.three,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    ...Typography.labelMedium,
    color: Colors.onSurface,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    ...Shadows.soft,
  },
  inputIcon: {
    marginRight: Spacing.two,
  },
  textInput: {
    flex: 1,
    paddingVertical: Spacing.three,
    ...Typography.bodyLarge,
    color: Colors.onSurface,
  },
  passwordToggle: {
    position: 'absolute',
    right: Spacing.three,
  },
  helpersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  rememberMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  rememberMeText: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
  },
  forgotText: {
    ...Typography.caption,
    color: Colors.secondary,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    borderRadius: 9999,
    marginTop: Spacing.two,
    ...Shadows.card,
  },
  submitButtonText: {
    ...Typography.labelMedium,
    color: Colors.onPrimary,
    fontSize: 16,
  },
  hipaaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.four,
  },
  hipaaText: {
    ...Typography.caption,
    color: Colors.outline,
    fontSize: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.four,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  dividerText: {
    ...Typography.caption,
    color: Colors.outline,
    marginHorizontal: Spacing.three,
  },
  socialGrid: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.five,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    ...Shadows.soft,
  },
  socialButtonText: {
    ...Typography.labelMedium,
    color: Colors.onSurface,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  footerText: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
  },
  footerAction: {
    ...Typography.labelMedium,
    color: Colors.primary,
    fontWeight: '700',
  },
  pendingCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: Spacing.five,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceContainerHigh,
    ...Shadows.card,
  },
  pendingIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.secondaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.four,
  },
  pendingTitle: {
    ...Typography.headlineMedium,
    color: Colors.primary,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  pendingSubtitle: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  pendingDetailBox: {
    width: '100%',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.four,
    gap: Spacing.two,
  },
  pendingDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingDetailLabel: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
  },
  pendingDetailValue: {
    ...Typography.labelMedium,
    color: Colors.onSurface,
    fontWeight: '600',
  },
  pendingStatusBadge: {
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingStatusBadgeText: {
    ...Typography.caption,
    color: Colors.onSecondaryContainer,
    fontWeight: '700',
    fontSize: 10,
  },
  pendingExplainer: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.five,
  },
  checkStatusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.primary,
    width: '100%',
    paddingVertical: Spacing.three,
    borderRadius: 14,
    marginBottom: Spacing.three,
  },
  checkStatusButtonText: {
    ...Typography.labelMedium,
    color: Colors.onPrimary,
    fontWeight: '700',
  },
  pendingLogoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  pendingLogoutButtonText: {
    ...Typography.bodyMedium,
    color: Colors.error,
    fontWeight: '600',
  },
});
