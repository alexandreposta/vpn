import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowPathIcon,
  CloudIcon,
  TrashIcon,
  PlayIcon,
  StopIcon,
  ClipboardDocumentIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import {
  ConfigResponse,
  InstanceSummary,
  createInstance,
  fetchConfig,
  fetchInstances,
  fetchRegions,
  triggerInstanceAction
} from '../../lib/api';

const toLabel = (status: string | undefined) => {
  switch (status) {
    case 'running':
      return 'En ligne';
    case 'pending':
      return 'Initialisation';
    case 'stopped':
      return 'Arrêtée';
    default:
      return status ?? 'Inconnu';
  }
};

const statusPill = (instance: InstanceSummary) => {
  if (instance.wireguardStatus === 'pending') return 'bg-yellow-500/20 text-yellow-300';
  if (instance.wireguardStatus === 'ready' && instance.state?.Name === 'running')
    return 'bg-emerald-500/20 text-emerald-300';
  return 'bg-slate-500/20 text-slate-300';
};

const downloadFile = (config: ConfigResponse, fileName: string) => {
  const blob = new Blob([config.configBody], { type: config.contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const generateWindowsBatchScript = (config: ConfigResponse, apiUrl: string, instanceId: string) => {
  // Embed the config directly in the batch script to avoid download issues
  const configBase64 = btoa(config.configBody);
  
  const script = `@echo off
REM WireGuard Zero-Touch Auto-Install for Windows
REM Instance: ${instanceId}
REM Generated: ${new Date().toISOString()}

REM Check for admin privileges and auto-elevate if needed
>nul 2>&1 "%SYSTEMROOT%\\system32\\cacls.exe" "%SYSTEMROOT%\\system32\\config\\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrator privileges...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\\getadmin.vbs"
    "%temp%\\getadmin.vbs"
    exit /B

:gotAdmin
    if exist "%temp%\\getadmin.vbs" ( del "%temp%\\getadmin.vbs" )
    pushd "%CD%"
    CD /D "%~dp0"

REM Start automation
echo ============================================
echo WireGuard VPN Auto-Install
echo Instance: ${instanceId}
echo ============================================
echo.

REM Check if WireGuard is installed
set "WGPATH="
if exist "C:\\Program Files\\WireGuard\\wireguard.exe" set "WGPATH=C:\\Program Files\\WireGuard\\wireguard.exe"
if exist "%ProgramFiles%\\WireGuard\\wireguard.exe" set "WGPATH=%ProgramFiles%\\WireGuard\\wireguard.exe"
if exist "%ProgramFiles(x86)%\\WireGuard\\wireguard.exe" set "WGPATH=%ProgramFiles(x86)%\\WireGuard\\wireguard.exe"

if not defined WGPATH (
    echo [INFO] WireGuard not found. Installing automatically...
    echo [INFO] Downloading WireGuard installer...
    
    REM Download WireGuard installer
    set "INSTALLER=%TEMP%\\wireguard-installer.msi"
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://download.wireguard.com/windows-client/wireguard-installer.exe' -OutFile '%INSTALLER%' -UseBasicParsing}"
    
    if exist "%INSTALLER%" (
        echo [INFO] Installing WireGuard...
        "%INSTALLER%" /quiet /norestart
        timeout /t 5 /nobreak >nul
        
        REM Check again after install
        if exist "C:\\Program Files\\WireGuard\\wireguard.exe" (
            set "WGPATH=C:\\Program Files\\WireGuard\\wireguard.exe"
            echo [SUCCESS] WireGuard installed successfully!
        ) else (
            echo [ERROR] WireGuard installation failed.
            echo [INFO] Please install manually from https://www.wireguard.com/install/
            pause
            exit /b 1
        )
        del "%INSTALLER%"
    ) else (
        echo [ERROR] Failed to download WireGuard installer.
        echo [INFO] Please install manually from https://www.wireguard.com/install/
        pause
        exit /b 1
    )
) else (
    echo [OK] WireGuard found at: %WGPATH%
)

REM Decode and save config (embedded base64)
echo [INFO] Preparing VPN configuration...
set "CONFIGFILE=%TEMP%\\vpn-${instanceId}.conf"

REM Decode base64 config using PowerShell
powershell -Command "& {[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${configBase64}')) | Out-File -FilePath '%CONFIGFILE%' -Encoding ASCII -NoNewline}"

if not exist "%CONFIGFILE%" (
    echo [ERROR] Failed to create configuration file.
    pause
    exit /b 1
)

echo [OK] Configuration saved to: %CONFIGFILE%

REM Remove existing tunnel if present (ignore errors)
"%WGPATH%" /uninstalltunnelservice "${instanceId}" >nul 2>&1

REM Install tunnel
echo [INFO] Installing VPN tunnel...
"%WGPATH%" /installtunnelservice "%CONFIGFILE%"
if %errorlevel% neq 0 (
    echo [WARNING] Tunnel installation returned error code %errorlevel%
    echo [INFO] Trying alternative method...
)

REM Wait a moment for service to register
timeout /t 2 /nobreak >nul

REM Activate tunnel
echo [INFO] Activating VPN connection...
"%WGPATH%" /activate "${instanceId}"
if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo [SUCCESS] VPN activated successfully!
    echo ============================================
    echo.
    echo Instance: ${instanceId}
    echo Config: %CONFIGFILE%
    echo.
    echo To check status: "%WGPATH%" /status "${instanceId}"
    echo To deactivate: "%WGPATH%" /deactivate "${instanceId}"
    echo.
) else (
    echo [ERROR] Failed to activate VPN tunnel.
    echo [INFO] You can try activating manually via WireGuard GUI.
)

REM Keep window open for 10 seconds to show result
timeout /t 10
exit /b 0
`;
  return script;
};

const downloadWindowsScript = async (instance: InstanceSummary, apiUrl: string) => {
  try {
    const config = await fetchConfig(instance.instanceId, instance.region);
    if (!config.configBody) {
      alert("La configuration n'est pas encore prête. Attendez que WireGuard soit ready.");
      return;
    }

    // Check if running in Electron
    if (window.electron?.isElectron) {
      // Use Electron IPC API for instant activation
      try {
        const result = await window.electron.wireguard.run(instance.instanceId, config.configBody);
        if (result.success) {
          alert(
            `✅ VPN activé avec succès!\n\n` +
            `Instance: ${instance.instanceId}\n` +
            `Région: ${instance.region}\n` +
            `IP publique: ${instance.publicIp}\n\n` +
            `Le VPN est maintenant actif!`
          );
        } else {
          alert(`❌ Erreur lors de l'activation:\n\n${result.error}`);
        }
      } catch (error) {
        alert(`❌ Erreur Electron:\n\n${error}`);
      }
      return;
    }

    // Fallback to batch script for web version
    const script = generateWindowsBatchScript(config, apiUrl, instance.instanceId);
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vpn-${instance.instanceId}-autoinstall.bat`;
    anchor.click();
    URL.revokeObjectURL(url);
    
    alert(
      `✅ Script d'installation automatique téléchargé!\n\n` +
      `📁 Fichier: vpn-${instance.instanceId}-autoinstall.bat\n\n` +
      `🚀 UTILISATION (ZERO INTERACTION):\n` +
      `1. Double-cliquez sur le fichier .bat\n` +
      `2. Acceptez l'élévation admin (UAC)\n` +
      `3. Le script fait TOUT automatiquement:\n` +
      `   • Télécharge et installe WireGuard si manquant\n` +
      `   • Importe la configuration VPN\n` +
      `   • Active la connexion VPN\n\n` +
      `⏱️  Durée totale: ~30 secondes\n` +
      `✨ Aucune interaction requise après le double-clic!`
    );
  } catch (error) {
    alert(`Erreur: ${error}`);
  }
};

const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    alert(`${label} copié dans le presse-papier!`);
  } catch {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert(`${label} copié!`);
  }
};

