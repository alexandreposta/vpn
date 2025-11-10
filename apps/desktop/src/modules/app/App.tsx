import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowPathIcon,
  CloudIcon,
  PlayIcon,
  StopIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import {
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

export const App = () => {
  const queryClient = useQueryClient();
  const [selectedRegion, setSelectedRegion] = useState<string>();
  const [newName, setNewName] = useState('');
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const regionsQuery = useQuery({
    queryKey: ['regions'],
    queryFn: () => fetchRegions(),
    staleTime: Infinity
  });

  useEffect(() => {
    if (!selectedRegion && regionsQuery.data?.length) {
      setSelectedRegion(regionsQuery.data[0]);
    }
  }, [regionsQuery.data, selectedRegion]);

  const instancesQuery = useQuery({
    queryKey: ['instances', selectedRegion],
    queryFn: () => fetchInstances(selectedRegion),
    enabled: !!selectedRegion
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createInstance({
        region: selectedRegion!,
        name: newName.trim() || undefined
      }),
    onSuccess: () => {
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['instances'] });
    }
  });

  const powerMutation = useMutation({
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

  const ensureElectron = () => {
    if (!window.electron?.wireguard) {
      throw new Error("Bridge Electron indisponible. Redémarrez l'application.");
    }
    return window.electron.wireguard;
  };

  const handleStartVpn = async (instance: InstanceSummary) => {
    if (!selectedRegion) return;
    try {
      const bridge = ensureElectron();
      setActivatingId(instance.instanceId);
      const config = await fetchConfig(instance.instanceId, instance.region);

      if (!config.configBody) {
        if (config.signedUrl) {
          window.open(config.signedUrl, '_blank', 'noopener');
          return;
        }
        alert("La configuration WireGuard n'est pas encore prête. Réessayez dans quelques instants.");
        return;
      }

      const result = await bridge.run(instance.instanceId, config.configBody);
      if (!result.success) {
        alert(`Échec de l'activation : ${result.error || 'Erreur inconnue'}`);
      } else {
        alert(`VPN activé pour ${instance.name ?? instance.instanceId}`);
      }
    } catch (error) {
      alert(`Erreur lors de l'activation : ${error}`);
    } finally {
      setActivatingId(null);
    }
  };

  const handleStopVpn = async (instance: InstanceSummary) => {
    try {
      const bridge = ensureElectron();
      setStoppingId(instance.instanceId);
      const result = await bridge.stop(instance.instanceId);
      if (!result.success) {
        alert(`Échec de la désactivation : ${result.error || 'Erreur inconnue'}`);
      } else {
        alert(`VPN désactivé pour ${instance.name ?? instance.instanceId}`);
      }
    } catch (error) {
      alert(`Erreur lors de la désactivation : ${error}`);
    } finally {
      setStoppingId(null);
    }
  };

  const isLoading = regionsQuery.isLoading || instancesQuery.isLoading;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">VPN Desktop</h1>
          <p className="mt-2 text-sm text-slate-400">
            Un clic sur <strong>Run</strong> ou <strong>Stop</strong> lance ou coupe instantanément WireGuard via Electron -
            aucune action manuelle nécessaire.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CloudIcon className="h-8 w-8 text-accent" />
          <span className="rounded-full bg-white/5 px-4 py-1 text-sm text-slate-300">App Desktop</span>
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-medium">Instances WireGuard</h2>
            <p className="text-sm text-slate-400">Déploie et pilote ton infrastructure AWS.</p>
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['instances'] })}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs hover:border-accent"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Actualiser
          </button>
        </div>

        <form
          className="mt-6 grid gap-4 sm:grid-cols-[2fr,1fr,auto]"
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

      <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-6">
        {isLoading && (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 py-16 text-slate-400">
            <ArrowPathIcon className="h-5 w-5 animate-spin" />
            Chargement des instances...
          </div>
        )}

        {!isLoading && !instancesQuery.data?.length && (
          <div className="rounded-xl border border-dashed border-white/10 py-16 text-center text-sm text-slate-400">
            Aucune instance pour l'instant. Déploie-en une ci-dessus.
          </div>
        )}

        <div className="flex flex-col gap-4">
          {instancesQuery.data?.map((instance) => (
            <article
              key={instance.instanceId}
              className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-base font-semibold">
                    {instance.name || instance.instanceId}
                  </h3>
                  <span className="rounded-full bg-white/5 px-3 py-0.5 text-[11px] text-slate-300">
                    {instance.region}
                  </span>
                  {instance.publicIp && (
                    <span className="rounded-full border border-white/10 bg-slate-900/40 px-3 py-0.5 text-[11px] font-mono text-slate-200">
                      IP {instance.publicIp}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400">
                  WireGuard: {instance.wireguardStatus === 'ready' ? 'Prêt' : 'En préparation'}
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
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      instance.wireguardStatus !== 'ready' ||
                      activatingId === instance.instanceId ||
                      powerMutation.isPending
                    }
                    onClick={() => handleStartVpn(instance)}
                    title="Installe et active WireGuard automatiquement"
                  >
                    <PlayIcon className="h-4 w-4" />
                    {activatingId === instance.instanceId ? 'Activation...' : 'Run'}
                  </button>

                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-500/10 px-4 py-1 text-xs text-orange-200 hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={stoppingId === instance.instanceId}
                    onClick={() => handleStopVpn(instance)}
                    title="Désactive immédiatement WireGuard sur la machine locale"
                  >
                    <StopIcon className="h-4 w-4" />
                    {stoppingId === instance.instanceId ? 'Arrêt...' : 'Stop'}
                  </button>

                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-slate-500/40 px-4 py-1 text-xs text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={powerMutation.isPending}
                    onClick={() =>
                      powerMutation.mutate({ instanceId: instance.instanceId, action: 'terminate' })
                    }
                    title="Supprime définitivement l'instance AWS"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Supprimer
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
