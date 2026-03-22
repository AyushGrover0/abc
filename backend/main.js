const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFile } = require("child_process");

const APP_NAME = "LocalGPT Desktop";
const DEFAULT_MODEL = "llama3:latest";
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_PUTER_MODEL = "gpt-5.4-nano";
const OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/chat";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadDotEnv();

function uid() {
  return crypto.randomUUID();
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function createMessage(role, content) {
  return {
    id: uid(),
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

function createChat(title = "New chat") {
  return {
    id: uid(),
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      createMessage(
        "assistant",
        "You are chatting in the desktop app. For the fastest replies, use the Puter provider with a nano model."
      )
    ]
  };
}

function defaultSettings() {
  return {
    provider: {
      mode: "puter",
      modelName: DEFAULT_PUTER_MODEL,
      endpoint: OLLAMA_ENDPOINT,
      temperature: 0.7,
      webSearch: false,
      showReasoning: false,
      systemPrompt:
        "You are a helpful local AI assistant. Be clear, concise, honest about limitations, and practical."
    },
    ui: {
      activeChatId: "",
      settingsOpen: false
    },
    chats: [createChat("Welcome")]
  };
}

function normalizeSettings(parsed) {
  const defaults = defaultSettings();
  const chats = Array.isArray(parsed.chats) && parsed.chats.length > 0 ? parsed.chats : defaults.chats;
  const activeChatId =
    parsed.ui?.activeChatId && chats.some((chat) => chat.id === parsed.ui.activeChatId) ? parsed.ui.activeChatId : chats[0].id;

  return {
    ...defaults,
    ...parsed,
    provider: {
      ...defaults.provider,
      ...(parsed.provider || {})
    },
    ui: {
      ...defaults.ui,
      ...(parsed.ui || {}),
      activeChatId
    },
    chats
  };
}

function readSettings() {
  const settingsPath = getSettingsPath();

  try {
    if (!fs.existsSync(settingsPath)) {
      const initial = defaultSettings();
      initial.ui.activeChatId = initial.chats[0].id;
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }

    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return normalizeSettings(parsed);
  } catch {
    const fallback = defaultSettings();
    fallback.ui.activeChatId = fallback.chats[0].id;
    return fallback;
  }
}

function writeSettings(next) {
  const current = readSettings();
  const merged = normalizeSettings({
    ...current,
    ...next,
    provider: {
      ...current.provider,
      ...(next.provider || {})
    },
    ui: {
      ...current.ui,
      ...(next.ui || {})
    },
    chats: next.chats || current.chats
  });

  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

function runOllama(args) {
  return new Promise((resolve, reject) => {
    execFile("ollama", args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve((stdout || "").trim());
    });
  });
}

async function getOllamaStatus() {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags");
    if (!response.ok) {
      throw new Error("Ollama responded with an error.");
    }

    return {
      ok: true,
      installed: true,
      running: true
    };
  } catch {
    try {
      await runOllama(["--version"]);
      return {
        ok: true,
        installed: true,
        running: false,
        message: "Ollama is installed, but its local server is not responding."
      };
    } catch {
      return {
        ok: false,
        installed: false,
        running: false,
        message: "Ollama is not installed on this machine."
      };
    }
  }
}

async function getOllamaModels() {
  try {
    const output = await runOllama(["list"]);
    const models = output
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map((line) => line.trim().match(/^(\S+)/)?.[1])
      .filter(Boolean);

    return {
      ok: true,
      models
    };
  } catch {
    return {
      ok: false,
      models: [],
      error: "Unable to read local models."
    };
  }
}

function getOpenAIStatus() {
  if (process.env.OPENAI_API_KEY) {
    return {
      ok: true,
      configured: true,
      running: true,
      message: "OpenAI API key detected from OPENAI_API_KEY."
    };
  }

  return {
    ok: false,
    configured: false,
    running: false,
    message: "OPENAI_API_KEY is not set in the environment."
  };
}

async function pullOllamaModel(modelName) {
  if (!modelName) {
    return { ok: false, error: "Model name is required." };
  }

  try {
    const output = await runOllama(["pull", modelName]);
    return {
      ok: true,
      message: output || `${modelName} is ready.`
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || `Unable to pull ${modelName}.`
    };
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 380,
    minHeight: 640,
    backgroundColor: "#f5f1e8",
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "..", "frontend", "index.html"));
}

function summarizeTitle(prompt) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  return cleaned.length > 42 ? `${cleaned.slice(0, 39)}...` : cleaned || "New chat";
}

