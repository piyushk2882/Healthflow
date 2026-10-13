import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadows } from '@/constants/theme';
import { Toast } from '@/components/Toast';
import {
  api,
  Medication,
  MedicationSchedule,
  MedicationLog,
  MedicationStatus,
} from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { formatReadableDate } from '@/utils/dateFormatter';

/**
 * Format 24-hr time (e.g. "08:00" or "14:30:00") into 12-hr format (e.g. "8:00 AM")
 */
function formatTime12h(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hour = parseInt(parts[0], 10);
  const min = parts[1].slice(0, 2);
  if (isNaN(hour)) return timeStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${min} ${ampm}`;
}

/**
 * Get current date as YYYY-MM-DD
 */
function getTodayIsoDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function RemindersScreen() {
  const { isAuthenticated, user } = useAuth();
  const isDoctor = user?.role === 'DOCTOR';

  // Doctor's assigned patients state
  const [assignedPatients, setAssignedPatients] = useState<
    Array<{ patientId: string; fullName: string; assignedAt: string }>
  >([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // Medications state
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Status Filter: 'ALL' | 'ACTIVE' | 'COMPLETED' | 'PAUSED'
  const [statusFilter, setStatusFilter] = useState<'ALL' | MedicationStatus>('ALL');

  // Adherence logs cache: key is `${medicationId}-${scheduledTime}`
  const [adherenceLogs, setAdherenceLogs] = useState<Record<string, MedicationLog>>({});

  // Toast state
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [showToast, setShowToast] = useState(false);

  // Add / Edit Medication Modal state (Doctor Only)
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDosage, setFormDosage] = useState('');
  const [formFrequency, setFormFrequency] = useState('');
  const [formStartDate, setFormStartDate] = useState(getTodayIsoDate());
  const [formEndDate, setFormEndDate] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formStatus, setFormStatus] = useState<MedicationStatus>('ACTIVE');
  const [isSavingMedication, setIsSavingMedication] = useState(false);

  // Schedules Management Modal state (Doctor Only)
  const [isScheduleModalVisible, setIsScheduleModalVisible] = useState(false);
  const [activeMedicationForSchedule, setActiveMedicationForSchedule] = useState<Medication | null>(null);
  const [activeSchedules, setActiveSchedules] = useState<MedicationSchedule[]>([]);
  const [newScheduleTime, setNewScheduleTime] = useState('08:00');
  const [newScheduleDose, setNewScheduleDose] = useState('');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
  };

  // If user is a DOCTOR, load assigned patients from active relationships
  useEffect(() => {
    if (isAuthenticated && isDoctor) {
      api.medications
        .getDoctorPatients()
        .then((res) => {
          if (res.success && res.data?.patients && res.data.patients.length > 0) {
            setAssignedPatients(res.data.patients);
            setSelectedPatientId((prev) => prev || res.data!.patients[0].patientId);
          }
        })
        .catch(() => {
          // Ignore initial error
        });
    }
  }, [isAuthenticated, isDoctor]);

  /**
   * Fetch medications and adherence logs
   */
  const loadMedications = useCallback(
    async (isPullRefresh = false) => {
      if (!isAuthenticated) return;
      if (isPullRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const res = await api.medications.list(
          statusFilter === 'ALL' ? undefined : statusFilter,
          isDoctor ? selectedPatientId || undefined : undefined
        );

        if (res.success && res.data?.medications) {
          const meds = res.data.medications;
          setMedications(meds);

          // Fetch logs for each medication to show today's adherence status
          const logsMap: Record<string, MedicationLog> = {};
          await Promise.all(
            meds.map(async (med) => {
              try {
                const logsRes = await api.medications.listLogs(med.id);
                if (logsRes.success && logsRes.data?.logs) {
                  logsRes.data.logs.forEach((log) => {
                    const key = `${med.id}-${log.scheduledTime}`;
                    logsMap[key] = log;
                  });
                }
              } catch {
                // Ignore individual log error
              }
            })
          );
          setAdherenceLogs(logsMap);
        } else {
          setErrorMessage(res.message || 'Unable to load medications. Please try again.');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Network error while loading medications.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isAuthenticated, statusFilter, isDoctor, selectedPatientId]
  );

  useEffect(() => {
    loadMedications();
  }, [loadMedications]);

  /**
   * Flatten daily scheduled doses for patient view matching user screenshot
   */
  const dailyScheduledDoses = useMemo(() => {
    const list: Array<{
      medication: Medication;
      schedule: MedicationSchedule;
      scheduledTime: string;
      isTaken: boolean;
      isSkipped: boolean;
      log?: MedicationLog;
    }> = [];

    medications.forEach((med) => {
      if (med.status !== 'ACTIVE') return;
      const schedules = med.schedules || [];
      if (schedules.length === 0) {
        // Default dose entry if no schedule time configured
        const fakeSchedule: MedicationSchedule = {
          id: `default-${med.id}`,
          scheduledTime: '08:00',
          dose: med.dosage || '1 dose',
        };
        const logKey = `${med.id}-08:00`;
        const log = adherenceLogs[logKey];
        list.push({
          medication: med,
          schedule: fakeSchedule,
          scheduledTime: '08:00',
          isTaken: log?.status === 'TAKEN',
          isSkipped: log?.status === 'SKIPPED',
          log,
        });
      } else {
        schedules.forEach((sch) => {
          const logKey = `${med.id}-${sch.scheduledTime}`;
          const log = adherenceLogs[logKey];
          list.push({
            medication: med,
            schedule: sch,
            scheduledTime: sch.scheduledTime,
            isTaken: log?.status === 'TAKEN',
            isSkipped: log?.status === 'SKIPPED',
            log,
          });
        });
      }
    });

    // Sort chronologically by time
    return list.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  }, [medications, adherenceLogs]);

  /**
   * Open Modal to create new medication (Doctor Only)
   */
  const openCreateModal = () => {
    setEditingMedicationId(null);
    setFormName('');
    setFormDosage('');
    setFormFrequency('Once daily');
    setFormStartDate(getTodayIsoDate());
    setFormEndDate('');
    setFormInstructions('');
    setFormStatus('ACTIVE');
    setIsEditModalVisible(true);
  };

  /**
   * Open Modal to edit existing medication (Doctor Only)
   */
  const openEditModal = (med: Medication) => {
    setEditingMedicationId(med.id);
    setFormName(med.name);
    setFormDosage(med.dosage || '');
    setFormFrequency(med.frequency);
    setFormStartDate(med.startDate);
    setFormEndDate(med.endDate || '');
    setFormInstructions(med.instructions || '');
    setFormStatus(med.status);
    setIsEditModalVisible(true);
  };

  /**
   * Submit Create or Edit Medication
   */
  const handleSaveMedication = async () => {
    if (!formName.trim()) {
      triggerToast('Medication name is required.', 'error');
      return;
    }
    if (!formFrequency.trim()) {
      triggerToast('Frequency is required (e.g. Once daily).', 'error');
      return;
    }
    if (!formStartDate.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(formStartDate.trim())) {
      triggerToast('Start date must be in YYYY-MM-DD format.', 'error');
      return;
    }
    if (formEndDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(formEndDate.trim())) {
      triggerToast('End date must be in YYYY-MM-DD format.', 'error');
      return;
    }

    setIsSavingMedication(true);
    try {
      if (editingMedicationId) {
        // Update medication
        const res = await api.medications.update(editingMedicationId, {
          name: formName.trim(),
          dosage: formDosage.trim() || undefined,
          frequency: formFrequency.trim(),
          startDate: formStartDate.trim(),
          endDate: formEndDate.trim() || undefined,
          instructions: formInstructions.trim() || undefined,
          status: formStatus,
        });

        if (res.success) {
          triggerToast(`Updated ${formName.trim()} successfully!`);
          setIsEditModalVisible(false);
          loadMedications();
        } else {
          triggerToast(res.message || 'Failed to update medication.', 'error');
        }
      } else {
        // Create medication
        const res = await api.medications.create({
          name: formName.trim(),
          dosage: formDosage.trim() || undefined,
          frequency: formFrequency.trim(),
          startDate: formStartDate.trim(),
          endDate: formEndDate.trim() || undefined,
          instructions: formInstructions.trim() || undefined,
          status: formStatus,
          patientId: selectedPatientId || undefined,
        });

        if (res.success && res.data?.medication) {
          triggerToast(`Prescribed ${formName.trim()} successfully!`);
          setIsEditModalVisible(false);
          loadMedications();
        } else {
          triggerToast(res.message || 'Failed to prescribe medication.', 'error');
        }
      }
    } catch (err: any) {
      triggerToast(err.message || 'Error saving medication.', 'error');
    } finally {
      setIsSavingMedication(false);
    }
  };

  /**
   * Delete Medication (Doctor Only)
   */
  const handleDeleteMedication = (med: Medication) => {
    Alert.alert(
      'Delete Prescription',
      `Are you sure you want to delete ${med.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await api.medications.delete(med.id);
              if (res.success) {
                triggerToast(`Deleted ${med.name}`);
                loadMedications();
              } else {
                triggerToast(res.message || 'Could not delete medication', 'error');
              }
            } catch (err: any) {
              triggerToast(err.message || 'Failed to delete medication', 'error');
            }
          },
        },
      ]
    );
  };

  /**
   * Open Schedules Management Modal (Doctor Only)
   */
  const openScheduleModal = async (med: Medication) => {
    setActiveMedicationForSchedule(med);
    setActiveSchedules(med.schedules || []);
    setNewScheduleTime('08:00');
    setNewScheduleDose(med.dosage || '');
    setIsScheduleModalVisible(true);

    try {
      const res = await api.medications.listSchedules(med.id);
      if (res.success && res.data?.schedules) {
        setActiveSchedules(res.data.schedules);
      }
    } catch {
      // Ignore
    }
  };

  /**
   * Add a new schedule time
   */
  const handleAddSchedule = async () => {
    if (!activeMedicationForSchedule) return;
    const timeClean = newScheduleTime.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(timeClean)) {
      triggerToast('Please enter time in HH:mm 24-hour format (e.g. 08:00 or 19:30).', 'error');
      return;
    }

    setIsSavingSchedule(true);
    try {
      const res = await api.medications.createSchedule(activeMedicationForSchedule.id, {
        scheduledTime: timeClean,
        dose: newScheduleDose.trim() || undefined,
      });

      if (res.success && res.data?.schedule) {
        triggerToast(`Added dose time ${formatTime12h(timeClean)}`);
        setActiveSchedules((prev) => [...prev, res.data!.schedule]);
        loadMedications();
      } else {
        triggerToast(res.message || 'Failed to add schedule time.', 'error');
      }
    } catch (err: any) {
      triggerToast(err.message || 'Error adding schedule.', 'error');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  /**
   * Delete a schedule time
   */
  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!activeMedicationForSchedule) return;
    try {
      const res = await api.medications.deleteSchedule(activeMedicationForSchedule.id, scheduleId);
      if (res.success) {
        triggerToast('Removed dose time');
        setActiveSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
        loadMedications();
      } else {
        triggerToast(res.message || 'Failed to remove schedule.', 'error');
      }
    } catch (err: any) {
      triggerToast(err.message || 'Error removing schedule.', 'error');
    }
  };

  /**
   * Mark Adherence: TAKEN or SKIPPED
   */
  const handleLogAdherence = async (
    medication: Medication,
    scheduledTime: string,
    status: 'TAKEN' | 'SKIPPED'
  ) => {
    try {
      const parts = scheduledTime.split(':');
      const hour = parseInt(parts[0] || '0', 10);
      const min = parseInt(parts[1] || '0', 10);
      const doseDate = new Date();
      doseDate.setHours(hour, min, 0, 0);
      const scheduledIso = doseDate.toISOString();

      const res = await api.medications.createLog(medication.id, {
        scheduledTime: scheduledIso,
        status,
        takenAt: status === 'TAKEN' ? new Date().toISOString() : undefined,
      });

      if (res.success && res.data?.log) {
        const key = `${medication.id}-${scheduledTime}`;
        setAdherenceLogs((prev) => ({ ...prev, [key]: res.data!.log }));
        triggerToast(
          status === 'TAKEN'
            ? `Marked ${medication.name} as taken!`
            : `Marked ${medication.name} as skipped.`,
          'success'
        );
      } else {
        triggerToast(res.message || 'Failed to record dose adherence.', 'error');
      }
    } catch (err: any) {
      triggerToast(err.message || 'Error recording dose status.', 'error');
    }
  };

  const selectedPatient = assignedPatients.find((p) => p.patientId === selectedPatientId);

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
            onRefresh={() => loadMedications(true)}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }>
        {/* ===================================================== */}
        {/* VIEW A: DOCTOR / CAREGIVER EXPERIENCE */}
        {/* ===================================================== */}
        {isDoctor ? (
          <>
            <View style={styles.headerRow}>
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle}>Prescriptions & Care</Text>
                <Text style={styles.headerSubtext}>
                  Select an assigned patient to prescribe or manage medication schedules
                </Text>
              </View>
            </View>

            {/* Assigned Patients Section */}
            <View style={styles.patientsSection}>
              <Text style={styles.sectionTitle}>
                ASSIGNED PATIENTS ({assignedPatients.length})
              </Text>

              {assignedPatients.length === 0 ? (
                <View style={styles.noPatientsCard}>
                  <Ionicons name="people-outline" size={28} color={Colors.outline} />
                  <Text style={styles.noPatientsText}>
                    No active patients connected yet. You can only manage medications for patients with an ACTIVE care relationship.
                  </Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.patientCardsRow}>
                  {assignedPatients.map((patient) => {
                    const isSelected = patient.patientId === selectedPatientId;
                    return (
                      <TouchableOpacity
                        key={patient.patientId}
                        style={[styles.patientCardItem, isSelected && styles.patientCardItemSelected]}
                        onPress={() => setSelectedPatientId(patient.patientId)}
                        activeOpacity={0.8}>
                        <View style={[styles.patientAvatar, isSelected && styles.patientAvatarSelected]}>
                          <Text style={[styles.patientAvatarText, isSelected && styles.patientAvatarTextSelected]}>
                            {patient.fullName ? patient.fullName.charAt(0).toUpperCase() : 'P'}
                          </Text>
                        </View>
                        <View style={styles.patientCardItemInfo}>
                          <Text style={[styles.patientCardItemName, isSelected && styles.patientCardItemNameSelected]}>
                            {patient.fullName}
                          </Text>
                          <Text style={styles.patientCardItemBadge}>
                            {isSelected ? 'Active Selection' : 'Assigned Patient'}
                          </Text>
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={styles.patientCheckIcon} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Selected Patient Medication Action Bar */}
            {selectedPatient && (
              <View style={styles.doctorActionBar}>
                <View style={styles.doctorActivePatientTag}>
                  <Ionicons name="person" size={14} color={Colors.primary} />
                  <Text style={styles.doctorActivePatientText}>
                    Managing: <Text style={{ fontWeight: '700' }}>{selectedPatient.fullName}</Text>
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.addMedicationButton}
                  onPress={openCreateModal}
                  activeOpacity={0.85}>
                  <Ionicons name="add" size={18} color={Colors.onPrimary} />
                  <Text style={styles.addMedicationButtonText}>Add Medicine</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Filter Pills for Doctor */}
            <View style={styles.filterPillsRow}>
              {(['ALL', 'ACTIVE', 'PAUSED', 'COMPLETED'] as const).map((filter) => {
                const isSelected = statusFilter === filter;
                return (
                  <TouchableOpacity
                    key={filter}
                    style={[styles.filterPill, isSelected && styles.filterPillActive]}
                    onPress={() => setStatusFilter(filter)}
                    activeOpacity={0.8}>
                    <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>
                      {filter === 'ALL' ? 'All' : filter.charAt(0) + filter.slice(1).toLowerCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Loading / Error States */}
            {isLoading && !isRefreshing && (
              <View style={styles.stateCenterContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.stateLoadingText}>Loading medications...</Text>
              </View>
            )}

            {errorMessage && !isLoading && (
              <View style={styles.stateCenterContainer}>
                <Ionicons name="alert-circle-outline" size={44} color={Colors.error} />
                <Text style={styles.stateErrorText}>{errorMessage}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => loadMedications()}
                  activeOpacity={0.85}>
                  <Ionicons name="refresh-outline" size={16} color={Colors.onPrimary} />
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Doctor Empty State */}
            {!isLoading && !errorMessage && medications.length === 0 && (
              <View style={styles.stateCenterContainer}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="medkit-outline" size={42} color={Colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No medications prescribed</Text>
                <Text style={styles.emptySubtitle}>
                  {selectedPatient
                    ? `No medications found for ${selectedPatient.fullName}. Tap 'Add Medicine' above to prescribe their first regimen.`
                    : 'Select a patient above to view or prescribe their medications.'}
                </Text>
              </View>
            )}

            {/* Doctor Medication List */}
            {!isLoading && !errorMessage && medications.length > 0 && (
              <View style={styles.medicationsList}>
                {medications.map((med) => {
                  const schedules = med.schedules || [];
                  return (
                    <View key={med.id} style={styles.doctorMedCard}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.medInfoLeft}>
                          <View style={styles.medNameRow}>
                            <Ionicons name="bandage-outline" size={18} color={Colors.primary} />
                            <Text style={styles.medName}>{med.name}</Text>
                          </View>
                          {med.dosage ? <Text style={styles.medDosage}>{med.dosage}</Text> : null}
                        </View>

                        <View style={styles.statusBadge}>
                          <Text style={styles.statusBadgeText}>{med.status}</Text>
                        </View>
                      </View>

                      <View style={styles.metaRow}>
                        <View style={styles.metaItem}>
                          <Ionicons name="repeat-outline" size={14} color={Colors.onSurfaceVariant} />
                          <Text style={styles.metaText}>{med.frequency}</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Ionicons name="calendar-outline" size={14} color={Colors.onSurfaceVariant} />
                          <Text style={styles.metaText}>
                            {formatReadableDate(med.startDate)}
                            {med.endDate ? ` → ${formatReadableDate(med.endDate)}` : ''}
                          </Text>
                        </View>
                      </View>

                      {med.instructions ? (
                        <View style={styles.instructionsBox}>
                          <Ionicons name="information-circle-outline" size={15} color={Colors.primary} />
                          <Text style={styles.instructionsText}>{med.instructions}</Text>
                        </View>
                      ) : null}

                      {/* Daily reminder times list */}
                      <View style={styles.doctorSchedulesList}>
                        <View style={styles.schedulesHeaderRow}>
                          <Text style={styles.schedulesHeaderLabel}>
                            Configured Times ({schedules.length})
                          </Text>
                          <TouchableOpacity
                            onPress={() => openScheduleModal(med)}
                            activeOpacity={0.7}
                            style={styles.manageTimesBtn}>
                            <Ionicons name="time-outline" size={13} color={Colors.primary} />
                            <Text style={styles.manageTimesBtnText}>Manage Times</Text>
                          </TouchableOpacity>
                        </View>

                        {schedules.length === 0 ? (
                          <Text style={styles.noSchedulesNote}>No specific reminder times set.</Text>
                        ) : (
                          <View style={styles.scheduleBadgesWrap}>
                            {schedules.map((s) => (
                              <View key={s.id} style={styles.scheduleBadgePill}>
                                <Ionicons name="time" size={13} color={Colors.primary} />
                                <Text style={styles.scheduleBadgePillText}>
                                  {formatTime12h(s.scheduledTime)}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* Doctor Action Buttons: Edit & Delete */}
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={styles.cardActionButton}
                          onPress={() => openEditModal(med)}
                          activeOpacity={0.7}>
                          <Ionicons name="create-outline" size={15} color={Colors.primary} />
                          <Text style={styles.cardActionText}>Edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.cardActionButton}
                          onPress={() => handleDeleteMedication(med)}
                          activeOpacity={0.7}>
                          <Ionicons name="trash-outline" size={15} color={Colors.error} />
                          <Text style={[styles.cardActionText, { color: Colors.error }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : (
          /* ===================================================== */
          /* VIEW B: PATIENT VIEW MATCHING SCREENSHOT EXACTLY */
          /* ===================================================== */
          <>
            {/* Top Encouragement Pill */}
            <View style={styles.patientTopPillWrap}>
              <View style={styles.patientTopPill}>
                <Ionicons name="checkmark-circle" size={18} color="#1b7a67" />
                <Text style={styles.patientTopPillText}>Nice, you're on track!</Text>
              </View>
            </View>

            {/* Heading & Subtitle */}
            <View style={styles.patientHeader}>
              <Text style={styles.patientHeading}>Today's medicines</Text>
              <Text style={styles.patientSubtext}>Your wellness journey continues.</Text>
            </View>

            {/* "This Week" row with progress dots */}
            <View style={styles.thisWeekRow}>
              <Text style={styles.thisWeekLabel}>This Week</Text>
              <View style={styles.weekDotsContainer}>
                <View style={[styles.weekDot, styles.weekDotCompleted]} />
                <View style={[styles.weekDot, styles.weekDotCompleted]} />
                <View style={[styles.weekDot, styles.weekDotCurrent]} />
                <View style={[styles.weekDot, styles.weekDotFuture]} />
                <View style={[styles.weekDot, styles.weekDotFuture]} />
                <View style={[styles.weekDot, styles.weekDotFuture]} />
                <View style={[styles.weekDot, styles.weekDotFuture]} />
              </View>
            </View>

            {/* Loading / Error States */}
            {isLoading && !isRefreshing && (
              <View style={styles.stateCenterContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.stateLoadingText}>Loading your medicine schedule...</Text>
              </View>
            )}

            {errorMessage && !isLoading && (
              <View style={styles.stateCenterContainer}>
                <Ionicons name="alert-circle-outline" size={44} color={Colors.error} />
                <Text style={styles.stateErrorText}>{errorMessage}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => loadMedications()}
                  activeOpacity={0.85}>
                  <Ionicons name="refresh-outline" size={16} color={Colors.onPrimary} />
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Empty State for Patient */}
            {!isLoading && !errorMessage && dailyScheduledDoses.length === 0 && (
              <View style={styles.stateCenterContainer}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="heart-outline" size={42} color={Colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No medicines scheduled today</Text>
                <Text style={styles.emptySubtitle}>
                  Your doctor or caregiver hasn't assigned any active medicines to your profile yet.
                </Text>
              </View>
            )}

            {/* Patient Medicine Schedule Cards (Screenshot Style) */}
            {!isLoading && !errorMessage && dailyScheduledDoses.length > 0 && (
              <View style={styles.patientCardsList}>
                {dailyScheduledDoses.map((item, index) => {
                  const { medication, scheduledTime, isTaken, isSkipped } = item;
                  const displayTime = formatTime12h(scheduledTime);

                  // Status badge label and style
                  let badgeLabel = 'Upcoming';
                  let badgeStyle = styles.badgeUpcoming;
                  let badgeTextStyle = styles.badgeUpcomingText;

                  if (isTaken) {
                    badgeLabel = 'Taken';
                    badgeStyle = styles.badgeTaken;
                    badgeTextStyle = styles.badgeTakenText;
                  } else if (isSkipped) {
                    badgeLabel = 'Skipped';
                    badgeStyle = styles.badgeSkipped;
                    badgeTextStyle = styles.badgeSkippedText;
                  } else if (index >= 2) {
                    badgeLabel = 'Later';
                    badgeStyle = styles.badgeLater;
                    badgeTextStyle = styles.badgeLaterText;
                  }

                  const dosageInfo = [
                    medication.dosage || null,
                    medication.instructions || null,
                  ]
                    .filter(Boolean)
                    .join(' • ');

                  return (
                    <View
                      key={`${medication.id}-${scheduledTime}`}
                      style={[styles.patientDoseCard, isTaken && styles.patientDoseCardTaken]}>
                      {/* Card Top Row: Time & Status Pill */}
                      <View style={styles.patientCardTopRow}>
                        <Text style={styles.patientCardTimeText}>{displayTime}</Text>
                        <View style={[styles.patientCardStatusBadge, badgeStyle]}>
                          <Text style={[styles.patientCardStatusBadgeText, badgeTextStyle]}>
                            {badgeLabel}
                          </Text>
                        </View>
                      </View>

                      {/* Card Main Row: Circle Icon + Medicine Details + Action */}
                      <View style={styles.patientCardMainRow}>
                        <View
                          style={[
                            styles.patientCheckCircle,
                            isTaken && styles.patientCheckCircleTaken,
                          ]}>
                          {isTaken ? (
                            <Ionicons name="checkmark" size={16} color={Colors.onPrimary} />
                          ) : null}
                        </View>

                        <View style={styles.patientCardInfo}>
                          <Text
                            style={[
                              styles.patientCardMedicineName,
                              isTaken && styles.patientCardMedicineNameTaken,
                            ]}>
                            {medication.name}
                          </Text>
                          <Text style={styles.patientCardDosageText}>
                            {dosageInfo || medication.frequency}
                          </Text>
                        </View>

                        {/* "Take Now" Button for Pending Doses */}
                        {!isTaken && !isSkipped && (
                          <TouchableOpacity
                            style={styles.takeNowButton}
                            onPress={() => handleLogAdherence(medication, scheduledTime, 'TAKEN')}
                            activeOpacity={0.8}>
                            <Text style={styles.takeNowButtonText}>Take Now</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ===================================================== */}
      {/* MODAL: ADD / EDIT MEDICATION (DOCTOR ONLY) */}
      {/* ===================================================== */}
      {isDoctor && (
        <Modal
          visible={isEditModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsEditModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <View>
                  <Text style={styles.modalTitle}>
                    {editingMedicationId ? 'Edit Prescription' : 'Prescribe Medicine'}
                  </Text>
                  {selectedPatient && (
                    <Text style={styles.modalSubtitle}>For Patient: {selectedPatient.fullName}</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => setIsEditModalVisible(false)}
                  activeOpacity={0.7}
                  style={styles.modalCloseButton}>
                  <Ionicons name="close" size={20} color={Colors.onSurface} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Medication Name *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g. Lisinopril, Metformin"
                    placeholderTextColor={Colors.outline}
                    value={formName}
                    onChangeText={setFormName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Dosage & Formulation</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g. 10mg • 1 Tablet"
                    placeholderTextColor={Colors.outline}
                    value={formDosage}
                    onChangeText={setFormDosage}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Frequency *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g. Once daily, Twice daily"
                    placeholderTextColor={Colors.outline}
                    value={formFrequency}
                    onChangeText={setFormFrequency}
                  />
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Start Date (YYYY-MM-DD) *</Text>
                    <TextInput
                      style={styles.inputField}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.outline}
                      value={formStartDate}
                      onChangeText={setFormStartDate}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>End Date (Optional)</Text>
                    <TextInput
                      style={styles.inputField}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.outline}
                      value={formEndDate}
                      onChangeText={setFormEndDate}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Instructions / Clinical Notes</Text>
                  <TextInput
                    style={[styles.inputField, styles.textAreaField]}
                    placeholder="e.g. Take with water after breakfast"
                    placeholderTextColor={Colors.outline}
                    value={formInstructions}
                    onChangeText={setFormInstructions}
                    multiline
                    numberOfLines={2}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Status</Text>
                  <View style={styles.statusSelectRow}>
                    {(['ACTIVE', 'PAUSED', 'COMPLETED', 'DISCONTINUED'] as MedicationStatus[]).map(
                      (st) => {
                        const isSelected = formStatus === st;
                        return (
                          <TouchableOpacity
                            key={st}
                            style={[styles.statusOptionPill, isSelected && styles.statusOptionPillActive]}
                            onPress={() => setFormStatus(st)}
                            activeOpacity={0.8}>
                            <Text
                              style={[
                                styles.statusOptionText,
                                isSelected && styles.statusOptionTextActive,
                              ]}>
                              {st}
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                    )}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalFooterRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setIsEditModalVisible(false)}
                  activeOpacity={0.8}>
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSaveMedication}
                  disabled={isSavingMedication}
                  activeOpacity={0.85}>
                  {isSavingMedication ? (
                    <ActivityIndicator size="small" color={Colors.onPrimary} />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>
                      {editingMedicationId ? 'Save Changes' : 'Prescribe Medicine'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ===================================================== */}
      {/* MODAL: MANAGE SCHEDULES (DOCTOR ONLY) */}
      {/* ===================================================== */}
      {isDoctor && (
        <Modal
          visible={isScheduleModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsScheduleModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <View>
                  <Text style={styles.modalTitle}>Daily Schedules</Text>
                  <Text style={styles.modalSubtitle}>
                    {activeMedicationForSchedule?.name || 'Medication'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsScheduleModalVisible(false)}
                  activeOpacity={0.7}
                  style={styles.modalCloseButton}>
                  <Ionicons name="close" size={20} color={Colors.onSurface} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
                <Text style={styles.sectionHeaderLabel}>Configured Dose Times</Text>
                {activeSchedules.length === 0 ? (
                  <Text style={styles.emptyScheduleLabel}>
                    No specific reminder times set for this medication yet.
                  </Text>
                ) : (
                  <View style={styles.scheduleListWrap}>
                    {activeSchedules.map((sch) => (
                      <View key={sch.id} style={styles.scheduleListItem}>
                        <View style={styles.scheduleListTimeInfo}>
                          <Ionicons name="time" size={18} color={Colors.primary} />
                          <Text style={styles.scheduleListItemTime}>
                            {formatTime12h(sch.scheduledTime)}
                          </Text>
                          {sch.dose ? (
                            <Text style={styles.scheduleListItemDose}>• {sch.dose}</Text>
                          ) : null}
                        </View>

                        <TouchableOpacity
                          onPress={() => handleDeleteSchedule(sch.id)}
                          activeOpacity={0.7}
                          style={styles.deleteScheduleBtn}>
                          <Ionicons name="trash-outline" size={16} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.addScheduleCard}>
                  <Text style={styles.sectionHeaderLabel}>Add Reminder Time</Text>
                  <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Time (24h HH:mm) *</Text>
                      <TextInput
                        style={styles.inputField}
                        placeholder="08:00"
                        placeholderTextColor={Colors.outline}
                        value={newScheduleTime}
                        onChangeText={setNewScheduleTime}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1.5 }]}>
                      <Text style={styles.inputLabel}>Dose (optional)</Text>
                      <TextInput
                        style={styles.inputField}
                        placeholder="e.g. 1 Tablet"
                        placeholderTextColor={Colors.outline}
                        value={newScheduleDose}
                        onChangeText={setNewScheduleDose}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.addScheduleBtn}
                    onPress={handleAddSchedule}
                    disabled={isSavingSchedule}
                    activeOpacity={0.85}>
                    {isSavingSchedule ? (
                      <ActivityIndicator size="small" color={Colors.onPrimary} />
                    ) : (
                      <>
                        <Ionicons name="add" size={18} color={Colors.onPrimary} />
                        <Text style={styles.addScheduleBtnText}>Add Reminder Time</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <View style={styles.modalFooterRow}>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, { flex: 1 }]}
                  onPress={() => setIsScheduleModalVisible(false)}
                  activeOpacity={0.85}>
                  <Text style={styles.modalSaveBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fbf9f5',
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: 110,
  },

  /* DOCTOR VIEW STYLES */
  headerRow: {
    marginBottom: Spacing.four,
  },
  headerTextWrap: {
    gap: 2,
  },
  headerTitle: {
    ...Typography.headlineMedium,
    color: '#0a6859',
    fontWeight: '700',
    fontSize: 24,
  },
  headerSubtext: {
    ...Typography.bodyMedium,
    color: '#3f4946',
    fontSize: 13,
  },
  patientsSection: {
    marginBottom: Spacing.four,
  },
  sectionTitle: {
    ...Typography.caption,
    color: '#3f4946',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.6,
    marginBottom: Spacing.two,
  },
  noPatientsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: '#eae8e4',
  },
  noPatientsText: {
    ...Typography.caption,
    color: '#3f4946',
    textAlign: 'center',
    lineHeight: 18,
  },
  patientCardsRow: {
    flexDirection: 'row',
  },
  patientCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginRight: Spacing.two,
    borderWidth: 1.5,
    borderColor: '#eae8e4',
    gap: 10,
    ...Shadows.soft,
  },
  patientCardItemSelected: {
    borderColor: '#0a6859',
    backgroundColor: '#e8f2f0',
  },
  patientAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#efeeea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientAvatarSelected: {
    backgroundColor: '#0a6859',
  },
  patientAvatarText: {
    ...Typography.labelMedium,
    fontWeight: '700',
    color: '#0a6859',
  },
  patientAvatarTextSelected: {
    color: '#ffffff',
  },
  patientCardItemInfo: {
    gap: 2,
  },
  patientCardItemName: {
    ...Typography.labelMedium,
    fontWeight: '700',
    color: '#1b1c1a',
    fontSize: 14,
  },
  patientCardItemNameSelected: {
    color: '#0a6859',
  },
  patientCardItemBadge: {
    ...Typography.caption,
    color: '#6f7976',
    fontSize: 10,
  },
  patientCheckIcon: {
    marginLeft: 4,
  },
  doctorActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: '#eae8e4',
  },
  doctorActivePatientTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  doctorActivePatientText: {
    ...Typography.bodyMedium,
    color: '#1b1c1a',
    fontSize: 13,
  },
  addMedicationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0a6859',
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  addMedicationButtonText: {
    ...Typography.labelMedium,
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },

  /* DOCTOR MEDICATION CARD */
  medicationsList: {
    gap: Spacing.three,
  },
  doctorMedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: '#eae8e4',
    ...Shadows.card,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.two,
  },
  medInfoLeft: {
    flex: 1,
    gap: 2,
  },
  medNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  medName: {
    ...Typography.labelMedium,
    fontSize: 17,
    fontWeight: '700',
    color: '#1b1c1a',
  },
  medDosage: {
    ...Typography.bodyMedium,
    color: '#3f4946',
    fontSize: 13,
  },
  statusBadge: {
    backgroundColor: '#e8f2f0',
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    ...Typography.caption,
    fontWeight: '700',
    fontSize: 10,
    color: '#0a6859',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginVertical: Spacing.two,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...Typography.caption,
    color: '#3f4946',
  },
  instructionsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f5f3ef',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    marginBottom: Spacing.two,
  },
  instructionsText: {
    ...Typography.caption,
    color: '#3f4946',
    flex: 1,
  },
  doctorSchedulesList: {
    backgroundColor: '#f5f3ef',
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.two,
  },
  schedulesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  schedulesHeaderLabel: {
    ...Typography.caption,
    fontWeight: '700',
    color: '#3f4946',
    fontSize: 11,
  },
  manageTimesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  manageTimesBtnText: {
    ...Typography.caption,
    color: '#0a6859',
    fontWeight: '700',
    fontSize: 11,
  },
  noSchedulesNote: {
    ...Typography.caption,
    color: '#6f7976',
    fontStyle: 'italic',
  },
  scheduleBadgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  scheduleBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eae8e4',
  },
  scheduleBadgePillText: {
    ...Typography.caption,
    color: '#0a6859',
    fontWeight: '700',
    fontSize: 11,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: '#eae8e4',
    paddingTop: Spacing.two,
  },
  cardActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardActionText: {
    ...Typography.caption,
    fontWeight: '600',
    color: '#0a6859',
  },

  /* ===================================================== */
  /* PATIENT VIEW STYLES (MATCHING USER SCREENSHOT) */
  /* ===================================================== */
  patientTopPillWrap: {
    alignItems: 'center',
    marginVertical: Spacing.two,
  },
  patientTopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: Spacing.four,
    paddingVertical: 7,
    borderRadius: 9999,
    ...Shadows.soft,
    borderWidth: 1,
    borderColor: '#eae8e4',
  },
  patientTopPillText: {
    ...Typography.caption,
    color: '#1b1c1a',
    fontWeight: '600',
    fontSize: 13,
  },
  patientHeader: {
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
  },
  patientHeading: {
    ...Typography.headlineMedium,
    color: '#0a6859',
    fontWeight: '700',
    fontSize: 26,
    marginBottom: 4,
  },
  patientSubtext: {
    ...Typography.bodyMedium,
    color: '#3f4946',
    fontSize: 14,
  },
  thisWeekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 9999,
    marginBottom: Spacing.four,
    alignSelf: 'flex-start',
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: '#eae8e4',
  },
  thisWeekLabel: {
    ...Typography.caption,
    color: '#8b4e37',
    fontWeight: '700',
    fontSize: 12,
  },
  weekDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  weekDotCompleted: {
    backgroundColor: '#0a6859',
  },
  weekDotCurrent: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#0a6859',
    backgroundColor: '#a3f2de',
  },
  weekDotFuture: {
    backgroundColor: '#fdae91',
    opacity: 0.5,
  },

  /* PATIENT DOSE CARDS (MATCHING SCREENSHOT) */
  patientCardsList: {
    gap: Spacing.three,
  },
  patientDoseCard: {
    backgroundColor: '#f3f7f5',
    borderRadius: 22,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: '#e2ece7',
  },
  patientDoseCardTaken: {
    backgroundColor: '#eaf4f1',
    borderColor: '#cce5dd',
  },
  patientCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  patientCardTimeText: {
    ...Typography.caption,
    fontWeight: '700',
    color: '#0a6859',
    fontSize: 13,
  },
  patientCardStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  badgeTaken: {
    backgroundColor: '#0a6859',
  },
  badgeTakenText: {
    color: '#ffffff',
  },
  badgeUpcoming: {
    backgroundColor: '#ffdbcf',
  },
  badgeUpcomingText: {
    color: '#8b4e37',
  },
  badgeLater: {
    backgroundColor: '#efeeea',
  },
  badgeLaterText: {
    color: '#6f7976',
  },
  badgeSkipped: {
    backgroundColor: '#eae8e4',
  },
  badgeSkippedText: {
    color: '#6f7976',
  },
  patientCardStatusBadgeText: {
    ...Typography.caption,
    fontWeight: '600',
    fontSize: 11,
  },
  patientCardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  patientCheckCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e0deda',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientCheckCircleTaken: {
    backgroundColor: '#0a6859',
  },
  patientCardInfo: {
    flex: 1,
    gap: 3,
  },
  patientCardMedicineName: {
    ...Typography.labelMedium,
    color: '#0a6859',
    fontWeight: '700',
    fontSize: 17,
  },
  patientCardMedicineNameTaken: {
    textDecorationLine: 'line-through',
    opacity: 0.8,
  },
  patientCardDosageText: {
    ...Typography.caption,
    color: '#3f4946',
    fontSize: 12,
  },
  takeNowButton: {
    borderWidth: 1.5,
    borderColor: '#0a6859',
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    borderRadius: 9999,
    backgroundColor: '#ffffff',
  },
  takeNowButtonText: {
    ...Typography.caption,
    color: '#0a6859',
    fontWeight: '700',
    fontSize: 12,
  },

  /* FILTER PILLS (DOCTOR VIEW) */
  filterPillsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  filterPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f5f3ef',
    borderWidth: 1,
    borderColor: '#eae8e4',
  },
  filterPillActive: {
    backgroundColor: '#0a6859',
    borderColor: '#0a6859',
  },
  filterPillText: {
    ...Typography.caption,
    color: '#3f4946',
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#ffffff',
  },

  /* GENERAL STATES */
  stateCenterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  stateLoadingText: {
    ...Typography.bodyMedium,
    color: '#3f4946',
  },
  stateErrorText: {
    ...Typography.bodyMedium,
    color: Colors.error,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#0a6859',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    marginTop: Spacing.two,
  },
  retryButtonText: {
    ...Typography.labelMedium,
    color: '#ffffff',
    fontWeight: '600',
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e8f2f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...Typography.headlineMedium,
    color: '#1b1c1a',
    fontWeight: '700',
  },
  emptySubtitle: {
    ...Typography.bodyMedium,
    color: '#3f4946',
    textAlign: 'center',
    maxWidth: 290,
  },

  /* MODALS */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: Spacing.five,
    ...Shadows.floating,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  modalTitle: {
    ...Typography.headlineMedium,
    fontWeight: '700',
    color: '#1b1c1a',
  },
  modalSubtitle: {
    ...Typography.caption,
    color: '#0a6859',
    fontWeight: '600',
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 6,
  },
  modalBody: {
    marginBottom: Spacing.four,
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  inputLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: '#3f4946',
    marginBottom: 4,
  },
  inputField: {
    backgroundColor: '#f5f3ef',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eae8e4',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    ...Typography.bodyMedium,
    color: '#1b1c1a',
  },
  textAreaField: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  statusSelectRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statusOptionPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f5f3ef',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eae8e4',
  },
  statusOptionPillActive: {
    backgroundColor: '#0a6859',
    borderColor: '#0a6859',
  },
  statusOptionText: {
    ...Typography.caption,
    color: '#3f4946',
    fontWeight: '700',
    fontSize: 10,
  },
  statusOptionTextActive: {
    color: '#ffffff',
  },
  modalFooterRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#f5f3ef',
  },
  modalCancelBtnText: {
    ...Typography.labelMedium,
    color: '#3f4946',
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: Spacing.three,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a6859',
    ...Shadows.soft,
  },
  modalSaveBtnText: {
    ...Typography.labelMedium,
    color: '#ffffff',
    fontWeight: '700',
  },

  /* SCHEDULE MODAL */
  sectionHeaderLabel: {
    ...Typography.labelMedium,
    fontWeight: '700',
    color: '#1b1c1a',
    marginBottom: Spacing.two,
  },
  emptyScheduleLabel: {
    ...Typography.caption,
    color: '#3f4946',
    fontStyle: 'italic',
    marginBottom: Spacing.four,
  },
  scheduleListWrap: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  scheduleListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f3ef',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  scheduleListTimeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scheduleListItemTime: {
    ...Typography.labelMedium,
    color: '#1b1c1a',
    fontWeight: '700',
  },
  scheduleListItemDose: {
    ...Typography.caption,
    color: '#3f4946',
  },
  deleteScheduleBtn: {
    padding: 6,
  },
  addScheduleCard: {
    backgroundColor: '#f5f3ef',
    borderRadius: 14,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  addScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0a6859',
    paddingVertical: Spacing.two,
    borderRadius: 10,
    marginTop: Spacing.two,
  },
  addScheduleBtnText: {
    ...Typography.caption,
    color: '#ffffff',
    fontWeight: '700',
  },
});
