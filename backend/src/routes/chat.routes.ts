import { Router } from "express";

import { sendChatMessage } from "../controllers/chat.controller";
import {
  getDoctorChatPatients,
  doctorQueryPatient,
} from "../controllers/doctorChat.controller";

import { authenticateUser } from "../middleware/auth.middleware";
import { authorizeRoles } from "../middleware/role.middleware";

const router = Router();

// =====================================================
// PATIENT CHAT (existing — unchanged)
// =====================================================

router.post(
  "/message",
  authenticateUser,
  authorizeRoles("PATIENT"),
  sendChatMessage
);

// =====================================================
// DOCTOR CHAT ENDPOINTS (new)
// =====================================================

/**
 * GET /api/chat/doctor/patients
 * Returns all active patients assigned to the authenticated doctor,
 * with health event counts and last activity info.
 */
router.get(
  "/doctor/patients",
  authenticateUser,
  authorizeRoles("DOCTOR"),
  getDoctorChatPatients
);

/**
 * POST /api/chat/doctor/query
 * Doctor queries a specific patient's health data via AI.
 * Body: { patientId, message, conversationHistory? }
 */
router.post(
  "/doctor/query",
  authenticateUser,
  authorizeRoles("DOCTOR"),
  doctorQueryPatient
);

export default router;