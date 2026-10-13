import { supabaseAdmin } from "../config/supabaseAdmin";

async function main() {
  const target = process.argv[2];

  if (!target) {
    console.log("Usage: npx tsx src/scripts/approveDoctor.ts <doctor_id | doctor_email | doctor_license>");
    process.exit(1);
  }

  console.log(`Looking up doctor matching: "${target}"...`);

  // Try matching by id
  let { data: doctor } = await supabaseAdmin
    .from("doctors")
    .select("id, profile_id, specialization, license_number, verification_status")
    .eq("id", target)
    .single();

  // Try matching by license_number
  if (!doctor) {
    const { data: byLicense } = await supabaseAdmin
      .from("doctors")
      .select("id, profile_id, specialization, license_number, verification_status")
      .eq("license_number", target)
      .single();
    doctor = byLicense;
  }

  // Try matching by email through auth
  if (!doctor) {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const matchedUser = users.users.find(u => u.email?.toLowerCase() === target.toLowerCase());
    if (matchedUser) {
      const { data: byProfile } = await supabaseAdmin
        .from("doctors")
        .select("id, profile_id, specialization, license_number, verification_status")
        .eq("profile_id", matchedUser.id)
        .single();
      doctor = byProfile;
    }
  }

  if (!doctor) {
    console.error(`❌ Doctor matching "${target}" not found in database.`);
    process.exit(1);
  }

  console.log(`Found doctor ${doctor.id} (${doctor.specialization}, License: ${doctor.license_number}). Current status: ${doctor.verification_status}`);

  const { data: updated, error } = await supabaseAdmin
    .from("doctors")
    .update({
      verification_status: "APPROVED",
      updated_at: new Date().toISOString()
    })
    .eq("id", doctor.id)
    .select()
    .single();

  if (error) {
    console.error("❌ Failed to approve doctor:", error.message);
    process.exit(1);
  }

  console.log(`✅ Doctor ${doctor.id} successfully APPROVED!`);
  console.log(updated);
}

main().catch(console.error);
