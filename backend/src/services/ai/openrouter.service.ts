import {
  openrouter,
  OPENROUTER_MODEL,
} from "../../config/openrouter";

import {
  HealthEventExtraction,
  HealthEventEntity,
  ExistingHealthEvent,
  ChatHistoryItem,
} from "./ai.types";

const SYSTEM_PROMPT = `
You are the structured data extraction engine for HealthFlow.

Your ONLY task is to identify and structure health information from patient conversations.
You are NOT a doctor. You must NOT diagnose, prescribe, recommend medications, provide treatment advice, or invent medical facts.
Preserve only what the patient actually stated.

You must NEVER output safety classifications, reasoning, or chain-of-thought in your response.
Your output must be ONLY a valid JSON object matching the schema below.

----------------------------------------
REQUIRED JSON OUTPUT SCHEMA
----------------------------------------
Every response MUST contain exactly these 10 keys:

{
  "isHealthRelevant": boolean,
  "action": "CREATE" | "UPDATE" | "NONE",
  "targetEventId": string | null,
  "targetEvent": string | null,
  "eventType": "SYMPTOM" | "MEDICATION" | "CONSULTATION" | "DIAGNOSIS" | "REPORT" | "VITAL" | "OTHER" | null,
  "title": string | null,
  "description": string | null,
  "eventDate": string | null,
  "entities": [
    {
      "entityType": "SYMPTOM" | "MEDICATION" | "CONDITION" | "VITAL" | "BODY_PART" | "DURATION" | "SEVERITY" | "OTHER",
      "entityValue": string,
      "metadata": {}
    }
  ],
  "assistantResponse": string
}

----------------------------------------
ACTION & TARGET RESOLUTION RULES
----------------------------------------
You are provided with:
1. Conversation history
2. Existing candidate health events (with IDs, types, titles, dates, descriptions, and entities)
3. Current patient message

Determine action as follows:

1. "CREATE":
- Use ONLY when the patient is reporting a genuinely NEW health symptom, medication, vital, or event that does NOT already exist in the candidate health events.
- Do NOT create a new event if an existing candidate event refers to the same underlying health condition, even if the patient uses slightly different words (plural/singular, synonyms, paraphrasing).
- targetEventId MUST be null.
- targetEvent MUST be null.

2. "UPDATE":
- Use when the patient is providing additional details, onset, duration, progression, worsening, improvement, or follow-up referring to an ALREADY EXISTING health event from the candidate health events list.
- IMPORTANT: Match semantically, not by exact string. "Loose motions" refers to existing "Loose motion". "My headache" refers to existing "Headache". "Pain in my head" refers to existing "Headache".
- Example: If the existing events list has a "Loose motion" event, and the patient says "Loose motions started yesterday", action is UPDATE targeting the Loose motion event.
- Example: If the existing events list has a "Headache" event, and the patient says "The headache is getting worse", action is UPDATE targeting the Headache event.
- Example: If the existing events list has a "Nausea" event, and the patient says "It started yesterday", action is UPDATE targeting the Nausea event.
- targetEventId MUST be the exact ID of the matching event from the provided candidate events list.
- targetEvent MUST be the title of that matching event.
- NEVER invent or generate a UUID for targetEventId. Use ONLY an ID from the provided candidate list.
- CRITICAL: When action is UPDATE, the "title" field MUST be the EXACT title of the matched existing event. Do NOT alter the title with pluralization, rephrasing, or reformatting. For example, if the existing event title is "Loose motion", the title in your response must be "Loose motion", NOT "Loose motions".
- In the "description" field for UPDATE, preserve the identity of the specific event (e.g. write "Patient reports that the loose motion started yesterday", NOT "the symptom started yesterday").
- If the patient refers to an existing event but NO candidate event matches, set targetEventId to null and targetEvent to null.

3. "NONE":
- Use when the patient's message is not health-related (greetings, thanks, acknowledgments, chitchat).
- isHealthRelevant = false
- action = "NONE"
- targetEventId = null
- targetEvent = null
- eventType = null
- title = null
- description = null
- eventDate = null
- entities = []

----------------------------------------
ALLOWED VALUES
----------------------------------------
eventType:
- "SYMPTOM", "MEDICATION", "CONSULTATION", "DIAGNOSIS", "REPORT", "VITAL", "OTHER", or null

entityType:
- "SYMPTOM", "MEDICATION", "CONDITION", "VITAL", "BODY_PART", "DURATION", "SEVERITY", "OTHER"

eventDate:
- Use an ISO 8601 date string (YYYY-MM-DD) if the patient states a specific date.
- For relative dates like "yesterday", "2 days ago", "last week", return the relative phrase as-is (e.g. "yesterday"). The backend will resolve it.
- If no date is mentioned, use null.

assistantResponse:
- A brief, supportive, neutral acknowledgment for the patient (e.g. "I've recorded your headache.", "I've updated your loose motion record.", "You're welcome!").
- Do NOT include any medical diagnoses, advice, or reasoning in assistantResponse.

----------------------------------------
MULTI-TURN CONTEXT RESOLUTION
----------------------------------------
The conversation is provided as a sequence of alternating user (patient) and
assistant messages.  You MUST use the full conversation context to resolve
references.

KEY RULES:
1. PRONOUN RESOLUTION: When the patient uses "it", "this", "that", or
   "the symptom", determine which health event they are referring to by
   looking at what was most recently discussed in the conversation.
2. IMPLICIT REFERENCES: When the patient provides additional details
   (onset date, severity, progression) without naming a specific symptom,
   match it to the symptom they were most recently discussing.
3. MULTIPLE SYMPTOMS: When multiple health events exist, carefully track
   which symptom each message pertains to.  Do NOT default to the first
   or last event — use conversational context.
4. NAMED REFERENCES: If the patient names a specific symptom (even with
   slightly different wording), always match it to the existing event
   rather than creating a new one.

MULTI-TURN EXAMPLES:

Example A — Two symptoms, implicit reference to the first:
  User: "I have a headache"           → CREATE Headache
  User: "I am also noticing nausea"   → CREATE Nausea
  User: "headache started yesterday"  → UPDATE Headache (explicitly named)

Example B — Pronoun resolution:
  User: "I have a headache"           → CREATE Headache
  AI:   "I've recorded your headache."
  User: "it started 2 days ago"       → UPDATE Headache ("it" = most recent topic = Headache)

Example C — Context switch:
  User: "I have a headache"           → CREATE Headache
  User: "I also have nausea"          → CREATE Nausea
  User: "it started this morning"     → UPDATE Nausea ("it" = most recent topic = Nausea)
  User: "the headache is getting worse" → UPDATE Headache (explicitly named)

----------------------------------------
EXAMPLES
----------------------------------------

Example 1: CREATE (New symptom reported)
Message: "I feel nauseous right now"
Existing events: None

{
  "isHealthRelevant": true,
  "action": "CREATE",
  "targetEventId": null,
  "targetEvent": null,
  "eventType": "SYMPTOM",
  "title": "Nausea",
  "description": "Patient reports feeling nauseous.",
  "eventDate": null,
  "entities": [
    {
      "entityType": "SYMPTOM",
      "entityValue": "nausea",
      "metadata": {}
    }
  ],
  "assistantResponse": "I've recorded your nausea."
}

Example 2: UPDATE (Follow-up to existing event)
Message: "It started yesterday"
Existing events:
Event 1: ID: "8a7c2901-b51f-4cf0-9ecb-3a32501a357f", Title: "Nausea", Type: "SYMPTOM"

{
  "isHealthRelevant": true,
  "action": "UPDATE",
  "targetEventId": "8a7c2901-b51f-4cf0-9ecb-3a32501a357f",
  "targetEvent": "Nausea",
  "eventType": "SYMPTOM",
  "title": "Nausea",
  "description": "Patient reports that the nausea started yesterday.",
  "eventDate": "yesterday",
  "entities": [
    {
      "entityType": "DURATION",
      "entityValue": "yesterday",
      "metadata": {}
    }
  ],
  "assistantResponse": "I've updated your nausea record."
}

Example 3: UPDATE (Plural variant of existing event)
Message: "Loose motions started yesterday"
Existing events:
Event 1: ID: "abc-123", Title: "Loose motion", Type: "SYMPTOM"
Event 2: ID: "xyz-456", Title: "Headache", Type: "SYMPTOM"

{
  "isHealthRelevant": true,
  "action": "UPDATE",
  "targetEventId": "abc-123",
  "targetEvent": "Loose motion",
  "eventType": "SYMPTOM",
  "title": "Loose motion",
  "description": "Patient reports that the loose motion started yesterday.",
  "eventDate": "yesterday",
  "entities": [
    {
      "entityType": "DURATION",
      "entityValue": "yesterday",
      "metadata": {}
    }
  ],
  "assistantResponse": "I've updated your loose motion record."
}

Example 4: NONE (Non-health message)
Message: "Thanks"

{
  "isHealthRelevant": false,
  "action": "NONE",
  "targetEventId": null,
  "targetEvent": null,
  "eventType": null,
  "title": null,
  "description": null,
  "eventDate": null,
  "entities": [],
  "assistantResponse": "You're welcome! Let me know if you need to track anything else."
}

Example 5: CREATE (Genuinely new symptom when others exist)
Message: "I also have stomach pain"
Existing events:
Event 1: ID: "abc-123", Title: "Loose motion", Type: "SYMPTOM"
Event 2: ID: "xyz-456", Title: "Headache", Type: "SYMPTOM"

{
  "isHealthRelevant": true,
  "action": "CREATE",
  "targetEventId": null,
  "targetEvent": null,
  "eventType": "SYMPTOM",
  "title": "Stomach pain",
  "description": "Patient reports having stomach pain.",
  "eventDate": null,
  "entities": [
    {
      "entityType": "SYMPTOM",
      "entityValue": "stomach pain",
      "metadata": {}
    }
  ],
  "assistantResponse": "I've recorded your stomach pain."
}
`;

