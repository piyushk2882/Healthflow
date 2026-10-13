import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./src/config/supabaseAdmin";
import authRoutes from "./src/routes/auth.routes";
import testRoutes from "./src/routes/test.routes";
import healthEventRoutes from "./src/routes/healthEvent.routes";
import healthTimelineRoutes from "./src/routes/healthTimeline.routes";
import aiTestRoutes from "./src/routes/aiTest.routes";
import chatRoutes from "./src/routes/chat.routes";

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

async function runTests() {
  const server = app.listen(5098);
  const baseUrl = "http://localhost:5098";

  console.log("🚀 Running Timeline API Test Suite...\n");

  try {
    // 1. Fetch patient records from DB
    const { data: patients, error: pError } = await supabaseAdmin
      .from("patients")
      .select("id, profile_id");

    if (pError || !patients || patients.length === 0) {
      console.error("❌ No patients found in DB to test with:", pError);
      process.exit(1);
    }

    const patient1 = patients[0];
    const { data: userData1 } = await supabaseAdmin.auth.admin.getUserById(
      patient1.profile_id
    );

    const email1 = userData1.user!.email!;
    const token1 = await getAccessTokenForUser(email1);
    console.log(`✅ Obtained JWT for Patient 1 (${email1})\n`);

    // Ensure Patient 1 has test health events
    const { data: existingEvents } = await supabaseAdmin
      .from("health_events")
      .select("id, title, event_date")
      .eq("patient_id", patient1.id);

    if (!existingEvents || existingEvents.length < 3) {
      console.log("Seeding test events for Patient 1...");
      const { data: insertedEvent1 } = await supabaseAdmin
        .from("health_events")
        .insert({
          patient_id: patient1.id,
          event_type: "SYMPTOM",
          title: "Neck pain",
          description: "Patient reports that the neck pain started yesterday.",
          event_date: "2026-09-30T00:00:00+00:00",
          source: "AI_CHAT"
        })
        .select()
        .single();

      if (insertedEvent1) {
        await supabaseAdmin.from("health_event_entities").insert([
          {
            health_event_id: insertedEvent1.id,
            entity_type: "DURATION",
            entity_value: "yesterday",
            metadata: {}
          }
        ]);
      }

      const { data: insertedEvent2 } = await supabaseAdmin
        .from("health_events")
        .insert({
          patient_id: patient1.id,
          event_type: "SYMPTOM",
          title: "Headache",
          description: "Patient experiencing headache.",
          event_date: "2026-09-29T00:00:00+00:00",
          source: "AI_CHAT"
        })
        .select()
        .single();

      if (insertedEvent2) {
        await supabaseAdmin.from("health_event_entities").insert([
          {
            health_event_id: insertedEvent2.id,
            entity_type: "SEVERITY",
            entity_value: "moderate",
            metadata: {}
          }
        ]);
      }

      const { data: insertedEvent3 } = await supabaseAdmin
        .from("health_events")
        .insert({
          patient_id: patient1.id,
          event_type: "SYMPTOM",
          title: "Loose motion",
          description: "Patient reports loose motion.",
          event_date: "2026-09-28T00:00:00+00:00",
          source: "PATIENT_MANUAL"
        })
        .select()
        .single();
    }

    // ─── TEST 1: Patient with multiple events ───
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 1: GET /api/health-timeline (Default pagination)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const res1 = await fetch(`${baseUrl}/api/health-timeline`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const body1 = await res1.json();
    console.log(`Status: ${res1.status}`);
    console.log(`Response summary: success=${body1.success}, dateGroups=${body1.data?.timeline?.length}, total=${body1.data?.pagination?.total}`);
    console.log("Sample Timeline Response:\n", JSON.stringify(body1, null, 2));

    const sampleEvent = body1.data?.timeline?.[0]?.events?.[0];
    const isCamelCase = sampleEvent && "eventType" in sampleEvent && "eventDate" in sampleEvent && "createdAt" in sampleEvent && "updatedAt" in sampleEvent;
    const hasEntities = sampleEvent && Array.isArray(sampleEvent.entities);

    if (
      res1.status === 200 &&
      body1.success === true &&
      Array.isArray(body1.data.timeline) &&
      body1.data.timeline.length > 0 &&
      isCamelCase &&
      hasEntities
    ) {
      console.log("✅ TEST 1 PASSED: Timeline returned with camelCase and grouped by calendar date\n");
    } else {
      console.error("❌ TEST 1 FAILED\n");
    }

    // ─── TEST 2: Patient with no events ───
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 2: Patient with no events");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const tempEmail = `empty_test_${Date.now()}@healthflow.test`;
    const { data: tempAuth } = await supabaseAdmin.auth.admin.createUser({
      email: tempEmail,
      password: "TestPassword123!",
      email_confirm: true
    });

    if (tempAuth.user) {
      await supabaseAdmin.from("profiles").insert({
        id: tempAuth.user.id,
        role: "PATIENT",
        full_name: "Empty Test Patient"
      });

      await supabaseAdmin.from("patients").insert({
        profile_id: tempAuth.user.id,
        date_of_birth: "2000-01-01",
        gender: "OTHER"
      });

      const emptyToken = await getAccessTokenForUser(tempEmail);
      const res2 = await fetch(`${baseUrl}/api/health-timeline`, {
        headers: { Authorization: `Bearer ${emptyToken}` }
      });
      const body2 = await res2.json();
      console.log(`Status: ${res2.status}`);
      console.log(`Body:`, JSON.stringify(body2, null, 2));

      if (
        res2.status === 200 &&
        body2.success === true &&
        Array.isArray(body2.data.timeline) &&
        body2.data.timeline.length === 0 &&
        body2.data.pagination.total === 0 &&
        body2.data.pagination.totalPages === 0
      ) {
        console.log("✅ TEST 2 PASSED: Empty timeline returned gracefully\n");
      } else {
        console.error("❌ TEST 2 FAILED\n");
      }

      // Cleanup
      await supabaseAdmin.from("patients").delete().eq("profile_id", tempAuth.user.id);
      await supabaseAdmin.from("profiles").delete().eq("id", tempAuth.user.id);
      await supabaseAdmin.auth.admin.deleteUser(tempAuth.user.id);
    }

    // ─── TEST 3: page=1&limit=2 ───
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 3: GET /api/health-timeline?page=1&limit=2");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const res3 = await fetch(`${baseUrl}/api/health-timeline?page=1&limit=2`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const body3 = await res3.json();
    console.log(`Status: ${res3.status}`);
    const totalEventsPage1 = body3.data?.timeline?.reduce((acc: number, g: any) => acc + g.events.length, 0);
    console.log(`Total events in page 1: ${totalEventsPage1}, Pagination:`, body3.data?.pagination);

    if (res3.status === 200 && body3.data?.pagination?.page === 1 && body3.data?.pagination?.limit === 2 && totalEventsPage1 <= 2) {
      console.log("✅ TEST 3 PASSED: Page 1 with limit 2 returned\n");
    } else {
      console.error("❌ TEST 3 FAILED\n");
    }

    // ─── TEST 4: page=2&limit=2 ───
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 4: GET /api/health-timeline?page=2&limit=2");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const res4 = await fetch(`${baseUrl}/api/health-timeline?page=2&limit=2`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const body4 = await res4.json();
    console.log(`Status: ${res4.status}`);
    const totalEventsPage2 = body4.data?.timeline?.reduce((acc: number, g: any) => acc + g.events.length, 0);
    console.log(`Total events in page 2: ${totalEventsPage2}, Pagination:`, body4.data?.pagination);

    if (res4.status === 200 && body4.data?.pagination?.page === 2 && body4.data?.pagination?.limit === 2) {
      console.log("✅ TEST 4 PASSED: Page 2 with limit 2 returned\n");
    } else {
      console.error("❌ TEST 4 FAILED\n");
    }

    // ─── TEST 5: Invalid page ───
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 5: Invalid page parameter (page=-1, page=abc)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const res5a = await fetch(`${baseUrl}/api/health-timeline?page=-1`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const body5a = await res5a.json();
    console.log(`page=-1: Status ${res5a.status}`, body5a);

    const res5b = await fetch(`${baseUrl}/api/health-timeline?page=abc`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const body5b = await res5b.json();
    console.log(`page=abc: Status ${res5b.status}`, body5b);

    if (res5a.status === 400 && res5b.status === 400 && !body5a.success && !body5b.success) {
      console.log("✅ TEST 5 PASSED: Invalid page correctly rejected with 400\n");
    } else {
      console.error("❌ TEST 5 FAILED\n");
    }

    // ─── TEST 6: Invalid limit ───
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 6: Invalid limit parameter (limit=0, limit=500, limit=xyz)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const res6a = await fetch(`${baseUrl}/api/health-timeline?limit=0`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const body6a = await res6a.json();
    console.log(`limit=0: Status ${res6a.status}`, body6a);

    const res6b = await fetch(`${baseUrl}/api/health-timeline?limit=500`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const body6b = await res6b.json();
    console.log(`limit=500: Status ${res6b.status}`, body6b);

    const res6c = await fetch(`${baseUrl}/api/health-timeline?limit=xyz`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const body6c = await res6c.json();
    console.log(`limit=xyz: Status ${res6c.status}`, body6c);

    if (res6a.status === 400 && res6b.status === 400 && res6c.status === 400) {
      console.log("✅ TEST 6 PASSED: Invalid limit correctly rejected with 400\n");
    } else {
      console.error("❌ TEST 6 FAILED\n");
    }

    // ─── TEST 7: Attempt to supply another patient ID ───
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 7: Attempt to supply another patient ID in query");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const fakePatientId = "00000000-0000-0000-0000-000000000000";
    const res7 = await fetch(`${baseUrl}/api/health-timeline?patientId=${fakePatientId}&patient_id=${fakePatientId}`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const body7 = await res7.json();
    console.log(`Status: ${res7.status}`);
    console.log(`Total events returned: ${body7.data?.pagination?.total}`);

    if (res7.status === 200 && body7.data?.pagination?.total === body1.data?.pagination?.total) {
      console.log("✅ TEST 7 PASSED: Query patient ID was ignored; returned authenticated patient's events\n");
    } else {
      console.error("❌ TEST 7 FAILED\n");
    }

    // ─── TEST 8: Verify another patient cannot see Patient 1's events ───
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 8: Verify isolation across different patients");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    if (patients.length >= 2) {
      const patient2 = patients[1];
      const { data: u2 } = await supabaseAdmin.auth.admin.getUserById(patient2.profile_id);
      if (u2?.user?.email) {
        const token2 = await getAccessTokenForUser(u2.user.email);
        const res8 = await fetch(`${baseUrl}/api/health-timeline`, {
          headers: { Authorization: `Bearer ${token2}` }
        });
        const body8 = await res8.json();
        console.log(`Patient 2 Total Events: ${body8.data?.pagination?.total}`);
        const p1EventIds = new Set(body1.data.timeline.flatMap((g: any) => g.events.map((e: any) => e.id)));
        const p2EventIds = (body8.data?.timeline || []).flatMap((g: any) => g.events.map((e: any) => e.id));
        const leaked = p2EventIds.some((id: string) => p1EventIds.has(id));

        if (!leaked) {
          console.log("✅ TEST 8 PASSED: Patient 2 cannot see Patient 1's events\n");
        } else {
          console.error("❌ TEST 8 FAILED: Event leak detected\n");
        }
      }
    }

    // ─── TEST 9: Unauthenticated request ───
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 9: Unauthenticated request");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const res9 = await fetch(`${baseUrl}/api/health-timeline`);
    const body9 = await res9.json();
    console.log(`Status: ${res9.status}`, body9);
    if (res9.status === 401 && !body9.success) {
      console.log("✅ TEST 9 PASSED: Unauthenticated request rejected with 401\n");
    } else {
      console.error("❌ TEST 9 FAILED\n");
    }

  } finally {
    server.close();
  }
}

runTests().catch(console.error);
