import "./config/env.js";
import express from "express";
import { healthRouter } from "./routes/health.js";
import { imageRouter } from "./routes/image.js";
import { sceneRouter } from "./routes/scene.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use(healthRouter);
  app.use(sceneRouter);
  app.use(imageRouter);

  return app;
}

