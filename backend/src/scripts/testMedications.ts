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
  auth: { autoRefreshToken: false, persistSession: false }
});

// Create test express app
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
      email
    });

  if (linkError || !linkData.properties?.hashed_token) {
    throw new Error(`Failed to generate magiclink for ${email}: ${linkError?.message}`);
  }

  const { data: sessionData, error: sessError } =
    await clientAuth.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink"
    });

  if (sessError || !sessionData.session?.access_token) {
    throw new Error(`Failed to verify OTP for ${email}: ${sessError?.message}`);
  }

  return sessionData.session.access_token;
}

export async function runMedicationTests() {
  const PORT = 5095;
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  console.log("==================================================");
  console.log("🚀 STARTING MEDICATION MANAGEMENT TEST SUITE");
  console.log("==================================================\n");

  const results: { test: number; name: string; passed: boolean; error?: string }[] = [];

  let patient1Token = "";
  let patient2Token = "";
  let doctorToken = "";
  let patient1Id = "";
  let patient2Id = "";
  let doctorId = "";
  let doctorProfileId = "";
  let doctorAuthUserId = "";
  let patient2AuthUserId = "";

  let testMedicationId = "";
  let schedule1Id = "";
  let schedule2Id = "";
  let logId = "";
  let relInitId = "";

  try {
    // 0. Setup test users
    console.log("Setting up test users in Supabase...");

    // Get existing patient 1
    const { data: existingPatients, error: pError } = await supabaseAdmin
      .from("patients")
      .select("id, profile_id")
      .limit(2);

    if (pError || !existingPatients || existingPatients.length === 0) {
      throw new Error(`No patients found in DB: ${pError?.message}`);
    }

    patient1Id = existingPatients[0].id;
    const { data: user1 } = await supabaseAdmin.auth.admin.getUserById(existingPatients[0].profile_id);
    if (!user1.user?.email) throw new Error("Patient 1 email not found");
    patient1Token = await getAccessTokenForUser(user1.user.email);
    console.log(`✅ Patient 1 authenticated: ${user1.user.email} (Patient ID: ${patient1Id})`);

    // Setup Patient 2
    if (existingPatients.length > 1) {
      patient2Id = existingPatients[1].id;
      const { data: user2 } = await supabaseAdmin.auth.admin.getUserById(existingPatients[1].profile_id);
      if (!user2.user?.email) throw new Error("Patient 2 email not found");
      patient2Token = await getAccessTokenForUser(user2.user.email);
    } else {
      const email2 = `test_patient2_${Date.now()}@healthflow.test`;
      const { data: auth2 } = await supabaseAdmin.auth.admin.createUser({
        email: email2,
        password: "Password123!",
        email_confirm: true
      });
      patient2AuthUserId = auth2.user!.id;
      await supabaseAdmin.from("profiles").insert({ id: patient2AuthUserId, role: "PATIENT", full_name: "Patient 2" });
      const { data: pat2 } = await supabaseAdmin.from("patients").insert({ profile_id: patient2AuthUserId }).select().single();
      patient2Id = pat2.id;
      patient2Token = await getAccessTokenForUser(email2);
    }
    console.log(`✅ Patient 2 authenticated (Patient ID: ${patient2Id})`);

    // Setup Doctor
    const doctorEmail = `test_doc_${Date.now()}@healthflow.test`;
    const { data: docAuth } = await supabaseAdmin.auth.admin.createUser({
      email: doctorEmail,
      password: "DocPassword123!",
      email_confirm: true
    });
    doctorAuthUserId = docAuth.user!.id;
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: doctorAuthUserId, role: "DOCTOR", full_name: "Dr. Test Doctor" });
    const { data: docData, error: docErr } = await supabaseAdmin.from("doctors").insert({
      profile_id: doctorAuthUserId,
      specialization: "General Medicine",
      license_number: `LIC-${Date.now()}`,
      verification_status: "APPROVED"
    }).select().single();
    if (docErr) throw new Error(`Doctor setup error: ${docErr.message}`);
    doctorId = docData.id;
    doctorProfileId = doctorAuthUserId;
    doctorToken = await getAccessTokenForUser(doctorEmail);
    console.log(`✅ Doctor authenticated: ${doctorEmail} (Doctor ID: ${doctorId})\n`);

    // Establish active relationship between Doctor and Patient 1
    const { data: relInit, error: relInitErr } = await supabaseAdmin.from("patient_doctor").insert({
      doctor_id: doctorId,
      patient_id: patient1Id,
      status: "ACTIVE"
    }).select().single();
    if (relInitErr) throw new Error(`Relationship setup error: ${relInitErr.message}`);
    relInitId = relInit.id;

    // ──────────────────────────────────────────────────
    // TEST 1: Patient is blocked from creating, Doctor creates medication
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log("TEST 1: Patient blocked & Doctor creates medication (POST /api/medications)");
    const blockRes = await fetch(`${baseUrl}/api/medications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${patient1Token}`
      },
      body: JSON.stringify({
        name: "Amoxicillin",
        dosage: "500 mg",
        frequency: "THREE_TIMES_DAILY",
        instructions: "Take after meals",
        startDate: "2026-10-10",
        endDate: "2026-10-20",
        status: "ACTIVE"
      })
    });
    const blockBody = await blockRes.json();
    const patientForbidden = blockRes.status === 403 && !blockBody.success;

    const res1 = await fetch(`${baseUrl}/api/medications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`
      },
      body: JSON.stringify({
        patientId: patient1Id,
        name: "Amoxicillin",
        dosage: "500 mg",
        frequency: "THREE_TIMES_DAILY",
        instructions: "Take after meals",
        startDate: "2026-10-10",
        endDate: "2026-10-20",
        status: "ACTIVE"
      })
    });
    const body1 = await res1.json();
    console.log("Status:", res1.status, "Body:", JSON.stringify(body1, null, 2));

    if (patientForbidden && res1.status === 201 && body1.success && body1.data?.medication?.id) {
      testMedicationId = body1.data.medication.id;
      console.log(`✅ TEST 1 PASSED: Patient blocked (403) and doctor created medication (ID: ${testMedicationId})\n`);
      results.push({ test: 1, name: "Patient creation blocked & Doctor creates medication", passed: true });
    } else {
      console.error("❌ TEST 1 FAILED\n");
      results.push({ test: 1, name: "Patient creation blocked & Doctor creates medication", passed: false, error: JSON.stringify(body1) });
    }

    // ──────────────────────────────────────────────────
    // TEST 2: Patient retrieves medications
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log("TEST 2: Patient retrieves medications (GET /api/medications)");
    const res2 = await fetch(`${baseUrl}/api/medications`, {
      headers: { Authorization: `Bearer ${patient1Token}` }
    });
    const body2 = await res2.json();
    console.log("Status:", res2.status, "Count:", body2.count);

    if (res2.status === 200 && body2.success && Array.isArray(body2.data?.medications) && body2.data.medications.length > 0) {
      console.log("✅ TEST 2 PASSED: Medications retrieved successfully\n");
      results.push({ test: 2, name: "Patient retrieves medications", passed: true });
    } else {
      console.error("❌ TEST 2 FAILED\n");
      results.push({ test: 2, name: "Patient retrieves medications", passed: false, error: JSON.stringify(body2) });
    }

    // ──────────────────────────────────────────────────
    // TEST 3: Patient retrieves one medication
    // ────────────────────────────────────────────────--
    console.log("--------------------------------------------------");
    console.log(`TEST 3: Patient retrieves one medication (GET /api/medications/${testMedicationId})`);
    const res3 = await fetch(`${baseUrl}/api/medications/${testMedicationId}`, {
      headers: { Authorization: `Bearer ${patient1Token}` }
    });
    const body3 = await res3.json();
    console.log("Status:", res3.status, "Name:", body3.data?.medication?.name);

    if (res3.status === 200 && body3.success && body3.data?.medication?.id === testMedicationId && "schedules" in body3.data.medication) {
      console.log("✅ TEST 3 PASSED: Medication with schedules array retrieved\n");
      results.push({ test: 3, name: "Patient retrieves one medication", passed: true });
    } else {
      console.error("❌ TEST 3 FAILED\n");
      results.push({ test: 3, name: "Patient retrieves one medication", passed: false, error: JSON.stringify(body3) });
    }

    // ──────────────────────────────────────────────────
    // TEST 4: Doctor creates two schedules
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log("TEST 4: Doctor creates two schedules (POST /api/medications/:id/schedules)");
    if (!testMedicationId) {
      console.error("❌ TEST 4 SKIPPED: No medication created in Test 1\n");
      results.push({ test: 4, name: "Doctor creates two schedules", passed: false, error: "Prerequisite Test 1 failed (medications table does not exist)" });
    } else {
      const res4a = await fetch(`${baseUrl}/api/medications/${testMedicationId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${doctorToken}` },
        body: JSON.stringify({ scheduledTime: "08:00", dose: "1 capsule" })
      });
      const body4a = await res4a.json();

      const res4b = await fetch(`${baseUrl}/api/medications/${testMedicationId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${doctorToken}` },
        body: JSON.stringify({ scheduledTime: "20:00", dose: "1 capsule" })
      });
      const body4b = await res4b.json();

      if (res4a.status === 201 && body4a.success && res4b.status === 201 && body4b.success) {
        schedule1Id = body4a.data?.schedule?.id;
        schedule2Id = body4b.data?.schedule?.id;
        console.log(`✅ TEST 4 PASSED: Created schedules ${schedule1Id} and ${schedule2Id}\n`);
        results.push({ test: 4, name: "Doctor creates two schedules", passed: true });
      } else {
        console.error("❌ TEST 4 FAILED\n");
        results.push({ test: 4, name: "Doctor creates two schedules", passed: false, error: JSON.stringify({ body4a, body4b }) });
      }
    }

    // ──────────────────────────────────────────────────
    // TEST 5: Patient retrieves schedules
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log(`TEST 5: Patient retrieves schedules (GET /api/medications/:id/schedules)`);
    if (!testMedicationId) {
      results.push({ test: 5, name: "Patient retrieves schedules", passed: false, error: "Prerequisite Test 1 failed" });
    } else {
      const res5 = await fetch(`${baseUrl}/api/medications/${testMedicationId}/schedules`, {
        headers: { Authorization: `Bearer ${patient1Token}` }
      });
      const body5 = await res5.json();
      console.log("Status:", res5.status, "Count:", body5.count);

      if (res5.status === 200 && body5.success && Array.isArray(body5.data?.schedules) && body5.data.schedules.length >= 2) {
        console.log("✅ TEST 5 PASSED: Schedules retrieved\n");
        results.push({ test: 5, name: "Patient retrieves schedules", passed: true });
      } else {
        console.error("❌ TEST 5 FAILED\n");
        results.push({ test: 5, name: "Patient retrieves schedules", passed: false, error: JSON.stringify(body5) });
      }
    }

    // ──────────────────────────────────────────────────
    // TEST 6: Doctor updates medication
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log(`TEST 6: Doctor updates medication (PUT /api/medications/:id)`);
    if (!testMedicationId) {
      results.push({ test: 6, name: "Doctor updates medication", passed: false, error: "Prerequisite Test 1 failed" });
    } else {
      const res6 = await fetch(`${baseUrl}/api/medications/${testMedicationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${doctorToken}` },
        body: JSON.stringify({ patientId: patient1Id, dosage: "625 mg", instructions: "Take with large glass of water" })
      });
      const body6 = await res6.json();

      if (res6.status === 200 && body6.success && body6.data?.medication?.dosage === "625 mg") {
        console.log("✅ TEST 6 PASSED: Medication updated successfully\n");
        results.push({ test: 6, name: "Doctor updates medication", passed: true });
      } else {
        console.error("❌ TEST 6 FAILED\n");
        results.push({ test: 6, name: "Doctor updates medication", passed: false, error: JSON.stringify(body6) });
      }
    }

    // ──────────────────────────────────────────────────
    // TEST 7: Patient creates a medication log
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log(`TEST 7: Patient creates a medication log (POST /api/medications/:id/logs)`);
    if (!testMedicationId) {
      results.push({ test: 7, name: "Patient creates a medication log", passed: false, error: "Prerequisite Test 1 failed" });
    } else {
      const scheduledTimeIso = new Date().toISOString();
      const res7 = await fetch(`${baseUrl}/api/medications/${testMedicationId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${patient1Token}` },
        body: JSON.stringify({
          scheduledTime: scheduledTimeIso,
          status: "PENDING",
          notes: "Morning dose pending"
        })
      });
      const body7 = await res7.json();

      if (res7.status === 201 && body7.success && body7.data?.log?.id) {
        logId = body7.data.log.id;
        console.log(`✅ TEST 7 PASSED: Medication log created (ID: ${logId})\n`);
        results.push({ test: 7, name: "Patient creates a medication log", passed: true });
      } else {
        console.error("❌ TEST 7 FAILED\n");
        results.push({ test: 7, name: "Patient creates a medication log", passed: false, error: JSON.stringify(body7) });
      }
    }

    // ──────────────────────────────────────────────────
    // TEST 8: Patient marks medication TAKEN
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log(`TEST 8: Patient marks medication TAKEN (POST /api/medications/:id/logs)`);
    if (!testMedicationId) {
      results.push({ test: 8, name: "Patient marks medication TAKEN", passed: false, error: "Prerequisite Test 1 failed" });
    } else {
      const scheduledTimeIso = new Date().toISOString();
      const takenTimeIso = new Date().toISOString();
      const res8 = await fetch(`${baseUrl}/api/medications/${testMedicationId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${patient1Token}` },
        body: JSON.stringify({
          scheduledTime: scheduledTimeIso,
          status: "TAKEN",
          takenAt: takenTimeIso,
          notes: "Taken on time with water"
        })
      });
      const body8 = await res8.json();

      if (res8.status === 201 && body8.success && body8.data?.log?.status === "TAKEN") {
        console.log("✅ TEST 8 PASSED: Medication logged as TAKEN\n");
        results.push({ test: 8, name: "Patient marks medication TAKEN", passed: true });
      } else {
        console.error("❌ TEST 8 FAILED\n");
        results.push({ test: 8, name: "Patient marks medication TAKEN", passed: false, error: JSON.stringify(body8) });
      }
    }

    // ──────────────────────────────────────────────────
    // TEST 9: Patient retrieves medication logs
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log(`TEST 9: Patient retrieves medication logs (GET /api/medications/:id/logs)`);
    if (!testMedicationId) {
      results.push({ test: 9, name: "Patient retrieves medication logs", passed: false, error: "Prerequisite Test 1 failed" });
    } else {
      const res9 = await fetch(`${baseUrl}/api/medications/${testMedicationId}/logs`, {
        headers: { Authorization: `Bearer ${patient1Token}` }
      });
      const body9 = await res9.json();

      if (res9.status === 200 && body9.success && Array.isArray(body9.data?.logs) && body9.data.logs.length >= 2) {
        console.log(`✅ TEST 9 PASSED: Retrieved ${body9.data.logs.length} logs\n`);
        results.push({ test: 9, name: "Patient retrieves medication logs", passed: true });
      } else {
        console.error("❌ TEST 9 FAILED\n");
        results.push({ test: 9, name: "Patient retrieves medication logs", passed: false, error: JSON.stringify(body9) });
      }
    }

    // ──────────────────────────────────────────────────
    // TEST 10: Verify another patient cannot access the medication
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log("TEST 10: Verify another patient cannot access the medication");
    if (!testMedicationId) {
      results.push({ test: 10, name: "Verify another patient cannot access the medication", passed: false, error: "Prerequisite Test 1 failed" });
    } else {
      const res10 = await fetch(`${baseUrl}/api/medications/${testMedicationId}`, {
        headers: { Authorization: `Bearer ${patient2Token}` }
      });
      const body10 = await res10.json();
      console.log("Status:", res10.status, "Body:", body10);

      // Expect 404 or 403
      if ((res10.status === 404 || res10.status === 403) && !body10.success) {
        console.log("✅ TEST 10 PASSED: Patient 2 access was denied\n");
        results.push({ test: 10, name: "Verify another patient cannot access the medication", passed: true });
      } else {
        console.error("❌ TEST 10 FAILED\n");
        results.push({ test: 10, name: "Verify another patient cannot access the medication", passed: false, error: `Allowed with status ${res10.status}` });
      }
    }

    // ──────────────────────────────────────────────────
    // TEST 11: Verify unauthenticated requests fail
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log("TEST 11: Verify unauthenticated requests fail");
    const res11a = await fetch(`${baseUrl}/api/medications`);
    const res11b = await fetch(`${baseUrl}/api/medications/${testMedicationId}`);

    if (res11a.status === 401 && res11b.status === 401) {
      console.log("✅ TEST 11 PASSED: Unauthenticated requests returned 401 Unauthorized\n");
      results.push({ test: 11, name: "Verify unauthenticated requests fail", passed: true });
    } else {
      console.error("❌ TEST 11 FAILED\n");
      results.push({ test: 11, name: "Verify unauthenticated requests fail", passed: false, error: `Statuses: ${res11a.status}, ${res11b.status}` });
    }

    // ──────────────────────────────────────────────────
    // TEST 12: Doctor can manage medication only for ACTIVE relationship
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log("TEST 12: Doctor can manage medication for ACTIVE relationship");

    // Doctor retrieves patient 1's medications (active relationship was established in setup)
    const res12 = await fetch(`${baseUrl}/api/medications?patientId=${patient1Id}`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    const body12 = await res12.json();

    if (res12.status === 200 && body12.success && Array.isArray(body12.data?.medications)) {
      console.log("✅ TEST 12 PASSED: Doctor accessed active patient's medications\n");
      results.push({ test: 12, name: "Doctor can manage medication with ACTIVE relationship", passed: true });
    } else {
      console.error("❌ TEST 12 FAILED\n");
      results.push({ test: 12, name: "Doctor can manage medication with ACTIVE relationship", passed: false, error: JSON.stringify(body12) });
    }

    // ──────────────────────────────────────────────────
    // TEST 13: Doctor cannot manage an unrelated patient
    // ──────────────────────────────────────────────────
    console.log("--------------------------------------------------");
    console.log("TEST 13: Doctor cannot manage an unrelated patient");
    // Patient 2 has NO relationship with doctor
    const res13 = await fetch(`${baseUrl}/api/medications?patientId=${patient2Id}`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    const body13 = await res13.json();
    console.log("Status:", res13.status, "Body:", body13);

    if (res13.status === 403 && !body13.success) {
      console.log("✅ TEST 13 PASSED: Doctor access to unrelated patient was denied (403)\n");
      results.push({ test: 13, name: "Doctor cannot manage unrelated patient", passed: true });
    } else {
      console.error("❌ TEST 13 FAILED\n");
      results.push({ test: 13, name: "Doctor cannot manage unrelated patient", passed: false, error: `Allowed with status ${res13.status}` });
    }

  } catch (err: any) {
    console.error("Unexpected test execution error:", err);
  } finally {
    // Cleanup doctor-patient relationship & created test entities
    if (relInitId) {
      await supabaseAdmin.from("patient_doctor").delete().eq("id", relInitId);
    }
    // Cleanup doctor
    if (doctorId) {
      await supabaseAdmin.from("doctors").delete().eq("id", doctorId);
    }
    if (doctorAuthUserId) {
      await supabaseAdmin.from("profiles").delete().eq("id", doctorAuthUserId);
      await supabaseAdmin.auth.admin.deleteUser(doctorAuthUserId);
    }
    if (patient2AuthUserId) {
      await supabaseAdmin.from("patients").delete().eq("id", patient2Id);
      await supabaseAdmin.from("profiles").delete().eq("id", patient2AuthUserId);
      await supabaseAdmin.auth.admin.deleteUser(patient2AuthUserId);
    }

    server.close();

    console.log("==================================================");
    console.log("TEST SUMMARY");
    console.log("==================================================");
    results.forEach((r) => {
      console.log(`${r.passed ? "✅" : "❌"} Test ${r.test}: ${r.name} ${r.error ? `(${r.error})` : ""}`);
    });
    console.log(`\nTotal Passed: ${results.filter(r => r.passed).length}/${results.length}`);
  }
}

runMedicationTests().catch(console.error);
