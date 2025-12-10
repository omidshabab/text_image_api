import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Text Image API is running",
    timestamp: new Date().toISOString(),
  });
});

