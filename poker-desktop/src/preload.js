const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Navigate the Electron window to a different server URL (join a friend's game)
  navigateTo: (url) => ipcRenderer.invoke("navigate-to", url),
  // Return to this machine's local server
  goHome: () => ipcRenderer.invoke("go-home"),
  // Detect that we're in the desktop app
  isDesktop: true,
});
