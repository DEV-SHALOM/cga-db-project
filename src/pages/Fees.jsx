import { useEffect, useState, useMemo, Fragment } from "react";
import { FaChevronDown, FaPlus, FaTrash, FaFilePdf } from "react-icons/fa";
import { Listbox } from "@headlessui/react";
import { motion } from "framer-motion";
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

// --- SCHOOL FEES ---
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

const classStructure = [
  { section: "Pre-Kg", classes: ["Pre-Kg"] },
  { section: "Nursery", classes: ["Nursery 1", "Nursery 2", "Nursery 3"] },
  {
    section: "Junior Secondary (JS)",
    classes: ["JS1 A", "JS1 B", "JS2 A", "JS2 B", "JS3 A", "JS3 B"],
  },
  {
    section: "Basic",
    classes: ["Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5"],
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

// ---------- Helpers ----------
function resolveFeeKey(className) {
  if (schoolFees[className] != null) return className;
  // fix common alias: JS => JSS
  const alt = className.replace(/^JS/, "JSS");
  if (schoolFees[alt] != null) return alt;
  return className; // will fall back to 0 if unknown
}
const getFeeAmount = (className) => schoolFees[resolveFeeKey(className)] || 0;

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
const fmtNaira = (n) => `₦${Number(n || 0).toLocaleString()}`;

function statusFromTotals(totalPaid, fee) {
  if (fee <= 0) return "N/A";
  if (totalPaid >= fee) return "Paid";
  if (totalPaid > 0) return "Owing";
  return "Not Paid";
}

function Notification({ message }) {
  return (
    <div
      className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-8 py-3 rounded-xl shadow-2xl z-[9999] animate-pop-in"
      style={{
        animation:
          "pop-in 0.22s cubic-bezier(0.65,0,0.35,1), fade-out 0.8s 2.2s forwards",
      }}
    >
      {message}
      <style>{`
        @keyframes pop-in {
          0% { opacity: 0; transform: scale(0.8) translateX(-50%);} 
          100% { opacity: 1; transform: scale(1) translateX(-50%);} 
        }
        @keyframes fade-out { to { opacity: 0; transform: scale(0.96) translateX(-50%) translateY(-40px);} }
      `}</style>
    </div>
  );
}

function StudentDropdown({ value, onChange, options, disabled = false }) {
  const validOptions = options.filter((o) => !!o.studentId);
  const selected = validOptions.find((s) => s.studentId === value);

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className="relative">
        <Listbox.Button
          className={`w-full bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 border border-[#e7e2f8] rounded-lg px-4 py-2 text-white font-medium flex justify-between items-center focus:outline-none ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {selected
            ? `${selected.studentId} - ${selected.name}`
            : "Select Student"}
          <FaChevronDown className="ml-2 text-white" />
        </Listbox.Button>
        <Listbox.Options className="absolute mt-1 w-full rounded-xl shadow-2xl bg-gradient-to-tr from-[#1e0447]/80 via-[#372772]/90 to-[#181A2A]/90 backdrop-blur-2xl border border-white/30 z-50 max-h-60 overflow-auto">
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
                `cursor-pointer select-none px-6 py-3 text-base font-bold text-white drop-shadow ${
                  active ? "bg-[#8055f7]/40" : ""
                }`
              }
            >
              {option.studentId} - {option.name} (
              {option.gender === "M" ? "Male" : "Female"}, Age: {option.age})
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  );
}

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
        byClass[c].sort((a, b) => a.name.localeCompare(b.name))
      );
      setStudentsByClass(byClass);
    });
    return () => unsub();
  }, []);

  // Payments per class (history preserved)
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
        // sort by student name, then by date
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

  // ---------- Totals map for quick lookups ----------
  // totalsByClass[className][studentId] = totalPaid
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

  const getUnpaidStudents = (className) => {
    const feeAmount = getFeeAmount(className);
    const studs = studentsByClass[className] || [];
    const totals = totalsByClass[className] || {};
    return studs.filter((s) => (totals[s.studentId] || 0) < feeAmount);
  };

  // Open modal only if there are unpaid students in that class
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

  // ADD payment (always inserts new row) with overpay guard
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

    // hard cap: cannot exceed class fee
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
    const remainingAfter = Math.max(feeAmount - totalAfter, 0);
    const statusAfter = statusFromTotals(totalAfter, feeAmount);

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
        remainingAfter,
        statusAfter,
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

  // ---------- Broadsheet (all students) ----------
  const generateBroadsheetHTML = (className) => {
    const feeAmount = getFeeAmount(className);
    const students = (studentsByClass[className] || [])
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const payments = (fees[className] || []).slice();

    const payMap = new Map();
    payments.forEach((p) => {
      if (!payMap.has(p.studentId)) payMap.set(p.studentId, []);
      payMap.get(p.studentId).push(p);
    });

    const todayStr = new Date().toLocaleString("en-GB");

    const rowsHTML = students
      .map((st, idx) => {
        const history = (payMap.get(st.studentId) || []).sort(
          (a, b) => (a.date?.toMillis?.() ?? 0) - (b.date?.toMillis?.() ?? 0)
        );

        let running = 0;
        const historyRows =
          history.length === 0
            ? `<tr><td colspan="5" class="muted">No payments yet</td></tr>`
            : history
                .map((h, i) => {
                  running += Number(h.amount || 0);
                  const remaining =
                    h.remainingAfter ?? Math.max(feeAmount - running, 0);
                  const status =
                    h.statusAfter ?? statusFromTotals(running, feeAmount);
                  return `<tr>
                    <td>${i + 1}</td>
                    <td>${formatDate(h.date)} ${formatTime(h.date)}</td>
                    <td>${fmtNaira(h.amount)}</td>
                    <td>${fmtNaira(remaining)}</td>
                    <td>${status}</td>
                  </tr>`;
                })
                .join("");

        const totalPaid = running;
        const balance = Math.max(feeAmount - totalPaid, 0);
        const status = statusFromTotals(totalPaid, feeAmount);

        return `
        <section class="student-card">
          <div class="student-header">
            <div><strong>${idx + 1}. ${
          st.name || ""
        }</strong> <span class="muted">(${st.studentId || ""})</span></div>
            <div class="badge">${className}</div>
          </div>
          <div class="summary-grid">
            <div><span class="label">Class Fee</span><div class="value">${fmtNaira(
              feeAmount
            )}</div></div>
            <div><span class="label">Total Paid</span><div class="value">${fmtNaira(
              totalPaid
            )}</div></div>
            <div><span class="label">Balance</span><div class="value">${fmtNaira(
              balance
            )}</div></div>
            <div><span class="label">Status</span><div class="value ${status
              .toLowerCase()
              .replace(" ", "-")}">${status}</div></div>
          </div>
          <table class="history">
            <thead><tr><th>#</th><th>Date/Time</th><th>Amount</th><th>Remaining</th><th>Status</th></tr></thead>
            <tbody>${historyRows}</tbody>
          </table>
        </section>`;
      })
      .join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${className} – Fees Broadsheet</title>
  <style>
    :root{ --ink:#0b1021; --muted:#6b7280; --line:#e5e7eb; --accent:#6C4AB6; --paid:#16a34a; --owing:#f59e0b; --notpaid:#ef4444; }
    *{ box-sizing:border-box; }
    body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial; color:var(--ink); margin:32px; }
    header{ display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
    header h1{ margin:0; font-size:20px; }
    .muted{ color:var(--muted); }
    .badge{ background:var(--accent); color:#fff; padding:4px 10px; border-radius:999px; font-weight:600; font-size:12px; }
    .meta{ font-size:12px; color:var(--muted); }
    .student-card{ border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:16px; page-break-inside:avoid; }
    .student-header{ display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .summary-grid{ display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:12px; margin-bottom:10px; }
    .label{ font-size:11px; color:var(--muted); }
    .value{ font-weight:700; margin-top:2px; }
    .value.paid{ color:var(--paid); }
    .value.owing{ color:var(--owing); }
    .value.not-paid{ color:var(--notpaid); }
    table{ width:100%; border-collapse:collapse; }
    .history th, .history td{ border:1px solid var(--line); padding:8px; font-size:12px; text-align:left; }
    .history thead th{ background:#fafafa; }
    footer{ margin-top:24px; font-size:12px; color:var(--muted); display:flex; justify-content:space-between; }
    @media print{ body{ margin:16mm; } .print-hide{ display:none!important; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Fees Broadsheet – ${className}</h1>
      <div class="meta">Generated: ${todayStr}</div>
    </div>
    <button class="print-hide" onclick="window.print()" style="border:none;background:var(--accent);color:#fff;padding:8px 12px;border-radius:8px;cursor:pointer;">Print / Save as PDF</button>
  </header>
  ${rowsHTML || '<div class="muted">No students found for this class.</div>'}
  <footer>
    <div>Powered by your School Admin</div>
    <div>Signature: ______________________</div>
  </footer>
</body>
</html>`;
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

  // ---------- NEW: Debtors-only printable list ----------
  // ---------- Debtors-only printable list (NO "Total Paid" column) ----------
  const generateDebtorsHTML = (className) => {
    const feeAmount = getFeeAmount(className);
    const students = (studentsByClass[className] || [])
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const payments = (fees[className] || []).slice();

    // total paid per student
    const totals = new Map();
    payments.forEach((p) => {
      totals.set(
        p.studentId,
        (totals.get(p.studentId) || 0) + Number(p.amount || 0)
      );
    });

    // debtors only
    const debtors = students
      .map((st) => {
        const total = totals.get(st.studentId) || 0;
        const balance = Math.max(feeAmount - total, 0);
        const status = statusFromTotals(total, feeAmount);
        return { ...st, total, balance, status };
      })
      .filter((s) => s.status !== "Paid")
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const counts = {
      total: students.length,
      paid: students.length - debtors.length,
      debtors: debtors.length,
      outstanding: debtors.reduce((acc, d) => acc + d.balance, 0),
    };

    const todayStr = new Date().toLocaleString("en-GB");

    // Build table rows (no Total Paid cell)
    const rows = debtors
      .map(
        (s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${s.studentId || ""}</td>
        <td>${s.name || ""}</td>
        <td>${fmtNaira(s.balance)}</td>
        <td class="${s.status.toLowerCase().replace(" ", "-")}">${s.status}</td>
        <td></td>
      </tr>`
      )
      .join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${className} — Debtors List</title>
  <style>
    :root{ --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --accent:#6C4AB6; --paid:#16a34a; --owing:#f59e0b; --notpaid:#ef4444; }
    *{ box-sizing:border-box; }
    body{ font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Inter, Arial; color:var(--ink); margin:32px; }
    header{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:16px; }
    h1{ font-size:24px; margin:0; font-weight:800; letter-spacing:.2px; }
    .meta{ color:var(--muted); font-size:12px; margin-top:4px; }
    .chips{ display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
    .chip{ background:#f4f4f5; border:1px solid var(--line); border-radius:999px; padding:6px 10px; font-size:12px; font-weight:600; }
    .btn{ border:none; background:var(--accent); color:#fff; padding:10px 14px; border-radius:10px; cursor:pointer; }

    table{ width:100%; border-collapse:collapse; margin-top:10px; }
    th, td{ border:1px solid var(--line); padding:8px; text-align:left; font-size:12px; }
    thead th{ background:#fafafa; font-weight:700; }
    tfoot td{ font-weight:700; }

    /* status colors */
    td.paid{ color:var(--paid); }
    td.owing{ color:var(--owing); }
    td["not-paid"], td.not-paid{ color:var(--notpaid); }

    footer{ display:flex; justify-content:space-between; margin-top:24px; font-size:12px; color:var(--muted); }
    @media print{ body{ margin:16mm; } .print-hide{ display:none!important; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Debtors List — ${className}</h1>
      <div class="meta">Generated: ${todayStr}</div>
      <div class="chips">
        <span class="chip">Class size: ${counts.total}</span>
        <span class="chip">Paid: ${counts.paid}</span>
        <span class="chip">Debtors: ${counts.debtors}</span>
        <span class="chip">Outstanding: ${fmtNaira(counts.outstanding)}</span>
      </div>
    </div>
    <button class="btn print-hide" onclick="window.print()">Print / Save as PDF</button>
  </header>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Student ID</th>
        <th>Name</th>
        <th>Balance</th>
        <th>Status</th>
        <th>Teacher Remark / Signature</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="6">No debtors in this class. ✅</td></tr>'}
    </tbody>
    ${
      rows
        ? `<tfoot>
             <tr>
               <td colspan="3">Total Outstanding</td>
               <td>${fmtNaira(counts.outstanding)}</td>
               <td colspan="2"></td>
             </tr>
           </tfoot>`
        : ""
    }
  </table>

  <footer>
    <div>Class Teacher: ________________</div>
    <div>Proprietor/Proprietress: ________________</div>
  </footer>
</body>
</html>`;
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

  // Unpaid options for the activeClass (used in modal dropdown)
  const unpaidOptions = useMemo(() => {
    if (!activeClass) return [];
    return getUnpaidStudents(activeClass);
  }, [activeClass, studentsByClass, totalsByClass]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen w-full py-6 px-2 sm:px-8 pb-24"
    >
      {notification && <Notification message={notification} />}
      <div className="max-w-7xl mx-auto font-[Poppins]">
        <motion.h1
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="font-extrabold text-3xl sm:text-4xl text-white mb-10 text-center drop-shadow-lg tracking-wide"
        >
          Student Fee Management
        </motion.h1>

        <div className="space-y-8">
          {classStructure.map((section) => (
            <motion.div
              key={section.section}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl shadow-2xl border border-white/30 p-6 transition-all"
            >
              <button
                className={`flex items-center w-full justify-between px-4 py-3 rounded-xl text-2xl font-bold text-white
                  ${
                    openSection === section.section
                      ? "bg-[#1e007273] backdrop-blur-lg shadow-xl"
                      : ""
                  }
                  hover:bg-white/20 hover:backdrop-blur-lg focus:outline-none transition mb-2`}
                onClick={() =>
                  setOpenSection(
                    openSection === section.section ? "" : section.section
                  )
                }
                style={{
                  boxShadow:
                    openSection === section.section
                      ? "0 6px 32px 0 rgba(56, 26, 112, 0.16)"
                      : undefined,
                }}
              >
                <span className="tracking-wide">{section.section}</span>
                <FaChevronDown
                  className={`ml-2 transition-transform ${
                    openSection === section.section ? "rotate-180" : ""
                  }`}
                />
              </button>

              <div
                className={`transition-all duration-300 overflow-hidden ${
                  openSection === section.section ? "py-2" : "max-h-0 p-0"
                }`}
                style={{
                  maxHeight: openSection === section.section ? "2000px" : "0px",
                }}
              >
                <div className="flex flex-col gap-6 mt-3">
                  {section.classes.map((className) => (
                    <FeeSectionTable
                      key={className}
                      className={className}
                      fees={fees}
                      students={studentsByClass[className] || []}
                      onAdd={() => openAddForClass(className)}
                      onDelete={handleDelete}
                      deletingIds={deletingIds}
                      onGenerateBroadsheet={handleGenerateBroadsheet}
                      onGenerateDebtors={handleGenerateDebtors}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-[95vw] sm:max-w-md md:max-w-lg bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl p-6 rounded-2xl shadow-2xl border border-white/30"
            >
              <h3 className="font-bold text-xl mb-4 text-[#ffffff]">
                Add Payment
              </h3>

              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <StudentDropdown
                  value={form.studentId}
                  onChange={(val) => setForm((f) => ({ ...f, studentId: val }))}
                  options={unpaidOptions}
                  disabled={isSubmitting || unpaidOptions.length === 0}
                />
                {unpaidOptions.length === 0 && (
                  <p className="text-white/70 text-sm -mt-3">
                    All students in this class are fully paid.
                  </p>
                )}

                <input
                  type="number"
                  placeholder={`Amount Paid (₦, fee: ₦${
                    getFeeAmount(activeClass) || 0
                  })`}
                  value={form.amountPaid}
                  min={0}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amountPaid: e.target.value }))
                  }
                  className="border border-[#e7e2f8] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#8055f7] bg-white/10 text-white"
                  required
                  disabled={isSubmitting || unpaidOptions.length === 0}
                />
                <div className="flex gap-3 justify-end mt-2">
                  <button
                    type="button"
                    className="px-4 py-1.5 bg-gray-100 text-red-500 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
                    onClick={() => {
                      setShowAdd(false);
                      setForm({ studentId: "", amountPaid: "" });
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-1.5 bg-[#6C4AB6] text-white font-semibold rounded-lg hover:bg-[#8055f7] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"
                    disabled={isSubmitting || unpaidOptions.length === 0}
                  >
                    {isSubmitting ? "Saving..." : "Add Payment"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// =======================
// Grouped table component
// =======================
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

  // Map student -> payments (sorted by date asc)
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

  // Quick stats + separation
  const stats = useMemo(() => {
    let paid = 0,
      debtors = 0,
      outstanding = 0;
    for (const { student, payments } of grouped.values()) {
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

  // Filter: ALL | DEBTORS | PAID
  const [filter, setFilter] = useState("ALL");

  const list = useMemo(() => {
    const arr = [...grouped.values()];
    if (filter === "ALL") return arr;
    return arr.filter(({ payments }) => {
      const total = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
      const st = statusFromTotals(total, feeAmount);
      return filter === "DEBTORS" ? st !== "Paid" : st === "Paid";
    });
  }, [grouped, filter, feeAmount]);

  // Expand/collapse per student
  const [open, setOpen] = useState({});
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const totalStudents = students.length;

  const Pill = ({ active, children, onClick }) => (
    <button
      onClick={onClick}
      className={`text-xs sm:text-sm px-3 py-1.5 rounded-full border transition ${
        active
          ? "bg-[#6C4AB6] text-white border-transparent"
          : "bg-white/10 text-white border-white/20 hover:bg-white/20"
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
      className="rounded-2xl backdrop-blur-2xl shadow-xl border border-white/20 p-4 sm:p-6 flex flex-col min-h-[180px] transition hover:shadow-2xl mb-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-lg sm:text-xl font-bold text-white tracking-wide">
              {className}
            </span>
            <span className="text-sm bg-[#6C4AB6] text-white px-2 py-1 rounded-full">
              {totalStudents} {totalStudents === 1 ? "student" : "students"}
            </span>
          </div>
          <p className="text-sm text-white/80">
            Class Fee: {fmtNaira(feeAmount)}
          </p>
        </div>

        <div className="flex items-center gap-2 mt-3 sm:mt-0">
          <button
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#6C4AB6] text-white font-semibold hover:bg-[#8055f7] shadow-lg whitespace-nowrap"
            onClick={onAdd}
          >
            <FaPlus /> Add Payment
          </button>
          <button
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-white/15 text-white font-semibold hover:bg-white/25 shadow-lg whitespace-nowrap"
            onClick={() => onGenerateDebtors(className)}
            title="Print debtors-only list"
          >
            <FaFilePdf /> Debtors (PDF)
          </button>
          <button
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-white/15 text-white font-semibold hover:bg-white/25 shadow-lg whitespace-nowrap"
            onClick={() => onGenerateBroadsheet(className)}
            title="View/Download class broadsheet as PDF"
          >
            <FaFilePdf /> Broadsheet (PDF)
          </button>
        </div>
      </div>

      {/* Separation controls + stats */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
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
        <span className="text-xs sm:text-sm text-white/80 ml-auto">
          Outstanding:{" "}
          <strong className="text-white">{fmtNaira(stats.outstanding)}</strong>
        </span>
      </div>

      {/* Desktop: one row per student + nested history */}
      <div className="hidden sm:block w-full overflow-x-auto">
        <div className="min-w-full rounded-xl shadow-inner backdrop-blur-sm">
          <table className="w-full text-sm md:text-base rounded-xl">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gradient-to-r from-[#1e0447]/90 to-[#372772]/90 backdrop-blur-sm">
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  ID
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left">
                  Name
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  Total Paid
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  Remaining
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  Status
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  Last Payment
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
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
                    {/* Parent summary row */}
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className={`cursor-pointer ${
                        status === "Paid" ? "bg-white/5" : "even:bg-white/10"
                      }`}
                      onClick={() => toggle(student.studentId)}
                      title="Click to expand payment history"
                    >
                      <td className="px-3 py-2 text-[#ffffff] whitespace-nowrap">
                        {student.studentId}
                      </td>
                      <td className="px-3 py-2 text-[#ffffff] max-w-[220px] truncate">
                        {student.name}
                      </td>
                      <td className="px-3 py-2 text-[#ffffff] whitespace-nowrap">
                        {fmtNaira(total)}
                      </td>
                      <td className="px-3 py-2 text-[#ffffff] whitespace-nowrap">
                        {fmtNaira(remaining)}
                      </td>
                      <td
                        className={`px-3 py-2 font-bold whitespace-nowrap ${
                          status === "Paid"
                            ? "text-green-400"
                            : status === "Owing"
                            ? "text-yellow-400"
                            : status === "Not Paid"
                            ? "text-red-500"
                            : "text-gray-300"
                        }`}
                      >
                        {status}
                      </td>
                      <td className="px-3 py-2 text-[#ffffff] whitespace-nowrap">
                        {last ? (
                          <>
                            {formatDate(last.date)}
                            <span className="text-xs block text-white/60">
                              {formatTime(last.date)}
                            </span>
                          </>
                        ) : (
                          <span className="text-white/60">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${
                            open[student.studentId]
                              ? "bg-white/20"
                              : "bg-white/10"
                          } text-white`}
                        >
                          {open[student.studentId] ? "Hide" : "Show"} history
                        </span>
                      </td>
                    </motion.tr>

                    {/* Nested history row */}
                    {open[student.studentId] && (
                      <tr>
                        <td colSpan={7} className="px-3 pb-4">
                          <div className="mt-2 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
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
                                {(() => {
                                  let run = 0;
                                  if (payments.length === 0) {
                                    return (
                                      <tr>
                                        <td
                                          className="px-3 py-3 text-white/70"
                                          colSpan={6}
                                        >
                                          No payments yet.
                                        </td>
                                      </tr>
                                    );
                                  }
                                  return payments.map((p, i) => {
                                    run += Number(p.amount || 0);
                                    const rem =
                                      p.remainingAfter ??
                                      Math.max(feeAmount - run, 0);
                                    const st =
                                      p.statusAfter ??
                                      statusFromTotals(run, feeAmount);
                                    return (
                                      <tr
                                        key={p.id}
                                        className="border-t border-white/10"
                                      >
                                        <td className="px-3 py-2 text-white/90">
                                          {i + 1}
                                        </td>
                                        <td className="px-3 py-2 text-white/90">
                                          {formatDate(p.date)}
                                          <span className="block text-xs text-white/60">
                                            {formatTime(p.date)}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-white/90">
                                          {fmtNaira(p.amount)}
                                        </td>
                                        <td className="px-3 py-2 text-white/90">
                                          {fmtNaira(rem)}
                                        </td>
                                        <td
                                          className={`px-3 py-2 font-semibold ${
                                            st === "Paid"
                                              ? "text-green-400"
                                              : st === "Owing"
                                              ? "text-yellow-400"
                                              : st === "Not Paid"
                                              ? "text-red-500"
                                              : "text-gray-300"
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
                                            className="flex items-center justify-center px-2 py-1 rounded-lg hover:bg-red-100 text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Delete payment"
                                            disabled={deletingIds[p.id]}
                                          >
                                            <FaTrash size={14} />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
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
      </div>

      {/* Mobile: grouped cards per student */}
      <div className="sm:hidden space-y-3">
        {list.map(({ student, payments }) => {
          let total = 0;
          payments.forEach((p) => (total += Number(p.amount || 0)));
          const remaining = Math.max(feeAmount - total, 0);
          const status = statusFromTotals(total, feeAmount);
          const last = payments[payments.length - 1];

          return (
            <div
              key={student.studentId}
              className="bg-white/5 rounded-lg p-4 border border-white/10"
            >
              <button
                className="w-full text-left"
                onClick={() => toggle(student.studentId)}
                title="Tap to expand"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-white">{student.name}</h3>
                    <p className="text-sm text-white/80">{student.studentId}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-white/10 text-white">
                    {open[student.studentId] ? "Hide" : "Show"} history
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-white/60">Total Paid</p>
                    <p className="text-white">{fmtNaira(total)}</p>
                  </div>
                  <div>
                    <p className="text-white/60">Remaining</p>
                    <p className="text-white">{fmtNaira(remaining)}</p>
                  </div>
                  <div>
                    <p className="text-white/60">Status</p>
                    <p
                      className={`font-semibold ${
                        status === "Paid"
                          ? "text-green-400"
                          : status === "Owing"
                          ? "text-yellow-400"
                          : status === "Not Paid"
                          ? "text-red-500"
                          : "text-gray-300"
                      }`}
                    >
                      {status}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/60">Last Payment</p>
                    <p className="text-white">
                      {last ? (
                        <>
                          {formatDate(last.date)}
                          <span className="block text-xs text-white/60">
                            {formatTime(last.date)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </div>
              </button>

              {open[student.studentId] && (
                <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                  {(() => {
                    if (payments.length === 0)
                      return (
                        <div className="text-white/70 text-sm">
                          No payments yet.
                        </div>
                      );
                    let run = 0;
                    return payments.map((p, i) => {
                      run += Number(p.amount || 0);
                      const rem =
                        p.remainingAfter ?? Math.max(feeAmount - run, 0);
                      const st =
                        p.statusAfter ?? statusFromTotals(run, feeAmount);
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between bg-white/5 rounded-md px-3 py-2"
                        >
                          <div className="text-white text-sm">
                            <div className="font-semibold">
                              {fmtNaira(p.amount)}
                            </div>
                            <div className="text-xs text-white/70">
                              {formatDate(p.date)} • {formatTime(p.date)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-white text-sm">
                              {fmtNaira(rem)}
                            </div>
                            <div
                              className={`text-xs font-semibold ${
                                st === "Paid"
                                  ? "text-green-400"
                                  : st === "Owing"
                                  ? "text-yellow-400"
                                  : st === "Not Paid"
                                  ? "text-red-500"
                                  : "text-gray-300"
                              }`}
                            >
                              {st}
                            </div>
                            <button
                              onClick={() => onDelete(className, p.id)}
                              className="mt-1 inline-flex items-center justify-center px-2 py-1 rounded-lg hover:bg-red-100 text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete payment"
                              disabled={deletingIds[p.id]}
                            >
                              <FaTrash size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
