import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { supabaseAdmin } from "../config/supabaseAdmin";
import {
  openrouter,
  OPENROUTER_MODEL,
} from "../config/openrouter";


// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get doctor record from authenticated user's profile_id.
 */
const getDoctorByUserId = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("doctors")
    .select("id")
    .eq("profile_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Doctor record not found");
  }

  return data;
};

/**
 * Verify that a doctor has an ACTIVE relationship with a patient.
 */
const verifyDoctorPatientRelationship = async (
  doctorId: string,
  patientId: string
): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .from("patient_doctor")
    .select("id")
    .eq("doctor_id", doctorId)
    .eq("patient_id", patientId)
    .eq("status", "ACTIVE")
    .single();

  return !error && !!data;
};


// =====================================================
// DOCTOR CHAT SYSTEM PROMPT
// =====================================================

const DOCTOR_CHAT_SYSTEM_PROMPT = `
You are a specialized clinical data assistant for HealthFlow, designed to help licensed medical doctors review and analyze their assigned patient's health records.

You are given:
1. Patient Profile: Name, patient ID, and record counts.
2. Prescribed Medications: The patient's medication registry including medication name, dosage, frequency, instructions, start/end dates, prescriber, and status (ACTIVE, COMPLETED, PAUSED, DISCONTINUED).
3. Medication Adherence / Logs: Recent scheduled doses and whether taken, skipped, or missed.
4. Health Events: Reported symptoms, vital signs, diagnoses, and consultations with dates, descriptions, and clinical entities (e.g., severity, duration, onset).
5. Patient's Own Descriptions: Direct quotes and chat messages from the patient describing their symptoms and daily condition.

YOUR RESPONSIBILITIES:
1. ACCURATE DATA RETRIEVAL:
   - Answer the doctor's question accurately based on ALL sections of the provided patient records.
   - When asked about MEDICATIONS (e.g. "What medications is this patient on?", "Show me medications", "Are they taking anything?"):
     * Refer directly to the "PRESCRIBED MEDICATIONS" section.
     * Clearly state active medications vs completed or discontinued ones.
     * Include key details: medication name, dosage, frequency, instructions, start/end dates, and prescriber.
   - When asked about SYMPTOMS (e.g. "What symptoms has this patient reported?", "View symptoms"):
     * Refer to the "HEALTH EVENTS" section and "PATIENT'S OWN DESCRIPTIONS".
     * List all reported symptoms with their dates, severity (mild, moderate, high), onset, duration, and progression.
   - When asked for a HEALTH SUMMARY or OVERVIEW:
     * Provide a clear, well-structured clinical summary covering:
       - Current/Reported Symptoms (with dates and severity)
       - Active Medications (with dosage, frequency, prescriber, and dates)
       - Vital Signs / Diagnoses (if present)
       - Adherence / Patient Notes
   - When asked about specific conditions, vitals, or dates, extract and present only the pertinent information.

2. FACTUAL INTEGRITY:
   - Base your answer ONLY on the provided records. NEVER invent, assume, or hallucinate health data or medications.
   - If there is no data matching a query (e.g. no vitals recorded), state clearly: "No matching records were found for [topic]."

3. CLINICAL COMMUNICATION:
   - Maintain a concise, professional, and clinical tone.
   - Use bullet points, bold headers, and structured tables/lists for rapid clinical readability.
   - Do NOT provide medical diagnoses, treatment decisions, or write prescriptions. You assist the doctor with chart review and clinical information synthesis.
`;


// =====================================================
// CONTROLLER: Get Assigned Patients for Doctor Chat
// =====================================================

/**
 * GET /api/chat/doctor/patients
 * Returns all active patients assigned to the authenticated doctor.
 * This reuses the same patient_doctor relationship table.
 */
export const getDoctorChatPatients = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user || req.user.role !== "DOCTOR") {
      return res.status(403).json({
        success: false,
        message: "Only doctors can access this resource",
      });
    }

    const doctor = await getDoctorByUserId(req.user.id);

    const { data: relationships, error } = await supabaseAdmin
      .from("patient_doctor")
      .select(`
        patient_id,
        assigned_at,
        patients (
          id,
          profile_id,
          profiles (
            full_name,
            role
          )
        )
      `)
      .eq("doctor_id", doctor.id)
      .eq("status", "ACTIVE");

    if (error) {
      console.error("Get Doctor Chat Patients Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch assigned patients",
      });
    }

    // For each patient, also fetch counts of their health events & active medications
    const patients = await Promise.all(
      (relationships || []).map(async (rel: any) => {
        const patientId = rel.patient_id;
        const fullName = rel.patients?.profiles?.full_name || "Patient";

        // Get count of health events for preview
        const { count: eventCount } = await supabaseAdmin
          .from("health_events")
          .select("id", { count: "exact", head: true })
          .eq("patient_id", patientId);

        // Get count of active medications
        const { count: medicationCount } = await supabaseAdmin
          .from("medications")
          .select("id", { count: "exact", head: true })
          .eq("patient_id", patientId)
          .eq("status", "ACTIVE");

        // Get the most recent health event for "last activity" info
        const { data: recentEvent } = await supabaseAdmin
          .from("health_events")
          .select("title, event_date, event_type")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        return {
          patientId,
          fullName,
          assignedAt: rel.assigned_at,
          eventCount: eventCount || 0,
          medicationCount: medicationCount || 0,
          lastEvent: recentEvent
            ? {
                title: recentEvent.title,
                eventDate: recentEvent.event_date,
                eventType: recentEvent.event_type,
              }
            : null,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: { patients },
    });
  } catch (error) {
    console.error("Get Doctor Chat Patients Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch assigned patients",
    });
  }
};


