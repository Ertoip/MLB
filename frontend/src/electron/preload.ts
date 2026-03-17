import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Add any IPC methods here for communication between renderer and main process
  platform: process.platform,
});

export {};
