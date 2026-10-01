import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL;

if (!apiKey) {
  throw new Error("OPENROUTER_API_KEY is not configured");
}

if (!model) {
  throw new Error("OPENROUTER_MODEL is not configured");
}

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:5000",
    "X-Title": "HealthFlow",
  },
});

export const OPENROUTER_MODEL = model;