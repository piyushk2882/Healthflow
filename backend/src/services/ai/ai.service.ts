import { extractHealthEvent, normalizeTextForComparison } from "./openrouter.service";
import {
    HealthEventExtraction,
    ExistingHealthEvent,
    ChatHistoryItem,
} from "./ai.types";

export { ExistingHealthEvent, ChatHistoryItem, HealthEventExtraction, normalizeTextForComparison };

export async function extractHealthInformation(
    message: string,
    conversationHistory: ChatHistoryItem[] = [],
    existingEvents: ExistingHealthEvent[] = []
): Promise<HealthEventExtraction> {
    return extractHealthEvent(
        message,
        conversationHistory,
        existingEvents
    );
}