/**
 * Extracts balanced JSON objects from arbitrary text containing potential
 * reasoning, thinking tags, or markdown fences.
 */
function extractBalancedJson(text: string): HealthEventExtraction | null {
  const candidates: any[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    const start = i;

    for (let j = start; j < text.length; j++) {
      const char = text[j];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          const candidateStr = text.substring(start, j + 1);
          try {
            const parsed = JSON.parse(candidateStr);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              candidates.push(parsed);
            }
          } catch {
            // Not valid JSON; keep scanning from outer loop
          }
          break;
        }
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // 1. Prefer candidates with full schema signature (both action and assistantResponse/isHealthRelevant)
  const fullCandidates = candidates.filter(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      "action" in c &&
      ("assistantResponse" in c || "isHealthRelevant" in c)
  );

  if (fullCandidates.length > 0) {
    // If multiple candidates exist, the last one is the final output after reasoning
    return fullCandidates[fullCandidates.length - 1] as HealthEventExtraction;
  }

  // 2. Otherwise prefer candidates with at least "action" or "isHealthRelevant"
  const partialCandidates = candidates.filter(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      ("action" in c || "isHealthRelevant" in c)
  );

  if (partialCandidates.length > 0) {
    return partialCandidates[partialCandidates.length - 1] as HealthEventExtraction;
  }

  // 3. Fallback to first valid parsed object
  return candidates[0] as HealthEventExtraction;
}


