import React, { useState, useRef } from 'react';
import Layout from '../../components/Layout.tsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  FileText,
  Upload,
  Download,
  Eye,
  Trash2,
  Plus,
  Loader2,
  Search,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { formatLocalDate } from '../../utils/date.ts';

export default function InternalCommunications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [docName, setDocName] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Drag and drop active state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries & Mutations
  const { data: documents, isLoading: isDocumentsLoading } = useQuery({
    queryKey: ['cis'],
    queryFn: () => api.get('/cis').then(res => res.data)
  });

  const uploadCIMutation = useMutation({
    mutationFn: (formData: FormData) => api.post('/cis', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cis'] });
      setDocName('');
      setDocFile(null);
      setIsUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showFeedback('success', 'CI (Comunicação Interna) enviada e registrada com sucesso!');
    },
    onError: (err: any) => {
      setIsUploadingDoc(false);
      const errMsg = err.response?.data?.error || 'Erro ao enviar a Comunicação Interna.';
      showFeedback('error', errMsg);
    }
  });

  const deleteCIMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/cis/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cis'] });
      showFeedback('success', 'Comunicação Interna removida com sucesso!');
    },
    onError: (err: any) => {
      const errMsg = err.response?.data?.error || 'Erro ao excluir o documento.';
      showFeedback('error', errMsg);
    }
  });

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type !== 'application/pdf') {
        showFeedback('error', 'Apenas arquivos em formato PDF são aceitos.');
        return;
      }
      setDocFile(file);
      if (docName.trim() === '') {
        // Auto populate name from filename without extension
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        setDocName(cleanName);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        showFeedback('error', 'Apenas arquivos em formato PDF são aceitos.');
        return;
      }
      setDocFile(file);
      if (docName.trim() === '') {
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        setDocName(cleanName);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim() || !docFile) {
      showFeedback('error', 'Preencha o nome do documento e selecione um arquivo PDF.');
      return;
    }

    setIsUploadingDoc(true);
    const formData = new FormData();
    formData.append('name', docName.trim());
    formData.append('file', docFile);

    uploadCIMutation.mutate(formData);
  };

  const handleDeleteDocument = (id: string) => {
    setDeletingId(id);
  };

  // Filter list
  const filteredCIs = documents?.filter((doc: any) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
        
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 border-b border-gray-150 pb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-2.5">
              <FileText className="h-7 w-7 text-red-600 shrink-0" />
              Carregar CIs (comunicação interna) e Outros DOCS
            </h1>
            <p className="text-gray-500 text-xs mt-1 font-medium">
              Envio e consulta de comunicações internas em formato PDF.
            </p>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div className={`p-4 mb-6 rounded-xl border flex items-center gap-3 animate-fade-in ${
            feedback.type === 'success' 
              ? 'bg-emerald-50 border-emerald-150 text-emerald-850' 
              : 'bg-red-50 border-red-150 text-red-800'
          }`}>
            {feedback.type === 'success' ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
            )}
            <span className="text-xs font-bold uppercase tracking-wide leading-relaxed">{feedback.message}</span>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Admin Upload Section */}
          {user?.role === 'ADMIN' && (
            <div className="lg:col-span-4 bg-white border border-gray-200/95 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-150 bg-gray-50/50">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-800 flex items-center gap-2">
                  <Upload className="h-4 w-4 text-blue-600" />
                  Cadastrar Nova CI/Doc
                </h3>
                <p className="text-gray-400 text-[10px] uppercase font-bold mt-1">
                  Adicionar documento PDF para disponibilização geral.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-5">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-1.5">
                    Nome / Título da CI/Doc <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="Ex: CI 04/2026 - Uso de Novos EPIs"
                    className="w-full p-2.5 bg-gray-50/50 border border-gray-250 focus:bg-white focus:border-blue-500 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500/10 transition-all text-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-1.5">
                    Arquivo PDF <span className="text-red-500">*</span>
                  </label>
                  
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-250 flex flex-col items-center justify-center gap-2.5 group ${
                      isDragging 
                        ? 'border-blue-500 bg-blue-50/40 shadow-inner' 
                        : docFile 
                          ? 'border-emerald-300 bg-emerald-50/10 hover:border-emerald-400' 
                          : 'border-gray-250 hover:border-blue-400 bg-gray-50/30'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      required={!docFile}
                      accept="application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    
                    <FileText className={`h-10 w-10 transition-colors duration-250 ${
                      isDragging 
                        ? 'text-blue-500 animate-pulse' 
                        : docFile 
                          ? 'text-emerald-500' 
                          : 'text-gray-400 group-hover:text-blue-500'
                    }`} />
                    
                    <div className="space-y-1">
                      <span className="text-xs font-black text-gray-700 block leading-tight">
                        {docFile ? docFile.name : 'Selecione ou Arraste o arquivo'}
                      </span>
                      <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">
                        {docFile 
                          ? `${(docFile.size / 1024 / 1024).toFixed(2)} MB` 
                          : 'Clique para navegar ou solte um PDF aqui'
                        }
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUploadingDoc || uploadCIMutation.isPending}
                  className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-xs uppercase py-3 rounded-lg transition-all hover:shadow cursor-pointer select-none active:scale-[0.98] disabled:cursor-not-allowed"
                >
                  {isUploadingDoc || uploadCIMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando CI...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4.5 w-4.5" />
                      Registrar e Disponibilizar
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* List and Search Area */}
          <div className={`${user?.role === 'ADMIN' ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
            
            {/* Search Filter Bar */}
            <div className="bg-white border border-gray-200/95 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar CIs por nome ou título..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50/50 hover:bg-gray-50 focus:bg-white border border-gray-250 focus:border-blue-500 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500/10 transition-all text-gray-800"
                />
              </div>
            </div>

            {/* CIs List */}
            {isDocumentsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                <span className="text-gray-400 font-bold text-xs uppercase tracking-wider">Carregando comunicações internas...</span>
              </div>
            ) : !filteredCIs || filteredCIs.length === 0 ? (
              <div className="py-20 text-center border border-dashed border-gray-200 rounded-2xl bg-white shadow-sm px-6">
                <FileText className="h-14 w-14 text-gray-300 mx-auto mb-4" />
                <h4 className="text-sm font-black text-gray-800 uppercase tracking-tight">Nenhuma Comunicação Interna (CI) encontrada</h4>
                <p className="text-gray-400 text-xs mt-1 max-w-md mx-auto">
                  {searchTerm 
                    ? 'Nenhum documento atende aos termos da sua pesquisa atual. Tente buscar por outros termos.' 
                    : 'Ainda não foram disponibilizados comunicados no sistema.'
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredCIs.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="border border-gray-200/95 hover:border-gray-350 hover:shadow-md bg-white rounded-2xl p-5 flex flex-col justify-between gap-5 transition-all duration-200"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-red-50 text-red-600 rounded-xl shrink-0 border border-red-100">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-black text-gray-900 leading-snug break-words uppercase tracking-tight" title={doc.name}>
                          {doc.name}
                        </h4>
                        <span className="text-[10px] text-gray-400 font-extrabold block mt-1.5 uppercase tracking-wider">
                          Enviado em: {formatLocalDate(doc.uploadedAt, 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>
                    </div>

                    {deletingId === doc.id ? (
                      <div className="flex flex-col gap-2 border-t border-red-100 bg-red-50/40 p-3 rounded-xl mt-auto transition-all">
                        <span className="text-[10px] font-extrabold text-red-700 text-center uppercase tracking-wider">
                          Deseja realmente excluir?
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              deleteCIMutation.mutate(doc.id);
                              setDeletingId(null);
                            }}
                            className="flex-1 inline-flex items-center justify-center bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] uppercase py-1.5 px-3 rounded-lg transition-colors cursor-pointer text-center"
                          >
                            Sim, excluir
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="flex-1 inline-flex items-center justify-center bg-gray-100 border border-gray-250 hover:bg-gray-200 text-gray-700 font-bold text-[10px] uppercase py-1.5 px-3 rounded-lg transition-colors cursor-pointer text-center"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 border-t border-gray-100 pt-4 mt-auto">
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer referrer"
                          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold text-[10px] uppercase py-2 px-3 rounded-lg transition-colors cursor-pointer text-center"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Visualizar
                        </a>
                        
                        <a
                          href={doc.fileUrl}
                          download={doc.name}
                          target="_blank"
                          rel="noreferrer referrer"
                          className="inline-flex items-center justify-center p-2 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors cursor-pointer"
                          title="Baixar arquivo"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>

                        {user?.role === 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="inline-flex items-center justify-center p-2 bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 rounded-lg transition-colors cursor-pointer"
                            title="Excluir documento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
