import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User2,
  BookOpen,
  Wallet,
  Users,
  BarChart2,
  CalendarDays,
  Receipt,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Loader,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  addDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { motion, AnimatePresence } from "framer-motion";
import { usePermission } from "../hooks/usePermission";
import { useActiveTerm } from "../hooks/useActiveTerm";

// Term configuration - each term is 4 months
const TERM_CONFIG = {
  "First Term": { startMonth: 8, endMonth: 11 }, // September to December (0-indexed: 8-11)
  "Second Term": { startMonth: 0, endMonth: 3 }, // January to April
  "Third Term": { startMonth: 4, endMonth: 7 }, // May to August
};

export default function Dashboard() {
  const { user, perm, hasSection, isAdmin } = usePermission();
  const navigate = useNavigate();
  const termId = useActiveTerm();

  // State declarations
  const [totalFees, setTotalFees] = useState(0);
  const [incomeTodayFees, setIncomeTodayFees] = useState(0);
  const [incomeTodayInvPaid, setIncomeTodayInvPaid] = useState(0);
  const [incomeTodayInvRefunds, setIncomeTodayInvRefunds] = useState(0);
  const [incomeToday, setIncomeToday] = useState(0);
  const [dailySheet, setDailySheet] = useState([]);
  const [dailyExpenses, setDailyExpenses] = useState([]);
  const [expensesToday, setExpensesToday] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [attendanceToday, setAttendanceToday] = useState(0);
  const [totalParents, setTotalParents] = useState(0);
  const [weeklyAttendance, setWeeklyAttendance] = useState([]);
  const [currentTerm, setCurrentTerm] = useState("First Term");
  const [academicYear, setAcademicYear] = useState("");
  const [showTermRolloverModal, setShowTermRolloverModal] = useState(false);
  const [isProcessingTerm, setIsProcessingTerm] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [showCharts, setShowCharts] = useState(true);
  const [currentTermData, setCurrentTermData] = useState(null);

  const canFees = !perm.loading && (isAdmin() || hasSection("fees"));
  const canInventory = !perm.loading && (isAdmin() || hasSection("inventory"));
  const canExpenses = !perm.loading && (isAdmin() || hasSection("expenses"));

  // Initialize term and academic year from Firebase
  useEffect(() => {
    const initializeTermFromFirebase = async () => {
      try {
        // Check if we have an active term in settings
        const appSettingsRef = doc(db, "settings", "app");
        const appSettingsDoc = await getDoc(appSettingsRef);
        
        if (appSettingsDoc.exists() && appSettingsDoc.data().activeTerm) {
          const activeTerm = appSettingsDoc.data().activeTerm;
          setCurrentTerm(activeTerm.termName || activeTerm.term || "First Term");
          setAcademicYear(activeTerm.academicYear || activeTerm.year || "");
          setCurrentTermData(activeTerm);
        } else {
          // Calculate current term based on date
          const { term, academicYear: year } = calculateCurrentTerm();
          setCurrentTerm(term);
          setAcademicYear(year);
          
          // Save to Firebase for future reference
          const termData = {
            termName: term,
            academicYear: year,
            startDate: Timestamp.now(),
            isActive: true,
            createdAt: Timestamp.now(),
            createdBy: user?.email || "system"
          };
          
          // Save to settings
          await updateDoc(appSettingsRef, { activeTerm: termData }, { merge: true });
          
          // Also create a term document in the terms collection
          const termDoc = await addDoc(collection(db, "terms"), {
            ...termData,
            status: "active"
          });
          
          // Update settings with the term document ID
          await updateDoc(appSettingsRef, { 
            activeTerm: { ...termData, id: termDoc.id },
            activeTermId: termDoc.id 
          });
          
          setCurrentTermData({ ...termData, id: termDoc.id });
        }
      } catch (error) {
        console.error("Error initializing term:", error);
        // Fallback to calculated term
        const { term, academicYear: year } = calculateCurrentTerm();
        setCurrentTerm(term);
        setAcademicYear(year);
      }
    };

    initializeTermFromFirebase();
  }, [user]);

  // Calculate current term based on date
  const calculateCurrentTerm = () => {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed (0 = January)
    const currentYear = now.getFullYear();
    
    // Determine academic year (e.g., 2024/2025)
    let academicYearStr = "";
    if (currentMonth >= 8) { // September or later
      academicYearStr = `${currentYear}/${currentYear + 1}`;
    } else {
      academicYearStr = `${currentYear - 1}/${currentYear}`;
    }
    
    // Determine current term based on month
    let term = "First Term"; // Default
    
    if (currentMonth >= 0 && currentMonth <= 3) {
      term = "Second Term"; // Jan-Apr
    } else if (currentMonth >= 4 && currentMonth <= 7) {
      term = "Third Term"; // May-Aug
    }
    // Sep-Dec remains First Term (default)
    
    return { term, academicYear: academicYearStr };
  };

  // Calculate next term
  const calculateNextTerm = (currentTermName) => {
    const termOrder = ["First Term", "Second Term", "Third Term"];
    const currentIndex = termOrder.indexOf(currentTermName);
    
    if (currentIndex === termOrder.length - 1) {
      // If it's the last term, move to next academic year and first term
      const { academicYear: currentYear } = calculateCurrentTerm();
      const [startYear, endYear] = currentYear.split('/');
      const nextAcademicYear = `${parseInt(endYear)}/${parseInt(endYear) + 1}`;
      return { term: "First Term", academicYear: nextAcademicYear };
    } else {
      return { term: termOrder[currentIndex + 1], academicYear };
    }
  };

  // Utility functions
  function getTodayRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return [Timestamp.fromDate(start), Timestamp.fromDate(end)];
  }

  function getLast7Days() {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dateKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      days.push({
        date: dateKey,
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        fullDate: d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      });
    }
    return days;
  }

  function getPastNDays(n) {
    const days = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({
        label: date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        start: Timestamp.fromDate(
          new Date(date.getFullYear(), date.getMonth(), date.getDate())
        ),
        end: Timestamp.fromDate(
          new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
        ),
      });
    }
    return days;
  }

  const maskMoney = (value, allowed) =>
    allowed
      ? `₦ ${Math.max(0, Number(value) || 0).toLocaleString()}`
      : "******";

  // Effect hooks
  useEffect(() => {
    const net = incomeTodayFees + incomeTodayInvPaid - incomeTodayInvRefunds;
    setIncomeToday(Math.max(0, net));
  }, [incomeTodayFees, incomeTodayInvPaid, incomeTodayInvRefunds]);

  // Students count
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, "students")), (snap) =>
      setTotalStudents(snap.size)
    );
    return () => unsub();
  }, [user]);

  // Parents count
  useEffect(() => {
    if (!user) return;
    const qParents = query(
      collection(db, "students"),
      where("parentPhone", "!=", "nil")
    );
    const unsub = onSnapshot(qParents, (snap) => {
      // Get unique phone numbers
      const phones = new Set();
      snap.forEach((d) => {
        const phone = d.data().parentPhone;
        if (phone && phone !== "nil") phones.add(phone);
      });
      setTotalParents(phones.size);
    });
    return () => unsub();
  }, [user]);

  // Incomes (fees + inventory) — scoped by termId
  useEffect(() => {
    if (!user || !termId || (!canFees && !canInventory)) {
      setTotalFees(0);
      setIncomeTodayFees(0);
      setIncomeTodayInvPaid(0);
      setIncomeTodayInvRefunds(0);
      setDailySheet([]);
      return;
    }

    const unsubs = [];

    // TOTAL FEES (lifetime of current term)
    if (canFees) {
      unsubs.push(
        onSnapshot(
          query(collection(db, "payments"), where("termId", "==", termId)),
          (snap) => {
            let total = 0;
            snap.forEach((d) => (total += Number(d.data().amount || 0)));
            setTotalFees(total);
          }
        )
      );

      // TODAY (fees)
      const [start, end] = getTodayRange();
      unsubs.push(
        onSnapshot(
          query(
            collection(db, "payments"),
            where("termId", "==", termId),
            where("date", ">=", start),
            where("date", "<", end)
          ),
          (snap) => {
            let total = 0;
            snap.forEach((d) => {
              const amt = Number(d.data().amount || 0);
              if (!isNaN(amt)) total += amt;
            });
            setIncomeTodayFees(total);
          }
        )
      );
    } else {
      setTotalFees(0);
      setIncomeTodayFees(0);
    }

    // TODAY (inventory paid / refunds)
    if (canInventory) {
      const [start, end] = getTodayRange();
      const startDate = start.toDate();
      const endDate = end.toDate();

      // payments today
      unsubs.push(
        onSnapshot(
          query(
            collection(db, "inventoryTransactions"),
            where("termId", "==", termId),
            where("paymentDate", ">=", start),
            where("paymentDate", "<", end)
          ),
          (snap) => {
            let total = 0;
            snap.forEach((d) => {
              const row = d.data();
              if (row.paid) {
                const unit = Number(row.itemPrice || 0);
                const qty = Number(row.quantity || 0);
                total += unit * qty;
              }
            });
            setIncomeTodayInvPaid(total);
          }
        )
      );

      // refunds today
      unsubs.push(
        onSnapshot(
          query(
            collection(db, "inventoryRefunds"),
            where("termId", "==", termId),
            where("refundDate", ">=", start),
            where("refundDate", "<", end)
          ),
          (snap) => {
            let total = 0;
            snap.forEach((d) => {
              const r = d.data();
              const amt = Number(r.amount || 0);
              const p = r.paymentDate?.toDate?.();
              if (amt > 0 && p && p >= startDate && p < endDate) total += amt;
            });
            setIncomeTodayInvRefunds(total);
          }
        )
      );
    } else {
      setIncomeTodayInvPaid(0);
      setIncomeTodayInvRefunds(0);
    }

    // 7-Day income chart
    const days = getPastNDays(7);
    const sheetFees = Array(7).fill(0);
    const sheetInvPaid = Array(7).fill(0);
    const sheetInvRefunds = Array(7).fill(0);

    const fmtWkMoDay = (ts) => {
      const d = ts.toDate();
      const wk = d.toLocaleDateString(undefined, { weekday: "short" });
      const mo = d.toLocaleDateString(undefined, { month: "short" });
      const dy = d.getDate();
      return `${wk} ${mo} ${dy}`;
    };

    const rebuildDaily = () => {
      setDailySheet(
        days.map((x, i) => ({
          label: fmtWkMoDay(x.start),
          amount: Math.max(
            0,
            (sheetFees[i] || 0) +
              (sheetInvPaid[i] || 0) -
              (sheetInvRefunds[i] || 0)
          ),
        }))
      );
    };

    if (canFees) {
      days.forEach((d, idx) => {
        unsubs.push(
          onSnapshot(
            query(
              collection(db, "payments"),
              where("termId", "==", termId),
              where("date", ">=", d.start),
              where("date", "<", d.end)
            ),
            (snap) => {
              let total = 0;
              snap.forEach((row) => (total += Number(row.data().amount || 0)));
              sheetFees[idx] = total;
              rebuildDaily();
            }
          )
        );
      });
    }

    if (canInventory) {
      days.forEach((d, idx) => {
        // inventory paid
        unsubs.push(
          onSnapshot(
            query(
              collection(db, "inventoryTransactions"),
              where("termId", "==", termId),
              where("paymentDate", ">=", d.start),
              where("paymentDate", "<", d.end)
            ),
            (snap) => {
              let total = 0;
              snap.forEach((rowDoc) => {
                const row = rowDoc.data();
                if (row.paid)
                  total +=
                    Number(row.itemPrice || 0) * Number(row.quantity || 0);
              });
              sheetInvPaid[idx] = total;
              rebuildDaily();
            }
          )
        );

        // refunds
        const s = d.start.toDate();
        const e = d.end.toDate();
        unsubs.push(
          onSnapshot(
            query(
              collection(db, "inventoryRefunds"),
              where("termId", "==", termId),
              where("refundDate", ">=", d.start),
              where("refundDate", "<", d.end)
            ),
            (snap) => {
              let total = 0;
              snap.forEach((rowDoc) => {
                const r = rowDoc.data();
                const amt = Number(r.amount || 0);
                const p = r.paymentDate?.toDate?.();
                if (amt > 0 && p && p >= s && p < e) total += amt;
              });
              sheetInvRefunds[idx] = total;
              rebuildDaily();
            }
          )
        );
      });
    }

    rebuildDaily();
    return () => unsubs.forEach((u) => u && u());
  }, [user, termId, canFees, canInventory]);

  // Expenses
  useEffect(() => {
    if (!user || !termId) {
      setDailyExpenses([]);
      setExpensesToday(0);
      return;
    }

    if (canExpenses) {
      const [start, end] = getTodayRange();

      // Today's total
      const unsubToday = onSnapshot(
        query(
          collection(db, "expenses"),
          where("termId", "==", termId),
          where("date", ">=", start),
          where("date", "<", end)
        ),
        (snap) => {
          let total = 0;
          snap.forEach((d) => {
            const e = d.data();
            const qty = Math.max(0, Number(e.quantity || 0));
            const price = Math.max(0, Number(e.unitPrice || 0));
            const t = Math.max(
              0,
              Number(e.total != null ? e.total : qty * price)
            );
            total += t;
          });
          setExpensesToday(Math.max(0, total));
        }
      );

      // 7-day chart
      const days = getPastNDays(7);
      const sheet = Array(7).fill(0);
      const unsubs7 = days.map((d, idx) =>
        onSnapshot(
          query(
            collection(db, "expenses"),
            where("termId", "==", termId),
            where("date", ">=", d.start),
            where("date", "<", d.end)
          ),
          (snap) => {
            let total = 0;
            snap.forEach((rowDoc) => {
              const e = rowDoc.data();
              const qty = Math.max(0, Number(e.quantity || 0));
              const price = Math.max(0, Number(e.unitPrice || 0));
              const t = Math.max(
                0,
                Number(e.total != null ? e.total : qty * price)
              );
              total += t;
            });
            sheet[idx] = total;

            setDailyExpenses(
              days.map((x, i) => {
                const dObj = x.start.toDate();
                const wk = dObj.toLocaleDateString(undefined, {
                  weekday: "short",
                });
                const mo = dObj.toLocaleDateString(undefined, {
                  month: "short",
                });
                const dy = dObj.getDate();
                return {
                  label: `${wk} ${mo} ${dy}`,
                  amount: Math.max(0, sheet[i] || 0),
                };
              })
            );
          }
        )
      );

      return () => {
        unsubToday && unsubToday();
        unsubs7.forEach((u) => u && u());
      };
    } else {
      setExpensesToday(0);
      setDailyExpenses([]);
    }
  }, [user, termId, canExpenses]);

  // Attendance Today
  useEffect(() => {
    if (!user || !termId) return;
    const [start, end] = getTodayRange();

    const unsub = onSnapshot(
      query(
        collection(db, "dailyAttendance"),
        where("termId", "==", termId),
        where("date", ">=", start),
        where("date", "<", end)
      ),
      (snap) => {
        let total = 0;
        snap.forEach((d) => (total += Number(d.data()?.presentCount || 0)));
        setAttendanceToday(total);
      }
    );

    return () => unsub();
  }, [user, termId]);

  // Weekly attendance
  useEffect(() => {
    if (!user || !termId) return;
    const days = getLast7Days();
    setWeeklyAttendance(days.map((d) => ({ ...d, count: 0 })));

    const unsubs = days.map((day) => {
      const parts = day.date.split("-");
      const y = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const d = Number(parts[2]);
      const start = Timestamp.fromDate(new Date(y, m, d));
      const end = Timestamp.fromDate(new Date(y, m, d + 1));

      return onSnapshot(
        query(
          collection(db, "dailyAttendance"),
          where("termId", "==", termId),
          where("date", ">=", start),
          where("date", "<", end)
        ),
        (snap) => {
          let total = 0;
          snap.forEach(
            (docSnap) => (total += Number(docSnap.data()?.presentCount || 0))
          );
          setWeeklyAttendance((prev) =>
            prev.map((x) => (x.date === day.date ? { ...x, count: total } : x))
          );
        }
      );
    });

    return () => unsubs.forEach((u) => u && u());
  }, [user, termId]);

  // Handle term rollover
  const handleTermRollover = async () => {
    if (!isAdmin()) {
      alert("Only administrators can close terms.");
      return;
    }

    setIsProcessingTerm(true);
    try {
      // Get the next term
      const nextTerm = calculateNextTerm(currentTerm);
      
      // Create new term document
      const newTermData = {
        termName: nextTerm.term,
        academicYear: nextTerm.academicYear,
        startDate: Timestamp.now(),
        isActive: true,
        createdAt: Timestamp.now(),
        createdBy: user?.email || "Admin",
        previousTerm: {
          termName: currentTerm,
          academicYear,
          closedAt: Timestamp.now(),
          closedBy: user?.email || "Admin",
        }
      };
      
      // Add new term to terms collection
      const newTermDoc = await addDoc(collection(db, "terms"), newTermData);
      
      // Update the active term in settings
      const appSettingsRef = doc(db, "settings", "app");
      await updateDoc(appSettingsRef, {
        activeTerm: { ...newTermData, id: newTermDoc.id },
        activeTermId: newTermDoc.id,
        lastTermClosed: {
          term: currentTerm,
          academicYear,
          closedAt: Timestamp.now(),
          closedBy: user?.email || "Admin",
        }
      });

      // Update local state
      setCurrentTerm(nextTerm.term);
      setAcademicYear(nextTerm.academicYear);
      setCurrentTermData({ ...newTermData, id: newTermDoc.id });
      
      // Show success and close modal
      setTimeout(() => {
        setShowTermRolloverModal(false);
        setIsProcessingTerm(false);
        alert(`Term successfully closed. New term: ${nextTerm.term} ${nextTerm.academicYear}`);
      }, 1000);
      
    } catch (error) {
      console.error("Error closing term:", error);
      alert("Failed to close term. Please try again.");
      setIsProcessingTerm(false);
    }
  };

  // Calculate term progress
  const calculateTermProgress = () => {
    if (!currentTermData?.startDate) return 0;
    
    const startDate = currentTermData.startDate.toDate();
    const now = new Date();
    
    // Duration of term is 4 months (approx 120 days)
    const termDurationMs = 4 * 30 * 24 * 60 * 60 * 1000;
    const elapsedMs = now.getTime() - startDate.getTime();
    
    const progress = Math.min(Math.max((elapsedMs / termDurationMs) * 100, 0), 100);
    return Math.round(progress);
  };

  const termProgress = calculateTermProgress();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen py-4 md:py-8 px-3 md:px-6 lg:px-8"
    >
      {/* Term Rollover Confirmation Modal */}
      <AnimatePresence>
        {showTermRolloverModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => !isProcessingTerm && setShowTermRolloverModal(false)}
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-gradient-to-tr from-[#1a1038] via-[#241a44] to-[#1b1740] rounded-2xl border border-purple-500/30 shadow-2xl shadow-purple-900/30 p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="text-amber-400" size={24} />
                  <h3 className="text-white font-bold text-lg">Close Current Term</h3>
                </div>
                <button
                  onClick={() => !isProcessingTerm && setShowTermRolloverModal(false)}
                  className="text-white/70 hover:text-white text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-400/20 rounded-lg">
                  <p className="text-amber-300 text-sm">
                    <strong>Warning:</strong> This action will close the current term and start a new one. 
                    Make sure all data for the current term is complete and accurate.
                  </p>
                </div>

                <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-white/70 text-xs">Current Term</p>
                      <p className="text-white font-semibold">{currentTerm}</p>
                    </div>
                    <div>
                      <p className="text-white/70 text-xs">Academic Year</p>
                      <p className="text-white font-semibold">{academicYear}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-white/70 text-xs">Term Progress</p>
                      <p className="text-white text-xs font-medium">{termProgress}%</p>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${termProgress}%` }}
                        className={`h-full ${
                          termProgress < 30 ? "bg-red-500" :
                          termProgress < 70 ? "bg-yellow-500" :
                          "bg-green-500"
                        }`}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle className="text-green-400" size={18} />
                    <p className="text-white/90 text-sm">Next Term Details</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-white/70 text-xs">Next Term</p>
                      <p className="text-white font-semibold">
                        {calculateNextTerm(currentTerm).term}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/70 text-xs">Academic Year</p>
                      <p className="text-white font-semibold">
                        {calculateNextTerm(currentTerm).academicYear}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowTermRolloverModal(false)}
                    disabled={isProcessingTerm}
                    className="flex-1 px-4 py-3 bg-[#362b68] hover:bg-[#3a2d70] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTermRollover}
                    disabled={isProcessingTerm}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    {isProcessingTerm ? (
                      <>
                        <Loader className="animate-spin" size={16} />
                        Processing...
                      </>
                    ) : (
                      <>
                        Close Term & Start New
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Dashboard Content */}
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6 md:mb-8">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="rounded-2xl backdrop-blur-md px-6 py-4 w-full lg:w-auto"
          >
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white drop-shadow-lg mb-2">
              Dashboard Overview
            </h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-white/70">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} />
                <span className="text-sm md:text-base">{currentTerm} • {academicYear} Academic Session</span>
              </div>
              <div className="hidden sm:block text-white/50">•</div>
              <div className="text-sm">
                Progress: <span className="font-semibold">{termProgress}% complete</span>
              </div>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <button
              onClick={() => setStatsExpanded(!statsExpanded)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white flex items-center justify-center gap-2 transition-colors"
            >
              {statsExpanded ? (
                <>
                  <ChevronUp size={16} />
                  <span className="hidden sm:inline">Hide Stats</span>
                  <span className="sm:hidden">Hide</span>
                </>
              ) : (
                <>
                  <ChevronDown size={16} />
                  <span className="hidden sm:inline">More Stats</span>
                  <span className="sm:hidden">More</span>
                </>
              )}
            </button>
            
            <button
              onClick={() => setShowCharts(!showCharts)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white flex items-center justify-center gap-2 transition-colors"
            >
              <BarChart2 size={16} />
              <span className="hidden sm:inline">{showCharts ? "Hide Charts" : "Show Charts"}</span>
              <span className="sm:hidden">{showCharts ? "Hide" : "Charts"}</span>
            </button>
            
            {isAdmin() && (
              <button
                onClick={() => setShowTermRolloverModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-red-600/80 to-red-700/80 hover:from-red-600 hover:to-red-700 rounded-lg text-white flex items-center justify-center gap-2 transition-all"
              >
                <span className="hidden sm:inline">Close Term & Start New</span>
                <span className="sm:hidden">Close Term</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          <StatCard
            icon={<User2 size={20} />}
            value={totalStudents}
            label="Total Students"
            color="from-blue-500/20 to-blue-600/20"
            textColor="text-blue-400"
          />
          <StatCard
            icon={<Users size={20} />}
            value={attendanceToday}
            label="Attendance Today"
            color="from-green-500/20 to-green-600/20"
            textColor="text-green-400"
          />
          <StatCard
            icon={<BookOpen size={20} />}
            value={8}
            label="Parents"
            color="from-purple-500/20 to-purple-600/20"
            textColor="text-purple-400"
          />
          <StatCard
            icon={<Wallet size={20} />}
            value={maskMoney(totalFees, canFees)}
            label="Total Fees"
            color="from-amber-500/20 to-amber-600/20"
            textColor="text-amber-400"
          />
          <StatCard
            icon={<BarChart2 size={20} />}
            value={maskMoney(incomeToday, canFees)}
            label="Income Today"
            color="from-emerald-500/20 to-emerald-600/20"
            textColor="text-emerald-400"
          />
          <StatCard
            icon={<Receipt size={20} />}
            value={maskMoney(expensesToday, canExpenses)}
            label="Expenses Today"
            color="from-rose-500/20 to-rose-600/20"
            textColor="text-rose-400"
          />
        </div>

        {/* Expanded Stats Section */}
        <AnimatePresence>
          {statsExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/70 text-sm">Term Timeline</span>
                    <span className="text-white text-sm font-medium">{termProgress}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${termProgress}%` }}
                      className={`h-full ${
                        termProgress < 30 ? "bg-red-500" :
                        termProgress < 70 ? "bg-yellow-500" :
                        "bg-green-500"
                      }`}
                    />
                  </div>
                  <div className="mt-2 text-white/50 text-xs">
                    {currentTerm} • {academicYear}
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <div className="text-white/70 text-sm mb-2">Next Term Starts</div>
                  <div className="text-white font-medium">
                    {calculateNextTerm(currentTerm).term}
                  </div>
                  <div className="text-white/50 text-xs mt-1">
                    {calculateNextTerm(currentTerm).academicYear}
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <div className="text-white/70 text-sm mb-2">Today's Date</div>
                  <div className="text-white font-medium">
                    {new Date().toLocaleDateString('en-GB', { 
                      weekday: 'long', 
                      day: 'numeric', 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Charts Section */}
        <AnimatePresence>
          {showCharts && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-8"
            >
              {/* Daily Income Chart */}
              <div className="bg-white/10 border border-white/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <h3 className="text-white font-semibold text-base md:text-lg">Daily Income (Last 7 Days)</h3>
                  <span className="text-emerald-400 text-sm font-medium">
                    {canFees ? maskMoney(incomeToday, true) : "******"}
                  </span>
                </div>
                <div className="h-[250px] md:h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dailySheet.map((d) => ({
                        ...d,
                        amount: canFees ? d.amount : 0,
                      }))}
                    >
                      <XAxis
                        dataKey="label"
                        tick={{
                          fill: "#cfd8ff",
                          fontSize: 10,
                        }}
                        angle={-45}
                        textAnchor="end"
                        height={40}
                      />
                      <YAxis
                        tick={{ fill: "#cfd8ff", fontSize: 10 }}
                      />
                      <Tooltip
                        formatter={(val) =>
                          canFees ? [`₦ ${Math.max(0, Number(val) || 0).toLocaleString()}`, "Amount"] : ["******", "Amount"]
                        }
                        contentStyle={{
                          background: "#1c0450",
                          border: "none",
                          color: "#fff",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar
                        dataKey="amount"
                        fill="#8055f7"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Weekly Attendance Chart */}
              <div className="bg-white/10 border border-white/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <h3 className="text-white font-semibold text-base md:text-lg">Weekly Attendance</h3>
                  <div className="flex items-center gap-2">
                    <CalendarDays size={16} className="text-[#cfd8ff]" />
                    <span className="text-[#cfd8ff] text-sm">
                      {new Date().toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <div className="h-[250px] md:h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyAttendance}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis
                        dataKey="label"
                        tick={{
                          fill: "#cfd8ff",
                          fontSize: 10,
                        }}
                        height={30}
                      />
                      <YAxis
                        tick={{
                          fill: "#cfd8ff",
                          fontSize: 10,
                        }}
                      />
                      <Tooltip
                        formatter={(value) => [`${value} students`, "Attendance"]}
                        contentStyle={{
                          background: "#1c0450",
                          border: "none",
                          color: "#fff",
                          borderRadius: "8px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#13a1e2"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Daily Expenses Chart */}
              <div className="bg-white/10 border border-white/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg backdrop-blur-md lg:col-span-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <h3 className="text-white font-semibold text-base md:text-lg">Daily Expenses (Last 7 Days)</h3>
                  <span className="text-rose-400 text-sm font-medium">
                    {canExpenses ? maskMoney(expensesToday, true) : "******"}
                  </span>
                </div>
                <div className="h-[250px] md:h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dailyExpenses.map((d) => ({
                        ...d,
                        amount: canExpenses ? d.amount : 0,
                      }))}
                    >
                      <XAxis
                        dataKey="label"
                        tick={{
                          fill: "#cfd8ff",
                          fontSize: 10,
                        }}
                        angle={-45}
                        textAnchor="end"
                        height={40}
                      />
                      <YAxis
                        tick={{ fill: "#cfd8ff", fontSize: 10 }}
                      />
                      <Tooltip
                        formatter={(val) =>
                          canExpenses ? [`₦ ${Math.max(0, Number(val) || 0).toLocaleString()}`, "Amount"] : ["******", "Amount"]
                        }
                        contentStyle={{
                          background: "#1c0450",
                          border: "none",
                          color: "#fff",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar
                        dataKey="amount"
                        fill="#f75555"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recent Activity & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-white/10 border border-white/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg backdrop-blur-md">
            <h3 className="text-white font-semibold text-base md:text-lg mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => navigate("/students")}
                className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-white flex items-center gap-3 transition-colors"
              >
                <User2 size={18} />
                <span>Manage Students</span>
              </button>
              <button
                onClick={() => navigate("/attendance")}
                className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-white flex items-center gap-3 transition-colors"
              >
                <Users size={18} />
                <span>Take Attendance</span>
              </button>
              <button
                onClick={() => navigate("/fees")}
                className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-white flex items-center gap-3 transition-colors"
              >
                <Wallet size={18} />
                <span>Collect Fees</span>
              </button>
            </div>
          </div>

          <div className="bg-white/10 border border-white/20 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg backdrop-blur-md lg:col-span-2">
            <h3 className="text-white font-semibold text-base md:text-lg mb-4">Term Information</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/70 text-xs mb-1">Current Term</div>
                  <div className="text-white font-semibold">{currentTerm}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/70 text-xs mb-1">Academic Year</div>
                  <div className="text-white font-semibold">{academicYear}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/70 text-xs mb-1">Progress</div>
                  <div className="text-white font-semibold">{termProgress}%</div>
                </div>
              </div>
              
              <div className="text-white/70 text-sm">
                <p className="mb-2">
                  The system automatically determines the current term based on the calendar:
                </p>
                <ul className="space-y-1 text-xs">
                  <li>• <span className="text-white">First Term:</span> September - December</li>
                  <li>• <span className="text-white">Second Term:</span> January - April</li>
                  <li>• <span className="text-white">Third Term:</span> May - August</li>
                </ul>
                {isAdmin() && (
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-400/20 rounded-lg">
                    <p className="text-amber-300 text-xs">
                      <strong>Admin Note:</strong> Use "Close Term & Start New" button to manually advance to the next term when ready.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ icon, value, label, color = "from-white/10 to-white/5", textColor = "text-white" }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`rounded-xl px-3 py-4 flex flex-col items-center shadow-lg bg-gradient-to-br ${color} border border-white/10 backdrop-blur-md hover:border-white/20 transition-all duration-300`}
    >
      <div className="mb-2 text-white/80">{icon}</div>
      <div className={`text-xl md:text-2xl font-extrabold ${textColor} drop-shadow`}>
        {value}
      </div>
      <div className="text-xs mt-2 opacity-80 text-center text-white/70">
        {label}
      </div>
    </motion.div>
  );
}