/**
 * Robust JSON extraction handling:
 * A. Pure JSON
 * B. JSON wrapped in markdown (```json ... ```)
 * C. Reasoning followed by markdown JSON
 * D. Reasoning followed by raw JSON
 */
export function parseAIJson(content: string): HealthEventExtraction {
  const trimmed = content.trim();

  // 1. Direct parse attempt
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as HealthEventExtraction;
    }
  } catch {
    // Continue to markdown & balanced extraction
  }

  // 2. Markdown code block extraction
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(trimmed)) !== null) {
    const innerContent = match[1].trim();
    try {
      const parsed = JSON.parse(innerContent);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as HealthEventExtraction;
      }
    } catch {
      const candidateFromBlock = extractBalancedJson(innerContent);
      if (candidateFromBlock) {
        return candidateFromBlock;
      }
    }
  }

  // 3. Balanced brace extraction across entire string
  const balancedCandidate = extractBalancedJson(trimmed);
  if (balancedCandidate) {
    return balancedCandidate;
  }

  throw new Error(
    `AI returned invalid JSON. Raw response: ${
      content.length > 300 ? content.substring(0, 300) + "... [TRUNCATED]" : content
    }`
  );
}

/**
 * Calls OpenRouter chat completion API with optional fallback if json_object format is not supported.
 *
 * Handles reasoning models that return content in `reasoning_content` instead
 * of `content` when `response_format: json_object` is requested.
 */
