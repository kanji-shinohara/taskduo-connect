import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AgentState {
  isActive: boolean;
  serverUrl: string;
  apiKey: string;
  workerName: string;
  setActive: (active: boolean) => void;
  setConfig: (url: string, key: string, name: string) => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      isActive: false,
      serverUrl: "",
      apiKey: "",
      workerName: "",

      setActive: (active) => set({ isActive: active }),
      setConfig: (url, key, name) =>
        set({ serverUrl: url, apiKey: key, workerName: name }),
    }),
    {
      name: "taskduo-agent-storage",
    }
  )
);
