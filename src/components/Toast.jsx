import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { useEffect } from "react";

export default function Toast({ message, type = "success", onClose, duration = 3000 }) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [onClose, duration]);

  const icons = {
    success: <CheckCircle className="text-green-400" size={20} />,
    error: <AlertCircle className="text-red-400" size={20} />,
    info: <Info className="text-blue-400" size={20} />,
  };

  const bgColors = {
    success: "bg-green-500/10 border-green-500/20",
    error: "bg-red-500/10 border-red-500/20",
    info: "bg-blue-500/10 border-blue-500/20",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] min-w-[320px] max-w-md p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center gap-3 ${bgColors[type]}`}
    >
      <div className="flex-shrink-0">{icons[type]}</div>
      <div className="flex-grow text-white text-sm font-medium">{message}</div>
      <button
        onClick={onClose}
        className="flex-shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
}

export function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
