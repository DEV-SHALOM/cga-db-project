import { useEffect, useState } from "react";
import {
  FaChevronDown,
  FaChevronUp,
  FaCheck,
  FaTimes,
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaUsers,
  FaUserCheck,
  FaUserTimes,
  FaClock,
  FaHistory,
  FaCalculator,
} from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
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

/* ------------------------------ HELPERS ------------------------------- */
function getDayKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function normalizedDayTimestamp(d) {
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
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed top-6 left-1/2 -translate-x-1/2 bg-gradient-to-r from-green-600 to-green-700 text-white px-8 py-4 rounded-xl shadow-2xl z-[9999] border border-green-500/50 backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <FaCheck className="text-white" />
        <span className="font-medium">{message}</span>
      </div>
    </motion.div>
  );
}

/* -------------------------- CLASS HEADER UI --------------------------- */
function ClassHeader({ name, total, present, absent }) {
  const presentPercentage = total > 0 ? Math.round((present / total) * 100) : 0;

  return (
    <div className="mb-6 rounded-xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md px-4 py-4 shadow-lg">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3
            className="text-white font-bold text-lg sm:text-xl truncate drop-shadow"
            title={name}
          >
            {name}
          </h3>
        </div>

        <div
          className="shrink-0 whitespace-nowrap inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-gradient-to-r from-purple-600/30 to-purple-700/30 px-4 py-2 text-white text-sm font-semibold shadow-lg"
          title={`${total} ${total === 1 ? "student" : "students"}`}
        >
          <FaUsers className="text-purple-300" />
          <span>{total}</span>
          <span className="hidden sm:inline text-white/80">
            {total === 1 ? "student" : "students"}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-green-500/20 to-green-600/20 border border-green-400/30 text-green-300 px-4 py-2 text-sm font-semibold shadow-md">
            <FaUserCheck className="text-green-400" />
            <span className="text-white">{present}</span>
            <span className="hidden sm:inline text-green-300/80">Present</span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-red-500/20 to-red-600/20 border border-red-400/30 text-red-300 px-4 py-2 text-sm font-semibold shadow-md">
            <FaUserTimes className="text-red-400" />
            <span className="text-white">{absent}</span>
            <span className="hidden sm:inline text-red-300/80">Absent</span>
          </div>

          <div className="ml-auto text-white/70 text-sm font-medium">
            {presentPercentage}% attendance
          </div>
        </div>

        <div className="h-2 bg-white/10 rounded-full overflow-hidden border border-white/20">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${presentPercentage}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`h-full ${
              presentPercentage >= 75
                ? "bg-gradient-to-r from-green-500 to-green-600"
                : presentPercentage >= 50
                ? "bg-gradient-to-r from-yellow-500 to-yellow-600"
                : "bg-gradient-to-r from-red-500 to-red-600"
            }`}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- MAIN COMPONENT --------------------------- */
export default function AttendancePage() {
  const termId = useActiveTerm();

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

  const [showCalcModal, setShowCalcModal] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [holidayDays, setHolidayDays] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [rangeResults, setRangeResults] = useState(null);

  // Switch to the next day exactly at local midnight
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

  // Students (by class)
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
        await setDoc(
          ref,
          {
            date: normalizedDayTimestamp(currentDate),
            records: {},
            presentCount: 0,
            termId,
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

  // Term counters for students
  useEffect(() => {
    if (!termId) return;
    const unsubscribes = [];
    allClasses.forEach((className) => {
      (students[className] || []).forEach((student) => {
        const ref = doc(db, "students", student.id);
        const unsub = onSnapshot(ref, (snap) => {
          if (!snap.exists()) return;
          const data = snap.data() || {};
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
          termId,
        },
        { merge: true }
      );

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
          termId,
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

      const studentMeta = new Map();
      allClasses.forEach((c) => {
        (students[c] || []).forEach((s) => {
          studentMeta.set(s.id, {
            name: s.name || "—",
            className: s.className || c,
            studentId: s.studentId || "",
          });
        });
      });

      const presents = new Map();
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
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-400/30 rounded-xl p-5 mb-6 backdrop-blur-md shadow-lg"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => changeHistoricalDate(-1)}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors border border-white/20"
            >
              <FaChevronLeft className="text-white" />
            </button>

            <div className="text-center">
              <div className="text-white font-bold text-lg flex items-center gap-2">
                <FaHistory className="text-amber-400" />
                {label}
              </div>
              {isToday && (
                <span className="inline-block mt-1 text-xs bg-blue-500/30 px-3 py-1 rounded-full text-blue-300 border border-blue-400/30">
                  Today
                </span>
              )}
            </div>

            <button
              onClick={() => changeHistoricalDate(1)}
              disabled={isToday}
              className={`p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors border border-white/20 ${
                isToday ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <FaChevronRight className="text-white" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <FaCalendarAlt className="text-white/70" />
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
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white outline-none focus:border-amber-400/50 transition-colors"
            />
            <span className="text-white/70 text-sm font-medium">
              Jump to date
            </span>
          </div>

          <div className="text-amber-300 text-sm bg-amber-500/20 border border-amber-400/30 px-4 py-2 rounded-lg text-center">
            <strong>Editing {toDateInputValue(historicalDate)}</strong> —
            Changes update lifetime totals
          </div>
        </div>
      </motion.div>
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

  const calculateOverallStats = () => {
    let totalStudents = 0;
    let totalPresent = 0;
    let totalAbsent = 0;

    classStructure.forEach((section) => {
      const stats = calculateSectionAttendance(section);
      totalStudents += stats.total;
      totalPresent += stats.present;
      totalAbsent += stats.absent;
    });

    return { totalStudents, totalPresent, totalAbsent };
  };

  const overallStats = calculateOverallStats();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen py-4 md:py-8 px-3 md:px-6 lg:px-8"
    >
      <AnimatePresence>
        {notification && <Notification message={notification} />}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto font-[Poppins]">
        {/* Header Section */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-6 md:mb-8"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-4 drop-shadow-lg">
            Attendance Management
          </h1>

          {/* Quick Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-400/30 rounded-xl px-4 py-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-blue-300/80 text-xs font-medium mb-1">
                    Total Students
                  </div>
                  <div className="text-white text-2xl font-bold">
                    {overallStats.totalStudents}
                  </div>
                </div>
                <FaUsers className="text-blue-400 text-3xl" />
              </div>
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-400/30 rounded-xl px-4 py-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-green-300/80 text-xs font-medium mb-1">
                    Present Today
                  </div>
                  <div className="text-white text-2xl font-bold">
                    {overallStats.totalPresent}
                  </div>
                </div>
                <FaUserCheck className="text-green-400 text-3xl" />
              </div>
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-red-500/20 to-red-600/20 border border-red-400/30 rounded-xl px-4 py-4 backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-red-300/80 text-xs font-medium mb-1">
                    Absent Today
                  </div>
                  <div className="text-white text-2xl font-bold">
                    {overallStats.totalAbsent}
                  </div>
                </div>
                <FaUserTimes className="text-red-400 text-3xl" />
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Control Panel - NEW UI STYLE */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex flex-wrap items-center gap-4">
            {/* Class Selector with NEW dropdown design */}
            <div className="relative">
              <button
                onClick={toggleClassDropdown}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 text-white font-medium transition-all ${
                  showClassDropdown
                    ? "bg-purple-600 ring-2 ring-purple-400/40"
                    : "bg-purple-700/80 hover:bg-purple-600"
                }`}
              >
                <FaUsers />
                <span>{selectedClass ? selectedClass : "Select Class Section"}</span>
                {showClassDropdown ? <FaChevronUp /> : <FaChevronDown />}
              </button>

              {/* NEW Dropdown Design */}
              <AnimatePresence>
                {showClassDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute left-0 mt-2 z-50 w-[90vw] sm:w-[320px] max-h-[70vh] overflow-y-auto rounded-2xl bg-gradient-to-br from-[#1a1038] via-[#241a44] to-[#1b1740] border border-white/20 shadow-2xl scrollbar-thin scrollbar-thumb-purple-500/50 scrollbar-track-white/5"
                  >
                    {classStructure.map((group) => {
                      const groupStats = calculateSectionAttendance(group);
                      return (
                        <div key={group.section} className="py-2">
                          <div className="px-4 py-2 text-xs uppercase tracking-wide text-white/40">
                            {group.section}
                          </div>

                          {group.classes.map((cls) => {
                            const clsStats = calculateClassAttendance(cls);
                            return (
                              <div
                                key={cls}
                                onClick={() => {
                                  setSelectedClass(cls);
                                  setShowClassDropdown(false);
                                }}
                                className={`mx-2 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                                  selectedClass === cls
                                    ? "bg-purple-600/20 border border-purple-500/40"
                                    : "hover:bg-white/10"
                                }`}
                              >
                                <div className="text-white font-medium">{cls}</div>
                                <div className="text-xs text-white/50">
                                  {clsStats.present} Present • {clsStats.absent} Absent
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Date */}
            <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white flex items-center gap-2">
              <FaCalendarAlt className="text-purple-400" />
              <span className="text-sm">
                {currentDate.toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>

            {/* Actions */}
            <button
              onClick={() => setShowCalcModal(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2"
            >
              <FaCalculator />
              <span className="hidden sm:inline">Calculate Attendance</span>
            </button>

            <button
              onClick={toggleHistoricalView}
              className={`px-4 py-2 rounded-xl text-white flex items-center gap-2 transition-colors ${
                viewingHistorical
                  ? "bg-amber-600/80 hover:bg-amber-600"
                  : "bg-black/60 hover:bg-black/80"
              }`}
            >
              <FaHistory />
              <span className="hidden sm:inline">
                {viewingHistorical ? "Current Day" : "View History"}
              </span>
            </button>
          </div>
        </motion.div>

        {getDateControls()}

        {selectedClass ? (
          <div className="space-y-6">
            {classStructure
              .filter((sec) => sec.classes.includes(selectedClass))
              .map((section, sectionIdx) => {
                const sectionStats = calculateSectionAttendance(section);
                return (
                  <motion.div
                    key={section.section}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: sectionIdx * 0.1 }}
                    className="relative rounded-2xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md shadow-xl border border-white/20 p-5 md:p-6"
                  >
                    {/* Section Header */}
                    <button
                      className={`flex items-center w-full justify-between px-5 py-4 rounded-xl text-xl md:text-2xl font-bold text-white transition-all ${
                        openSection === section.section
                          ? "bg-gradient-to-r from-purple-600/30 to-purple-700/30 border border-purple-400/30 shadow-lg"
                          : "bg-white/5 border border-white/20 hover:bg-white/10"
                      }`}
                      onClick={() =>
                        setOpenSection((v) =>
                          v === section.section ? "" : section.section
                        )
                      }
                    >
                      <div className="flex items-center gap-4">
                        <FaUsers className="text-purple-400" />
                        <span>{section.section}</span>
                        <span className="text-sm bg-gradient-to-r from-purple-600/50 to-purple-700/50 text-white px-3 py-1 rounded-full border border-purple-400/30">
                          {sectionStats.total}{" "}
                          {sectionStats.total === 1 ? "student" : "students"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex gap-3 text-sm">
                          <span className="text-green-400 font-semibold flex items-center gap-1">
                            <FaUserCheck />
                            {sectionStats.present}
                          </span>
                          <span className="text-red-400 font-semibold flex items-center gap-1">
                            <FaUserTimes />
                            {sectionStats.absent}
                          </span>
                        </div>
                        <FaChevronDown
                          className={`transition-transform text-xl ${
                            openSection === section.section ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </button>

                    {/* Mark-all buttons */}
                    {(() => {
                      const hasStudents = sectionStats.total > 0;
                      return (
                        <div className="flex gap-3 mt-4">
                          <button
                            onClick={() =>
                              hasStudents &&
                              markAllStudents(section.section, "present")
                            }
                            disabled={!hasStudents}
                            className={`flex-1 px-4 py-3 rounded-xl flex items-center justify-center gap-2 text-white font-semibold transition-all shadow-md ${
                              hasStudents
                                ? "bg-gradient-to-r from-green-600/40 to-green-700/40 hover:from-green-600/50 hover:to-green-700/50 border border-green-400/30"
                                : "bg-green-600/20 cursor-not-allowed opacity-50 border border-green-400/20"
                            }`}
                          >
                            <FaCheck className="text-lg" />
                            Mark All Present
                          </button>

                          <button
                            onClick={() =>
                              hasStudents &&
                              markAllStudents(section.section, "absent")
                            }
                            disabled={!hasStudents}
                            className={`flex-1 px-4 py-3 rounded-xl flex items-center justify-center gap-2 text-white font-semibold transition-all shadow-md ${
                              hasStudents
                                ? "bg-gradient-to-r from-red-600/40 to-red-700/40 hover:from-red-600/50 hover:to-red-700/50 border border-red-400/30"
                                : "bg-red-600/20 cursor-not-allowed opacity-50 border border-red-400/20"
                            }`}
                          >
                            <FaTimes className="text-lg" />
                            Mark All Absent
                          </button>
                        </div>
                      );
                    })()}

                    {/* Collapsible section body */}
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
                            {section.classes
                              .filter((c) => c === selectedClass)
                              .map((className, classIdx) => {
                                const classStudents = (
                                  students[className] || []
                                ).filter((s) => !!s.studentId);
                                const stats = calculateClassAttendance(className);
                                return (
                                  <motion.div
                                    key={className}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: classIdx * 0.1 }}
                                    className="rounded-xl backdrop-blur-md shadow-lg border border-white/20 bg-gradient-to-br from-white/5 to-white/[0.02] p-5"
                                  >
                                    <ClassHeader
                                      name={className}
                                      total={stats.total}
                                      present={stats.present}
                                      absent={stats.absent}
                                    />

                                    {/* Desktop table */}
                                    <div className="hidden md:block w-full overflow-x-auto rounded-xl border border-white/20">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="bg-gradient-to-r from-purple-600/30 to-purple-700/30 border-b border-white/20">
                                            <th className="px-4 py-3 text-left text-white font-semibold">
                                              ID
                                            </th>
                                            <th className="px-4 py-3 text-left text-white font-semibold">
                                              Name
                                            </th>
                                            <th className="px-4 py-3 text-center text-white font-semibold">
                                              Status
                                            </th>
                                            <th className="px-4 py-3 text-left text-white font-semibold">
                                              Time
                                            </th>
                                            <th className="px-4 py-3 text-center text-white font-semibold">
                                              Present
                                            </th>
                                            <th className="px-4 py-3 text-center text-white font-semibold">
                                              Absent
                                            </th>
                                            <th className="px-4 py-3 text-left text-white font-semibold">
                                              Actions
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/10">
                                          {classStudents.map((s, idx) => {
                                            const rec = recordsForView[s.id];
                                            const lif =
                                              studentAttendanceStats[s.id] || {};
                                            return (
                                              <tr
                                                key={s.id}
                                                className={`${
                                                  idx % 2 === 0
                                                    ? "bg-white/5"
                                                    : "bg-transparent"
                                                } hover:bg-white/10 transition-colors`}
                                              >
                                                <td className="px-4 py-3 text-white/90">
                                                  {s.studentId}
                                                </td>
                                                <td className="px-4 py-3 text-white font-medium">
                                                  {rec?.studentName || s.name}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                  <span
                                                    className={`inline-block px-3 py-1.5 rounded-full text-xs font-bold border ${
                                                      rec?.status === "present"
                                                        ? "bg-green-500/20 text-green-400 border-green-400/30"
                                                        : rec?.status === "absent"
                                                        ? "bg-red-500/20 text-red-400 border-red-400/30"
                                                        : "bg-gray-500/20 text-gray-400 border-gray-400/30"
                                                    }`}
                                                  >
                                                    {rec?.status ?? "Not Marked"}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3 text-white/70 text-xs">
                                                  {rec?.timestamp
                                                    ? formatTime(rec.timestamp)
                                                    : "—"}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                  <span className="inline-block px-2 py-1 rounded-lg bg-green-500/10 text-green-400 font-semibold text-sm">
                                                    {lif.timesPresent || 0}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                  <span className="inline-block px-2 py-1 rounded-lg bg-red-500/10 text-red-400 font-semibold text-sm">
                                                    {lif.timesAbsent || 0}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                  <div className="flex gap-2">
                                                    <button
                                                      onClick={() =>
                                                        markAttendance(
                                                          s.id,
                                                          "present",
                                                          className
                                                        )
                                                      }
                                                      className={`p-2.5 rounded-lg font-bold transition-all ${
                                                        rec?.status === "present"
                                                          ? "bg-green-500/30 text-green-400 border border-green-400/40"
                                                          : "bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-400/20"
                                                      }`}
                                                    >
                                                      <FaCheck />
                                                    </button>
                                                    <button
                                                      onClick={() =>
                                                        markAttendance(
                                                          s.id,
                                                          "absent",
                                                          className
                                                        )
                                                      }
                                                      className={`p-2.5 rounded-lg font-bold transition-all ${
                                                        rec?.status === "absent"
                                                          ? "bg-red-500/30 text-red-400 border border-red-400/40"
                                                          : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-400/20"
                                                      }`}
                                                    >
                                                      <FaTimes />
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
                                    <div className="md:hidden space-y-3">
                                      {classStudents.map((s) => {
                                        const rec = recordsForView[s.id];
                                        const lif =
                                          studentAttendanceStats[s.id] || {};
                                        return (
                                          <div
                                            key={s.id}
                                            className="bg-white/5 rounded-xl p-4 border border-white/20 shadow-md backdrop-blur-sm"
                                          >
                                            <div className="flex justify-between items-start mb-3">
                                              <div>
                                                <h3 className="font-bold text-white text-base">
                                                  {rec?.studentName || s.name}
                                                </h3>
                                                <p className="text-sm text-white/70 mt-0.5">
                                                  {s.studentId}
                                                </p>
                                              </div>
                                              <span
                                                className={`inline-block px-3 py-1.5 rounded-full text-xs font-bold border ${
                                                  rec?.status === "present"
                                                    ? "bg-green-500/20 text-green-400 border-green-400/30"
                                                    : rec?.status === "absent"
                                                    ? "bg-red-500/20 text-red-400 border-red-400/30"
                                                    : "bg-gray-500/20 text-gray-400 border-gray-400/30"
                                                }`}
                                              >
                                                {rec?.status ?? "Not Marked"}
                                              </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                                                <p className="text-xs text-white/60 mb-1">
                                                  Present
                                                </p>
                                                <p className="font-bold text-white text-lg">
                                                  {lif.timesPresent || 0}
                                                </p>
                                              </div>
                                              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                                                <p className="text-xs text-white/60 mb-1">
                                                  Absent
                                                </p>
                                                <p className="font-bold text-white text-lg">
                                                  {lif.timesAbsent || 0}
                                                </p>
                                              </div>
                                            </div>
                                            <div className="flex gap-2">
                                              <button
                                                onClick={() =>
                                                  markAttendance(
                                                    s.id,
                                                    "present",
                                                    className
                                                  )
                                                }
                                                className={`flex-1 p-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                                                  rec?.status === "present"
                                                    ? "bg-green-500/30 text-green-400 border border-green-400/40"
                                                    : "bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-400/20"
                                                }`}
                                              >
                                                <FaCheck />
                                                Present
                                              </button>
                                              <button
                                                onClick={() =>
                                                  markAttendance(
                                                    s.id,
                                                    "absent",
                                                    className
                                                  )
                                                }
                                                className={`flex-1 p-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                                                  rec?.status === "absent"
                                                    ? "bg-red-500/30 text-red-400 border border-red-400/40"
                                                    : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-400/20"
                                                }`}
                                              >
                                                <FaTimes />
                                                Absent
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                );
                              })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-white/5 border border-white/10 p-8 flex items-center justify-center min-h-[300px]"
          >
            <div className="text-center text-white/60">
              <FaUsers className="mx-auto text-6xl mb-4 opacity-40" />
              <p className="text-lg">Please select a class section to view and mark attendance</p>
            </div>
          </motion.div>
        )}

        {/* Calculate Attendance Modal */}
        <AnimatePresence>
          {showCalcModal && (
            <div className="fixed inset-0 z-[10000]">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={() => setShowCalcModal(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] max-w-3xl"
              >
                <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-[#1a1038] via-[#241a44] to-[#1b1740] shadow-2xl backdrop-blur-xl">
                  <div className="flex items-center justify-between px-6 py-5 border-b border-white/20">
                    <h3 className="text-white font-extrabold text-xl flex items-center gap-2">
                      <FaCalculator className="text-purple-400" />
                      Calculate Attendance Range
                    </h3>
                    <button
                      onClick={() => setShowCalcModal(false)}
                      className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors"
                      aria-label="Close"
                    >
                      <FaTimes />
                    </button>
                  </div>

                  <div className="px-6 pt-5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="flex flex-col">
                        <label className="text-white/80 text-sm mb-2 font-medium">
                          Start date
                        </label>
                        <input
                          type="date"
                          value={rangeStart}
                          onChange={(e) => setRangeStart(e.target.value)}
                          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white outline-none focus:border-purple-400/50 transition-colors"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-white/80 text-sm mb-2 font-medium">
                          End date
                        </label>
                        <input
                          type="date"
                          value={rangeEnd}
                          onChange={(e) => setRangeEnd(e.target.value)}
                          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white outline-none focus:border-purple-400/50 transition-colors"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-white/80 text-sm mb-2 font-medium">
                          Holiday/Break days
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={holidayDays}
                          onChange={(e) => setHolidayDays(e.target.value)}
                          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white outline-none focus:border-purple-400/50 transition-colors"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={runRangeCalc}
                          disabled={isRunning || !rangeStart}
                          className={`w-full px-4 py-3 rounded-lg font-semibold transition-all ${
                            isRunning || !rangeStart
                              ? "bg-white/10 text-white/60 cursor-not-allowed border border-white/20"
                              : "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-lg border border-purple-400/30"
                          }`}
                        >
                          {isRunning ? "Running..." : "Run"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 mb-3 p-4 bg-white/5 rounded-lg border border-white/20">
                      <div className="text-white/80 text-sm">
                        {rangeResults ? (
                          <div className="flex items-center justify-between">
                            <span>School days in range (after holidays):</span>
                            <span className="font-bold text-white text-lg">
                              {rangeResults.totalSchoolDays}
                            </span>
                          </div>
                        ) : (
                          <div className="text-center text-white/60">
                            No data yet. Choose dates and click Run.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="px-6 pb-6">
                    <div className="rounded-xl border border-white/20 overflow-hidden shadow-lg">
                      <div className="bg-gradient-to-r from-purple-600/40 to-purple-700/40 text-white text-sm font-semibold px-4 py-3 grid grid-cols-12 border-b border-white/20">
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
                              className={`grid grid-cols-12 items-center px-4 py-3 text-white/90 text-sm border-b border-white/10 last:border-b-0 ${
                                idx % 2 ? "bg-white/5" : ""
                              }`}
                            >
                              <div className="col-span-5 md:col-span-4">
                                <div className="font-semibold text-white">
                                  {r.name || "—"}
                                </div>
                                <div className="text-white/60 text-xs">
                                  {r.studentId || ""}
                                </div>
                              </div>
                              <div className="col-span-4 md:col-span-4 text-white/80">
                                {r.className}
                              </div>
                              <div className="col-span-3 md:col-span-4 text-center">
                                <span className="inline-block px-3 py-1.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold border border-purple-400/30">
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
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}