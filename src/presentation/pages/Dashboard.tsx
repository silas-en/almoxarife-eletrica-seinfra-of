import { useAuth } from '../context/AuthContext.tsx';
import Layout from '../components/Layout.tsx';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import api from '../services/api.ts';
import { ClipboardList, CheckCircle, Clock, AlertTriangle, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ptBR } from 'date-fns/locale';
import { parseUTCDate, formatLocalDate } from '../utils/date.ts';
import { IndexedDbService } from '../../infra/storage/indexedDbService.ts';

export default function Dashboard() {
  const { user } = useAuth();
  
  const { data: demands, isLoading } = useQuery({
    queryKey: ['demands'],
    queryFn: async () => {
      try {
        const resp = await api.get('/demands');
        if (resp.data) {
          await IndexedDbService.saveCachedDemands(resp.data);
          return resp.data;
        }
      } catch (err) {
        console.warn('Dashboard: Failed to fetch demands. Loading offline cache...', err);
        return await IndexedDbService.getAllCachedDemands();
      }
      return await IndexedDbService.getAllCachedDemands();
    }
  });

  const [activeTab, setActiveTab] = useState<'PENDING' | 'PENDING_APPROVAL' | 'CONCLUDED'>('PENDING');

  const currentYear = new Date().getFullYear();
  const yearDemands = demands?.filter((d: any) => {
    if (!d.date) return false;
    return parseUTCDate(d.date).getFullYear() === currentYear;
  });

  const stats = [
    { name: 'Pendentes', value: yearDemands?.filter((d: any) => d.status === 'PENDING').length || 0, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    { name: 'Em Aprovação', value: yearDemands?.filter((d: any) => d.status === 'PENDING_APPROVAL').length || 0, icon: AlertTriangle, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: 'Executadas', value: yearDemands?.filter((d: any) => d.status === 'CONCLUDED').length || 0, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
  ];

  const filteredDemands = yearDemands?.filter((d: any) => {
    return d.status === activeTab;
  }) || [];

  if (activeTab === 'CONCLUDED') {
    filteredDemands.sort((a: any, b: any) => {
      const dateA = parseUTCDate(a.date).getTime();
      const dateB = parseUTCDate(b.date).getTime();
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      const nameA = a.location || '';
      const nameB = b.location || '';
      const comp = nameA.localeCompare(nameB);
      if (comp !== 0) return comp;
      const descA = a.description || '';
      const descB = b.description || '';
      return descA.localeCompare(descB);
    });
  }

  const isAdmin = user?.role === 'ADMIN';

  // Find priority alert demands for admins
  const priorityAlerts = demands?.filter((d: any) => {
    if (!d.isPriority || !d.priorityExecutionDate || d.status === 'CONCLUDED') return false;

    const executionDate = parseUTCDate(d.priorityExecutionDate);
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffMs = executionDate.getTime() - todayMidnight.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    return diffDays === 0 || diffDays === 1;
  }).map((d: any) => {
    const executionDate = parseUTCDate(d.priorityExecutionDate);
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffMs = executionDate.getTime() - todayMidnight.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    return {
      ...d,
      alertDays: diffDays
    };
  }) || [];

  const [currentAlertIndex, setCurrentAlertIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (currentAlertIndex >= priorityAlerts.length) {
      setCurrentAlertIndex(0);
    }
  }, [priorityAlerts.length, currentAlertIndex]);

  useEffect(() => {
    if (priorityAlerts.length <= 1 || isHovered) return;

    const interval = setInterval(() => {
      setCurrentAlertIndex((prev) => (prev + 1) % priorityAlerts.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [priorityAlerts.length, isHovered]);

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Olá, {user?.name}</h1>
        <p className="text-gray-600">Bem-vindo ao sistema de gestão do almoxarifado.</p>
      </div>

      {/* Alert Banner for Priority Demands (Admins Only) */}
      {isAdmin && priorityAlerts.length > 0 && (
        <div className="mb-6">
          {priorityAlerts.length === 1 ? (
            // Single priority alert (no carousel needed)
            (() => {
              const alert = priorityAlerts[0];
              const isToday = alert.alertDays === 0;
              const bgColor = isToday ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-amber-50 border-amber-200 text-amber-900';
              const iconBg = isToday ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600';
              const btnColor = isToday ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white';
              const badgeColor = isToday ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800';

              return (
                <div 
                  key={alert.id} 
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-all animate-in fade-in-50 duration-300 ${bgColor}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}>
                      <AlertTriangle className="h-5 w-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-xs tracking-wider uppercase">
                          {isToday ? '⚠️ ATENÇÃO: EXECUÇÃO HOJE' : '⏰ ATENÇÃO: AMANHÃ'}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${badgeColor}`}>
                          Prioridade Máxima
                        </span>
                      </div>
                      <h4 className="font-bold text-sm mt-1">{alert.location}</h4>
                      <p className="text-xs opacity-90 line-clamp-1 mt-0.5">{alert.description}</p>
                    </div>
                  </div>
                  <Link 
                    to={`/demands/${alert.id}`} 
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all shadow-sm shrink-0 self-start sm:self-center text-center cursor-pointer ${btnColor}`}
                  >
                    Acessar Demanda
                  </Link>
                </div>
              );
            })()
          ) : (
            // Carousel for Multiple Priority Alerts
            (() => {
              const activeIndex = currentAlertIndex >= priorityAlerts.length ? 0 : currentAlertIndex;
              const alert = priorityAlerts[activeIndex];
              const isToday = alert.alertDays === 0;
              const bgColor = isToday ? 'bg-rose-50 border-rose-200 text-rose-900 animate-in fade-in-50 duration-500' : 'bg-amber-50 border-amber-200 text-amber-900 animate-in fade-in-50 duration-500';
              const iconBg = isToday ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600';
              const btnColor = isToday ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white';
              const badgeColor = isToday ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800';
              const controlHoverBg = isToday ? 'hover:bg-rose-100/85 text-rose-700' : 'hover:bg-amber-100/85 text-amber-700';

              return (
                <div 
                  className={`p-4 rounded-xl border flex flex-col gap-3 shadow-md relative group/carousel transition-all duration-300 min-h-[140px] sm:min-h-[100px] overflow-hidden ${bgColor}`}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-20 sm:pr-24">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}>
                        <AlertTriangle className="h-5 w-5 animate-pulse" />
                      </div>
                      
                      {/* Content (keyed to animate transition) */}
                      <div key={alert.id} className="animate-in fade-in slide-in-from-right-2 duration-300">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-[11px] tracking-wider uppercase">
                            {isToday ? '⚠️ ATENÇÃO: EXECUÇÃO HOJE' : '⏰ ATENÇÃO: AMANHÃ'}
                          </span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${badgeColor}`}>
                            Prioritária ({activeIndex + 1}/{priorityAlerts.length})
                          </span>
                        </div>
                        <h4 className="font-bold text-sm mt-1">{alert.location}</h4>
                        <p className="text-xs opacity-90 line-clamp-1 mt-0.5">{alert.description}</p>
                      </div>
                    </div>

                    {/* CTA link */}
                    <Link 
                      to={`/demands/${alert.id}`} 
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all shadow-sm shrink-0 self-start sm:self-center text-center cursor-pointer ${btnColor}`}
                    >
                      Acessar Demanda
                    </Link>
                  </div>

                  {/* Manual Controls */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-white/60 hover:bg-white/90 transition-all border border-black/5 p-1 rounded-lg shadow-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentAlertIndex((prev) => (prev - 1 + priorityAlerts.length) % priorityAlerts.length);
                      }}
                      className={`p-1 rounded-md transition-colors cursor-pointer ${controlHoverBg}`}
                      title="Slide Anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentAlertIndex((prev) => (prev + 1) % priorityAlerts.length);
                      }}
                      className={`p-1 rounded-md transition-colors cursor-pointer ${controlHoverBg}`}
                      title="Próximo Slide"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Dot Indicators */}
                  <div className="flex justify-center items-center gap-1.5 mt-1.5 border-t border-black/[0.03] pt-2">
                    {priorityAlerts.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCurrentAlertIndex(idx)}
                        className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                          idx === activeIndex 
                            ? (isToday ? 'w-4 bg-rose-600' : 'w-4 bg-amber-600') 
                            : (isToday ? 'w-1.5 bg-rose-200/80 hover:bg-rose-300' : 'w-1.5 bg-amber-200/80 hover:bg-amber-300')
                        }`}
                        title={`Mostrar item ${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
            <div className={`p-3 rounded-lg ${stat.bg} ${stat.color} mr-4`}>
              <stat.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase">{stat.name}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setActiveTab('PENDING')}
              className={`pb-1 text-lg font-bold transition-colors ${
                activeTab === 'PENDING' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Pendentes
            </button>
            <button
              onClick={() => setActiveTab('PENDING_APPROVAL')}
              className={`pb-1 text-lg font-bold transition-colors ${
                activeTab === 'PENDING_APPROVAL' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Em Aprovação
            </button>
            <button
              onClick={() => setActiveTab('CONCLUDED')}
              className={`pb-1 text-lg font-bold transition-colors ${
                activeTab === 'CONCLUDED' ? 'border-b-2 border-green-600 text-green-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Executadas
            </button>
          </div>
          <Link to={user?.role === 'ADMIN' ? '/admin/demands' : '/'} className="text-blue-600 text-sm font-medium hover:underline">
            Ver tudo
          </Link>
        </div>
        
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Carregando demandas...</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredDemands?.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nenhuma demanda encontrada nesta categoria.</div>
            ) : (
              filteredDemands?.map((demand: any) => (
                <Link 
                  key={demand.id} 
                  to={`/demands/${demand.id}`}
                  className="block p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-gray-900">{demand.location}</h3>
                        {demand.isPriority && (
                          <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border border-amber-200 shrink-0">
                            <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                            Prioritária ({demand.priorityExecutionDate ? formatLocalDate(demand.priorityExecutionDate, 'dd/MM/yyyy') : ''})
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm line-clamp-1">{demand.description}</p>
                      <div className="flex items-center mt-2 text-xs text-gray-500 space-x-4">
                        <span className="flex items-center">
                          <ClipboardList className="h-3 w-3 mr-1" />
                          {formatLocalDate(demand.date, "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        {user?.role === 'ADMIN' && (
                          <div className="flex gap-1">
                            {demand.electricians && demand.electricians.length > 0 ? (
                              demand.electricians.map((e: any) => (
                                <span key={e.id} className="bg-gray-100 px-2 py-0.5 rounded uppercase text-[10px]">{e.name}</span>
                              ))
                            ) : (
                               <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded uppercase text-[10px] font-bold border border-red-100 animate-pulse">Não atribuída!</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <StatusBadge status={demand.status} isOfflineCompleted={demand.isOfflineCompleted} />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function StatusBadge({ status, isOfflineCompleted }: { status: string; isOfflineCompleted?: boolean }) {
  if (isOfflineCompleted) {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 animate-pulse flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>
        Sincronizando...
      </span>
    );
  }

  const configs: any = {
    PENDING: { color: 'bg-yellow-100 text-yellow-800', label: 'Pendente' },
    PENDING_APPROVAL: { color: 'bg-blue-100 text-blue-800', label: 'Em Aprovação' },
    CONCLUDED: { color: 'bg-green-100 text-green-800', label: 'Executada' },
  };

  const config = configs[status] || { color: 'bg-gray-100 text-gray-800', label: status };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${config.color}`}>
      {config.label}
    </span>
  );
}
