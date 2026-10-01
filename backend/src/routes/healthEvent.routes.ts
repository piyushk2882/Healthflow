import { Router } from "express";

import {
  createHealthEvent,
  getHealthEvents,
  getHealthEventById
} from "../controllers/healthEvent.controller";

import {
  authenticateUser
} from "../middleware/auth.middleware";

import {
  authorizeRoles
} from "../middleware/role.middleware";


const router = Router();


/**
 * CREATE HEALTH EVENT
 * Patient only
 */
router.post(
  "/",
  authenticateUser,
  authorizeRoles("PATIENT"),
  createHealthEvent
);


/**
 * GET PATIENT TIMELINE
 */
router.get(
  "/",
  authenticateUser,
  authorizeRoles("PATIENT"),
  getHealthEvents
);


/**
 * GET SINGLE EVENT
 */
router.get(
  "/:id",
  authenticateUser,
  authorizeRoles("PATIENT"),
  getHealthEventById
);


export default router;