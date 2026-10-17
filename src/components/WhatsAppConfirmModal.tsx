import React, { useState } from 'react';
import { X, MessageCircle, Copy, Check, AlertCircle, ExternalLink } from 'lucide-react';

interface WhatsAppConfirmModalProps {
  whatsappUrl: string;
  orderText: string;
  isDelivery: boolean;
  onClose: () => void;
}

export const WhatsAppConfirmModal: React.FC<WhatsAppConfirmModalProps> = ({
  whatsappUrl,
  orderText,
  isDelivery,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(orderText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      console.warn('Could not copy to clipboard:', e);
    }
  };

  const handleOpenWhatsApp = () => {
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
    >
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-stone-200 overflow-hidden text-stone-800 flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between bg-purple-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500 rounded-xl text-white">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="confirm-modal-title" className="font-black text-lg">
                Enviar Pedido pelo WhatsApp
              </h3>
              <p className="text-xs text-purple-200">Faby Lanches</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 text-purple-200 hover:text-white rounded-full hover:bg-purple-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice text */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-300/80 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 leading-relaxed font-medium">
              Você será direcionado ao WhatsApp para enviar o pedido. A confirmação e, para entrega, o valor do frete serão informados pela Faby Lanches.
            </p>
          </div>

          <p className="text-xs text-stone-500">
            {isDelivery
              ? 'Lembre-se: o valor final com frete e o prazo de entrega serão calculados e confirmados diretamente pela nossa equipe.'
              : 'O prazo para retirada do seu pedido será confirmado diretamente pela nossa equipe no WhatsApp.'}
          </p>

          {/* Collapsible Order preview */}
          <div className="border border-stone-200 rounded-xl p-3 bg-stone-50 max-h-44 overflow-y-auto font-mono text-xs text-stone-700 whitespace-pre-wrap">
            {orderText}
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="w-full min-h-[48px] py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-base shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageCircle className="w-5 h-5" />
              <span>Abrir WhatsApp para Enviar</span>
              <ExternalLink className="w-4 h-4 ml-1 opacity-80" />
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl border text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                copied
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                  : 'border-stone-300 bg-white hover:bg-stone-100 text-stone-700'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Pedido copiado com sucesso!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar pedido como alternativa</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="px-5 py-3 bg-stone-50 border-t border-stone-100 text-center">
          <span className="text-[11px] text-stone-600">
            Seu carrinho continuará salvo no navegador para sua comodidade.
          </span>
        </div>
      </div>
    </div>
  );
};
