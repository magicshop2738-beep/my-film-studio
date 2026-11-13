
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const router = express.Router();
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../../database/library.json");

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
    let items = await read();

    if (req.query.projectId) {
      items = items.filter(
        item => item.projectId === req.query.projectId
      );
    }

    if (req.query.type) {
      items = items.filter(item => item.type === req.query.type);
    }

    res.json({ success: true, items });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const {
      name,
      type,
      description = "",
      projectId = null,
      filePath = null,
      tags = []
    } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Element name is required."
      });
    }

    const allowedTypes = ["character", "location", "object", "other"];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid library element type."
      });
    }

    const items = await read();

    const item = {
      id: randomUUID(),
      name: name.trim(),
      type,
      description,
      projectId,
      filePath,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    items.push(item);
    await write(items);

    res.status(201).json({ success: true, item });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const items = await read();
    const item = items.find(i => i.id === req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Library item not found."
      });
    }

    for (const field of ["name", "type", "description", "projectId", "filePath", "tags"]) {
      if (req.body[field] !== undefined) {
        item[field] = req.body[field];
      }
    }

    item.updatedAt = new Date().toISOString();
    await write(items);

    res.json({ success: true, item });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const items = await read();
    const updated = items.filter(i => i.id !== req.params.id);

    if (updated.length === items.length) {
      return res.status(404).json({
        success: false,
        message: "Library item not found."
      });
    }

    await write(updated);
    res.json({ success: true, message: "Library item deleted." });
  } catch (error) {
    next(error);
  }
});

export default router;
