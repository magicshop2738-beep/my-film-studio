
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const router = express.Router();
const here = path.dirname(fileURLToPath(import.meta.url));

const uploadRoot = path.resolve(here, "../../uploads");
const databaseFile = path.resolve(here, "../../database/uploads.json");

const allowedCategories = ["audio", "images", "references", "videos"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

async function readRecords() {
  try {
    return JSON.parse(await fs.readFile(databaseFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(path.dirname(databaseFile), { recursive: true });
    await fs.writeFile(databaseFile, "[]");
    return [];
  }
}

async function saveRecords(records) {
  await fs.mkdir(path.dirname(databaseFile), { recursive: true });
  await fs.writeFile(databaseFile, JSON.stringify(records, null, 2));
}

// GET: List uploaded files
router.get("/", async (req, res, next) => {
  try {
    let files = await readRecords();

    if (req.query.category) {
      files = files.filter(
        item => item.category === req.query.category
      );
    }

    if (req.query.projectId) {
      files = files.filter(
        item => item.projectId === req.query.projectId
      );
    }

    res.json({ success: true, files });
  } catch (error) {
    next(error);
  }
});

// POST: Save an uploaded file
// Send JSON containing:
// category, fileName, data (base64), and optional projectId.
router.post("/", async (req, res, next) => {
  try {
    const { category, fileName, data, projectId = null } = req.body;

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid upload category."
      });
    }

    if (typeof fileName !== "string" || !fileName.trim()) {
      return res.status(400).json({
        success: false,
        message: "File name is required."
      });
    }

    if (typeof data !== "string") {
      return res.status(400).json({
        success: false,
        message: "File data is required."
      });
    }

    const base64 = data.replace(/^data:[^;]+;base64,/, "");

    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file data."
      });
    }

    const buffer = Buffer.from(base64, "base64");

    if (!buffer.length || buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        message: "File must be smaller than 25 MB."
      });
    }

    const extension = path.extname(path.basename(fileName))
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, "");

    const id = randomUUID();
    const storedName = `${id}${extension}`;
    const directory = path.join(uploadRoot, category);

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, storedName), buffer);

    const record = {
      id,
      originalName: path.basename(fileName),
      storedName,
      category,
      projectId,
      size: buffer.length,
      path: `/uploads/${category}/${storedName}`,
      createdAt: new Date().toISOString()
    };

    const records = await readRecords();
    records.push(record);
    await saveRecords(records);

    res.status(201).json({
      success: true,
      file: record
    });
  } catch (error) {
    next(error);
  }
});

// DELETE: Remove an uploaded file
router.delete("/:id", async (req, res, next) => {
  try {
    const records = await readRecords();
    const record = records.find(item => item.id === req.params.id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Uploaded file not found."
      });
    }

    const safePath = path.join(
      uploadRoot,
      record.category,
      record.storedName
    );

    await fs.rm(safePath, { force: true });

    await saveRecords(
      records.filter(item => item.id !== req.params.id)
    );

    res.json({
      success: true,
      message: "File deleted successfully."
    });
  } catch (error) {
    next(error);
  }
});

export default router;
