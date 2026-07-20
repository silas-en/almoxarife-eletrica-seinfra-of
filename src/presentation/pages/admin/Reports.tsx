import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout.tsx';
import api from '../../services/api.ts';
import { 
  FileText, Download, Calendar, Loader2, User, LayoutDashboard, 
  List, BarChart3, TrendingUp, History, Save, CheckCircle2, Search,
  ChevronRight, ArrowRight, Trash2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatLocalDate } from '../../utils/date.ts';

type ReportRange = 'weekly' | 'monthly' | 'yearly';

export default function Reports() {
  const [range, setRange] = useState<ReportRange>('weekly');
  const [viewingPeriod, setViewingPeriod] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: periods, isLoading: isLoadingPeriods } = useQuery({
    queryKey: ['available-periods', range],
    queryFn: async () => (await api.get(`/reports/periods?range=${range}`)).data,
  });

  const { data: report, isLoading: isLoadingReport } = useQuery({
    queryKey: ['report', range, viewingPeriod],
    queryFn: async () => (await api.get(`/reports/data?range=${range}&date=${viewingPeriod}`)).data,
    enabled: !!viewingPeriod,
  });

  const { data: history } = useQuery({
    queryKey: ['reports-history'],
    queryFn: async () => (await api.get('/reports/history')).data,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!report) return;
      const { start, end, referenceDate } = report.period;
      // Convert DD/MM/YYYY to ISO for the backend
      const [startDay, startMonth, startYear] = start.split('/');
      const [endDay, endMonth, endYear] = end.split('/');
      
      await api.post('/reports/save', {
        type: range.toUpperCase(),
        startDate: new Date(`${startYear}-${startMonth}-${startDay}`).toISOString(),
        endDate: new Date(`${endYear}-${endMonth}-${endDay}`).toISOString(),
        referenceDate
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report'] });
      queryClient.invalidateQueries({ queryKey: ['reports-history'] });
      queryClient.invalidateQueries({ queryKey: ['available-periods'] });
    }
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports-history'] });
      queryClient.invalidateQueries({ queryKey: ['available-periods'] });
      setConfirmDeleteId(null);
    }
  });

  const handleDownload = async (formatType: 'pdf' | 'docx') => {
    if (!report) return;
    try {
      const { start, end } = report.period;
      const response = await api.get(`/reports/download/${formatType}?start=${start}&end=${end}&range=${range}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `relatorio_${range}_${start.replace(/\//g, '-')}.${formatType}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error(`Erro ao baixar ${formatType}:`, error);
      alert('Erro ao gerar o arquivo. Verifique se você tem permissão.');
    }
  };

  const getRangeTitle = () => {
    switch (range) {
      case 'weekly': return 'Semanal';
      case 'monthly': return 'Mensal';
      case 'yearly': return 'Anual';
      default: return '';
    }
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inteligência de Almoxarifado</h1>
          <p className="text-gray-600">Relatórios auditáveis e dashboards de performance.</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              setViewingPeriod(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
              showHistory ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <History className="h-4 w-4" />
            {showHistory ? 'Voltar para Dashboard' : 'Ver Histórico'}
          </button>

          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            {(['weekly', 'monthly', 'yearly'] as ReportRange[]).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRange(r);
                  setShowHistory(false);
                  setViewingPeriod(null);
                }}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                  range === r && !showHistory ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {r === 'weekly' ? 'Semanal' : r === 'monthly' ? 'Mensal' : 'Anual'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!showHistory && !viewingPeriod && (
        <div className="flex flex-col md:flex-row gap-4 mb-8 bg-blue-50 p-4 rounded-2xl border border-blue-100">
          <TrendingUp className="h-5 w-5 text-blue-600 mt-1 shrink-0" />
          <div>
            <h4 className="font-bold text-blue-900 text-sm">Painel de Auditoria Ativo</h4>
            <p className="text-blue-700 text-xs mt-0.5">Selecione uma semana ou mês abaixo para analisar detalhadamente o consumo de materiais e o desempenho da equipe.</p>
          </div>
        </div>
      )}

      {!showHistory && viewingPeriod && (
        <div className="flex flex-col md:flex-row gap-4 mb-8 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex-1 flex items-center gap-4">
             <button 
                onClick={() => setViewingPeriod(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
              >
                <ChevronRight className="h-6 w-6 rotate-180" />
              </button>
             <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-0.5">Período Selecionado</label>
                <p className="font-bold text-gray-900">{report?.period.start || '...'} — {report?.period.end || '...'}</p>
             </div>
          </div>
          
          <div className="flex items-end justify-between md:min-w-[200px]">
            <div className="hidden md:block border-l border-gray-100 h-10 mx-4" />
            {report?.isSaved ? (
              <div className="flex items-center gap-2 text-green-600 font-bold text-sm px-4 py-2 rounded-xl bg-green-50">
                <CheckCircle2 className="h-4 w-4" />
                Relatório Arquivado
              </div>
            ) : (
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || isLoadingReport}
                className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Arquivar Relatório
              </button>
            )}
          </div>
        </div>
      )}

      {showHistory ? (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <History className="h-5 w-5 text-gray-400" />
            Histórico de Relatórios Arquivados
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {history?.map((h: any) => (
              <div key={h.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:border-blue-200 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    h.type === 'WEEKLY' ? 'bg-blue-100 text-blue-700' : 
                    h.type === 'MONTHLY' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {h.type === 'WEEKLY' ? 'Semanal' : h.type === 'MONTHLY' ? 'Mensal' : 'Anual'}
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold">
                    Arquivado em: {formatLocalDate(h.createdAt, 'dd/MM/yy HH:mm')}
                  </span>
                </div>
                
                <p className="text-sm font-extrabold text-gray-900 mb-2">
                  Período: {formatLocalDate(h.startDate, 'dd/MM/yyyy')} — {formatLocalDate(h.endDate, 'dd/MM/yyyy')}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-6">
                  <User className="h-3 w-3" />
                  Gerado por: {h.generatedBy?.name}
                </div>

                  <div className="flex items-center gap-2">
                    {confirmDeleteId === h.id ? (
                      <div className="flex-1 flex items-center justify-between bg-red-50 p-2 rounded-lg border border-red-100">
                        <span className="text-[10px] font-bold text-red-700">Confirmar exclusão?</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => deleteMutation.mutate(h.id)}
                            className="px-2 py-1 bg-red-600 text-white text-[10px] font-extrabold rounded"
                          >
                            Excluir
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 bg-gray-200 text-gray-700 text-[10px] font-extrabold rounded"
                          >
                            X
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setViewingPeriod(h.referenceDate);
                            setRange(h.type.toLowerCase() as ReportRange);
                            setShowHistory(false);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-50 text-gray-600 rounded-lg text-xs font-bold hover:bg-blue-50 hover:text-blue-600 transition-all"
                        >
                          Ver Dashboard
                          <ArrowRight className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(h.id)}
                          disabled={deleteMutation.isPending}
                          className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all disabled:opacity-50"
                          title="Excluir Relatório"
                        >
                          {deleteMutation.isPending && confirmDeleteId === h.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
              </div>
            ))}
            {(!history || history.length === 0) && (
              <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100 flex flex-col items-center justify-center">
                <History className="h-10 w-10 text-gray-100 mb-4" />
                <p className="text-gray-400 font-medium text-sm">Nenhum relatório arquivado ainda.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <span className="text-sm font-bold text-gray-500 uppercase">Demandas</span>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">
                {viewingPeriod ? (report?.demandsCount ?? 0) : (periods?.reduce((sum: number, p: any) => sum + p.demandCount, 0) || 0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {viewingPeriod ? `Concluídas no período ${getRangeTitle().toLowerCase()}` : `Total acumulado (${getRangeTitle().toLowerCase()})`}
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-100 rounded-lg text-green-600">
                  <User className="h-5 w-5" />
                </div>
                <span className="text-sm font-bold text-gray-500 uppercase">Equipe Ativa</span>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{viewingPeriod ? Object.keys(report?.data || {}).length : '-'}</p>
              <p className="text-xs text-gray-400 mt-1">Eletricistas em campo</p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                  <Calendar className="h-5 w-5" />
                </div>
                <span className="text-sm font-bold text-gray-500 uppercase">Intervalos</span>
              </div>
              <p className="text-sm font-bold text-gray-900">{periods?.length || 0} Períodos</p>
              <p className="text-xs text-gray-400 mt-1">Desde a primeira demanda</p>
            </div>

            <div className="bg-blue-600 p-6 rounded-2xl shadow-lg flex flex-col justify-between">
              <span className="text-xs font-bold text-blue-100 uppercase">Versão para Exportação</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload('pdf')}
                  disabled={!report || !viewingPeriod}
                  className="flex-1 bg-white text-blue-600 py-2 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  PDF
                </button>
                <button
                  onClick={() => handleDownload('docx')}
                  disabled={!report || !viewingPeriod}
                  className="flex-1 bg-blue-700 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-800 transition-colors disabled:opacity-50"
                >
                  Word
                </button>
              </div>
            </div>
          </div>

          {(isLoadingPeriods || (viewingPeriod && isLoadingReport)) ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
              <p className="text-gray-500">Consolidando indicadores {getRangeTitle().toLowerCase()}s...</p>
            </div>
          ) : !viewingPeriod ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                 <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <History className="h-5 w-5 text-gray-400" />
                    Registros Disponíveis
                 </h3>
                 <p className="text-xs font-bold text-gray-400 uppercase">Listando todos desde a primeira demanda</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {periods?.map((p: any) => (
                  <div 
                    key={`${p.start}-${p.end}`}
                    onClick={() => setViewingPeriod(p.referenceDate)}
                    className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                  >
                    {p.isSaved && (
                       <div className="absolute top-0 right-0 p-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                       </div>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                       <Calendar className="h-4 w-4 text-gray-400" />
                       <span className="text-[10px] font-bold text-gray-400 uppercase">{getRangeTitle()}</span>
                    </div>
                    <p className="text-lg font-extrabold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {p.start} — {p.end}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                       <div className="flex items-center gap-1.5">
                          <TrendingUp className="h-3 w-3 text-blue-500" />
                          <span className="text-xs font-bold text-gray-600">{p.demandCount} Demandas</span>
                       </div>
                       <div className="flex items-center gap-1 text-blue-600 font-bold text-xs">
                          Analisar
                          <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <List className="h-5 w-5 text-gray-400" />
                    Auditoria Detalhada
                  </h3>
                  <button 
                    onClick={() => setViewingPeriod(null)}
                    className="text-sm font-bold text-blue-600 hover:underline"
                  >
                    Voltar para lista
                  </button>
                </div>

                {Object.entries(report?.data || {}).map(([name, demands]: [string, any]) => (
                  <div key={name} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center">
                      <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold mr-4">
                        {name.charAt(0)}
                      </div>
                      <h4 className="font-bold text-gray-900">{name}</h4>
                      <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">
                        {demands.length} {demands.length === 1 ? 'Demanda' : 'Demandas'}
                      </span>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {demands.map((d: any) => (
                          <div key={d.id} className="p-4 rounded-xl border border-gray-100 hover:border-blue-200 bg-gray-50/30 transition-all space-y-3 group">
                            <div className="flex justify-between items-start">
                              <p className="text-xs font-bold text-blue-600">{formatLocalDate(d.date, 'dd/MM/yyyy')}</p>
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded uppercase">FEITO</span>
                            </div>
                            <p className="text-sm font-bold text-gray-900 line-clamp-2 min-h-[40px] group-hover:text-blue-700 transition-colors">{d.location}</p>
                            
                            <div className="pt-2 border-t border-gray-100">
                              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Materiais Impactados</p>
                              <div className="flex flex-wrap gap-1">
                                {d.usedMaterials?.slice(0, 2).map((m: any) => (
                                  <span key={m.id} className="text-[10px] bg-white border border-gray-100 px-2 py-1 rounded-lg text-gray-600">
                                    {m.quantity}x {m.material.name}
                                  </span>
                                ))}
                                {d.usedMaterials?.length > 2 && (
                                  <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold">
                                    +{d.usedMaterials.length - 2}
                                  </span>
                                )}
                                {(!d.usedMaterials || d.usedMaterials.length === 0) && (
                                   <span className="text-[10px] text-gray-400 italic">Nenhum material utilizado</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {report?.recovered && report.recovered.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 bg-green-50/50 border-b border-green-100 flex items-center">
                      <div className="h-10 w-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold mr-4">
                        R
                      </div>
                      <h4 className="font-bold text-gray-900">Materiais Recuperados em Campo</h4>
                      <span className="ml-auto bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">
                        {report.recovered.length} Itens
                      </span>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {report.recovered.map((m: any) => (
                          <div key={m.id} className="p-4 rounded-xl border border-green-100 bg-green-50/20">
                            <p className="text-[10px] font-bold text-green-600 uppercase mb-1">{formatLocalDate(m.date, 'dd/MM/yyyy')}</p>
                            <p className="text-sm font-bold text-gray-900">{m.material?.name || m.materialName}</p>
                            <p className="text-xl font-black text-green-700 mt-1">{m.quantity} <span className="text-xs font-normal">{m.material?.unit || 'un'}</span></p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {Object.keys(report?.data || {}).length === 0 && (!report?.recovered || report.recovered.length === 0) && (
                  <div className="bg-white py-20 rounded-2xl border border-dashed border-gray-200 text-center">
                    <Search className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400 font-medium">Nenhum dado consolidado para este período.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
