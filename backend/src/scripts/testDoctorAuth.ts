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

export async function runDoctorAuthTests() {
  const PORT = 5097;
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  console.log("==================================================");
  console.log("🚀 STARTING DOCTOR REGISTRATION & AUTH TEST SUITE");
  console.log("==================================================\n");

  const results: { test: number; name: string; passed: boolean; error?: string }[] = [];

  const createdUserIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: string[] = [];

  try {
    const timestamp = Date.now();
    const patientEmail = `test_pat_${timestamp}@example.com`;
    const doctorEmail = `test_doc_${timestamp}@example.com`;
    const testLicense = `MED-LIC-${timestamp}`;

    // ──────────────────────────────────────────────────
    // TEST 1: Patient signup creates a PATIENT profile and patient record
    // ──────────────────────────────────────────────────
    console.log("TEST 1: Patient signup creates PATIENT profile and patient record");
    const res1 = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Test Regular Patient",
        email: patientEmail,
        password: "PatientPass123!",
        role: "PATIENT"
      })
    });
    const body1 = await res1.json();
    console.log("Status:", res1.status, "Body:", body1);

    let patUser1Id = body1.user?.id;
    if (patUser1Id) createdUserIds.push(patUser1Id);

    // Verify in database
    const { data: pProfile } = await supabaseAdmin.from("profiles").select("*").eq("id", patUser1Id).single();
    const { data: pRecord } = await supabaseAdmin.from("patients").select("*").eq("profile_id", patUser1Id).single();
    const { data: pDoctorCheck } = await supabaseAdmin.from("doctors").select("*").eq("profile_id", patUser1Id).single();

    if (
      res1.status === 201 &&
      body1.success &&
      pProfile?.role === "PATIENT" &&
      pRecord &&
      !pDoctorCheck
    ) {
      if (pRecord?.id) createdPatientIds.push(pRecord.id);
      console.log("✅ TEST 1 PASSED: Patient profile and patient record created; no doctor record\n");
      results.push({ test: 1, name: "Patient signup creates PATIENT profile and patient record", passed: true });
    } else {
      console.error("❌ TEST 1 FAILED\n");
      results.push({ test: 1, name: "Patient signup creates PATIENT profile and patient record", passed: false, error: JSON.stringify(body1) });
    }

    // ──────────────────────────────────────────────────
    // TEST 2: Caregiver signup creates a doctor registration, not a patient record
    // ──────────────────────────────────────────────────
    console.log("TEST 2: Caregiver signup creates doctor registration, not a patient record");
    const res2 = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Dr. Alice Caregiver",
        email: doctorEmail,
        password: "DoctorPass123!",
        role: "caregiver", // user-facing label
        specialization: "Cardiology",
        licenseNumber: testLicense,
        hospitalName: "Metro General",
        experienceYears: 8
      })
    });
    const body2 = await res2.json();
    console.log("Status:", res2.status, "Body:", body2);

    let docUser2Id = body2.user?.id;
    if (docUser2Id) createdUserIds.push(docUser2Id);

    const { data: dProfile } = await supabaseAdmin.from("profiles").select("*").eq("id", docUser2Id).single();
    const { data: dPatientCheck } = await supabaseAdmin.from("patients").select("*").eq("profile_id", docUser2Id).single();
    const { data: dRecord } = await supabaseAdmin.from("doctors").select("*").eq("profile_id", docUser2Id).single();

    let doctorRowId = dRecord?.id;
    if (doctorRowId) createdDoctorIds.push(doctorRowId);

    if (
      res2.status === 201 &&
      body2.success &&
      dProfile?.role === "DOCTOR" &&
      !dPatientCheck &&
      dRecord &&
      dRecord.license_number === testLicense &&
      dRecord.verification_status === "PENDING"
    ) {
      console.log(`✅ TEST 2 PASSED: Doctor created (ID: ${dRecord.id}) with PENDING status, 0 patient records\n`);
      results.push({ test: 2, name: "Caregiver signup creates doctor registration, not patient record", passed: true });
    } else {
      console.error("❌ TEST 2 FAILED\n");
      results.push({ test: 2, name: "Caregiver signup creates doctor registration, not patient record", passed: false, error: JSON.stringify(body2) });
    }

    // ──────────────────────────────────────────────────
    // TEST 3: A new doctor cannot access protected doctor operations before approval
    // ──────────────────────────────────────────────────
    console.log("TEST 3: Unapproved doctor cannot access protected operations");
    const unapprovedDocToken = await getAccessTokenForUser(doctorEmail);

    // Try accessing protected doctor route (/api/test/doctor or managing medications)
    const res3a = await fetch(`${baseUrl}/api/test/doctor`, {
      headers: { Authorization: `Bearer ${unapprovedDocToken}` }
    });
    const body3a = await res3a.json();
    console.log("Status:", res3a.status, "Body:", body3a);

    if (res3a.status === 403 && !body3a.success && body3a.message.includes("pending verification")) {
      console.log("✅ TEST 3 PASSED: Access blocked with 403 Forbidden (pending verification)\n");
      results.push({ test: 3, name: "New doctor cannot access doctor operations before approval", passed: true });
    } else {
      console.error("❌ TEST 3 FAILED\n");
      results.push({ test: 3, name: "New doctor cannot access doctor operations before approval", passed: false, error: JSON.stringify(body3a) });
    }

    // ──────────────────────────────────────────────────
    // TEST 4: An approved doctor can log in and access the doctor experience
    // ──────────────────────────────────────────────────
    console.log("TEST 4: Approved doctor can log in and access doctor experience");
    // Approve doctor using database/admin flow
    await supabaseAdmin
      .from("doctors")
      .update({ verification_status: "APPROVED" })
      .eq("id", doctorRowId);

    // Doctor logs in
    const res4Login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: doctorEmail, password: "DoctorPass123!" })
    });
    const body4Login = await res4Login.json();
    console.log("Login Status:", res4Login.status, "VerificationStatus:", body4Login.user?.doctor?.verificationStatus);

    const approvedDocToken = await getAccessTokenForUser(doctorEmail);
    const res4Access = await fetch(`${baseUrl}/api/test/doctor`, {
      headers: { Authorization: `Bearer ${approvedDocToken}` }
    });
    const body4Access = await res4Access.json();
    console.log("Doctor Access Status:", res4Access.status, "Body:", body4Access);

    if (
      res4Login.status === 200 &&
      body4Login.user?.role === "DOCTOR" &&
      body4Login.user?.doctor?.verificationStatus === "APPROVED" &&
      res4Access.status === 200 &&
      body4Access.success
    ) {
      console.log("✅ TEST 4 PASSED: Approved doctor logged in and accessed doctor route\n");
      results.push({ test: 4, name: "Approved doctor can log in and access doctor experience", passed: true });
    } else {
      console.error("❌ TEST 4 FAILED\n");
      results.push({ test: 4, name: "Approved doctor can log in and access doctor experience", passed: false, error: JSON.stringify({ body4Login, body4Access }) });
    }

    // ──────────────────────────────────────────────────
    // TEST 5: Doctor can access only patients with an ACTIVE relationship
    // ──────────────────────────────────────────────────
    console.log("TEST 5: Doctor can access only patients with ACTIVE relationship");
    // Check with patient 1 before relationship (should be 403)
    const res5a = await fetch(`${baseUrl}/api/medications?patientId=${pRecord.id}`, {
      headers: { Authorization: `Bearer ${approvedDocToken}` }
    });
    const body5a = await res5a.json();

    // Establish active relationship
    const { data: rel5 } = await supabaseAdmin
      .from("patient_doctor")
      .insert({
        doctor_id: doctorRowId,
        patient_id: pRecord.id,
        status: "ACTIVE"
      })
      .select()
      .single();

    // Check with patient 1 after active relationship (should be 200)
    const res5b = await fetch(`${baseUrl}/api/medications?patientId=${pRecord.id}`, {
      headers: { Authorization: `Bearer ${approvedDocToken}` }
    });
    const body5b = await res5b.json();

    if (res5a.status === 403 && res5b.status === 200 && body5b.success) {
      console.log("✅ TEST 5 PASSED: 403 without relationship, 200 with ACTIVE relationship\n");
      results.push({ test: 5, name: "Doctor can access only patients with an ACTIVE relationship", passed: true });
    } else {
      console.error("❌ TEST 5 FAILED\n");
      results.push({ test: 5, name: "Doctor can access only patients with an ACTIVE relationship", passed: false, error: `Before: ${res5a.status}, After: ${res5b.status}` });
    }

    if (rel5?.id) {
      await supabaseAdmin.from("patient_doctor").delete().eq("id", rel5.id);
    }

    // ──────────────────────────────────────────────────
    // TEST 6: Ordinary patient cannot access doctor-only operations
    // ──────────────────────────────────────────────────
    console.log("TEST 6: Ordinary patient cannot access doctor-only operations");
    const patToken = await getAccessTokenForUser(patientEmail);
    const res6 = await fetch(`${baseUrl}/api/test/doctor`, {
      headers: { Authorization: `Bearer ${patToken}` }
    });
    const body6 = await res6.json();

    if (res6.status === 403 && !body6.success) {
      console.log("✅ TEST 6 PASSED: Patient blocked from doctor-only route (403)\n");
      results.push({ test: 6, name: "Ordinary patient cannot access doctor-only operations", passed: true });
    } else {
      console.error("❌ TEST 6 FAILED\n");
      results.push({ test: 6, name: "Ordinary patient cannot access doctor-only operations", passed: false, error: `Status ${res6.status}` });
    }

    // ──────────────────────────────────────────────────
    // TEST 7: Public signup cannot create an ADMIN account
    // ──────────────────────────────────────────────────
    console.log("TEST 7: Public signup cannot create an ADMIN account");
    const res7 = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Attacker Trying Admin",
        email: `hacker_${timestamp}@test.com`,
        password: "HackerPass123!",
        role: "ADMIN"
      })
    });
    const body7 = await res7.json();

    if (res7.status === 400 && !body7.success && body7.message.includes("Administrator is not permitted")) {
      console.log("✅ TEST 7 PASSED: ADMIN public registration rejected with 400 Bad Request\n");
      results.push({ test: 7, name: "Public signup cannot create an ADMIN account", passed: true });
    } else {
      console.error("❌ TEST 7 FAILED\n");
      results.push({ test: 7, name: "Public signup cannot create an ADMIN account", passed: false, error: JSON.stringify(body7) });
    }

    // ──────────────────────────────────────────────────
    // TEST 8: Duplicate registration and invalid fields are handled safely
    // ──────────────────────────────────────────────────
    console.log("TEST 8: Duplicate registration and invalid fields handled safely");
    // Duplicate license check
    const res8a = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Dr. Copycat",
        email: `copycat_${timestamp}@test.com`,
        password: "Pass123456!",
        role: "DOCTOR",
        specialization: "Pediatrics",
        licenseNumber: testLicense // ALREADY TAKEN by Doctor in Test 2
      })
    });
    const body8a = await res8a.json();

    // Missing specialization check
    const res8b = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Dr. Incomplete",
        email: `incomplete_${timestamp}@test.com`,
        password: "Pass123456!",
        role: "DOCTOR",
        licenseNumber: `UNIQUE-${timestamp}`
      })
    });
    const body8b = await res8b.json();

    if (
      res8a.status === 400 &&
      body8a.message.includes("already registered") &&
      res8b.status === 400 &&
      body8b.message.includes("Specialization is required")
    ) {
      console.log("✅ TEST 8 PASSED: Duplicate license and missing fields rejected cleanly\n");
      results.push({ test: 8, name: "Duplicate registration and invalid fields handled safely", passed: true });
    } else {
      console.error("❌ TEST 8 FAILED\n");
      results.push({ test: 8, name: "Duplicate registration and invalid fields handled safely", passed: false, error: JSON.stringify({ body8a, body8b }) });
    }

    // ──────────────────────────────────────────────────
    // TEST 9: Existing patient login continues to work
    // ──────────────────────────────────────────────────
    console.log("TEST 9: Existing patient login continues to work");
    const res9 = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: patientEmail,
        password: "PatientPass123!"
      })
    });
    const body9 = await res9.json();

    if (res9.status === 200 && body9.success && body9.user?.role === "PATIENT" && body9.session?.access_token) {
      console.log("✅ TEST 9 PASSED: Patient logged in successfully with PATIENT role\n");
      results.push({ test: 9, name: "Existing patient login continues to work", passed: true });
    } else {
      console.error("❌ TEST 9 FAILED\n");
      results.push({ test: 9, name: "Existing patient login continues to work", passed: false, error: JSON.stringify(body9) });
    }

    // ──────────────────────────────────────────────────
    // TEST 10: Session persistence and logout continue to work
    // ──────────────────────────────────────────────────
    console.log("TEST 10: Session persistence and auth me endpoint work");
    const res10 = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${patToken}` }
    });
    const body10 = await res10.json();

    if (res10.status === 200 && body10.success && body10.user?.role === "PATIENT") {
      console.log("✅ TEST 10 PASSED: Authenticated session verified via /api/auth/me\n");
      results.push({ test: 10, name: "Session persistence and auth verification continue to work", passed: true });
    } else {
      console.error("❌ TEST 10 FAILED\n");
      results.push({ test: 10, name: "Session persistence and auth verification continue to work", passed: false, error: JSON.stringify(body10) });
    }

  } catch (err: any) {
    console.error("Unexpected test runner error:", err);
  } finally {
    // Cleanup created test records
    for (const did of createdDoctorIds) {
      await supabaseAdmin.from("doctors").delete().eq("id", did);
    }
    for (const pid of createdPatientIds) {
      await supabaseAdmin.from("patients").delete().eq("id", pid);
    }
    for (const uid of createdUserIds) {
      await supabaseAdmin.from("profiles").delete().eq("id", uid);
      await supabaseAdmin.auth.admin.deleteUser(uid);
    }

    server.close();

    console.log("==================================================");
    console.log("DOCTOR REGISTRATION & AUTH TEST SUMMARY");
    console.log("==================================================");
    results.forEach((r) => {
      console.log(`${r.passed ? "✅" : "❌"} Test ${r.test}: ${r.name} ${r.error ? `(${r.error})` : ""}`);
    });
    console.log(`\nTotal Passed: ${results.filter(r => r.passed).length}/${results.length}`);
  }
}

runDoctorAuthTests().catch(console.error);
