import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Tag,
  ClipboardList,
  DollarSign,
  Layers,
  FileText,
  X,
  Check,
  AlertTriangle,
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
        // sort by date desc (newest first)
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
    return <div className="p-6 text-white/80">Loading active term…</div>;
  if (error)
    return (
      <div className="p-6 text-red-300">
        Can’t load expenses: {error.message}
      </div>
    );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-4 md:p-6 flex flex-col gap-6"
    >
      {/* Toast Notification */}
      {notif && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
        >
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
              notif.type === "error"
                ? "bg-red-500 text-white"
                : "bg-emerald-500 text-white"
            }`}
          >
            {notif.type === "error" ? (
              <AlertTriangle size={18} />
            ) : (
              <Check size={18} />
            )}
            <span>{notif.msg}</span>
          </div>
        </motion.div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-white/10"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Confirm Delete
              </h3>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-white/50 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-white/80 mb-6">
              Are you sure you want to delete this expense? This action cannot
              be undone.
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
                className="px-4 py-2 rounded-lg hover:bg-red-600 text-red-600 transition-colors flex items-center gap-2"
              >
                {loading ? <Spinner size={16} /> : <Trash2 size={16} />}
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">
          Expenses Management
        </h1>
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <div className="text-sm text-white/70">
            {filtered.length} {filtered.length === 1 ? "item" : "items"} •
            Total:{" "}
            <span className="font-semibold text-white">
              {fmtMoney(totalExpenses)}
            </span>
          </div>
          <div className="relative w-full sm:w-64">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
            />
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              placeholder="Search expenses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <div className="lg:col-span-1 bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-5 backdrop-blur-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-blue-400" />
              <h2 className="text-lg font-semibold text-white">
                {editing ? "Edit Expense" : "Add New Expense"}
              </h2>
            </div>
            {editing && (
              <button
                onClick={() => {
                  setEditing(null);
                  resetForm();
                }}
                className="p-1 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Item Name *
              </label>
              <div className="relative">
                <Tag
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
                />
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="e.g., Office Supplies"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Category
              </label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                placeholder="e.g., Office, Marketing"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Description
              </label>
              <div className="relative">
                <FileText
                  size={16}
                  className="absolute left-3 top-3 text-white/50"
                />
                <textarea
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  placeholder="Additional details..."
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
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
                <label className="block text-sm font-medium text-white/80 mb-1">
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
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
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

            <div className="flex items-center justify-between px-2 py-3 bg-white/5 rounded-lg">
              <span className="text-sm text-white/70">Total Amount:</span>
              <span className="font-medium text-white">
                {fmtMoney(
                  Math.max(
                    0,
                    Number(form.quantity || 0) * Number(form.unitPrice || 0)
                  )
                )}
              </span>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSubmit}
                disabled={loading || !form.name.trim()}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg ${
                  loading || !form.name.trim()
                    ? "bg-gray-600/50 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                } text-white font-medium transition-colors`}
              >
                {loading ? (
                  <>
                    <Spinner size={14} />
                    <span>{editing ? "Updating..." : "Saving..."}</span>
                  </>
                ) : (
                  <>
                    {editing ? (
                      <>
                        <Edit size={16} /> Update Expense
                      </>
                    ) : (
                      <>
                        <Plus size={16} /> Add Expense
                      </>
                    )}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right: List */}
        <div className="lg:col-span-2 bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-5 backdrop-blur-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList size={18} className="text-blue-400" />
              <h2 className="text-lg font-semibold text-white">
                Recent Expenses
              </h2>
            </div>
            <div className="text-sm text-white/60">
              Showing {filtered.length}{" "}
              {filtered.length === 1 ? "item" : "items"}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 bg-white/5 rounded-full mb-3">
                <ClipboardList size={24} className="text-white/40" />
              </div>
              <h3 className="text-lg font-medium text-white/90 mb-1">
                No expenses found
              </h3>
              <p className="text-sm text-white/60 max-w-md">
                {search.trim()
                  ? "Try adjusting your search query"
                  : "Add your first expense using the form on the left"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((e) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-white truncate">
                        {e.name}
                      </h3>
                      {e.category && (
                        <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full">
                          {e.category}
                        </span>
                      )}
                    </div>
                    {e.description && (
                      <p className="text-sm text-white/60 line-clamp-1">
                        {e.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="text-right">
                      <div className="font-medium text-white">
                        {fmtMoney(totalFor(e))}
                      </div>
                      <div className="text-xs text-white/50">
                        {Number(e.quantity || 0)} × {fmtMoney(e.unitPrice || 0)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(e)}
                        className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(e)}
                        className="p-1.5 rounded-md bg-white/5 hover:bg-red-500/20 hover:text-red-600 text-red-400 transition-colors"
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
        </div>
      </div>
    </motion.div>
  );
}
