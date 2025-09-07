// src/pages/Teachers.jsx
import { useEffect, useMemo, useState } from "react";
import {
  FaChevronDown,
  FaPlus,
  FaEdit,
  FaTrash,
  FaCheck,
  FaTimes,
  FaCalendarAlt,
} from "react-icons/fa";
import { motion } from "framer-motion";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  doc,
  query,
  where,
  Timestamp,
  getDoc,
  setDoc,
  getDocs,
  orderBy,
  deleteField,
} from "firebase/firestore";
import { db } from "../firebase";
import { usePermission } from "../hooks/usePermission";
import { useActiveTerm } from "../hooks/useActiveTerm";

/* ---------- Class structure (Nursery & Basic now A/B arms) ---------- */
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
    section: "Junior Secondary (JSS)",
    classes: ["JSS1 A", "JSS1 B", "JSS2 A", "JSS2 B", "JSS3 A", "JSS3 B"],
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

/* ---------- Small utils ---------- */
function dayKeyOf(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
function normalizedDayTimestamp(date) {
  return Timestamp.fromDate(
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
  );
}
function parseKeyToDate(key) {
  try {
    const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  } catch {
    return null;
  }
}
function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate();
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/* ---------- UI helpers ---------- */
function Banner({ children, tone = "info" }) {
  const colors = {
    info: "bg-blue-500/20 border-blue-400 text-blue-200",
    warn: "bg-yellow-500/20 border-yellow-400 text-yellow-200",
    error: "bg-red-500/20 border-red-400 text-red-200",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-2 ${colors}`}>{children}</div>
  );
}

function Toast({ message, type, onClose }) {
  if (!message) return null;
  const bg =
    type === "error"
      ? "bg-red-500"
      : type === "warn"
      ? "bg-yellow-600"
      : "bg-green-600";
  return (
    <div
      className={`fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-lg text-white shadow-lg ${bg}`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm">{message}</span>
        <button onClick={onClose} className="text-white/80 hover:text-white">
          ✕
        </button>
      </div>
    </div>
  );
}

function ConfirmModal({ open, title = "Confirm", message, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl p-6 rounded-2xl shadow-2xl border border-white/30"
      >
        <h3 className="text-white font-bold text-xl mb-2">{title}</h3>
        <p className="text-white/90 text-sm">{message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------- Main ---------- */
export default function Teachers() {
  const { user, perm, hasSection, isAdmin } = usePermission();
  const termId = useActiveTerm();
  const canTeachers = isAdmin() || hasSection("teachers");

  const [openSection, setOpenSection] = useState("");
  const [teachersByClass, setTeachersByClass] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [activeClass, setActiveClass] = useState("");
  const [form, setForm] = useState({ name: "", age: "", dateJoined: "" });
  const [editId, setEditId] = useState(null);

  // attendance state
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [presentToday, setPresentToday] = useState(0);
  const [viewDate, setViewDate] = useState(new Date());
  const [viewingHistorical, setViewingHistorical] = useState(false);

  // Auto-rollover to the new day without a page refresh
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1
    );
    const msUntilMidnight = midnight.getTime() - now.getTime();
    const timer = setTimeout(() => setViewDate(new Date()), msUntilMidnight);
    return () => clearTimeout(timer);
  }, [viewDate]);

  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState({ message: "", type: "" });
  useEffect(() => {
    if (toast.message) {
      const t = setTimeout(() => setToast({ message: "", type: "" }), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const [confirmState, setConfirmState] = useState({
    open: false,
    teacher: null,
  });

  // Calc modal
  const [showCalc, setShowCalc] = useState(false);
  const [calcStart, setCalcStart] = useState("");
  const [calcEnd, setCalcEnd] = useState("");
  const [holidayDays, setHolidayDays] = useState(0);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcRows, setCalcRows] = useState([]);
  const [calcError, setCalcError] = useState("");

  // Flatten teachers for quick lookup
  const teacherIndex = useMemo(() => {
    const map = new Map();
    Object.entries(teachersByClass).forEach(([cls, list]) => {
      list?.forEach((t) => map.set(t.id, { name: t.name, className: cls }));
    });
    return map;
  }, [teachersByClass]);

  // Subscribe teachers per class (global)
  useEffect(() => {
    if (perm.loading || !user) return;
    if (!canTeachers) {
      setPageError("");
      setTeachersByClass({});
      return;
    }
    const unsubs = allClasses.map((className) => {
      const qy = query(
        collection(db, "teachers"),
        where("className", "==", className)
      );
      return onSnapshot(
        qy,
        (snap) => {
          const arr = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) =>
              String(a.name || "").localeCompare(String(b.name || ""))
            );
          setTeachersByClass((prev) => ({ ...prev, [className]: arr }));
        },
        (err) => setPageError(err?.message || "Failed to load teachers.")
      );
    });
    return () => unsubs.forEach((u) => u && u());
  }, [perm.loading, canTeachers, user]);

  // Ensure today's doc exists (do NOT wipe existing records)
  useEffect(() => {
    if (perm.loading || !user || !canTeachers || !termId) return;
    const key = dayKeyOf(new Date());
    const ref = doc(db, "teacherDailyAttendance", key);
    (async () => {
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(
            ref,
            {
              date: normalizedDayTimestamp(new Date()),
              records: {},
              presentCount: 0,
              termId,
            },
            { merge: true }
          );
        } else {
          const updates = {};
          if (!snap.data()?.date)
            updates.date = normalizedDayTimestamp(new Date());
          if (!snap.data()?.termId) updates.termId = termId;
          if (Object.keys(updates).length)
            await setDoc(ref, updates, { merge: true });
        }
      } catch (e) {
        setToast({
          message: "Failed to initialize today's attendance",
          type: "error",
        });
      }
    })();
  }, [perm.loading, user, canTeachers, termId]);

  // Subscribe attendance for the day currently viewed
  useEffect(() => {
    if (perm.loading || !user || !canTeachers) return;
    const key = dayKeyOf(viewDate);
    const ref = doc(db, "teacherDailyAttendance", key);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setAttendanceRecords(data.records || {});
          setPresentToday(Number(data.presentCount || 0));
        } else {
          setAttendanceRecords({});
          setPresentToday(0);
        }
      },
      (err) => setPageError(err?.message || "Failed to load attendance.")
    );
    return () => unsub();
  }, [viewDate, perm.loading, canTeachers, user]);

  /* ---------- Counter helper: handle transitions correctly ---------- */
  async function applyCountersForStatusChange(tRef, prevStatus, newStatus) {
    const s = await getDoc(tRef);
    if (!s.exists()) return;
    const data = s.data() || {};

    if (data.lastTeacherAttendanceTermId !== termId) {
      data.termPresent = 0;
      data.termAbsent = 0;
    }

    let mP = Number(data.monthlyPresent ?? data.monthlyAttendance ?? 0);
    let mA = Number(data.monthlyAbsent ?? 0);
    let total = Number(data.totalAttendance ?? 0);
    let tP = Number(data.termPresent ?? 0);
    let tA = Number(data.termAbsent ?? 0);

    if (!prevStatus) {
      if (newStatus === "present") {
        mP += 1;
        total += 1;
        tP += 1;
      } else if (newStatus === "absent") {
        mA += 1;
        tA += 1;
      }
    } else if (prevStatus !== newStatus) {
      if (prevStatus === "present" && newStatus === "absent") {
        mP = Math.max(0, mP - 1);
        mA += 1;
        total = Math.max(0, total - 1);
        tP = Math.max(0, tP - 1);
        tA += 1;
      } else if (prevStatus === "absent" && newStatus === "present") {
        mA = Math.max(0, mA - 1);
        mP += 1;
        total += 1;
        tA = Math.max(0, tA - 1);
        tP += 1;
      }
    }
    await updateDoc(tRef, {
      monthlyPresent: mP,
      monthlyAbsent: mA,
      monthlyAttendance: mP,
      totalAttendance: total,
      termPresent: tP,
      termAbsent: tA,
      lastTeacherAttendanceTermId: termId,
    });
  }

  /* ---------- Add / Edit teacher ---------- */
  const openAddModal = (className) => {
    setActiveClass(className);
    setEditId(null);
    setForm({ name: "", age: "", dateJoined: "" });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.age || !activeClass || !form.dateJoined) return;
    const payload = {
      name: form.name.trim(),
      age: Number(form.age),
      className: activeClass,
      dateJoined: Timestamp.fromDate(new Date(form.dateJoined)),
      monthlyPresent: 0,
      monthlyAbsent: 0,
      monthlyAttendance: 0,
      totalAttendance: 0,
      termPresent: 0,
      termAbsent: 0,
      lastTeacherAttendanceTermId: termId || null,
    };
    try {
      if (editId) {
        await updateDoc(doc(db, "teachers", editId), payload);
        setToast({ message: "Teacher updated", type: "success" });
      } else {
        await addDoc(collection(db, "teachers"), payload);
        setToast({ message: "Teacher added", type: "success" });
      }
      setShowModal(false);
      setEditId(null);
      setForm({ name: "", age: "", dateJoined: "" });
    } catch (err) {
      setToast({ message: err?.message || "Save failed", type: "error" });
    }
  };

  // Delete flow (also cleans per-day records)
  const requestDelete = (teacher) => setConfirmState({ open: true, teacher });
  const deleteTeacherAndAttendance = async (teacherId) => {
    try {
      await deleteDoc(doc(db, "teachers", teacherId));
      const dailySnap = await getDocs(collection(db, "teacherDailyAttendance"));
      const updates = dailySnap.docs.map((d) => {
        const data = d.data();
        if (data.records && data.records[teacherId] !== undefined) {
          return updateDoc(d.ref, { [`records.${teacherId}`]: deleteField() });
        }
        return Promise.resolve();
      });
      await Promise.all(updates);
      setToast({
        message: "Teacher and all attendance records deleted!",
        type: "success",
      });
    } catch (err) {
      setToast({
        message: "Failed to delete teacher attendance!",
        type: "error",
      });
    }
  };
  const confirmDelete = async () => {
    const teacher = confirmState.teacher;
    if (!teacher) return setConfirmState({ open: false, teacher: null });
    try {
      await deleteTeacherAndAttendance(teacher.id);
    } finally {
      setConfirmState({ open: false, teacher: null });
    }
  };

  /* ---------- Marking logic (ALLOW corrections same day) ---------- */
  const markAttendance = async (teacher, status) => {
    try {
      const key = dayKeyOf(viewDate);
      const ref = doc(db, "teacherDailyAttendance", key);
      const snap = await getDoc(ref);
      const normalized = status.toLowerCase();

      const existing = snap.exists() ? snap.data().records || {} : {};
      const prev = existing[teacher.id]?.status || null;

      const newRecords = {
        ...existing,
        [teacher.id]: {
          status: normalized,
          timestamp: Timestamp.now(),
          className: teacher.className,
          teacherName: teacher.name,
        },
      };
      const presentCount = Object.values(newRecords).filter(
        (r) => r.status === "present"
      ).length;

      const dateField =
        snap.exists() && snap.data().date instanceof Timestamp
          ? snap.data().date
          : normalizedDayTimestamp(parseKeyToDate(key) || new Date());

      await setDoc(
        ref,
        { date: dateField, records: newRecords, presentCount, termId },
        { merge: true }
      );

      await applyCountersForStatusChange(
        doc(db, "teachers", teacher.id),
        prev,
        normalized
      );

      setToast({
        message: `Marked ${teacher.name} as ${normalized}`,
        type: "success",
      });
    } catch (err) {
      setToast({ message: err?.message || "Failed to mark", type: "error" });
    }
  };

  const markAllInSection = async (section, status) => {
    try {
      const teachersToUpdate = section.classes.flatMap(
        (c) => teachersByClass[c] || []
      );
      if (teachersToUpdate.length === 0) {
        setToast({ message: "No teachers in this section yet.", type: "warn" });
        return;
      }

      const key = dayKeyOf(viewDate);
      const ref = doc(db, "teacherDailyAttendance", key);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data().records || {} : {};
      const records = { ...existing };
      const normalized = status.toLowerCase();

      const updates = [];
      for (const t of teachersToUpdate) {
        const prev = records[t.id]?.status || null;
        if (prev === normalized) continue;
        records[t.id] = {
          status: normalized,
          timestamp: Timestamp.now(),
          className: t.className,
          teacherName: t.name,
        };
        updates.push(
          applyCountersForStatusChange(doc(db, "teachers", t.id), prev, normalized)
        );
      }

      const presentCount = Object.values(records).filter(
        (r) => r.status === "present"
      ).length;
      const dateField =
        snap.exists() && snap.data().date instanceof Timestamp
          ? snap.data().date
          : normalizedDayTimestamp(parseKeyToDate(key) || new Date());

      await setDoc(
        ref,
        { date: dateField, records, presentCount, termId },
        { merge: true }
      );
      await Promise.all(updates);

      setToast({
        message: `Marked ${section.section} ${normalized}`,
        type: "success",
      });
    } catch (err) {
      setToast({ message: err?.message || "Bulk mark failed", type: "error" });
    }
  };

  const toggleHistory = () => setViewingHistorical((v) => !v);
  const shiftDay = (d) => {
    const n = new Date(viewDate);
    n.setDate(n.getDate() + d);
    setViewDate(n);
  };

  /* ---------- Calculation modal helpers ---------- */
  async function runCalculation() {
    setCalcError("");
    setCalcRows([]);
    if (!calcStart || !calcEnd) {
      setCalcError("Select a start and end date.");
      return;
    }
    const start = new Date(calcStart);
    const end = new Date(calcEnd);
    if (end < start) {
      setCalcError("End date cannot be before start date.");
      return;
    }
    if (holidayDays < 0) setCalcError("Holiday days cannot be negative.");

    setCalcLoading(true);
    try {
      const colRef = collection(db, "teacherDailyAttendance");
      const qy = query(colRef, orderBy("date"));
      const snap = await getDocs(qy);

      const inRangeDocs = [];
      snap.forEach((d) => {
        const data = d.data();
        let day = data?.date instanceof Timestamp ? data.date.toDate() : null;
        if (!day) {
          const parsed = parseKeyToDate(d.id);
          if (parsed) day = parsed;
        }
        if (!day) return;
        if (day >= start && day <= end) inRangeDocs.push({ id: d.id, data });
      });

      const totalDays = inRangeDocs.length;
      const adjustedDays = Math.max(0, totalDays - Number(holidayDays || 0));

      const presentMap = new Map();
      inRangeDocs.forEach(({ data }) => {
        const recs = data?.records || {};
        Object.entries(recs).forEach(([tid, rec]) => {
          if (rec?.status === "present") {
            presentMap.set(tid, (presentMap.get(tid) || 0) + 1);
          }
        });
      });

      let knownTeachers = teacherIndex;
      if (!knownTeachers || knownTeachers.size === 0) {
        const ts = await getDocs(collection(db, "teachers"));
        const map = new Map();
        ts.forEach((t) => {
          const v = t.data();
          map.set(t.id, {
            name: v?.name || "—",
            className: v?.className || "",
          });
        });
        knownTeachers = map;
      }

      const rows = [];
      const ids = new Set([
        ...presentMap.keys(),
        ...Array.from(knownTeachers.keys()),
      ]);
      ids.forEach((id) => {
        const meta = knownTeachers.get(id) || {
          name: "Unknown",
          className: "",
        };
        const p = presentMap.get(id) || 0;
        rows.push({
          id,
          name: meta.name,
          className: meta.className,
          present: p,
          schoolDays: adjustedDays,
        });
      });

      rows.sort((a, b) => a.name.localeCompare(b.name));
      setCalcRows(rows);
      setToast({
        message: `Calculated ${rows.length} teachers across ${adjustedDays} school days`,
        type: "success",
      });
    } catch (e) {
      setCalcError(String(e?.message || e));
      setToast({ message: "Calculation failed", type: "error" });
    } finally {
      setCalcLoading(false);
    }
  }

  /* ---------- UI ---------- */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen w-full py-6 px-2 sm:px-8 pb-24"
    >
      <div className="max-w-7xl mx-auto font-[Poppins]">
        <motion.h2
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="font-extrabold text-4xl sm:text-5xl text-white mb-6 text-center drop-shadow-lg"
        >
          Teacher Management
        </motion.h2>

        {!!pageError && (
          <div className="mb-4">
            <Banner tone="error">{pageError}</Banner>
          </div>
        )}
        {!user && (
          <div className="mb-4">
            <Banner tone="warn">Please log in.</Banner>
          </div>
        )}
        {user && !perm.loading && !canTeachers && (
          <div className="mb-4">
            <Banner tone="warn">
              You don't have access to Teachers. Ask an admin to grant the
              "teachers" section.
            </Banner>
          </div>
        )}
        {perm.loading && (
          <div className="mb-4">
            <Banner>Loading permissions...</Banner>
          </div>
        )}

        {/* Header summary */}
        <div className="mb-6 bg-white/10 border border-white/20 rounded-2xl p-4 backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <FaCalendarAlt className="text-white/90 shrink-0" />
              <div className="text-white font-medium">
                {viewDate.toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </div>

            <div className="w-full sm:w-auto">
              <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                <div className="col-span-2 sm:col-auto text-[#9be7c4] font-semibold text-center sm:text-right">
                  Present: {presentToday}
                </div>

                {canTeachers && (
                  <button
                    onClick={() => setShowCalc(true)}
                    className="w-full sm:w-auto px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-center break-words min-h-[2.5rem]"
                  >
                    Calculate Attendance
                  </button>
                )}

                <button
                  onClick={toggleHistory}
                  className={`w-full sm:w-auto px-3 py-2 rounded-lg ${
                    viewingHistorical ? "bg-purple-600/50" : "bg-white/10"
                  } hover:bg-white/20 text-white whitespace-nowrap h-10`}
                >
                  {viewingHistorical ? "Current Day" : "View History"}
                </button>

                {viewingHistorical && (
                  <>
                    <button
                      onClick={() => shiftDay(-1)}
                      className="w-full sm:w-auto px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white whitespace-nowrap h-10"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => shiftDay(1)}
                      disabled={dayKeyOf(viewDate) === dayKeyOf(new Date())}
                      className="w-full sm:w-auto px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 whitespace-nowrap h-10"
                    >
                      Next
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {classStructure.map((section) => {
            const teacherCount = section.classes.reduce(
              (n, c) => n + (teachersByClass[c]?.length || 0),
              0
            );
            return (
              <motion.div
                key={section.section}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="rounded-2xl bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl shadow-2xl border border-white/30 p-6"
              >
                <button
                  className={`flex items-center w-full justify-between px-4 py-3 rounded-xl text-2xl font-bold text-white ${
                    openSection === section.section
                      ? "bg-[#1e007273] backdrop-blur-lg shadow-xl"
                      : ""
                  } hover:bg-white/20 transition mb-2`}
                  onClick={() =>
                    setOpenSection(
                      openSection === section.section ? "" : section.section
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    <span>{section.section}</span>
                    <span className="text-sm bg-[#6C4AB6] text-white px-2 py-1 rounded-full">
                      {teacherCount} {teacherCount === 1 ? "teacher" : "teachers"}
                    </span>
                  </div>
                  <FaChevronDown
                    className={`transition-transform ${
                      openSection === section.section ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* bulk mark */}
                <div
                  className={`${
                    openSection === section.section ? "flex" : "hidden"
                  } gap-3 mb-3`}
                >
                  <button
                    onClick={() => markAllInSection(section, "present")}
                    disabled={!canTeachers || viewingHistorical || teacherCount === 0}
                    title={teacherCount === 0 ? "No teachers in this section" : ""}
                    className={`px-3 py-2 rounded-lg text-white flex items-center gap-2
                      bg-green-600/50 hover:bg-green-600/70
                      ${
                        !canTeachers || viewingHistorical || teacherCount === 0
                          ? "opacity-50 cursor-not-allowed hover:bg-green-600/50"
                          : ""
                      }`}
                  >
                    <FaCheck /> Mark Section Present
                  </button>

                  <button
                    onClick={() => markAllInSection(section, "absent")}
                    disabled={!canTeachers || viewingHistorical || teacherCount === 0}
                    title={teacherCount === 0 ? "No teachers in this section" : ""}
                    className={`px-3 py-2 rounded-lg text-white flex items-center gap-2
                      bg-red-600/50 hover:bg-red-600/70
                      ${
                        !canTeachers || viewingHistorical || teacherCount === 0
                          ? "opacity-50 cursor-not-allowed hover:bg-red-600/50"
                          : ""
                      }`}
                  >
                    <FaTimes /> Mark Section Absent
                  </button>
                </div>

                {/* Content */}
                <motion.div
                  initial={false}
                  animate={{
                    height: openSection === section.section ? "auto" : 0,
                    opacity: openSection === section.section ? 1 : 0,
                  }}
                  transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="flex flex-col gap-6 mt-3">
                    {section.classes.map((className) => (
                      <TeacherClassBlock
                        key={className}
                        className={className}
                        teachers={teachersByClass[className] || []}
                        attendanceRecords={attendanceRecords}
                        onAdd={() => openAddModal(className)}
                        onEdit={(t) => {
                          setShowModal(true);
                          setActiveClass(t.className);
                          setEditId(t.id);
                          setForm({
                            name: t.name || "",
                            age: t.age || "",
                            dateJoined:
                              t.dateJoined instanceof Timestamp
                                ? t.dateJoined
                                    .toDate()
                                    .toISOString()
                                    .substring(0, 10)
                                : "",
                          });
                        }}
                        onDelete={(t) => requestDelete(t)}
                        onMark={markAttendance}
                        viewingHistorical={viewingHistorical}
                        canTeachers={canTeachers}
                        termId={termId}
                      />
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {/* Add/Edit Modal */}
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-[95vw] sm:max-w-md bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl p-6 rounded-2xl shadow-2xl border border-white/30"
            >
              <h3 className="font-bold text-xl mb-4 text-white">
                {editId ? "Edit" : "Add"} Teacher
              </h3>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white mb-1">Class</label>
                    <input
                      type="text"
                      value={activeClass}
                      readOnly
                      disabled
                      className="border border-[#e7e2f8] rounded-lg px-3 py-2 bg-white/20 text-white w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white mb-1">
                      Date Joined
                    </label>
                    <input
                      type="date"
                      value={form.dateJoined}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, dateJoined: e.target.value }))
                      }
                      className="border border-[#e7e2f8] rounded-lg px-3 py-2 bg-white/10 text-white w-full text-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white mb-1">Full Name</label>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="border border-[#e7e2f8] rounded-lg px-3 py-2 bg-white/10 text-white w-full text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-white mb-1">Age</label>
                  <input
                    type="number"
                    min={16}
                    placeholder="Age"
                    value={form.age}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, age: e.target.value }))
                    }
                    className="border border-[#e7e2f8] rounded-lg px-3 py-2 bg-white/10 text-white w-full text-sm"
                    required
                  />
                </div>

                <div className="flex gap-3 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditId(null);
                      setForm({ name: "", age: "", dateJoined: "" });
                    }}
                    className="px-4 py-1.5 bg-gray-100 text-red-500 rounded-lg hover:bg-gray-200 transition text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-1.5 bg-[#6C4AB6] text-white font-semibold rounded-lg hover:bg-[#8055f7] transition text-sm"
                  >
                    {editId ? "Update" : "Add"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* Calculation Modal */}
        {showCalc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-3xl bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl p-6 rounded-2xl shadow-2xl border border-white/30"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-bold text-xl text-white">
                  Calculate Attendance (Range)
                </h3>
                <button
                  onClick={() => {
                    setShowCalc(false);
                    setCalcRows([]);
                    setCalcError("");
                  }}
                  className="text-white/80 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
                <div className="sm:col-span-1">
                  <label className="block text-xs text-white mb-1">
                    Start date
                  </label>
                  <input
                    type="date"
                    value={calcStart}
                    onChange={(e) => setCalcStart(e.target.value)}
                    className="border border-[#e7e2f8] rounded-lg px-3 py-2 bg-white/10 text-white w-full text-sm"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs text-white mb-1">End date</label>
                  <input
                    type="date"
                    value={calcEnd}
                    onChange={(e) => setCalcEnd(e.target.value)}
                    className="border border-[#e7e2f8] rounded-lg px-3 py-2 bg-white/10 text-white w-full text-sm"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs text-white mb-1">
                    Holiday/Break days
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={holidayDays}
                    onChange={(e) =>
                      setHolidayDays(parseInt(e.target.value || "0", 10))
                    }
                    className="border border-[#e7e2f8] rounded-lg px-3 py-2 bg-white/10 text-white w-full text-sm"
                  />
                </div>
                <div className="sm:col-span-1 flex items-end">
                  <button
                    onClick={runCalculation}
                    disabled={calcLoading}
                    className="w-full px-4 py-2 rounded-lg bg-[#6C4AB6] text-white font-semibold hover:bg-[#8055f7] shadow-lg disabled:opacity-50"
                  >
                    {calcLoading ? "Calculating..." : "Run"}
                  </button>
                </div>
              </div>

              {calcError && (
                <div className="mt-4">
                  <Banner tone="error">{calcError}</Banner>
                </div>
              )}

              <div className="mt-5 overflow-x-auto rounded-xl border border-white/20">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-[#1e0447]/90 to-[#372772]/90 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-[#cfcfcf]">
                        Teacher
                      </th>
                      <th className="px-3 py-2 text-left text-[#cfcfcf]">
                        Class
                      </th>
                      <th className="px-3 py-2 text-left text-[#cfcfcf] whitespace-nowrap">
                        Present / School Days
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {calcRows.length === 0 && !calcLoading && (
                      <tr>
                        <td colSpan={3} className="text-center text-white py-8">
                          No data yet. Choose dates and click Run.
                        </td>
                      </tr>
                    )}
                    {calcRows.map((r) => (
                      <tr key={r.id} className="even:bg-white/10">
                        <td className="px-3 py-2 text-white">{r.name}</td>
                        <td className="px-3 py-2 text-white/80">
                          {r.className || "-"}
                        </td>
                        <td className="px-3 py-2 text-white">
                          <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-white/10 text-white">
                            {r.present} / {r.schoolDays}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>

      <ConfirmModal
        open={confirmState.open}
        title="Delete Teacher"
        message={
          confirmState.teacher
            ? `Are you sure you want to delete ${confirmState.teacher.name}? This will also clean attendance records referencing them.`
            : ""
        }
        onCancel={() => setConfirmState({ open: false, teacher: null })}
        onConfirm={confirmDelete}
      />

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "" })}
      />
    </motion.div>
  );
}

