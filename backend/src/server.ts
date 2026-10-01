import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import testRoutes from "./routes/test.routes";
import healthEventRoutes from "./routes/healthEvent.routes";
import aiTestRoutes from "./routes/aiTest.routes";
import chatRoutes from "./routes/chat.routes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/test", testRoutes);
app.use("/api/health-events", healthEventRoutes);
app.use("/api/ai-test", aiTestRoutes);
app.use("/api/chat", chatRoutes);


app.get("/", (req, res) => {
  res.json({
    message: "HealthFlow Backend is Running 🚀"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
