import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  FaFilePdf,
  FaEdit,
  FaPrint,
  FaUser,
  FaCalendarCheck,
  FaCalendarAlt,
} from "react-icons/fa";
import {
  useStudentsByClass,
  useClassSubjects,
  useResultsForTerm,
} from "../hooks/useResults";
import ResultEditorModal from "../components/ResultEditorModal";
import ClassSubjectsManager from "../components/ClassSubjectsManager";
import { printStudentResult } from "../reports/generateStudentResultPDF";
import { useActiveTerm } from "../hooks/useActiveTerm";
import { getStudentPresentDays } from "../utils/attendanceUtils";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
// At the top with your other imports (around line 1-10)
import { generateStudentResultPDF } from "../reports/generateStudentResultPDF";

export default function ResultsPage() {
  const termId = useActiveTerm();
  const studentsByClass = useStudentsByClass();
  const classSubjects = useClassSubjects();
  const resultsMap = useResultsForTerm(termId);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStudent, setEditorStudent] = useState(null);
  const [editorExisting, setEditorExisting] = useState(null);
  const [activeTermInfo, setActiveTermInfo] = useState({
    termName: "N/A",
    academicYear: "N/A",
    fullTerm: "Term N/A",
  });
  const [isLoadingTerm, setIsLoadingTerm] = useState(true);

  const [attendanceMap, setAttendanceMap] = useState({});
  const [loadingMap, setLoadingMap] = useState({});
  const [presentDaysMap, setPresentDaysMap] = useState({});

  const [expandedClasses, setExpandedClasses] = useState({});

  // Term configuration - each term is 4 months (same as dashboard.jsx)
  const TERM_CONFIG = {
    "First Term": { startMonth: 8, endMonth: 11 }, // September to December (0-indexed: 8-11)
    "Second Term": { startMonth: 0, endMonth: 3 }, // January to April
    "Third Term": { startMonth: 4, endMonth: 7 }, // May to August
  };

  // Calculate term progress based on current date and term name
  const calculateTermProgress = (termName) => {
    if (!termName || termName === "N/A") return 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const term = termName;

    // Check if term exists in config
    if (!TERM_CONFIG[term]) return 0;

    const { startMonth, endMonth } = TERM_CONFIG[term];
    const totalMonths = ((endMonth - startMonth + 12) % 12) + 1;

    // Calculate elapsed months
    let elapsedMonths;
    if (currentMonth >= startMonth) {
      elapsedMonths = currentMonth - startMonth + 1;
    } else {
      elapsedMonths = 12 - startMonth + currentMonth + 1;
    }

    // Calculate progress percentage
    const progress = Math.min(
      Math.max((elapsedMonths / totalMonths) * 100, 0),
      100
    );
    return Math.round(progress);
  };

  // Fetch active term details from Firestore
  useEffect(() => {
    const fetchActiveTerm = () => {
      try {
        const appSettingsRef = doc(db, "settings", "app");

        // Use onSnapshot for real-time updates
        const unsubscribe = onSnapshot(appSettingsRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            const activeTerm = data.activeTerm;

            if (activeTerm) {
              const termName = activeTerm.termName || activeTerm.term || "N/A";
              const academicYear =
                activeTerm.academicYear || activeTerm.year || "N/A";

              setActiveTermInfo({
                termName,
                academicYear,
                fullTerm: `${termName} ${academicYear}`,
                termId: activeTerm.id || termId,
                // Add progress calculation
                progress: calculateTermProgress(termName),
              });
            } else {
              // If no active term in settings, try to fetch from terms collection
              if (termId) {
                const termDocRef = doc(db, "terms", termId);
                getDoc(termDocRef).then((termDoc) => {
                  if (termDoc.exists()) {
                    const termData = termDoc.data();
                    const termName =
                      termData.termName || termData.term || "N/A";
                    const academicYear =
                      termData.academicYear || termData.year || "N/A";

                    setActiveTermInfo({
                      termName,
                      academicYear,
                      fullTerm: `${termName} ${academicYear}`,
                      termId: termId,
                      progress: calculateTermProgress(termName),
                    });
                  }
                });
              }
            }
          }
          setIsLoadingTerm(false);
        });

        return unsubscribe;
      } catch (error) {
        console.error("Error fetching term info:", error);
        setActiveTermInfo({
          termName: "N/A",
          academicYear: "N/A",
          fullTerm: "Term N/A",
          progress: 0,
        });
        setIsLoadingTerm(false);
      }
    };

    const unsubscribe = fetchActiveTerm();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [termId]);

  const loadAllPresentDays = async (students) => {
    const map = {};

    for (const student of students) {
      const days = await getStudentPresentDays(student.name);
      map[student.name] = days;
    }

    setPresentDaysMap(map);
  };

  // ✅ AUTO LOAD ATTENDANCE FOR ALL STUDENTS
  useEffect(() => {
    async function loadAllAttendance() {
      const flatStudents = Object.values(studentsByClass).flat();
      const map = {};
      const load = {};

      for (const student of flatStudents) {
        try {
          load[student.studentId] = true;
          const days = await getStudentPresentDays(student.name);
          map[student.studentId] = days;
        } catch {
          map[student.studentId] = 0;
        }
      }

      setAttendanceMap(map);
      setLoadingMap(load);
    }

    if (Object.keys(studentsByClass).length) {
      loadAllAttendance();
    }
  }, [studentsByClass]);

  async function openEditor(student) {
    setEditorStudent(student);
    setEditorExisting(null);
    setEditorOpen(true);
  }

  function onResultSaved() {
    setEditorOpen(false);
    setEditorStudent(null);
    setEditorExisting(null);
  }

  function handlePrint(student) {
    const docId = `${termId}_${student.id}`;
    const res = resultsMap[docId] || null;

    if (!res) {
      alert(
        "No result data found for this student. Please edit and save their result first."
      );
      return;
    }

    // Call the PDF generator
    generateStudentResultPDF(student, res, {
      // ⭐ LOGO PLACEHOLDER - Add your base64 logo here when available
      logo: null, // When you get the logo, insert: logo: "data:image/png;base64,YOUR_BASE64_STRING"
    });
  }

  const toggleClassExpansion = (className) => {
    setExpandedClasses((prev) => ({
      ...prev,
      [className]: !prev[className],
    }));
  };

  // Calculate term progress for display
  const termProgress = calculateTermProgress(activeTermInfo.termName);

  function ClassBlock({ className, students }) {
    const subs = classSubjects[className] || [];
    const isExpanded = expandedClasses[className] !== false; // Default to expanded

    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-tr from-white/6 via-[#3e1c7c]/18 to-[#372772]/14 p-4 md:p-6 border border-white/10"
      >
        {/* Header Section - Always visible */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="text-white font-bold text-lg md:text-xl">
                {className}
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded-full text-xs bg-[#6C4AB6] text-white flex items-center gap-1">
                  <FaUser className="text-xs" />
                  <span>{students.length} students</span>
                </div>
                <div className="px-2 py-1 rounded-full text-xs bg-purple-600/40 text-white/90 flex items-center gap-1">
                  <span>{subs.length} subjects</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ClassSubjectsManager
              className={className}
              subjects={subs}
              onSaved={() => {}}
            />
            <button
              onClick={() => toggleClassExpansion(className)}
              className="md:hidden px-3 py-2 bg-white/10 rounded-lg text-white"
            >
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>

        {/* Desktop Table View - Hidden on mobile */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm md:text-base">
            <thead className="bg-gradient-to-r from-[#1e0447]/90 to-[#372772]/90">
              <tr>
                <th className="px-4 py-3 text-left text-white font-medium">
                  Student
                </th>
                <th className="px-4 py-3 text-left text-white font-medium">
                  Present Days
                </th>
                <th className="px-4 py-3 text-left text-white font-medium">
                  Percentage
                </th>
                <th className="px-4 py-3 text-left text-white font-medium">
                  Decision
                </th>
                <th className="px-4 py-3 text-left text-white font-medium">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/10">
              {students.map((s) => {
                const docId = `${termId}_${s.id}`;
                const res = resultsMap[docId];
                const percentage = res?.percentage ?? "—";
                const decision = res
                  ? res.promoted
                    ? "Promoted"
                    : "Not promoted"
                  : "Not set";

                return (
                  <tr key={s.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-4 text-white font-medium">
                      {s.name}
                    </td>

                    <td className="px-4 py-4 text-white">
                      <div className="flex items-center gap-2">
                        <FaCalendarCheck className="text-green-400" />
                        <span>{attendanceMap[s.studentId] ?? 0}</span>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-white">
                      {typeof percentage === "number" ? (
                        <div
                          className={`px-3 py-1.5 rounded-full text-center ${
                            percentage >= 75
                              ? "bg-green-500/20 text-green-400"
                              : percentage >= 50
                              ? "bg-blue-500/20 text-blue-400"
                              : percentage >= 40
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {percentage}%
                        </div>
                      ) : (
                        <div className="px-3 py-1.5 rounded-full bg-gray-500/20 text-gray-400 text-center">
                          {percentage}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <div
                        className={`px-3 py-1.5 rounded-full text-center ${
                          decision === "Promoted"
                            ? "bg-green-500/20 text-green-400"
                            : decision === "Not promoted"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {decision}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditor(s)}
                          className="px-3 py-2 bg-[#6C4AB6]/80 hover:bg-[#6C4AB6] rounded-lg text-white flex items-center gap-2 transition-colors"
                        >
                          <FaEdit /> <span>Edit</span>
                        </button>

                        <button
                          onClick={() => handlePrint(s)}
                          className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white flex items-center gap-2 transition-colors"
                        >
                          <FaFilePdf /> <span>PDF</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View - Visible only on mobile */}
        <div className="md:hidden space-y-3">
          {(isExpanded ? students : students.slice(0, 3)).map((s) => {
            const docId = `${termId}_${s.id}`;
            const res = resultsMap[docId];
            const percentage = res?.percentage ?? "—";
            const decision = res
              ? res.promoted
                ? "Promoted"
                : "Not promoted"
              : "Not set";

            return (
              <div
                key={s.id}
                className="bg-white/5 rounded-xl border border-white/10 p-4"
              >
                <div className="flex flex-col gap-3">
                  {/* Student Info Row */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-white font-bold text-base">
                        {s.name}
                      </h3>
                      <p className="text-white/70 text-sm">ID: {s.studentId}</p>
                    </div>
                    <div
                      className={`px-2 py-1 rounded-full text-xs ${
                        decision === "Promoted"
                          ? "bg-green-500/20 text-green-400"
                          : decision === "Not promoted"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {decision}
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <FaCalendarCheck className="text-green-400 text-sm" />
                        <span className="text-white/70 text-xs">
                          Present Days
                        </span>
                      </div>
                      <div className="text-white font-bold text-lg">
                        {attendanceMap[s.studentId] ?? 0}
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="text-white/70 text-xs mb-1">
                        Percentage
                      </div>
                      <div
                        className={`font-bold text-lg ${
                          typeof percentage === "number"
                            ? percentage >= 75
                              ? "text-green-400"
                              : percentage >= 50
                              ? "text-blue-400"
                              : percentage >= 40
                              ? "text-yellow-400"
                              : "text-red-400"
                            : "text-gray-400"
                        }`}
                      >
                        {typeof percentage === "number"
                          ? `${percentage}%`
                          : percentage}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => openEditor(s)}
                      className="flex-1 px-3 py-2.5 bg-[#6C4AB6]/80 hover:bg-[#6C4AB6] rounded-lg text-white flex items-center justify-center gap-2 transition-colors"
                    >
                      <FaEdit /> <span>Edit Result</span>
                    </button>

                    <button
                      onClick={() => handlePrint(s)}
                      className="flex-1 px-3 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-white flex items-center justify-center gap-2 transition-colors"
                    >
                      <FaPrint /> <span>Print</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Show More/Less Toggle for Mobile */}
          {students.length > 3 && (
            <button
              onClick={() => toggleClassExpansion(className)}
              className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-lg text-white flex items-center justify-center gap-2 transition-colors"
            >
              {isExpanded ? (
                <>
                  <span>Show Less</span>
                </>
              ) : (
                <>
                  <span>Show All {students.length} Students</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Empty State */}
        {students.length === 0 && (
          <div className="text-center py-8 text-white/60">
            No students in this class yet
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen py-4 md:py-6 px-3 md:px-8"
    >
      <div className="max-w-7xl mx-auto font-[Poppins]">
        {/* Enhanced Header Section */}
        <div className="mb-6 md:mb-8">
          <motion.h1
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="font-extrabold text-2xl md:text-3xl lg:text-4xl text-white mb-2"
          >
            Student Results Management
          </motion.h1>
          <p className="text-white/70 text-sm md:text-base">
            View and manage student results for the current term
          </p>

          {/* Enhanced Summary Stats */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {/* Active Term Card - Enhanced */}
            <div className="flex-1 min-w-[200px] max-w-[300px] px-4 py-3 bg-gradient-to-r from-[#2a2250] to-[#1e0447]/80 rounded-xl border border-purple-500/30">
              <div className="flex items-center justify-between mb-1">
                <div className="text-white/70 text-xs">Active Term</div>
                <div className="flex items-center gap-1">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      activeTermInfo.termName !== "N/A"
                        ? "bg-green-500 animate-pulse"
                        : "bg-red-500"
                    }`}
                  ></div>
                  <span className="text-xs text-white/50">Live</span>
                </div>
              </div>
              {isLoadingTerm ? (
                <div className="text-white/70 text-sm">
                  Loading term info...
                </div>
              ) : (
                <>
                  <div className="text-white font-bold text-lg">
                    {activeTermInfo.termName}
                  </div>
                  <div className="text-white/80 text-sm">
                    {activeTermInfo.academicYear} Academic Session
                  </div>
                </>
              )}
            </div>

            {/* Term Progress - UPDATED TO USE CALCULATION */}
            <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10">
              <div className="text-white/70 text-xs">Term Progress</div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${termProgress}%` }}
                    className={`h-full ${
                      termProgress < 30
                        ? "bg-red-500"
                        : termProgress < 70
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    }`}
                  />
                </div>
                <div className="text-white font-medium">{termProgress}%</div>
              </div>
            </div>

            {/* Total Classes */}
            <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10">
              <div className="text-white/70 text-xs">Total Classes</div>
              <div className="text-white font-medium">
                {Object.keys(studentsByClass).length}
              </div>
            </div>

            {/* Total Students */}
            <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10">
              <div className="text-white/70 text-xs">Total Students</div>
              <div className="text-white font-medium">
                {Object.values(studentsByClass).flat().length}
              </div>
            </div>
          </div>

          {/* Term ID Display (for debugging/confirmation) */}
          <div className="mt-2 text-white/40 text-xs flex items-center gap-2">
            <span>Term ID: {termId || "Not set"}</span>
            <span className="text-white/20">•</span>
            <span
              className={`${
                activeTermInfo.termName !== "N/A"
                  ? "text-green-400/60"
                  : "text-red-400/60"
              }`}
            >
              {activeTermInfo.termName !== "N/A"
                ? "✓ Synced with Dashboard"
                : "✗ No term active"}
            </span>
          </div>
        </div>

        {/* Results Content */}
        <div className="space-y-4 md:space-y-6">
          {Object.entries(studentsByClass).length > 0 ? (
            Object.entries(studentsByClass).map(([cls, list]) => (
              <ClassBlock key={cls} className={cls} students={list} />
            ))
          ) : (
            <div className="text-center py-12">
              <div className="text-white/60 mb-4">
                No classes with students found
              </div>
              <div className="text-white/40 text-sm">
                Add students to classes in the Students page
              </div>
            </div>
          )}
        </div>

        {editorOpen && editorStudent && (
          <ResultEditorModal
            open={editorOpen}
            onClose={() => setEditorOpen(false)}
            student={editorStudent}
            termId={termId}
            existing={editorExisting}
            classSubjects={classSubjects[editorStudent.className] || []}
            onSaved={onResultSaved}
          />
        )}
      </div>
    </motion.div>
  );
}
