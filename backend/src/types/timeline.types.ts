export interface TimelineEntity {
  entityType: string;
  entityValue: string;
  metadata?: Record<string, unknown>;
}

export interface TimelineEvent {
  id: string;
  eventType: string;
  title: string | null;
  description: string | null;
  eventDate: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  entities: TimelineEntity[];
}

export interface TimelineDateGroup {
  date: string;
  events: TimelineEvent[];
}

export interface TimelinePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TimelineResponseData {
  timeline: TimelineDateGroup[];
  pagination: TimelinePagination;
}
