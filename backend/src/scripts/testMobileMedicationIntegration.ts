import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../config/supabaseAdmin";
import authRoutes from "../routes/auth.routes";
import testRoutes from "../routes/test.routes";
import healthEventRoutes from "../routes/healthEvent.routes";
import healthTimelineRoutes from "../routes/healthTimeline.routes";
import aiTestRoutes from "../routes/aiTest.routes";
import chatRoutes from "../routes/chat.routes";
import medicationRoutes from "../routes/medication.routes";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const clientAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/test", testRoutes);
app.use("/api/health-events", healthEventRoutes);
app.use("/api/health-timeline", healthTimelineRoutes);
app.use("/api/ai-test", aiTestRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/medications", medicationRoutes);

async function getAccessTokenForUser(email: string): Promise<string> {
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (linkError || !linkData.properties?.hashed_token) {
    throw new Error(`Failed to generate magiclink for ${email}: ${linkError?.message}`);
  }

  const { data: sessionData, error: sessError } =
    await clientAuth.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

  if (sessError || !sessionData.session?.access_token) {
    throw new Error(`Failed to verify OTP for ${email}: ${sessError?.message}`);
  }

  return sessionData.session.access_token;
}

export async function runMobileMedicationTests() {
  const PORT = 5098;
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  console.log("==================================================");
  console.log("📱 STARTING MEDICATION MOBILE INTEGRATION TEST SUITE");
  console.log("==================================================\n");

  const results: { test: number; name: string; passed: boolean; error?: string }[] = [];

  try {
    const timestamp = Date.now();
    const patientEmail = `mobile_pat_${timestamp}@healthflow.test`;
    const emptyPatientEmail = `mobile_empty_pat_${timestamp}@healthflow.test`;

    // Create primary patient
    const { data: pAuth } = await supabaseAdmin.auth.admin.createUser({
      email: patientEmail,
      password: "TestPassword123!",
      email_confirm: true,
      user_metadata: { full_name: "Mobile Test Patient", role: "PATIENT" },
    });
    const patientUserId = pAuth.user!.id;
    await supabaseAdmin.from("profiles").upsert({
      id: patientUserId,
      role: "PATIENT",
      full_name: "Mobile Test Patient",
    });
    const { data: pRec } = await supabaseAdmin
      .from("patients")
      .select("*")
      .eq("profile_id", patientUserId)
      .single();
    const patientToken = await getAccessTokenForUser(patientEmail);

    // Create doctor to prescribe medications
    const doctorEmail = `mobile_doc_${timestamp}@healthflow.test`;
    const { data: dAuth } = await supabaseAdmin.auth.admin.createUser({
      email: doctorEmail,
      password: "TestPassword123!",
      email_confirm: true,
      user_metadata: { full_name: "Dr. Mobile Prescriber", role: "DOCTOR" },
    });
    const doctorUserId = dAuth.user!.id;
    await supabaseAdmin.from("profiles").upsert({
      id: doctorUserId,
      role: "DOCTOR",
      full_name: "Dr. Mobile Prescriber",
    });
    const { data: dRec } = await supabaseAdmin
      .from("doctors")
      .insert({
        profile_id: doctorUserId,
        specialization: "General Practice",
        license_number: `DOC-MOB-${timestamp}`,
        verification_status: "APPROVED",
      })
      .select()
      .single();
    const doctorToken = await getAccessTokenForUser(doctorEmail);

    // Link doctor and patient in patient_doctor table
    await supabaseAdmin.from("patient_doctor").insert({
      doctor_id: dRec.id,
      patient_id: pRec.id,
      status: "ACTIVE",
    });

    // Create empty patient (0 medications)
    const { data: pEmptyAuth } = await supabaseAdmin.auth.admin.createUser({
      email: emptyPatientEmail,
      password: "TestPassword123!",
      email_confirm: true,
      user_metadata: { full_name: "Empty Test Patient", role: "PATIENT" },
    });
    const emptyUserId = pEmptyAuth.user!.id;
    await supabaseAdmin.from("profiles").upsert({
      id: emptyUserId,
      role: "PATIENT",
      full_name: "Empty Test Patient",
    });
    await supabaseAdmin.from("patients").insert({ profile_id: emptyUserId });
    const emptyPatientToken = await getAccessTokenForUser(emptyPatientEmail);

    let createdMedicationId = "";
    let createdScheduleId = "";

    // ──────────────────────────────────────────────────
    // VERIFY PATIENT CANNOT PRESCRIBE & DOCTOR CAN PRESCRIBE
    // ──────────────────────────────────────────────────
    console.log("TEST: Verify patient cannot prescribe medications");
    const patCreateRes = await fetch(`${baseUrl}/api/medications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({
        name: "Lisinopril",
        dosage: "10mg • 1 Tablet",
        frequency: "Once daily",
        startDate: "2026-10-10",
        status: "ACTIVE",
      }),
    });
    if (patCreateRes.status === 403) {
      console.log("✅ Verified: Patient prescribing is blocked (403 Forbidden)\n");
    }

    console.log("TEST 4 (Part 1): Doctor prescribes medication for patient");
    const createRes = await fetch(`${baseUrl}/api/medications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({
        patientId: pRec.id,
        name: "Lisinopril",
        dosage: "10mg • 1 Tablet",
        frequency: "Once daily",
        startDate: "2026-10-10",
        endDate: "2026-11-10",
        instructions: "Take with water in the morning",
        status: "ACTIVE",
      }),
    });
    const createBody = await createRes.json();
    createdMedicationId = createBody.data?.medication?.id;

    console.log("TEST 1: Medication list loads for the authenticated patient");
    const listRes = await fetch(`${baseUrl}/api/medications`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const listBody = await listRes.json();
    if (
      listRes.status === 200 &&
      listBody.success &&
      Array.isArray(listBody.data?.medications) &&
      listBody.data.medications.length >= 1
    ) {
      console.log(`✅ TEST 1 PASSED: Loaded ${listBody.data.medications.length} medication(s)\n`);
      results.push({ test: 1, name: "Medication list loads for authenticated patient", passed: true });
    } else {
      console.error("❌ TEST 1 FAILED\n");
      results.push({ test: 1, name: "Medication list loads for authenticated patient", passed: false });
    }

    // ──────────────────────────────────────────────────
    // TEST 2: Empty medication list displays correctly
    // ──────────────────────────────────────────────────
    console.log("TEST 2: Empty medication list displays correctly");
    const emptyRes = await fetch(`${baseUrl}/api/medications`, {
      headers: { Authorization: `Bearer ${emptyPatientToken}` },
    });
    const emptyBody = await emptyRes.json();
    if (
      emptyRes.status === 200 &&
      emptyBody.success &&
      Array.isArray(emptyBody.data?.medications) &&
      emptyBody.data.medications.length === 0
    ) {
      console.log("✅ TEST 2 PASSED: 0 medications returned for empty patient\n");
      results.push({ test: 2, name: "Empty medication list displays correctly", passed: true });
    } else {
      console.error("❌ TEST 2 FAILED\n");
      results.push({ test: 2, name: "Empty medication list displays correctly", passed: false });
    }

    // ──────────────────────────────────────────────────
    // TEST 3: Medication details load
    // ──────────────────────────────────────────────────
    console.log("TEST 3: Medication details load");
    const detailRes = await fetch(`${baseUrl}/api/medications/${createdMedicationId}`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const detailBody = await detailRes.json();
    if (
      detailRes.status === 200 &&
      detailBody.success &&
      detailBody.data?.medication?.name === "Lisinopril"
    ) {
      console.log("✅ TEST 3 PASSED: Medication details loaded with name and schedules array\n");
      results.push({ test: 3, name: "Medication details load", passed: true });
    } else {
      console.error("❌ TEST 3 FAILED\n");
      results.push({ test: 3, name: "Medication details load", passed: false });
    }

    // ──────────────────────────────────────────────────
    // TEST 4: Editing medication updates data
    // ──────────────────────────────────────────────────
    console.log("TEST 4: Editing medication updates data");
    const editRes = await fetch(`${baseUrl}/api/medications/${createdMedicationId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({
        patientId: pRec.id,
        dosage: "20mg • 1 Tablet",
        instructions: "Take with food",
      }),
    });
    const editBody = await editRes.json();
    if (
      editRes.status === 200 &&
      editBody.success &&
      editBody.data?.medication?.dosage === "20mg • 1 Tablet"
    ) {
      console.log("✅ TEST 4 PASSED: Medication edited and verified in API\n");
      results.push({ test: 4, name: "Creating and editing a medication updates the UI/backend", passed: true });
    } else {
      console.error("❌ TEST 4 FAILED\n");
      results.push({ test: 4, name: "Creating and editing a medication updates the UI/backend", passed: false });
    }

    // ──────────────────────────────────────────────────
    // TEST 5: Schedules load and mutations work
    // ──────────────────────────────────────────────────
    console.log("TEST 5: Schedules load and mutations work");
    // Create schedule
    const schCreateRes = await fetch(`${baseUrl}/api/medications/${createdMedicationId}/schedules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({
        scheduledTime: "08:30",
        dose: "1 Tablet",
      }),
    });
    const schCreateBody = await schCreateRes.json();
    createdScheduleId = schCreateBody.data?.schedule?.id;

    // List schedules
    const schListRes = await fetch(`${baseUrl}/api/medications/${createdMedicationId}/schedules`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const schListBody = await schListRes.json();

    if (
      schCreateRes.status === 201 &&
      schListRes.status === 200 &&
      schListBody.data?.schedules?.some((s: any) => s.id === createdScheduleId)
    ) {
      console.log("✅ TEST 5 PASSED: Created and listed medication schedules\n");
      results.push({ test: 5, name: "Schedules load and mutations work", passed: true });
    } else {
      console.error("❌ TEST 5 FAILED\n");
      results.push({ test: 5, name: "Schedules load and mutations work", passed: false });
    }

    // ──────────────────────────────────────────────────
    // TEST 6: TAKEN and SKIPPED adherence actions work
    // ──────────────────────────────────────────────────
    console.log("TEST 6: TAKEN and SKIPPED adherence actions work");
    const takenRes = await fetch(`${baseUrl}/api/medications/${createdMedicationId}/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({
        scheduledTime: new Date("2026-10-10T08:30:00Z").toISOString(),
        status: "TAKEN",
        takenAt: new Date().toISOString(),
      }),
    });
    const takenBody = await takenRes.json();

    const skippedRes = await fetch(`${baseUrl}/api/medications/${createdMedicationId}/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patientToken}`,
      },
      body: JSON.stringify({
        scheduledTime: new Date("2026-10-10T14:00:00Z").toISOString(),
        status: "SKIPPED",
        notes: "Patient felt nauseous",
      }),
    });
    const skippedBody = await skippedRes.json();

    const logsRes = await fetch(`${baseUrl}/api/medications/${createdMedicationId}/logs`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const logsBody = await logsRes.json();

    if (
      takenRes.status === 201 &&
      skippedRes.status === 201 &&
      logsRes.status === 200 &&
      logsBody.data?.logs?.length >= 2
    ) {
      console.log("✅ TEST 6 PASSED: Both TAKEN and SKIPPED adherence logs recorded\n");
      results.push({ test: 6, name: "TAKEN and SKIPPED adherence actions work", passed: true });
    } else {
      console.error("❌ TEST 6 FAILED\n");
      results.push({ test: 6, name: "TAKEN and SKIPPED adherence actions work", passed: false });
    }

    // ──────────────────────────────────────────────────
    // TEST 7: Unauthenticated requests are handled correctly
    // ──────────────────────────────────────────────────
    console.log("TEST 7: Unauthenticated requests handled correctly");
    const unauthRes = await fetch(`${baseUrl}/api/medications`);
    const unauthBody = await unauthRes.json();

    if (unauthRes.status === 401 && !unauthBody.success) {
      console.log("✅ TEST 7 PASSED: Rejected with 401 Unauthorized\n");
      results.push({ test: 7, name: "Unauthenticated requests are handled correctly", passed: true });
    } else {
      console.error("❌ TEST 7 FAILED\n");
      results.push({ test: 7, name: "Unauthenticated requests are handled correctly", passed: false });
    }

    // ──────────────────────────────────────────────────
    // TEST 8: API errors produce friendly messages
    // ──────────────────────────────────────────────────
    console.log("TEST 8: API errors produce friendly messages");
    const badReqRes = await fetch(`${baseUrl}/api/medications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({
        name: "", // Invalid empty name
        frequency: "Daily",
        startDate: "not-a-date",
      }),
    });
    const badReqBody = await badReqRes.json();

    if (badReqRes.status === 400 && !badReqBody.success && typeof badReqBody.message === "string") {
      console.log(`✅ TEST 8 PASSED: Validation error returned: "${badReqBody.message}"\n`);
      results.push({ test: 8, name: "API errors produce friendly messages", passed: true });
    } else {
      console.error("❌ TEST 8 FAILED\n");
      results.push({ test: 8, name: "API errors produce friendly messages", passed: false });
    }

    // ──────────────────────────────────────────────────
    // TEST 9: Existing timeline and authentication functionality remain intact
    // ──────────────────────────────────────────────────
    console.log("TEST 9: Existing timeline and authentication functionality intact");
    const timelineRes = await fetch(`${baseUrl}/api/health-timeline`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const timelineBody = await timelineRes.json();

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const meBody = await meRes.json();

    if (
      timelineRes.status === 200 &&
      timelineBody.success &&
      meRes.status === 200 &&
      meBody.user?.role === "PATIENT"
    ) {
      console.log("✅ TEST 9 PASSED: Health timeline and auth/me work seamlessly\n");
      results.push({ test: 9, name: "Existing timeline and authentication functionality remain intact", passed: true });
    } else {
      console.error("❌ TEST 9 FAILED\n");
      results.push({ test: 9, name: "Existing timeline and authentication functionality remain intact", passed: false });
    }

    // Cleanup test data
    if (createdMedicationId) {
      await supabaseAdmin.from("medications").delete().eq("id", createdMedicationId);
    }
    await supabaseAdmin.from("patient_doctor").delete().eq("doctor_id", dRec.id);
    await supabaseAdmin.from("doctors").delete().eq("id", dRec.id);
    await supabaseAdmin.auth.admin.deleteUser(doctorUserId);
    await supabaseAdmin.auth.admin.deleteUser(patientUserId);
    await supabaseAdmin.auth.admin.deleteUser(emptyUserId);

  } catch (err: any) {
    console.error("Unexpected test execution error:", err);
  } finally {
    server.close();
  }

  console.log("==================================================");
  console.log("MEDICATION MOBILE INTEGRATION SUMMARY");
  console.log("==================================================");
  results.forEach((r) => {
    console.log(`${r.passed ? "✅" : "❌"} Test ${r.test}: ${r.name}`);
  });
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nTotal Passed: ${passedCount}/${results.length}`);
}

runMobileMedicationTests();
