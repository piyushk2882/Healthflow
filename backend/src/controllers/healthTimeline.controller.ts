import { Response } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin";
import { AuthRequest } from "../middleware/auth.middleware";
import {
  TimelineEntity,
  TimelineEvent,
  TimelineDateGroup,
  TimelineResponseData
} from "../types/timeline.types";

interface DbEntityRow {
  entity_type: string;
  entity_value: string;
  metadata?: Record<string, unknown> | null;
}

interface DbHealthEventRow {
  id: string;
  event_type: string;
  title: string | null;
  description: string | null;
  event_date: string;
  source: string;
  created_at: string;
  updated_at: string;
  health_event_entities?: DbEntityRow[] | null;
}

/**
 * Helper to fetch patient record from authenticated user ID
 */
const getPatientByUserId = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("profile_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Patient record not found");
  }

  return data;
};

/**
 * Helper to extract YYYY-MM-DD calendar date string from event_date
 */
const extractCalendarDate = (eventDateStr: string | null | undefined): string => {
  if (!eventDateStr) {
    return "Unknown Date";
  }

  const match = eventDateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }

  const parsed = new Date(eventDateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return eventDateStr;
};

/**
 * GET PATIENT HEALTH TIMELINE
 * GET /api/health-timeline
 */
export const getHealthTimeline = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    // Validate and parse pagination query parameters
    let page = 1;
    let limit = 20;

    if (req.query.page !== undefined) {
      const parsedPage = Number(req.query.page);
      if (!Number.isInteger(parsedPage) || parsedPage < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid page query parameter. Page must be a positive integer."
        });
      }
      page = parsedPage;
    }

    if (req.query.limit !== undefined) {
      const parsedLimit = Number(req.query.limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return res.status(400).json({
          success: false,
          message: "Invalid limit query parameter. Limit must be an integer between 1 and 100."
        });
      }
      limit = parsedLimit;
    }

    // Resolve patient record for authenticated user
    let patient;
    try {
      patient = await getPatientByUserId(req.user.id);
    } catch (err) {
      return res.status(404).json({
        success: false,
        message: "Patient record not found"
      });
    }

    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;

    // Fetch health events with associated entities
    const { data, error, count } = await supabaseAdmin
      .from("health_events")
      .select(
        `
          id,
          event_type,
          title,
          description,
          event_date,
          source,
          created_at,
          updated_at,
          health_event_entities (
            entity_type,
            entity_value,
            metadata
          )
        `,
        { count: "exact" }
      )
      .eq("patient_id", patient.id)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(fromIndex, toIndex);

    if (error) {
      console.error("Health Timeline Supabase Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch health timeline"
      });
    }

    const total = count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const rows = (data as unknown as DbHealthEventRow[]) || [];

    // Format events with camelCase properties
    const formattedEvents: TimelineEvent[] = rows.map((row) => {
      const entities: TimelineEntity[] = Array.isArray(row.health_event_entities)
        ? row.health_event_entities.map((entity) => ({
            entityType: entity.entity_type,
            entityValue: entity.entity_value,
            metadata: entity.metadata || {}
          }))
        : [];

      return {
        id: row.id,
        eventType: row.event_type,
        title: row.title,
        description: row.description,
        eventDate: row.event_date,
        source: row.source,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        entities
      };
    });

    // Group events by calendar date derived from event_date
    const dateGroupsMap = new Map<string, TimelineEvent[]>();
    for (const event of formattedEvents) {
      const dateKey = extractCalendarDate(event.eventDate);
      if (!dateGroupsMap.has(dateKey)) {
        dateGroupsMap.set(dateKey, []);
      }
      dateGroupsMap.get(dateKey)!.push(event);
    }

    const timeline: TimelineDateGroup[] = Array.from(dateGroupsMap.entries()).map(
      ([date, events]) => ({
        date,
        events
      })
    );

    const responseData: TimelineResponseData = {
      timeline,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };

    return res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error("Health Timeline Unexpected Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch health timeline"
    });
  }
};