/* ---------- Class block with table ---------- */
function TeacherClassBlock({
  className,
  teachers,
  attendanceRecords,
  onAdd,
  onEdit,
  onDelete,
  onMark,
  viewingHistorical,
  canTeachers,
  termId,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl backdrop-blur-2xl shadow-xl border border-white/20 p-4 sm:p-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg sm:text-xl font-bold text-white">
            {className}
          </span>
          <span className="text-sm bg-[#6C4AB6] text-white px-2 py-1 rounded-full">
            {teachers.length} {teachers.length === 1 ? "teacher" : "teachers"}
          </span>
        </div>
        <button
          onClick={onAdd}
          disabled={!canTeachers}
          className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#6C4AB6] text-white font-semibold hover:bg-[#8055f7] shadow-lg ${
            !canTeachers ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <FaPlus /> Add Teacher
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block w-full overflow-x-auto">
        <table className="w-full text-sm rounded-xl">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gradient-to-r from-[#1e0447]/90 to-[#372772]/90">
              <th className="px-3 py-2 text-left text-[#cfcfcf]">Name</th>
              <th className="px-3 py-2 text-left text-[#cfcfcf]">Status</th>
              <th className="px-3 py-2 text-left text-[#cfcfcf]">Time</th>
              <th className="px-3 py-2 text-left text-[#cfcfcf]">Present</th>
              <th className="px-3 py-2 text-left text-[#cfcfcf]">Absent</th>
              <th className="px-3 py-2 text-left text-[#cfcfcf]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {teachers.map((t) => {
              const rec = attendanceRecords[t.id];

              const inThisTerm =
                t?.lastTeacherAttendanceTermId &&
                termId &&
                t.lastTeacherAttendanceTermId === termId;
              const termPresent = inThisTerm ? Number(t.termPresent || 0) : 0;
              const termAbsent = inThisTerm ? Number(t.termAbsent || 0) : 0;

              return (
                <tr key={t.id} className="even:bg-white/10">
                  <td className="px-3 py-2 text-white">{t.name}</td>

                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                        rec?.status === "present"
                          ? "bg-green-500/20 text-green-300"
                          : rec?.status === "absent"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-gray-500/20 text-gray-300"
                      }`}
                    >
                      {rec?.status ? rec.status : "not marked"}
                    </span>
                  </td>

                  <td className="px-3 py-2 text-white">
                    {rec?.timestamp ? formatTime(rec.timestamp) : "-"}
                  </td>

                  <td className="px-3 py-2 text-white">{termPresent}</td>
                  <td className="px-3 py-2 text-white">{termAbsent}</td>

                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onMark(t, "present")}
                        disabled={!canTeachers || viewingHistorical}
                        className={`p-2 rounded-lg ${
                          rec?.status === "present"
                            ? "bg-green-500/30"
                            : "bg-black/40 hover:bg-green-500/20"
                        } text-green-400 ${
                          !canTeachers || viewingHistorical
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                        title="Mark present"
                      >
                        <FaCheck size={14} />
                      </button>
                      <button
                        onClick={() => onMark(t, "absent")}
                        disabled={!canTeachers || viewingHistorical}
                        className={`p-2 rounded-lg ${
                          rec?.status === "absent"
                            ? "bg-red-500/30"
                            : "bg-black/40 hover:bg-red-500/20"
                        } text-red-400 ${
                          !canTeachers || viewingHistorical
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                        title="Mark absent"
                      >
                        <FaTimes size={14} />
                      </button>
                      <button
                        onClick={() => onEdit(t)}
                        disabled={!canTeachers}
                        className={`p-2 rounded-lg bg-black/40 hover:bg-white/10 text-white ${
                          !canTeachers ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                        title="Edit"
                      >
                        <FaEdit size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(t)}
                        disabled={!canTeachers}
                        className={`p-2 rounded-lg bg-black/40 hover:bg-red-500/10 text-red-400 ${
                          !canTeachers ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                        title="Delete"
                      >
                        <FaTrash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-white">
                  No teachers yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {teachers.map((t) => {
          const rec = attendanceRecords[t.id];
          const inThisTerm =
            t?.lastTeacherAttendanceTermId &&
            termId &&
            t.lastTeacherAttendanceTermId === termId;
          const termPresent = inThisTerm ? Number(t.termPresent || 0) : 0;
          const termAbsent = inThisTerm ? Number(t.termAbsent || 0) : 0;

          return (
            <div
              key={t.id}
              className="bg-white/5 rounded-lg p-4 border border-white/10"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-white">{t.name}</h3>
                  <p className="text-xs text-white/70">{className}</p>
                </div>
                <span
                  className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                    rec?.status === "present"
                      ? "bg-green-500/20 text-green-300"
                      : rec?.status === "absent"
                      ? "bg-red-500/20 text-red-300"
                      : "bg-gray-500/20 text-gray-300"
                  }`}
                >
                  {rec?.status ? rec.status : "not marked"}
                </span>
              </div>

              <div className="mt-2 text-xs text-white/80">
                Time: {rec?.timestamp ? formatTime(rec.timestamp) : "-"}
              </div>
              <div className="mt-1 text-xs text-white/80">
                Present: {termPresent} • Absent: {termAbsent}
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => onMark(t, "present")}
                  disabled={!canTeachers || viewingHistorical}
                  className={`flex-1 p-2 rounded-lg ${
                    rec?.status === "present"
                      ? "bg-green-500/30 text-green-300"
                      : "bg-black/40 hover:bg-green-500/20 text-green-300"
                  } ${
                    !canTeachers || viewingHistorical
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  <FaCheck size={14} />
                </button>
                <button
                  onClick={() => onMark(t, "absent")}
                  disabled={!canTeachers || viewingHistorical}
                  className={`flex-1 p-2 rounded-lg ${
                    rec?.status === "absent"
                      ? "bg-red-500/30 text-red-300"
                      : "bg-black/40 hover:bg-red-500/20 text-red-300"
                  } ${
                    !canTeachers || viewingHistorical
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  <FaTimes size={14} />
                </button>
                <button
                  onClick={() => onEdit(t)}
                  disabled={!canTeachers}
                  className={`p-2 rounded-lg bg-black/40 hover:bg-white/10 text-white ${
                    !canTeachers ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <FaEdit size={14} />
                </button>
                <button
                  onClick={() => onDelete(t)}
                  disabled={!canTeachers}
                  className={`p-2 rounded-lg bg-black/40 hover:bg-red-500/10 text-red-400 ${
                    !canTeachers ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <FaTrash size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {teachers.length === 0 && (
          <div className="text-center py-6 text-white">No teachers yet</div>
        )}
      </div>
    </motion.div>
  );
}
