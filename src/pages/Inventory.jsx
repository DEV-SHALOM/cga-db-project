import { useEffect, useMemo, useState } from "react";
import {
  FolderPlus,
  FolderTree,
  Folder,
  Package,
  Plus,
  Edit,
  Trash2,
  ArrowLeftRight,
  ClipboardList,
  CheckCircle,
  Search,
  Ruler,
} from "lucide-react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  deleteDoc,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { motion } from "framer-motion";
import { useActiveTerm } from "../hooks/useActiveTerm";

// -------- Small spinner (Tailwind) --------
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

const LEVELS = [
  { key: "Nursery", label: "Nursery" },
  { key: "JuniorBasic", label: "Junior Basic" },
  { key: "SeniorBasic", label: "Senior Basic" },
  { key: "JuniorSecondary", label: "Junior Secondary" },
  { key: "SeniorSecondary", label: "Senior Secondary" },
];

const emptyStock = LEVELS.reduce((acc, l) => ((acc[l.key] = 0), acc), {});
const emptyPrice = LEVELS.reduce((acc, l) => ((acc[l.key] = 0), acc), {});
const fmt = (n) =>
  typeof n === "number" && !Number.isNaN(n) ? n.toLocaleString() : "0";

// keep numeric-only strings
const digitsOnly = (v) => (v || "").replace(/[^\d]/g, "");

