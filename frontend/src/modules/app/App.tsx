import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowPathIcon,
  ArrowUpOnSquareIcon,
  CloudArrowDownIcon,
  CloudIcon,
  RocketLaunchIcon,
  StopCircleIcon,
  TrashIcon
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

  const isLoading = regionsQuery.isLoading || instancesQuery.isLoading;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Gestionnaire VPN</h1>
        </div>
        <div className="flex items-center gap-3">
          <CloudIcon className="h-8 w-8 text-accent" />
          <span className="rounded-full bg-white/5 px-4 py-1 text-sm text-slate-300">
            AWS Lambda + EC2
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
            <RocketLaunchIcon className="h-5 w-5" />
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
                  {instance.publicIp ? `IP publique: ${instance.publicIp}` : 'IP publique en attente'}
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
                <div className="flex flex-wrap gap-3">
                  <button
                    disabled={actionMutation.isPending}
                    onClick={() =>
                      actionMutation.mutate({ instanceId: instance.instanceId, action: 'start' })
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs hover:border-accent disabled:opacity-50"
                  >
                    <RocketLaunchIcon className="h-4 w-4" /> Up
                  </button>
                  <button
                    disabled={actionMutation.isPending}
                    onClick={() =>
                      actionMutation.mutate({ instanceId: instance.instanceId, action: 'stop' })
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs hover:border-accent disabled:opacity-50"
                  >
                    <StopCircleIcon className="h-4 w-4" /> Down
                  </button>
                  <button
                    disabled={actionMutation.isPending}
                    onClick={() =>
                      actionMutation.mutate({ instanceId: instance.instanceId, action: 'reboot' })
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs hover:border-accent disabled:opacity-50"
                  >
                    <ArrowPathIcon className="h-4 w-4" /> Reboot
                  </button>
                  <button
                    disabled={actionMutation.isPending}
                    onClick={() =>
                      actionMutation.mutate({ instanceId: instance.instanceId, action: 'terminate' })
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/40 px-4 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" /> Destroy
                  </button>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <button
                    disabled={configMutation.isPending}
                    onClick={() => handleDownload(instance)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 hover:border-accent disabled:opacity-50"
                  >
                    <CloudArrowDownIcon className={clsx('h-4 w-4', { 'animate-spin': configMutation.isPending })} />
                    {configMutation.isPending ? 'Téléchargement...' : 'Télécharger (PC)'}
                  </button>
                  <button
                    disabled={configMutation.isPending}
                    onClick={() => handleDownload(instance, true)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 hover:border-accent disabled:opacity-50"
                  >
                    <ArrowUpOnSquareIcon className={clsx('h-4 w-4', { 'animate-pulse': configMutation.isPending })} />
                    {configMutation.isPending ? 'Préparation...' : 'Exporter vers WireGuard (iOS)'}
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
