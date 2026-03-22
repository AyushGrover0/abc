const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("orbital", {
  readSettings: () => ipcRenderer.invoke("settings:read"),
  writeSettings: (next) => ipcRenderer.invoke("settings:write", next),
  ollamaStatus: () => ipcRenderer.invoke("ollama:status"),
  ollamaModels: () => ipcRenderer.invoke("ollama:models"),
  openaiStatus: () => ipcRenderer.invoke("openai:status"),
  ollamaPull: (modelName) => ipcRenderer.invoke("ollama:pull", modelName),
  createChat: () => ipcRenderer.invoke("chat:new"),
  deleteChat: (chatId) => ipcRenderer.invoke("chat:delete", chatId),
  sendChat: (payload) => ipcRenderer.invoke("chat:send", payload),
  openExternal: (target) => ipcRenderer.invoke("external:open", target),
  onChatChunk: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("chat:chunk", listener);
    return () => ipcRenderer.removeListener("chat:chunk", listener);
  },
  onChatDone: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("chat:done", listener);
    return () => ipcRenderer.removeListener("chat:done", listener);
  },
  onChatError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("chat:error", listener);
    return () => ipcRenderer.removeListener("chat:error", listener);
  }
});
