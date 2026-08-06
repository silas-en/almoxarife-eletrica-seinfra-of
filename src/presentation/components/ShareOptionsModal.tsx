import React, { useState, useEffect } from 'react';
import { X, Share2, MessageCircle, Send, Mail, Download, Smartphone, Loader2, AlertCircle, Copy, Check, Archive } from 'lucide-react';
import JSZip from 'jszip';

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
  const [copyingIndices, setCopyingIndices] = useState<Record<number, boolean>>({});
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

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

  const copyPhotoToClipboard = async (url: string, index?: number) => {
    if (index !== undefined) {
      setCopyingIndices(prev => ({ ...prev, [index]: true }));
    }
    try {
      const trimmedUrl = url.trim();
      const absoluteUrl = trimmedUrl.startsWith('http') 
        ? trimmedUrl 
        : `${window.location.origin}${trimmedUrl.startsWith('/') ? '' : '/'}${trimmedUrl}`;
      
      const res = await fetch(absoluteUrl);
      const blob = await res.blob();

      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const imgLoaded = new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        img.src = URL.createObjectURL(blob);
        await imgLoaded;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 800;
        canvas.height = img.naturalHeight || 600;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        pngBlob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'));
      }

      await navigator.clipboard.write([
        new ClipboardItem({ [pngBlob.type]: pngBlob })
      ]);

      setNoticeMessage('📸 Foto copiada! No WhatsApp/Telegram, pressione Ctrl + V para colar a foto diretamente.');
      setTimeout(() => setNoticeMessage(null), 6000);
      return true;
    } catch (err) {
      console.warn('Clipboard write failed:', err);
      try {
        await navigator.clipboard.writeText(text);
        setNoticeMessage('Texto copiado! Pressione Ctrl + V para colar no chat.');
        setTimeout(() => setNoticeMessage(null), 5000);
      } catch (e) {}
      return false;
    } finally {
      if (index !== undefined) {
        setCopyingIndices(prev => ({ ...prev, [index]: false }));
      }
    }
  };

  const handleAppClick = async (appUrl: string) => {
    if (photos && photos.length > 0) {
      await copyPhotoToClipboard(photos[0]);
    }
    window.open(appUrl, '_blank', 'noreferrer');
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
    if (photos.length === 0) return;
    setIsDownloadingZip(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("fotos_demandas") || zip;

      const promises = photos.map(async (url, i) => {
        const trimmedUrl = url.trim();
        const absoluteUrl = trimmedUrl.startsWith('http') 
          ? trimmedUrl 
          : `${window.location.origin}${trimmedUrl.startsWith('/') ? '' : '/'}${trimmedUrl}`;
        
        try {
          const res = await fetch(absoluteUrl);
          const blob = await res.blob();
          const ext = trimmedUrl.split('.').pop()?.split('?')[0] || 'jpg';
          const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
          folder.file(`foto_${i + 1}.${cleanExt}`, blob);
        } catch (e) {
          console.error(`Error fetching photo ${i + 1} for ZIP:`, e);
        }
      });

      await Promise.all(promises);
      const content = await zip.generateAsync({ type: 'blob' });
      
      const downloadUrl = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const cleanDate = new Date().toISOString().slice(0, 10);
      a.download = `fotos_demandas_${cleanDate}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      setNoticeMessage(`📦 Arquivo ZIP baixado com sucesso contendo ${photos.length} foto(s)!`);
      setTimeout(() => setNoticeMessage(null), 5000);
    } catch (err) {
      console.error('Erro ao gerar arquivo ZIP de fotos:', err);
      // Fallback: download individually if zip fails
      for (let i = 0; i < photos.length; i++) {
        await handleDownloadPhoto(photos[i], i);
      }
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
  const whatsappWebUrl = `https://web.whatsapp.com/send?text=${encodedText}`;
  const telegramUrl = `https://t.me/share/url?text=${encodedText}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(title || 'Compartilhamento de Demanda')}&body=${encodedText}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
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
          
          {/* Active Toast/Notice */}
          {noticeMessage && (
            <div className="bg-emerald-60 border border-emerald-300 bg-emerald-50 rounded-xl p-3 text-xs text-emerald-900 font-bold flex items-center gap-2 shadow-sm animate-fade-in">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{noticeMessage}</span>
            </div>
          )}

          {/* Helper alert about WhatsApp / Telegram photo paste */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">✨ Envio direto de foto no WhatsApp / Telegram:</p>
              <p className="leading-relaxed">
                Ao clicar abaixo no <strong>WhatsApp Web</strong> ou <strong>Telegram</strong>, a primeira foto é copiada automaticamente. No chat do aplicativo, basta pressionar <strong>Ctrl + V</strong> para colar a foto diretamente (sem links de servidor)!
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
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Enviar via WhatsApp / Telegram</span>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              
              {/* standard WhatsApp */}
              <button
                type="button"
                onClick={() => handleAppClick(whatsappUrl)}
                className="inline-flex items-center justify-center gap-2 bg-green-50 border border-green-200 hover:bg-green-100/80 text-green-700 py-3 px-4 rounded-xl font-bold text-xs uppercase transition-all text-center cursor-pointer shadow-sm active:scale-95"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp App
              </button>

              {/* WhatsApp Web */}
              <button
                type="button"
                onClick={() => handleAppClick(whatsappWebUrl)}
                className="inline-flex items-center justify-center gap-2 bg-teal-50 border border-teal-200 hover:bg-teal-100/80 text-teal-700 py-3 px-4 rounded-xl font-bold text-xs uppercase transition-all text-center cursor-pointer shadow-sm active:scale-95"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp Web
              </button>

              {/* Telegram */}
              <button
                type="button"
                onClick={() => handleAppClick(telegramUrl)}
                className="inline-flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 hover:bg-blue-100/80 text-blue-700 py-3 px-4 rounded-xl font-bold text-xs uppercase transition-all text-center cursor-pointer shadow-sm active:scale-95"
              >
                <Send className="h-4 w-4" />
                Telegram
              </button>

              {/* Email */}
              <a
                href={emailUrl}
                className="inline-flex items-center justify-center gap-2 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 py-3 px-4 rounded-xl font-bold text-xs uppercase transition-all text-center cursor-pointer shadow-sm active:scale-95"
              >
                <Mail className="h-4 w-4" />
                Enviar por E-mail
              </a>

            </div>
          </div>

          {/* Group 3: Photos Grid & Controls */}
          {photos.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Fotos da Demanda ({photos.length})</span>
                <button
                  type="button"
                  disabled={isDownloadingZip}
                  onClick={handleDownloadAll}
                  className="text-[10px] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-700 font-extrabold uppercase transition-all cursor-pointer flex items-center gap-1 disabled:opacity-60"
                  title="Compacta todas as fotos em um único arquivo .ZIP e baixa de uma só vez"
                >
                  {isDownloadingZip ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Gerando ZIP...
                    </>
                  ) : (
                    <>
                      <Archive className="h-3 w-3" /> Baixar Pacote ZIP
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((url, idx) => {
                  const isDownloading = !!downloadingIndices[idx];
                  const isCopying = !!copyingIndices[idx];
                  return (
                    <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-2 flex flex-col gap-2 relative shadow-sm">
                      <img 
                        src={url.trim()} 
                        alt={`Visualização ${idx + 1}`} 
                        className="w-full h-24 object-cover rounded-lg border border-gray-150"
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={isCopying}
                          onClick={() => copyPhotoToClipboard(url, idx)}
                          className="w-full inline-flex items-center justify-center gap-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold text-[10px] uppercase py-1.5 rounded-lg transition-all cursor-pointer select-none active:scale-95 disabled:opacity-50"
                          title="Copiar imagem para colar com Ctrl+V no WhatsApp/Telegram"
                        >
                          {isCopying ? (
                            <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          Copiar (Ctrl+V)
                        </button>
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
