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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadows } from '@/constants/theme';
import { api, ChatMessage, TimelineEvent } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { formatHeaderDate, formatEventDateTime } from '@/utils/dateFormatter';
import { Toast } from '@/components/Toast';

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

export default function SymptomChatScreen() {
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
