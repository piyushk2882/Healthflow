import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle } from 'react-native-svg';
import { Colors, Typography, Spacing, Shadows } from '@/constants/theme';
import { api, TimelineDateGroup, TimelineEvent } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { formatReadableDate, formatGroupDate, formatEventDateTime } from '@/utils/dateFormatter';
import { getEventTypeConfig, formatEntityTypeLabel } from '@/utils/eventTypeMapper';
import { Toast } from '@/components/Toast';

export default function HealthTimelineScreen() {
  const { isAuthenticated } = useAuth();
  const [timelineData, setTimelineData] = useState<TimelineDateGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [showToast, setShowToast] = useState(false);

  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
  };

  /**
   * Fetch health timeline data
   * NOTE: Never pass patient_id. JWT token handles patient resolution in backend.
   */
  const fetchTimeline = useCallback(async (pageToFetch = 1, isRefresh = false) => {
    if (!isAuthenticated) return;
    if (isRefresh) {
      setIsRefreshing(true);
    } else if (pageToFetch === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setErrorMessage(null);

    try {
      const res = await api.timeline.getTimeline(pageToFetch, 20);

      if (res.success && res.data) {
        const { timeline, pagination } = res.data;

        if (pageToFetch === 1 || isRefresh) {
          // Replace entirely on page 1 or refresh to prevent duplicate events
          setTimelineData(timeline || []);
        } else {
          // Merge pages by date key to prevent duplicate date groups
          setTimelineData((prevGroups) => {
            const groupsMap = new Map<string, TimelineEvent[]>();

            for (const group of prevGroups) {
              groupsMap.set(group.date, [...group.events]);
            }

            for (const newGroup of timeline || []) {
              if (groupsMap.has(newGroup.date)) {
                // Append events ensuring unique IDs
                const existingEvents = groupsMap.get(newGroup.date)!;
                const existingIds = new Set(existingEvents.map((e) => e.id));
                for (const event of newGroup.events) {
                  if (!existingIds.has(event.id)) {
                    existingEvents.push(event);
                  }
                }
              } else {
                groupsMap.set(newGroup.date, [...newGroup.events]);
              }
            }

            return Array.from(groupsMap.entries()).map(([date, events]) => ({
              date,
              events,
            }));
          });
        }

        setCurrentPage(pagination?.page || pageToFetch);
        setTotalPages(pagination?.totalPages || 1);
      } else {
        const errorText = res.message || 'Unable to retrieve your health timeline. Please try again.';
        setErrorMessage(errorText);
        if (pageToFetch > 1) {
          triggerToast(errorText, 'error');
        }
      }
    } catch (err: any) {
      const friendlyError = 'Unable to reach the health server. Please check your connection.';
      setErrorMessage(friendlyError);
      if (pageToFetch > 1) {
        triggerToast(friendlyError, 'error');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchTimeline(1);
    }
  }, [fetchTimeline, isAuthenticated]);

  const onRefresh = () => {
    fetchTimeline(1, true);
  };

  const onLoadMore = () => {
    if (currentPage < totalPages && !isLoadingMore) {
      fetchTimeline(currentPage + 1);
    }
  };

  const totalEventCount = timelineData.reduce((acc, group) => acc + (group.events?.length || 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast
        visible={showToast}
        message={toastMessage}
        type={toastType}
        onDismiss={() => setShowToast(false)}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroTextCol}>
            <Text style={styles.heroHeadline}>You're doing well this week</Text>
            <Text style={styles.heroSubtext}>
              Your vitals are stable and your logs are kept in sync with your care team.
            </Text>
          </View>

          {/* Sparkline Wellness Card */}
          <View style={styles.sparklineCard}>
            <View style={styles.sparklineHeader}>
              <Text style={styles.sparklineLabel}>Wellness Score</Text>
              <Text style={styles.sparklineScore}>85/100</Text>
            </View>

            <View style={styles.chartContainer}>
              <Svg height="50" width="100%" viewBox="0 0 200 60">
                <Path
                  d="M0,45 L40,35 L80,40 L120,20 L160,28 L200,10"
                  fill="none"
                  stroke={Colors.primary}
                  strokeWidth="2.5"
                />
                <Path
                  d="M0,60 L0,45 L40,35 L80,40 L120,20 L160,28 L200,10 L200,60 Z"
                  fill="rgba(163, 242, 222, 0.3)"
                />
                <Circle cx="0" cy="45" r="3.5" fill={Colors.primary} />
                <Circle cx="40" cy="35" r="3.5" fill={Colors.primary} />
                <Circle cx="80" cy="40" r="3.5" fill={Colors.primary} />
                <Circle cx="120" cy="20" r="3.5" fill={Colors.primary} />
                <Circle cx="160" cy="28" r="3.5" fill={Colors.primary} />
                <Circle cx="200" cy="10" r="3.5" fill={Colors.primary} />
              </Svg>
            </View>
          </View>
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Health Activity</Text>
          <Text style={styles.sectionCount}>
            {totalEventCount} {totalEventCount === 1 ? 'event' : 'events'}
          </Text>
        </View>

        {/* 1. LOADING STATE: show loading state, do NOT show empty state while loading */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading your health timeline...</Text>
          </View>
        )}

        {/* 2. ERROR STATE: show user-friendly error with retry action */}
        {!isLoading && errorMessage && (
          <View style={styles.errorContainer}>
            <View style={styles.errorIconCircle}>
              <Ionicons name="cloud-offline-outline" size={32} color={Colors.secondary} />
            </View>
            <Text style={styles.errorTitle}>Unable to load timeline</Text>
            <Text style={styles.errorDescription}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => fetchTimeline(1)}
              activeOpacity={0.8}>
              <Ionicons name="refresh" size={18} color={Colors.onPrimary} />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 3. EMPTY STATE: if timeline.length === 0 and not loading */}
        {!isLoading && !errorMessage && timelineData.length === 0 && (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No health events logged yet</Text>
            <Text style={styles.emptyDescription}>
              As you chat with your companion or log medications and symptoms, your care timeline will appear here automatically.
            </Text>
          </View>
        )}

        {/* 4. TIMELINE CONTENT: Grouped by Date */}
        {!isLoading && !errorMessage && timelineData.length > 0 && (
          <View style={styles.timelineContainer}>
            {/* Continuous vertical line */}
            <View style={styles.continuousLine} />

            {timelineData.map((dateGroup, groupIndex) => (
              <View key={`group-${dateGroup.date}-${groupIndex}`} style={styles.dateGroup}>
                {/* Human-readable Date Group Header */}
                <View style={styles.dateHeaderRow}>
                  <View style={styles.dateHeaderBadge}>
                    <Ionicons name="time-outline" size={13} color={Colors.onSurfaceVariant} />
                    <Text style={styles.dateHeaderText}>
                      {formatGroupDate(dateGroup.date)} ({formatReadableDate(dateGroup.date)})
                    </Text>
                  </View>
                </View>

                {/* Events for this date */}
                {dateGroup.events.map((event, eventIndex) => {
                  const eventConfig = getEventTypeConfig(event.eventType);

                  return (
                    <View key={event.id || `evt-${eventIndex}`} style={styles.timelineItemRow}>
                      {/* Node Icon */}
                      <View style={styles.nodeWrapper}>
                        <View
                          style={[
                            styles.nodeCircle,
                            { borderColor: Colors.primaryFixed },
                          ]}>
                          <Ionicons
                            name={eventConfig.iconName as any}
                            size={18}
                            color={eventConfig.iconColor}
                          />
                        </View>
                      </View>

                      {/* Event Card */}
                      <View
                        style={[
                          styles.eventCard,
                          { backgroundColor: eventConfig.cardBg },
                        ]}>
                        <View style={styles.cardHeader}>
                          <Text style={styles.cardTitle}>
                            {event.title || eventConfig.label}
                          </Text>
                          <Text style={styles.cardTime}>
                            {formatEventDateTime(event.createdAt || event.eventDate)}
                          </Text>
                        </View>

                        {event.description ? (
                          <Text style={styles.cardDescription}>{event.description}</Text>
                        ) : null}

                        {/* Secondary details / Entity Chips & Type badge */}
                        <View style={styles.chipsRow}>
                          <View
                            style={[
                              styles.typeBadge,
                              { backgroundColor: eventConfig.badgeBg },
                            ]}>
                            <Text
                              style={[
                                styles.typeBadgeText,
                                { color: eventConfig.badgeTextColor },
                              ]}>
                              {eventConfig.label}
                            </Text>
                          </View>

                          {event.entities?.map((entity, entIdx) => (
                            <View key={`ent-${entIdx}`} style={styles.entityChip}>
                              <Text style={styles.entityChipText}>
                                {formatEntityTypeLabel(entity.entityType)}: {entity.entityValue}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}

            {/* Pagination / Load Older Entries */}
            {currentPage < totalPages && (
              <View style={styles.loadMoreContainer}>
                <TouchableOpacity
                  style={styles.loadMoreButton}
                  onPress={onLoadMore}
                  disabled={isLoadingMore}
                  activeOpacity={0.8}>
                  {isLoadingMore ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.loadMoreText}>Load Older Entries</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
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
  },
  heroSection: {
    marginBottom: Spacing.five,
    gap: Spacing.four,
  },
  heroTextCol: {
    gap: Spacing.one,
  },
  heroHeadline: {
    ...Typography.headlineLarge,
    color: Colors.onSurface,
  },
  heroSubtext: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
  },
  sparklineCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: Spacing.four,
    ...Shadows.card,
  },
  sparklineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  sparklineLabel: {
    ...Typography.labelMedium,
    color: Colors.outline,
  },
  sparklineScore: {
    ...Typography.labelMedium,
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  chartContainer: {
    height: 50,
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
  },
  sectionTitle: {
    ...Typography.headlineMedium,
    color: Colors.onSurface,
  },
  sectionCount: {
    ...Typography.caption,
    color: Colors.outline,
  },
  loadingContainer: {
    paddingVertical: Spacing.eight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  loadingText: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
  },
  errorContainer: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: Spacing.six,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    ...Shadows.card,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.softCoralBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  errorTitle: {
    ...Typography.headlineMedium,
    color: Colors.secondary,
    textAlign: 'center',
  },
  errorDescription: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: 9999,
  },
  retryButtonText: {
    ...Typography.labelMedium,
    color: Colors.onPrimary,
  },
  emptyContainer: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: Spacing.six,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    ...Shadows.card,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.softTealBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  emptyTitle: {
    ...Typography.headlineMedium,
    color: Colors.primary,
    textAlign: 'center',
  },
  emptyDescription: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
  },
  timelineContainer: {
    position: 'relative',
    marginTop: Spacing.two,
  },
  continuousLine: {
    position: 'absolute',
    left: 20,
    top: 10,
    bottom: 20,
    width: 2,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  dateGroup: {
    marginBottom: Spacing.five,
  },
  dateHeaderRow: {
    marginBottom: Spacing.three,
    marginLeft: 48,
  },
  dateHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceContainer,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    borderRadius: 9999,
    gap: 4,
  },
  dateHeaderText: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
    fontWeight: '600',
  },
  timelineItemRow: {
    flexDirection: 'row',
    marginBottom: Spacing.four,
    alignItems: 'flex-start',
  },
  nodeWrapper: {
    width: 42,
    alignItems: 'center',
    marginRight: Spacing.two,
  },
  nodeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.soft,
  },
  eventCard: {
    flex: 1,
    borderRadius: 18,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: Colors.surfaceContainerHigh,
    gap: Spacing.two,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  cardTitle: {
    ...Typography.labelMedium,
    color: Colors.onSurface,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  cardTime: {
    ...Typography.caption,
    color: Colors.outline,
    fontSize: 11,
  },
  cardDescription: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    lineHeight: 20,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  typeBadgeText: {
    ...Typography.caption,
    fontWeight: '700',
    fontSize: 11,
  },
  entityChip: {
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  entityChipText: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  loadMoreContainer: {
    alignItems: 'center',
    marginTop: Spacing.four,
  },
  loadMoreButton: {
    borderWidth: 2,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: 9999,
  },
  loadMoreText: {
    ...Typography.labelMedium,
    color: Colors.primary,
  },
});
