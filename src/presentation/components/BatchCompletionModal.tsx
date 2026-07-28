import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  X, 
  CheckCircle2, 
  Upload, 
  Camera, 
  AlertCircle, 
  Loader2, 
  Truck, 
  Wrench, 
  Package, 
  FileText,
  Clock,
  Layers,
  Check
} from 'lucide-react';
import api from '../services/api.ts';
import { useOffline } from '../context/OfflineContext.tsx';
import { IndexedDbService } from '../../infra/storage/indexedDbService.ts';
import { formatLocalDate } from '../utils/date.ts';

interface BatchCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDemandIds: string[];
  allDemands: any[];
  onSuccess: () => void;
}

export default function BatchCompletionModal({
  isOpen,
  onClose,
  selectedDemandIds,
  allDemands,
  onSuccess
}: BatchCompletionModalProps) {
  const queryClient = useQueryClient();
  const { isOnline, saveOfflineCompletion } = useOffline();

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<File[]>([]);
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [trafo, setTrafo] = useState('');
  const [obs, setObs] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; currentLabel: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch metadata for vehicles and tools
  const { data: registeredVehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const online = isOnline && navigator.onLine;
      if (!online) {
        return (await IndexedDbService.getMetadata('vehicles')) || [];
      }
      try {
        const data = (await api.get('/vehicles')).data;
        await IndexedDbService.saveMetadata('vehicles', data);
        return data;
      } catch (err) {
        return (await IndexedDbService.getMetadata('vehicles')) || [];
      }
    }
  });

  const { data: registeredTools } = useQuery({
    queryKey: ['tools'],
    queryFn: async () => {
      const online = isOnline && navigator.onLine;
      if (!online) {
        return (await IndexedDbService.getMetadata('tools')) || [];
      }
      try {
        const data = (await api.get('/tools')).data;
        await IndexedDbService.saveMetadata('tools', data);
        return data;
      } catch (err) {
        return (await IndexedDbService.getMetadata('tools')) || [];
      }
    }
  });

  if (!isOpen) return null;

  // Filter selected demands objects
  const selectedDemands = allDemands.filter(d => selectedDemandIds.includes(String(d.id)));

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExtraPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setExtraPhotos(prev => [...prev, ...filesArray]);
    }
  };

  const toggleVehicle = (plateOrName: string) => {
    setVehicles(prev =>
      prev.includes(plateOrName)
        ? prev.filter(v => v !== plateOrName)
        : [...prev, plateOrName]
    );
  };

  const toggleTool = (toolName: string) => {
    setSelectedTools(prev =>
      prev.includes(toolName)
        ? prev.filter(t => t !== toolName)
        : [...prev, toolName]
    );
  };

  const handleSubmitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) {
      setFeedback({ type: 'error', message: 'A foto do serviço é obrigatória para dar baixa nas demandas!' });
      return;
    }

    if (selectedDemands.length === 0) {
      setFeedback({ type: 'error', message: 'Nenhuma demanda selecionada.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    const total = selectedDemands.length;
    let successCount = 0;
    let offlineCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedDemands.length; i++) {
      const demand = selectedDemands[i];
      const demandId = String(demand.id);
      const locationLabel = demand.location || `Demanda #${demandId}`;

      setProgress({
        current: i + 1,
        total,
        currentLabel: `Processando ${i + 1} de ${total}: "${locationLabel}"...`
      });

      // Extract planned materials to consume exact quantities (used = planned, surplus = 0)
      let usedMaterials: { materialId: string; quantity: number }[] = [];
      if (Array.isArray(demand.plannedMaterials) && demand.plannedMaterials.length > 0) {
        usedMaterials = demand.plannedMaterials.map((pm: any) => ({
          materialId: String(pm.materialId || pm.material?.id || pm.id),
          quantity: Number(pm.quantity) || 0
        }));
      } else if (demand.formData?.materials && Array.isArray(demand.formData.materials)) {
        usedMaterials = demand.formData.materials.map((m: any) => ({
          materialId: String(m.materialId || m.id),
          quantity: Number(m.quantity) || 0
        }));
      } else if (Array.isArray(demand.materials) && demand.materials.length > 0) {
        usedMaterials = demand.materials.map((m: any) => ({
          materialId: String(m.materialId || m.id),
          quantity: Number(m.quantity) || 0
        }));
      }

      const executeOfflineSave = async () => {
        try {
          await saveOfflineCompletion(
            demandId,
            usedMaterials,
            [], // replacedMaterials = []
            vehicles,
            selectedTools,
            trafo,
            obs,
            photo,
            extraPhotos
          );
          offlineCount++;
        } catch (err) {
          console.error(`Error saving completion offline for demand ${demandId}:`, err);
          failCount++;
        }
      };

      const onlineAvailable = isOnline && navigator.onLine;

      if (!onlineAvailable) {
        await executeOfflineSave();
      } else {
        try {
          const formData = new FormData();
          formData.append('photo', photo);
          extraPhotos.forEach((file, idx) => {
            formData.append(`extra_photo_${idx}`, file);
          });
          formData.append('usedMaterials', JSON.stringify(usedMaterials));
          formData.append('replacedMaterials', JSON.stringify([]));
          formData.append('vehicles', vehicles.join(','));
          formData.append('tools', selectedTools.join(','));
          formData.append('transformerNumber', trafo);
          formData.append('observation', obs);

          const response = await api.post(`/demands/${demandId}/finish`, formData);
          if (response.status >= 200 && response.status < 300) {
            successCount++;
          } else {
            throw new Error(`Status HTTP inválido: ${response.status}`);
          }
        } catch (err: any) {
          const isNetworkError = !err.response || err.code === 'ERR_NETWORK' || err.message?.includes('Network Error') || !navigator.onLine;
          if (isNetworkError) {
            console.warn(`[BatchCompletion] Connectivity lost during demand ${demandId}. Saving offline...`, err);
            await executeOfflineSave();
          } else {
            console.error(`[BatchCompletion] Failed to finish demand ${demandId}:`, err);
            // If already concluded or API error, log fail
            if (err.response?.data?.alreadyConcluded) {
              successCount++;
            } else {
              failCount++;
            }
          }
        }
      }
    }

    setIsSubmitting(false);
    setProgress(null);

    queryClient.invalidateQueries({ queryKey: ['demands'] });

    let summaryMessage = '';
    if (offlineCount > 0 && successCount === 0) {
      summaryMessage = `${offlineCount} demanda(s) salvas no modo offline de forma segura! Serão enviadas ao conectar.`;
    } else if (offlineCount > 0) {
      summaryMessage = `${successCount} enviadas online e ${offlineCount} salvas offline!`;
    } else if (failCount === 0) {
      summaryMessage = `Baixa em lote concluída com sucesso para todas as ${total} demandas!`;
    } else {
      summaryMessage = `Baixa concluída para ${successCount} demanda(s). ${failCount} apresentou erro.`;
    }

    setFeedback({ type: failCount === total ? 'error' : 'success', message: summaryMessage });

    setTimeout(() => {
      onSuccess();
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-3xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="bg-green-500/20 text-green-400 p-2.5 rounded-xl border border-green-500/30">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Dar Baixa em Lote ({selectedDemands.length})</h2>
              <p className="text-slate-400 text-xs mt-0.5">Finalize múltiplas ordens de serviço com 1 foto comprobatória</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-gray-800">
          {feedback && (
            <div className={`p-4 rounded-xl flex items-center gap-3 ${
              feedback.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {feedback.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
              <span className="text-sm font-medium">{feedback.message}</span>
            </div>
          )}

          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-900 text-xs flex items-start gap-3">
            <Package className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm">Baixa Automática com Consumo do Planejado</p>
              <p className="leading-relaxed">
                Os materiais utilizados de cada uma das <strong>{selectedDemands.length} demandas</strong> serão definidos exatamente como os materiais planejados (sem sobra e sem necessidade de digitação individual).
              </p>
            </div>
          </div>

          {/* Selected Demands Summary Accordion / List */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50">
            <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-700 uppercase">
              <span className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-gray-500" />
                Demandas Selecionadas ({selectedDemands.length})
              </span>
              <span className="text-gray-500 lowercase font-normal">baixa simultânea</span>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 p-2">
              {selectedDemands.map((demand, idx) => {
                const plannedCount = demand.plannedMaterials?.length || demand.formData?.materials?.length || demand.materials?.length || 0;
                return (
                  <div key={demand.id || idx} className="p-3 bg-white rounded-lg my-1 border border-gray-100 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-gray-900 truncate">{demand.location}</div>
                      <div className="text-gray-500 truncate">{demand.description}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold border border-blue-100">
                        <Package className="h-3 w-3" />
                        {plannedCount} mat. planejados
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <form id="batch-completion-form" onSubmit={handleSubmitBatch} className="space-y-6">
            {/* Main Photo Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-900 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Camera className="h-4 w-4 text-green-600" />
                  Foto Única Comprobatória do Serviço <span className="text-red-500">*</span>
                </span>
                <span className="text-xs text-gray-500 font-normal">Será vinculada a todas as demandas</span>
              </label>

              {photoPreview ? (
                <div className="relative rounded-2xl overflow-hidden border-2 border-green-500/40 bg-black aspect-video max-h-64 flex items-center justify-center group">
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <label className="bg-white text-gray-900 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-gray-100 transition-colors shadow-lg flex items-center gap-1">
                      <Camera className="h-4 w-4 text-gray-600" /> Alterar Foto
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="border-2 border-dashed border-gray-300 hover:border-green-500 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 bg-gray-50/50 hover:bg-green-50/30 transition-all cursor-pointer group">
                  <div className="p-3 bg-white rounded-full shadow-sm border border-gray-200 group-hover:scale-110 transition-transform">
                    <Upload className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-bold text-gray-800 block">Clique para carregar a foto do serviço</span>
                    <span className="text-xs text-gray-500">Tire uma foto do local ou painel para comprovar a realização</span>
                  </div>
                  <input type="file" accept="image/*" required className="hidden" onChange={handlePhotoChange} />
                </label>
              )}
            </div>

            {/* Additional Photos (Optional) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700">Fotos Adicionais (Opcional)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleExtraPhotosChange}
                className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
              />
              {extraPhotos.length > 0 && (
                <div className="text-xs text-gray-600 font-medium">
                  {extraPhotos.length} foto(s) extra(s) selecionada(s)
                </div>
              )}
            </div>

            {/* Common Equipment & Vehicles (Optional) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vehicles */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700 flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-blue-600" /> Veículos Utilizados
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-gray-50 border border-gray-200 rounded-xl">
                  {registeredVehicles && registeredVehicles.length > 0 ? (
                    registeredVehicles.map((v: any) => {
                      const label = `${v.model} (${v.plate})`;
                      const isSelected = vehicles.includes(label) || vehicles.includes(v.plate);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => toggleVehicle(label)}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                          {v.model} - {v.plate}
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-xs text-gray-400 p-2">Nenhum veículo cadastrado</span>
                  )}
                </div>
              </div>

              {/* Tools */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700 flex items-center gap-1.5">
                  <Wrench className="h-4 w-4 text-amber-600" /> Ferramentas Utilizadas
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-gray-50 border border-gray-200 rounded-xl">
                  {registeredTools && registeredTools.length > 0 ? (
                    registeredTools.map((t: any) => {
                      const isSelected = selectedTools.includes(t.name);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTool(t.name)}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                            isSelected
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                          {t.name}
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-xs text-gray-400 p-2">Nenhuma ferramenta cadastrada</span>
                  )}
                </div>
              </div>
            </div>

            {/* Transformer & Observations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nº do Transformador (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: TRAFO-1029"
                  value={trafo}
                  onChange={e => setTrafo(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Observações Gerais (Opcional)</label>
                <input
                  type="text"
                  placeholder="Observação referente ao lote..."
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Progress indicator while submitting */}
            {progress && (
              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-green-400" />
                    {progress.currentLabel}
                  </span>
                  <span className="text-green-400 font-mono">
                    {Math.round((progress.current / progress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-green-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="batch-completion-form"
            disabled={isSubmitting || !photo || selectedDemands.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-2 shadow-md cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando Lote...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Confirmar Baixa em Lote ({selectedDemands.length})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
