import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Tag,
  DollarSign,
  FileText,
  X,
  Check,
  AlertTriangle,
  TrendingUp,
  Package,
  Calendar,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useActiveTerm } from "../hooks/useActiveTerm";

const Spinner = ({ size = 16, className = "" }) => (
  <svg
    className={`animate-spin ${className}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
    />
  </svg>
);

const fmtMoney = (n) =>
  typeof n === "number" && !Number.isNaN(n) ? `₦ ${n.toLocaleString()}` : "₦ 0";

const fmtDate = (date) => {
  if (!date) return "-";
  const d = date?.toDate?.();
  return (
    d?.toLocaleDateString?.("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) || "-"
  );
};

export default function Expenses() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState(null);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const termId = useActiveTerm();
  const [error, setError] = useState(null);

  // form state (create / edit)
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    category: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
  });

  // notifications helper
  const notify = (msg, type = "success", ms = 2400) => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), ms);
  };

  // live subscription
  useEffect(() => {
    if (!termId) return;
    const q = query(collection(db, "expenses"), where("termId", "==", termId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort(
          (a, b) => (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0)
        );
        setList(rows);
      },
      (err) => {
        console.error("SNAP expenses failed:", err);
        setError(err);
      }
    );
    return () => unsub();
  }, [termId]);

  // derived, filtered
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        (e.name || "").toLowerCase().includes(q) ||
        (e.category || "").toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q)
    );
  }, [list, search]);

  // helpers
  const resetForm = () => {
    setForm({
      name: "",
      category: "",
      description: "",
      quantity: 1,
      unitPrice: 0,
    });
  };

  const totalFor = (e) => {
    const qty = Number(e.quantity || 0);
    const price = Number(e.unitPrice || 0);
    const t = qty * price;
    return t < 0 ? 0 : t;
  };

  // actions
  const startEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || "",
      category: row.category || "",
      description: row.description || "",
      quantity: Number(row.quantity || 1),
      unitPrice: Number(row.unitPrice || 0),
    });
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return notify("Name is required", "error");
    const quantity = Math.max(0, Number(form.quantity || 0));
    const unitPrice = Math.max(0, Number(form.unitPrice || 0));
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      date: Timestamp.now(),
      termId,
    };

    setLoading(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "expenses", editing.id), payload);
        notify("Expense updated");
      } else {
        await addDoc(collection(db, "expenses"), payload);
        notify("Expense added");
      }
      setEditing(null);
      resetForm();
    } catch (e) {
      console.error(e);
      notify(e.message || "Failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, "expenses", id));
      notify("Expense deleted");
      if (editing?.id === id) {
        setEditing(null);
        resetForm();
      }
    } catch (e) {
      console.error(e);
      notify(e.message || "Delete failed", "error");
    } finally {
      setLoading(false);
      setDeleteConfirm(null);
    }
  };

  // Calculate totals
  const totalExpenses = useMemo(() => {
    return filtered.reduce((sum, e) => sum + totalFor(e), 0);
  }, [filtered]);

  if (!termId)
    return (
      <div className="min-h-screen py-4 md:py-8 px-3 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-white/80">Loading active term…</div>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen py-4 md:py-8 px-3 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-red-300">Can't load expenses: {error.message}</div>
        </div>
      </div>
    );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen py-4 md:py-8 px-3 md:px-6 lg:px-8"
    >
      <div className="max-w-7xl mx-auto font-[Poppins]">
        {/* Toast Notification */}
        <AnimatePresence>
          {notif && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="fixed top-6 left-1/2 -translate-x-1/2 z-50"
            >
              <div
                className={`flex items-center gap-2 px-6 py-3 rounded-xl shadow-2xl backdrop-blur-md ${
                  notif.type === "error"
                    ? "bg-gradient-to-r from-red-600 to-red-700 border border-red-500/50"
                    : "bg-gradient-to-r from-green-600 to-green-700 border border-green-500/50"
                }`}
              >
                {notif.type === "error" ? (
                  <AlertTriangle size={18} className="text-white" />
                ) : (
                  <Check size={18} className="text-white" />
                )}
                <span className="text-white font-medium">{notif.msg}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-gradient-to-br from-[#1a1038] via-[#241a44] to-[#1b1740] rounded-2xl p-6 max-w-md w-full border border-red-500/30 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/20 rounded-lg">
                      <AlertTriangle className="text-red-400" size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-white">Confirm Delete</h3>
                  </div>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="text-white/50 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="text-white/80 mb-6">
                  Are you sure you want to delete this expense? This action cannot be
                  undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm.id)}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <Spinner size={16} /> : <Trash2 size={16} />}
                    Delete
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-6 md:mb-8"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-4 drop-shadow-lg">
            Expenses Management
          </h1>

          {/* Quick Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-rose-500/20 to-rose-600/20 border border-rose-400/30 rounded-xl px-4 py-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-rose-300/80 text-xs font-medium mb-1">
                    Total Expenses
                  </div>
                  <div className="text-white text-2xl font-bold">
                    {fmtMoney(totalExpenses)}
                  </div>
                </div>
                <TrendingUp className="text-rose-400 text-3xl" />
              </div>
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-400/30 rounded-xl px-4 py-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-blue-300/80 text-xs font-medium mb-1">
                    Total Items
                  </div>
                  <div className="text-white text-2xl font-bold">
                    {filtered.length}
                  </div>
                </div>
                <Package className="text-blue-400 text-3xl" />
              </div>
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-400/30 rounded-xl px-4 py-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-purple-300/80 text-xs font-medium mb-1">
                    This Term
                  </div>
                  <div className="text-white text-2xl font-bold">{list.length}</div>
                </div>
                <Calendar className="text-purple-400 text-3xl" />
              </div>
            </motion.div>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50"
            />
            <input
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-11 pr-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all backdrop-blur-md"
              placeholder="Search expenses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </motion.div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Form */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-1 bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-2xl p-6 backdrop-blur-md shadow-xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  {editing ? (
                    <Edit size={20} className="text-purple-400" />
                  ) : (
                    <Plus size={20} className="text-purple-400" />
                  )}
                </div>
                <h2 className="text-xl font-bold text-white">
                  {editing ? "Edit Expense" : "Add New Expense"}
                </h2>
              </div>
              {editing && (
                <button
                  onClick={() => {
                    setEditing(null);
                    resetForm();
                  }}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white/90 mb-2">
                  Item Name *
                </label>
                <div className="relative">
                  <Tag
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
                  />
                  <input
                    className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                    placeholder="e.g., Office Supplies"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/90 mb-2">
                  Category
                </label>
                <input
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                  placeholder="e.g., Office, Marketing"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/90 mb-2">
                  Description
                </label>
                <div className="relative">
                  <FileText
                    size={16}
                    className="absolute left-3 top-3 text-white/50"
                  />
                  <textarea
                    rows={3}
                    className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all resize-none"
                    placeholder="Additional details..."
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-2">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                    value={form.quantity}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        quantity: Math.max(0, Number(e.target.value || 0)),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-2">
                    Unit Price (₦)
                  </label>
                  <div className="relative">
                    <DollarSign
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
                    />
                    <input
                      type="number"
                      min="0"
                      step="100"
                      className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                      value={form.unitPrice}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          unitPrice: Math.max(0, Number(e.target.value || 0)),
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-4 bg-gradient-to-r from-purple-500/20 to-purple-600/20 border border-purple-400/30 rounded-lg">
                <span className="text-sm font-semibold text-white/90">
                  Total Amount:
                </span>
                <span className="font-bold text-white text-lg">
                  {fmtMoney(
                    Math.max(
                      0,
                      Number(form.quantity || 0) * Number(form.unitPrice || 0)
                    )
                  )}
                </span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading || !form.name.trim()}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg font-semibold transition-all shadow-lg ${
                  loading || !form.name.trim()
                    ? "bg-gray-600/50 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
                } text-white`}
              >
                {loading ? (
                  <>
                    <Spinner size={18} />
                    <span>{editing ? "Updating..." : "Saving..."}</span>
                  </>
                ) : (
                  <>
                    {editing ? (
                      <>
                        <Edit size={18} /> Update Expense
                      </>
                    ) : (
                      <>
                        <Plus size={18} /> Add Expense
                      </>
                    )}
                  </>
                )}
              </button>
            </div>
          </motion.div>

          {/* Right: List */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2 bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-2xl p-6 backdrop-blur-md shadow-xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Package size={20} className="text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Recent Expenses</h2>
              </div>
              <div className="text-sm text-white/60 font-medium">
                {filtered.length} {filtered.length === 1 ? "item" : "items"}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-6 bg-white/5 rounded-2xl mb-4 border border-white/10">
                  <Package size={48} className="text-white/40" />
                </div>
                <h3 className="text-xl font-bold text-white/90 mb-2">
                  No expenses found
                </h3>
                <p className="text-sm text-white/60 max-w-md">
                  {search.trim()
                    ? "Try adjusting your search query"
                    : "Add your first expense using the form on the left"}
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-500/50 scrollbar-track-white/5">
                {filtered.map((e, idx) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.05 }}
                    className="group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-white text-base truncate">
                          {e.name}
                        </h3>
                        {e.category && (
                          <span className="text-xs px-2.5 py-1 bg-gradient-to-r from-blue-500/20 to-blue-600/20 text-blue-300 rounded-full border border-blue-400/30 font-medium whitespace-nowrap">
                            {e.category}
                          </span>
                        )}
                      </div>
                      {e.description && (
                        <p className="text-sm text-white/60 line-clamp-1 mb-1">
                          {e.description}
                        </p>
                      )}
                      <p className="text-xs text-white/50">
                        {fmtDate(e.date)}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      <div className="text-right">
                        <div className="font-bold text-white text-lg">
                          {fmtMoney(totalFor(e))}
                        </div>
                        <div className="text-xs text-white/50">
                          {Number(e.quantity || 0)} × {fmtMoney(e.unitPrice || 0)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(e)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-purple-500/20 text-white/70 hover:text-purple-400 border border-white/10 hover:border-purple-400/30 transition-all"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(e)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-400 border border-white/10 hover:border-red-400/30 transition-all"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}