import React, { useState } from 'react';
import Layout from '../../components/Layout.tsx';
import ConfirmDialog from '../../components/ConfirmDialog.tsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  RotateCcw, 
  Search, 
  Calendar, 
  User, 
  MapPin, 
  Package, 
  ExternalLink,
  ClipboardList,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatLocalDate } from '../../utils/date.ts';

export default function PendingReturns() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    returnId: '',
    materialName: '',
    quantity: 0,
    unit: '',
    type: 'clear' as 'clear' | 'deliver',
    demandId: '',
    location: ''
  });

  // Fetch pending return materials
  const { data: pendingReturns, isLoading: isLoadingReturns } = useQuery({
    queryKey: ['pending-returns'],
    queryFn: () => api.get('/demands/pending-returns').then(res => res.data)
  });

  // Fetch demands to retrieve PENDING undelivered materials
  const { data: demands, isLoading: isLoadingDemands } = useQuery({
    queryKey: ['demands'],
    queryFn: () => api.get('/demands').then(res => res.data)
  });

  const isLoading = isLoadingReturns || isLoadingDemands;

  const clearMutation = useMutation({
    mutationFn: (id: string) => api.put(`/demands/pending-returns/${id}/clear`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-returns'] });
      showFeedback('success', 'Baixa de material efetuada com sucesso!');
    },
    onError: () => {
      showFeedback('error', 'Erro ao dar baixa no material pendente.');
    }
  });

  const deliverMutation = useMutation({
    mutationFn: (demandId: string) => api.put(`/demands/${demandId}/deliver-materials`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-returns'] });
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      showFeedback('success', 'Materiais entregues com sucesso ao eletricista!');
    },
    onError: () => {
      showFeedback('error', 'Erro ao entregar materiais.');
    }
  });

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleConfirmAction = () => {
    if (confirmDialog.type === 'deliver') {
      if (confirmDialog.demandId) {
        deliverMutation.mutate(confirmDialog.demandId);
      }
    } else {
      if (confirmDialog.returnId) {
        clearMutation.mutate(confirmDialog.returnId);
      }
    }
    setConfirmDialog({ ...confirmDialog, isOpen: false });
  };

  // Compute virtual rows: planned materials for demands currently PENDING where materials are NOT yet delivered
  const pendingDeliveries = React.useMemo(() => {
    if (!demands) return [];
    const items: any[] = [];
    demands.forEach((d: any) => {
      if (d.status === 'PENDING' && !d.materialsDelivered && d.plannedMaterials?.length > 0) {
        d.plannedMaterials.forEach((pm: any) => {
          items.push({
            id: `delivery-${d.id}-${pm.materialId}`,
            isVirtual: true,
            demandId: d.id,
            materialId: pm.materialId,
            material: pm.material,
            quantity: pm.quantity,
            date: d.date,
            demand: d
          });
        });
      }
    });
    return items;
  }, [demands]);

  // Combine virtual items (waiting delivery) and real leftover returns
  const allItems = React.useMemo(() => {
    const realMapped = pendingReturns ? pendingReturns.map((r: any) => ({ ...r, isVirtual: false })) : [];
    return [...pendingDeliveries, ...realMapped].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [pendingDeliveries, pendingReturns]);

  // Filter based on search term
  const filteredReturns = allItems.filter((item: any) => {
    const term = searchTerm.toLowerCase();
    
    const matchesMaterialName = item.material?.name?.toLowerCase().includes(term);
    const matchesLocation = item.demand?.location?.toLowerCase().includes(term);
    const matchesElectrician = item.demand?.electricians?.some((ele: any) => 
      ele.name.toLowerCase().includes(term)
    );

    return matchesMaterialName || matchesLocation || matchesElectrician;
  });

  return (
    <Layout>
      {/* Feedback Message */}
      {feedback && (
        <div className={`fixed top-4 right-4 z-[200] p-4 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
          feedback.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
          <span className="font-semibold text-sm">{feedback.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <RotateCcw className="h-7 w-7 text-blue-600" />
            Sobras de Materiais a Retornar / Separação
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Controle de kits de materiais a entregar e sobras de materiais planejados que precisam retornar ao estoque.
          </p>
        </div>
      </div>

      {/* Information Box */}
      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mb-6 text-sm text-blue-800 flex items-start gap-3">
        <Package className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Como funciona a entrega e o retorno das sobras?</p>
          <p className="text-gray-600 text-xs mt-0.5">
            Ao marcar uma demanda pendente como <b>"Entregar Materiais"</b>, todos os seus materiais planejados passam a constar como pendências para retorno (sobras). Conforme o eletricista edita ou executa o serviço utilizando-os, o sistema desconta as quantidades automaticamente, listando apenas o saldo físico que de fato precisa retornar ao estoque.
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 mb-6 font-sans">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={
              user?.role === 'ADMIN'
                ? "Buscar por material, eletricista, local da demanda..."
                : "Buscar por material, local da demanda..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Main Table / List Container */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-h-[250px] font-sans">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Carregando pendências...</div>
        ) : filteredReturns.length === 0 ? (
          <div className="p-12 text-center">
            <RotateCcw className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Nenhum retorno/entrega pendente encontrado.</p>
            <p className="text-gray-400 text-xs mt-1">Todas as entregas de kits e sobras de materiais estão em dia.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Material / Status</th>
                  <th className="px-6 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Quantidade</th>
                  {user?.role === 'ADMIN' && (
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Eletricista(s)</th>
                  )}
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Referência da Demanda</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-150">
                {filteredReturns.map((item: any) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          item.isVirtual 
                            ? 'bg-amber-50 text-amber-600 border border-amber-100' 
                            : 'bg-orange-50 text-orange-600 border border-orange-100'
                        }`}>
                          <Package className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">{item.material?.name}</span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              item.isVirtual 
                                ? 'bg-amber-100 text-amber-800' 
                                : 'bg-orange-100 text-orange-800'
                            }`}>
                              {item.isVirtual ? 'Separação' : 'Sobra'}
                            </span>
                          </div>
                          <span className="block text-xs font-mono text-gray-500 mt-0.5">Unidade: {item.material?.unit || 'UNID'}</span>
                        </div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-black ${
                      item.isVirtual ? 'text-amber-700 bg-amber-50/20' : 'text-orange-700 bg-orange-50/20'
                    }`}>
                      {item.quantity} {item.material?.unit || 'UNID'}
                    </td>
                    {user?.role === 'ADMIN' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {item.demand?.electricians && item.demand.electricians.length > 0 ? (
                            item.demand.electricians.map((e: any) => (
                              <span key={e.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-800 uppercase">
                                <User className="h-3 w-3 mr-1 text-gray-400" />
                                {e.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-400 text-xs italic">Nenhum</span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                        <div className="truncate">
                          <span className="font-semibold text-gray-900 block truncate">{item.demand?.location}</span>
                          <span className="text-xs text-gray-500 block truncate">{item.demand?.description}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {formatLocalDate(item.date, 'dd/MM/yyyy')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="inline-flex items-center gap-2">
                        {user?.role === 'ADMIN' && (
                          item.isVirtual ? (
                            <button
                              onClick={() => setConfirmDialog({
                                isOpen: true,
                                type: 'deliver',
                                demandId: item.demandId,
                                location: item.demand?.location || '',
                                returnId: '',
                                materialName: '',
                                quantity: 0,
                                unit: ''
                              })}
                              className="p-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-all shadow-sm"
                            >
                              <Package className="h-3.5 w-3.5" /> Entregar Materiais
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmDialog({
                                isOpen: true,
                                type: 'clear',
                                returnId: item.id,
                                materialName: item.material?.name || '',
                                quantity: item.quantity,
                                unit: item.material?.unit || 'UNID',
                                demandId: '',
                                location: ''
                              })}
                              className="p-1.5 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-all shadow-sm"
                            >
                              <CheckCircle className="h-3.5 w-3.5" /> Dar Baixa
                            </button>
                          )
                        )}
                        {item.demandId ? (
                          <Link
                            to={`/demands/${item.demandId}`}
                            className="p-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-all"
                          >
                            <ExternalLink className="h-3 w-3" /> Ver Demanda
                          </Link>
                        ) : (
                          <span className="text-gray-400 text-xs italic">Sem Demanda</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Action Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={confirmDialog.type === 'deliver' ? "Confirmar Entrega de Materiais" : "Confirmar Recebimento de Sobra"}
        message={
          confirmDialog.type === 'deliver' 
            ? `Deseja registrar a entrega física de todos os materiais planejados para a demanda em "${confirmDialog.location}"? Isso fará com que fiquem sob custódia do eletricista e constem como pendentes de retorno até a execução do serviço.`
            : `Deseja confirmar que o material "${confirmDialog.materialName}" (${confirmDialog.quantity} ${confirmDialog.unit}) foi fisicamente recebido de volta no almoxarifado?`
        }
        confirmText={confirmDialog.type === 'deliver' ? "Confirmar Entrega" : "Confirmar Retorno"}
        cancelText="Voltar"
        variant={confirmDialog.type === 'deliver' ? "warning" : "info"}
      />
    </Layout>
  );
}