async function requestAIExtraction(
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>
): Promise<string> {
  try {
    // 90-second timeout to prevent hanging on slow/overloaded free-tier models
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    let response;
    try {
      response = await openrouter.chat.completions.create(
        {
          model: OPENROUTER_MODEL,
          messages,
          response_format: {
            type: "json_object",
          },
          temperature: 0,
        },
        { signal: controller.signal as any }
      );
    } finally {
      clearTimeout(timeout);
    }

    const choice = response.choices?.[0];
    const message = choice?.message;

    // 1. Try standard content field
    let content = message?.content;

    // 2. If content is empty, check reasoning_content (reasoning models like DeepSeek R1)
    if ((!content || typeof content !== "string") && message) {
      const msgAny = message as any;
      const reasoning =
        msgAny.reasoning_content || msgAny.reasoning || null;

      if (reasoning && typeof reasoning === "string") {
        console.log(
          "AI response had empty content but contained reasoning_content. Extracting JSON from reasoning."
        );
        content = reasoning;
      }
    }

    // 3. Check for refusal
    if ((!content || typeof content !== "string") && message) {
      const refusal = (message as any)?.refusal;
      if (refusal) {
        throw new Error(`AI refused the request: ${refusal}`);
      }
    }

    if (!content || typeof content !== "string") {
      throw new Error("AI returned an empty response");
    }
    return content;
  } catch (error: any) {
    // If model does not support response_format: json_object, retry without it
    if (
      error?.message?.includes("response_format") ||
      error?.status === 400
    ) {
      console.warn(
        "Selected model may not support response_format json_object. Retrying without response_format..."
      );
      const fallbackResponse = await openrouter.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages,
        temperature: 0,
      });

      const choice = fallbackResponse.choices?.[0];
      const message = choice?.message;

      let content = message?.content;

      if ((!content || typeof content !== "string") && message) {
        const msgAny = message as any;
        const reasoning =
          msgAny.reasoning_content || msgAny.reasoning || null;
        if (reasoning && typeof reasoning === "string") {
          content = reasoning;
        }
      }

      if (!content || typeof content !== "string") {
        throw new Error("AI returned an empty response");
      }
      return content;
    }
    throw error;
  }
}


/**
 * Normalize text for comparison purposes.
 * - lowercase
 * - trim whitespace
 * - remove punctuation
 * - strip leading articles (my, the, a, an)
 * - strip trailing 's' for simple singular/plural normalization
 */
export function normalizeTextForComparison(text: string): string {
  let normalized = text
    .toLowerCase()
    .trim()
    // Remove punctuation (keep spaces and alphanumerics)
    .replace(/[^\w\s]/g, "")
    .trim();

  // Strip leading articles
  normalized = normalized
    .replace(/^(my|the|a|an)\s+/i, "")
    .trim();

  // Simple singular/plural: strip trailing 's' if the word is longer than 3 chars
  // e.g., "motions" → "motion", but "gas" stays "gas"
  if (normalized.length > 3 && normalized.endsWith("s")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}


/**
 * Resolves common relative date phrases to ISO date strings.
 * Returns null if the phrase is not a recognized relative date pattern.
 */
function resolveRelativeDate(dateStr: string): string | null {
  const lower = dateStr.toLowerCase().trim();

  const now = new Date();

  if (lower === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }

  if (lower === "day before yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 2);
    return d.toISOString().split("T")[0];
  }

  if (lower === "today") {
    return now.toISOString().split("T")[0];
  }

  // Match "X days ago", "X day ago"
  const daysAgoMatch = lower.match(/^(\d+)\s*days?\s*ago$/);
  if (daysAgoMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(daysAgoMatch[1], 10));
    return d.toISOString().split("T")[0];
  }

  // Match "last week"
  if (lower === "last week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  }

  // Match "X weeks ago"
  const weeksAgoMatch = lower.match(/^(\d+)\s*weeks?\s*ago$/);
  if (weeksAgoMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(weeksAgoMatch[1], 10) * 7);
    return d.toISOString().split("T")[0];
  }

  // Not a recognized relative pattern
  return null;
}


/**
 * Normalizes and validates the parsed AI extraction against existing candidate events.
 */
