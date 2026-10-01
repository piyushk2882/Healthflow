import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseAdmin";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role: "PATIENT" | "DOCTOR" | "ADMIN";
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

    req.user = {
      id: authData.user.id,
      email: authData.user.email,
      role: profile.role
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