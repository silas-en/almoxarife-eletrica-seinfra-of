import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout.tsx';
import ConfirmDialog from '../../components/ConfirmDialog.tsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api.ts';
import { 
  Clock, 
  Search, 
  Check, 
  AlertCircle, 
  CheckCircle, 
  Loader2, 
  Calendar, 
  ExternalLink,
  ArrowUpDown,
  Archive,
  Undo2
} from 'lucide-react';
import { IndexedDbService } from '../../../infra/storage/indexedDbService.ts';
import { useOffline } from '../../context/OfflineContext.tsx';
import { formatLocalDate } from '../../utils/date.ts';

export default function BorrowedMaterials() {
  const queryClient = useQueryClient();
  const { isOnline } = useOffline();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE'>('PENDING');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [localBorrowedItems, setLocalBorrowedItems] = useState<any[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [tempDeadline, setTempDeadline] = useState<string>('');

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    itemId: '',
    materialName: '',
    quantity: 0
  });

  // Fetch online data using react-query
  const { data: onlineBorrowedItems, isLoading: isQueryLoading, error } = useQuery({
    queryKey: ['borrowed-materials'],
    queryFn: () => api.get('/demands/borrowed-materials').then(res => res.data),
    enabled: isOnline
  });

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Synchronize react-query online list with local states or load offline cache
  useEffect(() => {
    const loadCache = async () => {
      setLoadingLocal(true);
      try {
        if (isOnline && onlineBorrowedItems) {
          setLocalBorrowedItems(onlineBorrowedItems);
          // Save cache
          await IndexedDbService.saveMetadata('borrowed_materials', onlineBorrowedItems);
        } else {
          // Offline fallback
          let items = await IndexedDbService.getMetadata('borrowed_materials');
          if (!items || items.length === 0) {
            // Reconstruct from cached_demands if no direct metadata cache found
            const demands = await IndexedDbService.getAllCachedDemands() || [];
            const constructed: any[] = [];
            demands.forEach((d: any) => {
              if (d.plannedMaterials) {
                d.plannedMaterials.forEach((pm: any) => {
                  if (pm.borrowed) {
                    constructed.push({
                      id: pm.id || `${pm.demandId}-${pm.materialId}`,
                      demandId: d.id,
                      materialId: pm.materialId,
                      quantity: pm.quantity,
                      borrowed: true,
                      borrowedDeadline: pm.borrowedDeadline,
                      material: pm.material || { name: 'Material Desconhecido', unit: 'un' },
                      demand: {
                        id: d.id,
                        location: d.location,
                        date: d.date,
                        clientNumber: d.clientNumber,
                        electricians: d.electricians || []
                      }
                    });
                  }
                });
              }
            });
            items = constructed;
          }
          setLocalBorrowedItems(items || []);
        }
      } catch (err) {
        console.error('Error loading borrowed materials cache:', err);
      } finally {
        setLoadingLocal(false);
      }
    };

    loadCache();
  }, [onlineBorrowedItems, isOnline]);

  // Mutations
  const updateDeadlineMutation = useMutation({
    mutationFn: ({ id, deadline }: { id: string, deadline: string | null }) => 
      api.patch(`/demands/demand-material/${id}`, { borrowedDeadline: deadline }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['borrowed-materials'] });
      setEditingDeadlineId(null);
      showFeedback('success', `Prazo final atualizado com sucesso!`);
    },
    onError: (err) => {
      console.error(err);
      showFeedback('error', 'Falha ao sincronizar alteração de data.');
    }
  });

  const returnMaterialMutation = useMutation({
    mutationFn: (id: string) => 
      api.patch(`/demands/demand-material/${id}`, { borrowed: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['borrowed-materials'] });
      showFeedback('success', 'Material devolvido com sucesso ao Almoxarifado!');
    },
    onError: (err) => {
      console.error(err);
      showFeedback('error', 'Falha ao registrar devolução.');
    }
  });

  const handleSaveDeadline = async (id: string) => {
    const parsedDeadline = tempDeadline ? new Date(tempDeadline + 'T12:00:00').toISOString() : null;

    if (!isOnline) {
      // Offline fallback: Update local state and cached metadata + cached_demands
      try {
        const updatedItems = localBorrowedItems.map((item) => {
          if (item.id === id) {
            return { ...item, borrowedDeadline: parsedDeadline };
          }
          return item;
        });
        setLocalBorrowedItems(updatedItems);
        await IndexedDbService.saveMetadata('borrowed_materials', updatedItems);

        // Try to locate demand id and update inside cached_demands too
        const targetItem = localBorrowedItems.find(item => item.id === id);
        if (targetItem && targetItem.demandId) {
          const cachedDemand = await IndexedDbService.getCachedDemand(targetItem.demandId);
          if (cachedDemand && cachedDemand.plannedMaterials) {
            cachedDemand.plannedMaterials = cachedDemand.plannedMaterials.map((pm: any) => {
              if (pm.materialId === targetItem.materialId || pm.id === id) {
                return { ...pm, borrowedDeadline: parsedDeadline };
              }
              return pm;
            });
            await IndexedDbService.saveCachedDemands([
              ...(await IndexedDbService.getAllCachedDemands()).filter((d: any) => d.id !== targetItem.demandId),
              cachedDemand
            ]);
          }
        }
        
        setEditingDeadlineId(null);
        showFeedback('success', 'Prazo salvo localmente (será atualizado no servidor quando voltar online!).');
      } catch (err) {
        console.error('Failed to update offline deadline:', err);
        showFeedback('error', 'Erro ao salvar alteração offline.');
      }
    } else {
      updateDeadlineMutation.mutate({ id, deadline: parsedDeadline });
    }
  };

  const handleReturnConfirm = async () => {
    const id = confirmDialog.itemId;
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));

    if (!isOnline) {
      // Offline fallback: Update local state immediately
      try {
        const updatedItems = localBorrowedItems.filter(item => item.id !== id);
        setLocalBorrowedItems(updatedItems);
        await IndexedDbService.saveMetadata('borrowed_materials', updatedItems);

        const targetItem = localBorrowedItems.find(item => item.id === id);
        if (targetItem && targetItem.demandId) {
          const cachedDemand = await IndexedDbService.getCachedDemand(targetItem.demandId);
          if (cachedDemand && cachedDemand.plannedMaterials) {
            cachedDemand.plannedMaterials = cachedDemand.plannedMaterials.map((pm: any) => {
              if (pm.materialId === targetItem.materialId || pm.id === id) {
                return { ...pm, borrowed: false };
              }
              return pm;
            });
            await IndexedDbService.saveCachedDemands([
              ...(await IndexedDbService.getAllCachedDemands()).filter((d: any) => d.id !== targetItem.demandId),
              cachedDemand
            ]);
          }
        }
        showFeedback('success', 'Baixa registrada localmente! Sincronização ocorrerá quando houver internet.');
      } catch (err) {
        console.error('Failed to register offline return:', err);
        showFeedback('error', 'Erro ao registrar devolução offline.');
      }
    } else {
      returnMaterialMutation.mutate(id);
    }
  };

  // Filters logic
  const filteredItems = localBorrowedItems.filter((item) => {
    const materialName = item.material?.name || '';
    const demandLocation = item.demand?.location || '';
    const electriciansNames = item.demand?.electricians?.map((e: any) => e.name).join(' ') || '';
    
    const matchesSearch = 
      materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      demandLocation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      electriciansNames.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // Filter by date status
    if (statusFilter === 'ALL') return true;

    const hasDeadline = !!item.borrowedDeadline;
    const isOverdue = hasDeadline && new Date(item.borrowedDeadline).getTime() < new Date().setHours(0,0,0,0);

    if (statusFilter === 'OVERDUE') {
      return isOverdue;
    }
    
    // Default PENDING (still borrowed, regardless of deadline)
    return true;
  });

  const isLoading = isQueryLoading || loadingLocal;

  return (
    <Layout>
      {/* Visual Feedback Banner */}
      {feedback && (
        <div className={`fixed top-4 right-4 z-[100] p-4 rounded-xl shadow-xl flex items-center gap-3 border transition-all animate-in fade-in slide-in-from-top-3 ${
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
        <div className="flex items-center gap-3 mb-1">
          <Clock className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Materiais Emprestados</h1>
        </div>
        <p className="text-sm text-gray-500">
          Acompanhe ferramentas, equipamentos e sobras marcadas como empréstimo associadas às demandas de campo.
        </p>
      </div>

      {/* Navigation Controls / Filtering */}
      <div className="bg-white border border-gray-200 p-4 rounded-2xl shadow-sm mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Pesquisar material, eletricista ou local..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all text-gray-800"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'PENDING' 
                ? 'bg-white text-gray-800 shadow-sm' 
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Pendente
          </button>
          <button
            onClick={() => setStatusFilter('OVERDUE')}
            className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'OVERDUE' 
                ? 'bg-white text-red-700 shadow-sm' 
                : 'text-gray-500 hover:text-red-600'
            }`}
          >
            Atrasados
          </button>
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              statusFilter === 'ALL' 
                ? 'bg-white text-gray-800 shadow-sm' 
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Todos
          </button>
        </div>
      </div>

      {/* Main Listing View */}
      {isLoading ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Buscando materiais emprestados...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center flex flex-col items-center">
          <Archive className="h-10 w-10 text-gray-300 mb-3" />
          <h3 className="font-bold text-gray-700 text-base mb-1">Nenhum empréstimo ativo</h3>
          <p className="text-gray-500 text-xs max-w-sm">
            Nenhum material pendente de devolução atende aos filtros definidos.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Table for Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Material</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider w-24">Qtd.</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Demanda Associada / Responsável</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider w-64">Prazo de Empréstimo</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider w-36 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map((item) => {
                  const isOverdue = item.borrowedDeadline && new Date(item.borrowedDeadline).getTime() < new Date().setHours(0,0,0,0);
                  const isCurrentEditing = editingDeadlineId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/40 transition-colors">
                      {/* Name */}
                      <td className="p-4">
                        <div className="font-semibold text-gray-800 text-sm">{item.material?.name || 'Desconhecido'}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 uppercase font-bold bg-gray-100 inline-block px-1.5 py-0.5 rounded">
                          {item.material?.unit || 'un'}
                        </div>
                      </td>
                      
                      {/* Qty */}
                      <td className="p-4 font-black text-gray-800 text-sm">
                        {item.quantity} {item.material?.unit || 'un'}
                      </td>

                      {/* Demand Link / Location */}
                      <td className="p-4">
                        <div className="text-xs text-gray-700 font-medium">
                          {item.demand?.location || 'Local não especificado'}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-1.5 items-center">
                          <span className="font-semibold">{formatLocalDate(item.demand?.date, 'dd/MM/yyyy')}</span>
                          <span className="text-gray-300">•</span>
                          <span className="italic text-gray-400 text-[10px]">
                            Eletricistas: {item.demand?.electricians?.map((e: any) => e.name).join(', ') || 'Nenhum'}
                          </span>
                        </div>
                        <Link 
                          to={`/demands/${item.demandId}`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:underline mt-1.5"
                        >
                          Ver Demanda <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </td>

                      {/* Return Deadline input */}
                      <td className="p-4">
                        {isCurrentEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={tempDeadline}
                              onChange={(e) => setTempDeadline(e.target.value)}
                              className="p-1.5 border border-gray-300 rounded-lg text-xs bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              onClick={() => handleSaveDeadline(item.id)}
                              className="h-7 w-7 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center shadow-sm cursor-pointer"
                              title="Salvar Prazo"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingDeadlineId(null)}
                              className="h-7 w-7 text-xs border border-gray-200 text-gray-500 hover:bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer"
                              title="Cancelar"
                            >
                              x
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="text-xs font-semibold">
                              {item.borrowedDeadline ? (
                                <span className={isOverdue ? 'text-red-500' : 'text-gray-700'}>
                                  {formatLocalDate(item.borrowedDeadline, 'dd/MM/yyyy')}
                                  {isOverdue && <span className="ml-1 text-[10px] font-bold bg-red-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Atrasado</span>}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic">Prazo não definido</span>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                setEditingDeadlineId(item.id);
                                setTempDeadline(
                                  item.borrowedDeadline 
                                    ? formatLocalDate(item.borrowedDeadline, 'yyyy-MM-dd') 
                                    : ''
                                );
                              }}
                              className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                              title="Editar prazo de empréstimo"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setConfirmDialog({
                            isOpen: true,
                            itemId: item.id,
                            materialName: item.material?.name || 'Material',
                            quantity: item.quantity
                          })}
                          className="inline-flex items-center gap-1 bg-green-50 hover:bg-green-100 border border-green-200 hover:border-green-300 text-green-700 hover:text-green-800 px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all shadow-sm cursor-pointer"
                        >
                          <Undo2 className="h-3 w-3" /> Devolver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards for Mobile Devices */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredItems.map((item) => {
              const isOverdue = item.borrowedDeadline && new Date(item.borrowedDeadline).getTime() < new Date().setHours(0,0,0,0);
              const isCurrentEditing = editingDeadlineId === item.id;

              return (
                <div key={item.id} className="p-4 space-y-3.5 bg-white">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-gray-800 text-sm">{item.material?.name || 'Desconhecido'}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5 uppercase bg-gray-100 inline-block px-1 rounded-sm">
                        QTD: {item.quantity} {item.material?.unit || 'un'}
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmDialog({
                        isOpen: true,
                        itemId: item.id,
                        materialName: item.material?.name || 'Material',
                        quantity: item.quantity
                      })}
                      className="bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Undo2 className="h-3 w-3" /> Devolver
                    </button>
                  </div>

                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs space-y-1.5">
                    <div>
                      <span className="font-semibold text-gray-500">Local: </span>
                      <span className="text-gray-800 font-medium">{item.demand?.location}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500">Data: </span>
                      <span className="text-gray-800">{formatLocalDate(item.demand?.date, 'dd/MM/yyyy')}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-500 text-[10px]">Eletricistas: </span>
                      <span className="text-gray-600 text-[10px] break-words">
                        {item.demand?.electricians?.map((e: any) => e.name).join(', ') || 'Nenhum'}
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-gray-200/50 flex justify-between items-center">
                      <Link 
                        to={`/demands/${item.demandId}`}
                        className="text-blue-600 font-bold hover:underline flex items-center gap-1 text-[10px]"
                      >
                        Ver detalhes <ExternalLink className="h-2 w-2" />
                      </Link>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400">Prazo:</span>
                    {isCurrentEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={tempDeadline}
                          onChange={(e) => setTempDeadline(e.target.value)}
                          className="p-1 border border-gray-300 rounded text-xs bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 w-28"
                        />
                        <button
                          onClick={() => handleSaveDeadline(item.id)}
                          className="h-6 w-6 bg-blue-600 text-white rounded flex items-center justify-center cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingDeadlineId(null)}
                          className="h-6 w-6 text-xs border border-gray-200 text-gray-500 rounded flex items-center justify-center cursor-pointer"
                        >
                          x
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${isOverdue ? 'text-red-500' : 'text-gray-700'}`}>
                          {item.borrowedDeadline 
                            ? formatLocalDate(item.borrowedDeadline, 'dd/MM/yyyy') 
                            : 'Mudar prazo'}
                        </span>
                        <button
                          onClick={() => {
                            setEditingDeadlineId(item.id);
                            setTempDeadline(
                              item.borrowedDeadline 
                                ? formatLocalDate(item.borrowedDeadline, 'yyyy-MM-dd') 
                                : ''
                            );
                          }}
                          className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Return Action */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Confirmar Devolução de Material"
        message={`Deseja realmente registrar a devolução de ${confirmDialog.quantity} un de "${confirmDialog.materialName}" ao estoque do Almoxarifado? A demanda deixará de listar este material como emprestado.`}
        confirmText="Sim, Devolver"
        cancelText="Cancelar"
        variant="info"
        onConfirm={handleReturnConfirm}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </Layout>
  );
}
