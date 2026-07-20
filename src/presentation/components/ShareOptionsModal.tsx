import React, { useState, useEffect } from 'react';
import { X, Share2, MessageCircle, Send, Mail, Download, Smartphone, Loader2, AlertCircle } from 'lucide-react';

interface ShareOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  text: string;
  photos: string[];
}

export default function ShareOptionsModal({ isOpen, onClose, title, text, photos }: ShareOptionsModalProps) {
  const [isPreparingNative, setIsPreparingNative] = useState(false);
  const [nativeSupported, setNativeSupported] = useState(false);
  const [downloadingIndices, setDownloadingIndices] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setNativeSupported(!!(navigator.share && navigator.canShare));
    }
  }, []);

  if (!isOpen) return null;

  const handleNativeShare = async () => {
    if (!navigator.share) return;
    setIsPreparingNative(true);
    try {
      // If we have photos, we fetch them to pass as Files
      if (photos.length > 0) {
        const filePromises = photos.map(async (url, idx) => {
          const trimmedUrl = url.trim();
          const absoluteUrl = trimmedUrl.startsWith('http') 
            ? trimmedUrl 
            : `${window.location.origin}${trimmedUrl.startsWith('/') ? '' : '/'}${trimmedUrl}`;
          const res = await fetch(absoluteUrl);
          const blob = await res.blob();
          const ext = trimmedUrl.split('.').pop()?.split('?')[0] || 'jpg';
          const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
          return new File([blob], `foto_${idx + 1}.${cleanExt}`, { type: blob.type || `image/${cleanExt}` });
        });

        const files = await Promise.all(filePromises);

        if (navigator.canShare({ files })) {
          await navigator.share({
            files,
            title: title || 'Compartilhamento',
            text: text
          });
          setIsPreparingNative(false);
          return;
        }
      }

      // Fallback native share without files
      await navigator.share({
        title: title || 'Compartilhamento',
        text: text
      });
    } catch (err: any) {
      console.warn('Native share failed:', err);
      if (err.name !== 'AbortError') {
        alert('Erro ao usar compartilhamento do sistema. Tente copiar o texto ou baixar as imagens.');
      }
    } finally {
      setIsPreparingNative(false);
    }
  };

  const handleDownloadPhoto = async (url: string, index: number) => {
    setDownloadingIndices(prev => ({ ...prev, [index]: true }));
    try {
      const trimmedUrl = url.trim();
      const absoluteUrl = trimmedUrl.startsWith('http') 
        ? trimmedUrl 
        : `${window.location.origin}${trimmedUrl.startsWith('/') ? '' : '/'}${trimmedUrl}`;
      
      const res = await fetch(absoluteUrl);
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      
      const ext = trimmedUrl.split('.').pop()?.split('?')[0] || 'jpg';
      a.download = `foto_compartilhar_${index + 1}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Failed to download photo:', err);
      window.open(url, '_blank');
    } finally {
      setDownloadingIndices(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleDownloadAll = async () => {
    for (let i = 0; i < photos.length; i++) {
      await handleDownloadPhoto(photos[i], i);
    }
  };

  // Pre-compiled URLs
  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
  const whatsappWebUrl = `https://web.whatsapp.com/send?text=${encodedText}`;
  const telegramUrl = `https://t.me/share/url?text=${encodedText}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(title || 'Compartilhamento de Demanda')}&body=${encodedText}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay with blurred image */}
      <div onClick={onClose} className="absolute inset-0 z-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal Content */}
      <div className="bg-white rounded-2xl w-full max-w-lg relative z-10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-emerald-600" />
            <h2 className="font-bold text-gray-900 text-sm md:text-base">Opções de Compartilhamento</h2>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          
          {/* Helper alert about WhatsApp Business / options */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Dica para WhatsApp Business & Outros Apps:</p>
              <p className="leading-relaxed">
                Se você usa <strong>WhatsApp Business</strong>, Telegram ou outro aplicativo alternativo, a melhor opção é clicar em <strong>"compartilhamento do sistema (escolher app) ou WhatsApp Web"</strong>.
              </p>
            </div>
          </div>

          {/* Group 1: Native Share (System Menu) */}
          {nativeSupported && (
            <div className="space-y-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Recomendado para Celular</span>
              <button
                type="button"
                onClick={handleNativeShare}
                disabled={isPreparingNative}
                className="w-full inline-flex items-center justify-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase py-3.5 px-4 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-70 cursor-pointer"
              >
                {isPreparingNative ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparando Arquivos...
                  </>
                ) : (
                  <>
                    <Smartphone className="h-4 w-4" />
                    Compartilhamento do Sistema (Escolher App)
                  </>
                )}
              </button>
              <p className="text-[10px] text-gray-500 text-center leading-relaxed font-medium">
                Abre o menu nativo do seu celular/tablet, onde você pode escolher diretamente o <strong>WhatsApp Business</strong>, Telegram ou qualquer outro app instalado.
              </p>
            </div>
          )}

          {/* Group 2: Individual Apps */}
          <div className="space-y-3">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Enviar via Link</span>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              
              {/* standard WhatsApp */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer referrer"
                onClick={() => {
                  // Register completion/close if needed
                }}
                className="inline-flex items-center justify-center gap-2 bg-green-50 border border-green-150 hover:bg-green-100/60 text-green-700 py-3 px-4 rounded-xl font-bold text-xs uppercase transition-all text-center cursor-pointer"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp Comum
              </a>

              {/* WhatsApp Web */}
              <a
                href={whatsappWebUrl}
                target="_blank"
                rel="noreferrer referrer"
                className="inline-flex items-center justify-center gap-2 bg-teal-50 border border-teal-100 hover:bg-teal-100/60 text-teal-700 py-3 px-4 rounded-xl font-bold text-xs uppercase transition-all text-center cursor-pointer"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp Web
              </a>

              {/* Telegram */}
              <a
                href={telegramUrl}
                target="_blank"
                rel="noreferrer referrer"
                className="inline-flex items-center justify-center gap-2 bg-blue-50 border border-blue-100 hover:bg-blue-100/60 text-blue-700 py-3 px-4 rounded-xl font-bold text-xs uppercase transition-all text-center cursor-pointer"
              >
                <Send className="h-4 w-4" />
                Telegram
              </a>

              {/* Email */}
              <a
                href={emailUrl}
                className="inline-flex items-center justify-center gap-2 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 py-3 px-4 rounded-xl font-bold text-xs uppercase transition-all text-center cursor-pointer"
              >
                <Mail className="h-4 w-4" />
                Enviar por E-mail
              </a>

            </div>
          </div>

          {/* Group 3: Photos Downloading */}
          {photos.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Fotos da Demanda ({photos.length})</span>
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  className="text-[10px] bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-2 py-1 rounded-lg text-emerald-700 font-extrabold uppercase transition-all cursor-pointer"
                >
                  Baixar Todas
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((url, idx) => {
                  const isDownloading = !!downloadingIndices[idx];
                  return (
                    <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-2 flex flex-col gap-2 relative shadow-sm">
                      <img 
                        src={url.trim()} 
                        alt={`Visualização ${idx + 1}`} 
                        className="w-full h-20 object-cover rounded-lg border border-gray-150"
                      />
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownloadPhoto(url, idx)}
                        className="w-full inline-flex items-center justify-center gap-1 bg-white hover:bg-gray-100 border border-gray-250 text-gray-700 font-bold text-[10px] uppercase py-1.5 rounded-lg transition-all cursor-pointer select-none active:scale-95 disabled:opacity-50"
                      >
                        {isDownloading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        Salvar Foto
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-950 hover:bg-gray-800 text-white font-black text-xs uppercase px-5 py-2.5 rounded-xl transition-all cursor-pointer select-none active:scale-98"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