const generateStopBatchScript = (instanceId: string) => {
  const script = `@echo off
REM WireGuard VPN Auto-Stop Script
REM Instance: ${instanceId}
REM Generated: ${new Date().toISOString()}

REM Check for admin privileges and auto-elevate if needed
>nul 2>&1 "%SYSTEMROOT%\\system32\\cacls.exe" "%SYSTEMROOT%\\system32\\config\\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrator privileges...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\\getadmin.vbs"
    "%temp%\\getadmin.vbs"
    exit /B

:gotAdmin
    if exist "%temp%\\getadmin.vbs" ( del "%temp%\\getadmin.vbs" )
    pushd "%CD%"
    CD /D "%~dp0"

REM Start deactivation
echo ============================================
echo WireGuard VPN Auto-Stop
echo Instance: ${instanceId}
echo ============================================
echo.

REM Find WireGuard executable
set "WGPATH="
if exist "C:\\Program Files\\WireGuard\\wireguard.exe" set "WGPATH=C:\\Program Files\\WireGuard\\wireguard.exe"
if exist "%ProgramFiles%\\WireGuard\\wireguard.exe" set "WGPATH=%ProgramFiles%\\WireGuard\\wireguard.exe"
if exist "%ProgramFiles(x86)%\\WireGuard\\wireguard.exe" set "WGPATH=%ProgramFiles(x86)%\\WireGuard\\wireguard.exe"

if not defined WGPATH (
    echo [ERROR] WireGuard not found.
    echo [INFO] VPN may not be active or WireGuard is not installed.
    timeout /t 5
    exit /b 1
)

echo [OK] WireGuard found at: %WGPATH%

REM Deactivate tunnel
echo [INFO] Deactivating VPN tunnel...
"%WGPATH%" /deactivate "${instanceId}"

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Remove tunnel service (optional - keeps config for next activation)
REM Uncomment the line below if you want to fully remove the tunnel:
REM "%WGPATH%" /uninstalltunnelservice "${instanceId}"

echo.
echo ============================================
echo [SUCCESS] VPN deactivated successfully!
echo ============================================
echo.
echo Instance: ${instanceId}
echo.
echo To reactivate, click the Run button again.
echo.

REM Keep window open for 5 seconds
timeout /t 5
exit /b 0
`;
  return script;
};

