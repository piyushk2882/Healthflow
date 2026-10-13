import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { api, User } from '@/services/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user: authUser, logout } = useAuth();
  const [profileUser, setProfileUser] = useState<User | null>(authUser);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProfile = async () => {
    try {
      const res = await api.auth.getMe();
      const meUser = (res as any).user || (res as any).data?.user;
      if (meUser) {
        setProfileUser(meUser);
      }
    } catch {
      // Fallback to authUser
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const currentUser = profileUser || authUser;
  const isDoctor = currentUser?.role === 'DOCTOR';
  const rawName =
    currentUser?.fullName ||
    currentUser?.user_metadata?.full_name ||
    (isDoctor ? 'Caregiver / Doctor' : 'Patient');
  const displayName = isDoctor && !rawName.startsWith('Dr.') ? `Dr. ${rawName}` : rawName;
  const email = currentUser?.email || '';
  const doctor = currentUser?.doctor;

  const handleLogout = async () => {
    await logout();
    router.replace('/welcome' as any);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchProfile();
    setIsRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{isDoctor ? 'Doctor Profile' : 'My Profile'}</Text>
          <Text style={styles.headerSubtitle}>
            {isDoctor
              ? 'Caregiver & Clinical Practitioner Credentials'
              : 'Personal Health & Patient Information'}
          </Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={[styles.avatar, isDoctor && styles.avatarDoctor]}>
            <Ionicons
              name={isDoctor ? 'medical' : 'person'}
              size={36}
              color={Colors.primary}
            />
          </View>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userEmail}>{email}</Text>

          <View style={[styles.verifiedBadge, isDoctor && styles.verifiedBadgeDoctor]}>
            <Ionicons name="shield-checkmark" size={14} color={Colors.primary} />
            <Text style={styles.verifiedText}>
              {isDoctor ? 'Verified Caregiver / Doctor' : 'Verified Patient Account'}
            </Text>
          </View>
        </View>

        {/* Doctor Clinical Credentials Box (Visible for Doctors) */}
        {isDoctor && (
          <View style={styles.doctorInfoCard}>
            <View style={styles.doctorInfoHeader}>
              <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
              <Text style={styles.doctorInfoHeaderText}>Clinical Credentials</Text>
            </View>

            <View style={styles.credentialRow}>
              <Text style={styles.credentialLabel}>Medical Specialization:</Text>
              <Text style={styles.credentialValue}>
                {doctor?.specialization || 'General Practice'}
              </Text>
            </View>

            <View style={styles.credentialRow}>
              <Text style={styles.credentialLabel}>Medical License / Reg No:</Text>
              <Text style={styles.credentialValue}>
                {doctor?.licenseNumber || 'Verified Registration'}
              </Text>
            </View>

            {doctor?.hospitalName ? (
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Hospital / Clinic Affiliation:</Text>
                <Text style={styles.credentialValue}>{doctor.hospitalName}</Text>
              </View>
            ) : null}

            {doctor?.experienceYears ? (
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Clinical Experience:</Text>
                <Text style={styles.credentialValue}>
                  {doctor.experienceYears} Years
                </Text>
              </View>
            ) : null}

            <View style={styles.credentialRow}>
              <Text style={styles.credentialLabel}>Verification Status:</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>
                  {doctor?.verificationStatus || 'APPROVED'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Quick Settings list */}
        <View style={styles.settingsSection}>
          <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
            <View style={styles.settingIcon}>
              <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.settingLabel}>Notifications</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
            <View style={styles.settingIcon}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.settingLabel}>Privacy & HIPAA Compliance</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
            <View style={styles.settingIcon}>
              <Ionicons
                name={isDoctor ? 'people-outline' : 'medical-outline'}
                size={20}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.settingLabel}>
              {isDoctor ? 'Assigned Patients' : 'Connected Care Team'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: 100,
    gap: Spacing.four,
  },
  header: {
    gap: 4,
    marginBottom: Spacing.two,
  },
  headerTitle: {
    ...Typography.headlineMedium,
    color: Colors.primary,
    fontWeight: '700',
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    fontSize: 13,
  },
  profileCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.surfaceContainerHigh,
    ...Shadows.card,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.softTealBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  avatarDoctor: {
    backgroundColor: Colors.primaryFixed,
  },
  userName: {
    ...Typography.headlineLarge,
    color: Colors.onSurface,
    fontSize: 22,
    fontWeight: '700',
  },
  userEmail: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(163, 242, 222, 0.35)',
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    borderRadius: 9999,
    marginTop: Spacing.one,
  },
  verifiedBadgeDoctor: {
    backgroundColor: Colors.softTealBg,
    borderWidth: 1,
    borderColor: Colors.primaryFixedDim,
  },
  verifiedText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },

  /* Doctor Clinical Card */
  doctorInfoCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 18,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: Colors.surfaceContainerHigh,
    gap: Spacing.three,
    ...Shadows.card,
  },
  doctorInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerHigh,
    paddingBottom: Spacing.two,
  },
  doctorInfoHeaderText: {
    ...Typography.labelMedium,
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  credentialLabel: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
    fontSize: 13,
  },
  credentialValue: {
    ...Typography.labelMedium,
    color: Colors.onSurface,
    fontWeight: '600',
    fontSize: 13,
  },
  statusPill: {
    backgroundColor: Colors.softTealBg,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 11,
  },

  /* Settings Section */
  settingsSection: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceContainerHigh,
    paddingVertical: Spacing.two,
    ...Shadows.card,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    flex: 1,
    ...Typography.labelMedium,
    color: Colors.onSurface,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.errorContainer,
    paddingVertical: Spacing.four,
    borderRadius: 14,
    marginTop: Spacing.two,
  },
  logoutText: {
    ...Typography.labelMedium,
    color: Colors.error,
    fontWeight: '700',
  },
});
