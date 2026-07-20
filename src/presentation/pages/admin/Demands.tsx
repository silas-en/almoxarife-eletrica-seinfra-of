import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout.tsx';
import Modal from '../../components/Modal.tsx';
import api from '../../services/api.ts';
import { Plus, Search, FileDown, Upload, X, Loader2, Calendar, MapPin, User, ClipboardList, Trash2, Package, Pencil, ExternalLink, Camera, Clock, Star, AlertTriangle, Share2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { parseUTCDate, formatLocalDate } from '../../utils/date.ts';

import ConfirmDialog from '../../components/ConfirmDialog.tsx';
import ShareOptionsModal from '../../components/ShareOptionsModal.tsx';
import { useOffline } from '../../context/OfflineContext.tsx';
import { IndexedDbService } from '../../../infra/storage/indexedDbService.ts';

export default function Demands() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isOnline, saveOfflineDemand, pendingOfflineDemands } = useOffline();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDemand, setEditingDemand] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [activeShareData, setActiveShareData] = useState<{ title: string; text: string; photos: string[] } | null>(null);

  const [isReprocessing, setIsReprocessing] = useState(false);

  const handleReprocessDemands = async () => {
    setIsReprocessing(true);
    try {
      const res = await api.post('/demands/reprocess-exclusive');
      const { healedCount, splitCount } = res.data;
      showFeedback('success', `Demandas atualizadas! Clones unificados: ${healedCount}. Novos splits: ${splitCount}.`);
      queryClient.invalidateQueries({ queryKey: ['demands'] });
    } catch (err) {
      console.error('Error reprocessing demands:', err);
      showFeedback('error', 'Erro ao atualizar demandas. Tente novamente.');
    } finally {
      setIsReprocessing(false);
    }
  };
  
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };
  
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  
  const [formData, setFormData] = useState({
    date: formatLocalDate(new Date(), 'yyyy-MM-dd'),
    location: '',
    googleMapsUrl: '',
    description: '',
    clientNumber: '',
    electricianIds: [] as string[],
    materials: [] as { materialId: string; quantity: number; borrowed?: boolean; borrowedDeadline?: string }[],
    isPriority: false,
    priorityExecutionDate: '',
    repetition: 1
  });

  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);

  const buildMultipartFormData = () => {
    const data = new FormData();
    data.append('date', formData.date);
    data.append('location', formData.location);
    data.append('googleMapsUrl', formData.googleMapsUrl || '');
    data.append('description', formData.description);
    data.append('clientNumber', formData.clientNumber || '');
    data.append('electricianIds', JSON.stringify(formData.electricianIds));
    data.append('materials', JSON.stringify(formData.materials));
    data.append('isPriority', String(formData.isPriority));
    data.append('priorityExecutionDate', formData.priorityExecutionDate || '');
    data.append('repetition', String(formData.repetition || 1));
    
    if (selectedPhoto) {
      data.append('photo', selectedPhoto);
    } else if (photoCleared) {
      data.append('photoUrl', 'null');
    }
    return data;
  };

  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialResults, setShowMaterialResults] = useState(false);

  const { data: demands, isLoading } = useQuery({
    queryKey: ['demands'],
    queryFn: async () => {
      try {
        const data = (await api.get('/demands')).data;
        await IndexedDbService.saveCachedDemands(data);
        return data;
      } catch (err) {
        console.warn('Demands list: Failed to fetch online. Loading cached demands...', err);
        return await IndexedDbService.getAllCachedDemands();
      }
    }
  });

  const { data: materials } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => {
      try {
        const data = (await api.get('/materials')).data;
        await IndexedDbService.saveMetadata('materials', data);
        return data;
      } catch (err) {
        console.warn('Demands list: Failed to fetch materials. Loading cached materials...', err);
        return (await IndexedDbService.getMetadata('materials')) || [];
      }
    }
  });

  const filteredMaterials = Array.isArray(materials)
    ? materials.filter((m: any) => m.name.toLowerCase().includes(materialSearch.toLowerCase()))
    : [];

  const { data: electricians } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        const resp = await api.get('/users');
        const list = resp.data.filter((u: any) => u.role === 'ELECTRICIAN' && u.status === 'APPROVED');
        await IndexedDbService.saveMetadata('electricians', list);
        return list;
      } catch (err) {
        console.warn('Demands list: Failed to fetch electricians. Loading cached electricians...', err);
        return (await IndexedDbService.getMetadata('electricians')) || [];
      }
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => await api.post('/demands', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      setIsModalOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => await api.put(`/demands/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      setIsModalOpen(false);
      resetForm();
    },
  });

  const createMaterialMutation = useMutation({
    mutationFn: async (name: string) => (await api.post('/materials', { name })).data,
    onSuccess: (newMaterial) => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      handleAddMaterial(newMaterial.id);
      setMaterialSearch('');
      setShowMaterialResults(false);
    }
  });

  const resetForm = () => {
    setEditingDemand(null);
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setPhotoCleared(false);
    setFormData({
      date: formatLocalDate(new Date(), 'yyyy-MM-dd'),
      location: '',
      googleMapsUrl: '',
      description: '',
      clientNumber: '',
      electricianIds: [],
      materials: [],
      isPriority: false,
      priorityExecutionDate: '',
      repetition: 1
    });
  };

  const handleWhatsAppShare = async (demand: any) => {
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

  const handleEditDemand = (demand: any) => {
    setEditingDemand(demand);
    setPhotoPreview(demand.photoUrl || null);
    setSelectedPhoto(null);
    setPhotoCleared(false);
    setFormData({
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
      })) || []
    });
    setIsModalOpen(true);
  };

  const handleAddMaterial = (materialId: string) => {
    if (!materialId) return;
    if (formData.materials.find(m => m.materialId === materialId)) return;
    setFormData({
      ...formData,
      materials: [...formData.materials, { materialId, quantity: 1 }]
    });
  };

  const updateMaterialQty = (materialId: string, quantity: number) => {
    setFormData({
      ...formData,
      materials: formData.materials.map(m => m.materialId === materialId ? { ...m, quantity } : m)
    });
  };

  const removeMaterial = (materialId: string) => {
    setFormData({
      ...formData,
      materials: formData.materials.filter(m => m.materialId !== materialId)
    });
  };

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        const data = (await api.get('/users')).data;
        await IndexedDbService.saveMetadata('users', data);
        return data;
      } catch (err) {
        console.warn('Demands list: Failed to fetch users. Loading cached users...', err);
        return (await IndexedDbService.getMetadata('users')) || [];
      }
    }
  });

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        let data = JSON.parse(text);
        if (!Array.isArray(data)) {
          data = [data];
        }

        const mappedDemands: any[] = [];

        for (let i = 0; i < data.length; i++) {
          const item = data[i];
          
          // Must have: data, local, descrição (or descricao)
          const dateVal = item['data'];
          const locationVal = item['local'];
          const descriptionVal = item['descrição'] || item['descricao'];

          if (!dateVal || !locationVal || !descriptionVal) {
            showFeedback('error', `Erro no item ${i + 1}: Chaves obrigatórias 'data', 'local' e 'descrição' precisam estar preenchidas.`);
            return;
          }

          // Optional: eletricistas
          const electriciansInput = item['eletricistas'];
          const electricianIds: string[] = [];
          if (electriciansInput) {
            const namesToMatch = Array.isArray(electriciansInput) 
              ? electriciansInput 
              : typeof electriciansInput === 'string' 
                ? [electriciansInput] 
                : [];
                
            namesToMatch.forEach((nameStr: any) => {
              if (!nameStr) return;
              const foundUser = users?.find((u: any) => 
                u.name.toLowerCase() === nameStr.toString().trim().toLowerCase() ||
                u.username.toLowerCase() === nameStr.toString().trim().toLowerCase()
              );
              if (foundUser) {
                electricianIds.push(foundUser.id);
              }
            });
          }

          // Optional: contato (maps to clientNumber)
          const contactVal = item['contato']?.toString() || '';

          // Optional: materiais planejados
          const materialsInput = item['materiais planejados'] || item['materiais_planejados'] || item['materiaisPlanejados'];
          const plannedMatus: any[] = [];
          if (materialsInput && Array.isArray(materialsInput)) {
            materialsInput.forEach((matItem: any) => {
              const itemMatName = matItem['material'] || matItem['nome'] || matItem['name'];
              const itemMatQty = matItem['quantidade'] || matItem['quantity'] || matItem['qtd'] || matItem['qty'] || 1;
              if (itemMatName) {
                const matchedMaterial = materials?.find((m: any) => 
                  m.name.toLowerCase() === itemMatName.toString().trim().toLowerCase()
                );
                if (matchedMaterial) {
                  plannedMatus.push({
                    materialId: matchedMaterial.id,
                    quantity: Number(itemMatQty) || 1
                  });
                }
              }
            });
          }

          mappedDemands.push({
            date: dateVal,
            location: locationVal,
            description: descriptionVal,
            clientNumber: contactVal,
            electricianIds: electricianIds,
            materials: plannedMatus
          });
        }

        if (mappedDemands.length === 0) {
          showFeedback('error', 'Nenhuma demanda válida encontrada no arquivo JSON.');
          return;
        }

        setConfirmDialog({
          isOpen: true,
          title: 'Confirmar Importação',
          message: `Deseja importar ${mappedDemands.length} demandas do arquivo JSON?`,
          onConfirm: async () => {
            try {
              await api.post('/demands/bulk', { demands: mappedDemands });
              queryClient.invalidateQueries({ queryKey: ['demands'] });
              showFeedback('success', 'Importação JSON concluída com sucesso!');
            } catch (error) {
              console.error('Import error:', error);
              showFeedback('error', 'Erro ao enviar dados da importação.');
            }
          }
        });
      } catch (error) {
        console.error('Import error:', error);
        showFeedback('error', 'Erro ao ler ou processar arquivo JSON. Verifique a sintaxe.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const [activeTab, setActiveTab] = useState<'PENDING' | 'PENDING_APPROVAL' | 'CONCLUDED'>('PENDING');

  const deleteDemandMutation = useMutation({
    mutationFn: async (id: string) => {
      if (id.startsWith('offline-')) {
        await IndexedDbService.deleteDemand(id);
      } else {
        await api.delete(`/demands/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      // The context listener updates pendingOfflineDemands automatically
      showFeedback('success', 'Registro removido com sucesso.');
    }
  });

  const deliverDemandMutation = useMutation({
    mutationFn: (id: string) => api.put(`/demands/${id}/deliver-materials`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      showFeedback('success', 'Materiais entregues ao eletricista! Demanda pronta para execução.');
    },
    onError: () => {
      showFeedback('error', 'Erro ao registrar entrega dos materiais.');
    }
  });

  const mappedOfflineDemands = (pendingOfflineDemands || []).map((od: any) => {
    const matchedElectricians = (users || []).filter((u: any) => od.formData.electricianIds?.includes(u.id));

    return {
      id: od.id,
      date: od.formData.date,
      location: od.formData.location,
      googleMapsUrl: od.formData.googleMapsUrl || '',
      description: od.formData.description || '',
      clientNumber: od.formData.clientNumber || '',
      electricians: matchedElectricians,
      status: 'PENDING',
      isOfflinePending: true,
      createdAt: od.createdAt,
      plannedMaterials: od.formData.materials?.map((m: any) => {
        const mat = materials?.find((x: any) => x.id === m.materialId);
        return {
          id: `offline-pm-${m.materialId}`,
          materialId: m.materialId,
          quantity: m.quantity,
          material: mat ? { id: mat.id, name: mat.name, unit: mat.unit } : { id: m.materialId, name: 'Material', unit: 'Un' }
        };
      }) || [],
      photoUrl: od.photoBlob ? URL.createObjectURL(od.photoBlob) : null
    };
  });

  const combinedDemands = [
    ...mappedOfflineDemands,
    ...(demands || [])
  ];

  const currentYear = new Date().getFullYear();
  const yearDemands = combinedDemands.filter((d: any) => {
    if (!d.date) return false;
    return parseUTCDate(d.date).getFullYear() === currentYear;
  });

  const filteredDemands = yearDemands.filter((d: any) => {
    const matchesSearch = 
      d.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.electricians?.some((e: any) => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return d.status === activeTab && matchesSearch;
  });

  if (activeTab === 'CONCLUDED') {
    filteredDemands.sort((a: any, b: any) => {
      const dateA = parseUTCDate(a.date).getTime();
      const dateB = parseUTCDate(b.date).getTime();
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      const nameA = a.location || '';
      const nameB = b.location || '';
      const comp = nameA.localeCompare(nameB);
      if (comp !== 0) return comp;
      const descA = a.description || '';
      const descB = b.description || '';
      return descA.localeCompare(descB);
    });
  }

  return (
    <Layout>
      {/* Feedback Message */}
      {feedback && (
        <div className={`fixed top-4 right-4 z-[100] p-4 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
          feedback.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span className="font-medium">{feedback.message}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demandas</h1>
          <p className="text-gray-600">Gestão de ordens de serviço e tarefas.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto flex-wrap md:flex-nowrap">
          <button
            onClick={handleReprocessDemands}
            disabled={isReprocessing}
            className="flex-1 md:flex-none bg-amber-600 text-white px-4 py-2 rounded-lg flex items-center justify-center hover:bg-amber-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isReprocessing ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5 mr-2" />
            )}
            <span className="text-sm font-medium">Atualizar Demandas</span>
          </button>
          <label className="flex-1 md:flex-none bg-white border border-gray-300 rounded-lg px-4 py-2 flex items-center cursor-pointer hover:bg-gray-50 transition-colors">
            <Upload className="h-5 w-5 mr-2 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Importar JSON</span>
            <input type="file" className="hidden" accept=".json" onChange={handleImportJSON} />
          </label>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center justify-center hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" /> Nova Demanda
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`pb-2 px-1 text-sm font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'PENDING' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Pendentes
        </button>
        <button
          onClick={() => setActiveTab('PENDING_APPROVAL')}
          className={`pb-2 px-1 text-sm font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'PENDING_APPROVAL' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Em Aprovação
        </button>
        <button
          onClick={() => setActiveTab('CONCLUDED')}
          className={`pb-2 px-1 text-sm font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'CONCLUDED' ? 'border-b-2 border-green-600 text-green-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Executadas
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex items-center">
        <Search className="h-5 w-5 text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Buscar por local, descrição ou eletricista..."
          className="flex-1 outline-none text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12">Carregando demandas...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3">Local</th>
                <th className="px-6 py-3">Responsável</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDemands?.map((demand: any) => (
                <tr 
                  key={demand.id} 
                  className={`hover:bg-gray-50 transition-colors cursor-pointer group ${demand.isOfflinePending ? 'bg-amber-50/25 border-l-4 border-l-amber-500' : ''}`}
                  onClick={() => {
                    if (demand.isOfflinePending) {
                      handleEditDemand(demand);
                    } else {
                      navigate(`/demands/${demand.id}`);
                    }
                  }}
                >
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium group-hover:text-blue-600 transition-colors">
                    {formatLocalDate(demand.date, 'dd/MM/yyyy')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 flex-wrap group-hover:text-blue-600 transition-colors">
                      <span className="text-sm font-bold text-gray-900">{demand.location}</span>
                      {demand.isPriority && (
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[9px] font-black uppercase flex items-center gap-1 border border-amber-200 shrink-0 select-none">
                          <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                          Prioridade ({demand.priorityExecutionDate ? formatLocalDate(demand.priorityExecutionDate, 'dd/MM/yyyy') : ''})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-xs">{demand.description}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div className="flex flex-wrap gap-1">
                      {demand.electricians && demand.electricians.length > 0 ? (
                        demand.electricians.map((e: any) => (
                           <span key={e.id} className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                             {e.name}
                           </span>
                        ))
                      ) : (
                        <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase animate-pulse border border-red-100">
                          Não atribuída!
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={demand.status} isOfflinePending={demand.isOfflinePending} />
                  </td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-3 items-center">
                      {!demand.isOfflinePending && demand.status === 'PENDING' && !demand.materialsDelivered && demand.plannedMaterials?.length > 0 && (
                        <button 
                          onClick={() => {
                            setConfirmDialog({
                              isOpen: true,
                              title: 'Entregar Materiais',
                              message: `Deseja registrar a entrega física de todos os materiais separados para esta demanda em "${demand.location}"?`,
                              onConfirm: () => deliverDemandMutation.mutate(demand.id)
                            });
                          }}
                          className="text-amber-600 hover:text-amber-800 flex items-center gap-1 text-xs font-bold"
                          title="Entregar Materiais (Indicar que o kit foi retirado)"
                        >
                          <Package className="h-4 w-4 text-amber-500" />
                          <span className="hidden md:inline">Entregar</span>
                        </button>
                      )}
                      {((demand.status === 'CONCLUDED' || demand.status === 'PENDING_APPROVAL') && demand.photoUrl) && (
                        <button
                          onClick={() => handleWhatsAppShare(demand)}
                          className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1 text-xs font-bold"
                          title="Compartilhar no WhatsApp"
                        >
                          <Share2 className="h-4 w-4" />
                          <span className="hidden lg:inline">Compartilhar</span>
                        </button>
                      )}
                      <button 
                        onClick={() => handleEditDemand(demand)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: demand.isOfflinePending ? 'Excluir Demanda Local' : 'Excluir Demanda',
                            message: demand.isOfflinePending 
                              ? 'Deseja excluir esta demanda offline pendente? Esta ação é definitiva.'
                              : 'Tem certeza que deseja excluir esta demanda definitivamente?',
                            onConfirm: () => deleteDemandMutation.mutate(demand.id)
                          });
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm(); }}
        title={editingDemand ? "Editar Demanda" : "Nova Demanda"}
        maxWidth="max-w-2xl"
      >
        <form 
          onSubmit={async (e) => { 
            e.preventDefault(); 
            if (editingDemand) {
              if (editingDemand.isOfflinePending) {
                try {
                  const photoBlob = selectedPhoto ? (selectedPhoto as Blob) : (editingDemand.photoBlob || null);
                  const photoName = selectedPhoto ? selectedPhoto.name : (editingDemand.photoName || null);
                  const photoType = selectedPhoto ? selectedPhoto.type : (editingDemand.photoType || null);

                  await IndexedDbService.saveDemand({
                    id: editingDemand.id,
                    formData: {
                      date: formData.date,
                      location: formData.location,
                      googleMapsUrl: formData.googleMapsUrl || '',
                      description: formData.description || '',
                      clientNumber: formData.clientNumber || '',
                      electricianIds: formData.electricianIds || [],
                      materials: formData.materials || []
                    },
                    photoBlob,
                    photoName,
                    photoType,
                    createdAt: editingDemand.createdAt || Date.now()
                  });
                  showFeedback('success', 'Alterações na demanda offline salvas localmente!');
                  setIsModalOpen(false);
                  resetForm();
                  // Trigger direct storage read automatically handled by the hook
                } catch (err) {
                  showFeedback('error', 'Erro ao salvar alterações da demanda offline.');
                }
              } else {
                const data = buildMultipartFormData();
                updateMutation.mutate({ id: editingDemand.id, data });
              }
            } else {
              if (!isOnline) {
                try {
                  await saveOfflineDemand(formData, selectedPhoto);
                  showFeedback('success', 'Conexão indisponível! Demanda salva localmente de forma segura. Sincronização automática quando a internet retornar.');
                  setIsModalOpen(false);
                  resetForm();
                } catch (err) {
                  showFeedback('error', 'Erro ao registrar nova demanda offline.');
                }
              } else {
                const data = buildMultipartFormData();
                createMutation.mutate(data);
              }
            }
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
                  className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
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
                  placeholder="Ex: Praça Matriz"
                  className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
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
                placeholder="Cole o link de localização compartilhado (Ex: https://maps.google.com/?q=...)"
                className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                value={formData.googleMapsUrl}
                onChange={(e) => setFormData({...formData, googleMapsUrl: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              required
              rows={2}
              className="w-full p-2 border border-gray-300 rounded-lg text-sm"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Eletricistas Responsáveis</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border border-gray-300 rounded-lg max-h-40 overflow-y-auto">
                {electricians?.map((e: any) => (
                  <label key={e.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer border border-transparent hover:border-gray-100">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={formData.electricianIds.includes(e.id)}
                      onChange={(evt) => {
                        const newIds = evt.target.checked
                          ? [...formData.electricianIds, e.id]
                          : formData.electricianIds.filter(id => id !== e.id);
                        setFormData({...formData, electricianIds: newIds});
                      }}
                    />
                    <span className="text-xs text-gray-700 truncate" title={e.name}>{e.name}</span>
                  </label>
                ))}
              </div>
              {formData.electricianIds.length === 0 && (
                <p className="text-blue-500 text-[10px] mt-1 font-medium italic">Opcional: Você pode atribuir eletricistas agora ou depois.</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contato do Solicitante</label>
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={formData.clientNumber}
                onChange={(e) => setFormData({...formData, clientNumber: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Repetição / Divisão de Demanda</label>
              <input
                type="number"
                min="1"
                max="100"
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={formData.repetition}
                onChange={(e) => setFormData({...formData, repetition: Math.max(1, parseInt(e.target.value) || 1)})}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                A demanda se manterá como uma única em "Pendentes" e "Em Aprovação", mas ao ser aprovada, será registrada como <span className="font-bold text-blue-600">{formData.repetition}</span> demandas separadas com as mesmas quantidades em "Executadas" e no relatório.
              </p>
            </div>

            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-3 sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                  checked={formData.isPriority}
                  onChange={(e) => setFormData({...formData, isPriority: e.target.checked, priorityExecutionDate: e.target.checked ? formData.priorityExecutionDate : ''})}
                />
                <span className="text-sm font-bold text-amber-900 select-none flex items-center gap-1.5">
                  <Star className={`h-4 w-4 text-amber-500 ${formData.isPriority ? 'fill-amber-500 animate-pulse' : ''}`} />
                  Definir Demanda como Prioridade
                </span>
              </label>

              {formData.isPriority && (
                <div className="pl-6 space-y-2 animate-in fade-in slide-in-from-top-1">
                  <label className="block text-xs font-semibold text-amber-800 mb-1">
                    Data Programada para Execução <span className="text-red-600 font-bold">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    className="p-2 border border-amber-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={formData.priorityExecutionDate}
                    onChange={(e) => setFormData({...formData, priorityExecutionDate: e.target.value})}
                  />
                  <p className="text-[10px] text-amber-700 font-medium">
                    * Alertas de atenção serão exibidos no painel um dia antes e no mesmo dia da data programada.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center">
              <Camera className="h-4 w-4 mr-2 text-blue-600" /> Foto de Referência (Opcional)
            </h3>
            
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {photoPreview ? (
                <div className="relative w-full sm:w-40 h-40 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 shadow-sm shrink-0">
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPhoto(null);
                      setPhotoPreview(null);
                      setPhotoCleared(true);
                    }}
                    className="absolute top-1.5 right-1.5 p-1 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors shadow-sm"
                    title="Remover foto"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full sm:w-40 h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 hover:border-blue-500 transition-colors shrink-0">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                    <Camera className="h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-xs font-semibold text-gray-500">Adicionar Foto</p>
                    <p className="text-[10px] text-gray-400 mt-1">PNG, JPG, GIF</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedPhoto(file);
                        setPhotoPreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                </label>
              )}
              
              <div className="text-xs text-gray-500 flex-1">
                <p className="font-semibold mb-1">Anexe uma foto ou imagem explicativa à demanda</p>
                <p>Anexe imagens de postes, fiação, transformadores ou qualquer detalhe visual para auxiliar a equipe de campo.</p>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center">
              <Package className="h-4 w-4 mr-2" /> Materiais Planejados
            </h3>
            
            <div className="relative">
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
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
              </div>

              {showMaterialResults && materialSearch && (
                <div className="absolute z-10 w-full -mt-3 mb-4 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {filteredMaterials?.map((m: any) => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full text-left p-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
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
                  
                  {!materials?.find((m: any) => m.name.toLowerCase() === materialSearch.toLowerCase()) && (
                    <button
                      type="button"
                      className="w-full text-left p-3 hover:bg-blue-50 text-blue-600 flex items-center border-t border-blue-100"
                      onClick={() => createMaterialMutation.mutate(materialSearch)}
                      disabled={createMaterialMutation.isPending}
                    >
                      {createMaterialMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-wider">Novo Material</span>
                        <span className="text-sm">Registrar "{materialSearch}"</span>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {formData.materials.map((m) => {
                const material = materials?.find((mat: any) => mat.id === m.materialId);
                return (
                  <div key={m.materialId} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200 gap-4">
                    <span className="text-sm font-medium text-gray-700">{material?.name}</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            materials: formData.materials.map(mat => 
                              mat.materialId === m.materialId 
                                ? { ...mat, borrowed: !mat.borrowed } 
                                : mat
                            )
                          });
                        }}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
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
                      <button 
                        type="button"
                        onClick={() => removeMaterial(m.materialId)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {formData.materials.length === 0 && (
                <p className="text-center text-xs text-gray-500 py-4 italic">Nenhum material adicionado.</p>
              )}
            </div>
          </div>

          <div className="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2">
            <button
              type="button"
              onClick={() => { setIsModalOpen(false); resetForm(); }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                editingDemand ? 'Salvar Alterações' : 'Criar Demanda'
              )}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
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

function StatusBadge({ status, isOfflinePending }: { status: string; isOfflinePending?: boolean }) {
  if (isOfflinePending) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
        Offline (Pendente)
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
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${config.color}`}>
      {config.label}
    </span>
  );
}
