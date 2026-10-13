import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const authorizeRoles = (
  ...allowedRoles: Array<"PATIENT" | "DOCTOR" | "ADMIN">
) => {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource"
      });
    }

    // A doctor must be approved to access doctor-restricted operations
    if (req.user.role === "DOCTOR" && req.user.doctorVerificationStatus !== "APPROVED") {
      return res.status(403).json({
        success: false,
        message: "Doctor account is pending verification and approval. Access denied.",
        verificationStatus: req.user.doctorVerificationStatus || "PENDING"
      });
    }

    next();
  };
};