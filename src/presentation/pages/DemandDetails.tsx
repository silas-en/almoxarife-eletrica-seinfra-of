import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.tsx';
import api from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  User, 
  Package, 
  CheckCircle, 
  Camera, 
  Image,
  Loader2, 
  AlertCircle,
  Truck,
  Wrench,
  Info,
  Pencil,
  Plus,
  Trash2,
  Search,
  ClipboardList,
  ExternalLink,
  Star,
  Clock,
  Share2
} from 'lucide-react';
import { formatLocalDate } from '../utils/date.ts';
import { ptBR } from 'date-fns/locale';
import Modal from '../components/Modal.tsx';
import ConfirmDialog from '../components/ConfirmDialog.tsx';
import ShareOptionsModal from '../components/ShareOptionsModal.tsx';
import { IndexedDbService } from '../../infra/storage/indexedDbService.ts';
import { useOffline } from '../context/OfflineContext.tsx';

export default function DemandDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOnline, saveOfflineCompletion } = useOffline();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [activeShareData, setActiveShareData] = useState<{ title: string; text: string; photos: string[] } | null>(null);

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<File[]>([]);
  const [extraPhotoPreviews, setExtraPhotoPreviews] = useState<string[]>([]);
  const [usedMaterials, setUsedMaterials] = useState<any[]>([]);
  const [replacedMaterials, setReplacedMaterials] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [trafo, setTrafo] = useState('');
  const [obs, setObs] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Material Autocomplete States for Completion Form
  const [usedMaterialSearch, setUsedMaterialSearch] = useState('');
  const [showUsedResults, setShowUsedResults] = useState(false);
  const [replacedMaterialSearch, setReplacedMaterialSearch] = useState('');
  const [showReplacedResults, setShowReplacedResults] = useState(false);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditingExecution, setIsEditingExecution] = useState(false);
  const [editFormData, setEditFormData] = useState({
    date: '',
    location: '',
    googleMapsUrl: '',
    description: '',
    clientNumber: '',
    electricianIds: [] as string[],
    materials: [] as { materialId: string; quantity: number; borrowed?: boolean; borrowedDeadline?: string }[],
    transformerNumber: '',
    observation: '',
    vehicles: [] as string[],
    tools: [] as string[],
    usedMaterials: [] as { materialId: string; quantity: number }[],
    returnedMaterials: [] as { materialId: string; quantity: number }[],
    recoveredMaterials: [] as { materialId: string; quantity: number }[],
    isPriority: false,
    priorityExecutionDate: '',
    repetition: 1
  });
  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialResults, setShowMaterialResults] = useState(false);
  const [editUsedSearch, setEditUsedSearch] = useState('');
  const [showEditUsedResults, setShowEditUsedResults] = useState(false);
  const [editRetSearch, setEditRetSearch] = useState('');
  const [showEditRetResults, setShowEditRetResults] = useState(false);
  const [editRecSearch, setEditRecSearch] = useState('');
  const [showEditRecResults, setShowEditRecResults] = useState(false);

  const { data: demand, isLoading } = useQuery({
    queryKey: ['demand', id],
    queryFn: async () => {
      const stringId = String(id);
      
      // Determine active online status
      const online = isOnline && navigator.onLine;

      // Log: ID solicitado
      console.log(`[DemandDetails ID] ID solicitado da rota: "${stringId}"`);
      
      // Log: Se tentou API ou IndexedDB (origem)
      if (!online) {
        console.log(`[DemandDetails Origem] Buscando dados estritamente via IndexedDB (OFFLINE).`);
      } else {
        console.log(`[DemandDetails Origem] Buscando dados via API com cache IndexedDB (ONLINE).`);
      }

      // 1. Check in custom offline-created draft demands (STORE_OFFLINE_DEMANDS) using robust string comparison
      try {
        const offlineDemands = await IndexedDbService.getAllDemands();
        console.log('[DemandDetails Debug] Pending IDs in STORE_OFFLINE_DEMANDS:', offlineDemands.map(d => String(d.id)));
        const foundOffline = offlineDemands.find((od: any) => {
          if (!od) return false;
          const itemStringId = String(od.id).trim();
          return itemStringId === stringId.trim() || itemStringId.toLowerCase() === stringId.trim().toLowerCase();
        });
        
        if (foundOffline) {
          console.log('[DemandDetails Debug] MATCH FOUND: Loaded from STORES_OFFLINE_DEMANDS (pending offline queue).');
          // Log: Resultado encontrado no IndexedDB
          console.log(`[DemandDetails Resultado IndexedDB] Encontrado na fila de criação offline:`, foundOffline);
          
          const users = (await IndexedDbService.getMetadata('users')) || [];
          const materialsObj = (await IndexedDbService.getMetadata('materials')) || [];
          const matchedElectricians = users.filter((u: any) => foundOffline.formData.electricianIds?.includes(u.id));

          return {
            id: foundOffline.id,
            date: foundOffline.formData.date,
            location: foundOffline.formData.location,
            googleMapsUrl: foundOffline.formData.googleMapsUrl || '',
            description: foundOffline.formData.description || '',
            clientNumber: foundOffline.formData.clientNumber || '',
            electricians: matchedElectricians,
            status: 'PENDING',
            isOfflinePending: true,
            createdAt: foundOffline.createdAt,
            plannedMaterials: foundOffline.formData.materials?.map((m: any) => {
              const mat = materialsObj.find((x: any) => String(x.id) === String(m.materialId));
              return {
                id: `offline-pm-${m.materialId}`,
                materialId: m.materialId,
                quantity: m.quantity,
                material: mat ? { id: mat.id, name: mat.name, unit: mat.unit } : { id: m.materialId, name: 'Material', unit: 'Un' }
              };
            }) || [],
            photoUrl: foundOffline.photoBlob ? URL.createObjectURL(foundOffline.photoBlob) : null
          };
        }
      } catch (err) {
        console.warn('[DemandDetails Debug] Error reading STORES_OFFLINE_DEMANDS:', err);
      }

      // If we are OFFLINE, strictly load from IndexedDB and NEVER invoke API
      if (!online) {
        console.log('[DemandDetails Load State] App is OFFLINE. Proceeding strictly with IndexedDB source.');
        
        let offlineDemand = null;
        try {
          offlineDemand = await IndexedDbService.getCachedDemandById(stringId);
          if (offlineDemand) {
            // Log: Resultado encontrado no IndexedDB
            console.log(`[DemandDetails Resultado IndexedDB] SUCCESS: Encontrado usando getCachedDemandById:`, offlineDemand);
            return offlineDemand;
          }
        } catch (cacheErr) {
          console.warn('[DemandDetails Debug] getCachedDemandById lookup failed:', cacheErr);
        }

        // Final failproof backup list scanning
        try {
          const allCached = await IndexedDbService.getAllCachedDemands();
          console.log('[DemandDetails Load State] Scanning the full cached_demands list. Total available cached:', allCached.length);
          offlineDemand = allCached.find((d: any) => {
            if (!d) return false;
            const itemStringId = String(d.id).trim();
            const urlStringId = stringId.trim();
            return itemStringId === urlStringId || itemStringId.toLowerCase() === urlStringId.toLowerCase() || Number(itemStringId) === Number(urlStringId);
          });
          if (offlineDemand) {
            // Log: Resultado encontrado no IndexedDB
            console.log(`[DemandDetails Resultado IndexedDB] SUCCESS: Encontrado varrendo a lista completa de cached_demands:`, offlineDemand);
            return offlineDemand;
          }
        } catch (finalErr) {
          console.error('[DemandDetails Debug] Scan fallback lookup failed:', finalErr);
        }

        // Log: Resultado encontrado no IndexedDB (failure)
        console.log(`[DemandDetails Resultado IndexedDB] FAILURE: Demanda não foi encontrada no IndexedDB para o ID "${stringId}".`);
        console.error('[DemandDetails Load State] FAILURE: Demand NOT found offline anywhere for ID:', stringId);
        return null;
      }

      // If we are ONLINE, fetch with hybrid logic (Cached first, refresh on background)
      console.log('[DemandDetails Load State] App is ONLINE. Proceeding with hybrid API + Cache strategy.');
      try {
        const cachedDemand = await IndexedDbService.getCachedDemandById(stringId);
        if (cachedDemand) {
          console.log('[DemandDetails Load State] Returning cached demand template and triggering background refresh...');
          // Log: Resultado encontrado no IndexedDB (hybrid template choice)
          console.log(`[DemandDetails Resultado IndexedDB] Encontrada cópia em cache para exibição imediata:`, cachedDemand);
          
          api.get('/demands').then(async (resp) => {
            if (resp.data) {
              await IndexedDbService.saveCachedDemands(resp.data, false);
              const fresh = resp.data.find((d: any) => {
                if (!d) return false;
                const itemStringId = String(d.id).trim();
                const urlStringId = stringId.trim();
                return itemStringId === urlStringId || itemStringId.toLowerCase() === urlStringId.toLowerCase() || Number(itemStringId) === Number(urlStringId);
              });
              if (fresh) {
                queryClient.setQueryData(['demand', id], fresh);
              }
            }
          }).catch(err => {
            console.warn('[DemandDetails Debug] Background refresh failed:', err);
          });
          return cachedDemand;
        }
      } catch (err) {
        console.warn('[DemandDetails Debug] Error loading initial cached copy:', err);
      }

      // No cached demand exists, must fetch directly from the network
      try {
        console.log('[DemandDetails Load State] Demand not inside cache. Retrieving directly from API...');
        const resp = await api.get('/demands');
        if (resp.data) {
          console.log('[DemandDetails Load State] Successfully fetched demands from API. Total count:', resp.data.length);
          await IndexedDbService.saveCachedDemands(resp.data, false);
          const found = resp.data.find((d: any) => {
            if (!d) return false;
            const itemStringId = String(d.id).trim();
            const urlStringId = stringId.trim();
            return itemStringId === urlStringId || itemStringId.toLowerCase() === urlStringId.toLowerCase() || Number(itemStringId) === Number(urlStringId);
          });
          if (found) {
            console.log('[DemandDetails Load State] SUCCESS: Match found inside network response!', found);
            return found;
          }
        }
      } catch (apiErr) {
        console.error('[DemandDetails Load State] Direct API fetching failed:', apiErr);
      }

      // Late fallback search
      try {
        const allCached = await IndexedDbService.getAllCachedDemands();
        const finalFound = allCached.find((d: any) => {
          if (!d) return false;
          const itemStringId = String(d.id).trim();
          const urlStringId = stringId.trim();
          return itemStringId === urlStringId || itemStringId.toLowerCase() === urlStringId.toLowerCase() || Number(itemStringId) === Number(urlStringId);
        });
        if (finalFound) {
          console.log('[DemandDetails Load State] SUCCESS: Late match found in cached_demands list:', finalFound);
          // Log: Resultado encontrado no IndexedDB
          console.log(`[DemandDetails Resultado IndexedDB] SUCCESS: Encontrada via busca tardia no cache:`, finalFound);
          return finalFound;
        }
      } catch (err) {
        console.error('[DemandDetails Debug] Late fallback lookup failed:', err);
      }

      console.warn('[DemandDetails Load State] FAILURE: Demand NOT found anywhere for ID:', stringId);
      // Log: Resultado encontrado no IndexedDB (failure)
      console.log(`[DemandDetails Resultado IndexedDB] Demanda não encontrada em nenhum repositório.`);
      return null;
    }
  });

  const { data: materials } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => {
      const online = isOnline && navigator.onLine;
      if (!online) {
        console.log('[DemandDetails Metadata Load] App is OFFLINE. Loading materials directly from IndexedDB.');
        return (await IndexedDbService.getMetadata('materials')) || [];
      }
      try {
        const data = (await api.get('/materials')).data;
        await IndexedDbService.saveMetadata('materials', data);
        return data;
      } catch (err) {
        console.warn('DemandDetails: Loading cached materials...', err);
        return (await IndexedDbService.getMetadata('materials')) || [];
      }
    }
  });

  const { data: electricians } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const online = isOnline && navigator.onLine;
      if (!online) {
        console.log('[DemandDetails Metadata Load] App is OFFLINE. Loading electricians (users) directly from IndexedDB.');
        return (await IndexedDbService.getMetadata('electricians')) || [];
      }
      try {
        const resp = await api.get('/users');
        const list = resp.data.filter((u: any) => u.role === 'ELECTRICIAN' && u.status === 'APPROVED');
        await IndexedDbService.saveMetadata('electricians', list);
        return list;
      } catch (err) {
        console.warn('DemandDetails: Loading cached electricians...', err);
        return (await IndexedDbService.getMetadata('electricians')) || [];
      }
    },
    enabled: !!user && user.role === 'ADMIN'
  });

  const { data: registeredVehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const online = isOnline && navigator.onLine;
      if (!online) {
        console.log('[DemandDetails Metadata Load] App is OFFLINE. Loading vehicles directly from IndexedDB.');
        return (await IndexedDbService.getMetadata('vehicles')) || [];
      }
      try {
        const data = (await api.get('/vehicles')).data;
        await IndexedDbService.saveMetadata('vehicles', data);
        return data;
      } catch (err) {
        console.warn('DemandDetails: Loading cached vehicles...', err);
        return (await IndexedDbService.getMetadata('vehicles')) || [];
      }
    }
  });

  const { data: registeredTools } = useQuery({
    queryKey: ['tools'],
    queryFn: async () => {
      const online = isOnline && navigator.onLine;
      if (!online) {
        console.log('[DemandDetails Metadata Load] App is OFFLINE. Loading tools directly from IndexedDB.');
        return (await IndexedDbService.getMetadata('tools')) || [];
      }
      try {
        const data = (await api.get('/tools')).data;
        await IndexedDbService.saveMetadata('tools', data);
        return data;
      } catch (err) {
        console.warn('DemandDetails: Loading cached tools...', err);
        return (await IndexedDbService.getMetadata('tools')) || [];
      }
    }
  });

  // Calculate surplus materials (planned - used)
  const surplusMaterials = React.useMemo(() => {
    if (!demand?.plannedMaterials) return [];
    
    return demand.plannedMaterials.map((pm: any) => {
      const used = usedMaterials.find(um => String(um.materialId) === String(pm.materialId));
      const usedQty = used ? Number(used.quantity) : 0;
      const surplusQty = Number(pm.quantity) - usedQty;
      
      return {
        ...pm.material,
        plannedQty: pm.quantity,
        usedQty,
        surplusQty: Math.max(0, surplusQty)
      };
    }).filter((m: any) => m.surplusQty > 0);
  }, [demand?.plannedMaterials, usedMaterials]);

  // Pre-populate used materials from planned ones for better UX and consistency
  React.useEffect(() => {
    if (demand && demand.status === 'PENDING' && demand.plannedMaterials && usedMaterials.length === 0) {
      const initial = demand.plannedMaterials.map((pm: any) => ({
        materialId: pm.materialId,
        quantity: 0
      }));
      setUsedMaterials(initial);
    }
  }, [demand]);

  const filteredMaterials = Array.isArray(materials)
    ? materials.filter((m: any) => m.name.toLowerCase().includes(materialSearch.toLowerCase()))
    : [];

  const updateMutation = useMutation({
    mutationFn: async (data: any) => await api.put(`/demands/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      queryClient.invalidateQueries({ queryKey: ['demand', id] });
      setIsEditModalOpen(false);
      setFeedback({ type: 'success', message: 'Demanda atualizada com sucesso!' });
      setTimeout(() => setFeedback(null), 3000);
    },
  });

  const finishMutation = useMutation({
    mutationFn: async (data: FormData) => await api.post(`/demands/${id}/finish`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      queryClient.invalidateQueries({ queryKey: ['demand', id] });
      setIsEditingExecution(false);
      setFeedback({ type: 'success', message: 'Demanda enviada para aprovação do administrador!' });
      setTimeout(() => navigate('/'), 2000);
    },
    onError: (error: any) => {
      console.error('Error finishing demand:', error);
      setFeedback({ 
        type: 'error', 
        message: error.response?.data?.error || 'Erro ao finalizar serviço. Verifique se preencheu todos os campos e a foto.' 
      });
      setTimeout(() => setFeedback(null), 5000);
    }
  });

  const approveMutation = useMutation({
    mutationFn: async () => await api.patch(`/demands/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      queryClient.invalidateQueries({ queryKey: ['demand', id] });
      setFeedback({ type: 'success', message: 'Serviço aprovado e registrado no relatório!' });
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: 'Erro ao aprovar serviço.' });
      setTimeout(() => setFeedback(null), 5000);
    }
  });

  const declineMutation = useMutation({
    mutationFn: async () => await api.put(`/demands/${id}`, { status: 'PENDING' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      queryClient.invalidateQueries({ queryKey: ['demand', id] });
      setFeedback({ type: 'success', message: 'Serviço reprovado. Retornou para o eletricista.' });
      setTimeout(() => setFeedback(null), 3000);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => await api.delete(`/demands/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      setFeedback({ type: 'success', message: 'Demanda excluída com sucesso!' });
      setTimeout(() => navigate('/'), 1500);
    }
  });

  const deliverMaterialsMutation = useMutation({
    mutationFn: async () => await api.put(`/demands/${id}/deliver-materials`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      queryClient.invalidateQueries({ queryKey: ['demand', id] });
      setFeedback({ type: 'success', message: 'Materiais marcados como entregues com sucesso!' });
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: 'Erro ao marcar materiais como entregues.' });
      setTimeout(() => setFeedback(null), 5000);
    }
  });

  const revertMaterialsMutation = useMutation({
    mutationFn: async () => await api.put(`/demands/${id}/revert-deliver-materials`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      queryClient.invalidateQueries({ queryKey: ['demand', id] });
      setFeedback({ type: 'success', message: 'Entrega dos materiais revertida com sucesso!' });
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: 'Erro ao reverter entrega dos materiais.' });
      setTimeout(() => setFeedback(null), 5000);
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleExtraFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const addedFiles = Array.from(files) as File[];
      setExtraPhotos(prev => [...prev, ...addedFiles]);
      const addedPreviews = addedFiles.map(file => URL.createObjectURL(file));
      setExtraPhotoPreviews(prev => [...prev, ...addedPreviews]);
    }
  };

  const handleRemoveExtraPhoto = (index: number) => {
    setExtraPhotos(prev => prev.filter((_, i) => i !== index));
    setExtraPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddUsedMaterial = (matId: string) => {
    if (!matId) return;
    if (usedMaterials.find(m => m.materialId === matId)) return;
    setUsedMaterials([...usedMaterials, { materialId: matId, quantity: 1 }]);
    setUsedMaterialSearch('');
    setShowUsedResults(false);
  };

  const handleAddReplacedMaterial = (matId: string) => {
    if (!matId) return;
    if (replacedMaterials.find(m => m.materialId === matId)) return;
    setReplacedMaterials([...replacedMaterials, { materialId: matId, quantity: 1 }]);
    setReplacedMaterialSearch('');
    setShowReplacedResults(false);
  };

  const handleVehicleToggle = (v: string) => {
    setVehicles(prev => prev.includes(v) ? prev.filter(item => item !== v) : [...prev, v]);
  };

  const handleToolToggle = (t: string) => {
    setSelectedTools(prev => {
      const isNone = t.toLowerCase() === 'nenhuma';
      if (isNone) {
        return prev.includes(t) ? [] : [t];
      } else {
        const withoutNone = prev.filter(item => item.toLowerCase() !== 'nenhuma');
        return withoutNone.includes(t)
          ? withoutNone.filter(item => item !== t)
          : [...withoutNone, t];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo && !isEditingExecution) {
      setFeedback({ type: 'error', message: 'A foto do serviço é obrigatória!' });
      return;
    }
    
    const hasPlannedMaterials = demand?.plannedMaterials && demand.plannedMaterials.length > 0;
    if (hasPlannedMaterials && usedMaterials.length === 0) {
      setFeedback({ type: 'error', message: 'É necessário informar os materiais utilizados!' });
      return;
    }
    if (vehicles.length === 0) {
      setFeedback({ type: 'error', message: 'Informe o veículo/equipamento utilizado!' });
      return;
    }

    const executeOfflineSave = async () => {
      try {
        await saveOfflineCompletion(
          id!,
          usedMaterials,
          replacedMaterials,
          vehicles,
          selectedTools,
          trafo,
          obs,
          photo,
          extraPhotos
        );
        setFeedback({ 
          type: 'success', 
          message: 'Sem internet! Serviço finalizado e salvo localmente de forma segura. A sincronização com a prefeitura ocorrerá automaticamente ao detectar conexão.' 
        });
        setTimeout(() => navigate('/'), 2500);
      } catch (err) {
        console.error('Error saving completion offline:', err);
        setFeedback({ type: 'error', message: 'Erro ao registrar serviço localmente.' });
      }
    };

    if (!isOnline || !navigator.onLine) {
      console.log('[DemandDetails Completion] Device detected offline. Saving to local database indexedDB...');
      await executeOfflineSave();
      return;
    }

    console.log('[DemandDetails Completion] Device detected online. Attempting remote server API submission...');
    const formData = new FormData();
    if (photo) {
      formData.append('photo', photo);
    }
    extraPhotos.forEach((file, index) => {
      formData.append(`extra_photo_${index}`, file);
    });
    formData.append('usedMaterials', JSON.stringify(usedMaterials));
    formData.append('replacedMaterials', JSON.stringify(replacedMaterials));
    formData.append('vehicles', vehicles.join(','));
    formData.append('tools', selectedTools.join(','));
    formData.append('transformerNumber', trafo);
    formData.append('observation', obs);

    try {
      setFeedback({ type: 'success', message: 'Enviando serviço concluído para a prefeitura...' });
      const response = await api.post(`/demands/${id}/finish`, formData);
      if (response.status >= 200 && response.status < 300) {
        queryClient.invalidateQueries({ queryKey: ['demands'] });
        queryClient.invalidateQueries({ queryKey: ['demand', id] });
        setIsEditingExecution(false);
        setFeedback({ type: 'success', message: 'Demanda enviada para aprovação do administrador!' });
        setTimeout(() => navigate('/'), 2000);
      } else {
        throw new Error(`Código de status de API inválido: ${response.status}`);
      }
    } catch (err: any) {
      const isNetworkError = !err.response || err.code === 'ERR_NETWORK' || err.message?.includes('Network Error') || !navigator.onLine;
      if (isNetworkError) {
        console.warn('[DemandDetails Completion] Server API post failed with network/connectivity error. Redirecting to offline local storage...', err);
        await executeOfflineSave();
      } else {
        console.error('[DemandDetails Completion] Standard validation/API returned error:', err);
        setFeedback({ 
          type: 'error', 
          message: err.response?.data?.error || 'Erro ao finalizar serviço. Verifique se preencheu todos os campos e a foto.' 
        });
        setTimeout(() => setFeedback(null), 5000);
      }
    }
  };

  const handleWhatsAppShare = async () => {
    if (!demand) return;

    try {
      const photosList = demand.photoUrl ? demand.photoUrl.split(',') : [];

      let message = `*DEMANDA EXECUTADA E APROVADA* ✅\n\n`;
      message += `📍 *Local:* ${demand.location || 'Não informado'}\n\n`;

      if (photosList.length > 0) {
        message += `📸 *Fotos do Serviço Executado:*\n`;
        photosList.forEach((url: string, index: number) => {
          const trimmedUrl = url.trim();
          const absoluteUrl = trimmedUrl.startsWith('http') 
            ? trimmedUrl 
            : `${window.location.origin}${trimmedUrl.startsWith('/') ? '' : '/'}${trimmedUrl}`;
          message += `${index + 1}️⃣ ${absoluteUrl}\n`;
        });
      } else {
        message += `⚠️ Nenhuma foto registrada.\n`;
      }

      setActiveShareData({
        title: demand.location || 'Demanda Executada e Aprovada',
        text: message,
        photos: photosList
      });
    } catch (err) {
      console.error('Error sharing demand:', err);
    }
  };

  const handleEditClick = () => {
    if (!demand) return;

    if (user?.role === 'ELECTRICIAN') {
      if (demand.status === 'PENDING_APPROVAL') {
        // For electricians in pending approval, we "edit" the execution
        setUsedMaterials(demand.usedMaterials?.map((m: any) => ({ materialId: m.materialId, quantity: m.quantity })) || []);
        setReplacedMaterials(demand.returnedMaterials?.filter((m: any) => m.type === 'DEFECTIVE').map((m: any) => ({ materialId: m.materialId, quantity: m.quantity })) || []);
        setVehicles(demand.vehicles || []);
        setSelectedTools(demand.tools || []);
        setTrafo(demand.transformerNumber || '');
        setObs(demand.observation || '');
        
        const urls = demand.photoUrl ? demand.photoUrl.split(',') : [];
        if (urls.length > 0) {
          setPhotoPreview(urls[0]);
          if (urls.length > 1) {
            setExtraPhotoPreviews(urls.slice(1));
          } else {
            setExtraPhotoPreviews([]);
          }
        } else {
          setPhotoPreview(null);
          setExtraPhotoPreviews([]);
        }
        setPhoto(null);
        setExtraPhotos([]);
        setIsEditingExecution(true);
      }
      return;
    }

    setEditFormData({
      date: formatLocalDate(demand.date, 'yyyy-MM-dd'),
      location: demand.location,
      googleMapsUrl: demand.googleMapsUrl || '',
      description: demand.description,
      clientNumber: demand.clientNumber || '',
      electricianIds: demand.electricians?.map((e: any) => e.id) || [],
      isPriority: demand.isPriority || false,
      priorityExecutionDate: demand.priorityExecutionDate ? formatLocalDate(demand.priorityExecutionDate, 'yyyy-MM-dd') : '',
      repetition: demand.repetition || 1,
      materials: demand.plannedMaterials?.map((pm: any) => ({
        materialId: pm.materialId,
        quantity: pm.quantity,
        borrowed: pm.borrowed || false,
        borrowedDeadline: pm.borrowedDeadline ? formatLocalDate(pm.borrowedDeadline, 'yyyy-MM-dd') : ''
      })) || [],
      transformerNumber: demand.transformerNumber || '',
      observation: demand.observation || '',
      vehicles: demand.vehicles || [],
      tools: demand.tools || [],
      usedMaterials: demand.usedMaterials?.map((um: any) => ({
        materialId: um.materialId,
        quantity: um.quantity
      })) || [],
      returnedMaterials: demand.returnedMaterials?.filter((rm: any) => rm.type === 'DEFECTIVE').map((rm: any) => ({
        materialId: rm.materialId,
        quantity: rm.quantity,
        type: 'DEFECTIVE'
      })) || [],
      recoveredMaterials: demand.returnedMaterials?.filter((rm: any) => rm.type === 'RECOVERED').map((rm: any) => ({
        materialId: rm.materialId,
        quantity: rm.quantity,
        type: 'RECOVERED'
      })) || []
    });
    setIsEditModalOpen(true);
  };

  const handleAddMaterial = (materialId: string) => {
    if (!materialId) return;
    if (editFormData.materials.find(m => m.materialId === materialId)) return;
    setEditFormData({
      ...editFormData,
      materials: [...editFormData.materials, { materialId, quantity: 1, borrowed: false, borrowedDeadline: '' }]
    });
  };

  const updateMaterialQty = (materialId: string, quantity: number) => {
    setEditFormData({
      ...editFormData,
      materials: editFormData.materials.map(m => m.materialId === materialId ? { ...m, quantity } : m)
    });
  };

  const removeMaterial = (materialId: string) => {
    setEditFormData({
      ...editFormData,
      materials: editFormData.materials.filter(m => m.materialId !== materialId)
    });
  };

  if (isLoading) return <Layout><div className="text-center py-20">Carregando...</div></Layout>;
  if (!demand) return <Layout><div className="text-center py-20">Demanda não encontrada.</div></Layout>;

  const isAdmin = user?.role === 'ADMIN';
  const isElectrician = user?.role === 'ELECTRICIAN';
  const isDone = demand.status === 'PENDING_APPROVAL' || demand.status === 'CONCLUDED';

  return (
    <Layout>
      {/* Feedback Message */}
      {feedback && (
        <div className={`fixed top-4 right-4 z-[100] p-4 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
          feedback.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span className="font-medium">{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="ml-2 hover:opacity-70"><Plus className="h-4 w-4 rotate-45" /></button>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-5 w-5 mr-1" /> Voltar
        </button>
        <div className="flex items-center gap-3">
          {(user?.role === 'ADMIN' || (user?.role === 'ELECTRICIAN' && demand.status === 'PENDING_APPROVAL')) && (
            <div className="flex gap-2">
              <button
                onClick={handleEditClick}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                title="Editar Demanda"
              >
                <Pencil className="h-5 w-5" />
              </button>
              {user?.role === 'ADMIN' && (
                <button
                  onClick={() => {
                    setConfirmDialog({
                      isOpen: true,
                      title: 'Excluir Demanda',
                      message: 'Tem certeza que deseja excluir esta demanda definitivamente?',
                      onConfirm: () => deleteMutation.mutate()
                    });
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                  title="Excluir Demanda"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
          <StatusBadge status={demand.status} isOfflineCompleted={demand.isOfflineCompleted} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Detail Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            {demand.isPriority && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-amber-900 shadow-sm animate-pulse">
                <Star className="h-5 w-5 fill-amber-500 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-black uppercase tracking-wider">Demanda Prioritária</div>
                  <div className="text-sm font-semibold mt-0.5">
                    {demand.priorityExecutionDate 
                      ? `Execução recomendada: ${formatLocalDate(demand.priorityExecutionDate, 'dd/MM/yyyy')}`
                      : 'Sem data de execução definida.'}
                  </div>
                </div>
              </div>
            )}
            <h2 className="text-xl font-bold text-gray-900 mb-1">{demand.location}</h2>
            
            {demand.googleMapsUrl ? (
              <div className="mb-4">
                <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-1">Localização</p>
                <a 
                  href={demand.googleMapsUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center gap-2 p-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs transition-colors shadow-sm w-full border border-blue-100 hover:border-blue-200"
                >
                  <MapPin className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="flex-1 text-left truncate">Abrir no Google Maps</span>
                  <ExternalLink className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                </a>
              </div>
            ) : (
              <div className="mb-4">
                <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-1">Localização</p>
                <div className="text-xs text-gray-400 italic bg-gray-50 p-2 rounded-lg border border-gray-100">
                  Nenhuma localização anexada
                </div>
              </div>
            )}
            
            <div className="space-y-4">
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Data</p>
                  <p className="text-sm text-gray-900 font-medium">{formatLocalDate(demand.date, 'dd/MM/yyyy')}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Descrição</p>
                  <p className="text-sm text-gray-900 leading-relaxed">{demand.description}</p>
                </div>
              </div>
              {demand.clientNumber && (
                <div className="flex items-start">
                  <User className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-bold">Contato do Solicitante</p>
                    <p className="text-sm text-gray-900 font-medium">{demand.clientNumber}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start">
                <User className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Responsáveis</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {demand.electricians?.map((e: any) => (
                      <span key={e.id} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium border border-blue-100">
                        {e.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {!demand.description?.includes('demanda para o mesmo local') && (
              <>
                <div className="mt-8 border-t pt-6">
                  <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center uppercase">
                    <Package className="h-4 w-4 mr-2" /> Materiais Planejados
                  </h3>
                  <ul className="space-y-2">
                    {demand.plannedMaterials?.map((m: any) => (
                      <li key={m.id} className="text-sm text-gray-600 flex justify-between bg-gray-50 p-2 rounded">
                        <span>{m.material.name}</span>
                        <span className="font-bold">{m.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {isAdmin && demand.plannedMaterials?.length > 0 && (
                  <div className="mt-6 border-t pt-6 space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center uppercase animate-in fade-in duration-200">
                      <Truck className="h-4 w-4 mr-2 text-blue-600 animate-pulse" /> Entrega de Materiais
                    </h3>
                    
                    {demand.materialsDelivered ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-xs font-bold shadow-sm">
                          <span className="h-2 w-2 rounded-full bg-green-500 animate-ping" />
                          <span className="font-extrabold uppercase">Materiais Entregues</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDialog({
                              isOpen: true,
                              title: 'Reverter Entrega de Materiais',
                              message: 'Deseja realmente reverter a entrega de materiais para esta demanda? Isso reabrirá os materiais planejados como não-entregues e removerá os retornos automáticos pendentes.',
                              onConfirm: () => revertMaterialsMutation.mutate()
                            });
                          }}
                          className="w-full py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-750 font-black text-xs uppercase rounded-xl transition-all border border-red-200 text-center cursor-pointer select-none active:scale-[0.98] shadow-sm hover:shadow-md"
                        >
                          Reverter Entrega
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold shadow-sm">
                          <span className="h-2 w-2 rounded-full bg-amber-500" />
                          <span className="font-extrabold uppercase">Aguardando Entrega</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDialog({
                              isOpen: true,
                              title: 'Confirmar Entrega de Materiais',
                              message: 'Deseja marcar os materiais planejados como entregues aos eletricistas para esta demanda?',
                              onConfirm: () => deliverMaterialsMutation.mutate()
                            });
                          }}
                          className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase rounded-xl transition-all border border-amber-500 hover:shadow-md text-center cursor-pointer select-none active:scale-[0.98] shadow-sm"
                        >
                          Entregar Materiais
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {isDone && (() => {
            const photosList = demand.photoUrl ? demand.photoUrl.split(',') : [];
            return (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <div className="flex items-center justify-between gap-4 pb-2 border-b border-gray-100 flex-wrap">
                  <h3 className="text-sm font-bold text-gray-800 uppercase">Fotos do Serviço</h3>
                  {user?.role === 'ADMIN' && (
                    <button
                      type="button"
                      onClick={handleWhatsAppShare}
                      className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-110 hover:shadow-md text-emerald-800 px-3 py-1.5 rounded-xl text-xs font-black transition-all border border-emerald-200 cursor-pointer shadow-sm select-none"
                    >
                      <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                      Compartilhar Fotos (WhatsApp)
                    </button>
                  )}
                </div>
                {photosList.length === 1 ? (
                  <a 
                    href={photosList[0]} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="block group relative rounded-xl overflow-hidden shadow-inner border border-gray-100 hover:opacity-95 transition-opacity"
                    title="Clique para abrir em tamanho real"
                  >
                    <img src={photosList[0]} alt="Serviço concluído" className="w-full rounded-xl object-cover max-h-96" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                      Ampliar ↗
                    </div>
                  </a>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {photosList.map((url: string, index: number) => (
                      <a 
                        key={index} 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="relative rounded-xl overflow-hidden border border-gray-100 shadow-sm aspect-square bg-gray-50 hover:opacity-90 transition-opacity block group"
                        title="Clique para abrir em tamanho real"
                      >
                        <img src={url} alt={`Serviço concluído ${index + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold font-sans">
                          Ampliar ↗
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Action Form / Completion Summary */}
        <div className="lg:col-span-2">
          {((demand.status === 'PENDING' && (isElectrician || isAdmin)) || (isElectrician && demand.status === 'PENDING_APPROVAL' && isEditingExecution)) ? (
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-8">
              <div className="flex justify-between items-center border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-900">{isEditingExecution ? 'Editar Execução' : 'Concluir Serviço'}</h2>
                {isEditingExecution && (
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditingExecution(false);
                      setPhoto(null);
                      setPhotoPreview(null);
                      setExtraPhotos([]);
                      setExtraPhotoPreviews([]);
                      
                      const urls = demand?.photoUrl ? demand.photoUrl.split(',') : [];
                      if (urls.length > 0) {
                        setPhotoPreview(urls[0]);
                        if (urls.length > 1) {
                          setExtraPhotoPreviews(urls.slice(1));
                        }
                      }
                    }}
                    className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                  >
                    Cancelar Edição
                  </button>
                )}
              </div>
              
              {demand.referencePhotoUrl && (
                <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 flex gap-4 items-center">
                  <a 
                    href={demand.referencePhotoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden border border-gray-200 shrink-0 shadow-sm block hover:opacity-95 transition-opacity"
                    title="Clique para abrir em tamanho real"
                  >
                    <img 
                      src={demand.referencePhotoUrl} 
                      referrerPolicy="no-referrer" 
                      alt="Foto de referência" 
                      className="w-full h-full object-cover" 
                    />
                  </a>
                  <div className="text-xs text-blue-800">
                    <p className="font-bold">Foto/Imagem de Referência (Admin)</p>
                    <p className="text-blue-600/90 mt-1 leading-relaxed">Esta imagem explicativa foi anexada pelo administrador para auxiliar na execução deste serviço.</p>
                    <a 
                      href={demand.referencePhotoUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="inline-block mt-1.5 font-bold text-blue-700 hover:underline"
                    >
                      Visualizar imagem de referência ↗
                    </a>
                  </div>
                </div>
              )}
              
              {/* Photo Upload */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-4 font-sans">Fotos do Serviço (Mínimo 1 obrigatória)</label>
                <div className="space-y-4">
                  {/* Primary Photo */}
                  <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2 font-sans">Foto Principal (Obrigatória)</span>
                    <div 
                      className="w-full h-56 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center overflow-hidden relative bg-white shadow-inner"
                    >
                      {photoPreview ? (
                        <>
                          <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                            className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-6">
                          <Camera className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                          <p className="text-xs text-gray-400 font-medium font-sans">Nenhuma foto principal selecionada</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl font-bold hover:bg-blue-100 transition-all border border-blue-100 shadow-sm"
                      >
                        <Camera className="h-5 w-5" />
                        <span className="text-xs">Tirar Foto Principal</span>
                      </button>
                      <button 
                        type="button" 
                        onClick={() => galleryInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition-all border border-gray-200 shadow-sm"
                      >
                        <Image className="h-5 w-5" />
                        <span className="text-xs">Carregar da Galeria</span>
                      </button>
                    </div>
                  </div>

                  {/* Additional Photos List */}
                  <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-3 font-sans">Fotos Adicionais (Opcional)</span>
                    
                    <div className="grid grid-cols-3 gap-3">
                      {extraPhotoPreviews.map((preview, index) => (
                        <div key={index} className="aspect-square border border-gray-200 rounded-xl overflow-hidden relative bg-white shadow-sm">
                          <img src={preview} alt={`Extra ${index}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveExtraPhoto(index)}
                            className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full shadow-md hover:bg-red-700 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      
                      {/* Plus/Add Card */}
                      <button
                        type="button"
                        onClick={() => extraFileInputRef.current?.click()}
                        className="aspect-square border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center bg-white hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm"
                      >
                        <Plus className="h-6 w-6 text-gray-400" />
                        <span className="text-[10px] text-gray-400 font-bold mt-1 font-sans">Mais Fotos</span>
                      </button>
                    </div>
                  </div>
                  
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    capture="environment" 
                    onChange={handleFileChange} 
                  />
                  <input 
                    ref={galleryInputRef} 
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileChange} 
                  />
                  <input 
                    ref={extraFileInputRef} 
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    multiple
                    onChange={handleExtraFileChange} 
                  />
                </div>
              </div>

              {/* Used Materials */}
              <div className="relative">
                <label className="block text-sm font-bold text-gray-700 mb-4">
                  {demand?.plannedMaterials && demand.plannedMaterials.length > 0 ? 'Materiais Utilizados (Obrigatório)' : 'Materiais Utilizados (Opcional)'}
                </label>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-10 p-3 border border-gray-300 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Pesquisar material utilizado..."
                    value={usedMaterialSearch}
                    onChange={(e) => {
                      setUsedMaterialSearch(e.target.value);
                      setShowUsedResults(true);
                    }}
                    onFocus={() => setShowUsedResults(true)}
                  />
                  
                  {showUsedResults && usedMaterialSearch && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {materials?.filter((m: any) => m.name.toLowerCase().includes(usedMaterialSearch.toLowerCase())).map((m: any) => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full text-left p-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                          onClick={() => {
                            handleAddUsedMaterial(m.id);
                            setUsedMaterialSearch('');
                            setShowUsedResults(false);
                          }}
                        >
                          <span className="text-sm text-gray-700">{m.name}</span>
                          <Plus className="h-4 w-4 text-gray-400" />
                        </button>
                      ))}
                    </div>
                   )}
                </div>

                <div className="space-y-2">
                  {usedMaterials.map(m => {
                    const material = materials?.find((mat: any) => mat.id === m.materialId);
                    return (
                      <div key={m.materialId} className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <span className="text-sm font-medium">{material?.name}</span>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number" 
                            min="0"
                            className="w-20 p-2 border border-blue-200 rounded-lg text-center"
                            value={String(m.quantity)}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setUsedMaterials(prev => prev.map(item => 
                                item.materialId === m.materialId ? { ...item, quantity: val } : item
                              ));
                            }}
                          />
                          {!demand?.plannedMaterials?.some((pm: any) => pm.materialId === m.materialId) && (
                            <button 
                              type="button"
                              onClick={() => setUsedMaterials(prev => prev.filter(item => item.materialId !== m.materialId))}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Surplus Materials Disclosure */}
              {surplusMaterials.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold text-yellow-800 mb-3 flex items-center uppercase">
                    <AlertCircle className="h-4 w-4 mr-2" /> Materiais para Retorno (Sobra)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {surplusMaterials.map((m: any) => (
                      <div key={m.id} className="flex justify-between items-center p-2 bg-white rounded-lg border border-yellow-100 text-sm">
                        <span className="text-gray-700 font-medium">{m.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">Restante:</span>
                          <span className="font-bold text-yellow-700">{m.surplusQty} {m.unit || 'un'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-yellow-600 mt-3 italic">
                    * Estes materiais constam no planejamento mas não foram marcados como utilizados. Eles serão registrados automaticamente como materiais retornados.
                  </p>
                </div>
              )}

              {/* Replaced Materials */}
              <div className="relative">
                <label className="block text-sm font-bold text-gray-700 mb-2">Materiais Retornados / Defeituosos</label>
                <p className="text-xs text-gray-500 mb-4">Informe o que foi removido/substituído.</p>
                
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-10 p-3 border border-gray-300 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Pesquisar material substituído..."
                    value={replacedMaterialSearch}
                    onChange={(e) => {
                      setReplacedMaterialSearch(e.target.value);
                      setShowReplacedResults(true);
                    }}
                    onFocus={() => setShowReplacedResults(true)}
                  />
                  
                  {showReplacedResults && replacedMaterialSearch && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {materials?.filter((m: any) => m.name.toLowerCase().includes(replacedMaterialSearch.toLowerCase())).map((m: any) => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full text-left p-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                          onClick={() => {
                            handleAddReplacedMaterial(m.id);
                            setReplacedMaterialSearch('');
                            setShowReplacedResults(false);
                          }}
                        >
                          <span className="text-sm text-gray-700">{m.name}</span>
                          <Plus className="h-4 w-4 text-gray-400" />
                        </button>
                      ))}
                    </div>
                   )}
                </div>

                <div className="space-y-2">
                  {replacedMaterials.map(m => {
                    const material = materials?.find((mat: any) => mat.id === m.materialId);
                    return (
                      <div key={m.materialId} className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                        <span className="text-sm font-medium">{material?.name}</span>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number" 
                            min="0" 
                            className="w-20 p-2 border border-red-200 rounded-lg text-center"
                            value={String(m.quantity)}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setReplacedMaterials(prev => prev.map(item => 
                                item.materialId === m.materialId ? { ...item, quantity: val } : item
                              ));
                            }}
                          />
                          <button 
                            type="button"
                            onClick={() => setReplacedMaterials(prev => prev.filter(item => item.materialId !== m.materialId))}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Vehicles */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-4">Veículo / Equipamento (Obrigatório)</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {registeredVehicles?.map((v: any) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleVehicleToggle(v.name)}
                      className={`
                        p-3 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-center
                        ${vehicles.includes(v.name) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}
                      `}
                    >
                      <Truck className={`h-4 w-4 mr-2 ${vehicles.includes(v.name) ? 'text-white' : 'text-gray-400'}`} />
                      {v.name}
                    </button>
                  ))}
                  {registeredVehicles?.length === 0 && (
                    <p className="col-span-full text-sm text-gray-400 italic">Nenhum veículo cadastrado pelo sistema.</p>
                  )}
                </div>
              </div>

              {/* Tools */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-4">Ferramentas Utilizadas</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {registeredTools?.map((t: any) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleToolToggle(t.name)}
                      className={`
                        p-3 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-center
                        ${selectedTools.includes(t.name) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}
                      `}
                    >
                      <Wrench className={`h-4 w-4 mr-2 ${selectedTools.includes(t.name) ? 'text-white' : 'text-gray-400'}`} />
                      {t.name}
                    </button>
                  ))}
                  {registeredTools?.length === 0 && (
                    <p className="col-span-full text-sm text-gray-400 italic">Nenhuma ferramenta cadastrada pelo sistema.</p>
                  )}
                </div>
              </div>

              {/* Extra Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Número do Trafo</label>
                  <input 
                    type="text" 
                    className="w-full p-3 border border-gray-300 rounded-xl"
                    placeholder="Opcional"
                    value={trafo}
                    onChange={e => setTrafo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Observação</label>
                  <textarea 
                    className="w-full p-3 border border-gray-300 rounded-xl"
                    placeholder="Opcional"
                    rows={1}
                    value={obs}
                    onChange={e => setObs(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={finishMutation.isPending}
                className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-700 flex items-center justify-center disabled:opacity-50"
              >
                {finishMutation.isPending ? <Loader2 className="animate-spin h-6 w-6" /> : (
                  <>
                    <CheckCircle className="h-6 w-6 mr-2" /> {isEditingExecution ? 'SALVAR ALTERAÇÕES' : 'FINALIZAR SERVIÇO'}
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-8">
              <div className="flex justify-between items-center border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-900">Resumo da Execução</h2>
                {user?.role === 'ADMIN' && demand.status === 'PENDING_APPROVAL' && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setConfirmDialog({
                          isOpen: true,
                          title: 'Reprovar Execução',
                          message: 'Reprovar execução e retornar para o eletricista?',
                          variant: 'warning',
                          onConfirm: () => declineMutation.mutate()
                        });
                      }}
                      className="bg-red-50 text-red-600 px-4 py-2 rounded-xl font-bold hover:bg-red-100 transition-colors flex items-center border border-red-100"
                    >
                      REPROVAR
                    </button>
                    <button 
                      onClick={() => approveMutation.mutate()}
                      className="bg-purple-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-purple-700 flex items-center shadow-lg shadow-purple-200"
                    >
                      <CheckCircle className="h-5 w-5 mr-2" /> APROVAR
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className={demand.description?.includes('demanda para o mesmo local') ? 'md:col-span-2' : ''}>
                  <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Materiais Utilizados</h3>
                  <div className="space-y-2">
                    {demand.usedMaterials?.map((m: any) => (
                      <div key={m.id} className="flex justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 text-sm">
                        <span className="font-medium">{m.material.name}</span>
                        <span className="font-bold">{m.quantity}</span>
                      </div>
                    ))}
                    {demand.usedMaterials?.length === 0 && <p className="text-gray-500 text-sm italic">Nenhum material utilizado.</p>}
                  </div>
                </div>

                {!demand.description?.includes('demanda para o mesmo local') && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Relatório de Retorno</h3>
                    <div className="space-y-2">
                      {demand.returnedMaterials?.filter((m: any) => m.type !== 'RECOVERED').map((m: any) => (
                        <div key={m.id} className={`flex justify-between p-3 rounded-xl border text-sm ${m.type === 'DEFECTIVE' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                          <div className="flex flex-col">
                            <span className="font-medium">{m.material?.name || m.materialName}</span>
                            <span className="text-[10px] uppercase font-bold text-gray-400">{m.type === 'DEFECTIVE' ? 'Substituído' : 'Não Utilizado'}</span>
                          </div>
                          <span className="font-bold flex items-center">{m.quantity}</span>
                        </div>
                      ))}
                      {demand.returnedMaterials?.filter((m: any) => m.type === 'RECOVERED').length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <h4 className="text-xs font-bold text-green-700 mb-2 uppercase">Materiais Recuperados</h4>
                          {demand.returnedMaterials?.filter((m: any) => m.type === 'RECOVERED').map((m: any) => (
                            <div key={m.id} className="flex justify-between p-3 bg-green-50 rounded-xl border border-green-100 text-sm mb-2">
                              <span className="font-medium text-green-800">{m.material?.name || m.materialName}</span>
                              <span className="font-bold text-green-700">{m.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {demand.returnedMaterials?.length === 0 && <p className="text-gray-500 text-sm italic">Nenhum material retornado.</p>}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t pt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Veículos Utilizados</h3>
                  <div className="flex flex-wrap gap-2">
                    {demand.vehicles?.map((v: string) => (
                      <span key={v} className="px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-700 font-medium border border-gray-200">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Ferramentas Utilizadas</h3>
                  <div className="flex flex-wrap gap-2">
                    {demand.tools?.map((t: string) => (
                      <span key={t} className="px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-700 font-medium border border-gray-200">
                        {t}
                      </span>
                    ))}
                    {(!demand.tools || demand.tools.length === 0) && <p className="text-gray-500 text-sm italic">Nenhuma ferramenta indicada.</p>}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Outras Informações</h3>
                  <div className="space-y-2">
                    <p className="text-sm"><span className="font-bold">Trafo:</span> {demand.transformerNumber || 'N/A'}</p>
                    <p className="text-sm"><span className="font-bold">Observação:</span> {demand.observation || 'Sem observações.'}</p>
                  </div>
                </div>
                {demand.referencePhotoUrl && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Foto de Referência (Admin)</h3>
                    <div className="relative w-full max-w-xs h-40 bg-gray-50 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                      <a href={demand.referencePhotoUrl} target="_blank" rel="noreferrer" title="Ver imagem cheia">
                        <img 
                          src={demand.referencePhotoUrl} 
                          alt="Foto de referência" 
                          className="w-full h-full object-cover hover:opacity-90 transition-opacity" 
                          referrerPolicy="no-referrer"
                        />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {user?.role === 'ADMIN' && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Editar Demanda"
          maxWidth="max-w-2xl"
        >
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              updateMutation.mutate({
                ...editFormData,
                returnedMaterials: [
                  ...editFormData.returnedMaterials.map(m => ({ ...m, type: 'DEFECTIVE' })),
                  ...editFormData.recoveredMaterials.map(m => ({ ...m, type: 'RECOVERED' }))
                ]
              });
            }} 
            className="p-6 space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="date"
                    required
                    readOnly={user?.role !== 'ADMIN'}
                    className={`w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm ${user?.role !== 'ADMIN' ? 'bg-gray-50' : ''}`}
                    value={editFormData.date}
                    onChange={(e) => user?.role === 'ADMIN' && setEditFormData({...editFormData, date: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    required
                    readOnly={user?.role !== 'ADMIN'}
                    placeholder="Ex: Praça Matriz"
                    className={`w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm ${user?.role !== 'ADMIN' ? 'bg-gray-50' : ''}`}
                    value={editFormData.location}
                    onChange={(e) => user?.role === 'ADMIN' && setEditFormData({...editFormData, location: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Localização (Link do Google Maps / WhatsApp)</label>
              <div className="relative">
                <ExternalLink className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  readOnly={user?.role !== 'ADMIN'}
                  placeholder="Cole o link de localização compartilhado (Ex: https://maps.google.com/?q=...)"
                  className={`w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm ${user?.role !== 'ADMIN' ? 'bg-gray-50' : ''}`}
                  value={editFormData.googleMapsUrl}
                  onChange={(e) => user?.role === 'ADMIN' && setEditFormData({...editFormData, googleMapsUrl: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                required
                readOnly={user?.role !== 'ADMIN' && demand.status === 'PENDING'}
                rows={2}
                className={`w-full p-2 border border-gray-300 rounded-lg text-sm ${(user?.role !== 'ADMIN' && demand.status === 'PENDING') ? 'bg-gray-50' : ''}`}
                value={editFormData.description}
                onChange={(e) => (user?.role === 'ADMIN' || demand.status !== 'PENDING') && setEditFormData({...editFormData, description: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {user?.role === 'ADMIN' ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Eletricistas Responsáveis</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border border-gray-300 rounded-lg max-h-40 overflow-y-auto">
                    {electricians?.map((e: any) => (
                      <label key={e.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer border border-transparent hover:border-gray-100">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={editFormData.electricianIds.includes(e.id)}
                          onChange={(evt) => {
                            const newIds = evt.target.checked
                              ? [...editFormData.electricianIds, e.id]
                              : editFormData.electricianIds.filter(id => id !== e.id);
                            setEditFormData({...editFormData, electricianIds: newIds});
                          }}
                        />
                        <span className="text-xs text-gray-700 truncate" title={e.name}>{e.name}</span>
                      </label>
                    ))}
                  </div>
                  {editFormData.electricianIds.length === 0 && (
                    <p className="text-red-500 text-[10px] mt-1 font-medium">* Selecione pelo menos um eletricista.</p>
                  )}
                </div>
              ) : (
                <div className="md:col-span-2">
                   <p className="text-xs text-gray-500 italic">Responsáveis: {demand.electricians?.map((e: any) => e.name).join(', ')}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contato do Solicitante</label>
                <input
                  type="text"
                  readOnly={user?.role !== 'ADMIN'}
                  className={`w-full p-2 border border-gray-300 rounded-lg text-sm ${user?.role !== 'ADMIN' ? 'bg-gray-50' : ''}`}
                  value={editFormData.clientNumber}
                  onChange={(e) => user?.role === 'ADMIN' && setEditFormData({...editFormData, clientNumber: e.target.value})}
                />
              </div>

              {user?.role === 'ADMIN' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Repetição / Divisão de Demanda</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={editFormData.repetition}
                    onChange={(e) => setEditFormData({...editFormData, repetition: Math.max(1, parseInt(e.target.value) || 1)})}
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    A demanda se manterá como uma única em "Pendentes" e "Em Aprovação", mas ao ser aprovada, será registrada como <span className="font-bold text-blue-600">{editFormData.repetition}</span> demandas separadas com as mesmas quantidades em "Executadas" e no relatório.
                  </p>
                </div>
              )}

              {user?.role === 'ADMIN' && (
                <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-3 md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                      checked={editFormData.isPriority}
                      onChange={(e) => setEditFormData({...editFormData, isPriority: e.target.checked, priorityExecutionDate: e.target.checked ? editFormData.priorityExecutionDate : ''})}
                    />
                    <span className="text-sm font-bold text-amber-900 select-none flex items-center gap-1.5">
                      <Star className={`h-4 w-4 text-amber-500 ${editFormData.isPriority ? 'fill-amber-500 animate-pulse' : ''}`} />
                      Definir Demanda como Prioridade
                    </span>
                  </label>

                  {editFormData.isPriority && (
                    <div className="pl-6 space-y-2 animate-in fade-in slide-in-from-top-1">
                      <label className="block text-xs font-semibold text-amber-800 mb-1">
                        Data Programada para Execução <span className="text-red-600 font-bold">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        className="p-2 border border-amber-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        value={editFormData.priorityExecutionDate}
                        onChange={(e) => setEditFormData({...editFormData, priorityExecutionDate: e.target.value})}
                      />
                      <p className="text-[10px] text-amber-700 font-medium">
                        * Alertas de atenção serão exibidos no painel um dia antes e no mesmo dia da data programada.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t pt-4 space-y-6">
              {(user?.role === 'ADMIN' || demand.status === 'PENDING') && (
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center">
                    <Package className="h-4 w-4 mr-2" /> Materiais Planejados
                  </h3>
                  <div className="relative mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Pesquisar material planejado..."
                        value={materialSearch}
                        onChange={(e) => {
                          setMaterialSearch(e.target.value);
                          setShowMaterialResults(true);
                        }}
                        onFocus={() => setShowMaterialResults(true)}
                      />
                    </div>
                    {showMaterialResults && materialSearch && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                        {filteredMaterials?.map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            className="w-full text-left p-2 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                            onClick={() => {
                              handleAddMaterial(m.id);
                              setMaterialSearch('');
                              setShowMaterialResults(false);
                            }}
                          >
                            <span className="text-sm text-gray-700">{m.name}</span>
                            <Plus className="h-4 w-4 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {editFormData.materials.map((m) => {
                      const material = materials?.find((mat: any) => mat.id === m.materialId);
                      return (
                        <div key={m.materialId} className="flex items-center justify-between bg-gray-50 p-2.5 rounded-lg border border-gray-200 gap-4">
                          <span className="text-sm font-medium text-gray-700">{material?.name}</span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setEditFormData({
                                  ...editFormData,
                                  materials: editFormData.materials.map(mat => 
                                    mat.materialId === m.materialId 
                                      ? { ...mat, borrowed: !mat.borrowed } 
                                      : mat
                                  )
                                });
                              }}
                              className={`px-2 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                                m.borrowed 
                                  ? 'bg-amber-100 border-amber-300 text-amber-800' 
                                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                              }`}
                              title="Marcar material como emprestado"
                            >
                              <Clock className="h-3 w-3" />
                              <span>{m.borrowed ? 'Emprestado' : 'Empréstimo?'}</span>
                            </button>
                            <input
                              type="number"
                              min="1"
                              className="w-16 p-1 border border-gray-300 rounded text-center text-sm"
                              value={m.quantity}
                              onChange={(e) => updateMaterialQty(m.materialId, parseInt(e.target.value))}
                            />
                            <button type="button" onClick={() => removeMaterial(m.materialId)} className="text-red-500 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Execution Data */}
              {(user?.role === 'ADMIN' || demand.status === 'PENDING_APPROVAL') && (
                <div className="border-t pt-4 space-y-6">
                  <h3 className="text-sm font-bold text-gray-800 flex items-center uppercase">
                    <CheckCircle className="h-4 w-4 mr-2" /> Dados da Execução
                  </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número do Trafo</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                      value={editFormData.transformerNumber}
                      onChange={(e) => setEditFormData({...editFormData, transformerNumber: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                      value={editFormData.observation}
                      onChange={(e) => setEditFormData({...editFormData, observation: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Veículos</label>
                  <div className="flex flex-wrap gap-2">
                    {registeredVehicles?.map((v: any) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          const exists = editFormData.vehicles.includes(v.name);
                          setEditFormData({
                            ...editFormData,
                            vehicles: exists 
                              ? editFormData.vehicles.filter(name => name !== v.name)
                              : [...editFormData.vehicles, v.name]
                          });
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          editFormData.vehicles.includes(v.name)
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ferramentas</label>
                  <div className="flex flex-wrap gap-2">
                    {registeredTools?.map((t: any) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          const isNone = t.name.toLowerCase() === 'nenhuma';
                          let newTools;
                          if (isNone) {
                            newTools = editFormData.tools.includes(t.name) ? [] : [t.name];
                          } else {
                            const withoutNone = editFormData.tools.filter(name => name.toLowerCase() !== 'nenhuma');
                            newTools = withoutNone.includes(t.name)
                              ? withoutNone.filter(name => name !== t.name)
                              : [...withoutNone, t.name];
                          }
                          setEditFormData({
                            ...editFormData,
                            tools: newTools
                          });
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          editFormData.tools.includes(t.name)
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Used Materials in Edit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Materiais Utilizados</label>
                  <div className="relative mb-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Adicionar material utilizado..."
                        value={editUsedSearch}
                        onChange={(e) => {
                          setEditUsedSearch(e.target.value);
                          setShowEditUsedResults(true);
                        }}
                        onFocus={() => setShowEditUsedResults(true)}
                      />
                    </div>
                    {showEditUsedResults && editUsedSearch && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                        {materials?.filter((m: any) => m.name.toLowerCase().includes(editUsedSearch.toLowerCase())).map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            className="w-full text-left p-2 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                            onClick={() => {
                              if (!editFormData.usedMaterials.find(x => x.materialId === m.id)) {
                                setEditFormData({
                                  ...editFormData,
                                  usedMaterials: [...editFormData.usedMaterials, { materialId: m.id, quantity: 1 }]
                                });
                              }
                              setEditUsedSearch('');
                              setShowEditUsedResults(false);
                            }}
                          >
                            <span className="text-sm text-gray-700">{m.name}</span>
                            <Plus className="h-4 w-4 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {editFormData.usedMaterials.map(m => {
                      const mat = materials?.find((x: any) => x.id === m.materialId);
                      return (
                        <div key={m.materialId} className="flex items-center justify-between bg-blue-50/50 p-2 rounded-lg text-xs">
                          <span>{mat?.name}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              className="w-12 p-1 border rounded text-center" 
                              value={m.quantity}
                              onChange={(e) => setEditFormData({
                                ...editFormData,
                                usedMaterials: editFormData.usedMaterials.map(x => x.materialId === m.materialId ? { ...x, quantity: parseInt(e.target.value) } : x)
                              })}
                            />
                            <button 
                              type="button"
                              onClick={() => setEditFormData({...editFormData, usedMaterials: editFormData.usedMaterials.filter(x => x.materialId !== m.materialId)})}
                              className="text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recovered Materials in Edit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Materiais Recuperados (Consertados)</label>
                  <div className="relative mb-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Adicionar material recuperado..."
                        value={editRecSearch}
                        onChange={(e) => {
                          setEditRecSearch(e.target.value);
                          setShowEditRecResults(true);
                        }}
                        onFocus={() => setShowEditRecResults(true)}
                      />
                    </div>
                    {showEditRecResults && editRecSearch && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                        {materials?.filter((m: any) => m.name.toLowerCase().includes(editRecSearch.toLowerCase())).map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            className="w-full text-left p-2 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                            onClick={() => {
                              if (!editFormData.recoveredMaterials.find(x => x.materialId === m.id)) {
                                setEditFormData({
                                  ...editFormData,
                                  recoveredMaterials: [...editFormData.recoveredMaterials, { materialId: m.id, quantity: 1 }]
                                });
                              }
                              setEditRecSearch('');
                              setShowEditRecResults(false);
                            }}
                          >
                            <span className="text-sm text-gray-700">{m.name}</span>
                            <Plus className="h-4 w-4 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {editFormData.recoveredMaterials.map(m => {
                      const mat = materials?.find((x: any) => x.id === m.materialId);
                      return (
                        <div key={m.materialId} className="flex items-center justify-between bg-green-50/50 p-2 rounded-lg text-xs">
                          <span>{mat?.name}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              className="w-12 p-1 border rounded text-center" 
                              value={m.quantity}
                              onChange={(e) => setEditFormData({
                                ...editFormData,
                                recoveredMaterials: editFormData.recoveredMaterials.map(x => x.materialId === m.materialId ? { ...x, quantity: parseInt(e.target.value) } : x)
                              })}
                            />
                            <button 
                              type="button"
                              onClick={() => setEditFormData({...editFormData, recoveredMaterials: editFormData.recoveredMaterials.filter(x => x.materialId !== m.materialId)})}
                              className="text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Returned Materials in Edit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Materiais Substituídos</label>
                  <div className="relative mb-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Adicionar material substituído..."
                        value={editRetSearch}
                        onChange={(e) => {
                          setEditRetSearch(e.target.value);
                          setShowEditRetResults(true);
                        }}
                        onFocus={() => setShowEditRetResults(true)}
                      />
                    </div>
                    {showEditRetResults && editRetSearch && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                        {materials?.filter((m: any) => m.name.toLowerCase().includes(editRetSearch.toLowerCase())).map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            className="w-full text-left p-2 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                            onClick={() => {
                              if (!editFormData.returnedMaterials.find(x => x.materialId === m.id)) {
                                setEditFormData({
                                  ...editFormData,
                                  returnedMaterials: [...editFormData.returnedMaterials, { materialId: m.id, quantity: 1 }]
                                });
                              }
                              setEditRetSearch('');
                              setShowEditRetResults(false);
                            }}
                          >
                            <span className="text-sm text-gray-700">{m.name}</span>
                            <Plus className="h-4 w-4 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {editFormData.returnedMaterials.map(m => {
                      const mat = materials?.find((x: any) => x.id === m.materialId);
                      return (
                        <div key={m.materialId} className="flex items-center justify-between bg-red-50/50 p-2 rounded-lg text-xs">
                          <span>{mat?.name}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              className="w-12 p-1 border rounded text-center" 
                              value={m.quantity}
                              onChange={(e) => setEditFormData({
                                ...editFormData,
                                returnedMaterials: editFormData.returnedMaterials.map(x => x.materialId === m.materialId ? { ...x, quantity: parseInt(e.target.value) } : x)
                              })}
                            />
                            <button 
                              type="button"
                              onClick={() => setEditFormData({...editFormData, returnedMaterials: editFormData.returnedMaterials.filter(x => x.materialId !== m.materialId)})}
                              className="text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center disabled:opacity-50"
              >
                {updateMutation.isPending ? <Loader2 className="animate-spin h-5 w-5" /> : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Floating Action Button for Admin Edit */}
      {user?.role === 'ADMIN' && (
        <button
          onClick={handleEditClick}
          className="fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-2xl hover:bg-blue-700 transition-all hover:scale-110 active:scale-95 z-50 flex items-center gap-2 group border-4 border-white"
          title="Editar Demanda"
        >
          <Pencil className="h-6 w-6" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out font-bold">
            EDITAR DEMANDA
          </span>
        </button>
      )}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={(confirmDialog as any).variant}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
      />

      <ShareOptionsModal
        isOpen={!!activeShareData}
        onClose={() => setActiveShareData(null)}
        title={activeShareData?.title || ''}
        text={activeShareData?.text || ''}
        photos={activeShareData?.photos || []}
      />
    </Layout>
  );
}

function StatusBadge({ status, isOfflineCompleted }: { status: string; isOfflineCompleted?: boolean }) {
  if (isOfflineCompleted) {
    return (
      <span className="px-4 py-1 rounded-full text-xs font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 animate-pulse flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>
        Offline (Pendente Envio)
      </span>
    );
  }

  const configs: any = {
    PENDING: { color: 'bg-yellow-100 text-yellow-800', label: 'Pendente' },
    PENDING_APPROVAL: { color: 'bg-blue-100 text-blue-800', label: 'Em Aprovação' },
    CONCLUDED: { color: 'bg-green-100 text-green-800', label: 'Executada' },
  };

  const config = configs[status] || { color: 'bg-gray-100 text-gray-800', label: status };

  return (
    <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase ${config.color}`}>
      {config.label}
    </span>
  );
}
