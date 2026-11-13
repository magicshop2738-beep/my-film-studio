
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const router = express.Router();
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../../database/projects.json");

async function read() {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "[]");
    return [];
  }
}

async function write(data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

router.get("/", async (req, res, next) => {
  try {
    res.json({ success: true, projects: await read() });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, description = "" } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "A project name is required."
      });
    }

    const projects = await read();
    const project = {
      id: randomUUID(),
      name: name.trim(),
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    projects.push(project);
    await write(projects);

    res.status(201).json({ success: true, project });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const projects = await read();
    const project = projects.find(p => p.id === req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found."
      });
    }

    if (req.body.name !== undefined) {
      if (typeof req.body.name !== "string" || !req.body.name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Project name cannot be empty."
        });
      }
      project.name = req.body.name.trim();
    }

    if (req.body.description !== undefined) {
      project.description = req.body.description;
    }

    project.updatedAt = new Date().toISOString();
    await write(projects);

    res.json({ success: true, project });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const projects = await read();
    const updated = projects.filter(p => p.id !== req.params.id);

    if (updated.length === projects.length) {
      return res.status(404).json({
        success: false,
        message: "Project not found."
      });
    }

    await write(updated);
    res.json({ success: true, message: "Project deleted." });
  } catch (error) {
    next(error);
  }
});

export default router;
