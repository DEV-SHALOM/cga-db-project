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
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { motion } from "framer-motion";
import { usePermission } from "../hooks/usePermission";
import { useActiveTerm } from "../hooks/useActiveTerm";
import TermReportButton from "../components/TermReportButton";
import TermRolloverButton from "../components/TermRolloverButton";

export default function Dashboard() {
  const { user, perm, hasSection, isAdmin } = usePermission();
  const navigate = useNavigate();
  const termId = useActiveTerm();

  // Auto-redirect student-only teachers away from the dashboard to /students
  useEffect(() => {
    if (perm.loading) return;

    // sections is already normalized to an array by your hook
    const sections = perm.sections || [];
    const studentOnly =
      !isAdmin() && sections.length === 1 && sections[0] === "students";

    if (studentOnly) {
      navigate("/students", { replace: true });
    }
  }, [perm.loading, perm.sections, isAdmin, navigate]);

  // ---------- State declarations ----------
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
  const [weeklyAttendance, setWeeklyAttendance] = useState([]);

  const canFees = !perm.loading && (isAdmin() || hasSection("fees"));
  const canInventory = !perm.loading && (isAdmin() || hasSection("inventory"));
  const canExpenses = !perm.loading && (isAdmin() || hasSection("expenses"));

  // ---------- Utility functions ----------
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

  // ---------- Effect hooks ----------
  useEffect(() => {
    const net = incomeTodayFees + incomeTodayInvPaid - incomeTodayInvRefunds;
    setIncomeToday(Math.max(0, net));
  }, [incomeTodayFees, incomeTodayInvPaid, incomeTodayInvRefunds]);

  // Students count (master list — not term-scoped)
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, "students")), (snap) =>
      setTotalStudents(snap.size)
    );
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

    // ---- TOTAL FEES (lifetime of current term) ----
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

      // ---- TODAY (fees) ----
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

    // ---- TODAY (inventory paid / refunds where original payment was same-day) ----
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

      // refunds today (subtract only if original payment was also today)
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

    // ---- 7-Day income chart ----
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

        // refunds – subtract only on the day of the original payment
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

    // seed zeros so chart renders quickly
    rebuildDaily();

    return () => unsubs.forEach((u) => u && u());
  }, [user, termId, canFees, canInventory]);

  // Expenses (today + last 7 days) — scoped by termId
  useEffect(() => {
    if (!user || !termId) {
      setDailyExpenses([]);
      setExpensesToday(0);
      return;
    }

    if (canExpenses) {
      const [start, end] = getTodayRange();

      // Today's total (tile)
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

  // Attendance Today — term-scoped by (termId + date)
  useEffect(() => {
    if (!user || !termId) return;
    const [start, end] = getTodayRange();

    // Expect docs like: { termId, date: Timestamp, presentCount }
    const unsub = onSnapshot(
      query(
        collection(db, "dailyAttendance"),
        where("termId", "==", termId),
        where("date", ">=", start),
        where("date", "<", end)
      ),
      (snap) => {
        // If you keep a single aggregate doc per day, this will usually be size 1.
        // Sum anyway to be safe.
        let total = 0;
        snap.forEach((d) => (total += Number(d.data()?.presentCount || 0)));
        setAttendanceToday(total);
      }
    );

    return () => unsub();
  }, [user, termId]);

  // Weekly attendance — term-scoped
  useEffect(() => {
    if (!user || !termId) return;
    const days = getLast7Days();
    setWeeklyAttendance(days.map((d) => ({ ...d, count: 0 })));

    const unsubs = days.map((day) => {
      // Convert label dateKey to start/end for that day
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

  // ───────────────────────────────── UI ─────────────────────────────────
  const noUser = !user;
  const noTerm = !termId;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col gap-8"
    >
      <div className="flex items-center justify-between mb-2">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="rounded-2xl backdrop-blur-md px-6 py-4 w-fit shadow-md"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white drop-shadow-lg">
            Dashboard
          </h1>
        </motion.div>

        {/* One-click close term → archive → start new */}
        <div className="flex items-center gap-3">
          <TermReportButton />
          <TermRolloverButton />
        </div>
      </div>

      {noUser ? (
        <div className="text-white p-6">Please log in</div>
      ) : noTerm ? (
        <div className="text-white p-6">
          Active term not set. Create <code>terms/&lt;id&gt;</code> and set{" "}
          <code>settings/app.activeTermId</code>.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-6 mb-8 w-full">
            <StatCard
              icon={<User2 size={22} />}
              value={totalStudents}
              label="Total Students"
            />
            <StatCard
              icon={<Users size={22} />}
              value={attendanceToday}
              label="Attendance Today"
            />
            <StatCard
              icon={<BookOpen size={22} />}
              value={8}
              label="New Parents"
            />
            <StatCard
              icon={<Wallet size={22} />}
              value={maskMoney(totalFees, canFees)}
              label="Total Fees"
            />
            <StatCard
              icon={<BarChart2 size={22} />}
              value={maskMoney(incomeToday, canFees)}
              label="Total Income Today"
            />
            <StatCard
              icon={<Receipt size={22} />}
              value={maskMoney(expensesToday, canExpenses)}
              label="Total Expenses Today"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Income Sheet */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-6 shadow-lg backdrop-blur-md h-full min-h-[260px]"
            >
              <div className="font-semibold mb-2 sm:mb-3 text-[#13a1e2]">
                Daily Income Sheet (Last 7 Days)
              </div>
              <ResponsiveContainer width="100%" height={220}>
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
                      fontFamily: "Poppins",
                      fontSize: 12,
                    }}
                    angle={-35}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    domain={[0, "auto"]}
                    tick={{ fill: "#cfd8ff", fontFamily: "Poppins" }}
                  />
                  <Tooltip
                    formatter={(val) =>
                      canFees ? Math.max(0, Number(val) || 0) : "******"
                    }
                    contentStyle={{
                      background: "#1c0450",
                      border: "none",
                      color: "#fff",
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    fill="#8055f7"
                    radius={5}
                    barSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Weekly Attendance */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="bg-white/10 border border-white/20 rounded-2xl p-6 sm:pb-6 shadow-lg backdrop-blur-md h-full min-h-[260px]"
            >
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <div className="font-semibold text-[#13a1e2]">
                  Weekly Attendance (Mon-Fri)
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays size={18} className="text-[#cfd8ff]" />
                  <span className="text-sm text-[#cfd8ff]">
                    {new Date().toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyAttendance}>
                  <XAxis
                    dataKey="label"
                    tick={{
                      fill: "#cfd8ff",
                      fontFamily: "Poppins",
                      fontSize: 12,
                    }}
                    tickFormatter={(_, index) => {
                      const d = weeklyAttendance[index];
                      return d ? `${d.label} ${d.fullDate}` : "";
                    }}
                    angle={-35}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{
                      fill: "#cfd8ff",
                      fontFamily: "Poppins",
                      fontSize: 12,
                    }}
                  />
                  <Tooltip
                    formatter={(value) => [`${value} students`, "Attendance"]}
                  />
                  <Bar dataKey="count" fill="#13a1e2" radius={5} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Daily Expenses (Last 7 Days) */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              className="bg-white/10 border border-white/20 rounded-2xl p-6 sm:p-6 shadow-lg backdrop-blur-md h-full min-h-[260px]"
            >
              <div className="font-semibold mb-2 sm:mb-3 text-[#f75555]">
                Daily Expenses (Last 7 Days)
              </div>
              <ResponsiveContainer width="100%" height={220}>
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
                      fontFamily: "Poppins",
                      fontSize: 12,
                    }}
                    angle={-35}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    domain={[0, "auto"]}
                    tick={{ fill: "#cfd8ff", fontFamily: "Poppins" }}
                  />
                  <Tooltip
                    formatter={(val) =>
                      canExpenses ? Math.max(0, Number(val) || 0) : "******"
                    }
                    contentStyle={{
                      background: "#1c0450",
                      border: "none",
                      color: "#fff",
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    fill="#f75555"
                    radius={5}
                    barSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </>
      )}
    </motion.div>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl px-3 sm:px-6 py-4 sm:py-6 flex flex-col items-center shadow-lg bg-white/10 border border-white/20 backdrop-blur-md text-white hover:bg-white/20"
    >
      <div className="mb-2">{icon}</div>
      <div className="text-xl sm:text-2xl font-extrabold text-white drop-shadow">
        {value}
      </div>
      <div className="text-xs mt-2 opacity-80 text-center text-[#C2C6DC]">
        {label}
      </div>
    </motion.div>
  );
}