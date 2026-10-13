import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function runMigration() {
  const sqlPath = path.resolve(
    __dirname,
    "../../../database/supabase/003_medications.sql"
  );

  const sql = fs.readFileSync(sqlPath, "utf-8");

  // Split SQL into individual statements, filtering empty ones
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--"));

  console.log(`Running medication migration (${statements.length} statements)...\n`);

  // Use the Supabase Management API's SQL endpoint
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

  // Try using the postgres REST endpoint directly
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseServiceKey,
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({})
  });

  console.log("Note: Direct SQL execution requires the Supabase SQL Editor.");
  console.log("The SQL file has been created at:");
  console.log(`  ${sqlPath}\n`);
  console.log("Please copy and paste the SQL into the Supabase SQL Editor at:");
  console.log(`  https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);
  console.log("The SQL will create:");
  console.log("  - public.medications table");
  console.log("  - public.medication_schedules table");
  console.log("  - public.medication_logs table");
  console.log("  - updated_at trigger function");
  console.log("  - Indexes on key columns");
  console.log("  - RLS policies for patients and doctors");
}

runMigration().catch(console.error);
