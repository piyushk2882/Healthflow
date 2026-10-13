import { Router } from "express";
import { getHealthTimeline } from "../controllers/healthTimeline.controller";
import { authenticateUser } from "../middleware/auth.middleware";
import { authorizeRoles } from "../middleware/role.middleware";

const router = Router();

/**
 * GET PATIENT HEALTH TIMELINE
 * Accessible only by authenticated users with PATIENT role
 */
router.get(
  "/",
  authenticateUser,
  authorizeRoles("PATIENT"),
  getHealthTimeline
);

export default router;
