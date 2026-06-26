'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diskApi', {
  check:        (p) => ipcRenderer.invoke('disk:check', p),
  listVolumes:  (opts) => ipcRenderer.invoke('disk:listVolumes', opts),
});
