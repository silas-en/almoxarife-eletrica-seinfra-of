import React, { useState } from 'react';
import Layout from '../../components/Layout.tsx';
import Modal from '../../components/Modal.tsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  Layers, 
  Search, 
  Calendar, 
  User, 
  MapPin, 
  Package, 
  FileDown, 
  ClipboardList,
  CheckSquare,
  Square,
  ArrowLeft,
  Info,
  EyeOff,
  Eye,
  Pencil,
  Trash2,
  X,
  Loader2,
  Plus,
  ExternalLink
} from 'lucide-react';
import { formatLocalDate } from '../../utils/date.ts';

interface ElectricianListItem {
  id: string;
  name: string;
  username: string;
  pendingDemandsCount: number;
  excludedDemandsCount?: number;
}

interface MaterialTotal {
  id: string;
  name: string;
  unit: string;
  quantity: number;
}

interface SeparationDetailResponse {
  electrician: {
    id: string;
    name: string;
    username: string;
  };
  demands: Array<{
    id: string;
    date: string | Date;
    description: string;
    location: string;
    materialsDelivered?: boolean;
    plannedMaterials: Array<{
      id: string;
      material: {
        id: string;
        name: string;
        unit: string;
      };
      quantity: number;
    }>;
  }>;
  excludedDemands?: Array<{
    id: string;
    date: string | Date;
    description: string;
    location: string;
    materialsDelivered?: boolean;
    plannedMaterials: Array<{
      id: string;
      material: {
        id: string;
        name: string;
        unit: string;
      };
      quantity: number;
    }>;
  }>;
  totals: Array<MaterialTotal>;
}

