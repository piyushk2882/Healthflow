import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { supabaseAdmin } from "../config/supabaseAdmin";
import { extractHealthInformation, normalizeTextForComparison } from "../services/ai/ai.service";
import { ExistingHealthEvent, ChatHistoryItem } from "../services/ai/ai.types";

async function getPatientByUserId(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("patients")
        .select("id")
        .eq("profile_id", userId)
        .single();

    if (error || !data) {
        throw new Error("Patient record not found");
    }

    return data;
}


/**
 * Backend duplicate prevention layer.
 *
 * When the AI says CREATE, this function checks whether the proposed event
 * is a near-duplicate of an already-existing event by comparing normalized
 * titles and entity values.
 *
 * Returns the matching existing event if found, or null if the event is genuinely new.
 */
function findDuplicateEvent(
    proposedTitle: string | null,
    proposedEntities: Array<{ entityType: string; entityValue: string }>,
    existingEvents: ExistingHealthEvent[]
): ExistingHealthEvent | null {
    if (!proposedTitle && proposedEntities.length === 0) {
        return null;
    }

    const normalizedProposedTitle = proposedTitle
        ? normalizeTextForComparison(proposedTitle)
        : null;

    // Gather normalized proposed entity values (only health-relevant types)
    const healthEntityTypes = new Set([
        "SYMPTOM", "MEDICATION", "CONDITION", "VITAL", "BODY_PART",
    ]);
    const normalizedProposedEntities = proposedEntities
        .filter((e) => healthEntityTypes.has(e.entityType))
        .map((e) => normalizeTextForComparison(e.entityValue));

    /**
     * Checks if two normalized strings match via exact equality OR
     * substring containment (e.g. "rash" matches "skin rash").
     * Both strings must be at least 3 characters to avoid false positives.
     */
    const containsMatch = (a: string, b: string): boolean => {
        if (a === b) return true;
        if (a.length < 3 || b.length < 3) return false;
        // Check if either string contains the other (handles "rash" ↔ "skin rash")
        return a.includes(b) || b.includes(a);
    };

    for (const existingEvent of existingEvents) {
        const normalizedExistingTitle = existingEvent.title
            ? normalizeTextForComparison(existingEvent.title)
            : null;

        // 1. Title-to-title match (exact or containment)
        if (
            normalizedProposedTitle &&
            normalizedExistingTitle &&
            containsMatch(normalizedProposedTitle, normalizedExistingTitle)
        ) {
            return existingEvent;
        }

        // 2. Proposed title matches an existing entity value
        if (normalizedProposedTitle && existingEvent.health_event_entities) {
            for (const entity of existingEvent.health_event_entities) {
                if (
                    containsMatch(
                        normalizeTextForComparison(entity.entity_value),
                        normalizedProposedTitle
                    )
                ) {
                    return existingEvent;
                }
            }
        }

        // 3. Proposed entity values match existing title
        if (normalizedExistingTitle) {
            for (const normalizedEntity of normalizedProposedEntities) {
                if (containsMatch(normalizedEntity, normalizedExistingTitle)) {
                    return existingEvent;
                }
            }
        }

        // 4. Entity-to-entity match (same type and normalized value)
        if (existingEvent.health_event_entities) {
            for (const proposedEntity of proposedEntities) {
                if (!healthEntityTypes.has(proposedEntity.entityType)) {
                    continue;
                }
                const normalizedProposed = normalizeTextForComparison(
                    proposedEntity.entityValue
                );
                for (const existingEntity of existingEvent.health_event_entities) {
                    if (
                        existingEntity.entity_type === proposedEntity.entityType &&
                        containsMatch(
                            normalizeTextForComparison(existingEntity.entity_value),
                            normalizedProposed
                        )
                    ) {
                        return existingEvent;
                    }
                }
            }
        }
    }

    return null;
}


/**
 * Temporal and progression keywords that indicate the patient is providing
 * additional health-related context about an existing event.
 */
const HEALTH_PROGRESSION_KEYWORDS = [
    "started", "worse", "better", "improving", "still", "getting",
    "yesterday", "today", "ago", "since", "morning", "evening",
    "night", "last", "week", "severe", "mild", "increased",
    "decreased", "stopped", "continued", "frequent", "pain",
    "hurts", "hurting", "aching", "throbbing", "burning",
    "spreading", "recurring", "constant", "intermittent",
    "worsening", "subsided", "relieved",
];

