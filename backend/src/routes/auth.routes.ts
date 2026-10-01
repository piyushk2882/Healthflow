import { Router, Response } from "express";
import {
  signup,
  login
} from "../controllers/auth.controller";
import {
  authenticateUser,
  AuthRequest
} from "../middleware/auth.middleware";

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

export default router;