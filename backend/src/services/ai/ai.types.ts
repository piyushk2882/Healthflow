export interface HealthEventEntity {
  entityType:
    | "SYMPTOM"
    | "MEDICATION"
    | "CONDITION"
    | "VITAL"
    | "BODY_PART"
    | "DURATION"
    | "SEVERITY"
    | "OTHER";

  entityValue: string;

  metadata?: Record<string, unknown>;
}

export interface ExistingHealthEvent {
  id: string;
  event_type: string;
  title: string | null;
  description: string | null;
  event_date: string;
  source: string;
  health_event_entities?: Array<{
    entity_type: string;
    entity_value: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface ChatHistoryItem {
  sender: "PATIENT" | "AI";
  message: string;
}

export interface HealthEventExtraction {
  isHealthRelevant: boolean;

  action: "CREATE" | "UPDATE" | "NONE";

  targetEventId?: string | null;

  targetEvent?: string | null;

  eventType:
    | "SYMPTOM"
    | "MEDICATION"
    | "CONSULTATION"
    | "DIAGNOSIS"
    | "REPORT"
    | "VITAL"
    | "OTHER"
    | null;

  title: string | null;

  description?: string | null;

  eventDate?: string | null;

  entities: HealthEventEntity[];

  assistantResponse: string;
}