import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { supabaseAdmin } from "../config/supabaseAdmin";
import { AuthRequest } from "../middleware/auth.middleware";

/**
 * SIGNUP (PATIENT or DOCTOR/CAREGIVER)
 */
export const signup = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      fullName,
      email,
      password,
      role: rawRole,
      specialization,
      licenseNumber,
      hospitalName,
      experienceYears
    } = req.body;

    // Basic validation
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email and password are required"
      });
    }

    // Role resolution and defense against privilege escalation
    const normalizedRole = typeof rawRole === "string" ? rawRole.trim().toUpperCase() : "PATIENT";
    if (normalizedRole === "ADMIN") {
      return res.status(400).json({
        success: false,
        message: "Public registration as Administrator is not permitted"
      });
    }

    const isDoctor = normalizedRole === "DOCTOR" || normalizedRole === "CAREGIVER";
    const targetRole: "PATIENT" | "DOCTOR" = isDoctor ? "DOCTOR" : "PATIENT";

    // Doctor-specific field validations
    if (isDoctor) {
      if (!specialization || typeof specialization !== "string" || !specialization.trim()) {
        return res.status(400).json({
          success: false,
          message: "Specialization is required for doctor registration"
        });
      }

      if (!licenseNumber || typeof licenseNumber !== "string" || !licenseNumber.trim()) {
        return res.status(400).json({
          success: false,
          message: "Medical license/registration number is required for doctor registration"
        });
      }

      // Check for duplicate medical license number
      const { data: existingDoc } = await supabaseAdmin
        .from("doctors")
        .select("id")
        .eq("license_number", licenseNumber.trim())
        .single();

      if (existingDoc) {
        return res.status(400).json({
          success: false,
          message: "A doctor with this medical license number is already registered"
        });
      }
    }

    // Create Supabase Auth user with admin API (avoids email rate limits and confirms email)
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName.trim(),
        role: targetRole
      }
    });

    if (createError || !createData.user) {
      return res.status(400).json({
        success: false,
        message: createError?.message || "Registration failed"
      });
    }

    const userId = createData.user.id;

    // Sign in to generate valid access token session for the client
    const { data: signinData } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    const session = signinData?.session || null;

    if (isDoctor) {
      // 1. Ensure profile is DOCTOR
      await supabaseAdmin
        .from("profiles")
        .upsert({
          id: userId,
          role: "DOCTOR",
          full_name: fullName.trim(),
          updated_at: new Date().toISOString()
        });

      // 2. Remove any auto-created patient row from default triggers
      await supabaseAdmin
        .from("patients")
        .delete()
        .eq("profile_id", userId);

      // 3. Create doctor record in PENDING verification status
      const { data: doctorRecord, error: docError } = await supabaseAdmin
        .from("doctors")
        .insert({
          profile_id: userId,
          specialization: specialization.trim(),
          license_number: licenseNumber.trim(),
          hospital_name: hospitalName && typeof hospitalName === "string" ? hospitalName.trim() : null,
          experience_years: experienceYears ? parseInt(experienceYears, 10) : null,
          verification_status: "PENDING"
        })
        .select()
        .single();

      if (docError) {
        console.error("Doctor profile creation error:", docError);
        return res.status(500).json({
          success: false,
          message: "Failed to create doctor registration profile"
        });
      }

      return res.status(201).json({
        success: true,
        message: "Doctor registration submitted successfully. Your account is pending verification.",
        user: {
          id: userId,
          email: createData.user.email,
          fullName: fullName.trim(),
          role: "DOCTOR",
          doctor: {
            id: doctorRecord.id,
            specialization: doctorRecord.specialization,
            licenseNumber: doctorRecord.license_number,
            hospitalName: doctorRecord.hospital_name,
            experienceYears: doctorRecord.experience_years,
            verificationStatus: "PENDING"
          }
        },
        session
      });

    } else {
      // PATIENT registration
      await supabaseAdmin
        .from("profiles")
        .upsert({
          id: userId,
          role: "PATIENT",
          full_name: fullName.trim(),
          updated_at: new Date().toISOString()
        });

      // Ensure linked patient record exists
      const { data: existingPat } = await supabaseAdmin
        .from("patients")
        .select("id")
        .eq("profile_id", userId)
        .single();

      if (!existingPat) {
        await supabaseAdmin
          .from("patients")
          .insert({ profile_id: userId });
      }

      return res.status(201).json({
        success: true,
        message: "Patient registered successfully",
        user: {
          id: userId,
          email: createData.user.email,
          fullName: fullName.trim(),
          role: "PATIENT"
        },
        session
      });
    }

  } catch (error) {
    console.error("Signup Error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong during registration"
    });
  }
};


/**
 * USER LOGIN
 */
export const login = async (
  req: Request,
  res: Response
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        message: error?.message || "Invalid email or password"
      });
    }

    // Retrieve trusted role from profiles table
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, full_name")
      .eq("id", data.user.id)
      .single();

    const role: "PATIENT" | "DOCTOR" | "ADMIN" = (profile?.role as any) || "PATIENT";
    let doctorInfo = null;

    if (role === "DOCTOR") {
      const { data: docData } = await supabaseAdmin
        .from("doctors")
        .select("id, specialization, license_number, hospital_name, experience_years, verification_status")
        .eq("profile_id", data.user.id)
        .single();

      if (docData) {
        doctorInfo = {
          id: docData.id,
          specialization: docData.specialization,
          licenseNumber: docData.license_number,
          hospitalName: docData.hospital_name,
          experienceYears: docData.experience_years,
          verificationStatus: docData.verification_status || "PENDING"
        };
      }
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: profile?.full_name || data.user.user_metadata?.full_name,
        role,
        doctor: doctorInfo
      },
      session: data.session
    });

  } catch (error) {
    console.error("Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong during login"
    });
  }
};


/**
 * APPROVE / REJECT DOCTOR (ADMIN ONLY)
 */
export const approveDoctor = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { doctorId } = req.params;
    const { status = "APPROVED" } = req.body;

    if (!["APPROVED", "REJECTED", "PENDING"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be one of: APPROVED, REJECTED, PENDING"
      });
    }

    const { data: updatedDoc, error } = await supabaseAdmin
      .from("doctors")
      .update({
        verification_status: status,
        updated_at: new Date().toISOString()
      })
      .eq("id", doctorId)
      .select()
      .single();

    if (error || !updatedDoc) {
      return res.status(404).json({
        success: false,
        message: "Doctor record not found or update failed"
      });
    }

    return res.status(200).json({
      success: true,
      message: `Doctor verification status updated to ${status}`,
      doctor: updatedDoc
    });

  } catch (error) {
    console.error("Approve Doctor Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update doctor verification status"
    });
  }
};