export default function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [students, setStudents] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [studentInventory, setStudentInventory] = useState([]);
  const termId = useActiveTerm();
  const [error, setError] = useState(null);

  const [activeFolderId, setActiveFolderId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(LEVELS[0].key);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // 👇 quantity now a **string** so typing is smooth on mobile
  const [quantityToCheckout, setQuantityToCheckout] = useState("1");

  const [searchTerm, setSearchTerm] = useState("");

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");

  const [creatingItem, setCreatingItem] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    category: "",
    description: "",
    size: "",
    stockByLevel: { ...emptyStock },
    priceByLevel: { ...emptyPrice },
  });

  const [editingItem, setEditingItem] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null); // {type:'item'|'folder'|'studentInv', id, payload?}

  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState(null);

  const notify = (msg, type = "success", ms = 2500) => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), ms);
  };

  // ---------- GLOBAL subscriptions (not term-scoped) ----------
  useEffect(() => {
    const unsubStudents = onSnapshot(
      collection(db, "students"),
      (snap) => {
        const rows = snap.docs
          .map((d) => {
            const s = d.data();
            return {
              id: d.id,
              name: (s.name || `${s.firstName || ""} ${s.lastName || ""}`).trim(),
              studentId: s.studentId || s.admNo || d.id,
              className: s.className || s.currentClass || s.class || "",
              parentPhone:
                s.parentPhone || s.parentPhoneNumber || s.guardianPhone || "",
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        setStudents(rows);
      },
      (err) => {
        console.error("SNAP students failed:", err);
        setError(err);
      }
    );
    return () => unsubStudents();
  }, []);

  // Inventory tree & term-scoped money flows
  useEffect(() => {
    setError(null);
    if (!termId) return;

    const unsubInv = onSnapshot(
      collection(db, "inventory"),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) =>
          a.isFolder === b.isFolder ? 0 : a.isFolder ? -1 : 1
        );
        setInventory(arr);
      },
      (err) => {
        console.error("SNAP inventory failed:", err);
        setError(err);
      }
    );

    const unsubTx = onSnapshot(
      query(
        collection(db, "inventoryTransactions"),
        where("termId", "==", termId)
      ),
      (snap) =>
        setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("SNAP inventoryTransactions failed:", err);
        setError(err);
      }
    );

    const unsubSI = onSnapshot(
      collection(db, "studentInventory"),
      (snap) =>
        setStudentInventory(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("SNAP studentInventory failed:", err);
        setError(err);
      }
    );

    return () => {
      unsubInv();
      unsubTx();
      unsubSI();
    };
  }, [termId]);

  // ---------- derived ----------
  const folders = useMemo(
    () => inventory.filter((i) => i.isFolder && !i._deleted),
    [inventory]
  );
  const itemsInFolder = useMemo(
    () =>
      inventory.filter(
        (i) => !i.isFolder && (i.parentId || null) === (activeFolderId || null)
      ),
    [inventory, activeFolderId]
  );
  const rootFolders = useMemo(
    () => folders.filter((f) => (f.parentId || null) === null),
    [folders]
  );

  const filteredStudents = useMemo(() => {
    const q = (searchTerm || "").toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q)
    );
  }, [students, searchTerm]);

  // ---------- folders ----------
  const createFolder = async () => {
    const name = folderName.trim();
    if (!name) return notify("Folder name is required", "error");
    setLoading(true);
    try {
      await addDoc(collection(db, "inventory"), {
        isFolder: true,
        name,
        parentId: activeFolderId || null,
        dateAdded: Timestamp.now(),
      });
      setFolderName("");
      setCreatingFolder(false);
      notify("Folder created");
    } catch (e) {
      console.error(e);
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteFolder = async (folderId) => {
    const hasChildren =
      inventory.some((i) => i.parentId === folderId) ||
      inventory.some((i) => i.isFolder && i.parentId === folderId);
    if (hasChildren) return notify("Folder not empty", "error");
    setLoading(true);
    try {
      await deleteDoc(doc(db, "inventory", folderId));
      if (activeFolderId === folderId) setActiveFolderId(null);
      notify("Folder deleted");
    } catch (e) {
      console.error(e);
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ---------- items ----------
  const startCreateItem = () => {
    setNewItem({
      name: "",
      category: "",
      description: "",
      size: "",
      stockByLevel: { ...emptyStock },
      priceByLevel: { ...emptyPrice },
    });
    setCreatingItem(true);
  };

  const addItem = async () => {
    if (!newItem.name.trim()) return notify("Item name is required", "error");
    setLoading(true);
    try {
      await addDoc(collection(db, "inventory"), {
        isFolder: false,
        parentId: activeFolderId || null,
        name: newItem.name.trim(),
        category: newItem.category.trim(),
        description: newItem.description.trim(),
        size: newItem.size.trim(),
        stockByLevel: { ...newItem.stockByLevel },
        priceByLevel: { ...newItem.priceByLevel },
        dateAdded: Timestamp.now(),
      });
      setCreatingItem(false);
      notify("Item added");
    } catch (e) {
      console.error(e);
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const saveEditItem = async () => {
    if (!editingItem) return;
    if (!editingItem.name.trim()) return notify("Name is required", "error");
    setLoading(true);
    try {
      await updateDoc(doc(db, "inventory", editingItem.id), {
        name: editingItem.name.trim(),
        category: editingItem.category?.trim() || "",
        description: editingItem.description?.trim() || "",
        size: editingItem.size?.trim() || "",
        stockByLevel: { ...editingItem.stockByLevel },
        priceByLevel: { ...editingItem.priceByLevel },
      });
      setEditingItem(null);
      notify("Item updated");
    } catch (e) {
      console.error(e);
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, "inventory", id));
      if (selectedItem?.id === id) setSelectedItem(null);
      notify("Item deleted");
    } catch (e) {
      console.error(e);
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ---------- checkout / pay / return / refund ----------
  const handleCheckOut = async () => {
    if (!selectedItem) return notify("Pick an item", "error");
    if (!selectedStudent) return notify("Pick a student", "error");

    // 👇 sanitize and guard
    const qty = Math.max(1, Number(digitsOnly(quantityToCheckout) || 0));
    if (qty <= 0) return notify("Quantity must be > 0", "error");

    setLoading(true);
    try {
      const ref = doc(db, "inventory", selectedItem.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("Item not found");

      const data = snap.data();
      const current = Number(data.stockByLevel?.[selectedLevel] || 0);
      if (qty > current)
        return notify(`Only ${current} available for ${selectedLevel}`, "error");

      await updateDoc(ref, {
        [`stockByLevel.${selectedLevel}`]: current - qty,
      });

      const unitPrice = Number(
        (data.priceByLevel && data.priceByLevel[selectedLevel]) || 0
      );

      const tx = await addDoc(collection(db, "inventoryTransactions"), {
        itemId: selectedItem.id,
        itemName: data.name,
        size: data.size || "",
        level: selectedLevel,
        quantity: qty,
        itemPrice: unitPrice,
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        studentNumber: selectedStudent.studentId,
        className: selectedStudent.className,
        parentPhone: selectedStudent.parentPhone,
        action: "checked_out",
        date: Timestamp.now(),
        termId,
        returned: false,
        paid: unitPrice ? false : true,
      });

      const siQ = query(
        collection(db, "studentInventory"),
        where("studentId", "==", selectedStudent.id),
        where("itemId", "==", selectedItem.id),
        where("level", "==", selectedLevel),
        where("returned", "==", false)
      );
      const siSnap = await getDocs(siQ);
      if (siSnap.empty) {
        await addDoc(collection(db, "studentInventory"), {
          studentId: selectedStudent.id,
          studentName: selectedStudent.name,
          studentNumber: selectedStudent.studentId,
          className: selectedStudent.className,
          parentPhone: selectedStudent.parentPhone,
          itemId: selectedItem.id,
          itemName: data.name,
          size: data.size || "",
          level: selectedLevel,
          itemPrice: unitPrice,
          quantity: qty,
          dateCheckedOut: Timestamp.now(),
          returned: false,
          paid: unitPrice ? false : true,
          refunded: false,
          txId: tx.id,
        });
      } else {
        const row = siSnap.docs[0];
        await updateDoc(doc(db, "studentInventory", row.id), {
          quantity: Number(row.data().quantity || 0) + qty,
        });
      }

      // reset to default
      setQuantityToCheckout("1");
      notify(
        `Checked out ${qty} × ${data.name} (${selectedLevel}) to ${selectedStudent.name}`
      );
    } catch (e) {
      console.error(e);
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async (txId) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) return;
    if (tx.returned) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, "inventoryTransactions", txId), {
        returned: true,
        returnDate: Timestamp.now(),
      });

      const itemRef = doc(db, "inventory", tx.itemId);
      const itemSnap = await getDoc(itemRef);
      if (itemSnap.exists()) {
        const current = Number(
          (itemSnap.data().stockByLevel &&
            itemSnap.data().stockByLevel[tx.level]) ||
            0
        );
        await updateDoc(itemRef, {
          [`stockByLevel.${tx.level}`]: current + Number(tx.quantity || 0),
        });
      }

      const siQ = query(
        collection(db, "studentInventory"),
        where("studentId", "==", tx.studentId),
        where("itemId", "==", tx.itemId),
        where("level", "==", tx.level),
        where("returned", "==", false)
      );
      const siSnap = await getDocs(siQ);
      let siIdToUpdate = null;
      if (!siSnap.empty) {
        const row = siSnap.docs[0];
        siIdToUpdate = row.id;
        const newQty =
          Number(row.data().quantity || 0) - Number(tx.quantity || 0);
        if (newQty <= 0) {
          await updateDoc(doc(db, "studentInventory", row.id), {
            returned: true,
            returnDate: Timestamp.now(),
          });
        } else {
          await updateDoc(doc(db, "studentInventory", row.id), {
            quantity: newQty,
          });
        }
      }

      if (tx.paid) {
        const amount = Number(tx.itemPrice || 0) * Number(tx.quantity || 0);
        const refundDate = Timestamp.now();
        const refundPayload = {
          txId,
          itemId: tx.itemId,
          itemName: tx.itemName || "",
          level: tx.level,
          studentId: tx.studentId,
          studentName: tx.studentName || "",
          quantity: tx.quantity,
          itemPrice: tx.itemPrice || 0,
          amount,
          refundDate,
          paymentDate: tx.paymentDate || null,
          reason: "return",
          termId,
        };

        await updateDoc(doc(db, "inventoryTransactions", txId), {
          refunded: true,
          refundDate,
          refundAmount: amount,
        });

        await addDoc(collection(db, "inventoryRefunds"), refundPayload);

        if (siIdToUpdate) {
          await updateDoc(doc(db, "studentInventory", siIdToUpdate), {
            refunded: true,
            paid: false,
          });
        }
      }

      notify("Returned");
    } catch (e) {
      console.error(e);
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const markPaid = async (txId) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) return;

    setLoading(true);
    try {
      const paymentDate = Timestamp.now();
      await updateDoc(doc(db, "inventoryTransactions", txId), {
        paid: true,
        paymentDate,
      });

      const siQ = query(
        collection(db, "studentInventory"),
        where("studentId", "==", tx.studentId),
        where("itemId", "==", tx.itemId),
        where("level", "==", tx.level),
        where("returned", "==", false)
      );
      const siSnap = await getDocs(siQ);
      if (!siSnap.empty) {
        await updateDoc(doc(db, "studentInventory", siSnap.docs[0].id), {
          paid: true,
          paymentDate,
        });
      }

      notify("Marked as paid");
    } catch (e) {
      console.error(e);
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteStudentInventory = async (row) => {
    setLoading(true);
    try {
      if (!row.returned) {
        const itemRef = doc(db, "inventory", row.itemId);
        const itemSnap = await getDoc(itemRef);
        if (itemSnap.exists()) {
          const current = Number(
            (itemSnap.data().stockByLevel &&
              itemSnap.data().stockByLevel[row.level]) ||
              0
          );
          await updateDoc(itemRef, {
            [`stockByLevel.${row.level}`]: current + Number(row.quantity || 0),
          });
        }
      }

      let paymentDate = null;
      if (row.txId) {
        const txRef = doc(db, "inventoryTransactions", row.txId);
        const txSnap = await getDoc(txRef);
        if (txSnap.exists()) {
          const tx = txSnap.data();
          paymentDate = tx.paymentDate || null;
        }
      }

      if (row.paid && Number(row.itemPrice || 0) > 0) {
        const amount = Number(row.itemPrice || 0) * Number(row.quantity || 0);
        const refundDate = Timestamp.now();

        await addDoc(collection(db, "inventoryRefunds"), {
          txId: row.txId || null,
          itemId: row.itemId,
          itemName: row.itemName || "",
          level: row.level,
          studentId: row.studentId,
          studentName: row.studentName || "",
          quantity: row.quantity,
          itemPrice: row.itemPrice || 0,
          amount,
          refundDate,
          paymentDate,
          reason: "studentInventory_delete",
          termId,
        });
      }

      if (row.txId) {
        await deleteDoc(doc(db, "inventoryTransactions", row.txId));
      }

      await deleteDoc(doc(db, "studentInventory", row.id));

      notify("Student inventory deleted");
    } catch (e) {
      console.error(e);
      notify(e.message, "error");
    } finally {
      setLoading(false);
      setShowDeleteConfirm(null);
    }
  };

  // ---------- UI ----------
  const FolderHeader = ({ title, right }) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <FolderTree size={20} className="text-[#13a1e2]" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {right}
    </div>
  );

  if (!termId)
    return <div className="p-6 text-white/80">Loading active term…</div>;
  if (error)
    return (
      <div className="p-6 text-red-600">
        Can’t load inventory: {error.message}
      </div>
    );

  return (
    <>
      {notif && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999]">
          <div
            className={`px-4 py-2 rounded-xl backdrop-blur-md border shadow ${
              notif.type === "error"
                ? "bg-red-500/20 border-red-400 text-red-600"
                : "bg-green-500/20 border-green-400 text-green-400"
            }`}
          >
            {notif.msg}
          </div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* LEFT: Folders & items */}
        <div className="lg:col-span-1 bg-white/10 border border-white/20 rounded-2xl p-5 backdrop-blur-md">
          <FolderHeader
            title="Folders"
            right={
              <button
                onClick={() => setCreatingFolder((v) => !v)}
                className="text-xs px-2 py-1 rounded bg白/10 border border-white/20 text-white hover:bg-white/20 flex items-center gap-1"
              >
                <FolderPlus size={14} /> New Folder
              </button>
            }
          />
          {creatingFolder && (
            <div className="mb-3 flex gap-2">
              <input
                className="flex-1 bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                placeholder="Folder name (e.g., Uniforms)"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createFolder()}
                autoFocus
              />
              <button
                onClick={createFolder}
                disabled={loading || !folderName.trim()}
                className={`px-3 py-2 rounded ${
                  loading || !folderName.trim()
                    ? "bg-gray-500/50 cursor-not-allowed"
                    : "bg-[#13a1e2] hover:bg-[#13a1e2]/90"
                } text-white flex items-center justify-center`}
              >
                {loading ? <Spinner /> : "Create"}
              </button>
            </div>
          )}

          <div className="space-y-1">
            <button
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 ${
                activeFolderId === null
                  ? "bg-[#13a1e2]/30 border border-[#13a1e2]"
                  : "hover:bg-white/10 border border-transparent"
              }`}
              onClick={() => setActiveFolderId(null)}
            >
              <Folder size={16} className="text-white" />
              <span className="text-white">Root</span>
            </button>

            {rootFolders.map((f) => (
              <div key={f.id} className="group">
                <button
                  className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 ${
                    activeFolderId === f.id
                      ? "bg-[#13a1e2]/30 border border-[#13a1e2]"
                      : "hover:bg-white/10 border border-transparent"
                  }`}
                  onClick={() => setActiveFolderId(f.id)}
                >
                  <Folder size={16} className="text-white" />
                  <span className="text-white">{f.name}</span>
                </button>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition ml-8 mt-1">
                  <button
                    className="text-xs text-blue-300 hover:text-blue-200"
                    onClick={() => {
                      setActiveFolderId(f.id);
                      setCreatingFolder(true);
                    }}
                  >
                    + Subfolder
                  </button>
                  <button
                    className="text-xs text-red-600 hover:text-red-600"
                    onClick={() =>
                      setShowDeleteConfirm({ type: "folder", id: f.id })
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <hr className="my-4 border-white/10" />

          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-white/90">
              <Package size={18} />
              <span>Items {activeFolderId ? "in folder" : "(Root)"} </span>
            </div>
            <button
              onClick={startCreateItem}
              className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center gap-1"
            >
              <Plus size={14} /> New Item
            </button>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 custom-scroll">
            {itemsInFolder.length === 0 ? (
              <div className="text-white/60 text-sm">No items here yet.</div>
            ) : (
              itemsInFolder.map((it) => {
                const total = LEVELS.reduce(
                  (acc, l) => acc + Number(it.stockByLevel?.[l.key] || 0),
                  0
                );
                return (
                  <div
                    key={it.id}
                    onClick={() => setSelectedItem(it)}
                    className={`p-3 rounded border ${
                      selectedItem?.id === it.id
                        ? "bg-[#13a1e2]/30 border-[#13a1e2]"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    } cursor-pointer`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-white font-medium">{it.name}</div>
                      <div className="text-xs text-white/70">
                        Total: {fmt(total)}
                      </div>
                    </div>
                    {it.category && (
                      <div className="text-xs text-white/60">{it.category}</div>
                    )}
                    {it.size && (
                      <div className="text-xs text-white/60">
                        Size: {it.size}
                      </div>
                    )}
                    {it.description && (
                      <div className="text-[11px] mt-1 text-white/50 line-clamp-2">
                        {it.description}
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        className="text-xs bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 px-2 py-1 rounded flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingItem({ ...it });
                        }}
                      >
                        <Edit size={12} /> Edit
                      </button>
                      <button
                        className="text-xs bg-red-500/20 text-red-600 hover:bg-red-500/30 px-2 py-1 rounded flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm({ type: "item", id: it.id });
                        }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* MIDDLE: Create/Edit/Checkout */}
        <div className="lg:col-span-1 bg-white/10 border border-white/20 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center gap-2 mb-3">
            <ArrowLeftRight size={20} className="text-[#13a1e2]" />
            <h2 className="text-lg font-semibold text-white">
              {creatingItem
                ? "Create Item"
                : editingItem
                ? "Edit Item"
                : "Item Transactions"}
            </h2>
          </div>

          {/* Create Item */}
          {creatingItem && (
            <div className="space-y-3">
              <div>
                <label className="text-white/80 text-sm mb-1 block">
                  Item Name *
                </label>
                <input
                  placeholder="e.g., School Uniform"
                  className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem({ ...newItem, name: e.target.value })
                  }
                  autoFocus
                />
              </div>

              <div>
                <label className="text-white/80 text-sm mb-1 block">
                  Category
                </label>
                <input
                  placeholder="e.g., Uniforms, Books"
                  className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                  value={newItem.category}
                  onChange={(e) =>
                    setNewItem({ ...newItem, category: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-white/80 text-sm mb-1 block">
                  Size (Optional)
                </label>
                <div className="relative">
                  <Ruler
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
                  />
                  <input
                    placeholder="e.g., Small, Medium, Large or specific measurements"
                    className="w-full bg-white/10 border border-white/20 rounded pl-9 pr-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                    value={newItem.size}
                    onChange={(e) =>
                      setNewItem({ ...newItem, size: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="text-white/80 text-sm mb-1 block">
                  Description
                </label>
                <textarea
                  placeholder="Optional item description"
                  rows={3}
                  className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                  value={newItem.description}
                  onChange={(e) =>
                    setNewItem({ ...newItem, description: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-white/80 text-sm mb-2 block">
                  Stock & Pricing by Level
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {LEVELS.map((lv) => (
                    <div
                      key={lv.key}
                      className="bg-white/5 p-3 rounded border border-white/10"
                    >
                      <div className="text-white/80 font-medium mb-2">
                        {lv.label}
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">
                            Stock
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                            value={
                              newItem.stockByLevel[lv.key] === 0
                                ? ""
                                : String(newItem.stockByLevel[lv.key])
                            }
                            onChange={(e) =>
                              setNewItem({
                                ...newItem,
                                stockByLevel: {
                                  ...newItem.stockByLevel,
                                  [lv.key]: Number(digitsOnly(e.target.value) || 0),
                                },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">
                            Price (₦)
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                            value={
                              newItem.priceByLevel[lv.key] === 0
                                ? ""
                                : String(newItem.priceByLevel[lv.key])
                            }
                            onChange={(e) =>
                              setNewItem({
                                ...newItem,
                                priceByLevel: {
                                  ...newItem.priceByLevel,
                                  [lv.key]: Number(digitsOnly(e.target.value) || 0),
                                },
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={addItem}
                  disabled={loading || !newItem.name.trim()}
                  className={`px-4 py-2 rounded ${
                    loading || !newItem.name.trim()
                      ? "bg-gray-500/50 cursor-not-allowed"
                      : "bg-[#13a1e2] hover:bg-[#13a1e2]/90"
                  } text-white flex items-center justify-center gap-2`}
                >
                  {loading ? (
                    <>
                      <Spinner /> <span>Saving…</span>
                    </>
                  ) : (
                    "Save Item"
                  )}
                </button>
                <button
                  onClick={() => setCreatingItem(false)}
                  className="px-4 py-2 rounded bg-white/10 border border-white/20 text-white hover:bg-white/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Edit Item */}
          {editingItem && (
            <div className="space-y-3">
              <div>
                <label className="text-white/80 text-sm mb-1 block">
                  Item Name *
                </label>
                <input
                  placeholder="Item name"
                  className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                  value={editingItem.name}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, name: e.target.value })
                  }
                  autoFocus
                />
              </div>
              <div>
                <label className="text-white/80 text-sm mb-1 block">
                  Category
                </label>
                <input
                  placeholder="Category"
                  className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                  value={editingItem.category || ""}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, category: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-white/80 text-sm mb-1 block">
                  Size (Optional)
                </label>
                <div className="relative">
                  <Ruler
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
                  />
                  <input
                    placeholder="e.g., Small, Medium, Large or specific measurements"
                    className="w-full bg-white/10 border border-white/20 rounded pl-9 pr-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                    value={editingItem.size || ""}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, size: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-white/80 text-sm mb-1 block">
                  Description
                </label>
                <textarea
                  placeholder="Description"
                  rows={3}
                  className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                  value={editingItem.description || ""}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-white/80 text-sm mb-2 block">
                  Stock & Pricing by Level
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {LEVELS.map((lv) => (
                    <div
                      key={lv.key}
                      className="bg-white/5 p-3 rounded border border-white/10"
                    >
                      <div className="text-white/80 font-medium mb-2">
                        {lv.label}
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">
                            Stock
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                            value={
                              (editingItem.stockByLevel?.[lv.key] ?? 0) === 0
                                ? ""
                                : String(editingItem.stockByLevel?.[lv.key] ?? 0)
                            }
                            onChange={(e) =>
                              setEditingItem({
                                ...editingItem,
                                stockByLevel: {
                                  ...(editingItem.stockByLevel || {}),
                                  [lv.key]: Number(digitsOnly(e.target.value) || 0),
                                },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">
                            Price (₦)
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                            value={
                              (editingItem.priceByLevel?.[lv.key] ?? 0) === 0
                                ? ""
                                : String(editingItem.priceByLevel?.[lv.key] ?? 0)
                            }
                            onChange={(e) =>
                              setEditingItem({
                                ...editingItem,
                                priceByLevel: {
                                  ...(editingItem.priceByLevel || {}),
                                  [lv.key]: Number(digitsOnly(e.target.value) || 0),
                                },
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={saveEditItem}
                  disabled={loading || !editingItem.name.trim()}
                  className={`px-4 py-2 rounded ${
                    loading || !editingItem.name.trim()
                      ? "bg-gray-500/50 cursor-not-allowed"
                      : "bg-[#13a1e2] hover:bg-[#13a1e2]/90"
                  } text-white flex items-center justify-center gap-2`}
                >
                  {loading ? (
                    <>
                      <Spinner /> <span>Saving…</span>
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
                <button
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded bg-white/10 border border-white/20 text-white hover:bg-white/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Checkout */}
          {!creatingItem && !editingItem && (
            <>
              {selectedItem ? (
                <div className="space-y-3">
                  <div className="p-3 rounded bg-white/5 border border-white/10">
                    <div className="text-white font-semibold">
                      {selectedItem.name}
                    </div>
                    {selectedItem.size && (
                      <div className="text-white/70 text-sm">
                        Size: {selectedItem.size}
                      </div>
                    )}
                    {selectedItem.description && (
                      <div className="text-white/70 text-sm mt-1">
                        {selectedItem.description}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {LEVELS.map((lv) => {
                        const stock = Number(
                          selectedItem.stockByLevel?.[lv.key] || 0
                        );
                        const price = Number(
                          selectedItem.priceByLevel?.[lv.key] || 0
                        );
                        return (
                          <div
                            key={lv.key}
                            className={`px-2 py-2 rounded border text-sm ${
                              selectedLevel === lv.key
                                ? "bg-[#13a1e2]/30 border-[#13a1e2]"
                                : "bg-white/5 border-white/10"
                            } cursor-pointer`}
                            onClick={() => setSelectedLevel(lv.key)}
                          >
                            <div className="text-white/90">{lv.label}</div>
                            <div className="text-white/60">
                              Stock: {fmt(stock)}
                              {price ? ` • ₦${fmt(price)}` : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-white/80 text-sm mb-1 block">
                      Quantity
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="1"
                      className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                      value={quantityToCheckout}
                      onChange={(e) =>
                        setQuantityToCheckout(digitsOnly(e.target.value))
                      }
                      onBlur={(e) => {
                        const v = digitsOnly(e.target.value);
                        setQuantityToCheckout(v ? v : "1");
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-white/60 text-center py-8">
                  <Package size={32} className="mx-auto mb-2 text-white/30" />
                  Select an item on the left to proceed
                </div>
              )}

              <hr className="my-4 border-white/10" />

              <div className="space-y-2">
                <label className="text-white/80 text-sm mb-1 block">
                  Search Student
                </label>
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
                  />
                  <input
                    placeholder="Search by name or ID"
                    className="w-full bg-white/10 border border-white/20 rounded pl-9 pr-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-[#13a1e2]"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="max-h-44 overflow-y-auto rounded border border-white/10 custom-scroll">
                  {filteredStudents.length === 0 ? (
                    <div className="p-3 text-white/60 text-center py-4">
                      {searchTerm
                        ? "No matching students"
                        : "No students found"}
                    </div>
                  ) : (
                    filteredStudents.slice(0, 50).map((s) => (
                      <div
                        key={s.id}
                        className={`p-3 text-sm cursor-pointer border-b border-white/5 ${
                          selectedStudent?.id === s.id
                            ? "bg-[#13a1e2]/20"
                            : "hover:bg-white/10"
                        }`}
                        onClick={() => setSelectedStudent(s)}
                      >
                        <div className="text-white">{s.name}</div>
                        <div className="text-white/60">
                          ID: {s.studentId} • Class: {s.className}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {selectedStudent && (
                <div className="mt-3 p-3 bg-white/5 rounded border border-white/10">
                  <div className="text-white font-medium">
                    {selectedStudent.name}
                  </div>
                  <div className="text-white/60 text-sm">
                    ID: {selectedStudent.studentId} • Class:{" "}
                    {selectedStudent.className}
                  </div>
                </div>
              )}

              <button
                onClick={handleCheckOut}
                disabled={!selectedItem || !selectedStudent || loading}
                className={`mt-3 w-full px-4 py-2 rounded ${
                  !selectedItem || !selectedStudent
                    ? "bg-gray-500/50 cursor-not-allowed"
                    : "bg-[#13a1e2] hover:bg-[#13a1e2]/90"
                } text-white flex items-center justify-center gap-2`}
              >
                {loading ? (
                  <>
                    <Spinner /> <span>Processing…</span>
                  </>
                ) : (
                  "Check Out"
                )}
              </button>
            </>
          )}
        </div>

        {/* RIGHT: Student Inventory */}
        <div className="lg:col-span-1 bg-white/10 border border-white/20 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList size={20} className="text-[#13a1e2]" />
            <h2 className="text-lg font-semibold text-white">
              Student Inventory
            </h2>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1 custom-scroll">
            {studentInventory.length === 0 ? (
              <div className="text-white/60 text-center py-8">
                <ClipboardList size={32} className="mx-auto mb-2 text-white/30" />
                No inventory records yet
              </div>
            ) : (
              studentInventory.map((r) => {
                const tx = transactions.find(
                  (t) =>
                    t.studentId === r.studentId &&
                    t.itemId === r.itemId &&
                    t.level === r.level &&
                    !t.returned
                );
                const total =
                  Number(r.itemPrice || 0) * Number(r.quantity || 0);

                return (
                  <div
                    key={r.id}
                    className={`p-3 rounded border ${
                      r.returned
                        ? "bg-green-500/10 border-green-400/30"
                        : "bg-white/5 border-white/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-white font-medium">
                          {r.itemName}
                          {r.size && (
                            <span className="text-white/70"> • Size: {r.size}</span>
                          )}
                          <span className="text-white/70"> • {r.level}</span>
                        </div>
                        <div className="text-white/70 text-sm">
                          {r.studentName} (ID: {r.studentNumber})
                        </div>
                        <div className="text-white/50 text-sm">
                          Qty: {r.quantity} • Class: {r.className}
                        </div>

                        {Number(r.itemPrice || 0) > 0 && (
                          <>
                            {!r.returned ? (
                              <div
                                className={`text-xs mt-1 ${
                                  r.paid ? "text-green-400" : "text-yellow-300"
                                }`}
                              >
                                ₦{fmt(total)} — {r.paid ? "Paid" : "Pending"}
                              </div>
                            ) : (
                              <div className="text-xs mt-1 text-green-400">
                                ₦{fmt(total)} —{" "}
                                {r.refunded ? "Returned (Refunded)" : "Returned"}
                              </div>
                            )}
                          </>
                        )}

                        <div className="text-[11px] text-white/40 mt-1">
                          Out:{" "}
                          {r.dateCheckedOut?.toDate?.().toLocaleString() || "-"}
                          {r.returned &&
                            ` • Returned: ${
                              r.returnDate?.toDate?.().toLocaleString() || "-"
                            }`}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        {!r.returned &&
                          Number(r.itemPrice || 0) > 0 &&
                          !r.paid && (
                            <button
                              onClick={() => tx && markPaid(tx.id)}
                              className="text-xs bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 px-2 py-1 rounded flex items-center gap-1"
                            >
                              <CheckCircle size={12} /> Mark Paid
                            </button>
                          )}
                        {!r.returned && (
                          <button
                            onClick={() => tx && handleReturn(tx.id)}
                            className="text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 px-2 py-1 rounded flex items-center gap-1"
                          >
                            <ArrowLeftRight size={12} /> Return
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setShowDeleteConfirm({
                              type: "studentInv",
                              id: r.id,
                              payload: r,
                            })
                          }
                          className="text-xs bg-red-500/20 text-red-600 hover:bg-red-500/30 px-2 py-1 rounded flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>

      {/* delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9998]">
          <div className="bg-white/10 border border-white/20 rounded-2xl p-6 w/full max-w-sm">
            <div className="text-white text-lg font-semibold mb-2">
              Confirm action
            </div>
            <div className="text-white/80 mb-4">
              {showDeleteConfirm.type === "folder"
                ? "Delete this folder? It must be empty."
                : showDeleteConfirm.type === "item"
                ? "Delete this item? This does not affect past transactions."
                : "Delete this student inventory record? If not returned, stock will be restored. If paid, a refund will be logged and the related transaction will be removed."}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 rounded bg-white/10 border border-white/20 text-white hover:bg-white/20"
                onClick={() => setShowDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-red-600 text-red-600 hover:bg-red-700 flex items-center justify-center gap-2"
                disabled={loading}
                onClick={async () => {
                  if (showDeleteConfirm.type === "item") {
                    await deleteItem(showDeleteConfirm.id);
                  } else if (showDeleteConfirm.type === "folder") {
                    await deleteFolder(showDeleteConfirm.id);
                  } else if (showDeleteConfirm.type === "studentInv") {
                    await deleteStudentInventory(showDeleteConfirm.payload);
                  }
                }}
              >
                {loading ? (
                  <>
                    <Spinner /> <span>Working…</span>
                  </>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar scrollbar theme */}
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 8px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(128, 85, 247, 0.35);
          border-radius: 9999px;
          border: 2px solid rgba(255,255,255,0.15);
        }
        .custom-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(128, 85, 247, 0.55);
        }
        /* Firefox */
        .custom-scroll { scrollbar-width: thin; scrollbar-color: rgba(128,85,247,0.55) transparent; }
      `}</style>
    </>
  );
}
