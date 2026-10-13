import { Colors } from '@/constants/theme';

export interface EventTypeConfig {
  label: string;
  iconName: string;
  iconColor: string;
  badgeBg: string;
  badgeTextColor: string;
  cardBg: string;
}

export function getEventTypeConfig(eventType: string): EventTypeConfig {
  const normalized = (eventType || '').toUpperCase().trim();

  switch (normalized) {
    case 'SYMPTOM':
      return {
        label: 'Symptom',
        iconName: 'thermometer-outline',
        iconColor: Colors.secondary,
        badgeBg: 'rgba(242, 164, 136, 0.25)',
        badgeTextColor: Colors.secondary,
        cardBg: Colors.surfaceContainerLowest,
      };

    case 'MEDICATION':
      return {
        label: 'Medication',
        iconName: 'medkit-outline',
        iconColor: Colors.outline,
        badgeBg: Colors.surfaceVariant || '#e4e2de',
        badgeTextColor: Colors.onSurfaceVariant,
        cardBg: Colors.softTealBg,
      };

    case 'CONSULTATION':
      return {
        label: 'Consultation',
        iconName: 'chatbubbles-outline',
        iconColor: Colors.primary,
        badgeBg: 'rgba(163, 242, 222, 0.4)',
        badgeTextColor: Colors.onPrimaryFixedVariant,
        cardBg: Colors.surfaceContainerLowest,
      };

    case 'DIAGNOSIS':
      return {
        label: 'Diagnosis',
        iconName: 'document-text-outline',
        iconColor: Colors.primary,
        badgeBg: 'rgba(163, 242, 222, 0.4)',
        badgeTextColor: Colors.onPrimaryFixedVariant,
        cardBg: Colors.surfaceContainerLowest,
      };

    case 'REPORT':
      return {
        label: 'Report',
        iconName: 'folder-outline',
        iconColor: Colors.outline,
        badgeBg: Colors.surfaceContainerHigh,
        badgeTextColor: Colors.onSurfaceVariant,
        cardBg: Colors.surfaceContainerLowest,
      };

    case 'VITAL':
      return {
        label: 'Vital',
        iconName: 'heart-outline',
        iconColor: Colors.primary,
        badgeBg: 'rgba(163, 242, 222, 0.4)',
        badgeTextColor: Colors.onPrimaryFixedVariant,
        cardBg: Colors.surfaceContainerLowest,
      };

    case 'OTHER':
    default:
      return {
        label: 'Other',
        iconName: 'pulse-outline',
        iconColor: Colors.outline,
        badgeBg: Colors.surfaceContainerHigh,
        badgeTextColor: Colors.onSurfaceVariant,
        cardBg: Colors.surfaceContainerLowest,
      };
  }
}

/**
 * Format entity types for display badges
 */
export function formatEntityTypeLabel(entityType: string): string {
  const map: Record<string, string> = {
    SYMPTOM: 'Symptom',
    MEDICATION: 'Medication',
    CONDITION: 'Condition',
    VITAL: 'Vital',
    BODY_PART: 'Body Part',
    DURATION: 'Duration',
    SEVERITY: 'Severity',
    OTHER: 'Note',
  };
  return map[entityType.toUpperCase()] || entityType;
}
