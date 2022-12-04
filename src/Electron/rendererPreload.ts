import { contextBridge } from "electron";

const mcDesktop = {

};

contextBridge.exposeInMainWorld("_mcDesktop", mcDesktop);