async function chatWithOllama(provider, messages) {
  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: provider.modelName,
      messages,
      stream: false,
      options: {
        temperature: Number(provider.temperature) || 0.7
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Local model request failed with status ${response.status}.`);
  }

  const data = await response.json();
  return data.message?.content || "No response was returned by the local model.";
}

async function chatWithOpenAI(provider, messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Set it in your environment and restart the app.");
  }

  const input = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "system" ? "developer" : message.role,
      content: message.content
    }));

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: provider.modelName || DEFAULT_OPENAI_MODEL,
      instructions: provider.systemPrompt,
      input
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI request failed with status ${response.status}. ${details}`.trim());
  }

  const data = await response.json();
  return data.output_text || "No response was returned by the OpenAI API.";
}

async function streamChatWithOllama(provider, messages, onChunk) {
  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: provider.modelName,
      messages,
      stream: true,
      options: {
        temperature: Number(provider.temperature) || 0.7
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Local model request failed with status ${response.status}.`);
  }

  if (!response.body) {
    throw new Error("Local model did not return a readable stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const payload = JSON.parse(trimmed);
      const chunk = payload.message?.content || "";
      if (chunk) {
        fullText += chunk;
        onChunk(chunk, fullText);
      }
    }
  }

  if (buffer.trim()) {
    const payload = JSON.parse(buffer.trim());
    const chunk = payload.message?.content || "";
    if (chunk) {
      fullText += chunk;
      onChunk(chunk, fullText);
    }
  }

  return fullText || "No response was returned by the local model.";
}

async function sendChatMessage(webContents, payload) {
  const { chatId, prompt, requestId } = payload;
  const settings = readSettings();
  const chat = settings.chats.find((item) => item.id === chatId);

  if (!chat) {
    return { ok: false, error: "Chat not found." };
  }

  if (!prompt.trim()) {
    return { ok: false, error: "Message cannot be empty." };
  }

  const userMessage = createMessage("user", prompt.trim());
  chat.messages.push(userMessage);
  chat.updatedAt = new Date().toISOString();

  if (chat.title === "New chat" || chat.title === "Welcome") {
    chat.title = summarizeTitle(prompt);
  }

  writeSettings({ chats: settings.chats });

  const requestMessages = [
    {
      role: "system",
      content: settings.provider.systemPrompt
    },
    ...chat.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];

  try {
    const assistantContent =
      settings.provider.mode === "openai"
        ? await chatWithOpenAI(settings.provider, requestMessages)
        : await streamChatWithOllama(settings.provider, requestMessages, (_chunk, fullText) => {
            webContents.send("chat:chunk", {
              requestId,
              chatId,
              content: fullText
            });
          });

    if (settings.provider.mode === "openai") {
      webContents.send("chat:chunk", {
        requestId,
        chatId,
        content: assistantContent
      });
    }

    chat.messages.push(createMessage("assistant", assistantContent));
    chat.updatedAt = new Date().toISOString();
    const next = writeSettings({ chats: settings.chats });
    webContents.send("chat:done", {
      requestId,
      chatId
    });
    return {
      ok: true,
      settings: next,
      chat
    };
  } catch (error) {
    webContents.send("chat:error", {
      requestId,
      chatId,
      error: error.message || "Chat request failed."
    });
    chat.messages.push(
      createMessage(
        "assistant",
        error.message ||
          (settings.provider.mode === "openai"
            ? "I could not reach the OpenAI API. Check OPENAI_API_KEY and your connection."
            : "I could not reach the local model. Make sure Ollama is running on this device.")
      )
    );
    chat.updatedAt = new Date().toISOString();
    const next = writeSettings({ chats: settings.chats });
    return {
      ok: false,
      settings: next,
      chat,
      error: error.message || "Chat request failed."
    };
  }
}

function createNewChat() {
  const settings = readSettings();
  const chat = createChat();
  const next = writeSettings({
    chats: [chat, ...settings.chats],
    ui: {
      activeChatId: chat.id
    }
  });

  return next;
}

function deleteChat(chatId) {
  const settings = readSettings();
  const remaining = settings.chats.filter((chat) => chat.id !== chatId);
  const chats = remaining.length > 0 ? remaining : [createChat("Welcome")];
  const next = writeSettings({
    chats,
    ui: {
      activeChatId: chats[0].id
    }
  });

  return next;
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("settings:read", () => readSettings());
ipcMain.handle("settings:write", (_event, next) => writeSettings(next));
ipcMain.handle("ollama:status", () => getOllamaStatus());
ipcMain.handle("ollama:models", () => getOllamaModels());
ipcMain.handle("openai:status", () => getOpenAIStatus());
ipcMain.handle("ollama:pull", (_event, modelName) => pullOllamaModel(modelName));
ipcMain.handle("chat:new", () => createNewChat());
ipcMain.handle("chat:delete", (_event, chatId) => deleteChat(chatId));
ipcMain.handle("chat:send", (event, payload) => sendChatMessage(event.sender, payload));
ipcMain.handle("external:open", (_event, target) => shell.openExternal(target));
