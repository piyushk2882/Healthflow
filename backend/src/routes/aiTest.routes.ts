import { Router, Request, Response } from "express";
import { extractHealthInformation } from "../services/ai/ai.service";

const router = Router();

router.post("/extract", async (req: Request, res: Response) => {
  try {
    const { message, conversationHistory = [], existingEvents = [] } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        message: "message is required",
      });
    }

    const result = await extractHealthInformation(
      message,
      conversationHistory,
      existingEvents
    );

    return res.status(200).json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error("AI extraction error:", error);

    return res.status(500).json({
      success: false,
      message: "AI extraction failed",
    });
  }
});

export default router;