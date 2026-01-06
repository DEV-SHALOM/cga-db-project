import {
  useEffect,
  useState,
  useMemo,
  Fragment,
  useDeferredValue,
} from "react";
import {
  FaChevronDown,
  FaPlus,
  FaTrash,
  FaFilePdf,
  FaUsers,
  FaDollarSign,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";
import { Listbox } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection,
  addDoc,
  deleteDoc,
  onSnapshot,
  doc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useActiveTerm } from "../hooks/useActiveTerm";

/* --------------------------- FEES TABLE --------------------------- */
const schoolFees = {
  "Pre-Kg": 35000,
  "Nursery 1": 40000,
  "Nursery 2": 42000,
  "Nursery 3": 42000,
  "Basic 1": 45000,
  "Basic 2": 45000,
  "Basic 3": 46000,
  "Basic 4": 47000,
  "Basic 5": 47000,
  "JSS1 A": 50000,
  "JSS1 B": 50000,
  "JSS2 A": 52000,
  "JSS2 B": 51000,
  "JSS3 A": 53000,
  "JSS3 B": 51000,
  "SS1 A": 50000,
  "SS1 B": 50000,
  "SS2 A (Science)": 52000,
  "SS2 B (Arts and Social Sciences)": 51000,
  "SS3 A (Science)": 53000,
  "SS3 B (Arts and Social Sciences)": 51000,
};

/* ------------------------ CLASS STRUCTURE ------------------------- */
const makeAB = (prefix, count) =>
  Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return [`${prefix} ${n} A`, `${prefix} ${n} B`];
  }).flat();

const classStructure = [
  { section: "Pre-Kg", classes: ["Pre-Kg"] },
  { section: "Nursery", classes: makeAB("Nursery", 3) },
  { section: "Basic", classes: makeAB("Basic", 5) },
  {
    section: "Junior Secondary (JS)",
    classes: ["JS1 A", "JS1 B", "JS2 A", "JS2 B", "JS3 A", "JS3 B"],
  },
  {
    section: "Senior Secondary (SS)",
    classes: [
      "SS1 A",
      "SS1 B",
      "SS2 A (Science)",
      "SS2 B (Arts and Social Sciences)",
      "SS3 A (Science)",
      "SS3 B (Arts and Social Sciences)",
    ],
  },
];

const allClasses = classStructure.flatMap((s) => s.classes);

/* ----------------------------- Helpers ---------------------------- */
function resolveFeeKey(className) {
  if (schoolFees[className] != null) return className;
  const abNormalized = className.replace(/\s+[AB]$/, "");
  if (schoolFees[abNormalized] != null) return abNormalized;
  const alt = className.replace(/^JS/, "JSS");
  if (schoolFees[alt] != null) return alt;
  const altAB = abNormalized.replace(/^JS/, "JSS");
  if (schoolFees[altAB] != null) return altAB;
  return className;
}
const getFeeAmount = (className) => schoolFees[resolveFeeKey(className)] || 0;

const fmtNaira = (n) => `₦${Number(n || 0).toLocaleString()}`;

function formatDate(ts) {
  if (!ts) return "";
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB");
}
function formatTime(ts) {
  if (!ts) return "";
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function statusFromTotals(totalPaid, fee) {
  if (fee <= 0) return "N/A";
  if (totalPaid >= fee) return "Paid";
  if (totalPaid > 0) return "Owing";
  return "Not Paid";
}

function Notification({ message }) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -20, opacity: 0 }}
      className="fixed top-6 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-600 to-red-700 text-white px-8 py-4 rounded-xl shadow-2xl z-[9999] border border-red-500/50 backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <FaExclamationTriangle className="text-white" />
        <span className="font-medium">{message}</span>
      </div>
    </motion.div>
  );
}

