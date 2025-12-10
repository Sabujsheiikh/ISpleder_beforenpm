import React, { useEffect } from 'react';
import { X, Check, AlertCircle, Info, AlertTriangle } from './Icons';
import { ToastMessage, ToastType } from '../../types';

interface ToastProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

const ToastIcon = ({ type }: { type: ToastType }) => {
  switch (type) {
    case 'success': return <Check size={18} className="text-green-500" />;
    case 'error': return <AlertCircle size={18} className="text-red-500" />;
    case 'warning': return <AlertTriangle size={18} className="text-yellow-500" />;
    default: return <Info size={18} className="text-blue-500" />;
  }
};

interface ToastItemProps {
  toast: ToastMessage;
  removeToast: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, removeToast }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  return (
    <div className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-xl rounded-xl p-4 min-w-[320px] animate-fade-in transition-all transform hover:scale-[1.02] relative overflow-hidden group">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
         toast.type === 'success' ? 'bg-green-500' : 
         toast.type === 'error' ? 'bg-red-500' : 
         toast.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
      }`}></div>
      
      <div className={`p-2 rounded-full bg-opacity-10 shrink-0 ${
        toast.type === 'success' ? 'bg-green-100' : 
        toast.type === 'error' ? 'bg-red-100' : 
        toast.type === 'warning' ? 'bg-yellow-100' : 'bg-blue-100'
      }`}>
        <ToastIcon type={toast.type} />
      </div>
      <p className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 pr-2">{toast.message}</p>
      <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
        <X size={16} />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<ToastProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
      <div className="pointer-events-auto flex flex-col gap-3">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
        ))}
      </div>
    </div>
  );
};