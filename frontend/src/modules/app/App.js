import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowPathIcon, ArrowUpOnSquareIcon, CloudArrowDownIcon, CloudIcon, RocketLaunchIcon, StopCircleIcon, TrashIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { createInstance, fetchConfig, fetchInstances, fetchRegions, triggerInstanceAction } from '../../lib/api';
const toLabel = (status) => {
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
const statusPill = (instance) => {
    if (instance.wireguardStatus === 'pending')
        return 'bg-yellow-500/20 text-yellow-300';
    if (instance.wireguardStatus === 'ready' && instance.state?.Name === 'running')
        return 'bg-emerald-500/20 text-emerald-300';
    return 'bg-slate-500/20 text-slate-300';
};
const downloadFile = (config, fileName) => {
    const blob = new Blob([config.configBody], { type: config.contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
};
const shareConfig = async (config, fileName) => {
    const file = new File([config.configBody], fileName, { type: config.contentType });
    if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
            files: [file],
            title: 'Importer dans WireGuard',
            text: 'Ouvrez ce fichier avec WireGuard.'
        });
    }
    else {
        downloadFile(config, fileName);
    }
};
export const App = () => {
    const [selectedRegion, setSelectedRegion] = useState();
    const [newName, setNewName] = useState('');
    const queryClient = useQueryClient();
    const regionsQuery = useQuery({
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
        mutationFn: () => createInstance({ region: selectedRegion, name: newName || undefined }),
        onSuccess: () => {
            setNewName('');
            queryClient.invalidateQueries({ queryKey: ['instances'] });
        }
    });
    const actionMutation = useMutation({
        mutationFn: ({ instanceId, action }) => triggerInstanceAction(instanceId, action, selectedRegion),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['instances'] });
        }
    });
    const configMutation = useMutation({
        mutationFn: ({ instanceId }) => fetchConfig(instanceId, selectedRegion)
    });
    const handleDownload = async (instance, forIos = false) => {
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
    return (_jsxs("div", { className: "mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10", children: [_jsxs("header", { className: "flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between", children: [_jsx("div", { children: _jsx("h1", { className: "text-2xl font-semibold", children: "Gestionnaire VPN" }) }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(CloudIcon, { className: "h-8 w-8 text-accent" }), _jsx("span", { className: "rounded-full bg-white/5 px-4 py-1 text-sm text-slate-300", children: "AWS Lambda + EC2" })] })] }), _jsxs("section", { className: "rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur", children: [_jsx("h2", { className: "text-lg font-medium", children: "Nouvelle instance" }), _jsxs("form", { className: "mt-4 grid gap-4 sm:grid-cols-[2fr,1fr,auto]", onSubmit: (event) => {
                            event.preventDefault();
                            if (!selectedRegion)
                                return;
                            createMutation.mutate();
                        }, children: [_jsxs("label", { className: "flex flex-col gap-2", children: [_jsx("span", { className: "text-sm text-slate-300", children: "Nom" }), _jsx("input", { className: "rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm focus:border-accent focus:outline-none", placeholder: "ex: vpn-paris", value: newName, onChange: (event) => setNewName(event.target.value) })] }), _jsxs("label", { className: "flex flex-col gap-2", children: [_jsx("span", { className: "text-sm text-slate-300", children: "R\u00E9gion" }), _jsx("select", { value: selectedRegion, onChange: (event) => setSelectedRegion(event.target.value), className: "rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm focus:border-accent focus:outline-none", children: regionsQuery.data?.map((region) => (_jsx("option", { value: region, children: region }, region))) })] }), _jsxs("button", { type: "submit", disabled: !selectedRegion || createMutation.isPending, className: clsx('flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-sky-500/30 transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-50'), children: [_jsx(RocketLaunchIcon, { className: "h-5 w-5" }), createMutation.isPending ? 'Création...' : 'Déployer'] })] })] }), _jsxs("section", { className: "flex-1 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-medium", children: "Instances" }), _jsxs("button", { className: "flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs text-slate-200 transition hover:border-accent", onClick: () => queryClient.invalidateQueries({ queryKey: ['instances'] }), children: [_jsx(ArrowPathIcon, { className: clsx('h-4 w-4', { 'animate-spin': isLoading }) }), "Rafra\u00EEchir"] })] }), instancesQuery.isError && (_jsxs("p", { className: "rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200", children: ["Erreur lors du chargement des instances. ", String(instancesQuery.error)] })), !isLoading && instancesQuery.data?.length === 0 && (_jsx("p", { className: "text-sm text-slate-400", children: "Aucune instance pour le moment. D\u00E9ployez-en une pour commencer." })), _jsx("div", { className: "grid gap-4", children: instancesQuery.data?.map((instance) => (_jsxs("article", { className: "flex flex-col gap-4 rounded-xl border border-white/10 bg-slate-900/80 p-5 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("span", { className: "text-sm text-slate-400", children: instance.instanceId }), _jsxs("h3", { className: "text-lg font-semibold", children: [instance.name ?? 'VPN sans nom', " \u00B7 ", instance.region] }), _jsx("p", { className: "text-xs text-slate-400", children: instance.publicIp ? `IP publique: ${instance.publicIp}` : 'IP publique en attente' }), _jsxs("p", { className: "text-xs text-slate-500", children: ["WireGuard: ", instance.wireguardStatus.toUpperCase()] })] }), _jsxs("div", { className: "flex flex-col gap-3 sm:items-end", children: [_jsxs("span", { className: clsx('inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-medium', statusPill(instance)), children: ["\u25CF ", toLabel(instance.state?.Name)] }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsxs("button", { disabled: actionMutation.isPending, onClick: () => actionMutation.mutate({ instanceId: instance.instanceId, action: 'start' }), className: "inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs hover:border-accent disabled:opacity-50", children: [_jsx(RocketLaunchIcon, { className: "h-4 w-4" }), " Up"] }), _jsxs("button", { disabled: actionMutation.isPending, onClick: () => actionMutation.mutate({ instanceId: instance.instanceId, action: 'stop' }), className: "inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs hover:border-accent disabled:opacity-50", children: [_jsx(StopCircleIcon, { className: "h-4 w-4" }), " Down"] }), _jsxs("button", { disabled: actionMutation.isPending, onClick: () => actionMutation.mutate({ instanceId: instance.instanceId, action: 'reboot' }), className: "inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 text-xs hover:border-accent disabled:opacity-50", children: [_jsx(ArrowPathIcon, { className: "h-4 w-4" }), " Reboot"] }), _jsxs("button", { disabled: actionMutation.isPending, onClick: () => actionMutation.mutate({ instanceId: instance.instanceId, action: 'terminate' }), className: "inline-flex items-center gap-2 rounded-full border border-red-500/40 px-4 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50", children: [_jsx(TrashIcon, { className: "h-4 w-4" }), " Destroy"] })] }), _jsxs("div", { className: "flex flex-wrap gap-3 text-xs", children: [_jsxs("button", { disabled: configMutation.isPending, onClick: () => handleDownload(instance), className: "inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 hover:border-accent disabled:opacity-50", children: [_jsx(CloudArrowDownIcon, { className: clsx('h-4 w-4', { 'animate-spin': configMutation.isPending }) }), configMutation.isPending ? 'Téléchargement...' : 'Télécharger (PC)'] }), _jsxs("button", { disabled: configMutation.isPending, onClick: () => handleDownload(instance, true), className: "inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1 hover:border-accent disabled:opacity-50", children: [_jsx(ArrowUpOnSquareIcon, { className: clsx('h-4 w-4', { 'animate-pulse': configMutation.isPending }) }), configMutation.isPending ? 'Préparation...' : 'Exporter vers WireGuard (iOS)'] })] })] })] }, instance.instanceId))) })] })] }));
};
