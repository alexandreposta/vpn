import axios from 'axios';
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    timeout: 10000
});
export const fetchRegions = async () => {
    const { data } = await api.get('/regions');
    return data.regions;
};
export const fetchInstances = async (region) => {
    const { data } = await api.get('/instances', {
        params: region ? { region } : undefined
    });
    return data.instances;
};
export const createInstance = async (payload) => {
    const { data } = await api.post('/instances', payload);
    return data.instance;
};
export const triggerInstanceAction = async (instanceId, action, region) => {
    await api.post(`/instances/${instanceId}/actions`, { action }, { params: { region } });
};
export const fetchConfig = async (instanceId, region) => {
    const { data } = await api.get(`/instances/${instanceId}/config`, {
        params: { region }
    });
    return data;
};
