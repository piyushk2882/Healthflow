import { Response } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin";
import { AuthRequest } from "../middleware/auth.middleware";


/**
 * GET PATIENT RECORD FROM AUTH USER ID
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
 * CREATE HEALTH EVENT
 */
export const createHealthEvent = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const {
      eventType,
      title,
      description,
      eventDate,
      entities
    } = req.body;

    // Basic validation
    if (!eventType || !title) {
      return res.status(400).json({
        success: false,
        message: "Event type and title are required"
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    // Get patient ID from authenticated user
    const patient = await getPatientByUserId(req.user.id);

    // Create health event
    const { data: healthEvent, error: eventError } =
      await supabaseAdmin
        .from("health_events")
        .insert({
          patient_id: patient.id,
          event_type: eventType,
          title,
          description: description || null,
          event_date: eventDate || new Date().toISOString(),
          source: "PATIENT_MANUAL"
        })
        .select()
        .single();

    if (eventError || !healthEvent) {
      console.error("Health Event Error:", eventError);

      return res.status(500).json({
        success: false,
        message: "Failed to create health event"
      });
    }

    // Create entities if provided
    if (entities && Array.isArray(entities)) {

      const entityRecords = entities.map((entity) => ({
        health_event_id: healthEvent.id,
        entity_type: entity.entityType,
        entity_value: entity.entityValue,
        metadata: entity.metadata || {}
      }));

      const { error: entityError } =
        await supabaseAdmin
          .from("health_event_entities")
          .insert(entityRecords);

      if (entityError) {
        console.error("Entity Error:", entityError);

        return res.status(500).json({
          success: false,
          message:
            "Health event created but entities could not be saved"
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: "Health event created successfully",
      data: healthEvent
    });

  } catch (error) {

    console.error("Create Health Event Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create health event"
    });

  }
};


/**
 * GET PATIENT HEALTH TIMELINE
 */
export const getHealthEvents = async (
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

    const patient = await getPatientByUserId(req.user.id);

    const { data: events, error } =
      await supabaseAdmin
        .from("health_events")
        .select(`
          *,
          health_event_entities (*)
        `)
        .eq("patient_id", patient.id)
        .order("event_date", {
          ascending: false
        });

    if (error) {
      console.error("Get Events Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch health timeline"
      });
    }

    return res.status(200).json({
      success: true,
      count: events?.length || 0,
      data: events
    });

  } catch (error) {

    console.error("Get Health Events Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch health timeline"
    });

  }
};


/**
 * GET SINGLE HEALTH EVENT
 */
export const getHealthEventById = async (
  req: AuthRequest,
  res: Response
) => {
  try {

    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const patient = await getPatientByUserId(req.user.id);

    const { data: event, error } =
      await supabaseAdmin
        .from("health_events")
        .select(`
          *,
          health_event_entities (*)
        `)
        .eq("id", id)
        .eq("patient_id", patient.id)
        .single();

    if (error || !event) {
      return res.status(404).json({
        success: false,
        message: "Health event not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: event
    });

  } catch (error) {

    console.error("Get Event Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch health event"
    });

  }
};