// =====================================================
// CONTROLLER: Doctor Query About Patient
// =====================================================

/**
 * POST /api/chat/doctor/query
 * Doctor sends a natural language query about a specific patient.
 * The system retrieves the patient's health data and uses AI to answer.
 *
 * Body: { patientId: string, message: string, conversationHistory?: Array<{role: string, content: string}> }
 */
export const doctorQueryPatient = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user || req.user.role !== "DOCTOR") {
      return res.status(403).json({
        success: false,
        message: "Only doctors can access this resource",
      });
    }

    const { patientId, message, conversationHistory } = req.body;

    // Validate input
    if (!patientId || typeof patientId !== "string") {
      return res.status(400).json({
        success: false,
        message: "patientId is required",
      });
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "message is required",
      });
    }

    const trimmedMessage = message.trim();

    // Verify doctor-patient relationship
    const doctor = await getDoctorByUserId(req.user.id);
    const hasRelationship = await verifyDoctorPatientRelationship(
      doctor.id,
      patientId
    );

    if (!hasRelationship) {
      return res.status(403).json({
        success: false,
        message: "You do not have an active relationship with this patient",
      });
    }

    // Get patient's profile info
    const { data: patientProfile } = await supabaseAdmin
      .from("patients")
      .select(`
        id,
        profile_id,
        profiles (
          full_name
        )
      `)
      .eq("id", patientId)
      .single();

    const patientName = (patientProfile as any)?.profiles?.full_name || "Patient";

    // 1. Fetch ALL health events for this patient (with entities)
    const { data: healthEvents, error: eventsError } = await supabaseAdmin
      .from("health_events")
      .select(`
        id,
        event_type,
        title,
        description,
        event_date,
        source,
        created_at,
        health_event_entities (
          entity_type,
          entity_value,
          metadata
        )
      `)
      .eq("patient_id", patientId)
      .order("event_date", { ascending: false });

    if (eventsError) {
      console.error("Error fetching patient health events:", eventsError);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve patient health records",
      });
    }

    // 2. Fetch ALL medications prescribed to this patient (with schedules & prescriber)
    const { data: medications, error: medsError } = await supabaseAdmin
      .from("medications")
      .select(`
        id,
        name,
        dosage,
        frequency,
        instructions,
        start_date,
        end_date,
        status,
        prescribed_by,
        created_at,
        medication_schedules (
          scheduled_time,
          dose
        ),
        doctors (
          id,
          profiles (
            full_name
          )
        )
      `)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (medsError) {
      console.warn("Warning fetching patient medications:", medsError);
    }

    // 3. Fetch recent medication adherence logs if medications exist
    let medicationLogs: any[] = [];
    const medIds = (medications || []).map((m: any) => m.id);
    if (medIds.length > 0) {
      const { data: logs } = await supabaseAdmin
        .from("medication_logs")
        .select(`
          id,
          medication_id,
          scheduled_time,
          taken_at,
          status,
          notes,
          created_at,
          medications (
            name
          )
        `)
        .in("medication_id", medIds)
        .order("scheduled_time", { ascending: false })
        .limit(20);

      medicationLogs = logs || [];
    }

    // 4. Also fetch chat messages where the patient discussed symptoms
    const { data: chatConversations } = await supabaseAdmin
      .from("chat_conversations")
      .select("id")
      .eq("patient_id", patientId);

    let patientMessages: any[] = [];
    if (chatConversations && chatConversations.length > 0) {
      const conversationIds = chatConversations.map((c: any) => c.id);

      const { data: messages } = await supabaseAdmin
        .from("chat_messages")
        .select("message, sender, health_event_id, created_at")
        .in("conversation_id", conversationIds)
        .eq("sender", "PATIENT")
        .order("created_at", { ascending: false })
        .limit(50);

      patientMessages = messages || [];
    }

    // 5. Build structured context for medications
    const medicationsContext = (medications || []).length > 0
      ? (medications || [])
          .map((med: any, index: number) => {
            const schedules = med.medication_schedules
              ?.map((s: any) => `${s.scheduled_time}${s.dose ? ` (${s.dose})` : ""}`)
              .join(", ") || "None specified";
            const prescriber = med.doctors?.profiles?.full_name || "Assigned by doctor";

            return `Medication ${index + 1}:
  Name: ${med.name}
  Status: ${med.status} (Active: ${med.status === "ACTIVE" ? "YES" : "NO"})
  Dosage: ${med.dosage || "Not specified"}
  Frequency: ${med.frequency || "Not specified"}
  Instructions: ${med.instructions || "None"}
  Start Date: ${med.start_date || "Unknown"}
  End Date: ${med.end_date || "Ongoing (No end date)"}
  Prescribed By: ${prescriber}
  Scheduled Dose Times: ${schedules}`;
          })
          .join("\n\n")
      : "No medications recorded or prescribed for this patient.";

    // 6. Build structured context for medication adherence
    const adherenceContext = (medicationLogs || []).length > 0
      ? (medicationLogs || [])
          .map((log: any) => {
            const medName = log.medications?.name || "Medication";
            return `- [${log.scheduled_time}] ${medName}: Status = ${log.status}${log.taken_at ? ` (Taken at: ${log.taken_at})` : ""}${log.notes ? ` Notes: ${log.notes}` : ""}`;
          })
          .join("\n")
      : "No medication adherence logs available.";

    // 7. Build structured context for health events
    const healthEventsContext = (healthEvents || []).length > 0
      ? (healthEvents || [])
          .map((event: any, index: number) => {
            const entities = event.health_event_entities
              ?.map(
                (e: any) => `  - ${e.entity_type}: ${e.entity_value}${e.metadata ? ` (${JSON.stringify(e.metadata)})` : ""}`
              )
              .join("\n") || "  None";

            return `Event ${index + 1} [Type: ${event.event_type}]:
  Title: ${event.title || "Untitled"}
  Description: ${event.description || "None"}
  Date: ${event.event_date || "Unknown"}
  Source: ${event.source}
  Recorded: ${event.created_at}
  Entities / Clinical Details:
${entities}`;
          })
          .join("\n\n")
      : "No health events recorded for this patient.";

    // 8. Build patient's own words context (from chat messages)
    const patientWordsContext = patientMessages.length > 0
      ? patientMessages
          .slice(0, 30)
          .map((msg: any) =>
            `[${msg.created_at}] Patient said: "${msg.message}"`
          )
          .join("\n")
      : "No chat messages from this patient.";

    const activeMedsCount = (medications || []).filter((m: any) => m.status === "ACTIVE").length;

    // Build the full context prompt
    const patientDataPrompt = `
PATIENT PROFILE:
- Name: ${patientName}
- Patient ID: ${patientId}
- Total Health Events: ${(healthEvents || []).length}
- Active Medications: ${activeMedsCount} (Total Prescriptions: ${(medications || []).length})

====================
1. PRESCRIBED MEDICATIONS:
====================
${medicationsContext}

====================
2. MEDICATION ADHERENCE / LOGS:
====================
${adherenceContext}

====================
3. HEALTH EVENTS (SYMPTOMS, VITALS, DIAGNOSES):
====================
${healthEventsContext}

====================
4. PATIENT'S OWN DESCRIPTIONS (from chat):
====================
${patientWordsContext}
`;

    // Build messages array for AI
    const aiMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      {
        role: "system",
        content: DOCTOR_CHAT_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Here is the patient's complete health record:\n${patientDataPrompt}`,
      },
      {
        role: "assistant",
        content: "I have reviewed the patient's complete health records, including symptoms, medications, and clinical history. What would you like to know?",
      },
    ];

    // Add conversation history if provided (sanitized to strictly alternate roles)
    if (Array.isArray(conversationHistory)) {
      let lastRole: "user" | "assistant" = "assistant";
      for (const item of conversationHistory) {
        if (
          (item.role === "user" || item.role === "assistant") &&
          item.content &&
          typeof item.content === "string" &&
          item.content.trim()
        ) {
          if (item.role !== lastRole) {
            aiMessages.push({
              role: item.role,
              content: item.content.trim(),
            });
            lastRole = item.role;
          }
        }
      }
      // If the last added message was a user message, remove it so the new trimmedMessage is the user prompt
      if (lastRole === "user") {
        aiMessages.pop();
      }
    }

    // Add the current doctor query
    aiMessages.push({
      role: "user",
      content: trimmedMessage,
    });

    // Call AI
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    let aiResponse: string;
    try {
      const response = await openrouter.chat.completions.create(
        {
          model: OPENROUTER_MODEL,
          messages: aiMessages,
          temperature: 0.1,
        },
        { signal: controller.signal as any }
      );

      const choice = response.choices?.[0];
      aiResponse = choice?.message?.content || "Unable to generate a response.";
    } catch (aiError: any) {
      console.error("AI Error in doctor chat:", aiError);
      aiResponse =
        "I was unable to process your query at this time. Please try again.";
    } finally {
      clearTimeout(timeout);
    }

    return res.status(200).json({
      success: true,
      data: {
        patientId,
        patientName,
        query: trimmedMessage,
        response: aiResponse,
        healthEventsCount: (healthEvents || []).length,
        medicationsCount: (medications || []).length,
        activeMedicationsCount: activeMedsCount,
      },
    });
  } catch (error) {
    console.error("Doctor Query Patient Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process doctor query",
    });
  }
};
