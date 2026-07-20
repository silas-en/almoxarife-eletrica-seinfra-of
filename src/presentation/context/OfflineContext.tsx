import React, { createContext, useContext, useState, useEffect } from 'react';
import { IndexedDbService, OfflineDemand, OfflineCompletion } from '../../infra/storage/indexedDbService.ts';
import api from '../services/api.ts';

interface OfflineContextType {
  isOnline: boolean;
  pendingCount: number;
  syncState: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncTime: Date | null;
  syncErrorMsg: string | null;
  saveOfflineDemand: (formData: any, photoFile: File | null) => Promise<void>;
  saveOfflineCompletion: (
    demandId: string,
    usedMaterials: any[],
    replacedMaterials: any[],
    vehicles: string[],
    tools: string[],
    transformerNumber: string,
    observation: string,
    photoFile: File | null,
    additionalPhotoFiles?: File[]
  ) => Promise<void>;
  syncNow: () => Promise<void>;
  syncAllData: () => Promise<void>;
  pendingOfflineDemands: OfflineDemand[];
  pendingOfflineCompletions: OfflineCompletion[];
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingOfflineDemands, setPendingOfflineDemands] = useState<OfflineDemand[]>([]);
  const [pendingOfflineCompletions, setPendingOfflineCompletions] = useState<OfflineCompletion[]>([]);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  const refreshPendingStatus = async () => {
    try {
      const demands = await IndexedDbService.getAllDemands();
      const completions = await IndexedDbService.getAllCompletions();
      
      setPendingOfflineDemands(demands);
      setPendingOfflineCompletions(completions);
      setPendingCount(demands.length + completions.length);
    } catch (err) {
      console.error('OfflineContext: Failed to load offline records from IndexedDB', err);
    }
  };

  const saveOfflineDemand = async (formData: any, photoFile: File | null) => {
    const newId = `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const photoBlob = photoFile ? (photoFile as Blob) : null;
    const photoName = photoFile ? photoFile.name : null;
    const photoType = photoFile ? photoFile.type : null;

    const offlineRecord: OfflineDemand = {
      id: newId,
      formData: {
        date: formData.date,
        location: formData.location,
        googleMapsUrl: formData.googleMapsUrl || '',
        description: formData.description || '',
        clientNumber: formData.clientNumber || '',
        electricianIds: formData.electricianIds || [],
        materials: formData.materials || [],
        isPriority: formData.isPriority || false,
        priorityExecutionDate: formData.priorityExecutionDate || '',
        repetition: formData.repetition || 1
      },
      photoBlob,
      photoName,
      photoType,
      createdAt: Date.now()
    };

    await IndexedDbService.saveDemand(offlineRecord);
    await refreshPendingStatus();
  };

  const saveOfflineCompletion = async (
    demandId: string,
    usedMaterials: any[],
    replacedMaterials: any[],
    vehicles: string[],
    tools: string[],
    transformerNumber: string,
    observation: string,
    photoFile: File | null,
    additionalPhotoFiles?: File[]
  ) => {
    const photoBlob = photoFile ? (photoFile as Blob) : null;
    const photoName = photoFile ? photoFile.name : null;
    const photoType = photoFile ? photoFile.type : null;

    const mappedAdditional = (additionalPhotoFiles || []).map(file => ({
      blob: file as Blob,
      name: file.name,
      type: file.type
    }));

    const offlineRecord: OfflineCompletion = {
      id: demandId,
      usedMaterials,
      replacedMaterials,
      vehicles,
      tools,
      transformerNumber,
      observation,
      photoBlob,
      photoName,
      photoType,
      additionalPhotos: mappedAdditional,
      createdAt: Date.now()
    };

    await IndexedDbService.saveCompletion(offlineRecord);
    
    // Optimistic cache update: mark this cached demand in STORE_CACHED_DEMANDS as pending approval
    try {
      const cached = await IndexedDbService.getCachedDemand(demandId);
      if (cached) {
        cached.status = 'PENDING_APPROVAL';
        cached.isOfflineCompleted = true;
        
        // Match materials structures for details view
        cached.usedMaterials = usedMaterials.map(um => ({
          materialId: um.materialId,
          quantity: um.quantity,
          material: { id: um.materialId, name: 'Material utilizado' } // Temporary offline fallback
        }));
        cached.returnedMaterials = replacedMaterials.map(rm => ({
          materialId: rm.materialId,
          quantity: rm.quantity,
          type: 'DEFECTIVE',
          material: { id: rm.materialId, name: 'Material substituído' }
        }));
        cached.vehicles = vehicles;
        cached.tools = tools;
        cached.transformerNumber = transformerNumber;
        cached.observation = observation;
        
        if (photoBlob) {
          const urls = [URL.createObjectURL(photoBlob)];
          mappedAdditional.forEach(p => {
            if (p.blob) {
              urls.push(URL.createObjectURL(p.blob));
            }
          });
          cached.photoUrl = urls.join(',');
          cached.photoBlob = photoBlob;
        }

        await IndexedDbService.saveCachedDemands([
          ...(await IndexedDbService.getAllCachedDemands()).filter((d: any) => d.id !== demandId),
          cached
        ]);
      }
    } catch (err) {
      console.error('OfflineContext: Failed to update optimistic cached demand:', err);
    }

    await refreshPendingStatus();
  };

  const syncNow = async () => {
    if (syncState === 'syncing') return;

    const listDemands = await IndexedDbService.getAllDemands();
    const listCompletions = await IndexedDbService.getAllCompletions();

    if (listDemands.length === 0 && listCompletions.length === 0) {
      setSyncState('idle');
      return;
    }

    setSyncState('syncing');
    setSyncErrorMsg(null);

    let hasErrors = false;
    let lastErrorReason = '';

    // 1. Sync creations
    for (const demand of listDemands) {
      try {
        const data = new FormData();
        data.append('date', demand.formData.date);
        data.append('location', demand.formData.location);
        data.append('googleMapsUrl', demand.formData.googleMapsUrl || '');
        data.append('description', demand.formData.description);
        data.append('clientNumber', demand.formData.clientNumber || '');
        data.append('electricianIds', JSON.stringify(demand.formData.electricianIds));
        data.append('materials', JSON.stringify(demand.formData.materials));
        if (demand.formData.isPriority !== undefined) {
          data.append('isPriority', String(demand.formData.isPriority));
        }
        if (demand.formData.priorityExecutionDate !== undefined) {
          data.append('priorityExecutionDate', demand.formData.priorityExecutionDate || '');
        }
        if (demand.formData.repetition !== undefined) {
          data.append('repetition', String(demand.formData.repetition || 1));
        }

        if (demand.photoBlob && demand.photoName && demand.photoType) {
          const file = new File([demand.photoBlob], demand.photoName, { type: demand.photoType });
          data.append('photo', file);
        }

        const response = await api.post('/demands', data);
        if (response.status >= 200 && response.status < 300) {
          await IndexedDbService.deleteDemand(demand.id);
        } else {
          throw new Error(`Código de status inválido ao criar demanda: ${response.status}`);
        }
      } catch (err: any) {
        hasErrors = true;
        console.error(`OfflineContext: Sincronização da criação de demanda ${demand.id} falhou:`, err);
        lastErrorReason = err.response?.data?.error || err.message || 'Erro ao sincronizar nova demanda.';
      }
    }

    // 2. Sync completions (executions)
    for (const completion of listCompletions) {
      try {
        const data = new FormData();
        data.append('usedMaterials', JSON.stringify(completion.usedMaterials));
        data.append('replacedMaterials', JSON.stringify(completion.replacedMaterials));
        data.append('vehicles', completion.vehicles.join(','));
        data.append('tools', completion.tools.join(','));
        data.append('transformerNumber', completion.transformerNumber || '');
        data.append('observation', completion.observation || '');

        if (completion.photoBlob && completion.photoName && completion.photoType) {
          const file = new File([completion.photoBlob], completion.photoName, { type: completion.photoType });
          data.append('photo', file);
        }

        if (completion.additionalPhotos && Array.isArray(completion.additionalPhotos)) {
          completion.additionalPhotos.forEach((ap: any, idx: number) => {
            if (ap.blob && ap.name && ap.type) {
              const file = new File([ap.blob], ap.name, { type: ap.type });
              data.append(`photo_extra_${idx}`, file);
            }
          });
        }

        const response = await api.post(`/demands/${completion.id}/finish`, data);
        if (response.status >= 200 && response.status < 300) {
          await IndexedDbService.deleteCompletion(completion.id);
        } else {
          throw new Error(`Código de status inválido ao finalizar demanda: ${response.status}`);
        }
      } catch (err: any) {
        hasErrors = true;
        console.error(`OfflineContext: Sincronização da execução da demanda ${completion.id} falhou:`, err);
        lastErrorReason = err.response?.data?.error || err.message || 'Erro ao sincronizar finalização.';
      }
    }

    // 3. Keep cache up-to-date
    try {
      if (navigator.onLine) {
        const res = await api.get('/demands');
        if (res.data) {
          await IndexedDbService.saveCachedDemands(res.data);
        }
      }
    } catch (err) {
      console.warn('OfflineContext: Failed to update post-sync demands cache', err);
    }

    await refreshPendingStatus();

    if (hasErrors) {
      setSyncState('error');
      setSyncErrorMsg(lastErrorReason || 'Alguns itens não puderam ser enviados.');
    } else {
      setSyncState('success');
      setLastSyncTime(new Date());
      const t = setTimeout(() => {
        setSyncState('idle');
      }, 5000);
      return () => clearTimeout(t);
    }
  };

  const syncAllData = async () => {
    const token = localStorage.getItem('token');
    if (!navigator.onLine || !token) {
      console.log('[Offline Sync] Cannot perform syncAllData. Online:', navigator.onLine, 'HasToken:', !!token);
      return;
    }

    let userRole = '';
    try {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        userRole = JSON.parse(savedUser).role;
      }
    } catch (_) {}

    console.log('[Offline Sync] Starting full local data caching. Role:', userRole);
    try {
      const demandsRes = await api.get('/demands');
      if (demandsRes.data) {
        await IndexedDbService.saveCachedDemands(demandsRes.data);
        console.log('[Offline Sync] Successfully cached demands:', demandsRes.data.length);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        console.warn('[Offline Sync] Session unauthorized (401) while caching demands.');
        return;
      }
      console.error('[Offline Sync] Failed to cache demands:', err);
    }

    try {
      const materialsRes = await api.get('/materials');
      if (materialsRes.data) {
        await IndexedDbService.saveMetadata('materials', materialsRes.data);
        console.log('[Offline Sync] Successfully cached materials:', materialsRes.data.length);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        console.warn('[Offline Sync] Session unauthorized (401) while caching materials.');
        return;
      }
      console.error('[Offline Sync] Failed to cache materials:', err);
    }

    if (userRole === 'ADMIN') {
      try {
        const usersRes = await api.get('/users');
        if (usersRes.data) {
          await IndexedDbService.saveMetadata('users', usersRes.data);
          const electricians = usersRes.data.filter((u: any) => u.role === 'ELECTRICIAN' && u.status === 'APPROVED');
          await IndexedDbService.saveMetadata('electricians', electricians);
          console.log('[Offline Sync] Successfully cached users and electricians:', electricians.length);
        }
      } catch (err: any) {
        if (err?.response?.status === 401) {
          console.warn('[Offline Sync] Session unauthorized (401) while caching users.');
          return;
        }
        console.error('[Offline Sync] Failed to cache users:', err);
      }

      try {
        const borrowedRes = await api.get('/demands/borrowed-materials');
        if (borrowedRes.data) {
          await IndexedDbService.saveMetadata('borrowed_materials', borrowedRes.data);
          console.log('[Offline Sync] Successfully cached borrowed materials:', borrowedRes.data.length);
        }
      } catch (err: any) {
        if (err?.response?.status === 401) {
          console.warn('[Offline Sync] Session unauthorized (401) while caching borrowed materials.');
          return;
        }
        console.error('[Offline Sync] Failed to cache borrowed materials:', err);
      }
    } else {
      console.log('[Offline Sync] Skipping /users and /borrowed-materials cache sync since user is not an ADMIN.');
    }

    try {
      const vehiclesRes = await api.get('/vehicles');
      if (vehiclesRes.data) {
        await IndexedDbService.saveMetadata('vehicles', vehiclesRes.data);
        console.log('[Offline Sync] Successfully cached vehicles:', vehiclesRes.data.length);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        console.warn('[Offline Sync] Session unauthorized (401) while caching vehicles.');
        return;
      }
      console.error('[Offline Sync] Failed to cache vehicles:', err);
    }

    try {
      const toolsRes = await api.get('/tools');
      if (toolsRes.data) {
        await IndexedDbService.saveMetadata('tools', toolsRes.data);
        console.log('[Offline Sync] Successfully cached tools:', toolsRes.data.length);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        console.warn('[Offline Sync] Session unauthorized (401) while caching tools.');
        return;
      }
      console.error('[Offline Sync] Failed to cache tools:', err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (isOnline && token) {
      syncAllData();
    }
  }, [isOnline]);

  useEffect(() => {
    refreshPendingStatus();

    const updateOnlineStatus = () => {
      const isNowOnline = navigator.onLine;
      setIsOnline(isNowOnline);
      if (isNowOnline) {
        syncNow();
        syncAllData();
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    const checkInterval = setInterval(() => {
      if (navigator.onLine) {
        setIsOnline(true);
        Promise.all([
          IndexedDbService.getAllDemands(),
          IndexedDbService.getAllCompletions()
        ]).then(([demandsList, completionsList]) => {
          if ((demandsList.length > 0 || completionsList.length > 0) && syncState === 'idle') {
            syncNow();
          }
        });
      } else {
        setIsOnline(false);
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      clearInterval(checkInterval);
    };
  }, [syncState]);

  return (
    <OfflineContext.Provider value={{
      isOnline,
      pendingCount,
      syncState,
      lastSyncTime,
      syncErrorMsg,
      saveOfflineDemand,
      saveOfflineCompletion,
      syncNow,
      syncAllData,
      pendingOfflineDemands,
      pendingOfflineCompletions
    }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}