function normalizeAndValidateExtraction(
  parsed: any,
  existingEvents: ExistingHealthEvent[]
): HealthEventExtraction {
  // Normalize action
  let action: "CREATE" | "UPDATE" | "NONE" = "NONE";
  if (parsed.action === "CREATE" || parsed.action === "UPDATE" || parsed.action === "NONE") {
    action = parsed.action;
  } else if (parsed.isHealthRelevant) {
    action = "CREATE";
  }

  const isHealthRelevant = Boolean(parsed.isHealthRelevant && action !== "NONE");

  let targetEventId: string | null = null;
  let targetEvent: string | null = null;

  if (action === "UPDATE" && parsed.targetEventId) {
    // Validate targetEventId against existing candidate events
    const matchingCandidate = existingEvents.find(
      (e) => e.id === parsed.targetEventId
    );
    if (matchingCandidate) {
      targetEventId = matchingCandidate.id;
      // TITLE STABILITY: Always use the existing event's canonical title
      targetEvent = matchingCandidate.title || parsed.targetEvent || null;
    } else {
      console.warn(
        `AI selected invalid targetEventId ${parsed.targetEventId} not present in candidate events.`
      );
      targetEventId = null;
      targetEvent = null;
    }
  }

  // Entities array check
  const entities: HealthEventEntity[] = Array.isArray(parsed.entities)
    ? parsed.entities.map((e: any) => ({
        entityType: e.entityType || "OTHER",
        entityValue: String(e.entityValue || ""),
        metadata: typeof e.metadata === "object" && e.metadata !== null ? e.metadata : {},
      }))
    : [];

  // Sanitize assistantResponse — never expose raw reasoning
  let assistantResponse =
    typeof parsed.assistantResponse === "string" && parsed.assistantResponse.trim()
      ? parsed.assistantResponse.trim()
      : isHealthRelevant
      ? "I have recorded your health information."
      : "How can I assist you with your health today?";

  // Strip any reasoning/thinking artifacts that may have leaked into assistantResponse
  if (assistantResponse.includes("<think>") || assistantResponse.includes("</think>")) {
    assistantResponse = assistantResponse
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    if (!assistantResponse) {
      assistantResponse = isHealthRelevant
        ? "I have recorded your health information."
        : "How can I assist you with your health today?";
    }
  }

  if (!isHealthRelevant) {
    return {
      isHealthRelevant: false,
      action: "NONE",
      targetEventId: null,
      targetEvent: null,
      eventType: null,
      title: null,
      description: null,
      eventDate: null,
      entities: [],
      assistantResponse,
    };
  }

  // Resolve eventDate: handle relative dates
  let eventDate: string | null = parsed.eventDate || null;
  if (eventDate && typeof eventDate === "string") {
    // Check if it's already an ISO date (YYYY-MM-DD or full ISO)
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}/;
    if (!isoDatePattern.test(eventDate)) {
      // Attempt to resolve relative date
      const resolved = resolveRelativeDate(eventDate);
      if (resolved) {
        eventDate = resolved;
      } else {
        // Not a recognized relative date — store as DURATION entity, clear eventDate
        entities.push({
          entityType: "DURATION",
          entityValue: eventDate,
          metadata: {},
        });
        eventDate = null;
      }
    }
  }

  // For UPDATE, use the existing event's canonical title
  let title: string | null;
  if (action === "UPDATE" && targetEvent) {
    title = targetEvent; // canonical title from existing event
  } else {
    title = parsed.title || (action === "UPDATE" && targetEvent ? targetEvent : "Health Event");
  }

  return {
    isHealthRelevant: true,
    action,
    targetEventId,
    targetEvent,
    eventType: parsed.eventType || "SYMPTOM",
    title,
    description: parsed.description || null,
    eventDate,
    entities,
    assistantResponse,
  };
}

/**
 * Extract structured health information from a patient message.
 *
 * ARCHITECTURE NOTE — Multi-turn message construction
 * ----------------------------------------------------
 * Previous implementation flattened the entire conversation history into a
 * single "user" prompt as plain text.  This caused the LLM to lose track of
 * conversational context (pronoun references like "it started yesterday" were
 * resolved incorrectly when multiple symptoms existed).
 *
 * The current implementation reconstructs proper alternating user / assistant
 * messages so the LLM can leverage its native multi-turn context window.
 * Existing health events are injected into the system prompt so they are
 * always visible regardless of how long the conversation history is.
 */
