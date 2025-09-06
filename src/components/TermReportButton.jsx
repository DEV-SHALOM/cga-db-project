// src/components/TermReportButton.jsx
import { useState, useEffect } from "react";
import { FileDown, Loader2 } from "lucide-react";
// RIGHT
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useActiveTerm } from "../hooks/useActiveTerm";
import { printTermReport } from "../reports/termReport"; // iframe-based printing

async function getTermSummary(termId) {
  const termSnap = await getDoc(doc(db, "terms", termId));
  const term = termSnap.exists() ? termSnap.data() : {};
  const termName = term.termName || "Term";
  const startAt =
    term.startAt instanceof Timestamp ? term.startAt : Timestamp.now();

  let feesIncome = 0;
  for (const d of (
    await getDocs(
      query(collection(db, "payments"), where("termId", "==", termId))
    )
  ).docs) {
    feesIncome += Math.max(0, Number(d.data()?.amount || 0));
  }

  let invIncome = 0;
  for (const d of (
    await getDocs(
      query(
        collection(db, "inventoryTransactions"),
        where("termId", "==", termId),
        where("paid", "==", true)
      )
    )
  ).docs) {
    const r = d.data();
    invIncome +=
      Math.max(0, Number(r.itemPrice || 0)) *
      Math.max(0, Number(r.quantity || 0));
  }

  let invRefunds = 0;
  for (const d of (
    await getDocs(
      query(collection(db, "inventoryRefunds"), where("termId", "==", termId))
    )
  ).docs) {
    invRefunds += Math.max(0, Number(d.data()?.amount || 0));
  }

  let totalExpenses = 0;
  for (const d of (
    await getDocs(
      query(collection(db, "expenses"), where("termId", "==", termId))
    )
  ).docs) {
    const e = d.data();
    const qty = Math.max(0, Number(e.quantity || 0));
    const price = Math.max(0, Number(e.unitPrice || 0));
    const total = e.total != null ? Math.max(0, Number(e.total)) : qty * price;
    totalExpenses += total;
  }

  let studentPresentDays = 0;
  for (const d of (
    await getDocs(
      query(collection(db, "dailyAttendance"), where("termId", "==", termId))
    )
  ).docs) {
    studentPresentDays += Math.max(0, Number(d.data()?.presentCount || 0));
  }

  let teacherPresentDays = 0;
  for (const d of (
    await getDocs(
      query(
        collection(db, "teacherDailyAttendance"),
        where("termId", "==", termId)
      )
    )
  ).docs) {
    teacherPresentDays += Math.max(0, Number(d.data()?.presentCount || 0));
  }

  const studentsCount = (await getDocs(collection(db, "students"))).size;
  const totalIncome = Math.max(0, feesIncome + invIncome - invRefunds);

  return {
    termId,
    termName,
    startAt,
    feesIncome,
    invIncome,
    invRefunds,
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    studentPresentDays,
    teacherPresentDays,
    studentsCount,
  };
}

export default function TermReportButton({
  label = "Term Snapshot (PDF)",
  className = "",
}) {
  const termId = useActiveTerm();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => setEnabled(!!termId), [termId]);

  const handleDownload = async () => {
    if (!termId || busy) return;
    setBusy(true);
    try {
      const summary = await getTermSummary(termId);
      printTermReport(summary, {
        schoolName: "Chosen Generation Academy",
        // logoUrl: "https://.../logo.png" or data URL
        preparedBy: "Bursar / Accounts",
        approvedBy: "Principal",
      });
    } catch (e) {
      console.error("Report generation failed:", e);
      alert("Report generation failed. Check console for details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={!enabled || busy}
      className={`px-3 py-2 rounded-xl bg-black text-white flex items-center gap-2 disabled:opacity-60 ${className}`}
      title={
        !enabled ? "Waiting for active term…" : "Export current term report"
      }
    >
      {busy ? (
        <Loader2 className="animate-spin" size={16} />
      ) : (
        <FileDown size={16} />
      )}
      <span>{busy ? "Building…" : label}</span>
    </button>
  );
}
