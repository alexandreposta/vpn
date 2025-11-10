/// <reference types="vite/client" />

interface Window {
  electron?: {
    isElectron: boolean;
    wireguard: {
      check: () => Promise<{ installed: boolean; path?: string; error?: string }>;
      install: (
        instanceId: string,
        configBody: string
      ) => Promise<{ success: boolean; instanceId: string; configPath?: string }>;
      activate: (instanceId: string) => Promise<{ success: boolean; instanceId: string }>;
      deactivate: (instanceId: string) => Promise<{ success: boolean; instanceId: string }>;
      uninstall: (instanceId: string) => Promise<{ success: boolean; instanceId: string; error?: string }>;
      status: (instanceId: string) => Promise<{ active: boolean; instanceId: string; output?: string }>;
      run: (
        instanceId: string,
        configBody: string
      ) => Promise<{ success: boolean; message?: string; error?: string; instanceId: string }>;
      stop: (
        instanceId: string
      ) => Promise<{ success: boolean; message?: string; error?: string; instanceId: string }>;
    };
  };
}