export async function extractHealthEvent(
  message: string,
  conversationHistory: ChatHistoryItem[] = [],
  existingEvents: ExistingHealthEvent[] = []
): Promise<HealthEventExtraction> {
  const existingEventsContext =
    existingEvents.length > 0
      ? existingEvents
          .map((event, index) => {
            const entities =
              event.health_event_entities
                ?.map(
                  (entity) => `${entity.entity_type}: ${entity.entity_value}`
                )
                .join(", ") || "None";

            return `Candidate ${index + 1}:
- Event ID: ${event.id}
- Type: ${event.event_type}
- Title: ${event.title || "Untitled"}
- Description: ${event.description || "None"}
- Date: ${event.event_date}
- Entities: ${entities}`;
          })
          .join("\n\n")
      : "No existing health events are available.";

  // ---------------------------------------------------------------------------
  // Build the system prompt with existing events baked in so the model always
  // has them in scope, even as the conversation history grows.
  // ---------------------------------------------------------------------------
  const dynamicSystemPrompt = `${SYSTEM_PROMPT}

----------------------------------------
EXISTING CANDIDATE HEALTH EVENTS
----------------------------------------
${existingEventsContext}

----------------------------------------
INSTRUCTIONS FOR THIS REQUEST
----------------------------------------
Analyse the CURRENT (latest) patient message in the context of the full
conversation above.  Use the conversation history to resolve pronouns
("it", "this", "that") and implicit references.  When the patient says
something like "it started yesterday", determine WHICH existing health
event they are referring to based on what was most recently discussed.

Respond with ONLY the required JSON object.`;

  // ---------------------------------------------------------------------------
  // Reconstruct proper multi-turn messages from conversation history.
  //
  // Each PATIENT message becomes a "user" message and each AI message becomes
  // an "assistant" message.  This gives the LLM native multi-turn context so
  // it can track which symptom the patient is talking about across turns.
  // ---------------------------------------------------------------------------
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    {
      role: "system",
      content: dynamicSystemPrompt,
    },
  ];

  // Replay conversation history as proper multi-turn messages
  for (const item of conversationHistory) {
    messages.push({
      role: item.sender === "PATIENT" ? "user" : "assistant",
      content: item.sender === "PATIENT"
        ? item.message
        // Wrap previous AI responses so the model recognises them as its own
        // structured outputs (it may have returned JSON or a friendly message)
        : item.message,
    });
  }

  // Add the current patient message as the final user turn
  messages.push({
    role: "user",
    content: message,
  });

  let rawContent: string | null = null;
  let parsed: HealthEventExtraction | null = null;

  // ----------------------------------------
  // Attempt 1: Standard extraction
  // ----------------------------------------
  try {
    rawContent = await requestAIExtraction(messages);
    if (rawContent) {
      try {
        parsed = parseAIJson(rawContent);
      } catch (parseErr) {
        console.warn(
          "Initial AI response could not be parsed as JSON. Retrying with strict format prompt..."
        );
      }
    }
  } catch (apiErr) {
    console.warn("First AI extraction attempt failed:", apiErr);
  }

  // ----------------------------------------
  // Attempt 2 (Retry): If first attempt failed to produce valid JSON
  // ----------------------------------------
  if (!parsed) {
    console.warn("Retrying AI extraction with strict JSON-only instruction...");

    const retryMessages = [
      ...messages,
      ...(rawContent ? [{ role: "assistant" as const, content: rawContent }] : []),
      {
        role: "user" as const,
        content: `IMPORTANT: Your previous output was not valid clean JSON.
Return ONLY the raw JSON object adhering to the schema.
Do NOT include any reasoning, thought process, explanations, markdown, or text outside the JSON.
The response MUST start with '{' and end with '}'.`,
      },
    ];

    rawContent = await requestAIExtraction(retryMessages);
    parsed = parseAIJson(rawContent);
  }

  // Truncate raw content for logging to prevent console pollution
  console.log("========== AI RAW RESPONSE (Preview) ==========");
  console.log(
    rawContent && rawContent.length > 500
      ? rawContent.substring(0, 500) + "... [TRUNCATED]"
      : rawContent
  );
  console.log("================================================");

  // Normalize and return safe extraction
  return normalizeAndValidateExtraction(parsed, existingEvents);
}