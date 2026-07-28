import axios from 'axios';
import { IndexedDbService } from '../../infra/storage/indexedDbService.ts';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  async (response) => {
    try {
      const url = response.config?.url || '';
      if (url.includes('/demands') && response.data) {
        if (Array.isArray(response.data)) {
          response.data = await IndexedDbService.mergeOfflineCompletionsIntoDemands(response.data);
        } else if (typeof response.data === 'object' && response.data.id) {
          const completion = await IndexedDbService.getCompletion(String(response.data.id));
          if (completion) {
            response.data.status = 'PENDING_APPROVAL';
            response.data.isOfflineCompleted = true;
          }
        }
      }
    } catch (e) {
      console.warn('[api interceptor] Error merging offline completions:', e);
    }
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // If we are already on login, do not redirect to prevent infinite loops
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
