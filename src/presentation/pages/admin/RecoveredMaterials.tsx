import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  AlertCircle,
  Clock,
  RotateCw,
  Box,
  ArrowLeft
} from 'lucide-react';
import Modal from '../../components/Modal.tsx';
import ConfirmDialog from '../../components/ConfirmDialog.tsx';
import Layout from '../../components/Layout.tsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseUTCDate, formatLocalDate } from '../../utils/date.ts';

export default function RecoveredMaterials() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    materialId: '',
    materialName: '',
    quantity: 1,
    date: formatLocalDate(new Date(), 'yyyy-MM-dd')
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [materialSearch, setMaterialSearch] = useState('');
  const [showResults, setShowResults] = useState(false);

  const { data: recovered, isLoading } = useQuery({
    queryKey: ['recovered'],
    queryFn: () => axios.get('/api/recovered').then(res => res.data)
  });

  const { data: materials } = useQuery({
    queryKey: ['materials'],
    queryFn: () => axios.get('/api/materials').then(res => res.data)
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => axios.post('/api/recovered', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recovered'] });
      setIsModalOpen(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; quantity: number; date: string }) => 
      axios.put(`/api/recovered/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recovered'] });
      setIsModalOpen(false);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/recovered/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recovered'] });
      setIsConfirmOpen(false);
      setSelectedId(null);
    }
  });

  const resetForm = () => {
    setFormData({
      materialId: '',
      materialName: '',
      quantity: 1,
      date: formatLocalDate(new Date(), 'yyyy-MM-dd')
    });
    setEditingId(null);
    setMaterialSearch('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (entry: any) => {
    setEditingId(entry.id);
    setFormData({
      materialId: entry.materialId || '',
      materialName: entry.materialName || '',
      quantity: entry.quantity,
      date: formatLocalDate(entry.date, 'yyyy-MM-dd')
    });
    if (entry.material) {
      setMaterialSearch(entry.material.name);
    } else {
      setMaterialSearch(entry.materialName || '');
    }
    setIsModalOpen(true);
  };

  const filtered = recovered?.filter((entry: any) => {
    const name = entry.material?.name || entry.materialName || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <Layout>
      <div className="mb-6">
        <button onClick={() => window.history.back()} className="flex items-center text-gray-500 hover:text-gray-700 mb-4 transition-colors">
          <ArrowLeft className="h-5 w-5 mr-1" /> Voltar
        </button>
      </div>

      <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Materiais Recuperados</h1>
          <p className="text-gray-500">Gestão de itens consertados e prontos para reuso</p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Registrar Recuperação
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
        <Search className="text-gray-400 h-5 w-5" />
        <input
          type="text"
          placeholder="Buscar material recuperado..."
          className="flex-1 bg-transparent border-none focus:ring-0 text-gray-700"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Material</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Quantidade</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Origem</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered?.map((entry: any) => (
                  <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatLocalDate(entry.date, 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded bg-green-100 flex items-center justify-center text-green-600 mr-3">
                          <RotateCw className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {entry.material?.name || entry.materialName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-blue-600">{entry.quantity} un</span>
                    </td>
                    <td className="px-6 py-4">
                      {entry.demand ? (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full border border-blue-100">
                          Demanda: {entry.demand.description.substring(0, 20)}...
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-full border border-gray-100">
                          Entrada Avulsa
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                       {/* Only allow editing/deleting if it's a standalone entry for simplicity, or allow all */}
                      <button
                        onClick={() => handleEdit(entry)}
                        className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => { setSelectedId(entry.id); setIsConfirmOpen(true); }}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 italic">
                      Nenhum material recuperado encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Register/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Editar Recuperação' : 'Registrar Material Recuperado'}
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Material (Nome ou Pesquisa)</label>
            <div className="relative">
              <div className="relative">
                <Box className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="Nome do material..."
                  value={materialSearch}
                  onChange={(e) => {
                    setMaterialSearch(e.target.value);
                    setFormData({ ...formData, materialName: e.target.value, materialId: '' });
                    setShowResults(true);
                  }}
                  onFocus={() => setShowResults(true)}
                  disabled={!!editingId}
                />
              </div>
              {showResults && !editingId && materialSearch && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {materials?.filter((m: any) => m.name.toLowerCase().includes(materialSearch.toLowerCase())).map((m: any) => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full text-left p-3 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 last:border-0"
                      onClick={() => {
                        setFormData({ ...formData, materialId: m.id, materialName: m.name });
                        setMaterialSearch(m.name);
                        setShowResults(false);
                      }}
                    >
                      <Box className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{m.name}</span>
                    </button>
                  ))}
                  {materials?.filter((m: any) => m.name.toLowerCase().includes(materialSearch.toLowerCase())).length === 0 && (
                    <div className="p-3 text-xs text-blue-600 font-medium bg-blue-50">
                      Material novo: "{materialSearch}" (será registrado sem vínculo)
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
              <input
                type="number"
                min="1"
                required
                className="w-full p-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input
                type="date"
                required
                className="w-full p-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending || (!formData.materialId && !formData.materialName)}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-300"
            >
              {(createMutation.isPending || updateMutation.isPending) ? 'Processando...' : editingId ? 'Salvar Alterações' : 'Registrar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => selectedId && deleteMutation.mutate(selectedId)}
        title="Excluir Registro"
        message="Tem certeza que deseja excluir este registro de material recuperado? Esta ação não pode ser desfeita."
        variant="danger"
      />
      </div>
    </Layout>
  );
}
