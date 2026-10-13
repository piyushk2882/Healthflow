import { Router, Response } from "express";
import {
  signup,
  login,
  approveDoctor
} from "../controllers/auth.controller";
import {
  authenticateUser,
  AuthRequest
} from "../middleware/auth.middleware";
import { authorizeRoles } from "../middleware/role.middleware";

const router = Router();

/**
 * POST /api/auth/signup
 */
router.post("/signup", signup);

/**
 * POST /api/auth/login
 */
router.post("/login", login);

/**
 * GET /api/auth/me
 */
router.get(
  "/me",
  authenticateUser,
  async (req: AuthRequest, res: Response) => {
    res.json({
      success: true,
      message: "Protected route accessed successfully",
      user: req.user
    });
  }
);

/**
 * PATCH /api/auth/doctors/:doctorId/approve
 * Admin only approval/rejection endpoint
 */
router.patch(
  "/doctors/:doctorId/approve",
  authenticateUser,
  authorizeRoles("ADMIN"),
  approveDoctor
);

export default router;