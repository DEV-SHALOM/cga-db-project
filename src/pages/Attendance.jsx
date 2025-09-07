import { useEffect, useState } from "react";
import {
  FaChevronDown,
  FaCheck,
  FaTimes,
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { motion } from "framer-motion";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
  getDoc,
  updateDoc,
  increment,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { useActiveTerm } from "../hooks/useActiveTerm";

/* --------------------------- CLASS STRUCTURE --------------------------- */
// helper to create A/B streams like ["Nursery 1 A","Nursery 1 B",...]
const makeAB = (prefix, count) =>
  Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return [`${prefix} ${n} A`, `${prefix} ${n} B`];
  }).flat();

const classStructure = [
  { section: "Pre-Kg", classes: ["Pre-Kg"] },

  // Nursery 1–3 with A/B
  { section: "Nursery", classes: makeAB("Nursery", 3) },

  // Basic 1–5 with A/B
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

/* ------------------------------ HELPERS ------------------------------- */
function getDayKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; // keep existing unpadded key format
}
function normalizedDayTimestamp(d) {
  // Store noon of the selected day to avoid timezone edge cases in range queries
  return Timestamp.fromDate(
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0)
  );
}
function toDateInputValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate();
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Notification({ message }) {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-8 py-3 rounded-xl shadow-2xl z-[9999]">
      {message}
    </div>
  );
}

