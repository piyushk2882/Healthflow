import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export function Header({ title, subtitle, showBack, onBack, rightAction }: HeaderProps) {
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || 'Patient';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
          </TouchableOpacity>
        ) : (
          <View style={styles.brandContainer}>
            <View style={styles.avatar}>
              <Ionicons name="leaf" size={18} color={Colors.primary} />
            </View>
            <Text style={styles.brandTitle}>Caring Companion</Text>
          </View>
        )}

        {rightAction ? (
          rightAction
        ) : (
          <View style={styles.userBadge}>
            <Ionicons name="person" size={16} color={Colors.onPrimary} />
          </View>
        )}
      </View>

      {title && (
        <View style={styles.titleSection}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && (
            <View style={styles.subtitleRow}>
              <Ionicons name="calendar-outline" size={15} color={Colors.onSurfaceVariant} />
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    paddingTop: 12,
    paddingBottom: Spacing.three,
    paddingHorizontal: Spacing.five,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerHigh,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(10, 104, 89, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    ...Typography.labelMedium,
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerLow,
  },
  userBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    marginTop: Spacing.two,
    gap: Spacing.one,
  },
  title: {
    ...Typography.headlineMedium,
    color: Colors.primary,
    fontWeight: '700',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
  },
});