const downloadStopScript = (instanceId: string) => {
  // Check if running in Electron
  if (window.electron?.isElectron) {
    // Use Electron IPC API for instant deactivation
    window.electron.wireguard
      .stop(instanceId)
      .then((result) => {
        if (result.success) {
          alert(`✅ VPN désactivé avec succès!\n\nInstance: ${instanceId}`);
        } else {
          alert(`❌ Erreur lors de la désactivation:\n\n${result.error}`);
        }
      })
      .catch((error) => {
        alert(`❌ Erreur Electron:\n\n${error}`);
      });
    return;
  }

  // Fallback to batch script for web version
  const script = generateStopBatchScript(instanceId);
  const blob = new Blob([script], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `vpn-${instanceId}-stop.bat`;
  anchor.click();
  URL.revokeObjectURL(url);
  
  alert(
    `✅ Script de désactivation téléchargé!\n\n` +
    `📁 Fichier: vpn-${instanceId}-stop.bat\n\n` +
    `🛑 UTILISATION (ZERO INTERACTION):\n` +
    `1. Double-cliquez sur le fichier .bat\n` +
    `2. Acceptez l'élévation admin (UAC)\n` +
    `3. Le VPN est désactivé automatiquement\n\n` +
    `⏱️  Durée: ~5 secondes\n` +
    `✨ Aucune autre action requise!`
  );
};

const shareConfig = async (config: ConfigResponse, fileName: string) => {
  const file = new File([config.configBody], fileName, { type: config.contentType });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: 'Importer dans WireGuard',
      text: 'Ouvrez ce fichier avec WireGuard.'
    });
  } else {
    downloadFile(config, fileName);
  }
};

