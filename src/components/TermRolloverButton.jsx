// src/components/TermRolloverButton.jsx
import { useState } from "react";
import { RefreshCcw, Loader2 } from "lucide-react";
// RIGHT
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc, // <-- add this
  query,
  where,
  Timestamp,
//   setDoc, // (optional fallback)
} from "firebase/firestore";

import { db } from "../firebase";
import { useActiveTerm } from "../hooks/useActiveTerm";
import { usePermission } from "../hooks/usePermission";
import { printTermReport } from "../reports/termReport";

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

function nextTermName(prev) {
  const stamp = new Date().toLocaleString();
  return prev ? `${prev} → New (${stamp})` : `New Term (${stamp})`;
}

export default function TermRolloverButton({ className = "" }) {
  const termId = useActiveTerm();
  const { isAdmin } = usePermission();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isAdmin()) return null;

  const closeAndStartNew = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let prevName = "";
      if (termId) {
        const summary = await getTermSummary(termId);
        prevName = summary.termName;

        // Print report without popups
        printTermReport(summary, {
          schoolName: "Chosen Generation Academy",
          // logoUrl: "https://.../logo.png" or data URL
          preparedBy: "Bursar / Accounts",
          approvedBy: "Principal",
        });

        // Mark current term closed
        await updateDoc(doc(db, "terms", termId), {
          closed: true,
          endAt: Timestamp.now(),
        });
      }

      // Create new term
      const newTermRef = await addDoc(collection(db, "terms"), {
        termName: nextTermName(prevName),
        startAt: Timestamp.now(),
        closed: false,
      });

      // Switch active term
      await updateDoc(doc(db, "settings", "app"), {
        activeTermId: newTermRef.id,
      });

      setOpen(false);
    } catch (e) {
      console.error("Rollover failed:", e);
      alert(e.message || "Failed to start a new term");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`px-3 py-2 rounded-xl bg-black text-white flex items-center gap-2 ${className}`}
        title="Archive current term, print report, and start a new term"
      >
        {busy ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          <RefreshCcw size={16} />
        )}
        <span>{busy ? "Working…" : "Close Term & Start New"}</span>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white/10 border border-white/20 rounded-2xl p-6 w-full max-w-md">
            <div className="text-white text-lg font-semibold mb-2">
              Confirm term rollover
            </div>
            <div className="text-white/80 mb-4">
              This will archive the current term, open a print dialog (Save as
              PDF), and start a new term.
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded bg-white/10 border border-white/20 text-white hover:bg-white/20"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={closeAndStartNew}
                className="px-3 py-2 rounded bg-[#13a1e2] text-white hover:bg-[#13a1e2]/90 disabled:opacity-60"
                disabled={busy}
              >
                {busy ? "Please wait…" : "Yes, close term"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
