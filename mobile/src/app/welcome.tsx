import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadows } from '@/constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  const handleSelectRole = (role: 'patient' | 'caregiver') => {
    router.push({
      pathname: '/auth' as any,
      params: { initialRole: role },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Ambient Glow */}
      <View style={styles.topGlow} />

      <View style={styles.content}>
        {/* Illustration Area */}
        <View style={styles.illustrationContainer}>
          <View style={styles.illustrationCircle}>
            <View style={styles.innerIllustration}>
              <Ionicons name="leaf-outline" size={72} color={Colors.primary} />
              <View style={styles.heartBadge}>
                <Ionicons name="heart" size={24} color={Colors.accentCoral} />
              </View>
            </View>
          </View>
        </View>

        {/* Typography Area */}
        <View style={styles.typographyContainer}>
          <Text style={styles.headline}>Your health story, always remembered</Text>
          <Text style={styles.bodyText}>
            A supportive space to track your symptoms and stay connected with your care team.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={() => handleSelectRole('patient')}>
            <Text style={styles.primaryButtonText}>I'm a Patient</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.onPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.85}
            onPress={() => handleSelectRole('caregiver')}>
            <Text style={styles.secondaryButtonText}>I'm a Doctor / Caregiver</Text>
            <Ionicons name="medkit-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topGlow: {
    position: 'absolute',
    top: -80,
    left: 0,
    right: 0,
    height: 240,
    backgroundColor: 'rgba(10, 104, 89, 0.08)',
    borderBottomLeftRadius: width,
    borderBottomRightRadius: width,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.six,
    justifyContent: 'space-between',
  },
  illustrationContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
  },
  illustrationCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.soft,
  },
  innerIllustration: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Shadows.card,
  },
  heartBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 4,
    ...Shadows.card,
  },
  typographyContainer: {
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.six,
  },
  headline: {
    ...Typography.headlineLarge,
    color: Colors.primary,
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
  },
  bodyText: {
    ...Typography.bodyLarge,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
  },
  actionsContainer: {
    gap: Spacing.three,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    borderRadius: 9999,
    ...Shadows.card,
  },
  primaryButtonText: {
    ...Typography.labelMedium,
    color: Colors.onPrimary,
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    borderRadius: 9999,
  },
  secondaryButtonText: {
    ...Typography.labelMedium,
    color: Colors.primary,
    fontSize: 16,
  },
});
