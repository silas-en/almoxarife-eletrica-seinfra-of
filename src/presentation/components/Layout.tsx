import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useOffline } from '../context/OfflineContext.tsx';
import { 
  Users, 
  Package, 
  ClipboardList, 
  FileText, 
  LogOut, 
  Menu, 
  X, 
  Home,
  CheckCircle,
  Truck,
  Ruler,
  Clock,
  RotateCw,
  Wrench,
  Shield,
  RotateCcw,
  Layers,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  Share2
} from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { isOnline, pendingCount, syncState, syncNow, syncErrorMsg } = useOffline();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const menuItems = user?.role === 'ADMIN' ? [
    { name: 'Início', path: '/', icon: Home },
    { name: 'Demandas', path: '/admin/demands', icon: ClipboardList },
    { name: 'Compartilhar Fotos', path: '/admin/share-photos', icon: Share2 },
    { name: 'Kits para Separação', path: '/admin/separation', icon: Layers },
    { name: 'Materiais', path: '/admin/materials', icon: Package },
    { name: 'Sobras a Retornar', path: '/admin/pending-returns', icon: RotateCcw },
    { name: 'Materiais Emprestados', path: '/admin/borrowed', icon: Clock },
    { name: 'Materiais Recuperados', path: '/admin/recovered', icon: RotateCw },
    { name: 'Veículos', path: '/admin/vehicles', icon: Truck },
    { name: 'Ferramentas', path: '/admin/tools', icon: Wrench },
    { name: 'EPIs & Equipamentos', path: '/admin/equipments', icon: Shield },
    { name: 'Carregar CIs', path: '/admin/cis', icon: FileText },
    { name: 'Usuários', path: '/admin/users', icon: Users },
    { name: 'Relatórios', path: '/admin/reports', icon: FileText },
  ] : [
    { name: 'Minhas Demandas', path: '/', icon: ClipboardList },
    { name: 'Kits para Separação', path: '/admin/separation', icon: Layers },
    { name: 'Sobras a Retornar', path: '/admin/pending-returns', icon: RotateCcw },
    { name: 'EPIs & Equipamentos', path: '/admin/equipments', icon: Shield },
    { name: 'Carregar CIs', path: '/admin/cis', icon: FileText },
  ];

  const activeItem = menuItems.find(item => item.path === location.pathname);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: 'url(https://i.postimg.cc/PrrM4HxN/Serrinha-Image.png)',
              filter: 'blur(8px) brightness(0.5)'
            }}
          />
          <div 
            className="absolute inset-0 bg-blue-900/40 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        </div>
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 z-50 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          <div className="p-6">
            <img src="https://i.postimg.cc/W3n0DdqH/pref-logo-sha.png" alt="Logo" className="h-12 mx-auto mb-2" />
            <div className="text-center">
              <p className="font-bold text-gray-800 text-sm">SEINFRA ELÉTRICA</p>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors
                    ${location.pathname === item.path 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200 space-y-4">
            {/* Connection & Offline Sync Status Widget */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2 text-xs shadow-inner">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Conexão</span>
                <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[10px] ${
                  isOnline 
                    ? 'bg-green-50 text-green-700 border border-green-200' 
                    : 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
                }`}>
                  {isOnline ? (
                    <>
                      <Wifi className="h-3 w-3 text-green-500" /> Online
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3 text-red-500" /> Offline
                    </>
                  )}
                </span>
              </div>

              {pendingCount > 0 && (
                <div className="space-y-2 pt-1 border-t border-gray-200/60">
                  <div className="flex items-start gap-1.5 bg-amber-50/70 border border-amber-100 rounded-lg p-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 text-amber-800 leading-tight">
                      <p className="font-bold">{pendingCount} {pendingCount === 1 ? 'pendente' : 'pendentes'}</p>
                      <p className="text-[10px] text-amber-700/80 mt-0.5">Sincroniza automaticamente online.</p>
                    </div>
                  </div>

                  {syncState === 'syncing' ? (
                    <div className="w-full flex items-center justify-center gap-2 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg font-bold">
                      <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                      <span>Sincronizando...</span>
                    </div>
                  ) : syncState === 'success' ? (
                    <div className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-green-50 text-green-700 border border-green-100 rounded-lg font-bold">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      <span>Sincronizado!</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => syncNow()}
                      disabled={!isOnline}
                      className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border font-bold transition-all shadow-sm ${
                        isOnline 
                          ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700 hover:shadow cursor-pointer' 
                          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      }`}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Sincronizar agora
                    </button>
                  )}

                  {syncErrorMsg && (
                    <p className="text-[10px] leading-tight text-red-600 border-l-2 border-red-500 pl-1.5 mt-1 font-medium italic truncate" title={syncErrorMsg}>
                      Erro: {syncErrorMsg}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center p-2 mb-4">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                  {user?.name.charAt(0)}
                </div>
              </div>
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.role === 'ELECTRICIAN' ? 'ELETRICISTA' : user?.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 lg:hidden">
          <div className="px-4 py-4 flex items-center justify-between">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="text-gray-500 hover:text-gray-700"
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">
              {activeItem?.name || 'Início'}
            </h1>
            
            {/* Mobile Connection / Sync indicator */}
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <span className="h-5 px-1.5 bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-black rounded-full flex items-center justify-center animate-pulse" title={`${pendingCount} demanda(s) pendente(s)`}>
                  {pendingCount}
                </span>
              )}
              {isOnline ? (
                <Wifi className="h-4 w-4 text-green-500" title="Online" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500 animate-pulse" title="Offline" />
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
