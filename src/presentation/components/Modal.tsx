import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay with blurred image */}
      <div
        onClick={onClose}
        className="absolute inset-0 z-0 overflow-hidden"
      >
        <div 
          className="absolute inset-0 bg-cover bg-center scale-110"
          style={{ 
            backgroundImage: 'url(https://i.postimg.cc/PrrM4HxN/Serrinha-Image.png)',
            filter: 'blur(8px) brightness(0.5)'
          }}
        />
        <div className="absolute inset-0 bg-blue-900/30 backdrop-blur-[2px]" />
      </div>

      {/* Modal Content */}
      <div
        className={`bg-white rounded-2xl w-full ${maxWidth} relative z-10 shadow-2xl overflow-hidden flex flex-col pointer-events-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 backdrop-blur-md sticky top-0 z-20">
          <h2 className="font-bold text-gray-900">{title}</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-200 rounded-full transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto max-h-[85vh]">
          {children}
        </div>
      </div>
    </div>
  );
}
