
(() => {
  "use strict";

  // ==========================================
  // MY AI FILM STUDIO
  // Main frontend application
  // ==========================================

  const STORAGE_KEY = "my-ai-film-studio-v1";
  const DB_NAME = "MyAIFilmStudioFiles";
  const DB_VERSION = 1;

  const $ = (selector, root = document) => root.querySelector(selector);

  const appContent = $("#appContent");
  const pageTitle = $("#pageTitle");
  const projectSelect = $("#projectSelect");
  const newProjectBtn = $("#newProjectBtn");
  const modalRoot = $("#modalRoot");
  const toastRoot = $("#toastRoot");

  if (!appContent || !projectSelect || !newProjectBtn) {
    console.error("Film Studio: Required HTML elements were not found.");
    return;
  }

  let activePage = "dashboard";
  let dbPromise = null;

  const pageNames = {
    dashboard: "Dashboard",
    image: "Image Studio",
    video: "Video Studio",
    voice: "Voice Studio",
    characters: "Character Studio",
    library: "Element Library",
    editor: "Editing Center"
  };

  // ==========================================
  // GENERAL HELPERS
  // ==========================================

  function uid() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 9)
    );
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function formatDate(value) {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + " KB";
    }
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function showToast(message, type = "success") {
    if (!toastRoot) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastRoot.appendChild(toast);

    setTimeout(() => toast.remove(), 3500);
  }

  // ==========================================
  // PROJECT DATA
  // ==========================================

  function createProject(name) {
    return {
      id: uid(),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      characters: [],
      assets: [],
      requests: [],
      timeline: []
    };
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved);

        if (Array.isArray(parsed.projects)) {
          parsed.projects = parsed.projects.map(project => ({
            ...project,
            characters: project.characters || [],
            assets: project.assets || [],
            requests: project.requests || [],
            timeline: project.timeline || []
          }));

          if (!parsed.projects.length) {
            parsed.projects.push(createProject("My First Film"));
          }

          return parsed;
        }
      }
    } catch (error) {
      console.error("Could not load saved studio data:", error);
    }

    return {
      currentProjectId: null,
      projects: [createProject("My First Film")]
    };
  }

  const state = loadState();

  if (!state.currentProjectId ||
      !state.projects.some(p => p.id === state.currentProjectId)) {
    state.currentProjectId = state.projects[0].id;
  }

  function getCurrentProject() {
    return state.projects.find(
      project => project.id === state.currentProjectId
    );
  }

  function saveState() {
    const project = getCurrentProject();

    if (project) {
      project.updatedAt = new Date().toISOString();
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Could not save studio data:", error);
      showToast("Could not save data in this browser.", "error");
    }

    updateProjectSelector();
  }

  function updateProjectSelector() {
    projectSelect.innerHTML = state.projects.map(project => `
      <option value="${escapeHTML(project.id)}"
        ${project.id === state.currentProjectId ? "selected" : ""}>
        ${escapeHTML(project.name)}
      </option>
    `).join("");

    projectSelect.value = state.currentProjectId;
  }

  function createNewProject() {
    const name = window.prompt("Enter your new film project name:");

    if (!name || !name.trim()) return;

    const project = createProject(name.trim());

    state.projects.push(project);
    state.currentProjectId = project.id;

    saveState();
    activePage = "dashboard";
    render();

    showToast("Your new film project has been created!");
  }

  // ==========================================
  // FILE DATABASE: INDEXEDDB
  // Stores actual uploaded files separately
  // ==========================================

  function openFileDatabase() {
    if (!("indexedDB" in window)) {
      return Promise.reject(
        new Error("Your browser does not support IndexedDB.")
      );
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const database = event.target.result;

        if (!database.objectStoreNames.contains("files")) {
          database.createObjectStore("files", {
            keyPath: "key"
          });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return dbPromise;
  }

  function fileKey(projectId, assetId) {
    return `${projectId}:${assetId}`;
  }

  async function saveFile(projectId, assetId, file) {
    const database = await openFileDatabase();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction("files", "readwrite");
      const store = transaction.objectStore("files");

      store.put({
        key: fileKey(projectId, assetId),
        blob: file
      });

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async function getFile(projectId, assetId) {
    const database = await openFileDatabase();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction("files", "readonly");
      const request = transaction.objectStore("files").get(
        fileKey(projectId, assetId)
      );

      request.onsuccess = () => {
        resolve(request.result?.blob || null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function deleteFile(projectId, assetId) {
    const database = await openFileDatabase();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction("files", "readwrite");

      transaction.objectStore("files").delete(
        fileKey(projectId, assetId)
      );

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // ==========================================
  // FILE UPLOADS
  // ==========================================

  async function handleUploads(input) {
    const project = getCurrentProject();
    const files = Array.from(input.files || []);
    const kind = input.dataset.kind || "general";

    if (!project || !files.length) return;

    let successful = 0;

    input.disabled = true;

    try {
      for (const file of files) {
        const assetId = uid();

        const asset = {
          id: assetId,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          kind,
          createdAt: new Date().toISOString()
        };

        try {
          await saveFile(project.id, assetId, file);
          project.assets.unshift(asset);
          successful++;
        } catch (error) {
          console.error("File upload error:", error);
          showToast(`Could not save ${file.name}.`, "error");
        }
      }

      if (successful) {
        saveState();
        render();

        showToast(
          successful === 1
            ? "File uploaded successfully!"
            : `${successful} files uploaded successfully!`
        );
      }
    } finally {
      input.disabled = false;
      input.value = "";
    }
  }

  function uploadBox(kind, accept, heading, description) {
    return `
      <div class="panel upload-panel">
        <h3>${escapeHTML(heading)}</h3>
        <p>${escapeHTML(description)}</p>

        <label class="upload-label">
          <span>＋ Choose files</span>
          <input
            type="file"
            accept="${escapeHTML(accept)}"
            data-kind="${escapeHTML(kind)}"
            multiple
          >
        </label>

        <p class="muted small-text">
          Files are stored locally in your browser for this project.
        </p>
      </div>
    `;
  }

  async function hydratePreviews() {
    const project = getCurrentProject();
    if (!project) return;

    const previewImages = appContent.querySelectorAll(
      "img[data-preview-key]"
    );

    for (const image of previewImages) {
      const assetId = image.dataset.previewKey;
      const asset = project.assets.find(item => item.id === assetId);

      if (!asset || !asset.type.startsWith("image/")) continue;

      try {
        const blob = await getFile(project.id, assetId);

        if (blob) {
          image.src = URL.createObjectURL(blob);
        }
      } catch (error) {
        console.warn("Could not load image preview:", error);
      }
    }
  }

  // ==========================================
  // REUSABLE INTERFACE COMPONENTS
  // ==========================================

  function panel(title, content, subtitle = "") {
    return `
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h3>${escapeHTML(title)}</h3>
            ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ""}
          </div>
        </div>
        ${content}
      </section>
    `;
  }

  function emptyState(title, description) {
    return `
      <div class="empty-state">
        <div class="empty-icon">✦</div>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(description)}</p>
      </div>
    `;
  }

  function assetCard(asset) {
    const isImage = asset.type.startsWith("image/");

    return `
      <article class="asset-card">
        ${isImage
          ? `<img class="asset-preview"
               data-preview-key="${escapeHTML(asset.id)}"
               alt="${escapeHTML(asset.name)}">`
          : `<div class="asset-icon">
               ${asset.type.startsWith("video/") ? "▶" :
                 asset.type.startsWith("audio/") ? "♫" : "▤"}
             </div>`
        }

        <div class="asset-info">
          <h4>${escapeHTML(asset.name)}</h4>
          <p>${escapeHTML(asset.kind)} · ${formatBytes(asset.size)}</p>
        </div>

        <button class="secondary-btn"
          data-action="delete-asset"
          data-id="${escapeHTML(asset.id)}">
          Delete
        </button>
      </article>
    `;
  }

  function requestList(requests) {
    if (!requests.length) {
      return emptyState(
        "No saved requests yet",
        "Your saved image, video and voice prompts will appear here."
      );
    }

    return `
      <div class="request-list">
        ${requests.slice(0, 8).map(request => `
          <article class="request-card">
            <div>
              <span class="request-type">${escapeHTML(request.kind)}</span>
              <h4>${escapeHTML(request.title || "Untitled request")}</h4>
              <p>${escapeHTML(request.prompt)}</p>
              <small>
                ${formatDate(request.createdAt)} ·
                ${escapeHTML(request.status)}
              </small>
            </div>

            <button class="secondary-btn"
              data-action="delete-request"
              data-id="${escapeHTML(request.id)}">
              Delete
            </button>
          </article>
        `).join("")}
      </div>
    `;
  }

  // ==========================================
  // DASHBOARD
  // ==========================================

  function renderDashboard() {
    const project = getCurrentProject();

    return `
      <div class="welcome-section">
        <p class="eyebrow">WELCOME TO YOUR CREATIVE UNIVERSE</p>
        <h2>${escapeHTML(project.name)}</h2>
        <p>Everything you need to plan and create your film is here.</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span>Projects</span>
          <strong>${state.projects.length}</strong>
        </div>

        <div class="stat-card">
          <span>Characters</span>
          <strong>${project.characters.length}</strong>
        </div>

        <div class="stat-card">
          <span>Saved assets</span>
          <strong>${project.assets.length}</strong>
        </div>

        <div class="stat-card">
          <span>Saved prompts</span>
          <strong>${project.requests.length}</strong>
        </div>
      </div>

      ${panel(
        "Your film production tools",
        `
          <div class="feature-grid">
            <button class="feature-card" data-page="image">
              <span>▧</span>
              <strong>Image Studio</strong>
              <small>Create and organize image prompts</small>
            </button>

            <button class="feature-card" data-page="video">
              <span>▶</span>
              <strong>Video Studio</strong>
              <small>Plan scenes and video prompts</small>
            </button>

            <button class="feature-card" data-page="voice">
              <span>♫</span>
              <strong>Voice Studio</strong>
              <small>Prepare dialogue and voice prompts</small>
            </button>

            <button class="feature-card" data-page="characters">
              <span>♙</span>
              <strong>Character Studio</strong>
              <small>Build and save your characters</small>
            </button>

            <button class="feature-card" data-page="library">
              <span>▤</span>
              <strong>Element Library</strong>
              <small>Manage your creative assets</small>
            </button>

            <button class="feature-card" data-page="editor">
              <span>✂</span>
              <strong>Editing Center</strong>
              <small>Organize uploaded video and audio</small>
            </button>
          </div>
        `
      )}

      ${panel(
        "Recent saved prompts",
        requestList(project.requests)
      )}
    `;
  }

  // ==========================================
  // IMAGE, VIDEO AND VOICE STUDIOS
  // ==========================================

  function renderGenerationStudio(kind) {
    const project = getCurrentProject();

    const settings = {
      image: {
        title: "Create an image prompt",
        subtitle: "Describe the image you want to create.",
        placeholder: "Describe the character, scene, lighting, camera angle, appearance and visual style...",
        uploadHeading: "Reference images",
        uploadDescription: "Upload pictures that can guide your future image generation.",
        accept: "image/*",
        button: "Generate image"
      },
      video: {
        title: "Create a video prompt",
        subtitle: "Plan your cinematic scene.",
        placeholder: "Describe the scene, camera movement, character actions, environment, lighting and duration...",
        uploadHeading: "Scene references",
        uploadDescription: "Upload reference images or video clips for your scene.",
        accept: "image/*,video/*",
        button: "Generate video"
      },
      voice: {
        title: "Create a voice prompt",
        subtitle: "Prepare dialogue, narration or voice direction.",
        placeholder: "Write the dialogue and describe the character's voice, emotion, accent and delivery...",
        uploadHeading: "Voice references",
        uploadDescription: "Upload audio references for future voice integration.",
        accept: "audio/*",
        button: "Generate voice"
      }
    }[kind];

    return `
      <div class="studio-intro">
        <p class="eyebrow">MY AI FILM STUDIO</p>
        <h2>${settings.title}</h2>
        <p>${settings.subtitle}</p>
      </div>

      ${panel(
        settings.title,
        `
          <form class="studio-form" data-form="generation"
            data-kind="${kind}">

            <label for="requestTitle">Request name</label>
            <input id="requestTitle" name="title"
              type="text" placeholder="Give your request a name">

            <label for="requestPrompt">Your prompt</label>
            <textarea id="requestPrompt" name="prompt"
              rows="7" required
              placeholder="${escapeHTML(settings.placeholder)}"></textarea>

            <label for="requestNotes">Additional notes (optional)</label>
            <textarea id="requestNotes" name="notes"
              rows="3" placeholder="Extra instructions..."></textarea>

            ${kind === "video" ? `
              <label for="videoReference">Reference image (optional)</label>
              <select id="videoReference" name="referenceAssetId">
                <option value="">Create video from text only</option>
                ${project.assets.filter(asset => asset.type.startsWith("image/")).map(asset => `
                  <option value="${escapeHTML(asset.id)}">${escapeHTML(asset.name)}</option>
                `).join("")}
              </select>
            ` : ""}

            <p class="muted small-text">
              Uses your own Puter free monthly allowance. This studio never buys credits.
              If the allowance runs out, generation stops until it refreshes.
            </p>

            <button type="submit" class="primary-btn">
              ${settings.button}
            </button>
          </form>
        `
      )}

      ${uploadBox(
        kind === "voice" ? "voice-reference" : "reference",
        settings.accept,
        settings.uploadHeading,
        settings.uploadDescription
      )}

      ${panel(
        "Your saved requests",
        requestList(project.requests.filter(item => item.kind === kind))
      )}
    `;
  }

  // ==========================================
  // CHARACTER STUDIO
  // ==========================================

  function renderCharacters() {
    const project = getCurrentProject();

    const characterAssets = project.assets.filter(
      asset => asset.kind === "character-reference" ||
               asset.kind === "reference"
    );

    return `
      <div class="studio-intro">
        <p class="eyebrow">CHARACTER MANAGEMENT</p>
        <h2>Your character universe</h2>
        <p>Save character details and reuse their information throughout your film project.</p>
      </div>

      ${panel(
        "Create a character",
        `
          <form class="studio-form" data-form="character">

            <label for="characterName">Character name *</label>
            <input id="characterName" name="name"
              required placeholder="Enter character name">

            <label for="characterRole">Character role</label>
            <input id="characterRole" name="role"
              placeholder="Main lead, villain, supporting character...">

            <label for="characterAppearance">Physical appearance</label>
            <textarea id="characterAppearance" name="appearance"
              rows="5" placeholder="Face, eyes, hair, height, body type, clothing..."></textarea>

            <label for="characterPersonality">Personality</label>
            <textarea id="characterPersonality" name="personality"
              rows="3" placeholder="Personality, behavior and mannerisms..."></textarea>

            <label for="characterReference">Reference image</label>
            <select id="characterReference" name="referenceAssetId">
              <option value="">No reference selected</option>
              ${characterAssets.map(asset => `
                <option value="${escapeHTML(asset.id)}">
                  ${escapeHTML(asset.name)}
                </option>
              `).join("")}
            </select>

            <button type="submit" class="primary-btn">
              Save character
            </button>
          </form>
        `
      )}

      ${uploadBox(
        "character-reference",
        "image/*",
        "Character reference images",
        "Upload a character's face or appearance reference before adding them to your character collection."
      )}

      ${panel(
        `Saved characters (${project.characters.length})`,
        project.characters.length
          ? `
            <div class="character-grid">
              ${project.characters.map(character => `
                <article class="character-card">
                  <div class="character-avatar">♙</div>
                  <h3>${escapeHTML(character.name)}</h3>
                  <p>${escapeHTML(character.role || "Character")}</p>
                  <p>${escapeHTML(character.appearance || "No appearance description yet.")}</p>

                  <button class="secondary-btn"
                    data-action="delete-character"
                    data-id="${escapeHTML(character.id)}">
                    Delete character
                  </button>
                </article>
              `).join("")}
            </div>
          `
          : emptyState(
              "Your cast starts here",
              "Create your first character using the form above."
            )
      )}
    `;
  }

  // ==========================================
  // ELEMENT LIBRARY
  // ==========================================

  function renderLibrary() {
    const project = getCurrentProject();

    const assets = project.assets;

    return `
      <div class="studio-intro">
        <p class="eyebrow">YOUR CREATIVE STORAGE</p>
        <h2>Element Library</h2>
        <p>Keep your references, images, videos, audio and other project files organized.</p>
      </div>

      ${uploadBox(
        "general",
        "*/*",
        "Upload files to your library",
        "Add images, videos, audio recordings and other useful project references."
      )}

      ${panel(
        `All project assets (${assets.length})`,
        assets.length
          ? `<div class="asset-grid">${assets.map(assetCard).join("")}</div>`
          : emptyState(
              "Your library is empty",
              "Upload your first asset to begin building your library."
            )
      )}
    `;
  }

  // ==========================================
  // EDITING CENTER
  // ==========================================

  function renderEditor() {
    const project = getCurrentProject();

    const mediaAssets = project.assets.filter(asset =>
      asset.type.startsWith("video/") ||
      asset.type.startsWith("audio/")
    );

    return `
      <div class="studio-intro">
        <p class="eyebrow">FILM POST-PRODUCTION</p>
        <h2>Editing Center</h2>
        <p>Organize your imported video and audio files into a simple project timeline.</p>
      </div>

      ${panel(
        "Available media",
        mediaAssets.length
          ? `
            <div class="media-list">
              ${mediaAssets.map(asset => `
                <div class="media-row">
                  <div>
                    <strong>${escapeHTML(asset.name)}</strong>
                    <small>${escapeHTML(asset.type)} · ${formatBytes(asset.size)}</small>
                  </div>

                  <button class="secondary-btn"
                    data-action="add-to-timeline"
                    data-id="${escapeHTML(asset.id)}">
                    + Add to timeline
                  </button>
                </div>
              `).join("")}
            </div>
          `
          : emptyState(
              "No video or audio files yet",
              "Upload video or audio files to your Element Library first."
            )
      )}

      ${panel(
        `Your timeline (${project.timeline.length} items)`,
        project.timeline.length
          ? `
            <div class="timeline-list">
              ${project.timeline.map((item, index) => {
                const asset = project.assets.find(
                  assetItem => assetItem.id === item.assetId
                );

                if (!asset) return "";

                return `
                  <div class="timeline-row">
                    <span class="timeline-number">${index + 1}</span>
                    <div class="timeline-info">
                      <strong>${escapeHTML(asset.name)}</strong>
                      <small>${escapeHTML(asset.type)}</small>
                    </div>

                    <button class="secondary-btn"
                      data-action="move-up"
                      data-id="${escapeHTML(item.id)}"
                      ${index === 0 ? "disabled" : ""}>↑</button>

                    <button class="secondary-btn"
                      data-action="move-down"
                      data-id="${escapeHTML(item.id)}"
                      ${index === project.timeline.length - 1 ? "disabled" : ""}>↓</button>

                    <button class="secondary-btn"
                      data-action="remove-timeline"
                      data-id="${escapeHTML(item.id)}">Remove</button>
                  </div>
                `;
              }).join("")}
            </div>
          `
          : emptyState(
              "Your editing timeline is empty",
              "Add an uploaded video or audio file to start organizing your film."
            )
      )}

      ${uploadBox(
        "general",
        "video/*,audio/*",
        "Import editing media",
        "Upload video clips and audio files to make them available in your editing workspace."
      )}
    `;
  }

  // ==========================================
  // RENDER THE ACTIVE PAGE
  // ==========================================

  function render() {
    const pages = {
      dashboard: renderDashboard,
      image: () => renderGenerationStudio("image"),
      video: () => renderGenerationStudio("video"),
      voice: () => renderGenerationStudio("voice"),
      characters: renderCharacters,
      library: renderLibrary,
      editor: renderEditor
    };

    const renderPage = pages[activePage] || renderDashboard;

    pageTitle.textContent = pageNames[activePage] || "Dashboard";

    document.querySelectorAll(".nav-link").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === activePage
      );
    });

    appContent.innerHTML = renderPage();

    updateProjectSelector();
    hydratePreviews();
  }

  // ==========================================
  // AI GENERATION: PUTER.JS
  // The user signs in with their own Puter account.
  // The app never buys credits or enters payment details.
  // ==========================================

  async function saveGeneratedMedia(project, kind, media) {
    const mediaUrl = media.currentSrc || media.src;

    if (!mediaUrl) {
      throw new Error("The AI did not return a downloadable media file.");
    }

    // Some providers allow browser downloads; others block cross-origin copying.
    // If copying is blocked, the preview and direct result link still work.
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error("The browser could not copy the generated file.");
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error("The generated file was empty.");
    }

    const defaultTypes = {
      image: "image/png",
      video: "video/mp4",
      voice: "audio/mpeg"
    };

    const type = blob.type ||
      media.getAttribute("data-mime-type") ||
      defaultTypes[kind] || "application/octet-stream";

    const extensions = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg"
    };

    const assetId = uid();
    const asset = {
      id: assetId,
      name: `AI-${kind}-${Date.now()}.${extensions[type] || "file"}`,
      type,
      size: blob.size,
      kind: `generated-${kind}`,
      createdAt: new Date().toISOString()
    };

    await saveFile(project.id, assetId, blob);
    project.assets.unshift(asset);
    return asset;
  }

  async function saveGenerationRequest(form) {
    const project = getCurrentProject();
    const data = new FormData(form);
    const prompt = String(data.get("prompt") || "").trim();
    const notes = String(data.get("notes") || "").trim();
    const kind = form.dataset.kind;
    const button = form.querySelector('button[type="submit"]');

    if (!project || !prompt) {
      showToast("Please enter a prompt first.", "error");
      return;
    }

    if (!window.puter || !puter.ai || !puter.auth) {
      showToast("Puter.js did not load. Check your internet connection and refresh.", "error");
      return;
    }

    let resultBox = form.parentElement.querySelector(".ai-generation-result");
    if (resultBox) resultBox.remove();

    resultBox = document.createElement("div");
    resultBox.className = "ai-generation-result panel";
    resultBox.style.marginTop = "18px";
    resultBox.textContent = "Connecting to your AI account...";
    form.insertAdjacentElement("afterend", resultBox);

    if (button) {
      button.disabled = true;
      button.textContent = "Generating...";
    }

    const request = {
      id: uid(),
      kind,
      title: String(data.get("title") || "").trim() ||
        `${kind.charAt(0).toUpperCase() + kind.slice(1)} request`,
      prompt,
      notes,
      status: "Generating with Puter AI...",
      createdAt: new Date().toISOString()
    };

    project.requests.unshift(request);
    saveState();

    try {
      // Sign in only when needed. Puter will use the account's free allowance.
      if (!puter.auth.isSignedIn()) {
        resultBox.textContent = "Please sign in to your free Puter account in the window that appears.";
        await puter.auth.signIn();
      }

      if (!puter.auth.isSignedIn()) {
        throw new Error("Puter sign-in was not completed.");
      }

      const fullPrompt = [
        prompt,
        notes ? `Additional instructions: ${notes}` : ""
      ].filter(Boolean).join("\n\n");

      let media;

      if (kind === "image") {
        resultBox.textContent = "Generating your image...";
        media = await puter.ai.txt2img(fullPrompt);
      } else if (kind === "video") {
        resultBox.textContent = "Generating your video. This may take several minutes...";

        const videoOptions = {};
        const referenceAssetId = String(data.get("referenceAssetId") || "");

        if (referenceAssetId) {
          const referenceBlob = await getFile(project.id, referenceAssetId);
          if (!referenceBlob) {
            throw new Error("The selected reference image could not be found.");
          }
          videoOptions.input_reference = referenceBlob;
        }

        media = await puter.ai.txt2vid(fullPrompt, videoOptions);
      } else if (kind === "voice") {
        resultBox.textContent = "Generating your voice...";
        media = await puter.ai.txt2speech(fullPrompt);
      } else {
        throw new Error("Unknown generation type.");
      }

      if (!media || !(media.src || media.currentSrc)) {
        throw new Error("The AI returned an empty result.");
      }

      resultBox.replaceChildren();

      const heading = document.createElement("h3");
      heading.textContent = `Your ${kind} is ready`;
      resultBox.appendChild(heading);

      media.style.display = "block";
      media.style.maxWidth = "100%";
      media.style.marginTop = "12px";
      media.style.borderRadius = "10px";

      if (kind === "image") {
        media.alt = request.title;
        media.style.height = "auto";
      } else {
        media.controls = true;
        media.style.width = "100%";
      }

      resultBox.appendChild(media);

      const resultLink = document.createElement("a");
      resultLink.href = media.currentSrc || media.src;
      resultLink.target = "_blank";
      resultLink.rel = "noopener noreferrer";
      resultLink.textContent = "Open generated file";
      resultLink.style.display = "inline-block";
      resultLink.style.marginTop = "12px";
      resultBox.appendChild(resultLink);

      let savedLocally = false;
      try {
        await saveGeneratedMedia(project, kind, media);
        savedLocally = true;
      } catch (saveError) {
        console.warn("Generated file could not be copied into local library:", saveError);
      }

      request.status = savedLocally
        ? "Generated and saved in Element Library"
        : "Generated — use the result link to open or download it";

      saveState();

      const note = document.createElement("p");
      note.className = "muted small-text";
      note.textContent = savedLocally
        ? "A copy was saved in your Element Library."
        : "The preview is ready, but this provider did not allow the browser to copy it into your local library. Open the result link to save it.";
      resultBox.appendChild(note);

      showToast(`Your ${kind} is ready!`);

    } catch (error) {
      console.error("AI generation error:", error);

      const message = error?.message || String(error);
      const errorCode = String(error?.code || error?.errorCode || "");

      if (errorCode === "insufficient_funds" || /insufficient_funds|allowance|credits exhausted/i.test(message)) {
        resultBox.textContent = "Your free monthly Puter allowance is used up. No purchase was made. Close any upgrade prompt and try again after your allowance refreshes.";
      } else if (/cancel|sign.?in/i.test(message)) {
        resultBox.textContent = "Sign-in was cancelled. No generation was started.";
      } else {
        resultBox.textContent = `AI generation failed: ${message}`;
      }

      request.status = `Generation failed: ${message}`;
      saveState();
      showToast("AI generation could not be completed.", "error");

    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = kind === "image" ? "Generate image" :
          kind === "video" ? "Generate video" : "Generate voice";
      }
    }
  }

  // ==========================================
  // SAVE CHARACTERS
  // ==========================================

  function saveCharacter(form) {
    const project = getCurrentProject();
    const data = new FormData(form);

    const name = String(data.get("name") || "").trim();

    if (!name) {
      showToast("Please enter a character name.", "error");
      return;
    }

    project.characters.unshift({
      id: uid(),
      name,
      role: String(data.get("role") || "").trim(),
      appearance: String(data.get("appearance") || "").trim(),
      personality: String(data.get("personality") || "").trim(),
      referenceAssetId: String(
        data.get("referenceAssetId") || ""
      ),
      createdAt: new Date().toISOString()
    });

    saveState();
    render();

    showToast(`${name} has been added to your characters!`);
  }

  // ==========================================
  // BUTTON ACTIONS
  // ==========================================

  async function handleAction(button) {
    const project = getCurrentProject();
    const action = button.dataset.action;
    const id = button.dataset.id;

    if (!project) return;

    switch (action) {
      case "delete-character": {
        const character = project.characters.find(item => item.id === id);

        if (!character) return;

        if (!window.confirm(`Delete ${character.name}?`)) return;

        project.characters = project.characters.filter(
          item => item.id !== id
        );

        saveState();
        render();
        showToast("Character deleted.");
        break;
      }

      case "delete-asset": {
        const asset = project.assets.find(item => item.id === id);

        if (!asset) return;

        if (!window.confirm(`Delete ${asset.name}?`)) return;

        try {
          await deleteFile(project.id, id);
        } catch (error) {
          console.warn("Could not delete stored file:", error);
        }

        project.assets = project.assets.filter(
          item => item.id !== id
        );

        project.timeline = project.timeline.filter(
          item => item.assetId !== id
        );

        saveState();
        render();
        showToast("Asset deleted.");
        break;
      }

      case "delete-request": {
        project.requests = project.requests.filter(
          item => item.id !== id
        );

        saveState();
        render();
        showToast("Request deleted.");
        break;
      }

      case "add-to-timeline": {
        const asset = project.assets.find(item => item.id === id);

        if (!asset) return;

        if (project.timeline.some(item => item.assetId === id)) {
          showToast("This media is already in the timeline.", "error");
          return;
        }

        project.timeline.push({
          id: uid(),
          assetId: id
        });

        saveState();
        render();
        showToast("Media added to timeline.");
        break;
      }

      case "remove-timeline": {
        project.timeline = project.timeline.filter(
          item => item.id !== id
        );

        saveState();
        render();
        break;
      }

      case "move-up":
      case "move-down": {
        const index = project.timeline.findIndex(item => item.id === id);

        if (index < 0) return;

        const nextIndex = action === "move-up" ? index - 1 : index + 1;

        if (nextIndex < 0 || nextIndex >= project.timeline.length) {
          return;
        }

        const [item] = project.timeline.splice(index, 1);
        project.timeline.splice(nextIndex, 0, item);

        saveState();
        render();
        break;
      }
    }
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  document.addEventListener("click", event => {
    const pageButton = event.target.closest("[data-page]");

    if (pageButton) {
      const page = pageButton.dataset.page;

      if (pageNames[page]) {
        activePage = page;
        render();
      }

      return;
    }

    const actionButton = event.target.closest("[data-action]");

    if (actionButton) {
      handleAction(actionButton);
    }
  });

  newProjectBtn.addEventListener("click", createNewProject);

  projectSelect.addEventListener("change", () => {
    state.currentProjectId = projectSelect.value;
    saveState();
    render();
  });

  appContent.addEventListener("submit", event => {
    const form = event.target.closest("form[data-form]");

    if (!form) return;

    event.preventDefault();

    if (form.dataset.form === "generation") {
      saveGenerationRequest(form);
    }

    if (form.dataset.form === "character") {
      saveCharacter(form);
    }
  });

  appContent.addEventListener("change", event => {
    const input = event.target.closest('input[type="file"][data-kind]');

    if (input) {
      handleUploads(input);
    }
  });

  // ==========================================
  // START THE STUDIO
  // ==========================================

  updateProjectSelector();
  saveState();
  render();

  console.log("My AI Film Studio is ready!");

})();
