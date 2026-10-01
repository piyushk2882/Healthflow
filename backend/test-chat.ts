/**
 * End-to-end test for the chat pipeline with timeouts.
 *
 * Usage:
 *   npx tsx test-chat.ts <email> <password>
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const API_BASE = `http://localhost:${process.env.PORT || 5000}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function sendMessage(
  token: string,
  message: string,
  conversationId?: string
) {
  const body: any = { message };
  if (conversationId) body.conversationId = conversationId;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000); // 90s timeout

  try {
    const res = await fetch(`${API_BASE}/api/chat/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    return { status: res.status, body: data };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      return { status: 0, body: { success: false, message: "Request timed out after 90s" } };
    }
    throw err;
  }
}

function printResult(label: string, res: { status: number; body: any }) {
  if (res.status !== 200 || !res.body?.success) {
    console.log(`   ❌ HTTP ${res.status} — FAILED`);
    console.log(`   Response:`, JSON.stringify(res.body, null, 2));
    return;
  }
  const d = res.body.data;
  console.log(`   Action:    ${d?.extraction?.action}`);
  console.log(`   Title:     ${d?.extraction?.title}`);
  console.log(`   Target ID: ${d?.extraction?.targetEventId || "(none)"}`);
  console.log(`   Event ID:  ${d?.healthEvent?.id || "(none)"}`);
  console.log(`   AI says:   ${d?.extraction?.assistantResponse}`);
  console.log(`   Conv ID:   ${d?.conversationId}`);
}

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Usage: npx tsx test-chat.ts <email> <password>");
    process.exit(1);
  }

  // ─── Authenticate ───
  console.log(`\n🔐 Authenticating as ${email}...`);
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (authError || !authData.session) {
    console.error("❌ Auth failed:", authError?.message);
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log("✅ Authenticated successfully\n");

  // ─── Message 1: Report skin rash ───
  console.log("━".repeat(60));
  console.log('📨 Message 1: "I have skin rash"');
  console.log("━".repeat(60));
  const r1 = await sendMessage(token, "I have skin rash");
  printResult("Message 1", r1);

  if (!r1.body?.data?.conversationId) {
    console.error("\n❌ ABORT: Message 1 did not return a conversationId.");
    console.error("   Full response:", JSON.stringify(r1.body, null, 2));
    process.exit(1);
  }

  const conversationId = r1.body.data.conversationId;
  const event1Id = r1.body.data?.healthEvent?.id;
  console.log(`\n   📌 Skin rash event ID: ${event1Id}`);

  await new Promise((r) => setTimeout(r, 3000));

  // ─── Message 2: Report headache ───
  console.log("\n" + "━".repeat(60));
  console.log('📨 Message 2: "I also have headache"');
  console.log("━".repeat(60));
  const r2 = await sendMessage(token, "I also have headache", conversationId);
  printResult("Message 2", r2);

  const event2Id = r2.body?.data?.healthEvent?.id;
  console.log(`\n   📌 Headache event ID: ${event2Id}`);

  await new Promise((r) => setTimeout(r, 3000));

  // ─── Message 3: Refer back to skin rash ───
  console.log("\n" + "━".repeat(60));
  console.log('📨 Message 3: "skin rash started from yesterday"');
  console.log("   ⭐ Expected: UPDATE targeting Skin rash event " + event1Id);
  console.log("━".repeat(60));
  const r3 = await sendMessage(
    token,
    "skin rash started from yesterday",
    conversationId
  );
  printResult("Message 3", r3);

  // ─── Verify ───
  console.log("\n" + "═".repeat(60));
  console.log("📋 VERIFICATION");
  console.log("═".repeat(60));

  const event3Id = r3.body?.data?.healthEvent?.id;
  const action3 = r3.body?.data?.extraction?.action;

  if (r3.status !== 200) {
    console.log("❌ Message 3 request failed — check server logs for [DEBUG] output");
  } else if (action3 === "UPDATE" && event3Id === event1Id) {
    console.log("✅ PASS: Message 3 correctly UPDATED the Skin rash event");
  } else if (action3 === "UPDATE") {
    console.log(`⚠️  PARTIAL: Action was UPDATE but targeted different event`);
    console.log(`   Expected: ${event1Id} (Skin rash)`);
    console.log(`   Got:      ${event3Id}`);
  } else {
    console.log(`❌ FAIL: Action was "${action3}" instead of "UPDATE"`);
    console.log(`   Event 1 (Skin rash): ${event1Id}`);
    console.log(`   Event 3:             ${event3Id}`);
    if (event1Id && event3Id && event1Id === event3Id) {
      console.log(`   ✅ But same event ID — backend duplicate prevention worked!`);
    } else {
      console.log(`   ❌ Different event IDs — duplicate was created`);
    }
  }

  console.log("\n");
}

main().catch(console.error);
