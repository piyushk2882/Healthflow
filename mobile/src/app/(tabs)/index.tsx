import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadows } from '@/constants/theme';
import { api, ChatMessage, TimelineEvent, DoctorChatPatient } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { formatHeaderDate, formatEventDateTime } from '@/utils/dateFormatter';
import { Toast } from '@/components/Toast';

// =============================================================================
// SHARED TYPES
// =============================================================================

interface UIThreadItem {
  id: string;
  sender: 'PATIENT' | 'AI';
  text: string;
  createdAt: string;
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


// =============================================================================
// DOCTOR CHAT TYPES
// =============================================================================

interface DoctorChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}


// =============================================================================
// PATIENT CHAT SCREEN (original — completely unchanged logic)
// =============================================================================

function PatientChatScreen() {
  const { isAuthenticated } = useAuth();
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [showToast, setShowToast] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Initial welcome message in the thread
  const [messages, setMessages] = useState<UIThreadItem[]>([]);

  const WELCOME_MESSAGE: UIThreadItem = {
    id: 'welcome-1',
    sender: 'AI',
    text: 'Hello! I am your health companion. How are you feeling today? You can tell me about any symptoms, vitals, or how your day has been.',
    createdAt: new Date().toISOString(),
  };

  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    if (!isAuthenticated) {
      triggerToast('Please sign in to send messages and track your health.', 'error');
      return;
    }

    setInputText('');

    const tempPatientMsg: UIThreadItem = {
      id: `temp-${Date.now()}`,
      sender: 'PATIENT',
      text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempPatientMsg]);
    setIsSending(true);

    try {
      const res = await api.chat.sendMessage(text, conversationId);

      if (res.success && res.data) {
        const {
          conversationId: returnedConvoId,
          aiMessage,
          healthEvent,
          extraction,
        } = res.data;

        if (returnedConvoId) {
          setConversationId(returnedConvoId);
        }

        const aiThreadItem: UIThreadItem = {
          id: aiMessage?.id || `ai-${Date.now()}`,
          sender: 'AI',
          text: aiMessage?.message || extraction?.assistantResponse || 'I have noted that for you.',
          createdAt: aiMessage?.created_at || new Date().toISOString(),
          healthEvent,
          extraction,
        };

        setMessages((prev) => [...prev, aiThreadItem]);
      } else {
        triggerToast(res.message || 'Could not process your message. Please try again.', 'error');
      }
    } catch (err: any) {
      triggerToast('Unable to send message. Please check your connection.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleSuggestion = (suggestion: string) => {
    handleSend(suggestion);
  };

  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
  }, [messages, isSending]);

  const renderMessageItem = ({ item, index }: { item: UIThreadItem; index: number }) => {
    if (item.sender === 'PATIENT') {
      return (
        <View style={styles.patientMessageContainer}>
          <View style={styles.patientBubble}>
            <Text style={styles.patientText}>{item.text}</Text>
          </View>
          <Text style={styles.timestampText}>{formatEventDateTime(item.createdAt)}</Text>
        </View>
      );
    }

    // Only show suggestions when AI specifically identified this as a health-relevant message
    const isLastMessage = index === messages.length - 1;
    const isHealthRelevant = item.extraction?.action === 'CREATE' || item.extraction?.action === 'UPDATE';
    const hasExtractionData =
      item.extraction && (item.extraction.entities?.length > 0 || item.extraction.title);
    const hasBentoData = item.healthEvent || hasExtractionData;

    // AI Message
    return (
      <View style={styles.aiMessageContainer}>
        <View style={styles.aiRow}>
          <View style={styles.aiAvatar}>
            <Ionicons name="leaf" size={16} color={Colors.primary} />
          </View>

          <View style={styles.aiContentCol}>
            {/* Core Response bubble */}
            <View style={styles.aiBubble}>
              <Text style={styles.aiText}>{item.text}</Text>
            </View>

            {/* Extracted Structured Health Data Card (only when there IS data) */}
            {hasBentoData && (
              <View style={styles.bentoCard}>
                <View style={styles.bentoHeader}>
                  <View style={styles.bentoHeaderLeft}>
                    <Ionicons name="checkbox-outline" size={16} color={Colors.primary} />
                    <Text style={styles.bentoTitle}>
                      {item.extraction?.title || item.healthEvent?.title || 'Logged Symptom'}
                    </Text>
                  </View>
                  <Ionicons name="create-outline" size={16} color={Colors.primary} />
                </View>

                {/* Chips */}
                <View style={styles.chipRow}>
                  {item.extraction?.title && (
                    <View style={styles.primaryChip}>
                      <Text style={styles.primaryChipText}>{item.extraction.title}</Text>
                    </View>
                  )}

                  {item.extraction?.entities?.map((ent, idx) => (
                    <View key={`ent-${idx}`} style={styles.secondaryChip}>
                      <Text style={styles.secondaryChipText}>{ent.entityValue}</Text>
                    </View>
                  ))}

                  {item.healthEvent?.entities?.map((ent, idx) => (
                    <View key={`he-ent-${idx}`} style={styles.secondaryChip}>
                      <Text style={styles.secondaryChipText}>{ent.entityValue}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Quick Suggestions — only when AI explicitly detected a health event to add/update */}
            {isLastMessage && isHealthRelevant && (
              <View style={styles.suggestionRow}>
                <TouchableOpacity
                  style={styles.suggestionChip}
                  onPress={() => handleSuggestion('Severity is mild')}
                  activeOpacity={0.7}>
                  <Text style={styles.suggestionText}>Severity mild</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.suggestionChip}
                  onPress={() => handleSuggestion('It started this morning')}
                  activeOpacity={0.7}>
                  <Text style={styles.suggestionText}>Since morning</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.suggestionChip}
                  onPress={() => handleSuggestion('Add note: feeling better now')}
                  activeOpacity={0.7}>
                  <Text style={styles.suggestionText}>Feeling better</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.timestampText}>{formatEventDateTime(item.createdAt)}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast
        visible={showToast}
        message={toastMessage}
        type={toastType}
        onDismiss={() => setShowToast(false)}
      />

      {/* Screen Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>How are you feeling today?</Text>
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={15} color={Colors.onSurfaceVariant} />
          <Text style={styles.dateText}>{formatHeaderDate()}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={styles.keyboardContainer}>
        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.aiMessageContainer}>
              <View style={styles.aiRow}>
                <View style={styles.aiAvatar}>
                  <Ionicons name="leaf" size={16} color={Colors.primary} />
                </View>
                <View style={styles.aiContentCol}>
                  <View style={styles.aiBubble}>
                    <Text style={styles.aiText}>{WELCOME_MESSAGE.text}</Text>
                  </View>
                  <Text style={styles.timestampText}>{formatEventDateTime(WELCOME_MESSAGE.createdAt)}</Text>
                </View>
              </View>
            </View>
          }
          ListFooterComponent={
            isSending ? (
              <View style={styles.typingIndicator}>
                <View style={styles.aiAvatar}>
                  <Ionicons name="leaf" size={16} color={Colors.primary} />
                </View>
                <View style={styles.typingBubble}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.typingText}>Analyzing health logs...</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* Floating Input Bar */}
        <View style={styles.inputBarContainer}>
          <View style={styles.inputBar}>
            <TouchableOpacity
              style={styles.attachButton}
              onPress={() => triggerToast('Attachment features coming soon', 'info')}
              activeOpacity={0.7}>
              <Ionicons name="add-circle" size={24} color={Colors.outline} />
            </TouchableOpacity>

            <TextInput
              style={styles.inputField}
              placeholder="Tell me how you're feeling..."
              placeholderTextColor={Colors.outlineVariant}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={400}
            />

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.micButton}
                onPress={() => triggerToast('Voice input coming soon', 'info')}
                activeOpacity={0.7}>
                <Ionicons name="mic" size={18} color={Colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  !inputText.trim() && styles.sendButtonDisabled,
                ]}
                onPress={() => handleSend()}
                disabled={!inputText.trim() || isSending}
                activeOpacity={0.85}>
                <Ionicons name="send" size={16} color={Colors.onPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}


// =============================================================================
// DOCTOR CHAT SCREEN
// =============================================================================

function DoctorChatScreen() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<DoctorChatPatient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<DoctorChatPatient | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<DoctorChatMessage[]>([]);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [showToast, setShowToast] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
  };

  // Fetch assigned patients
  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    setIsLoadingPatients(true);
    try {
      const res = await api.doctorChat.getPatients();
      if (res.success && res.data) {
        setPatients(res.data.patients || []);
      } else {
        triggerToast(res.message || 'Failed to load patients', 'error');
      }
    } catch (err: any) {
      triggerToast('Unable to load patients. Please check your connection.', 'error');
    } finally {
      setIsLoadingPatients(false);
    }
  };

  const handleSelectPatient = (patient: DoctorChatPatient) => {
    setSelectedPatient(patient);
    setMessages([]);
    setInputText('');
  };

  const handleBackToPatients = () => {
    setSelectedPatient(null);
    setMessages([]);
    setInputText('');
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending || !selectedPatient) return;

    setInputText('');

    const userMessage: DoctorChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      // Build conversation history for multi-turn context (only include successful turns)
      const conversationHistory = messages
        .filter((msg) => !msg.content.startsWith('⚠️'))
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const res = await api.doctorChat.queryPatient(
        selectedPatient.patientId,
        text,
        conversationHistory
      );

      if (res.success && res.data) {
        const assistantMessage: DoctorChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: res.data.response,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const errorMsg = res.message || 'Could not process your query. Please try again.';
        triggerToast(errorMsg, 'error');
        const errorMessage: DoctorChatMessage = {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${errorMsg}`,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (err: any) {
      const errorMsg = 'Unable to send query. Please check your connection and try again.';
      triggerToast(errorMsg, 'error');
      const errorMessage: DoctorChatMessage = {
        id: `ai-err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${errorMsg}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
  }, [messages, isSending]);

  // Helper to get event type icon
  const getEventTypeIcon = (eventType: string): string => {
    switch (eventType) {
      case 'SYMPTOM': return 'fitness-outline';
      case 'MEDICATION': return 'medical-outline';
      case 'VITAL': return 'heart-outline';
      case 'DIAGNOSIS': return 'analytics-outline';
      case 'CONSULTATION': return 'people-outline';
      default: return 'document-text-outline';
    }
  };

  const getEventTypeColor = (eventType: string): string => {
    switch (eventType) {
      case 'SYMPTOM': return '#E85D3A';
      case 'MEDICATION': return '#0a6859';
      case 'VITAL': return '#B44ACE';
      case 'DIAGNOSIS': return '#2D7DD2';
      case 'CONSULTATION': return '#8B6914';
      default: return Colors.onSurfaceVariant;
    }
  };

  // ---- Patient Cards View ----
  if (!selectedPatient) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Toast
          visible={showToast}
          message={toastMessage}
          type={toastType}
          onDismiss={() => setShowToast(false)}
        />

        {/* Doctor Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Patients</Text>
          <View style={styles.dateRow}>
            <Ionicons name="people-outline" size={15} color={Colors.onSurfaceVariant} />
            <Text style={styles.dateText}>
              {patients.length} active patient{patients.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {isLoadingPatients ? (
          <View style={docStyles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={docStyles.loadingText}>Loading patients...</Text>
          </View>
        ) : patients.length === 0 ? (
          <View style={docStyles.emptyContainer}>
            <View style={docStyles.emptyIconCircle}>
              <Ionicons name="people-outline" size={48} color={Colors.outlineVariant} />
            </View>
            <Text style={docStyles.emptyTitle}>No Patients Assigned</Text>
            <Text style={docStyles.emptySubtitle}>
              You don't have any active patients assigned to you yet. Patients will appear here once they are linked to your profile.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={docStyles.patientListScroll}
            contentContainerStyle={docStyles.patientListContent}
            showsVerticalScrollIndicator={false}>
            {patients.map((patient) => (
              <TouchableOpacity
                key={patient.patientId}
                style={docStyles.patientCard}
                onPress={() => handleSelectPatient(patient)}
                activeOpacity={0.7}>
                {/* Patient Avatar & Name */}
                <View style={docStyles.patientCardHeader}>
                  <View style={docStyles.patientAvatar}>
                    <Text style={docStyles.patientAvatarText}>
                      {patient.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </Text>
                  </View>
                  <View style={docStyles.patientInfo}>
                    <Text style={docStyles.patientName}>{patient.fullName}</Text>
                    <Text style={docStyles.patientMeta}>
                      Assigned {new Date(patient.assignedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={docStyles.arrowIcon}>
                    <Ionicons name="chatbubbles-outline" size={20} color={Colors.primary} />
                  </View>
                </View>

                {/* Stats Row */}
                <View style={docStyles.statsRow}>
                  <View style={docStyles.statItem}>
                    <Ionicons name="document-text-outline" size={14} color={Colors.primary} />
                    <Text style={docStyles.statText}>
                      {patient.eventCount} health event{patient.eventCount !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  {patient.medicationCount !== undefined && patient.medicationCount > 0 && (
                    <View style={docStyles.statItem}>
                      <Ionicons name="medical-outline" size={14} color="#0a6859" />
                      <Text style={docStyles.statText}>
                        {patient.medicationCount} medication{patient.medicationCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}

                  {patient.lastEvent && (
                    <View style={docStyles.statItem}>
                      <Ionicons
                        name={getEventTypeIcon(patient.lastEvent.eventType) as any}
                        size={14}
                        color={getEventTypeColor(patient.lastEvent.eventType)}
                      />
                      <Text style={docStyles.statText} numberOfLines={1}>
                        {patient.lastEvent.title || patient.lastEvent.eventType}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Last Event Badge */}
                {patient.lastEvent && (
                  <View style={docStyles.lastEventBadge}>
                    <Text style={docStyles.lastEventLabel}>Latest: </Text>
                    <Text style={docStyles.lastEventValue} numberOfLines={1}>
                      {patient.lastEvent.title || 'Health event'} — {
                        new Date(patient.lastEvent.eventDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      }
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // ---- Doctor Chat with Selected Patient ----
  const renderDoctorMessage = ({ item }: { item: DoctorChatMessage }) => {
    if (item.role === 'user') {
      return (
        <View style={styles.patientMessageContainer}>
          <View style={[styles.patientBubble, docStyles.doctorBubble]}>
            <Text style={styles.patientText}>{item.content}</Text>
          </View>
          <Text style={styles.timestampText}>{formatEventDateTime(item.createdAt)}</Text>
        </View>
      );
    }

    // AI assistant response
    return (
      <View style={styles.aiMessageContainer}>
        <View style={styles.aiRow}>
          <View style={[styles.aiAvatar, docStyles.aiDoctorAvatar]}>
            <Ionicons name="analytics" size={16} color={Colors.primary} />
          </View>
          <View style={styles.aiContentCol}>
            <View style={styles.aiBubble}>
              <Text style={styles.aiText}>{item.content}</Text>
            </View>
            <Text style={styles.timestampText}>{formatEventDateTime(item.createdAt)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const DOCTOR_WELCOME: DoctorChatMessage = {
    id: 'welcome-doc',
    role: 'assistant',
    content: `I have access to ${selectedPatient.fullName}'s complete health records. You can ask me questions like:\n\n• "What symptoms has this patient reported in the last month?"\n• "Show me all medications this patient is taking"\n• "What vitals were recorded?"\n• "Give me a summary of this patient's health history"`,
    createdAt: new Date().toISOString(),
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast
        visible={showToast}
        message={toastMessage}
        type={toastType}
        onDismiss={() => setShowToast(false)}
      />

      {/* Doctor Chat Header with Back Button */}
      <View style={[styles.header, docStyles.chatHeader]}>
        <TouchableOpacity
          style={docStyles.backButton}
          onPress={handleBackToPatients}
          activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <View style={docStyles.chatHeaderInfo}>
          <View style={docStyles.chatPatientAvatar}>
            <Text style={docStyles.chatPatientAvatarText}>
              {selectedPatient.fullName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </Text>
          </View>
          <View>
            <Text style={docStyles.chatPatientName}>{selectedPatient.fullName}</Text>
            <Text style={docStyles.chatPatientSub}>
              {selectedPatient.eventCount} health events recorded{selectedPatient.medicationCount !== undefined && selectedPatient.medicationCount > 0 ? ` • ${selectedPatient.medicationCount} active meds` : ''}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={styles.keyboardContainer}>
        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderDoctorMessage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.aiMessageContainer}>
              <View style={styles.aiRow}>
                <View style={[styles.aiAvatar, docStyles.aiDoctorAvatar]}>
                  <Ionicons name="analytics" size={16} color={Colors.primary} />
                </View>
                <View style={styles.aiContentCol}>
                  <View style={styles.aiBubble}>
                    <Text style={styles.aiText}>{DOCTOR_WELCOME.content}</Text>
                  </View>

                  {/* Quick suggestion chips for the doctor */}
                  <View style={styles.suggestionRow}>
                    <TouchableOpacity
                      style={styles.suggestionChip}
                      onPress={() => {
                        handleSend('What symptoms has this patient reported?');
                      }}
                      activeOpacity={0.7}>
                      <Text style={styles.suggestionText}>View symptoms</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.suggestionChip}
                      onPress={() => {
                        handleSend('Give me a full health summary');
                      }}
                      activeOpacity={0.7}>
                      <Text style={styles.suggestionText}>Health summary</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.suggestionChip}
                      onPress={() => {
                        handleSend('What medications is this patient on?');
                      }}
                      activeOpacity={0.7}>
                      <Text style={styles.suggestionText}>Medications</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.timestampText}>{formatEventDateTime(DOCTOR_WELCOME.createdAt)}</Text>
                </View>
              </View>
            </View>
          }
          ListFooterComponent={
            isSending ? (
              <View style={styles.typingIndicator}>
                <View style={[styles.aiAvatar, docStyles.aiDoctorAvatar]}>
                  <Ionicons name="analytics" size={16} color={Colors.primary} />
                </View>
                <View style={styles.typingBubble}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.typingText}>Reviewing patient records...</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* Floating Input Bar */}
        <View style={styles.inputBarContainer}>
          <View style={styles.inputBar}>
            <TextInput
              style={[styles.inputField, { paddingLeft: Spacing.three }]}
              placeholder={`Ask about ${selectedPatient.fullName}'s health...`}
              placeholderTextColor={Colors.outlineVariant}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
            />

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  !inputText.trim() && styles.sendButtonDisabled,
                ]}
                onPress={() => handleSend()}
                disabled={!inputText.trim() || isSending}
                activeOpacity={0.85}>
                <Ionicons name="send" size={16} color={Colors.onPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}


// =============================================================================
// MAIN EXPORT — routes to correct screen based on user role
// =============================================================================

export default function SymptomChatScreen() {
  const { user } = useAuth();

  // If the user is a doctor, show the doctor chat interface
  if (user?.role === 'DOCTOR') {
    return <DoctorChatScreen />;
  }

  // Default: patient chat (existing behavior)
  return <PatientChatScreen />;
}


// =============================================================================
// STYLES — Patient Chat (original styles preserved exactly)
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    backgroundColor: 'rgba(251, 249, 245, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerHigh,
    gap: 4,
  },
  headerTitle: {
    ...Typography.headlineMedium,
    color: Colors.primary,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dateText: {
    ...Typography.labelMedium,
    color: Colors.onSurfaceVariant,
    fontSize: 13,
  },
  keyboardContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: 110,
    gap: Spacing.four,
  },
  patientMessageContainer: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    alignItems: 'flex-end',
    gap: 4,
  },
  patientBubble: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    borderTopRightRadius: 4,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    ...Shadows.soft,
  },
  patientText: {
    ...Typography.bodyLarge,
    color: Colors.onPrimary,
  },
  aiMessageContainer: {
    width: '88%',
    alignSelf: 'flex-start',
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(10, 104, 89, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  aiContentCol: {
    flex: 1,
    gap: Spacing.two,
  },
  aiBubble: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    borderTopLeftRadius: 4,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.surfaceContainerHigh,
    ...Shadows.card,
  },
  aiText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    color: '#1b1c1a',
  },
  bentoCard: {
    backgroundColor: Colors.softTealBg,
    borderRadius: 16,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(163, 242, 222, 0.6)',
    ...Shadows.soft,
  },
  bentoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  bentoHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  bentoTitle: {
    ...Typography.labelMedium,
    color: Colors.onPrimaryFixedVariant,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  primaryChip: {
    backgroundColor: Colors.primaryFixed,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  primaryChipText: {
    ...Typography.caption,
    color: Colors.onPrimaryFixedVariant,
    fontWeight: '600',
  },
  secondaryChip: {
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  secondaryChipText: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: 2,
  },
  suggestionChip: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  suggestionText: {
    ...Typography.labelMedium,
    color: Colors.primary,
    fontSize: 12,
  },
  timestampText: {
    ...Typography.caption,
    color: Colors.outline,
    fontSize: 11,
    marginTop: 2,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceContainerHigh,
  },
  typingText: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
  },
  inputBarContainer: {
    position: 'absolute',
    bottom: Spacing.four,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.four,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 9999,
    paddingVertical: 6,
    paddingHorizontal: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.surfaceContainerHigh,
    ...Shadows.floating,
  },
  attachButton: {
    padding: 6,
  },
  inputField: {
    flex: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    maxHeight: 80,
    ...Typography.bodyLarge,
    color: Colors.onSurface,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(10, 104, 89, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.soft,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.outlineVariant,
  },
});


// =============================================================================
// STYLES — Doctor Chat (additional styles)
// =============================================================================

const docStyles = StyleSheet.create({
  // Loading & Empty states
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  loadingText: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.six,
    gap: Spacing.three,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  emptyTitle: {
    ...Typography.headlineMedium,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.bodyMedium,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Patient List
  patientListScroll: {
    flex: 1,
  },
  patientListContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },

  // Patient Card
  patientCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    borderWidth: 1,
    borderColor: Colors.surfaceContainerHigh,
    ...Shadows.card,
    gap: Spacing.three,
  },
  patientCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  patientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientAvatarText: {
    ...Typography.labelMedium,
    color: Colors.onPrimaryFixedVariant,
    fontWeight: '700',
    fontSize: 16,
  },
  patientInfo: {
    flex: 1,
    gap: 2,
  },
  patientName: {
    ...Typography.headlineMedium,
    color: Colors.onSurface,
    fontSize: 17,
    fontWeight: '700',
  },
  patientMeta: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
    fontSize: 12,
  },
  arrowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10, 104, 89, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  statText: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
    fontSize: 12,
  },
  lastEventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.softTealBg,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: 12,
  },
  lastEventLabel: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  lastEventValue: {
    ...Typography.caption,
    color: Colors.onPrimaryFixedVariant,
    fontSize: 11,
    flex: 1,
  },

  // Doctor Chat Header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(10, 104, 89, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chatPatientAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatPatientAvatarText: {
    ...Typography.caption,
    color: Colors.onPrimaryFixedVariant,
    fontWeight: '700',
    fontSize: 13,
  },
  chatPatientName: {
    ...Typography.labelMedium,
    color: Colors.onSurface,
    fontWeight: '700',
    fontSize: 15,
  },
  chatPatientSub: {
    ...Typography.caption,
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },

  // Doctor-specific bubble override
  doctorBubble: {
    backgroundColor: '#2D7DD2',
  },
  aiDoctorAvatar: {
    backgroundColor: 'rgba(10, 104, 89, 0.15)',
  },
});