/**
 * Common non-health phrases that should NOT trigger an implicit event match.
 * Prevents converting greetings / acknowledgments to UPDATE.
 */
const NON_HEALTH_PHRASES = [
    "thanks", "thank you", "ok", "okay", "bye", "hello", "hi",
    "good morning", "good evening", "good night", "fine",
    "no", "yes", "sure", "alright", "great", "cool",
];

/**
 * Backend safeguard for NONE → UPDATE conversion.
 *
 * When the AI classifies a message as NONE (not health-relevant) but the
 * message text actually references an existing health event, this function
 * detects the implicit reference and returns the matched event.
 *
 * Two detection paths:
 * 1. DIRECT MATCH: The message text contains an existing event title or entity value.
 * 2. CONTEXTUAL MATCH: The message contains temporal/progression keywords AND
 *    there is exactly one recently-discussed event (unambiguous context).
 *
 * Returns null for messages that are genuinely non-health (greetings, thanks, etc.).
 */
function detectImplicitEventReference(
    messageText: string,
    existingEvents: ExistingHealthEvent[],
    recentHistory: ChatHistoryItem[]
): ExistingHealthEvent | null {
    if (existingEvents.length === 0) {
        return null;
    }

    const lowerMessage = messageText.toLowerCase().trim();

    // Reject if the message is a known non-health phrase
    if (NON_HEALTH_PHRASES.includes(lowerMessage)) {
        return null;
    }
    // Also reject very short messages that are likely acknowledgments
    if (lowerMessage.length <= 3) {
        return null;
    }

    const normalizedMessage = normalizeTextForComparison(messageText);
    const messageWords = lowerMessage.split(/\s+/);

    // ----- PATH 1: Direct title / entity keyword match -----
    for (const event of existingEvents) {
        // Check if message contains the event title
        if (event.title) {
            const normalizedTitle = normalizeTextForComparison(event.title);
            if (
                normalizedMessage.includes(normalizedTitle) ||
                lowerMessage.includes(event.title.toLowerCase())
            ) {
                return event;
            }
        }

        // Check if message contains any entity values from this event
        if (event.health_event_entities) {
            for (const entity of event.health_event_entities) {
                const normalizedEntityVal = normalizeTextForComparison(entity.entity_value);
                if (
                    normalizedEntityVal.length > 2 &&
                    (
                        normalizedMessage.includes(normalizedEntityVal) ||
                        lowerMessage.includes(entity.entity_value.toLowerCase())
                    )
                ) {
                    return event;
                }
            }
        }
    }

    // ----- PATH 2: Temporal/progression keyword + unambiguous context -----
    const hasProgressionKeyword = messageWords.some((word) =>
        HEALTH_PROGRESSION_KEYWORDS.includes(word)
    );

    if (hasProgressionKeyword) {
        // If there's exactly one existing event, it's unambiguous
        if (existingEvents.length === 1) {
            return existingEvents[0];
        }

        // If multiple events exist, find the most recently discussed one
        // by checking the last patient message that was linked to a health event
        const lastHealthMessage = [...recentHistory]
            .reverse()
            .find((msg) => msg.sender === "PATIENT" && msg.message !== messageText);

        if (lastHealthMessage) {
            // Try to match the last discussed event
            const lastMsgNormalized = normalizeTextForComparison(lastHealthMessage.message);
            for (const event of existingEvents) {
                if (event.title) {
                    const normalizedTitle = normalizeTextForComparison(event.title);
                    if (lastMsgNormalized.includes(normalizedTitle)) {
                        return event;
                    }
                }
            }
        }

        // If we still can't determine which event, check if any pronoun
        // references are present ("it", "this", "that") with a single recent event
        const hasPronouns = /\b(it|this|that)\b/i.test(lowerMessage);
        if (hasPronouns && existingEvents.length >= 1) {
            // Return the most recently created/discussed event (last in the list
            // since events are fetched by their message order)
            return existingEvents[existingEvents.length - 1];
        }
    }

    // ----- PATH 3: Pronoun-only references with health context -----
    // e.g., "it started yesterday", "it's getting worse"
    const pronounWithContext = /\b(it|its|it's|this|that)\b/i.test(lowerMessage) &&
        messageWords.length > 2; // More than just "it" alone

    if (pronounWithContext && existingEvents.length === 1) {
        return existingEvents[0];
    }

    return null;
}



export async function sendChatMessage(
    req: AuthRequest,
    res: Response
) {
    try {
        const { message, conversationId } = req.body;

        // ----------------------------------------
        // 1. Validate input
        // ----------------------------------------

        if (!message || typeof message !== "string") {
            return res.status(400).json({
                success: false,
                message: "message is required",
            });
        }

        const trimmedMessage = message.trim();

        if (!trimmedMessage) {
            return res.status(400).json({
                success: false,
                message: "message cannot be empty",
            });
        }


        // ----------------------------------------
        // 2. Get patient
        // ----------------------------------------

        const patient = await getPatientByUserId(req.user!.id);


        // ----------------------------------------
        // 3. Get or create conversation
        // ----------------------------------------

        let activeConversationId = conversationId;

        if (conversationId) {
            const { data: conversation, error } = await supabaseAdmin
                .from("chat_conversations")
                .select("id")
                .eq("id", conversationId)
                .eq("patient_id", patient.id)
                .single();

            if (error || !conversation) {
                return res.status(404).json({
                    success: false,
                    message: "Conversation not found",
                });
            }

        } else {
            const { data: conversation, error } = await supabaseAdmin
                .from("chat_conversations")
                .insert({
                    patient_id: patient.id,
                    title: trimmedMessage.substring(0, 80),
                })
                .select("id")
                .single();

            if (error || !conversation) {
                throw new Error(
                    error?.message || "Failed to create conversation"
                );
            }

            activeConversationId = conversation.id;
        }

        const { data: previousMessages, error: historyError } =
            await supabaseAdmin
                .from("chat_messages")
                .select("id, sender, message, health_event_id, created_at")
                .eq("conversation_id", activeConversationId)
                .order("created_at", {
                    ascending: true,
                })
                .limit(50);

        if (historyError) {
            throw new Error(historyError.message);
        }

        // Get health events already associated with this conversation
        const eventIds = Array.from(
            new Set(
                (previousMessages || [])
                    .map((msg: any) => msg.health_event_id)
                    .filter((id: any): id is string => typeof id === "string" && id.length > 0)
            )
        );

        let existingEvents: ExistingHealthEvent[] = [];

        // DEBUG: trace event resolution pipeline
        console.log(`[DEBUG] Previous messages count: ${(previousMessages || []).length}`);
        console.log(`[DEBUG] Messages with health_event_id: ${(previousMessages || []).filter((m: any) => m.health_event_id).length}`);
        console.log(`[DEBUG] Unique event IDs found: ${eventIds.length}`, eventIds);

        if (eventIds.length > 0) {
            const { data: events, error: eventsError } = await supabaseAdmin
                .from("health_events")
                .select(`
                    id,
                    event_type,
                    title,
                    description,
                    event_date,
                    source,
                    health_event_entities (
                        entity_type,
                        entity_value,
                        metadata
                    )
                `)
                .eq("patient_id", patient.id)
                .in("id", eventIds);

            if (eventsError) {
                console.error("Error fetching existing health events:", eventsError);
            } else {
                existingEvents = (events as unknown as ExistingHealthEvent[]) || [];
            }
        }

        // DEBUG: what existing events are available to the AI and duplicate detection
        console.log(`[DEBUG] Existing events passed to AI: ${existingEvents.length}`);
        existingEvents.forEach((e, i) => {
            console.log(`[DEBUG]   Event ${i + 1}: "${e.title}" (ID: ${e.id}, type: ${e.event_type})`);
        });


        // ----------------------------------------
        // 4. Save patient's original message
        // ----------------------------------------

        const { data: patientMessage, error: messageError } =
            await supabaseAdmin
                .from("chat_messages")
                .insert({
                    conversation_id: activeConversationId,
                    sender: "PATIENT",
                    message: trimmedMessage,
                })
                .select("*")
                .single();

        if (messageError || !patientMessage) {
            throw new Error(
                messageError?.message || "Failed to save message"
            );
        }


        // ----------------------------------------
        // 5. Send message to AI
        // ----------------------------------------

        const historyForAi: ChatHistoryItem[] = (previousMessages || []).map((msg: any) => ({
            sender: msg.sender === "AI" ? "AI" : "PATIENT",
            message: msg.message,
        }));

        const extraction =
            await extractHealthInformation(
                trimmedMessage,
                historyForAi,
                existingEvents
            );

        // DEBUG: what did the AI return?
        console.log(`[DEBUG] AI extraction result: action=${extraction.action}, title="${extraction.title}", targetEventId=${extraction.targetEventId}`);


        // ----------------------------------------
        // 6. Backend duplicate prevention & validation
        // ----------------------------------------

        // 6a. If AI says CREATE, check for near-duplicate existing events
        if (extraction.action === "CREATE" && existingEvents.length > 0) {
            console.log(`[DEBUG] Running duplicate detection: proposed title="${extraction.title}" against ${existingEvents.length} existing events`);
            const duplicate = findDuplicateEvent(
                extraction.title,
                extraction.entities.map((e) => ({
                    entityType: e.entityType,
                    entityValue: e.entityValue,
                })),
                existingEvents
            );

            if (duplicate) {
                console.log(
                    `Backend duplicate prevention: Converting CREATE to UPDATE. ` +
                    `Proposed title "${extraction.title}" matches existing event "${duplicate.title}" (ID: ${duplicate.id})`
                );
                extraction.action = "UPDATE";
                extraction.targetEventId = duplicate.id;
                extraction.targetEvent = duplicate.title;
                // Use the existing event's canonical title
                extraction.title = duplicate.title;
            } else {
                console.log(`[DEBUG] No duplicate found for "${extraction.title}"`);
            }
        } else if (extraction.action === "CREATE") {
            console.log(`[DEBUG] Skipping duplicate detection: existingEvents is empty`);
        }

        // 6b. If AI says NONE but message implicitly references an existing event,
        //     convert to UPDATE (backend safeguard for unreliable AI models).
        if (extraction.action === "NONE" && existingEvents.length > 0) {
            const implicitTarget = detectImplicitEventReference(
                trimmedMessage,
                existingEvents,
                historyForAi
            );

            if (implicitTarget) {
                console.log(
                    `Backend implicit reference detection: Converting NONE to UPDATE. ` +
                    `Message "${trimmedMessage}" implicitly references existing event "${implicitTarget.title}" (ID: ${implicitTarget.id})`
                );
                extraction.action = "UPDATE";
                extraction.isHealthRelevant = true;
                extraction.targetEventId = implicitTarget.id;
                extraction.targetEvent = implicitTarget.title;
                extraction.title = implicitTarget.title;
                extraction.eventType = (implicitTarget.event_type as any) || "SYMPTOM";

                // Generate a description from the original message
                extraction.description =
                    `Patient reports: ${trimmedMessage}`;

                // Generate a proper assistant response
                extraction.assistantResponse =
                    `I've updated your ${implicitTarget.title?.toLowerCase() || "health event"} record.`;
            }
        }

        // 6c. If AI says UPDATE, enforce title stability
        if (extraction.action === "UPDATE" && extraction.targetEventId) {
            const targetEvent = existingEvents.find(
                (e) => e.id === extraction.targetEventId
            );
            if (targetEvent && targetEvent.title) {
                // Always preserve the existing canonical title
                extraction.title = targetEvent.title;
            }
        }


        // ----------------------------------------
        // 7. Handle health event based on action
        // ----------------------------------------

        let healthEvent: any = null;

        if (extraction.action === "CREATE") {
            const { data, error } =
                await supabaseAdmin
                    .from("health_events")
                    .insert({
                        patient_id: patient.id,
                        event_type: extraction.eventType,
                        title: extraction.title,
                        description: extraction.description || null,
                        event_date: extraction.eventDate
                            ? extraction.eventDate
                            : new Date().toISOString(),
                        source: "AI_CHAT",
                    })
                    .select("*")
                    .single();

            if (error || !data) {
                throw new Error(
                    error?.message ||
                    "Failed to create health event"
                );
            }

            healthEvent = data;

            // Save extracted entities
            if (
                extraction.entities &&
                extraction.entities.length > 0
            ) {
                const entities = extraction.entities.map((entity) => ({
                    health_event_id: healthEvent.id,
                    entity_type: entity.entityType,
                    entity_value: entity.entityValue,
                    metadata: entity.metadata || {},
                }));

                const { error: entityError } =
                    await supabaseAdmin
                        .from("health_event_entities")
                        .insert(entities);

                if (entityError) {
                    throw new Error(entityError.message);
                }
            }
        } else if (extraction.action === "UPDATE") {
            // UPDATE must target an existing event.
            // Never create a new event as a fallback for UPDATE.

            if (!extraction.targetEventId) {
                console.warn(
                    "UPDATE requested but AI did not provide a targetEventId."
                );
                healthEvent = null;
                extraction.assistantResponse =
                    "Could you please clarify which symptom or health event you are referring to?";
            } else {
                // Make sure the target event belongs to the current patient
                // and is one of the events available in this conversation.
                const targetEvent = existingEvents.find(
                    (event) => event.id === extraction.targetEventId
                );

                if (!targetEvent) {
                    console.warn(
                        "AI selected an invalid or unrelated targetEventId:",
                        extraction.targetEventId
                    );
                    healthEvent = null;
                    extraction.assistantResponse =
                        "Could you please clarify which symptom or health event you are referring to?";
                } else {
                    const updateData: Record<string, any> = {};

                    if (extraction.description) {
                        updateData.description = extraction.description;
                    }

                    if (extraction.eventDate) {
                        updateData.event_date = extraction.eventDate;
                    }

                    // Only update fields that were actually extracted.
                    // NEVER update the title — it must remain stable.
                    if (Object.keys(updateData).length > 0) {
                        const { data: updatedEvent, error: updateError } =
                            await supabaseAdmin
                                .from("health_events")
                                .update(updateData)
                                .eq("id", targetEvent.id)
                                .eq("patient_id", patient.id)
                                .select()
                                .single();

                        if (updateError) {
                            console.error(
                                "Error updating health event:",
                                updateError
                            );
                            healthEvent = targetEvent;
                        } else {
                            healthEvent = updatedEvent;
                        }
                    } else {
                        // The event was identified, but there was nothing new
                        // to update in the structured event.
                        healthEvent = targetEvent;
                    }

                    // Add newly extracted entities to the existing event.
                    if (
                        healthEvent &&
                        extraction.entities &&
                        extraction.entities.length > 0
                    ) {
                        const entityRows = extraction.entities.map((entity) => ({
                            health_event_id: healthEvent.id,
                            entity_type: entity.entityType,
                            entity_value: entity.entityValue,
                            metadata: entity.metadata || {},
                        }));

                        const { error: entityError } = await supabaseAdmin
                            .from("health_event_entities")
                            .insert(entityRows);

                        if (entityError) {
                            console.error(
                                "Error inserting updated event entities:",
                                entityError
                            );
                        }
                    }
                }
            }
        }
        // When extraction.action === "NONE", healthEvent remains null


        // ----------------------------------------
        // 7b. Link patient message to health event
        // ----------------------------------------

        if (healthEvent) {
            const { error: linkMessageError } = await supabaseAdmin
                .from("chat_messages")
                .update({
                    health_event_id: healthEvent.id,
                })
                .eq("id", patientMessage.id);

            if (linkMessageError) {
                console.error(
                    "Error linking patient message to health event:",
                    linkMessageError
                );
            } else {
                patientMessage.health_event_id = healthEvent.id;
            }
        }



        // ----------------------------------------
        // 8. AI acknowledgement
        // ----------------------------------------

        const assistantMessage = extraction.assistantResponse;


        // ----------------------------------------
        // 9. Save AI message
        // ----------------------------------------

        const { data: aiMessage, error: aiMessageError } =
            await supabaseAdmin
                .from("chat_messages")
                .insert({
                    conversation_id: activeConversationId,
                    sender: "AI",
                    message: assistantMessage,
                    health_event_id: healthEvent?.id || null,
                })
                .select("*")
                .single();

        if (aiMessageError || !aiMessage) {
            throw new Error(
                aiMessageError?.message ||
                "Failed to save AI message"
            );
        }


        // ----------------------------------------
        // 10. Update conversation timestamp
        // ----------------------------------------

        await supabaseAdmin
            .from("chat_conversations")
            .update({
                updated_at: new Date().toISOString(),
            })
            .eq("id", activeConversationId);


        // ----------------------------------------
        // 11. Return response
        // ----------------------------------------

        return res.status(200).json({
            success: true,

            data: {
                conversationId: activeConversationId,

                patientMessage,

                aiMessage,

                healthEvent,

                extraction,
            },
        });

    } catch (error) {

        console.error("Chat message error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to process chat message",
        });
    }
}