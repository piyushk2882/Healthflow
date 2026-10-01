import { Router } from "express";

import { sendChatMessage } from "../controllers/chat.controller";

import { authenticateUser } from "../middleware/auth.middleware";
import { authorizeRoles } from "../middleware/role.middleware";

const router = Router();

router.post(
  "/message",
  authenticateUser,
  authorizeRoles("PATIENT"),
  sendChatMessage
);

export default router;