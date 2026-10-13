import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role: "PATIENT" | "DOCTOR" | "ADMIN";
    doctorId?: string;
    doctorVerificationStatus?: "PENDING" | "APPROVED" | "REJECTED";
  };
}

export const authenticateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No token provided"
      });
    }

    const token = authHeader.split(" ")[1];

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !authData.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or expired token"
      });
    }

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

    if (profileError || !profile) {
      return res.status(403).json({
        success: false,
        message: "User profile not found"
      });
    }

    let doctorId: string | undefined;
    let doctorVerificationStatus: "PENDING" | "APPROVED" | "REJECTED" | undefined;

    if (profile.role === "DOCTOR") {
      const { data: docData } = await supabaseAdmin
        .from("doctors")
        .select("id, verification_status")
        .eq("profile_id", authData.user.id)
        .single();

      if (docData) {
        doctorId = docData.id;
        doctorVerificationStatus = (docData.verification_status as any) || "PENDING";
      }
    }

    req.user = {
      id: authData.user.id,
      email: authData.user.email,
      role: profile.role,
      doctorId,
      doctorVerificationStatus
    };

    next();

  } catch (error) {
    console.error("Authentication Error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication failed"
    });
  }
};