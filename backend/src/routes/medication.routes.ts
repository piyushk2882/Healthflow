import { Router } from "express";

import {
  getMedications,
  getMedicationById,
  createMedication,
  updateMedication,
  deleteMedication,
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getMedicationLogs,
  createMedicationLog,
  getDoctorActivePatients
} from "../controllers/medication.controller";

import {
  authenticateUser
} from "../middleware/auth.middleware";

import {
  authorizeRoles
} from "../middleware/role.middleware";


const router = Router();


// =====================================================
// MEDICATION ENDPOINTS
// =====================================================

/**
 * GET /api/medications/patients/active
 * List all active patients assigned to the authenticated doctor.
 */
router.get(
  "/patients/active",
  authenticateUser,
  authorizeRoles("DOCTOR"),
  getDoctorActivePatients
);

/**
 * GET /api/medications
 * List medications for the authenticated patient.
 * Doctors/Admins pass ?patientId=<uuid>
 */
router.get(
  "/",
  authenticateUser,
  authorizeRoles("PATIENT", "DOCTOR", "ADMIN"),
  getMedications
);

/**
 * GET /api/medications/:id
 * Get a single medication with its schedules.
 */
router.get(
  "/:id",
  authenticateUser,
  authorizeRoles("PATIENT", "DOCTOR", "ADMIN"),
  getMedicationById
);

/**
 * POST /api/medications
 * Create a new medication. Only doctors and admins can prescribe medications.
 */
router.post(
  "/",
  authenticateUser,
  authorizeRoles("DOCTOR", "ADMIN"),
  createMedication
);

/**
 * PUT /api/medications/:id
 * Update a medication.
 */
router.put(
  "/:id",
  authenticateUser,
  authorizeRoles("DOCTOR", "ADMIN"),
  updateMedication
);

/**
 * DELETE /api/medications/:id
 * Soft-delete (DISCONTINUED) if logs exist, hard-delete otherwise.
 */
router.delete(
  "/:id",
  authenticateUser,
  authorizeRoles("DOCTOR", "ADMIN"),
  deleteMedication
);


// =====================================================
// SCHEDULE ENDPOINTS
// =====================================================

/**
 * GET /api/medications/:id/schedules
 */
router.get(
  "/:id/schedules",
  authenticateUser,
  authorizeRoles("PATIENT", "DOCTOR", "ADMIN"),
  getSchedules
);

/**
 * POST /api/medications/:id/schedules
 */
router.post(
  "/:id/schedules",
  authenticateUser,
  authorizeRoles("DOCTOR", "ADMIN"),
  createSchedule
);

/**
 * PUT /api/medications/:id/schedules/:scheduleId
 */
router.put(
  "/:id/schedules/:scheduleId",
  authenticateUser,
  authorizeRoles("PATIENT", "DOCTOR", "ADMIN"),
  updateSchedule
);

/**
 * DELETE /api/medications/:id/schedules/:scheduleId
 */
router.delete(
  "/:id/schedules/:scheduleId",
  authenticateUser,
  authorizeRoles("PATIENT", "DOCTOR", "ADMIN"),
  deleteSchedule
);


// =====================================================
// MEDICATION LOG ENDPOINTS
// =====================================================

/**
 * GET /api/medications/:id/logs
 */
router.get(
  "/:id/logs",
  authenticateUser,
  authorizeRoles("PATIENT", "DOCTOR", "ADMIN"),
  getMedicationLogs
);

/**
 * POST /api/medications/:id/logs
 */
router.post(
  "/:id/logs",
  authenticateUser,
  authorizeRoles("PATIENT", "DOCTOR"),
  createMedicationLog
);


export default router;
