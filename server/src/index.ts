import "dotenv/config";
import express from "express";
import cors from "cors";
import "./lib/db.js";
import { questionsRouter } from "./routes/questions.js";
import { reviewRouter } from "./routes/review.js";
import { testsRouter } from "./routes/tests.js";
import { statsRouter } from "./routes/stats.js";
import { insightsRouter } from "./routes/insights.js";
import { settingsRouter } from "./routes/settings.js";
import { leetcodeRouter } from "./routes/leetcode.js";
import { analysisRouter } from "./routes/analysis.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api/questions", questionsRouter);
app.use("/api/review", reviewRouter);
app.use("/api/tests", testsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/leetcode", leetcodeRouter);
app.use("/api/analysis", analysisRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`leetrack server listening on http://localhost:${port}`));