export default function MaterialSeparation() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  const toggleExcludeSeparationMutation = useMutation({
    mutationFn: async (demandId: string) => {
      const resp = await api.patch(`/demands/${demandId}/toggle-exclude-separation`);
      return resp.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['separation-electricians'] });
      queryClient.invalidateQueries({ queryKey: ['separation-details'] });
    }
  });

  const deliverDemandMutation = useMutation({
    mutationFn: async (demandId: string) => {
      const resp = await api.put(`/demands/${demandId}/deliver-materials`);
      return resp.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['separation-electricians'] });
      queryClient.invalidateQueries({ queryKey: ['separation-details'] });
    }
  });

  // State
  const [selectedElectricianId, setSelectedElectricianId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [demandIdToConfirmExclude, setDemandIdToConfirmExclude] = useState<string | null>(null);
  const [demandIdToConfirmDeliver, setDemandIdToConfirmDeliver] = useState<string | null>(null);

  // Edit Demand State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDemand, setEditingDemand] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    date: formatLocalDate(new Date(), 'yyyy-MM-dd'),
    location: '',
    googleMapsUrl: '',
    description: '',
    clientNumber: '',
    electricianIds: [] as string[],
    materials: [] as { materialId: string; quantity: number }[]
  });

  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialResults, setShowMaterialResults] = useState(false);

  // Fetch materials for autocomplete when in editing mode
  const { data: materials } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => (await api.get('/materials')).data,
    enabled: !!editingDemand
  });

  // Fetch electricians list for assignment in editing mode
  const { data: electricians } = useQuery({
    queryKey: ['electricians-approved'],
    queryFn: async () => {
      const resp = await api.get('/users');
      return resp.data.filter((u: any) => u.role === 'ELECTRICIAN' && u.status === 'APPROVED');
    },
    enabled: !!editingDemand
  });

  const filteredMaterials = Array.isArray(materials)
    ? materials.filter((m: any) => m.name.toLowerCase().includes(materialSearch.toLowerCase()))
    : [];

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return (await api.put(`/demands/${id}`, data)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['separation-electricians'] });
      queryClient.invalidateQueries({ queryKey: ['separation-details'] });
      setIsModalOpen(false);
      setEditingDemand(null);
    }
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

  const handleEditDemand = (demand: any) => {
    setEditingDemand(demand);
    setFormData({
      date: formatLocalDate(demand.date, 'yyyy-MM-dd'),
      location: demand.location,
      googleMapsUrl: demand.googleMapsUrl || '',
      description: demand.description,
      clientNumber: demand.clientNumber || '',
      electricianIds: demand.electricians?.map((e: any) => e.id) || [],
      materials: demand.plannedMaterials?.map((pm: any) => ({
        materialId: pm.materialId,
        quantity: pm.quantity
      })) || []
    });
    setIsModalOpen(true);
  };

  const handleAddMaterial = (materialId: string) => {
    if (!materialId) return;
    if (formData.materials.find(m => m.materialId === materialId)) return;
    setFormData(prev => ({
      ...prev,
      materials: [...prev.materials, { materialId, quantity: 1 }]
    }));
  };

  const updateMaterialQty = (materialId: string, quantity: number) => {
    if (quantity < 1 || isNaN(quantity)) return;
    setFormData(prev => ({
      ...prev,
      materials: prev.materials.map(m => m.materialId === materialId ? { ...m, quantity } : m)
    }));
  };

  const removeMaterial = (materialId: string) => {
    setFormData(prev => ({
      ...prev,
      materials: prev.materials.filter(m => m.materialId !== materialId)
    }));
  };

  const resetForm = () => {
    setEditingDemand(null);
    setFormData({
      date: formatLocalDate(new Date(), 'yyyy-MM-dd'),
      location: '',
      googleMapsUrl: '',
      description: '',
      clientNumber: '',
      electricianIds: [],
      materials: []
    });
  };

  // Query: if admin, get the list of active electricians with pending demands
  const { data: electriciansData, isLoading: isLoadingList } = useQuery({
    queryKey: ['separation-electricians'],
    queryFn: () => api.get('/demands/separation/data').then(res => res.data),
    enabled: isAdmin && !selectedElectricianId
  });

  // Query: get separation details for a specific electrician
  // (if electrician, queries their own automatically; if admin, queries the selected one)
  const targetId = isAdmin ? selectedElectricianId : user?.id;
  const { data: detailData, isLoading: isLoadingDetail } = useQuery<SeparationDetailResponse>({
    queryKey: ['separation-details', targetId],
    queryFn: () => api.get(`/demands/separation/data?electricianId=${targetId}`).then(res => res.data),
    enabled: !!targetId
  });

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDownloadPdf = (electricianId: string, name: string) => {
    // Navigate or trigger download of the compiled separation PDFKit file
    const token = localStorage.getItem('token');
    const url = `${api.defaults.baseURL || ''}/demands/separation/pdf/${electricianId}?token=${token}`;
    window.open(url, '_blank');
  };

  // Filter electricians based on search
  const filteredElectricians = electriciansData?.electricians?.filter((ele: ElectricianListItem) => 
    ele.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    ele.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Layers className="h-7 w-7 text-blue-600" />
            Kits de Separação - Almoxarifado
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Geração de folhas de carga e checklist agrupado de materiais planejados para facilitar a separação física do estoque.
          </p>
        </div>

        {targetId && (
          <button
            onClick={() => handleDownloadPdf(detailData?.electrician?.id || targetId || '', detailData?.electrician?.name || '')}
            disabled={isLoadingDetail || !detailData?.demands?.length}
            className="p-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" /> Baixar PDF de Separação
          </button>
        )}
      </div>

      {/* ADMIN view: list of electricians with pending demands */}
      {isAdmin && !selectedElectricianId ? (
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Como funciona a separação?</p>
              <p className="text-gray-600 text-xs mt-0.5">
                Selecione uma dupla/equipe abaixo para juntar todos os materiais planejados de suas demandas pendentes de execução. O sistema soma as quantidades de cada item para gerar uma folha de separação.
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar equipe/eletricistas pelo nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Electricians List Grid */}
          {isLoadingList ? (
            <div className="p-12 text-center text-gray-500">Carregando duplas e equipes...</div>
          ) : filteredElectricians?.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-gray-200">
              <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-semibold">Nenhuma equipe com pendências.</p>
              <p className="text-gray-400 text-xs mt-1">Nenhuma dupla ou equipe tem demandas atualmente marcadas como "Pendente" no sistema.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredElectricians?.map((ele: ElectricianListItem) => (
                <div key={ele.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                        <User className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 leading-tight block">{ele.name}</h3>
                        <span className="text-xs text-gray-500 block font-mono">@{ele.username}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-6">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-lg text-xs font-bold text-amber-800">
                        <ClipboardList className="h-3.5 w-3.5" />
                        {ele.pendingDemandsCount} {ele.pendingDemandsCount === 1 ? 'pendente' : 'pendentes'}
                      </div>
                      {typeof ele.excludedDemandsCount === 'number' && ele.excludedDemandsCount > 0 && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 rounded-lg text-xs font-bold text-red-800">
                          <EyeOff className="h-3.5 w-3.5" />
                          {ele.excludedDemandsCount} {ele.excludedDemandsCount === 1 ? 'excluída' : 'excluídas'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedElectricianId(ele.id)}
                      className="flex-1 text-center py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-bold rounded-lg transition-colors border border-gray-200"
                    >
                      Ver Detalhes
                    </button>
                    <button
                      onClick={() => handleDownloadPdf(ele.id, ele.name)}
                      className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                      title="Baixar PDF de Separação"
                    >
                      <FileDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* DETAIL VIEW (Specific Electrician or Logged-in Electrician) */
        <div className="space-y-8">
          {/* Back Action for Admin */}
          {isAdmin && (
            <button
              onClick={() => {
                setSelectedElectricianId(null);
                setCheckedItems({});
              }}
              className="inline-flex items-center gap-1.5 p-1.5 px-3 bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 rounded-lg shadow-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar para Lista de Equipes e Duplas
            </button>
          )}

          {isLoadingDetail ? (
            <div className="p-12 text-center text-gray-500">Preparando kit de separação...</div>
          ) : !detailData?.demands?.length ? (
            <div className="p-12 text-center bg-white rounded-xl border border-gray-200">
              <Layers className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-semibold">Nenhum material planejado pendente.</p>
              <p className="text-gray-400 text-xs mt-1">Esta equipe/dupla não tem ordens pendentes com materiais planejados cadastrados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left columns: Detail of individual demands */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 block"></span>
                  <h2 className="text-lg font-black text-gray-900">1. Materiais Separados por Demanda</h2>
                </div>

                {detailData.demands.map((demand) => (
                  <div key={demand.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Demand Header Banner */}
                    <div className="bg-blue-50/75 border-b border-blue-100 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <MapPin className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm leading-tight uppercase">{demand.location}</h4>
                          <span className="text-xs text-gray-500">{demand.description}</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {isAdmin && (
                          demand.materialsDelivered ? (
                            <span className="p-1 px-2.5 bg-green-100 border border-green-200 text-green-800 rounded font-bold text-xs flex items-center gap-1 shadow-sm">
                              ✓ Entregue
                            </span>
                          ) : (
                            demandIdToConfirmDeliver === demand.id ? (
                              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 p-1 px-2 rounded-lg shadow-sm animate-pulse">
                                <span className="text-[10px] font-black text-amber-800 uppercase">Entregar?</span>
                                <button
                                  onClick={() => {
                                    deliverDemandMutation.mutate(demand.id);
                                    setDemandIdToConfirmDeliver(null);
                                  }}
                                  className="p-0.5 px-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[10px] transition-colors"
                                >
                                  Sim
                                </button>
                                <button
                                  onClick={() => setDemandIdToConfirmDeliver(null)}
                                  className="p-0.5 px-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-bold text-[10px] transition-colors shadow-sm"
                                >
                                  Não
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDemandIdToConfirmDeliver(demand.id)}
                                className="p-1 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-800 rounded font-bold text-xs flex items-center gap-1 border border-amber-200 shadow-sm transition-colors"
                                title="Entregar materiais"
                              >
                                <Package className="h-3.5 w-3.5" /> Entregar materiais
                              </button>
                            )
                          )
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleEditDemand(demand)}
                            className="p-1 px-2.5 bg-yellow-100/80 hover:bg-yellow-100 text-yellow-800 rounded font-bold text-xs flex items-center gap-1.5 border border-yellow-200 shadow-sm transition-colors"
                            title="Editar esta demanda"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Editar
                          </button>
                        )}
                        {isAdmin && (
                          demandIdToConfirmExclude === demand.id ? (
                            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 p-1 px-2 rounded-lg shadow-sm animate-pulse">
                              <span className="text-[10px] font-black text-red-700 uppercase">Confirmar Exclusão?</span>
                              <button
                                onClick={() => {
                                  toggleExcludeSeparationMutation.mutate(demand.id);
                                  setDemandIdToConfirmExclude(null);
                                }}
                                className="p-0.5 px-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-[10px] transition-colors shadow-sm"
                              >
                                Sim
                              </button>
                              <button
                                onClick={() => setDemandIdToConfirmExclude(null)}
                                className="p-0.5 px-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-bold text-[10px] transition-colors shadow-sm"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setDemandIdToConfirmExclude(demand.id);
                              }}
                              className="p-1 px-2.5 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 rounded font-bold text-xs flex items-center gap-1.5 border border-red-200 shadow-sm transition-colors"
                              title="Excluir demanda dos Kits para Separação"
                            >
                              <EyeOff className="h-3.5 w-3.5" /> Excluir dos Kits
                            </button>
                          )
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatLocalDate(demand.date, 'dd/MM/yyyy')}
                        </span>
                      </div>
                    </div>

                    {/* Planned Materials Checklist */}
                    <div className="p-4">
                      {demand.plannedMaterials?.length === 0 ? (
                        <p className="text-gray-400 text-xs italic p-2">Nenhum material planejado nesta demanda.</p>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {demand.plannedMaterials.map((pm) => (
                            <div key={pm.id} className="py-2.5 flex items-center justify-between gap-4 text-sm">
                              <span className="font-bold text-gray-800">{pm.material?.name}</span>
                              <div className="flex items-center gap-4 shrink-0">
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded uppercase font-mono">{pm.material?.unit}</span>
                                <span className="text-sm font-black text-gray-900 border border-gray-200 px-2.5 py-0.5 bg-gray-50 rounded min-w-[36px] text-center">
                                  {pm.quantity}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Excluded Demands Section (Admin only) */}
                {isAdmin && detailData.excludedDemands && detailData.excludedDemands.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 block"></span>
                      <h2 className="text-lg font-black text-gray-950">Demandas Ocultadas / Excluídas</h2>
                    </div>
                    <div className="space-y-4">
                      {detailData.excludedDemands.map((demand) => (
                        <div key={demand.id} className="bg-gray-50/70 border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:bg-gray-50 transition-colors">
                          {/* Demand Header Banner for Excluded Items */}
                          <div className="bg-gray-100/70 border-b border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                              <div>
                                <h4 className="font-bold text-gray-700 text-sm leading-tight uppercase line-through">{demand.location}</h4>
                                <span className="text-xs text-gray-400 italic block mt-0.5">{demand.description}</span>
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              {isAdmin && (
                                <button
                                  onClick={() => handleEditDemand(demand)}
                                  className="p-1 px-2.5 bg-yellow-100/80 hover:bg-yellow-100 text-yellow-800 rounded font-bold text-xs flex items-center gap-1.5 border border-yellow-200 shadow-sm transition-colors"
                                  title="Editar esta demanda"
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Editar
                                </button>
                              )}
                              {demandIdToConfirmExclude === demand.id ? (
                                <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 p-1 px-2 rounded-lg shadow-sm">
                                  <span className="text-[10px] font-black text-green-700 uppercase">Re-incluir nos Kits?</span>
                                  <button
                                    onClick={() => {
                                      toggleExcludeSeparationMutation.mutate(demand.id);
                                      setDemandIdToConfirmExclude(null);
                                    }}
                                    className="p-0.5 px-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold text-[10px] transition-colors"
                                  >
                                    Sim
                                  </button>
                                  <button
                                    onClick={() => setDemandIdToConfirmExclude(null)}
                                    className="p-0.5 px-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-bold text-[10px] transition-colors shadow-sm"
                                  >
                                    Não
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setDemandIdToConfirmExclude(demand.id);
                                  }}
                                  className="p-1 px-2.5 bg-green-50 hover:bg-green-100 text-green-700 hover:text-green-800 rounded font-bold text-xs flex items-center gap-1.5 border border-green-200 shadow-sm transition-colors"
                                  title="Recolocar esta demanda nos Kits de Separação"
                                >
                                  <Eye className="h-3.5 w-3.5 text-green-600" /> Recolocar nos Kits
                                </button>
                              )}
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-200 text-gray-500">
                                <Calendar className="h-3 w-3 mr-1" />
                                {formatLocalDate(demand.date, 'dd/MM/yyyy')}
                              </span>
                            </div>
                          </div>

                          {/* Planned Materials Checklist */}
                          <div className="p-4 bg-white/40">
                            {demand.plannedMaterials?.length === 0 ? (
                              <p className="text-gray-400 text-xs italic p-2">Nenhum material planejado nesta demanda.</p>
                            ) : (
                              <div className="divide-y divide-gray-100">
                                {demand.plannedMaterials.map((pm) => (
                                  <div key={pm.id} className="py-2 flex items-center justify-between gap-4 text-xs text-gray-500">
                                    <span className="font-semibold text-gray-500 line-through">{pm.material?.name}</span>
                                    <div className="flex items-center gap-4 shrink-0">
                                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded uppercase font-mono">{pm.material?.unit}</span>
                                      <span className="text-xs font-bold text-gray-400 border border-gray-100 px-2 py-0.5 bg-gray-50/50 rounded min-w-[30px] text-center line-through">
                                        {pm.quantity}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right column: Consolidated picker summary checklist */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 block"></span>
                  <h2 className="text-lg font-black text-gray-900">2. Checklist Geral de Separação</h2>
                </div>

                <div className="bg-neutral-900 text-white rounded-xl shadow-md p-6 border border-neutral-800">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-4">
                    <div>
                      <h3 className="font-bold text-sm tracking-wide text-neutral-400 uppercase">Resumo Almoxarifado</h3>
                      <p className="text-xs text-neutral-500 leading-tight">Separação de carga ({detailData.electrician.name})</p>
                    </div>
                    <Layers className="h-5 w-5 text-emerald-500" />
                  </div>

                  <p className="text-neutral-400 text-xs leading-relaxed mb-6">
                    Clique nas caixas abaixo para marcar e check-off físico dos materiais retirados das prateleiras do armazém.
                  </p>

                  <div className="space-y-3.5 mb-6">
                    {detailData.totals?.length === 0 ? (
                      <p className="text-neutral-500 text-center text-xs italic py-4">Nenhum material pendente para consolidar.</p>
                    ) : (
                      detailData.totals.map((item) => {
                        const isChecked = !!checkedItems[item.id];
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleCheck(item.id)}
                            className={`flex items-start justify-between p-3 rounded-lg border cursor-pointer select-none transition-all ${
                              isChecked 
                                ? 'bg-emerald-950/40 border-emerald-900 text-emerald-300' 
                                : 'bg-neutral-800/40 border-neutral-800 hover:bg-neutral-800 text-white hover:border-neutral-700'
                            }`}
                          >
                            <div className="flex gap-2.5">
                              <div className="mt-0.5 shrink-0">
                                {isChecked ? (
                                  <CheckSquare className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <Square className="h-4.5 w-4.5 text-neutral-500 shrink-0" />
                                )}
                              </div>
                              <div>
                                <span className={`text-xs block font-bold leading-tight ${isChecked ? 'line-through text-emerald-500/85' : ''}`}>
                                  {item.name}
                                </span>
                                <span className="text-[10px] text-neutral-500 uppercase font-mono leading-none mt-0.5 block">Unidade: {item.unit}</span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right pl-2">
                              <span className={`text-sm font-black tracking-tight ${isChecked ? 'text-emerald-400' : 'text-blue-400'}`}>
                                {item.quantity}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {detailData.totals?.length > 0 && (
                    <div className="bg-neutral-800/50 rounded-lg p-3 text-[11px] text-neutral-400 leading-relaxed border border-neutral-800">
                      <span className="font-bold text-neutral-300 block mb-0.5 uppercase tracking-wide">Dica do Almoxarife:</span>
                      Imprima ou visualize esta lista no smartphone.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Demand Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm(); }}
        title="Editar Demanda (Almoxarifado)"
        maxWidth="max-w-2xl"
      >
        <form 
          onSubmit={(e) => { 
            e.preventDefault(); 
            if (editingDemand) {
              updateMutation.mutate({ id: editingDemand.id, data: formData });
            }
          }} 
          className="p-6 space-y-6 overflow-y-auto max-h-[85vh]"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Data</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  required
                  className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Local</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Praça Matriz"
                  className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Localização (Link do Google Maps / WhatsApp)</label>
            <div className="relative">
              <ExternalLink className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cole o link de localização compartilhado (Ex: https://maps.google.com/?q=...)"
                className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                value={formData.googleMapsUrl}
                onChange={(e) => setFormData({...formData, googleMapsUrl: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição</label>
            <textarea
              required
              rows={2}
              className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Eletricistas Responsáveis</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border border-gray-300 rounded-lg bg-gray-50/50 max-h-40 overflow-y-auto">
                {electricians?.map((e: any) => (
                  <label key={e.id} className="flex items-center gap-2 p-2 hover:bg-white rounded cursor-pointer border border-transparent hover:border-gray-200 transition-colors">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
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
            
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Contato do Solicitante</label>
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                value={formData.clientNumber}
                onChange={(e) => setFormData({...formData, clientNumber: e.target.value})}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center">
              <Package className="h-4 w-4 mr-2 text-blue-600" /> Materiais Planejados
            </h3>
            
            <div className="relative">
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
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
                <div className="absolute z-50 w-full -mt-3 mb-4 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
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

            <div className="space-y-2 max-h-60 overflow-y-auto p-1">
              {formData.materials.map((m) => {
                const material = materials?.find((mat: any) => mat.id === m.materialId);
                return (
                  <div key={m.materialId} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <span className="text-sm font-medium text-gray-700">{material?.name || 'Material Carregando...'}</span>
                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        min="1"
                        className="w-16 p-1 border border-gray-300 rounded text-center text-sm bg-white focus:ring-2 focus:ring-blue-500"
                        value={m.quantity}
                        onChange={(e) => updateMaterialQty(m.materialId, parseInt(e.target.value))}
                      />
                      <button 
                        type="button"
                        onClick={() => removeMaterial(m.materialId)}
                        className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors"
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

          <div className="flex gap-4 pt-4 border-t sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={() => { setIsModalOpen(false); resetForm(); }}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-bold text-sm bg-white hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center justify-center disabled:opacity-50 transition-colors"
            >
              {updateMutation.isPending ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                'Salvar Alterações'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
