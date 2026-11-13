
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, "../uploads/audio");

const PIPER_PATH = process.env.PIPER_PATH || "piper";
const DEFAULT_VOICE =
  process.env.PIPER_VOICE ||
  "voices/en_US-lessac-medium.onnx";

export async function generateVoice({
  text,
  voice = DEFAULT_VOICE
}) {
  if (!text || !text.trim()) {
    throw new Error("Please provide dialogue for voice generation.");
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const filename = `${randomUUID()}.wav`;
  const destination = path.join(OUTPUT_DIR, filename);

  return new Promise((resolve, reject) => {
    const process = spawn(PIPER_PATH, [
      "--model",
      voice,
      "--output_file",
      destination
    ]);

    let errorOutput = "";

    process.stderr.on("data", data => {
      errorOutput += data.toString();
    });

    process.on("error", error => {
      reject(
        new Error(`Could not start Piper: ${error.message}`)
      );
    });

    process.on("close", async code => {
      if (code !== 0) {
        reject(
          new Error(errorOutput || "Piper voice generation failed.")
        );
        return;
      }

      try {
        await fs.access(destination);

        resolve({
          success: true,
          filename,
          path: `/uploads/audio/${filename}`
        });
      } catch {
        reject(new Error("Piper did not create the audio file."));
      }
    });

    process.stdin.end(text, "utf8");
  });
}
