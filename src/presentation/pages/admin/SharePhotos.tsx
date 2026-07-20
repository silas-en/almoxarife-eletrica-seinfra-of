import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout.tsx';
import api from '../../services/api.ts';
import { Share2, Loader2, Calendar, Check, Play, ChevronRight, ChevronLeft, X, AlertCircle, Sparkles } from 'lucide-react';
import { formatLocalDate, parseUTCDate } from '../../utils/date.ts';
import { IndexedDbService } from '../../../infra/storage/indexedDbService.ts';
import ShareOptionsModal from '../../components/ShareOptionsModal.tsx';

export default function SharePhotos() {
  const [batchDate, setBatchDate] = useState(formatLocalDate(new Date(), 'yyyy-MM-dd'));
  const [isSharingBatch, setIsSharingBatch] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [activeShareData, setActiveShareData] = useState<{ title: string; text: string; photos: string[] } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const { data: demands, isLoading } = useQuery({
    queryKey: ['demands'],
    queryFn: async () => {
      try {
        const data = (await api.get('/demands')).data;
        await IndexedDbService.saveCachedDemands(data);
        return data;
      } catch (err) {
        console.warn('SharePhotos: Failed to fetch online demands. Loading cached...', err);
        return await IndexedDbService.getAllCachedDemands();
      }
    }
  });

  const batchDemands = (demands || []).filter((d: any) => {
    const isExecuted = d.status === 'CONCLUDED' || d.status === 'PENDING_APPROVAL';
    const hasPhotos = !!d.photoUrl;
    
    const demandDateObj = parseUTCDate(d.date);
    const filterDateObj = parseUTCDate(batchDate);
    const matchesDate = 
      demandDateObj.getFullYear() === filterDateObj.getFullYear() &&
      demandDateObj.getMonth() === filterDateObj.getMonth() &&
      demandDateObj.getDate() === filterDateObj.getDate();

    return isExecuted && hasPhotos && d.id && !d.id.startsWith('offline-') && matchesDate;
  });

  const [sharingDemandId, setSharingDemandId] = useState<string | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [batchShareStatuses, setBatchShareStatuses] = useState<Record<string, 'pending' | 'sharing' | 'done'>>({});
  const [isSendingAllAtOnce, setIsSendingAllAtOnce] = useState(false);

  const handleSendAllAtOnceClick = async () => {
    if (batchDemands.length === 0 || isSendingAllAtOnce) return;
    setIsSendingAllAtOnce(true);

    try {
      let message = `*DEMANDAS DO DIA ${formatLocalDate(batchDate, 'dd/MM/yyyy')}* 📋\n\n`;
      message += `📍 *Localidades Executadas:*\n`;
      batchDemands.forEach((d: any, idx: number) => {
        message += `${idx + 1}. *${d.location || 'Não informado'}*\n`;
      });
      message += `\n📸 *Fotos das Demandas:*\n`;
      
      const photoUrls: string[] = [];
      batchDemands.forEach((d: any) => {
        if (d.photoUrl) {
          const photos = d.photoUrl.split(',');
          photos.forEach((url: string, index: number) => {
            const trimmedUrl = url.trim();
            if (trimmedUrl) {
              const absoluteUrl = trimmedUrl.startsWith('http') 
                ? trimmedUrl 
                : `${window.location.origin}${trimmedUrl.startsWith('/') ? '' : '/'}${trimmedUrl}`;
              
              if (!photoUrls.includes(trimmedUrl)) {
                photoUrls.push(trimmedUrl);
              }
              message += `- Local "*${d.location}*" (Foto ${index + 1}): ${absoluteUrl}\n`;
            }
          });
        }
      });

      setActiveShareData({
        title: `FOTOS E LOCAIS - ${formatLocalDate(batchDate, 'dd/MM/yyyy')}`,
        text: message,
        photos: photoUrls
      });
    } catch (err) {
      console.error('Error sharing all photos at once:', err);
      showFeedback('error', 'Ocorreu um erro ao preparar o envio das fotos e locais.');
    } finally {
      setIsSendingAllAtOnce(false);
    }
  };

  const shareSpecificDemand = async (d: any, onCompleted?: () => void) => {
    try {
      const photos = d.photoUrl ? d.photoUrl.split(',') : [];
      let message = `📍 *Local:* ${d.location || 'Não informado'}\n\n`;
      
      if (photos.length > 0) {
        message += `📸 *Fotos do Serviço Executado:*\n`;
        photos.forEach((url: string, index: number) => {
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
        title: d.location || 'Demanda',
        text: message,
        photos
      });

      onCompleted?.();
      return true;
    } catch (err) {
      console.error('Error sharing single demand:', err);
      showFeedback('error', 'Ocorreu um erro ao preparar o compartilhamento desta demanda.');
      return false;
    }
  };

  const handleSingleShare = async (d: any) => {
    if (!d) return;
    await shareSpecificDemand(d);
  };

  const handleBatchShareClick = () => {
    if (batchDemands.length === 0) return;
    const initialStatuses: Record<string, 'pending' | 'sharing' | 'done'> = {};
    batchDemands.forEach((d: any) => {
      initialStatuses[d.id] = 'pending';
    });
    setBatchShareStatuses(initialStatuses);
    setCurrentBatchIndex(0);
    setIsBatchModalOpen(true);
  };

  return (
    <Layout>
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Share2 className="h-6 w-6 text-emerald-600" />
          Compartilhamento de Fotos em Lote
        </h1>
        <p className="text-sm text-gray-600">
          Como administrador, escolha um dia para buscar todas as fotos das demandas aprovadas/concluídas e compartilhá-las de forma direta.
        </p>
      </div>

      {feedback && (
        <div className={`p-4 mb-6 rounded-xl border text-sm font-bold ${
          feedback.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-700">Selecione a Data das Demandas:</span>
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
              <Calendar className="h-4 w-4 text-emerald-600" />
              <input
                type="date"
                className="p-1 border border-emerald-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer text-emerald-900 font-bold"
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
              />
            </div>
          </div>

          <div className="shrink-0 font-sans flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={handleBatchShareClick}
              disabled={batchDemands.length === 0}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:border-transparent text-white font-black text-xs uppercase px-5 py-2.5 rounded-xl transition-all hover:shadow-md cursor-pointer select-none active:scale-[0.98] disabled:cursor-not-allowed"
            >
              <Share2 className="h-4 w-4" />
              Enviar em Lote sem Links ({batchDemands.length})
            </button>

            <button
              type="button"
              onClick={handleSendAllAtOnceClick}
              disabled={batchDemands.length === 0 || isSendingAllAtOnce}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-750 disabled:bg-gray-200 disabled:text-gray-400 disabled:border-transparent text-white font-black text-xs uppercase px-5 py-2.5 rounded-xl transition-all hover:shadow-md cursor-pointer select-none active:scale-[0.98] disabled:cursor-not-allowed"
            >
              {isSendingAllAtOnce ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando mídias...
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" />
                  Enviar todas fotos de uma vez
                </>
              )}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : batchDemands.length === 0 ? (
          <div className="text-center py-12 text-sm font-medium text-gray-500 border border-dashed border-gray-100 rounded-xl">
            Nenhuma demanda executada/concluída com fotos para {formatLocalDate(batchDate, 'dd/MM/yyyy')}.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 text-xs text-emerald-800 flex flex-col gap-1.5 shadow-sm">
              <span className="font-extrabold uppercase flex items-center gap-1">
                💡 Como funciona o Envio de Fotos e Locais
              </span>
              <div className="space-y-2 mt-1">
                <p>
                  1. <strong>Enviar em Lote sem Links (Sequencial)</strong>: Abre o assistente passo-a-passo para você enviar cada local individualmente seguido diretamente de suas respectivas fotos (sem links).
                </p>
                <p>
                  2. <strong>Enviar todas fotos de uma vez</strong>: Compila a lista de todas as localidades da data no topo da mensagem e anexa todas as mídias juntas para o envio de uma só vez.
                </p>
              </div>
            </div>

            <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              📸 {batchDemands.length} {batchDemands.length === 1 ? 'Demanda com foto encontrada' : 'Demandas com fotos encontradas'}:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {batchDemands.map((d: any) => {
                const photos = d.photoUrl ? d.photoUrl.split(',') : [];
                const isSingleSharing = sharingDemandId === d.id;
                return (
                  <div key={d.id} className="bg-gray-50/50 border border-gray-100 p-4 rounded-xl flex flex-col gap-3 relative shadow-sm hover:border-emerald-300 hover:shadow transition-all duration-200">
                    <div className="flex items-start justify-between gap-1.5 pb-2 border-b border-gray-100/60">
                      <div className="space-y-0.5">
                        <span className="text-xs text-gray-500 font-bold block uppercase tracking-wide">Local</span>
                        <span className="text-sm font-bold text-gray-900 block truncate max-w-[180px]" title={d.location}>
                          📍 {d.location}
                        </span>
                      </div>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-black uppercase shrink-0">
                        {photos.length} {photos.length === 1 ? 'Foto' : 'Fotos'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] text-gray-400 font-bold block uppercase">Visualização direta</span>
                      <div className="flex gap-2 overflow-x-auto py-1">
                        {photos.map((url: string, idx: number) => (
                          <img 
                            key={idx} 
                            src={url.trim()} 
                            alt={`Demanda ${idx + 1}`} 
                            className="w-16 h-16 object-cover rounded-lg border border-gray-200 shrink-0 shadow-sm hover:scale-105 transition-transform" 
                          />
                        ))}
                      </div>
                    </div>

                    <div className="mt-auto pt-2 border-t border-gray-100/60">
                      <button
                        type="button"
                        onClick={() => handleSingleShare(d)}
                        disabled={!!sharingDemandId || isBatchModalOpen}
                        className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:border-transparent text-white font-black text-[11px] uppercase py-2 rounded-xl transition-all hover:shadow-md cursor-pointer select-none active:scale-[0.98] disabled:cursor-not-allowed"
                      >
                        {isSingleSharing ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Preparando...
                          </>
                        ) : (
                          <>
                            <Share2 className="h-3 w-3" />
                            Compartilhar Demanda
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sequential Batch Sharing Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh] border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-100" />
                <div>
                  <h3 className="font-bold text-base">Assistente de Envio em Lote</h3>
                  <p className="text-[10px] text-emerald-100 uppercase tracking-widest font-semibold">Sem links • Envio de mídias direto</p>
                </div>
              </div>
              <button 
                onClick={() => setIsBatchModalOpen(false)}
                className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Explanatory banner */}
            <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-3.5 text-xs text-emerald-800 flex items-start gap-2.5 shrink-0">
              <AlertCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Para enviar cada local acompanhado das suas respectivas fotos diretamente (sem links), as diretrizes de privacidade exigem que o compartilhamento de mídias de cada local seja acionado individualmente. <strong>Clique no botão Enviar verde</strong> para cada item abaixo na sequência.
              </p>
            </div>

            {/* List / Queue */}
            <div className="p-6 overflow-y-auto space-y-3 flex-1 bg-gray-50/50">
              {batchDemands.map((d: any, idx: number) => {
                const photosCount = d.photoUrl ? d.photoUrl.split(',').length : 0;
                const status = batchShareStatuses[d.id] || 'pending';
                const isActive = idx === currentBatchIndex;
                const isPast = idx < currentBatchIndex;

                let rowBg = 'bg-white border-gray-200 opacity-60';
                let statusBadge = (
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Aguardando</span>
                );

                if (isActive) {
                  rowBg = 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20 opacity-100';
                  statusBadge = (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">Em Envio</span>
                  );
                } else if (status === 'done' || isPast) {
                  rowBg = 'bg-gray-50 border-gray-100 opacity-75';
                  statusBadge = (
                    <span className="text-[10px] bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                      <Check className="h-3 w-3" /> Enviado
                    </span>
                  );
                } else if (status === 'sharing') {
                  rowBg = 'bg-yellow-50/50 border-yellow-200 opacity-100';
                  statusBadge = (
                    <span className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-105 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Preparando...
                    </span>
                  );
                }

                return (
                  <div 
                    key={d.id} 
                    className={`border px-4 py-3 rounded-xl transition-all duration-200 flex items-center justify-between gap-4 ${rowBg}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                        isActive ? 'bg-emerald-600 text-white' : isPast ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {idx + 1}
                      </div>

                      <div className="truncate">
                        <span className="text-xs font-bold text-gray-800 block truncate">📍 {d.location || 'Sem local'}</span>
                        <span className="text-[10px] text-gray-500 font-bold block">{photosCount} {photosCount === 1 ? 'foto anexada' : 'fotos anexadas'}</span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {statusBadge}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Control Panel */}
            {currentBatchIndex < batchDemands.length ? (
              <div className="p-6 bg-white border-t border-gray-100 space-y-4 shrink-0">
                <div className="flex items-center justify-between text-xs text-gray-500 font-bold">
                  <span>Passo {currentBatchIndex + 1} de {batchDemands.length}</span>
                  <span>{Math.round((currentBatchIndex / batchDemands.length) * 100)}% concluído</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-150 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${(currentBatchIndex / batchDemands.length) * 100}%` }}
                  />
                </div>

                <div className="flex items-center gap-2 pt-1 font-sans">
                  {currentBatchIndex > 0 && (
                    <button
                      type="button"
                      onClick={() => setCurrentBatchIndex(prev => prev - 1)}
                      className="px-3 py-3 border border-gray-200 hover:border-gray-300 text-gray-600 rounded-xl transition-all font-bold text-xs uppercase cursor-pointer select-none active:scale-95"
                    >
                      Voltar
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      const activeDemand = batchDemands[currentBatchIndex];
                      if (!activeDemand) return;
                      
                      setBatchShareStatuses(prev => ({ ...prev, [activeDemand.id]: 'sharing' }));
                      const success = await shareSpecificDemand(activeDemand, () => {
                        setBatchShareStatuses(prev => ({ ...prev, [activeDemand.id]: 'done' }));
                        if (currentBatchIndex < batchDemands.length - 1) {
                          setCurrentBatchIndex(prev => prev + 1);
                        } else {
                          // Final index completed
                          setCurrentBatchIndex(prev => prev + 1);
                        }
                      });

                      if (!success) {
                        setBatchShareStatuses(prev => ({ ...prev, [activeDemand.id]: 'pending' }));
                      }
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase py-3.5 px-4 rounded-xl transition-all hover:shadow cursor-pointer select-none active:scale-[0.98]"
                  >
                    <Share2 className="h-4 w-4" />
                    Enviar {currentBatchIndex + 1}º Endereço + Fotos
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const activeDemand = batchDemands[currentBatchIndex];
                      setBatchShareStatuses(prev => ({ ...prev, [activeDemand.id]: 'done' }));
                      setCurrentBatchIndex(prev => prev + 1);
                    }}
                    className="px-3 py-3 border border-dashed border-gray-200 hover:border-emerald-300 text-gray-500 hover:text-emerald-700 bg-gray-50 hover:bg-emerald-50 rounded-xl transition-all font-bold text-xs uppercase cursor-pointer select-none active:scale-95"
                    title="Pular esta demanda sem enviar"
                  >
                    Pular
                  </button>
                </div>
              </div>
            ) : (
              // All sent!
              <div className="p-6 bg-white border-t border-gray-100 text-center space-y-4 shrink-0">
                <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto border border-green-200 shadow-sm">
                  <Check className="h-6 w-6 font-bold" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-base text-gray-900">Tudo Enviado!</h4>
                  <p className="text-xs text-gray-500">Todas as demandas do lote foram compartilhadas em sequência direta com as fotos reais.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="w-full inline-flex items-center justify-center bg-gray-950 hover:bg-gray-800 text-white font-black text-xs uppercase py-3 rounded-xl transition-all cursor-pointer select-none active:scale-98"
                >
                  Concluir e Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
