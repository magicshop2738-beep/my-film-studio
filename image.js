
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, "../uploads/images");
const COMFY_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

async function submitWorkflow(workflow) {
  const response = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow })
  });

  if (!response.ok) {
    throw new Error(`ComfyUI error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.prompt_id) {
    throw new Error("ComfyUI did not return a prompt ID.");
  }

  return data.prompt_id;
}

async function waitForOutput(promptId, timeout = 600000) {
  const started = Date.now();

  while (Date.now() - started < timeout) {
    const response = await fetch(
      `${COMFY_URL}/history/${promptId}`
    );

    if (!response.ok) {
      throw new Error("Could not check image generation status.");
    }

    const history = await response.json();
    const result = history[promptId];

    if (result?.status?.status_str === "error") {
      throw new Error("Image generation failed in ComfyUI.");
    }

    if (result?.outputs) {
      return result.outputs;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error("Image generation timed out.");
}

export async function generateImage({
  workflow,
  prompt,
  promptNodeId
}) {
  if (!workflow || !prompt || !promptNodeId) {
    throw new Error(
      "A workflow, prompt, and promptNodeId are required."
    );
  }

  const configuredWorkflow = structuredClone(workflow);

  if (!configuredWorkflow[promptNodeId]?.inputs) {
    throw new Error("The selected prompt node does not exist.");
  }

  configuredWorkflow[promptNodeId].inputs.text = prompt;

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const promptId = await submitWorkflow(configuredWorkflow);
  const outputs = await waitForOutput(promptId);

  const savedFiles = [];

  for (const nodeOutput of Object.values(outputs)) {
    for (const image of nodeOutput.images || []) {
      const params = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder || "",
        type: image.type || "output"
      });

      const response = await fetch(
        `${COMFY_URL}/view?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Could not download generated image.");
      }

      const extension = path.extname(image.filename) || ".png";
      const filename = `${randomUUID()}${extension}`;
      const destination = path.join(OUTPUT_DIR, filename);

      await fs.writeFile(
        destination,
        Buffer.from(await response.arrayBuffer())
      );

      savedFiles.push({
        filename,
        path: `/uploads/images/${filename}`
      });
    }
  }

  if (!savedFiles.length) {
    throw new Error("The workflow produced no images.");
  }

  return {
    success: true,
    promptId,
    images: savedFiles
  };
}
