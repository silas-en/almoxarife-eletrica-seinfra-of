import React, { useState } from 'react';
import Layout from '../../components/Layout.tsx';
import ConfirmDialog from '../../components/ConfirmDialog.tsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api.ts';
import { Wrench, Plus, Trash2, Edit2, Search, X, CheckCircle, AlertCircle } from 'lucide-react';

export default function Tools() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<any>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    toolId: ''
  });

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const { data: tools, isLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: () => api.get('/tools').then(res => res.data)
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/tools', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      closeModal();
      showFeedback('success', 'Ferramenta cadastrada com sucesso!');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/tools/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      closeModal();
      showFeedback('success', 'Ferramenta atualizada com sucesso!');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tools/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      showFeedback('success', 'Ferramenta removida com sucesso!');
    }
  });

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const openModal = (tool?: any) => {
    if (tool) {
      setEditingTool(tool);
      setName(tool.name);
      setCode(tool.code || '');
    } else {
      setEditingTool(null);
      setName('');
      setCode('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTool(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTool) {
      updateMutation.mutate({ id: editingTool.id, data: { name, code } });
    } else {
      createMutation.mutate({ name, code });
    }
  };

  const filteredTools = tools?.filter((t: any) => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestão de Ferramentas</h1>
          <p className="text-gray-500">Cadastre e gerencie as ferramentas utilizadas pelas equipes.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="h-5 w-5" /> Nova Ferramenta
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex items-center">
        <Search className="h-5 w-5 text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Buscar ferramenta ou código..."
          className="flex-1 outline-none text-gray-700"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12">Carregando ferramentas...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTools?.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              Nenhuma ferramenta encontrada.
            </div>
          ) : (
            filteredTools?.map((tool: any) => (
              <div key={tool.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow group">
                <div className="flex justify-between items-start mb-4">
                  <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                    <Wrench className="h-6 w-6" />
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openModal(tool)}
                      className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 rounded-lg"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDialog({ isOpen: true, toolId: tool.id })}
                      className="p-2 text-gray-400 hover:text-red-600 bg-gray-50 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900">{tool.name}</h3>
                {tool.code && (
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                    <span className="font-mono bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{tool.code}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-900">
                {editingTool ? 'Editar Ferramenta' : 'Nova Ferramenta'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome/Identificação</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Ex: Alicate Amperímetro"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código (Opcional)</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Ex: FER-001"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Excluir Ferramenta"
        message="Tem certeza que deseja excluir esta ferramenta permanentemente?"
        onClose={() => setConfirmDialog({ isOpen: false, toolId: '' })}
        onConfirm={() => deleteMutation.mutate(confirmDialog.toolId)}
      />
    </Layout>
  );
}
