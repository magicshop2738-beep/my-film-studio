
import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Backend route imports
import projectsRouter from "./projects.js";
import charactersRouter from "./characters.js";
import libraryRouter from "./library.js";
import uploadsRouter from "./uploads.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Create storage folders
const storageFolders = [
  "uploads/images",
  "uploads/videos",
  "uploads/audio",
  "uploads/references",
  "database"
];

for (const folder of storageFolders) {
  fs.mkdirSync(path.join(projectRoot, folder), {
    recursive: true
  });
}

// Serve frontend
app.use(
  "/frontend",
  express.static(path.join(projectRoot, "frontend"))
);

// Serve uploaded media
app.use(
  "/uploads",
  express.static(path.join(projectRoot, "uploads"))
);

// Connect backend routes
app.use("/api/projects", projectsRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/library", libraryRouter);
app.use("/api/uploads", uploadsRouter);

// Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(projectRoot, "index.html"));
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "My AI Film Studio backend is running!",
    status: "online",
    aiEngines: {
      image: "Local AI integration pending",
      video: "Local AI integration pending",
      voice: "Local AI integration pending"
    }
  });
});

// API information
app.get("/api", (req, res) => {
  res.json({
    name: "My AI Film Studio",
    version: "1.0.0",
    message: "Studio backend is running. No paid AI generation APIs are configured."
  });
});

// Unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found."
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);

  res.status(500).json({
    success: false,
    message: "Something went wrong on the server."
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log("------------------------------------");
  console.log("MY AI FILM STUDIO");
  console.log("------------------------------------");
  console.log(`Server running on port ${PORT}`);
  console.log(`Homepage: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log("------------------------------------");
});
