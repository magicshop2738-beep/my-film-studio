
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const router = express.Router();
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../../database/characters.json");

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
    let characters = await read();

    if (req.query.projectId) {
      characters = characters.filter(
        c => c.projectId === req.query.projectId
      );
    }

    res.json({ success: true, characters });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, description = "", projectId = null, referenceImages = [] } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Character name is required."
      });
    }

    const characters = await read();

    const character = {
      id: randomUUID(),
      name: name.trim(),
      description,
      projectId,
      referenceImages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    characters.push(character);
    await write(characters);

    res.status(201).json({ success: true, character });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const characters = await read();
    const character = characters.find(c => c.id === req.params.id);

    if (!character) {
      return res.status(404).json({
        success: false,
        message: "Character not found."
      });
    }

    for (const field of ["name", "description", "projectId", "referenceImages"]) {
      if (req.body[field] !== undefined) {
        character[field] = req.body[field];
      }
    }

    character.updatedAt = new Date().toISOString();
    await write(characters);

    res.json({ success: true, character });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const characters = await read();
    const updated = characters.filter(c => c.id !== req.params.id);

    if (updated.length === characters.length) {
      return res.status(404).json({
        success: false,
        message: "Character not found."
      });
    }

    await write(updated);
    res.json({ success: true, message: "Character deleted." });
  } catch (error) {
    next(error);
  }
});

export default router;
