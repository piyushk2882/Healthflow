import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadows } from '@/constants/theme';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  onDismiss?: () => void;
}

export function Toast({ visible, message, type = 'success', onDismiss }: ToastProps) {
  const [opacity] = React.useState(() => new Animated.Value(0));
  const [translateY] = React.useState(() => new Animated.Value(-20));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -20,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onDismiss?.();
        });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible, onDismiss]);

  if (!visible) return null;

  const isError = type === 'error';
  const iconName = isError ? 'alert-circle' : 'checkmark-circle';
  const iconColor = isError ? Colors.error : Colors.primaryFixed;
  const bgColor = isError ? Colors.errorContainer : Colors.onSurface;
  const textColor = isError ? Colors.error : Colors.surfaceContainerLowest;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          opacity,
          transform: [{ translateY }],
        },
      ]}>
      <Ionicons name={iconName} size={18} color={iconColor} style={styles.icon} />
      <Text style={[styles.text, { color: textColor }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 54,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 9999,
    zIndex: 9999,
    maxWidth: '90%',
    ...Shadows.floating,
  },
  icon: {
    marginRight: Spacing.two,
  },
  text: {
    ...Typography.caption,
    fontWeight: '600',
  },
});
