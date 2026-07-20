import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout.tsx';
import api from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Check, X, Shield, User, Loader2, Trash2, AlertCircle, Info } from 'lucide-react';

export default function Users() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, name: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => 
      await api.patch(`/users/${userId}/approve`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => await api.delete(`/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setFeedback({ type: 'success', message: 'Usuário excluído com sucesso!' });
      setConfirmDelete(null);
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: (error: any) => {
      setFeedback({ 
        type: 'error', 
        message: error.response?.data?.error || 'Erro ao excluir usuário.' 
      });
      setConfirmDelete(null);
      setTimeout(() => setFeedback(null), 5000);
    }
  });

  const handleDeleteUser = (userId: string, name: string) => {
    setConfirmDelete({ id: userId, name });
  };

  const pendingUsers = users?.filter((u: any) => u.status === 'PENDING');
  const activeUsers = users?.filter((u: any) => u.status === 'APPROVED');

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
        <p className="text-gray-600">Aprove solicitações e gerencie a equipe.</p>
      </div>

      <div className="space-y-8 relative">
        {/* Feedback Message */}
        {feedback && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            feedback.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {feedback.type === 'success' ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            <span className="font-medium">{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="ml-2 hover:opacity-70"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {confirmDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 max-w-md w-full animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold">Excluir Usuário</h3>
              </div>
              
              <p className="text-gray-600 mb-6">
                Tem certeza que deseja excluir permanentemente o usuário <span className="font-bold text-gray-900">"{confirmDelete.name}"</span>? 
                Esta ação não pode ser desfeita e pode afetar registros vinculados.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deleteMutation.mutate(confirmDelete.id)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Confirmar Exclusão
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Pending Requests */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs mr-2">{pendingUsers?.length || 0}</span>
            Solicitações Pendentes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingUsers?.map((u: any) => (
              <div key={u.id} className="bg-white p-6 rounded-xl border border-yellow-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 bg-yellow-50 text-yellow-600">
                  <Shield className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-gray-900">{u.name}</h3>
                <p className="text-sm text-gray-500 mb-4">@{u.username} • {u.role === 'ELECTRICIAN' ? 'ELETRICISTA' : u.role}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveMutation.mutate({ userId: u.id, status: 'APPROVED' })}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center hover:bg-green-700 transition-colors"
                  >
                    <Check className="h-4 w-4 mr-1" /> Aprovar
                  </button>
                  <button
                    onClick={() => approveMutation.mutate({ userId: u.id, status: 'REJECTED' })}
                    className="flex-1 bg-white border border-gray-300 text-red-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center hover:bg-red-50 transition-colors"
                  >
                    <X className="h-4 w-4 mr-1" /> Recusar
                  </button>
                </div>
              </div>
            ))}
            {pendingUsers?.length === 0 && <p className="text-gray-500 text-sm italic">Nenhuma solicitação pendente.</p>}
          </div>
        </section>

        {/* Active Team */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Equipe Ativa</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3">Nome</th>
                  <th className="px-6 py-3">Usuário</th>
                  <th className="px-6 py-3">Papel</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeUsers?.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 flex items-center">
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 mr-3 text-xs font-bold font-mono">
                        {u.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{u.name}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">@{u.username}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {u.role === 'ELECTRICIAN' ? 'ELETRICISTA' : u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-4">
                        <button 
                          className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-all"
                          title="Ver Perfil"
                        >
                          <User className="h-5 w-5" />
                        </button>
                        
                        {u.id !== currentUser?.id && (
                          <button 
                            onClick={(e) => {
                              console.log('Button clicked for user:', u.name);
                              handleDeleteUser(u.id, u.name);
                            }}
                            disabled={deleteMutation.isPending}
                            className={`p-1 rounded-full transition-all ${
                              deleteMutation.isPending 
                                ? 'text-gray-300 cursor-not-allowed' 
                                : 'text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer'
                            }`}
                            title="Excluir Usuário"
                          >
                            {deleteMutation.isPending && deleteMutation.variables === u.id ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Trash2 className="h-5 w-5" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Layout>
  );
}