/* -------------------------- CLASS HEADER UI --------------------------- */
function ClassHeader({ name, total, present, absent }) {
  return (
    <div className="mb-4 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
      {/* Row 1: name + total */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <h3
            className="text-white font-semibold text-base sm:text-lg truncate"
            title={name}
          >
            {name}
          </h3>
        </div>

        {/* total pill — never wrap */}
        <div
          className="shrink-0 whitespace-nowrap inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#6C4AB6]/40 px-2.5 py-1 text-white text-xs sm:text-sm"
          title={`${total} ${total === 1 ? "student" : "students"}`}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">
            {total}
          </span>
          <span className="hidden sm:inline">
            {total === 1 ? "student" : "students"}
          </span>
        </div>
      </div>

      {/* Row 2: present/absent chips */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-300 px-2.5 py-1 text-xs font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          {present} <span className="hidden sm:inline">Present</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-300 px-2.5 py-1 text-xs font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          {absent} <span className="hidden sm:inline">Absent</span>
        </span>
      </div>
    </div>
  );
}

/* ---------------------------- MAIN COMPONENT --------------------------- */
export default function AttendancePage() {
  const termId = useActiveTerm(); // 👈 current active term

  const [openSection, setOpenSection] = useState("");
  const [students, setStudents] = useState({});
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [selectedClass, setSelectedClass] = useState("");
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [notification, setNotification] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [studentAttendanceStats, setStudentAttendanceStats] = useState({});
  const [viewingHistorical, setViewingHistorical] = useState(false);
  const [historicalDate, setHistoricalDate] = useState(new Date());
  const [historicalRecords, setHistoricalRecords] = useState({});

  // ===== Modal state (Calculate Attendance Range) =====
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [holidayDays, setHolidayDays] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [rangeResults, setRangeResults] = useState(null); // { totalSchoolDays, rows: [{id,name,className,studentId,present}] }

  // Switch to the next day exactly at local midnight (no refresh needed)
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1 // +1s buffer
    );
    const ms = midnight.getTime() - now.getTime();

    const timer = setTimeout(() => {
      setCurrentDate(new Date());
    }, ms);

    return () => clearTimeout(timer);
  }, [currentDate]);

  // Track current date tick
  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date();
      if (now.getDate() !== currentDate.getDate()) setCurrentDate(now);
    }, 60000);
    return () => clearInterval(t);
  }, [currentDate]);

  // Students (by class) — global (no term filter)
  useEffect(() => {
    const unsubscribes = [];
    allClasses.forEach((className) => {
      const qy = query(
        collection(db, "students"),
        where("className", "==", className)
      );
      const unsub = onSnapshot(qy, (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setStudents((prev) => ({ ...prev, [className]: arr }));
      });
      unsubscribes.push(unsub);
    });
    return () => unsubscribes.forEach((u) => u());
  }, []);

  // Today's attendance (live)
  useEffect(() => {
    if (viewingHistorical) return;
    const key = getDayKey(currentDate);
    const ref = doc(db, "dailyAttendance", key);
    const unsub = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        setAttendanceRecords(snap.data().records || {});
      } else {
        // ensure doc exists with normalized date for today + termId
        await setDoc(
          ref,
          {
            date: normalizedDayTimestamp(currentDate),
            records: {},
            presentCount: 0,
            termId, // 👈 tag with current term
          },
          { merge: true }
        );
        setAttendanceRecords({});
      }
    });
    return () => unsub();
  }, [currentDate, viewingHistorical, termId]);

  // Historical day view (live)
  useEffect(() => {
    if (!viewingHistorical) return;
    const key = getDayKey(historicalDate);
    const ref = doc(db, "dailyAttendance", key);
    const unsub = onSnapshot(ref, (snap) => {
      setHistoricalRecords(snap.exists() ? snap.data().records || {} : {});
    });
    return () => unsub();
  }, [viewingHistorical, historicalDate]);

  // Term counters for students (show per-term stats)
  useEffect(() => {
    if (!termId) return;
    const unsubscribes = [];
    allClasses.forEach((className) => {
      (students[className] || []).forEach((student) => {
        const ref = doc(db, "students", student.id);
        const unsub = onSnapshot(ref, (snap) => {
          if (!snap.exists()) return;
          const data = snap.data() || {};
          // use term counters if this doc has been "touched" in the active term, else 0
          const inThisTerm = data.lastAttendanceTermId === termId;
          const tP = Math.max(inThisTerm ? data.termTimesPresent || 0 : 0, 0);
          const tA = Math.max(inThisTerm ? data.termTimesAbsent || 0 : 0, 0);
          const total = tP + tA;
          const pct = total > 0 ? Math.round((tP / total) * 100) : 0;

          setStudentAttendanceStats((prev) => ({
            ...prev,
            [student.id]: {
              timesPresent: tP,
              timesAbsent: tA,
              attendancePercentage: pct,
            },
          }));
        });
        unsubscribes.push(unsub);
      });
    });
    return () => unsubscribes.forEach((u) => u());
  }, [students, termId]);

  // --- utility: ensure per-term counters are reset when term changes ---
  async function ensureStudentTermCounters(sRef, sSnap, termIdLocal) {
    const data = sSnap.data() || {};
    if (data.lastAttendanceTermId !== termIdLocal) {
      await updateDoc(sRef, {
        termTimesPresent: 0,
        termTimesAbsent: 0,
        lastAttendanceTermId: termIdLocal,
      });
      return {
        ...data,
        termTimesPresent: 0,
        termTimesAbsent: 0,
        lastAttendanceTermId: termIdLocal,
      };
    }
    return data;
  }

  // --- core writer: single student ---
  const markAttendance = async (studentId, status, className) => {
    const targetDate = viewingHistorical ? historicalDate : currentDate;
    const key = getDayKey(targetDate);
    const isHistorical = viewingHistorical;
    try {
      const dayRef = doc(db, "dailyAttendance", key);
      const daySnap = await getDoc(dayRef);
      const sRef = doc(db, "students", studentId);
      const sSnap = await getDoc(sRef);
      if (!sSnap.exists()) throw new Error("Student not found");

      const normalized = status.toLowerCase();
      const newRecord = {
        status: normalized,
        timestamp: Timestamp.now(),
        className,
        studentName: sSnap.data().name,
      };

      const existing = daySnap.exists() ? daySnap.data().records || {} : {};
      const before = existing[studentId];
      const changed = !!before && before.status !== normalized;

      const updated = { ...existing, [studentId]: newRecord };
      const presentCount = Object.values(updated).filter(
        (r) => r.status === "present"
      ).length;

      await setDoc(
        dayRef,
        {
          date: normalizedDayTimestamp(targetDate),
          records: updated,
          presentCount,
          termId, // 👈 keep term tag on the day doc
        },
        { merge: true }
      );

      // lifetime + per-term counters
      let cur = await ensureStudentTermCounters(sRef, sSnap, termId);
      const curP = Math.max(cur.timesPresent || 0, 0);
      const curA = Math.max(cur.timesAbsent || 0, 0);
      const curTP = Math.max(cur.termTimesPresent || 0, 0);
      const curTA = Math.max(cur.termTimesAbsent || 0, 0);

      const updates = {};
      if (!before) {
        if (normalized === "present") {
          updates.timesPresent = increment(1);
          updates.termTimesPresent = increment(1);
        } else if (normalized === "absent") {
          updates.timesAbsent = increment(1);
          updates.termTimesAbsent = increment(1);
        }
      } else if (changed) {
        if (before.status === "present" && normalized === "absent") {
          if (curP > 0) updates.timesPresent = increment(-1);
          updates.timesAbsent = increment(1);
          if (curTP > 0) updates.termTimesPresent = increment(-1);
          updates.termTimesAbsent = increment(1);
        } else if (before.status === "absent" && normalized === "present") {
          if (curA > 0) updates.timesAbsent = increment(-1);
          updates.timesPresent = increment(1);
          if (curTA > 0) updates.termTimesAbsent = increment(-1);
          updates.termTimesPresent = increment(1);
        }
      }
      if (Object.keys(updates).length) await updateDoc(sRef, updates);

      if (isHistorical) setHistoricalRecords(updated);
      else setAttendanceRecords(updated);
    } catch (e) {
      console.error(e);
      setNotification("Error updating attendance: " + e.message);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  // --- core writer: bulk by section ---
  const markAllStudents = async (section, status) => {
    const targetDate = viewingHistorical ? historicalDate : currentDate;
    const key = getDayKey(targetDate);
    const isHistorical = viewingHistorical;

    try {
      const dayRef = doc(db, "dailyAttendance", key);
      const daySnap = await getDoc(dayRef);
      const existing = daySnap.exists() ? daySnap.data().records || {} : {};
      const sec = classStructure.find((s) => s.section === section);
      if (!sec) return;

      let updated = { ...existing };
      const toUpdate = [];
      for (const className of sec.classes) {
        for (const s of students[className] || []) {
          const desired = status.toLowerCase();
          if (existing[s.id]?.status === desired) continue;

          const sRef = doc(db, "students", s.id);
          const sSnap = await getDoc(sRef);
          let cur = sSnap.exists() ? sSnap.data() : {};
          cur = await ensureStudentTermCounters(sRef, sSnap, termId);

          const newRec = {
            status: desired,
            timestamp: Timestamp.now(),
            className,
            studentName: s.name,
          };
          updated[s.id] = newRec;

          const u = {};
          const curP = Math.max(cur.timesPresent || 0, 0);
          const curA = Math.max(cur.timesAbsent || 0, 0);
          const curTP = Math.max(cur.termTimesPresent || 0, 0);
          const curTA = Math.max(cur.termTimesAbsent || 0, 0);

          if (!existing[s.id]) {
            if (desired === "present") {
              u.timesPresent = increment(1);
              u.termTimesPresent = increment(1);
            } else {
              u.timesAbsent = increment(1);
              u.termTimesAbsent = increment(1);
            }
          } else if (existing[s.id].status !== desired) {
            if (existing[s.id].status === "present" && desired === "absent") {
              if (curP > 0) u.timesPresent = increment(-1);
              u.timesAbsent = increment(1);
              if (curTP > 0) u.termTimesPresent = increment(-1);
              u.termTimesAbsent = increment(1);
            } else if (
              existing[s.id].status === "absent" &&
              desired === "present"
            ) {
              if (curTA > 0) u.termTimesAbsent = increment(-1);
              u.termTimesPresent = increment(1);
              if (curA > 0) u.timesAbsent = increment(-1);
              u.timesPresent = increment(1);
            }
          }
          if (Object.keys(u).length) toUpdate.push({ ref: sRef, updates: u });
        }
      }

      await setDoc(
        dayRef,
        {
          date: normalizedDayTimestamp(targetDate),
          records: updated,
          presentCount: Object.values(updated).filter(
            (r) => r.status === "present"
          ).length,
          termId, // 👈 keep term tag on the day doc
        },
        { merge: true }
      );
      for (const { ref, updates } of toUpdate) await updateDoc(ref, updates);

      if (isHistorical) setHistoricalRecords(updated);
      else setAttendanceRecords(updated);

      setNotification(
        `All students in ${section} marked ${status} for ${toDateInputValue(
          targetDate
        )}`
      );
      setTimeout(() => setNotification(null), 3500);
    } catch (e) {
      console.error(e);
      setNotification("Error updating attendance: " + e.message);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  const toggleHistoricalView = () => {
    setViewingHistorical((v) => !v);
    if (!viewingHistorical) setHistoricalDate(new Date());
  };
  const changeHistoricalDate = (days) => {
    const d = new Date(historicalDate);
    d.setDate(d.getDate() + days);
    // prevent going into the future
    const today = new Date();
    if (d > today) return;
    setHistoricalDate(d);
  };

  const calculateClassAttendance = (className) => {
    const classStudents = students[className] || [];
    const records = viewingHistorical ? historicalRecords : attendanceRecords;
    let present = 0,
      absent = 0;
    classStudents.forEach((st) => {
      const r = records[st.id];
      if (r?.status === "present") present++;
      if (r?.status === "absent") absent++;
    });
    return { total: classStudents.length, present, absent };
  };
  const calculateSectionAttendance = (section) => {
    let total = 0,
      present = 0,
      absent = 0;
    section.classes.forEach((c) => {
      const s = calculateClassAttendance(c);
      total += s.total;
      present += s.present;
      absent += s.absent;
    });
    return { total, present, absent };
  };

  // ===== Run range calculation (no percentages) =====
  const runRangeCalc = async () => {
    if (!rangeStart) {
      setNotification("Pick a start date.");
      setTimeout(() => setNotification(null), 2500);
      return;
    }
    setIsRunning(true);
    try {
      const start = new Date(rangeStart);
      const end = rangeEnd ? new Date(rangeEnd) : new Date();
      const startMid = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
        0,
        0,
        0,
        0
      );
      const endMid = new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate(),
        23,
        59,
        59,
        999
      );

      // Try indexed query; fallback to client filter if index missing
      let docs;
      try {
        const qy = query(
          collection(db, "dailyAttendance"),
          where("date", ">=", Timestamp.fromDate(startMid)),
          where("date", "<=", Timestamp.fromDate(endMid))
        );
        const snap = await getDocs(qy);
        docs = snap.docs.map((d) => d.data());
      } catch {
        const snap = await getDocs(collection(db, "dailyAttendance"));
        docs = snap.docs
          .map((d) => d.data())
          .filter(
            (x) =>
              x?.date?.toDate &&
              x.date.toDate() >= startMid &&
              x.date.toDate() <= endMid
          );
      }

      const daysWithAttendance = docs.filter((d) => d && d.records).length;
      const totalSchoolDays = Math.max(
        daysWithAttendance - Math.max(parseInt(holidayDays || 0, 10), 0),
        0
      );

      const studentMeta = new Map(); // id -> {name,className, studentId}
      allClasses.forEach((c) => {
        (students[c] || []).forEach((s) => {
          studentMeta.set(s.id, {
            name: s.name || "—",
            className: s.className || c,
            studentId: s.studentId || "",
          });
        });
      });

      const presents = new Map(); // id -> count
      docs.forEach((day) => {
        Object.entries(day.records || {}).forEach(([sid, rec]) => {
          if (rec?.status === "present") {
            presents.set(sid, (presents.get(sid) || 0) + 1);
          }
        });
      });

      const rows = [];
      studentMeta.forEach((meta, sid) => {
        rows.push({
          id: sid,
          name: meta.name,
          className: meta.className,
          studentId: meta.studentId,
          present: presents.get(sid) || 0,
        });
      });

      rows.sort(
        (a, b) =>
          (a.className || "").localeCompare(b.className || "") ||
          (a.name || "").localeCompare(b.name || "")
      );

      setRangeResults({ totalSchoolDays, rows });
    } catch (e) {
      console.error(e);
      setNotification("Error computing range: " + e.message);
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setIsRunning(false);
    }
  };

  const getDateControls = () => {
    if (!viewingHistorical) return null;
    const label = historicalDate.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const isToday = historicalDate.toDateString() === new Date().toDateString();
    return (
      <div className="flex flex-col items-center gap-3 mb-6">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => changeHistoricalDate(-1)}
            className="p-2 rounded-full hover:bg-white/10"
          >
            <FaChevronLeft className="text-white" />
          </button>

          <div className="text-white font-medium text-center">
            {label}
            {isToday && (
              <span className="ml-2 text-sm bg-blue-500/30 px-2 py-1 rounded-full">
                Today
              </span>
            )}
          </div>

          <button
            onClick={() => changeHistoricalDate(1)}
            disabled={isToday}
            className={`p-2 rounded-full hover:bg-white/10 ${
              isToday ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <FaChevronRight className="text-white" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={toDateInputValue(historicalDate)}
            max={toDateInputValue(new Date())}
            onChange={(e) => {
              const d = new Date(e.target.value);
              const today = new Date();
              if (d > today) return;
              setHistoricalDate(d);
            }}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white outline-none"
          />
          <span className="text-white/70 text-sm">Jump to date</span>
        </div>

        <div className="text-amber-300/90 text-sm bg-amber-500/10 border border-amber-400/20 px-3 py-2 rounded-lg">
          You are editing <b>{toDateInputValue(historicalDate)}</b>. Changes
          here update lifetime totals.
        </div>
      </div>
    );
  };

  const toggleClassDropdown = () => setShowClassDropdown((v) => !v);
  const handleClassSelect = (sectionName) => {
    setSelectedClass(sectionName);
    setShowClassDropdown(false);
  };

  const recordsForView = viewingHistorical
    ? historicalRecords
    : attendanceRecords;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen w-full py-6 px-2 sm:px-8 pb-24 relative z-2"
    >
      {notification && <Notification message={notification} />}

      <div className="max-w-7xl mx-auto font-[Poppins]">
        <motion.h2 className="font-extrabold text-4xl sm:text-5xl text-white mb-10 text-center drop-shadow-lg tracking-wide">
          Attendance Management
        </motion.h2>

        {/* Top bar: class selector + date + actions */}
        <div className="mb-8 bg-white/10 border border-white/20 rounded-2xl p-6 backdrop-blur-md relative z-20">
          <div className="flex flex-col lg:flex-row items-center gap-4">
            <div className="w-full sm:w-64 relative z-50">
              <button
                onClick={toggleClassDropdown}
                className="w-full bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 border border-[#e7e2f8] rounded-lg px-4 py-2 text-white font-medium flex justify-between items-center"
              >
                {selectedClass || "Select Class Section"}
                <FaChevronDown
                  className={`ml-2 text-white transition-transform ${
                    showClassDropdown ? "rotate-180" : ""
                  }`}
                />
              </button>
              {showClassDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute mt-1 w-full rounded-xl shadow-2xl bg-gradient-to-tr from-[#1e0447]/80 via-[#372772]/90 to-[#181A2A]/90 backdrop-blur-2xl border border-white/30 z-50"
                >
                  {classStructure.map((section) => {
                    const stats = calculateSectionAttendance(section);
                    return (
                      <button
                        key={section.section}
                        onClick={() => handleClassSelect(section.section)}
                        className="w-full text-left px-6 py-3 text-base font-bold text-white hover:bg-[#8055f7]/40 flex justify-between items-center"
                      >
                        <span>{section.section}</span>
                        <div className="flex gap-2 text-xs">
                          <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                            {stats.present} Present
                          </span>
                          <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded-full">
                            {stats.absent} Absent
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </div>

            <div className="text-white font-medium">
              {currentDate.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>

            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setShowCalcModal(true)}
                className="px-4 py-2 rounded-lg bg-black/40 border border-white/20 text-white hover:bg-black/60 transition"
              >
                Calculate Attendance
              </button>
              <button
                onClick={toggleHistoricalView}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  viewingHistorical ? "bg-purple-600/50" : "bg-white/10"
                } hover:bg-white/20 transition-colors`}
              >
                <FaCalendarAlt />
                {viewingHistorical ? "Current Day" : "View History"}
              </button>
            </div>
          </div>
        </div>

        {getDateControls()}

        {selectedClass ? (
          <div className="space-y-8">
            {classStructure
              .filter((sec) => sec.section === selectedClass)
              .map((section) => {
                const sectionStats = calculateSectionAttendance(section);
                return (
                  <motion.div
                    key={section.section}
                    className="relative z-10 rounded-2xl bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl shadow-2xl border border-white/30 p-6"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <button
                        className={`flex items-center w-full justify-between px-4 py-3 rounded-xl text-2xl font-bold text-white ${
                          openSection === section.section
                            ? "bg-[#1e007273] backdrop-blur-lg shadow-xl"
                            : ""
                        }`}
                        onClick={() =>
                          setOpenSection((v) =>
                            v === section.section ? "" : section.section
                          )
                        }
                      >
                        <div className="flex items-center gap-3">
                          <span>{section.section}</span>
                          <span className="text-sm bg-[#6C4AB6] text-white px-2 py-1 rounded-full">
                            {sectionStats.total}{" "}
                            {sectionStats.total === 1 ? "student" : "students"}
                          </span>
                        </div>
                        <div className="flex gap-4">
                          <span className="text-green-400 text-sm sm:text-base">
                            {sectionStats.present} Present
                          </span>
                          <span className="text-red-400 text-sm sm:text-base">
                            {sectionStats.absent} Absent
                          </span>
                        </div>
                        <FaChevronDown
                          className={`transition-transform ${
                            openSection === section.section ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>

                    {/* Mark-all (disabled when no students in section) */}
                    {(() => {
                      const hasStudents = sectionStats.total > 0;
                      return (
                        <div className="flex gap-4 mb-4">
                          <button
                            onClick={() =>
                              hasStudents &&
                              markAllStudents(section.section, "present")
                            }
                            disabled={!hasStudents}
                            aria-disabled={!hasStudents}
                            className={`flex-1 px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-white
                            ${
                              hasStudents
                                ? "bg-green-600/50 hover:bg-green-600/70"
                                : "bg-green-600/30 cursor-not-allowed opacity-60"
                            }`}
                          >
                            <span className="font-bold">✓</span> Mark All
                            Present
                          </button>

                          <button
                            onClick={() =>
                              hasStudents &&
                              markAllStudents(section.section, "absent")
                            }
                            disabled={!hasStudents}
                            aria-disabled={!hasStudents}
                            className={`flex-1 px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-white
                            ${
                              hasStudents
                                ? "bg-red-600/50 hover:bg-red-600/70"
                                : "bg-red-600/30 cursor-not-allowed opacity-60"
                            }`}
                          >
                            <span className="font-bold">×</span> Mark All Absent
                          </button>
                        </div>
                      );
                    })()}

                    {/* Collapsible section body */}
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
                        {section.classes.map((className) => {
                          const classStudents = (
                            students[className] || []
                          ).filter((s) => !!s.studentId);
                          const stats = calculateClassAttendance(className);
                          return (
                            <div
                              key={className}
                              className="rounded-2xl backdrop-blur-2xl shadow-xl border border-white/20 p-4 sm:p-6 overflow-visible"
                            >
                              {/* ✅ New compact, resilient header */}
                              <ClassHeader
                                name={className}
                                total={stats.total}
                                present={stats.present}
                                absent={stats.absent}
                              />

                              {/* Desktop table */}
                              <div className="hidden sm:block w-full overflow-x-auto">
                                <table className="w-full text-sm md:text-base rounded-xl">
                                  <thead>
                                    <tr className="bg-gradient-to-r from-[#1e0447]/90 to-[#372772]/90">
                                      <th className="px-3 py-2 text-left">
                                        ID
                                      </th>
                                      <th className="px-3 py-2 text-left">
                                        Name
                                      </th>
                                      <th className="px-3 py-2 text-center">
                                        Status
                                      </th>
                                      <th className="px-3 py-2 text-left">
                                        Time
                                      </th>
                                      <th className="px-3 py-2 text-center">
                                        Present
                                      </th>
                                      <th className="px-3 py-2 text-center">
                                        Absent
                                      </th>
                                      <th className="px-3 py-2 text-left">
                                        Actions
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/10">
                                    {classStudents.map((s) => {
                                      const rec = recordsForView[s.id];
                                      const lif =
                                        studentAttendanceStats[s.id] || {};
                                      return (
                                        <tr
                                          key={s.id}
                                          className="even:bg-white/10"
                                        >
                                          <td className="px-3 py-2 text-white">
                                            {s.studentId}
                                          </td>
                                          <td className="px-3 py-2 text-white">
                                            {rec?.studentName || s.name}
                                          </td>
                                          <td className="px-3 py-2 text-center">
                                            <span
                                              className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                                                rec?.status === "present"
                                                  ? "bg-green-500/20 text-green-400"
                                                  : rec?.status === "absent"
                                                  ? "bg-red-500/20 text-red-400"
                                                  : "bg-gray-500/20 text-gray-400"
                                              }`}
                                            >
                                              {rec?.status ?? "Not Marked"}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 text-white">
                                            {rec?.timestamp
                                              ? formatTime(rec.timestamp)
                                              : "-"}
                                          </td>
                                          <td className="px-3 py-2 text-center text-white">
                                            {lif.timesPresent || 0}
                                          </td>
                                          <td className="px-3 py-2 text-center text-white">
                                            {lif.timesAbsent || 0}
                                          </td>
                                          <td className="px-3 py-2">
                                            <div className="flex gap-2">
                                              <button
                                                onClick={() =>
                                                  markAttendance(
                                                    s.id,
                                                    "present",
                                                    className
                                                  )
                                                }
                                                className={`p-2 rounded-lg ${
                                                  rec?.status === "present"
                                                    ? "bg-green-500/30 text-green-400"
                                                    : "bg-green-500/10 hover:bg-green-500/20 text-green-400"
                                                }`}
                                              >
                                                ✓
                                              </button>
                                              <button
                                                onClick={() =>
                                                  markAttendance(
                                                    s.id,
                                                    "absent",
                                                    className
                                                  )
                                                }
                                                className={`p-2 rounded-lg ${
                                                  rec?.status === "absent"
                                                    ? "bg-red-500/30 text-red-400"
                                                    : "bg-red-500/10 hover:bg-red-500/20 text-red-400"
                                                }`}
                                              >
                                                ×
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Mobile cards */}
                              <div className="sm:hidden space-y-3">
                                {classStudents.map((s) => {
                                  const rec = recordsForView[s.id];
                                  const lif =
                                    studentAttendanceStats[s.id] || {};
                                  return (
                                    <div
                                      key={s.id}
                                      className="bg-white/5 rounded-lg p-4 border border-white/10"
                                    >
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <h3 className="font-bold text-white">
                                            {rec?.studentName || s.name}
                                          </h3>
                                          <p className="text-sm text-white/80">
                                            {s.studentId}
                                          </p>
                                        </div>
                                        <span
                                          className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                                            rec?.status === "present"
                                              ? "bg-green-500/20 text-green-400"
                                              : rec?.status === "absent"
                                              ? "bg-red-500/20 text-red-400"
                                              : "bg-gray-500/20 text-gray-400"
                                          }`}
                                        >
                                          {rec?.status ?? "Not Marked"}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 mt-3 text-center">
                                        <div className="bg-white/5 rounded-lg p-2">
                                          <p className="text-xs text-white/60">
                                            Present
                                          </p>
                                          <p className="font-bold text-white">
                                            {lif.timesPresent || 0}
                                          </p>
                                        </div>
                                        <div className="bg-white/5 rounded-lg p-2">
                                          <p className="text-xs text-white/60">
                                            Absent
                                          </p>
                                          <p className="font-bold text-white">
                                            {lif.timesAbsent || 0}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex gap-2 mt-3">
                                        <button
                                          onClick={() =>
                                            markAttendance(
                                              s.id,
                                              "present",
                                              className
                                            )
                                          }
                                          className={`flex-1 p-2 rounded-lg ${
                                            rec?.status === "present"
                                              ? "bg-green-500/30 text-green-400"
                                              : "bg-green-500/10 hover:bg-green-500/20 text-green-400"
                                          }`}
                                        >
                                          ✓
                                        </button>
                                        <button
                                          onClick={() =>
                                            markAttendance(
                                              s.id,
                                              "absent",
                                              className
                                            )
                                          }
                                          className={`flex-1 p-2 rounded-lg ${
                                            rec?.status === "absent"
                                              ? "bg-red-500/30 text-red-400"
                                              : "bg-red-500/10 hover:bg-red-500/20 text-red-400"
                                          }`}
                                        >
                                          ×
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })}
          </div>
        ) : (
          <div className="text-center py-12 text-white/70">
            Please select a class section to view and mark attendance
          </div>
        )}

        {/* ===== Range Calculation Modal ===== */}
        {showCalcModal && (
          <div className="fixed inset-0 z-[10000]">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCalcModal(false)}
            />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] max-w-3xl">
              <div className="rounded-2xl border border-white/20 bg-gradient-to-tr from-[#120633]/95 via-[#1b1447]/95 to-[#0d0f1f]/95 shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h3 className="text-white font-extrabold text-xl">
                    Calculate Attendance (Range)
                  </h3>
                  <button
                    onClick={() => setShowCalcModal(false)}
                    className="w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white grid place-items-center"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="px-6 pt-5">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="flex flex-col">
                      <label className="text-white/80 text-sm mb-1">
                        Start date
                      </label>
                      <input
                        type="date"
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white outline-none"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-white/80 text-sm mb-1">
                        End date
                      </label>
                      <input
                        type="date"
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white outline-none"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-white/80 text-sm mb-1">
                        Holiday/Break days
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={holidayDays}
                        onChange={(e) => setHolidayDays(e.target.value)}
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white outline-none"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={runRangeCalc}
                        disabled={isRunning || !rangeStart}
                        className={`w-full px-4 py-3 rounded-lg font-semibold ${
                          isRunning || !rangeStart
                            ? "bg-white/10 text-white/60 cursor-not-allowed"
                            : "bg-black/60 hover:bg-black/80 text-white"
                        }`}
                      >
                        {isRunning ? "Running..." : "Run"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 mb-2 text-white/80 text-sm">
                    {rangeResults ? (
                      <>
                        School days in range (after holidays):{" "}
                        <span className="font-semibold text-white">
                          {rangeResults.totalSchoolDays}
                        </span>
                      </>
                    ) : (
                      <>No data yet. Choose dates and click Run.</>
                    )}
                  </div>
                </div>

                <div className="px-6 pb-6">
                  <div className="rounded-xl border border-white/15 overflow-hidden">
                    <div className="bg-gradient-to-r from-[#2a1566] to-[#2e1a70] text-white/90 text-sm font-semibold px-4 py-3 grid grid-cols-12">
                      <div className="col-span-5 md:col-span-4">Student</div>
                      <div className="col-span-4 md:col-span-4">Class</div>
                      <div className="col-span-3 md:col-span-4 text-center">
                        Present / School Days
                      </div>
                    </div>
                    <div className="max-h-[48vh] overflow-y-auto bg-white/5">
                      {!rangeResults || rangeResults.rows.length === 0 ? (
                        <div className="px-4 py-10 text-center text-white/60">
                          No data to show.
                        </div>
                      ) : (
                        rangeResults.rows.map((r, idx) => (
                          <div
                            key={r.id + idx}
                            className={`grid grid-cols-12 items-center px-4 py-3 text-white/90 text-sm ${
                              idx % 2 ? "bg-white/5" : ""
                            }`}
                          >
                            <div className="col-span-5 md:col-span-4">
                              <div className="font-semibold">
                                {r.name || "—"}
                              </div>
                              <div className="text-white/60 text-xs">
                                {r.studentId || ""}
                              </div>
                            </div>
                            <div className="col-span-4 md:col-span-4">
                              {r.className}
                            </div>
                            <div className="col-span-3 md:col-span-4 text-center">
                              <span className="inline-block px-2 py-1 rounded-full bg-white/10">
                                {r.present} / {rangeResults.totalSchoolDays}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* ===== End Modal ===== */}
      </div>
    </motion.div>
  );
}