export const App = () => {
  const [selectedRegion, setSelectedRegion] = useState<string | undefined>();
  const [newName, setNewName] = useState('');
  const queryClient = useQueryClient();

  const regionsQuery = useQuery<string[]>({
    queryKey: ['regions'],
    queryFn: fetchRegions
  });

  // Set default region when regions are loaded
  if (!selectedRegion && regionsQuery.data?.length) {
    setSelectedRegion(regionsQuery.data[0]);
  }

  const instancesQuery = useQuery({
    queryKey: ['instances', selectedRegion],
    queryFn: () => fetchInstances(selectedRegion),
    enabled: !!selectedRegion
  });

  const createMutation = useMutation({
    mutationFn: () => createInstance({ region: selectedRegion!, name: newName || undefined }),
    onSuccess: () => {
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['instances'] });
    }
  });

  const actionMutation = useMutation({
    mutationFn: ({
      instanceId,
      action
    }: {
      instanceId: string;
      action: 'start' | 'stop' | 'terminate' | 'reboot';
    }) => triggerInstanceAction(instanceId, action, selectedRegion!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] });
    }
  });

  const configMutation = useMutation({
    mutationFn: ({ instanceId }: { instanceId: string }) =>
      fetchConfig(instanceId, selectedRegion!)
  });

  const handleDownload = async (instance: InstanceSummary, forIos = false) => {
    const config = await configMutation.mutateAsync({ instanceId: instance.instanceId });
    const fileName = forIos ? 'iosvpn.conf' : 'vpn.conf';
    if (!config.configBody) {
      if (config.signedUrl) {
        window.open(config.signedUrl, '_blank', 'noopener');
        return;
      }
      alert("Le profil WireGuard n'est pas encore prêt. Réessayez dans quelques instants.");
      return;
    }
    await (forIos ? shareConfig(config, fileName) : downloadFile(config, fileName));
  };

  const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

  const isLoading = regionsQuery.isLoading || instancesQuery.isLoading;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Gestionnaire VPN</h1>
          {!window.electron?.isElectron && (
            <p className="mt-2 text-sm text-slate-400">
              💡 Pour une meilleure expérience Windows :{' '}
              <a
                href="https://ddxial11gesc4.cloudfront.net/download/VPN-Manager-Windows-x64.zip"
                className="text-accent hover:underline"
                download
              >
                Télécharger l'app desktop
              </a>
              {' '}(activation VPN en 1 clic)
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <CloudIcon className="h-8 w-8 text-accent" />
          <span className="rounded-full bg-white/5 px-4 py-1 text-sm text-slate-300">
            {window.electron?.isElectron ? 'App Desktop' : 'AWS Lambda + EC2'}
          </span>
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h2 className="text-lg font-medium">Nouvelle instance</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-[2fr,1fr,auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedRegion) return;
            createMutation.mutate();
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Nom</span>
            <input
              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm focus:border-accent focus:outline-none"
              placeholder="ex: vpn-paris"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Région</span>
            <select
              value={selectedRegion}
              onChange={(event) => setSelectedRegion(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {regionsQuery.data?.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!selectedRegion || createMutation.isPending}
            className={clsx(
              'flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-sky-500/30 transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <PlayIcon className="h-5 w-5" />
            {createMutation.isPending ? 'Création...' : 'Déployer'}
          </button>
        </form>
      </section>

      <section className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">Instances</h2>
          <button
            className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs text-slate-200 transition hover:border-accent"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['instances'] })}
          >
            <ArrowPathIcon className={clsx('h-4 w-4', { 'animate-spin': isLoading })} />
            Rafraîchir
          </button>
        </div>
        {instancesQuery.isError && (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Erreur lors du chargement des instances. {String(instancesQuery.error)}
          </p>
        )}
        {!isLoading && instancesQuery.data?.length === 0 && (
          <p className="text-sm text-slate-400">
            Aucune instance pour le moment. Déployez-en une pour commencer.
          </p>
        )}
        <div className="grid gap-4">
          {instancesQuery.data?.map((instance) => (
            <article
              key={instance.instanceId}
              className="flex flex-col gap-4 rounded-xl border border-white/10 bg-slate-900/80 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm text-slate-400">{instance.instanceId}</span>
                <h3 className="text-lg font-semibold">
                  {instance.name ?? 'VPN sans nom'} · {instance.region}
                </h3>
                <p className="text-xs text-slate-400">
                  {instance.publicIp ? `IP: ${instance.publicIp}` : 'IP en attente...'}
                </p>
                <p className="text-xs text-slate-500">
                  WireGuard: {instance.wireguardStatus.toUpperCase()}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:items-end">
                <span
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-medium',
                    statusPill(instance)
                  )}
                >
                  ● {toLabel(instance.state?.Name)}
                </span>
                <div className="flex flex-wrap gap-2">
                  {/* Run - Windows batch auto-installer */}
                  <button
                    disabled={configMutation.isPending || instance.wireguardStatus !== 'ready'}
                    onClick={() => downloadWindowsScript(instance, API_URL)}
                    className="inline-flex items-center gap-2 rounded-full bg-green-600/20 border border-green-500/40 px-4 py-1 text-xs text-green-300 hover:bg-green-600/30 disabled:opacity-50"
                    title="Télécharger et activer le VPN automatiquement (Windows) - Zero interaction"
                  >
                    <PlayIcon className="h-4 w-4" /> Run
                  </button>
                  
                  {/* Stop VPN - batch auto-deactivator */}
                  <button
                    onClick={() => downloadStopScript(instance.instanceId)}
                    className="inline-flex items-center gap-2 rounded-full border border-orange-500/40 px-4 py-1 text-xs text-orange-300 hover:bg-orange-500/10"
                    title="Télécharger et désactiver le VPN automatiquement (Windows) - Zero interaction"
                  >
                    <StopIcon className="h-4 w-4" /> Stop
                  </button>
                  
                  {/* Public IP display + copy shortcut */}
                  {instance.publicIp && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs text-slate-200">
                      <span className="font-mono tracking-tight text-[11px]">{instance.publicIp}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(instance.publicIp!, 'IP publique')}
                        className="inline-flex items-center gap-1 rounded-full border border-accent/40 px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/10"
                        title="Copier l'adresse IP publique"
                      >
                        <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                        Copier
                      </button>
                    </div>
                  )}
                  
                  {/* Delete instance */}
                  <button
                    disabled={actionMutation.isPending}
                    onClick={() => {
                      if (confirm(`Supprimer définitivement l'instance ${instance.name || instance.instanceId} ?`)) {
                        actionMutation.mutate({ instanceId: instance.instanceId, action: 'terminate' });
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/40 px-4 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" /> Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