function StudentDropdown({ value, onChange, options, disabled = false }) {
  const validOptions = options.filter((o) => !!o.studentId);
  const selected = validOptions.find((s) => s.studentId === value);

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className="relative">
        <Listbox.Button
          className={`w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white font-medium flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all ${
            disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-white/15"
          }`}
          aria-label="Select student"
        >
          {selected
            ? `${selected.studentId} - ${selected.name}`
            : "Select Student"}
          <FaChevronDown className="ml-2 text-white/70" />
        </Listbox.Button>
        <div className="absolute inset-x-0 top-full z-50 pt-2">
          <Listbox.Options className="max-h-[70vh] overflow-auto rounded-xl shadow-2xl bg-gradient-to-br from-[#1a1038] via-[#241a44] to-[#1b1740] backdrop-blur-xl border border-purple-500/30">
            {validOptions.length === 0 && (
              <Listbox.Option
                value=""
                disabled
                className="px-6 py-3 text-white/80"
              >
                No students available
              </Listbox.Option>
            )}
            {validOptions.map((option) => (
              <Listbox.Option
                key={option.studentId}
                value={option.studentId}
                className={({ active }) =>
                  `cursor-pointer select-none px-6 py-3 text-base font-semibold text-white transition-colors ${
                    active ? "bg-purple-600/30" : ""
                  }`
                }
              >
                {option.studentId} - {option.name} (
                {option.gender === "M" ? "Male" : "Female"}, Age: {option.age})
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </div>
      </div>
    </Listbox>
  );
}

/* ============================== PAGE =============================== */
export default function FeesPage() {
  const [openSection, setOpenSection] = useState("");
  const [fees, setFees] = useState({});
  const [studentsByClass, setStudentsByClass] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [activeClass, setActiveClass] = useState("");
  const [form, setForm] = useState({ studentId: "", amountPaid: "" });
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingIds, setDeletingIds] = useState({});
  const termId = useActiveTerm();

  // Students by class
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "students"), (snap) => {
      const byClass = {};
      snap.docs.forEach((doc) => {
        const data = doc.data();
        if (!data.studentId) return;
        if (!byClass[data.className]) byClass[data.className] = [];
        byClass[data.className].push({ ...data, id: doc.id });
      });
      Object.keys(byClass).forEach((c) =>
        byClass[c].sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      );
      setStudentsByClass(byClass);
    });
    return () => unsub();
  }, []);

  // Payments per class
  useEffect(() => {
    if (!termId) return () => {};
    const unsubscribes = [];

    allClasses.forEach((className) => {
      const qy = query(
        collection(db, "payments"),
        where("className", "==", className),
        where("termId", "==", termId)
      );
      const unsub = onSnapshot(qy, (snap) => {
        const arr = snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        arr.sort((a, b) => {
          const nameCmp = (a.name || "").localeCompare(b.name || "");
          if (nameCmp !== 0) return nameCmp;
          const da = a.date?.toMillis?.() ?? 0;
          const dbm = b.date?.toMillis?.() ?? 0;
          return da - dbm;
        });
        setFees((prev) => ({ ...prev, [className]: arr }));
      });

      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u && u());
  }, [termId]);

  // Totals map
  const totalsByClass = useMemo(() => {
    const totals = {};
    for (const className of allClasses) {
      const list = fees[className] || [];
      const byStudent = {};
      list.forEach((r) => {
        if (!byStudent[r.studentId]) byStudent[r.studentId] = 0;
        byStudent[r.studentId] += Number(r.amount || 0);
      });
      totals[className] = byStudent;
    }
    return totals;
  }, [fees]);

  // Calculate global stats
  const globalStats = useMemo(() => {
    let totalCollected = 0;
    let totalOutstanding = 0;
    let totalPaidStudents = 0;
    let totalDebtors = 0;

    for (const className of allClasses) {
      const feeAmount = getFeeAmount(className);
      const students = studentsByClass[className] || [];
      const totals = totalsByClass[className] || {};

      students.forEach((s) => {
        const paid = totals[s.studentId] || 0;
        totalCollected += paid;
        const remaining = Math.max(feeAmount - paid, 0);
        totalOutstanding += remaining;

        if (paid >= feeAmount) totalPaidStudents++;
        else if (paid > 0 || remaining > 0) totalDebtors++;
      });
    }

    return {
      totalCollected,
      totalOutstanding,
      totalPaidStudents,
      totalDebtors,
    };
  }, [studentsByClass, totalsByClass]);

  const getUnpaidStudents = (className) => {
    const feeAmount = getFeeAmount(className);
    const studs = studentsByClass[className] || [];
    const totals = totalsByClass[className] || {};
    return studs.filter((s) => (totals[s.studentId] || 0) < feeAmount);
  };

  const openAddForClass = (className) => {
    const unpaid = getUnpaidStudents(className);
    if (unpaid.length === 0) {
      setNotification("All students in this class have fully paid.");
      setTimeout(() => setNotification(null), 2500);
      return;
    }
    setShowAdd(true);
    setActiveClass(className);
    setForm({ studentId: "", amountPaid: "" });
  };

  // ==================== PRINT/EXPORT HELPERS ====================
  const buildClassRows = (className) => {
    const feeAmount = getFeeAmount(className);
    const students = (studentsByClass[className] || [])
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const validIds = new Set(students.map((s) => s.studentId));
    const payments = (fees[className] || []).filter((p) =>
      validIds.has(p.studentId)
    );

    const byStudent = new Map();
    students.forEach((s) =>
      byStudent.set(s.studentId, { student: s, payments: [] })
    );
    payments.forEach((p) => {
      const entry = byStudent.get(p.studentId);
      if (entry) entry.payments.push(p);
    });

    const rows = [];
    for (const { student, payments } of byStudent.values()) {
      payments.sort(
        (a, b) => (a.date?.toMillis?.() ?? 0) - (b.date?.toMillis?.() ?? 0)
      );
      const totalPaid = payments.reduce(
        (acc, p) => acc + Number(p.amount || 0),
        0
      );
      const remaining = Math.max(feeAmount - totalPaid, 0);
      const status = statusFromTotals(totalPaid, feeAmount);
      const last = payments[payments.length - 1];
      rows.push({
        id: student.studentId,
        name: student.name || "",
        totalPaid,
        remaining,
        status,
        lastDate: last?.date ?? null,
      });
    }

    return { feeAmount, rows };
  };

  const formatDT = (ts) => {
    if (!ts) return "—";
    return `${formatDate(ts)} ${formatTime(ts)}`;
  };

  const escapeHtml = (s = "") =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const wrapPrintHTML = (title, tableHTML, footerHTML = "") => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { --ink:#111; --muted:#666; --line:#ddd; --bg:#fff; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji"; margin: 20px; color: var(--ink); background: var(--bg); }
    h1 { font-size: 20px; margin: 0 0 10px; }
    .sub { color: var(--muted); font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; border-bottom: 2px solid var(--ink); padding: 8px 6px; font-size: 12px; }
    tbody td { border-bottom: 1px solid var(--line); padding: 8px 6px; font-size: 12px; }
    tfoot td { padding: 8px 6px; font-size: 12px; }
    .right { text-align: right; }
    .status-paid { color: #0a7a29; font-weight: 600; }
    .status-owing { color: #b08900; font-weight: 600; }
    .status-not { color: #b00020; font-weight: 600; }
    .muted { color: var(--muted); }
    .totals { margin-top: 10px; font-size: 12px; }
    @media print {
      @page { size: A4 portrait; margin: 12mm; }
      .noprint { display: none !important; }
    }
    .toolbar { margin: 8px 0 16px; }
    .toolbar button { padding: 6px 10px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="toolbar noprint">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  ${tableHTML}
  ${footerHTML}
  <script>window.addEventListener('load', () => { try { window.print(); } catch(_) {} });</script>
</body>
</html>`;

  const generateBroadsheetHTML = (className) => {
    const now = new Date();
    const { feeAmount, rows } = buildClassRows(className);

    let paidCount = 0,
      debtorsCount = 0,
      outstanding = 0;
    rows.forEach((r) => {
      if (r.status === "Paid") paidCount++;
      else {
        debtorsCount++;
        outstanding += r.remaining;
      }
    });

    const header = `
      <h1>Class Broadsheet — ${escapeHtml(className)}</h1>
      <div class="sub">Fee: ${escapeHtml(
        fmtNaira(feeAmount)
      )} • Generated: ${now.toLocaleString()}</div>
    `;

    const body = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Student ID</th>
            <th>Name</th>
            <th class="right">Total Paid</th>
            <th class="right">Remaining</th>
            <th>Status</th>
            <th>Last Payment</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(r.id)}</td>
              <td>${escapeHtml(r.name)}</td>
              <td class="right">${escapeHtml(fmtNaira(r.totalPaid))}</td>
              <td class="right">${escapeHtml(fmtNaira(r.remaining))}</td>
              <td class="${
                r.status === "Paid"
                  ? "status-paid"
                  : r.status === "Owing"
                  ? "status-owing"
                  : r.status === "Not Paid"
                  ? "status-not"
                  : "muted"
              }">${escapeHtml(r.status)}</td>
              <td>${escapeHtml(formatDT(r.lastDate))}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    const footer = `
      <div class="totals">
        Total students: ${
          rows.length
        } • Paid: ${paidCount} • Debtors: ${debtorsCount} • Outstanding: <strong>${escapeHtml(
      fmtNaira(outstanding)
    )}</strong>
      </div>
    `;

    return wrapPrintHTML(`Broadsheet - ${className}`, header + body, footer);
  };

  const generateDebtorsHTML = (className) => {
    const now = new Date();
    const { feeAmount, rows } = buildClassRows(className);
    const debtors = rows.filter((r) => r.remaining > 0);

    const header = `
      <h1>Debtors — ${escapeHtml(className)}</h1>
      <div class="sub">Fee: ${escapeHtml(
        fmtNaira(feeAmount)
      )} • Generated: ${now.toLocaleString()}</div>
    `;

    const body = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Student ID</th>
            <th>Name</th>
            <th class="right">Total Paid</th>
            <th class="right">Remaining</th>
            <th>Status</th>
            <th>Last Payment</th>
          </tr>
        </thead>
        <tbody>
          ${debtors
            .map(
              (r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(r.id)}</td>
              <td>${escapeHtml(r.name)}</td>
              <td class="right">${escapeHtml(fmtNaira(r.totalPaid))}</td>
              <td class="right"><strong>${escapeHtml(
                fmtNaira(r.remaining)
              )}</strong></td>
              <td class="${
                r.status === "Paid"
                  ? "status-paid"
                  : r.status === "Owing"
                  ? "status-owing"
                  : r.status === "Not Paid"
                  ? "status-not"
                  : "muted"
              }">${escapeHtml(r.status)}</td>
              <td>${escapeHtml(formatDT(r.lastDate))}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      ${debtors.length === 0 ? '<p class="muted">No debtors 🎉</p>' : ""}
    `;

    return wrapPrintHTML(`Debtors - ${className}`, header + body);
  };

  // ADD payment with overpay guard
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const studentList = studentsByClass[activeClass] || [];
    const student = studentList.find(
      (s) => s.studentId === form.studentId && !!s.studentId
    );
    const amountPaid = parseInt(form.amountPaid) || 0;
    const feeAmount = getFeeAmount(activeClass);

    if (!student) {
      setNotification("Please select a valid student with a Student ID.");
      setTimeout(() => setNotification(null), 2500);
      return;
    }
    if (amountPaid < 0) {
      setNotification("Amount cannot be negative.");
      setTimeout(() => setNotification(null), 2500);
      return;
    }

    const totalPaidBefore =
      totalsByClass[activeClass]?.[student.studentId] || 0;

    if (totalPaidBefore + amountPaid > feeAmount) {
      const remaining = Math.max(feeAmount - totalPaidBefore, 0);
      setNotification(
        `Overpayment blocked. Remaining for ${student.name} is ${fmtNaira(
          remaining
        )}.`
      );
      setTimeout(() => setNotification(null), 3200);
      return;
    }

    const totalAfter = totalPaidBefore + amountPaid;
    setIsSubmitting(true);
    try {
      const now = Timestamp.fromDate(new Date());
      const payload = {
        studentId: student.studentId,
        name: student.name,
        className: activeClass,
        amount: amountPaid,
        date: now,
        totalAfter,
        remainingAfter: Math.max(feeAmount - totalAfter, 0),
        statusAfter: statusFromTotals(totalAfter, feeAmount),
        termId,
      };
      await addDoc(collection(db, "payments"), payload);
      setShowAdd(false);
      setForm({ studentId: "", amountPaid: "" });
    } catch (err) {
      setNotification("Error saving payment: " + err.message);
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (className, id) => {
    if (deletingIds[id]) return;
    try {
      setDeletingIds((prev) => ({ ...prev, [id]: true }));
      await deleteDoc(doc(db, "payments", id));
    } catch (err) {
      setNotification("Error deleting payment: " + err.message);
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setDeletingIds((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    }
  };

  const handleGenerateBroadsheet = (className) => {
    const html = generateBroadsheetHTML(className);
    const win = window.open("", "_blank");
    if (!win) {
      setNotification("Popup blocked. Allow popups to view/download the PDF.");
      setTimeout(() => setNotification(null), 3500);
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const handleGenerateDebtors = (className) => {
    const html = generateDebtorsHTML(className);
    const win = window.open("", "_blank");
    if (!win) {
      setNotification("Popup blocked. Allow popups to view/download the PDF.");
      setTimeout(() => setNotification(null), 3500);
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const unpaidOptions = useMemo(
    () => (activeClass ? getUnpaidStudents(activeClass) : []),
    [activeClass, studentsByClass, totalsByClass]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen py-4 md:py-8 px-3 md:px-6 lg:px-8"
    >
      <div className="max-w-7xl mx-auto font-[Poppins]">
        <AnimatePresence>
          {notification && <Notification message={notification} />}
        </AnimatePresence>

        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-6 md:mb-8"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-4 drop-shadow-lg">
            Student Fee Management
          </h1>

          {/* Quick Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border border-emerald-400/30 rounded-xl px-4 py-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-emerald-300/80 text-xs font-medium mb-1">
                    Total Collected
                  </div>
                  <div className="text-white text-xl font-bold">
                    {fmtNaira(globalStats.totalCollected)}
                  </div>
                </div>
                <FaDollarSign className="text-emerald-400 text-3xl" />
              </div>
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-rose-500/20 to-rose-600/20 border border-rose-400/30 rounded-xl px-4 py-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-rose-300/80 text-xs font-medium mb-1">
                    Outstanding
                  </div>
                  <div className="text-white text-xl font-bold">
                    {fmtNaira(globalStats.totalOutstanding)}
                  </div>
                </div>
                <FaExclamationTriangle className="text-rose-400 text-3xl" />
              </div>
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-400/30 rounded-xl px-4 py-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-green-300/80 text-xs font-medium mb-1">
                    Fully Paid
                  </div>
                  <div className="text-white text-xl font-bold">
                    {globalStats.totalPaidStudents}
                  </div>
                </div>
                <FaCheckCircle className="text-green-400 text-3xl" />
              </div>
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-400/30 rounded-xl px-4 py-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-amber-300/80 text-xs font-medium mb-1">
                    Debtors
                  </div>
                  <div className="text-white text-xl font-bold">
                    {globalStats.totalDebtors}
                  </div>
                </div>
                <FaUsers className="text-amber-400 text-3xl" />
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Sections */}
        <div className="space-y-6">
          {classStructure.map((section, idx) => (
            <SectionBlock
              key={section.section}
              section={section}
              openSection={openSection}
              setOpenSection={setOpenSection}
              fees={fees}
              studentsByClass={studentsByClass}
              onAdd={(cls) => {
                setActiveClass(cls);
                openAddForClass(cls);
              }}
              onDelete={handleDelete}
              deletingIds={deletingIds}
              onGenerateBroadsheet={handleGenerateBroadsheet}
              onGenerateDebtors={handleGenerateDebtors}
              delay={idx * 0.1}
            />
          ))}
        </div>
      </div>

      {showAdd && (
        <AddPaymentModal
          isSubmitting={isSubmitting}
          unpaidOptions={unpaidOptions}
          form={form}
          setForm={setForm}
          onClose={() => {
            setShowAdd(false);
            setForm({ studentId: "", amountPaid: "" });
          }}
          onSubmit={handleSubmit}
          activeClass={activeClass}
        />
      )}
    </motion.div>
  );
}

/* ============================== Subcomponents =============================== */
function SectionBlock({
  section,
  openSection,
  setOpenSection,
  fees,
  studentsByClass,
  onAdd,
  onDelete,
  deletingIds,
  onGenerateBroadsheet,
  onGenerateDebtors,
  delay,
}) {
  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-2xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md shadow-xl border border-white/20 p-5 md:p-6"
    >
      <button
        className={`flex items-center w-full justify-between px-5 py-4 rounded-xl text-xl md:text-2xl font-bold text-white transition-all ${
          openSection === section.section
            ? "bg-gradient-to-r from-purple-600/30 to-purple-700/30 border border-purple-400/30 shadow-lg"
            : "bg-white/5 border border-white/20 hover:bg-white/10"
        }`}
        onClick={() =>
          setOpenSection(openSection === section.section ? "" : section.section)
        }
        aria-expanded={openSection === section.section}
      >
        <div className="flex items-center gap-3">
          <FaUsers className="text-purple-400" />
          <span>{section.section}</span>
        </div>
        <FaChevronDown
          className={`transition-transform ${
            openSection === section.section ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {openSection === section.section && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex flex-col gap-5 mt-5">
              {section.classes.map((cls) => (
                <FeeSectionTable
                  key={cls}
                  className={cls}
                  fees={fees}
                  students={studentsByClass[cls] || []}
                  onAdd={() => onAdd(cls)}
                  onDelete={onDelete}
                  deletingIds={deletingIds}
                  onGenerateBroadsheet={onGenerateBroadsheet}
                  onGenerateDebtors={onGenerateDebtors}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function AddPaymentModal({
  isSubmitting,
  unpaidOptions,
  form,
  setForm,
  onClose,
  onSubmit,
  activeClass,
}) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[999] p-4 overflow-y-auto">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-lg bg-gradient-to-br from-[#1a1038] via-[#241a44] to-[#1b1740] p-6 rounded-2xl shadow-2xl border border-purple-500/30"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <FaPlus className="text-purple-400" size={20} />
              </div>
              <div>
                <h3 className="font-bold text-xl text-white">Add Payment</h3>
                <p className="text-white/70 text-sm">
                  Class:{" "}
                  <span className="text-white font-semibold">
                    {activeClass}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-5 mt-6">
            <StudentDropdown
              value={form.studentId}
              onChange={(val) => setForm((f) => ({ ...f, studentId: val }))}
              options={unpaidOptions}
              disabled={isSubmitting || unpaidOptions.length === 0}
            />
            {unpaidOptions.length === 0 && (
              <p className="text-white/70 text-sm -mt-2">
                All students in this class are fully paid.
              </p>
            )}

            <div>
              <label className="block text-sm font-semibold text-white/90 mb-2">
                Amount Paid (₦)
              </label>
              <input
                type="number"
                placeholder={`e.g., ${getFeeAmount(activeClass) || 0}`}
                value={form.amountPaid}
                min={0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amountPaid: e.target.value }))
                }
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                required
                disabled={isSubmitting || unpaidOptions.length === 0}
              />
              <p className="text-xs text-white/60 mt-1">
                Class fee: {fmtNaira(getFeeAmount(activeClass))}
              </p>
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors font-medium"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                disabled={isSubmitting || unpaidOptions.length === 0}
              >
                {isSubmitting ? "Saving..." : "Add Payment"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/* ======================= Grouped table component ======================= */
function FeeSectionTable({
  className,
  fees,
  students,
  onAdd,
  onDelete,
  deletingIds,
  onGenerateBroadsheet,
  onGenerateDebtors,
}) {
  const feeAmount = getFeeAmount(className);

  const validStudentIds = new Set(students.map((s) => s.studentId));
  const classPayments = (fees[className] || []).filter((r) =>
    validStudentIds.has(r.studentId)
  );
  classPayments.sort(
    (a, b) => (a.date?.toMillis?.() ?? 0) - (b.date?.toMillis?.() ?? 0)
  );

  const grouped = new Map();
  students
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .forEach((st) => {
      grouped.set(st.studentId, { student: st, payments: [] });
    });
  classPayments.forEach((p) => {
    if (!grouped.has(p.studentId)) return;
    grouped.get(p.studentId).payments.push(p);
  });

  const stats = useMemo(() => {
    let paid = 0,
      debtors = 0,
      outstanding = 0;
    for (const { payments } of grouped.values()) {
      const total = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
      const status = statusFromTotals(total, feeAmount);
      if (status === "Paid") paid += 1;
      else {
        debtors += 1;
        const balance = Math.max(feeAmount - total, 0);
        outstanding += balance;
      }
    }
    return { total: students.length, paid, debtors, outstanding };
  }, [grouped, feeAmount, students.length]);

  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const list = useMemo(() => {
    let arr = [...grouped.values()];
    if (filter !== "ALL") {
      arr = arr.filter(({ payments }) => {
        const total = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
        const st = statusFromTotals(total, feeAmount);
        return filter === "DEBTORS" ? st !== "Paid" : st === "Paid";
      });
    }
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter(({ student }) => {
      const name = String(student.name || "").toLowerCase();
      const id = String(student.studentId || "").toLowerCase();
      const phone = String(student.parentPhone || "").toLowerCase();
      return name.includes(q) || id.includes(q) || (phone && phone.includes(q));
    });
  }, [grouped, filter, feeAmount, deferredSearch]);

  const [open, setOpen] = useState({});
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const Pill = ({ active, children, onClick }) => (
    <button
      onClick={onClick}
      className={`text-xs sm:text-sm px-3 py-1.5 rounded-full font-medium transition-all ${
        active
          ? "bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-md"
          : "bg-white/10 text-white border border-white/20 hover:bg-white/20"
      }`}
    >
      {children}
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl bg-white/5 backdrop-blur-sm shadow-lg border border-white/10 p-4 sm:p-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-lg sm:text-xl font-bold text-white">
              {className}
            </span>
            <span className="text-xs bg-gradient-to-r from-purple-600 to-purple-700 text-white px-2.5 py-1 rounded-full font-semibold">
              {list.length} / {stats.total}
            </span>
          </div>
          <p className="text-sm text-white/80">
            Class Fee:{" "}
            <span className="font-semibold">{fmtNaira(feeAmount)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold shadow-lg transition-all"
            onClick={onAdd}
          >
            <FaPlus /> Add Payment
          </button>
          <button
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/20 transition-all"
            onClick={() => onGenerateDebtors(className)}
            title="Print debtors list"
          >
            <FaFilePdf /> Debtors
          </button>
          <button
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/20 transition-all"
            onClick={() => onGenerateBroadsheet(className)}
            title="Print broadsheet"
          >
            <FaFilePdf /> Broadsheet
          </button>
        </div>
      </div>

      {/* Filter + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill active={filter === "ALL"} onClick={() => setFilter("ALL")}>
            All ({stats.total})
          </Pill>
          <Pill
            active={filter === "DEBTORS"}
            onClick={() => setFilter("DEBTORS")}
          >
            Debtors ({stats.debtors})
          </Pill>
          <Pill active={filter === "PAID"} onClick={() => setFilter("PAID")}>
            Paid ({stats.paid})
          </Pill>
        </div>

        <div className="sm:ml-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full sm:w-64 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>
      </div>

      <div className="text-sm text-white/70 mb-3">
        Outstanding:{" "}
        <strong className="text-white">{fmtNaira(stats.outstanding)}</strong>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-white/20">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-purple-600/30 to-purple-700/30 border-b border-white/20">
              <th className="px-4 py-3 text-left text-white font-semibold">
                ID
              </th>
              <th className="px-4 py-3 text-left text-white font-semibold">
                Name
              </th>
              <th className="px-4 py-3 text-left text-white font-semibold">
                Total Paid
              </th>
              <th className="px-4 py-3 text-left text-white font-semibold">
                Remaining
              </th>
              <th className="px-4 py-3 text-left text-white font-semibold">
                Status
              </th>
              <th className="px-4 py-3 text-left text-white font-semibold">
                Last Payment
              </th>
              <th className="px-4 py-3 text-left text-white font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {list.map(({ student, payments }) => {
              let total = 0;
              payments.forEach((p) => (total += Number(p.amount || 0)));
              const remaining = Math.max(feeAmount - total, 0);
              const status = statusFromTotals(total, feeAmount);
              const last = payments[payments.length - 1];

              return (
                <Fragment key={student.studentId}>
                  <tr
                    className="bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                    onClick={() => toggle(student.studentId)}
                  >
                    <td className="px-4 py-3 text-white">
                      {student.studentId}
                    </td>
                    <td className="px-4 py-3 text-white">{student.name}</td>
                    <td className="px-4 py-3 text-white">{fmtNaira(total)}</td>
                    <td className="px-4 py-3 text-white">
                      {fmtNaira(remaining)}
                    </td>
                    <td
                      className={`px-4 py-3 font-bold ${
                        status === "Paid"
                          ? "text-green-400"
                          : status === "Owing"
                          ? "text-yellow-400"
                          : "text-red-400"
                      }`}
                    >
                      {status}
                    </td>
                    <td className="px-4 py-3 text-white text-xs">
                      {last ? (
                        <>
                          {formatDate(last.date)}
                          <span className="block text-white/60">
                            {formatTime(last.date)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-white/10 px-2 py-1 rounded-md text-white">
                        {open[student.studentId] ? "Hide" : "Show"}
                      </span>
                    </td>
                  </tr>

                  {open[student.studentId] && (
                    <tr>
                      <td colSpan={7} className="px-4 pb-4">
                        <div className="mt-2 rounded-lg bg-white/5 border border-white/10 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-white/10">
                                <th className="px-3 py-2 text-left text-white/80">
                                  #
                                </th>
                                <th className="px-3 py-2 text-left text-white/80">
                                  Date/Time
                                </th>
                                <th className="px-3 py-2 text-left text-white/80">
                                  Amount
                                </th>
                                <th className="px-3 py-2 text-left text-white/80">
                                  Remaining
                                </th>
                                <th className="px-3 py-2 text-left text-white/80">
                                  Status
                                </th>
                                <th className="px-3 py-2 text-left text-white/80">
                                  Delete
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {payments.length === 0 ? (
                                <tr>
                                  <td
                                    className="px-3 py-3 text-white/70"
                                    colSpan={6}
                                  >
                                    No payments yet.
                                  </td>
                                </tr>
                              ) : (
                                (() => {
                                  let run = 0;
                                  return payments.map((p, i) => {
                                    run += Number(p.amount || 0);
                                    const rem = Math.max(feeAmount - run, 0);
                                    const st = statusFromTotals(run, feeAmount);
                                    return (
                                      <tr
                                        key={p.id}
                                        className="border-t border-white/10"
                                      >
                                        <td className="px-3 py-2 text-white">
                                          {i + 1}
                                        </td>
                                        <td className="px-3 py-2 text-white text-xs">
                                          {formatDate(p.date)}
                                          <span className="block text-white/60">
                                            {formatTime(p.date)}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-white">
                                          {fmtNaira(p.amount)}
                                        </td>
                                        <td className="px-3 py-2 text-white">
                                          {fmtNaira(rem)}
                                        </td>
                                        <td
                                          className={`px-3 py-2 font-semibold ${
                                            st === "Paid"
                                              ? "text-green-400"
                                              : st === "Owing"
                                              ? "text-yellow-400"
                                              : "text-red-400"
                                          }`}
                                        >
                                          {st}
                                        </td>
                                        <td className="px-3 py-2">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onDelete(className, p.id);
                                            }}
                                            className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-red-400 transition-all disabled:opacity-50"
                                            disabled={deletingIds[p.id]}
                                          >
                                            <FaTrash size={14} />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {list.map(({ student, payments }) => {
          let total = 0;
          payments.forEach((p) => (total += Number(p.amount || 0)));
          const remaining = Math.max(feeAmount - total, 0);
          const status = statusFromTotals(total, feeAmount);
          const last = payments[payments.length - 1];

          return (
            <div
              key={student.studentId}
              className="bg-white/5 rounded-xl p-4 border border-white/10"
            >
              <button
                className="w-full text-left"
                onClick={() => toggle(student.studentId)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-white">{student.name}</h3>
                    <p className="text-sm text-white/80">{student.studentId}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      status === "Paid"
                        ? "bg-green-500/20 text-green-400"
                        : status === "Owing"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-white/60">Total Paid</p>
                    <p className="text-white font-semibold">
                      {fmtNaira(total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/60">Remaining</p>
                    <p className="text-white font-semibold">
                      {fmtNaira(remaining)}
                    </p>
                  </div>
                </div>
              </button>

              {open[student.studentId] && (
                <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                  {payments.length === 0 ? (
                    <div className="text-white/70 text-sm">
                      No payments yet.
                    </div>
                  ) : (
                    (() => {
                      let run = 0;
                      return payments.map((p) => {
                        run += Number(p.amount || 0);
                        const rem = Math.max(feeAmount - run, 0);
                        return (
                          <div
                            key={p.id}
                            className="flex justify-between bg-white/5 rounded-lg px-3 py-2"
                          >
                            <div>
                              <div className="text-white font-semibold text-sm">
                                {fmtNaira(p.amount)}
                              </div>
                              <div className="text-xs text-white/60">
                                {formatDate(p.date)} • {formatTime(p.date)}
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(className, p.id);
                              }}
                              className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-red-400 transition-all"
                              disabled={deletingIds[p.id]}
                            >
                              <FaTrash size={14} />
                            </button>
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
