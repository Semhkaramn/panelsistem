import { create } from "zustand";

interface Panel {
  id: string;
  name: string;
  loginUrl: string;
  targetUrl: string;
  email: string;
  password: string;
  elementSelector: string;
  elementLabel: string;
  isActive: boolean;
  checkInterval: number;
  lastValue: string | null;
  lastCheck: Date | null;
  lastError: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Settings {
  telegramToken: string | null;
  telegramChatIds: string[];
  dailyReportTime: string;
  dailyReportEnabled: boolean;
  timezone: string;
  hasToken?: boolean;
}

interface PanelStore {
  panels: Panel[];
  settings: Settings | null;
  loading: boolean;
  error: string | null;

  fetchPanels: () => Promise<void>;
  fetchSettings: () => Promise<void>;
  addPanel: (panel: Omit<Panel, "id" | "createdAt" | "updatedAt" | "lastValue" | "lastCheck" | "lastError" | "status">) => Promise<void>;
  updatePanel: (id: string, data: Partial<Panel>) => Promise<void>;
  deletePanel: (id: string) => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  checkPanel: (id: string) => Promise<void>;
  checkAllPanels: () => Promise<void>;
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  panels: [],
  settings: null,
  loading: false,
  error: null,

  fetchPanels: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/panels");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set({ panels: data.panels, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to fetch panels", loading: false });
    }
  },

  fetchSettings: async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set({ settings: data.settings });
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
  },

  addPanel: async (panelData) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/panels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(panelData),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set((state) => ({ panels: [...state.panels, data.panel], loading: false }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to add panel", loading: false });
      throw error;
    }
  },

  updatePanel: async (id, panelData) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/panels/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(panelData),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set((state) => ({
        panels: state.panels.map((p) => (p.id === id ? data.panel : p)),
        loading: false,
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to update panel", loading: false });
      throw error;
    }
  },

  deletePanel: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/panels/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set((state) => ({
        panels: state.panels.filter((p) => p.id !== id),
        loading: false,
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to delete panel", loading: false });
      throw error;
    }
  },

  updateSettings: async (settingsData) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsData),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      set({ settings: data.settings });
    } catch (error) {
      console.error("Failed to update settings:", error);
      throw error;
    }
  },

  checkPanel: async (id) => {
    try {
      const res = await fetch(`/api/panels/${id}/check`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      set((state) => ({
        panels: state.panels.map((p) => (p.id === id ? { ...p, ...data.panel } : p)),
      }));
    } catch (error) {
      console.error("Failed to check panel:", error);
      throw error;
    }
  },

  checkAllPanels: async () => {
    const { panels } = get();
    const activePanels = panels.filter((p) => p.isActive);

    for (const panel of activePanels) {
      try {
        await get().checkPanel(panel.id);
      } catch (error) {
        console.error(`Failed to check panel ${panel.name}:`, error);
      }
    }
  },
}));
