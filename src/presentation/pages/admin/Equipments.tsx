import React, { useState } from 'react';
import Layout from '../../components/Layout.tsx';
import ConfirmDialog from '../../components/ConfirmDialog.tsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  Shield, 
  Wrench, 
  Package, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Calendar, 
  User, 
  Clipboard, 
  Info,
  FileText,
  Upload,
  Download,
  Eye,
  Loader2
} from 'lucide-react';
import { formatLocalDate } from '../../utils/date.ts';

type ActiveTab = 'deliveries' | 'catalog';

export default function Equipments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('deliveries');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Search and Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  // Modal control states
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Catalog item form states
  const [catalogName, setCatalogName] = useState('');
  const [catalogCode, setCatalogCode] = useState('');
  const [catalogType, setCatalogType] = useState('EPI'); // 'EPI' | 'FERRAMENTA' | 'EQUIPAMENTO'

  // Delivery record form states
  const [deliveryElectricianId, setDeliveryElectricianId] = useState('');
  const [deliveryEquipmentId, setDeliveryEquipmentId] = useState('');
  const [deliveryQuantity, setDeliveryQuantity] = useState<number>(1);
  const [deliveryDate, setDeliveryDate] = useState(formatLocalDate(new Date(), 'yyyy-MM-dd'));
  const [deliveryType, setDeliveryType] = useState('ENTREGA'); // 'ENTREGA' | 'DEVOLUCAO'
  const [deliveryObservation, setDeliveryObservation] = useState('');

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    id: '',
    type: '' as 'catalog' | 'delivery'
  });

  // Queries
  const { data: equipments, isLoading: isEquipmentsLoading } = useQuery({
    queryKey: ['equipments'],
    queryFn: () => api.get('/equipments').then(res => res.data)
  });

  const { data: deliveries, isLoading: isDeliveriesLoading } = useQuery({
    queryKey: ['equipment-deliveries'],
    queryFn: () => api.get('/equipments/deliveries').then(res => res.data)
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => res.data)
  });

  const electriciansList = users?.filter((u: any) => u.role === 'ELECTRICIAN' && u.status === 'APPROVED') || [];

  // Mutations
  const createEquipmentMutation = useMutation({
    mutationFn: (data: any) => api.post('/equipments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipments'] });
      closeCatalogModal();
      showFeedback('success', 'Equipamento/EPI cadastrado com sucesso!');
    },
    onError: () => {
      showFeedback('error', 'Erro ao cadastrar equipamento.');
    }
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/equipments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipments'] });
      closeCatalogModal();
      showFeedback('success', 'Equipamento/EPI atualizado com sucesso!');
    },
    onError: () => {
      showFeedback('error', 'Erro ao atualizar equipamento.');
    }
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipments'] });
      showFeedback('success', 'Equipamento/EPI excluído com sucesso!');
    },
    onError: () => {
      showFeedback('error', 'Erro ao excluir equipamento.');
    }
  });

  const createDeliveryMutation = useMutation({
    mutationFn: (data: any) => api.post('/equipments/deliveries', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-deliveries'] });
      closeDeliveryModal();
      showFeedback('success', 'Entrega/Devolução registrada com sucesso!');
    },
    onError: () => {
      showFeedback('error', 'Erro ao registrar entrega/devolução.');
    }
  });

  const updateDeliveryMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/equipments/deliveries/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-deliveries'] });
      closeDeliveryModal();
      showFeedback('success', 'Registro de entrega/devolução atualizado!');
    },
    onError: () => {
      showFeedback('error', 'Erro ao atualizar registro.');
    }
  });

  const deleteDeliveryMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipments/deliveries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-deliveries'] });
      showFeedback('success', 'Registro removido com sucesso!');
    },
    onError: () => {
      showFeedback('error', 'Erro ao excluir registro.');
    }
  });

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  };

  const openCatalogModal = (item?: any) => {
    if (user?.role !== 'ADMIN') return;
    if (item) {
      setEditingItem(item);
      setCatalogName(item.name);
      setCatalogCode(item.code || '');
      setCatalogType(item.type || 'EPI');
    } else {
      setEditingItem(null);
      setCatalogName('');
      setCatalogCode('');
      setCatalogType('EPI');
    }
    setIsCatalogModalOpen(true);
  };

  const closeCatalogModal = () => {
    setIsCatalogModalOpen(false);
    setEditingItem(null);
  };

  const openDeliveryModal = (item?: any) => {
    if (user?.role !== 'ADMIN') return;
    if (item) {
      setEditingItem(item);
      setDeliveryElectricianId(item.electricianId);
      setDeliveryEquipmentId(item.equipmentId);
      setDeliveryQuantity(item.quantity);
      setDeliveryDate(formatLocalDate(item.deliveryDate, 'yyyy-MM-dd'));
      setDeliveryType(item.type || 'ENTREGA');
      setDeliveryObservation(item.observation || '');
    } else {
      setEditingItem(null);
      setDeliveryElectricianId('');
      setDeliveryEquipmentId('');
      setDeliveryQuantity(1);
      setDeliveryDate(formatLocalDate(new Date(), 'yyyy-MM-dd'));
      setDeliveryType('ENTREGA');
      setDeliveryObservation('');
    }
    setIsDeliveryModalOpen(true);
  };

  const closeDeliveryModal = () => {
    setIsDeliveryModalOpen(false);
    setEditingItem(null);
  };

  const handleCatalogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalogName.trim()) return;

    const data = { name: catalogName, code: catalogCode || null, type: catalogType };
    if (editingItem) {
      updateEquipmentMutation.mutate({ id: editingItem.id, data });
    } else {
      createEquipmentMutation.mutate(data);
    }
  };

  const handleDeliverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryElectricianId || !deliveryEquipmentId || deliveryQuantity <= 0 || !deliveryDate) {
      showFeedback('error', 'Por favor preencha todos os campos obrigatórios.');
      return;
    }

    const data = {
      electricianId: deliveryElectricianId,
      equipmentId: deliveryEquipmentId,
      quantity: deliveryQuantity,
      deliveryDate: deliveryDate,
      type: deliveryType,
      observation: deliveryObservation
    };

    if (editingItem) {
      updateDeliveryMutation.mutate({ id: editingItem.id, data });
    } else {
      createDeliveryMutation.mutate(data);
    }
  };

  const handleDeleteClick = (id: string, type: 'catalog' | 'delivery') => {
    setConfirmDialog({
      isOpen: true,
      id,
      type
    });
  };

  const handleConfirmDelete = () => {
    if (confirmDialog.type === 'catalog') {
      deleteEquipmentMutation.mutate(confirmDialog.id);
    } else {
      deleteDeliveryMutation.mutate(confirmDialog.id);
    }
    setConfirmDialog({ isOpen: false, id: '', type: 'catalog' });
  };

  // Filter lists based on role and inputs
  const electricianDeliveries = user?.role === 'ELECTRICIAN'
    ? deliveries?.filter((d: any) => d.electricianId === user?.id)
    : deliveries;

  const filteredDeliveries = electricianDeliveries?.filter((d: any) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      d.equipment?.name?.toLowerCase().includes(term) ||
      d.equipment?.code?.toLowerCase().includes(term) ||
      d.electrician?.name?.toLowerCase().includes(term) ||
      (d.observation && d.observation.toLowerCase().includes(term));

    const matchesType = filterType === 'ALL' || d.type === filterType;
    return matchesSearch && matchesType;
  });

  const filteredCatalog = equipments?.filter((e: any) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      e.name.toLowerCase().includes(term) ||
      e.code?.toLowerCase().includes(term);

    const matchesType = filterType === 'ALL' || e.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <Layout>
      {/* Toast Feedback */}
      {feedback && (
        <div className={`fixed top-4 right-4 z-[999] p-4 rounded-xl shadow-xl flex items-center gap-3 border transition-all duration-300 animate-fade-in ${
          feedback.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
          <span className="font-semibold text-sm">{feedback.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              <Shield className="h-7 w-7 text-blue-600" />
              Gestão de EPIs e Equipamentos
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Controle, entrega e devolução de EPIs, ferramentas manuais e equipamentos de trabalho.
            </p>
          </div>

          <div className="flex gap-2">
            {user?.role === 'ADMIN' && (
              <>
                {activeTab === 'catalog' ? (
                  <button
                    onClick={() => openCatalogModal()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:shadow transition-all"
                  >
                    <Plus className="h-4 w-4" /> Cadastrar Equipamento
                  </button>
                ) : (
                  <button
                    onClick={() => openDeliveryModal()}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:shadow transition-all"
                  >
                    <Plus className="h-4 w-4" /> Registrar Entrega / Devolução
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex space-x-4">
          <button
            onClick={() => {
              setActiveTab('deliveries');
              setSearchTerm('');
              setFilterType('ALL');
            }}
            className={`pb-3 text-sm font-bold border-b-2 transition-all block ${
              activeTab === 'deliveries'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Registros de Entregas & Devoluções
          </button>
          <button
            onClick={() => {
              setActiveTab('catalog');
              setSearchTerm('');
              setFilterType('ALL');
            }}
            className={`pb-3 text-sm font-bold border-b-2 transition-all block ${
              activeTab === 'catalog'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Cadastro de Itens (Catálogo)
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={activeTab === 'catalog' ? "Buscar pelo nome ou código do equipamento..." : "Buscar por eletricista, equipamento, observações..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
          />
        </div>

        <div className="flex gap-2 min-w-[180px]">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full p-2.5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            {activeTab === 'catalog' ? (
              <>
                <option value="ALL">Todos os Tipos</option>
                <option value="EPI">Apenas EPIs</option>
                <option value="FERRAMENTA">Apenas Ferramentas</option>
                <option value="EQUIPAMENTO">Apenas Equipamentos</option>
              </>
            ) : (
              <>
                <option value="ALL">Todas as Transações</option>
                <option value="ENTREGA">Apenas Entregas</option>
                <option value="DEVOLUCAO">Apenas Devoluções</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Main Container Content */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-h-[250px]">
        {activeTab === 'deliveries' ? (
          <div>
            {isDeliveriesLoading ? (
              <div className="p-12 text-center text-gray-500">Carregando registros de entrega...</div>
            ) : filteredDeliveries?.length === 0 ? (
              <div className="p-12 text-center">
                <Clipboard className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Nenhum registro de entrega ou devolução encontrado.</p>
                <p className="text-gray-400 text-xs mt-1">Use filtros diferentes ou adicione um novo registro.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Data</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Eletricista</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Operação</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Item (Equipamento/EPI)</th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Quantidade</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Observações</th>
                      {user?.role === 'ADMIN' && (
                        <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-150">
                    {filteredDeliveries?.map((d: any) => (
                      <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {formatLocalDate(d.deliveryDate, 'dd/MM/yyyy')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                          {d.electrician?.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {d.type === 'ENTREGA' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                              Entrega
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                              Devolução
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div>
                            <span className="font-semibold text-gray-900">{d.equipment?.name}</span>
                            {d.equipment?.code && (
                              <span className="block text-xs font-mono text-gray-500 pt-0.5">S/N: {d.equipment.code}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-black text-gray-900">
                          {d.quantity}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                          {d.observation || <span className="text-gray-300 italic">Nenhuma</span>}
                        </td>
                        {user?.role === 'ADMIN' && (
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => openDeliveryModal(d)}
                                className="p-1 px-2.5 bg-gray-50 border border-gray-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 rounded-lg text-gray-600 transition-colors text-xs font-bold inline-flex items-center gap-1"
                              >
                                <Edit2 className="h-3 w-3" /> Editar
                              </button>
                              <button
                                onClick={() => handleDeleteClick(d.id, 'delivery')}
                                className="p-1 px-2.5 bg-gray-50 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-100 rounded-lg text-gray-600 transition-colors text-xs font-bold inline-flex items-center gap-1"
                              >
                                <Trash2 className="h-3 w-3" /> Excluir
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div>
            {isEquipmentsLoading ? (
              <div className="p-12 text-center text-gray-500">Carregando catálogo de equipamentos...</div>
            ) : filteredCatalog?.length === 0 ? (
              <div className="p-12 text-center">
                <Wrench className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Nenhum equipamento cadastrado no catálogo.</p>
                <p className="text-gray-400 text-xs mt-1">Clique para cadastrar um novo equipamento ou EPI.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Item</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Código / Serial</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tipo</th>
                      {user?.role === 'ADMIN' && (
                        <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-150">
                    {filteredCatalog?.map((e: any) => (
                      <tr key={e.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            e.type === 'EPI' ? 'bg-blue-50 text-blue-600' : e.type === 'FERRAMENTA' ? 'bg-orange-50 text-orange-600' : 'bg-purple-50 text-purple-600'
                          }`}>
                            {e.type === 'EPI' ? <Shield className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                          </div>
                          {e.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                          {e.code || <span className="text-gray-300 italic">Sem código</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900/80">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                            e.type === 'EPI' 
                              ? 'bg-blue-100 text-blue-800' 
                              : e.type === 'FERRAMENTA' 
                                ? 'bg-orange-100 text-orange-850' 
                                : 'bg-purple-100 text-purple-800'
                          }`}>
                            {e.type}
                          </span>
                        </td>
                        {user?.role === 'ADMIN' && (
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => openCatalogModal(e)}
                                className="p-1 px-2.5 bg-gray-50 border border-gray-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 rounded-lg text-gray-600 transition-colors text-xs font-bold inline-flex items-center gap-1"
                              >
                                <Edit2 className="h-3 w-3" /> Editar
                              </button>
                              <button
                                onClick={() => handleDeleteClick(e.id, 'catalog')}
                                className="p-1 px-2.5 bg-gray-50 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-100 rounded-lg text-gray-600 transition-colors text-xs font-bold inline-flex items-center gap-1"
                              >
                                <Trash2 className="h-3 w-3" /> Excluir
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CATALOG MODAL */}

      {isCatalogModalOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-[990]">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-100 animate-scale-in">
            <div className="p-6 border-b border-gray-150 flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                {editingItem ? 'Editar Equipamento/EPI' : 'Cadastrar Novo Equipamento/EPI'}
              </h2>
              <button onClick={closeCatalogModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCatalogSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Nome do Item <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={catalogName}
                  onChange={(e) => setCatalogName(e.target.value)}
                  placeholder="Ex: Capacete de Proteção, Alicate Amperímetro"
                  className="w-full p-2.5 border border-gray-200 bg-gray-50 focus:bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Código / Número de Série (Opcional)</label>
                <input
                  type="text"
                  value={catalogCode}
                  onChange={(e) => setCatalogCode(e.target.value)}
                  placeholder="Ex: EPI-091, SN-34981"
                  className="w-full p-2.5 border border-gray-200 bg-gray-50 focus:bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Tipo de Equipamento</label>
                <select
                  value={catalogType}
                  onChange={(e) => setCatalogType(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 bg-gray-50 focus:bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  <option value="EPI">EPI (Equipamento de Proteção Individual)</option>
                  <option value="FERRAMENTA">Ferramenta (Ex: Martelo, Chave de teste)</option>
                  <option value="EQUIPAMENTO">Equipamento (Ex: Escada, Gerador)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeCatalogModal}
                  className="flex-1 px-4 py-2 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                >
                  {editingItem ? 'Salvar Alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELIVERY MODAL */}
      {isDeliveryModalOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-[990]">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-gray-100 animate-scale-in">
            <div className="p-6 border-b border-gray-150 flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Clipboard className="h-5 w-5 text-blue-600" />
                {editingItem ? 'Editar Registro de Movimentação' : 'Registrar Entrega / Devolução'}
              </h2>
              <button onClick={closeDeliveryModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleDeliverySubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Eletricista <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={deliveryElectricianId}
                    onChange={(e) => setDeliveryElectricianId(e.target.value)}
                    className="w-full p-2.5 border border-gray-200 bg-gray-50 focus:bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
                  >
                    <option value="">Selecione o eletricista...</option>
                    {electriciansList.map((ele: any) => (
                      <option key={ele.id} value={ele.id}>{ele.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Operação <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={deliveryType}
                    onChange={(e) => setDeliveryType(e.target.value)}
                    className="w-full p-2.5 border border-gray-200 bg-gray-50 focus:bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
                  >
                    <option value="ENTREGA">Entrega (Equipamento ao Eletricista)</option>
                    <option value="DEVOLUCAO">Devolução (Equipamento retornado pelo Eletricista)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Item (Equipamento/EPI) <span className="text-red-500">*</span></label>
                <select
                  required
                  value={deliveryEquipmentId}
                  onChange={(e) => setDeliveryEquipmentId(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 bg-gray-50 focus:bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  <option value="">Selecione o equipamento/EPI...</option>
                  {equipments?.map((eq: any) => (
                    <option key={eq.id} value={eq.id}>{eq.name} {eq.code ? `(${eq.code})` : `[${eq.type}]`}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Quantidade <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={deliveryQuantity}
                    onChange={(e) => setDeliveryQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2.5 border border-gray-200 bg-gray-50 focus:bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors text-center font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Data do Evento <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      required
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-200 bg-gray-50 focus:bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Observações / Detalhes</label>
                <textarea
                  value={deliveryObservation}
                  onChange={(e) => setDeliveryObservation(e.target.value)}
                  placeholder="Ex: Capacete com desgaste natural trocado; Chave de teste entregue zerada."
                  rows={3}
                  className="w-full p-2.5 border border-gray-200 bg-gray-50 focus:bg-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeDeliveryModal}
                  className="flex-1 px-4 py-2 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                >
                  {editingItem ? 'Salvar Registro' : 'Registrar Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.type === 'catalog' ? 'Confirmar Exclusão de Item' : 'Confirmar Exclusão de Registro'}
        message={
          confirmDialog.type === 'catalog' 
            ? 'Tem certeza de que deseja remover este item de equipamento do catálogo? Isso também afetará registros vinculados a ele.'
            : 'Tem certeza de que deseja remover permanentemente este registro de entrega/devolução?'
        }
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmDialog({ isOpen: false, id: '', type: 'catalog' })}
      />
    </Layout>
  );
}
