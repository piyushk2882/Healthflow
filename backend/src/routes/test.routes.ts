import { Router, Response } from "express";

import {
  authenticateUser,
  AuthRequest
} from "../middleware/auth.middleware";

import {
  authorizeRoles
} from "../middleware/role.middleware";

const router = Router();


router.get(
  "/patient",
  authenticateUser,
  authorizeRoles("PATIENT"),
  (req: AuthRequest, res: Response) => {

    res.json({
      success: true,
      message: "Welcome Patient!",
      user: req.user
    });

  }
);


router.get(
  "/doctor",
  authenticateUser,
  authorizeRoles("DOCTOR"),
  (req: AuthRequest, res: Response) => {

    res.json({
      success: true,
      message: "Welcome Doctor!",
      user: req.user
    });

  }
);


router.get(
  "/admin",
  authenticateUser,
  authorizeRoles("ADMIN"),
  (req: AuthRequest, res: Response) => {

    res.json({
      success: true,
      message: "Welcome Admin!",
      user: req.user
    });

  }
);


export default router;