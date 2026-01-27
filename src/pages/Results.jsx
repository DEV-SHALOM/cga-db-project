import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaFilePdf,
  FaEdit,
  FaPrint,
  FaUser,
  FaCalendarCheck,
  FaSearch,
  FaDownload,
  FaChevronDown,
  FaChevronUp,
  FaFolderOpen,
} from "react-icons/fa";
import {
  useStudentsByClass,
  useClassSubjects,
  useResultsForTerm,
} from "../hooks/useResults";
import ResultEditorModal from "../components/ResultEditorModal";
import ClassSubjectsManager from "../components/ClassSubjectsManager";
import { generateStudentResultPDF } from "../reports/generateStudentResultPDF";
import { useActiveTerm } from "../hooks/useActiveTerm";
import { getStudentPresentDays } from "../utils/attendanceUtils";
import { doc, getDoc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import JSZip from "jszip";
import { saveAs } from "file-saver";

// ✅ IMPORT THE COMPLETE BATCH PDF GENERATOR
import { generateStudentResultPDFAsBlob } from "../utils/batchPDFGenerator";

// ===============================
// SMART NIGERIAN SCHOOL SORTING
// ===============================

// School level priority (lower = earlier)
const LEVEL_ORDER = [
  { key: "pre-nursery", rank: 0 },
  { key: "pre-kg", rank: 1 },
  { key: "nursery", rank: 2 },
  { key: "basic", rank: 3 }, // Primary
  { key: "primary", rank: 3 },
  { key: "jss", rank: 4 },
  { key: "junior secondary", rank: 4 },
  { key: "ss", rank: 5 },
  { key: "senior secondary", rank: 5 },
];

function normalizeClassName(name = "") {
  return name.toLowerCase().trim();
}

function getLevelRank(className = "") {
  const name = className.toLowerCase().trim();

  // PRE-K / NURSERY
  if (/^(pre[-\s]?kg|pre[-\s]?nursery)/i.test(name)) return 0;
  if (/^nursery/i.test(name)) return 1;

  // PRIMARY / BASIC
  if (/^(basic|primary)/i.test(name)) return 2;

  // JUNIOR SECONDARY — JS / JSS
  if (/^(js|jss|junior\s+secondary)/i.test(name)) return 3;

  // SENIOR SECONDARY — SS / SSS
  if (/^(ss|sss|senior\s+secondary)/i.test(name)) return 4;

  return 99; // Unknown last
}

function extractClassNumber(className) {
  // Matches 1, 2, 3 in JSS1, SS 2, Basic 3
  const match = className.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function extractSection(className) {
  // Matches A, B, C at the END (JSS1A, Nursery 2B)
  const match = className.match(/([A-Z])$/i);
  return match ? match[1].toUpperCase().charCodeAt(0) : 0;
}

function getClassSortKey(className) {
  return {
    level: getLevelRank(className),
    number: extractClassNumber(className),
    section: extractSection(className),
    raw: className,
  };
}

function sortClasses(classNames) {
  return [...classNames].sort((a, b) => {
    const A = getClassSortKey(a);
    const B = getClassSortKey(b);

    if (A.level !== B.level) return A.level - B.level;
    if (A.number !== B.number) return A.number - B.number;
    if (A.section !== B.section) return A.section - B.section;

    // Final fallback: alphabetical
    return A.raw.localeCompare(B.raw);
  });
}

function studentMatchesQuery(student, query) {
  if (!query) return true;

  const q = query.toLowerCase().trim();

  const name = (student.name || "").toLowerCase();
  const admissionNo = (
    student.admissionNo ||
    student.studentId ||
    ""
  ).toLowerCase();

  return name.includes(q) || admissionNo.includes(q);
}

export default function ResultsPage() {
  const termId = useActiveTerm();
  const studentsByClass = useStudentsByClass();
  const classSubjects = useClassSubjects();
  const resultsMap = useResultsForTerm(termId);
  const [globalSearch, setGlobalSearch] = useState("");

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
  const [searchQueries, setSearchQueries] = useState({});
  const [downloadingClass, setDownloadingClass] = useState(null);

  const TERM_CONFIG = {
    "First Term": { startMonth: 8, endMonth: 11 },
    "Second Term": { startMonth: 0, endMonth: 3 },
    "Third Term": { startMonth: 4, endMonth: 7 },
  };

  const calculateTermProgress = (termName) => {
    if (!activeTermInfo?.startDate) return 0;
    
    const startDate = activeTermInfo.startDate instanceof Timestamp 
      ? activeTermInfo.startDate.toDate() 
      : new Date(activeTermInfo.startDate);
      
    const now = new Date();
    
    // Duration of term is 4 months (approx 120 days)
    const termDurationMs = 4 * 30 * 24 * 60 * 60 * 1000;
    const elapsedMs = now.getTime() - startDate.getTime();
    
    const progress = Math.min(Math.max((elapsedMs / termDurationMs) * 100, 0), 100);
    return Math.round(progress);
  };

  useEffect(() => {
    const fetchActiveTerm = () => {
      try {
        const appSettingsRef = doc(db, "settings", "app");
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
                startDate: activeTerm.startDate,
                progress: calculateTermProgress(termName),
              });
            } else {
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
                      startDate: termData.startDate,
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
    const docId = `${termId}_${student.id}`;
    const existingResult = resultsMap[docId] || null;
    setEditorStudent(student);
    setEditorExisting(existingResult);
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
    generateStudentResultPDF(student, res, {
      logo: null,
    });
  }

  // ✅ FIXED BATCH PDF DOWNLOAD - USES COMPLETE GENERATOR
  async function handleBatchDownload(className, students) {
    if (!students || students.length === 0) {
      alert("No students in this class");
      return;
    }

    const studentsWithResults = students.filter((student) => {
      const docId = `${termId}_${student.id}`;
      return resultsMap[docId] != null;
    });

    if (studentsWithResults.length === 0) {
      alert("No results found for any student in this class");
      return;
    }

    if (studentsWithResults.length < students.length) {
      const proceed = window.confirm(
        `Only ${studentsWithResults.length} out of ${students.length} students have results. Download available results?`
      );
      if (!proceed) return;
    }

    setDownloadingClass(className);

    try {
      const zip = new JSZip();
      const folder = zip.folder(
        `${className}_${activeTermInfo.termName}_${activeTermInfo.academicYear}`.replace(
          /[<>:"/\\|?*]/g,
          "_"
        )
      );

      const firstResult = resultsMap[`${termId}_${studentsWithResults[0].id}`];
      const formTeacherName = firstResult?.formTeacherName || "Unknown";

      folder.file(
        "README.txt",
        `Class: ${className}
Term: ${activeTermInfo.termName}
Session: ${activeTermInfo.academicYear}
Form Teacher: ${formTeacherName}
Total Students: ${studentsWithResults.length}
Generated: ${new Date().toLocaleString()}

This folder contains complete result PDFs for all students in ${className}.
Each PDF includes:
- Student passport photo
- All subjects with grades
- Behavioral traits
- Attendance records
- Form teacher & principal reports with signatures
- Next term begins date
`
      );

      // ✅ USE THE COMPLETE PDF GENERATOR (matches single download)
      for (const student of studentsWithResults) {
        const docId = `${termId}_${student.id}`;
        const res = resultsMap[docId];

        if (res) {
          try {
            // ✅ THIS NOW GENERATES COMPLETE PDFS MATCHING SINGLE DOWNLOADS
            const pdfBlob = await generateStudentResultPDFAsBlob(student, res);
            const fileName = `${student.name.replace(
              /[<>:"/\\|?*]/g,
              "_"
            )}_Result.pdf`;
            folder.file(fileName, pdfBlob);
          } catch (error) {
            console.error(`Error generating PDF for ${student.name}:`, error);
          }
        }
      }

      const content = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      saveAs(
        content,
        `${className}_${activeTermInfo.termName}_${activeTermInfo.academicYear}_Results.zip`
      );

      alert(
        `Successfully downloaded ${studentsWithResults.length} complete result PDFs!`
      );
    } catch (error) {
      console.error("Error generating batch download:", error);
      alert("Failed to generate batch download. Please try again.");
    } finally {
      setDownloadingClass(null);
    }
  }

  const toggleClassExpansion = (className) => {
    setExpandedClasses((prev) => ({
      ...prev,
      [className]: !prev[className],
    }));
  };

  const handleSearchChange = (className, query) => {
    setSearchQueries((prev) => ({
      ...prev,
      [className]: query,
    }));
  };

  const filterStudents = (students, className) => {
    const query = (searchQueries[className] || "").toLowerCase().trim();
    if (!query) return students;
    return students.filter((student) => {
      const name = (student.name || "").toLowerCase();
      const admissionNo = (
        student.admissionNo ||
        student.studentId ||
        ""
      ).toLowerCase();
      return name.includes(query) || admissionNo.includes(query);
    });
  };

  const termProgress = calculateTermProgress(activeTermInfo.termName);

  function ClassBlock({ className, students }) {
    const subs = classSubjects[className] || [];
    const isExpanded = expandedClasses[className] !== false;
    const searchQuery = searchQueries[className] || "";
    const filteredStudents = filterStudents(students, className);
    const needsScrolling = filteredStudents.length > 10;
    const studentsWithResults = students.filter((student) => {
      const docId = `${termId}_${student.id}`;
      return resultsMap[docId] != null;
    });
    const canBatchDownload = studentsWithResults.length > 0;

    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-tr from-white/6 via-[#3e1c7c]/18 to-[#372772]/14 p-4 md:p-6 border border-white/10"
      >
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
                {canBatchDownload && (
                  <div className="px-2 py-1 rounded-full text-xs bg-green-600/40 text-green-400 flex items-center gap-1">
                    <FaFilePdf className="text-xs" />
                    <span>{studentsWithResults.length} ready</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <ClassSubjectsManager
              className={className}
              subjects={subs}
              onSaved={() => {}}
            />

            {canBatchDownload && (
              <button
                onClick={() => handleBatchDownload(className, students)}
                disabled={downloadingClass === className}
                className="px-3 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 rounded-lg text-white flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={`Download all ${studentsWithResults.length} complete result PDFs as ZIP`}
              >
                {downloadingClass === className ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span className="hidden md:inline">Generating...</span>
                  </>
                ) : (
                  <>
                    <FaDownload />
                    <span className="hidden md:inline">
                      Download All ({studentsWithResults.length})
                    </span>
                    <span className="md:hidden">All PDFs</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => toggleClassExpansion(className)}
              className="md:hidden px-3 py-2 bg-white/10 rounded-lg text-white flex items-center gap-2"
            >
              {isExpanded ? (
                <>
                  <FaChevronUp />
                  <span>Collapse</span>
                </>
              ) : (
                <>
                  <FaChevronDown />
                  <span>Expand</span>
                </>
              )}
            </button>
          </div>
        </div>

        {students.length > 5 && (
          <div className="mb-4">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Search by name or admission number..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(className, e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-purple-500/50 transition-colors"
              />
            </div>
            {searchQuery && (
              <div className="mt-2 text-sm text-white/60">
                Found {filteredStudents.length} of {students.length} students
              </div>
            )}
          </div>
        )}

        <div className="hidden md:block">
          <div
            className={`overflow-x-auto ${
              needsScrolling ? "max-h-[600px] overflow-y-auto" : ""
            } scrollbar-thin scrollbar-thumb-purple-500/50 scrollbar-track-white/5`}
          >
            <table className="w-full text-sm md:text-base">
              <thead className="bg-gradient-to-r from-[#1e0447]/90 to-[#372772]/90 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-white font-medium">
                    Student
                  </th>
                  <th className="px-4 py-3 text-left text-white font-medium">
                    Admission No
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
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((s) => {
                    const docId = `${termId}_${s.id}`;
                    const res = resultsMap[docId];
                    const percentage = res?.percentage ?? "—";
                    const decision = res
                      ? res.promoted
                        ? "Promoted"
                        : "Not promoted"
                      : "Not set";

                    return (
                      <tr
                        key={s.id}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-4 text-white font-medium">
                          {s.name}
                        </td>
                        <td className="px-4 py-4 text-white/70">
                          {s.admissionNo || s.studentId || "—"}
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
                  })
                ) : (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-8 text-center text-white/60"
                    >
                      {searchQuery
                        ? `No students found matching "${searchQuery}"`
                        : "No students in this class"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="md:hidden">
          <div
            className={`space-y-3 ${
              needsScrolling && isExpanded
                ? "max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500/50 scrollbar-track-white/5"
                : ""
            }`}
          >
            {(isExpanded ? filteredStudents : filteredStudents.slice(0, 3)).map(
              (s) => {
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
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-white font-bold text-base">
                            {s.name}
                          </h3>
                          <p className="text-white/70 text-sm">
                            {s.admissionNo || s.studentId || "No ID"}
                          </p>
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
              }
            )}

            {filteredStudents.length === 0 && (
              <div className="text-center py-8 text-white/60">
                {searchQuery
                  ? `No students found matching "${searchQuery}"`
                  : "No students in this class"}
              </div>
            )}

            {filteredStudents.length > 3 && (
              <button
                onClick={() => toggleClassExpansion(className)}
                className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-lg text-white flex items-center justify-center gap-2 transition-colors"
              >
                {isExpanded ? (
                  <>
                    <FaChevronUp />
                    <span>Show Less</span>
                  </>
                ) : (
                  <>
                    <FaChevronDown />
                    <span>Show All {filteredStudents.length} Students</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {students.length === 0 && (
          <div className="text-center py-8 text-white/60">
            No students in this class yet
          </div>
        )}
      </motion.div>
    );
  }

  const filteredStudentsByClass = Object.fromEntries(
    Object.entries(studentsByClass).map(([className, students]) => {
      const filtered = globalSearch
        ? students.filter((s) => studentMatchesQuery(s, globalSearch))
        : students;

      return [className, filtered];
    })
  );

  const sortedClassNames = sortClasses(
    Object.keys(filteredStudentsByClass).filter(
      (cls) => filteredStudentsByClass[cls].length > 0
    )
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen py-4 md:py-6 px-3 md:px-8"
    >
      <div className="max-w-7xl mx-auto font-[Poppins]">
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

          <div className="mt-6 mb-6">
            <div className="relative max-w-md">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Search student by name or admission number..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="
        w-full pl-12 pr-4 py-3
        bg-gradient-to-r from-[#2a2250]/80 to-[#1e0447]/80
        border border-purple-500/30
        rounded-xl
        text-white
        placeholder-white/40
        focus:outline-none
        focus:border-purple-500
        focus:ring-1 focus:ring-purple-500/40
        transition-all
      "
              />
            </div>

            {globalSearch && (
              <div className="mt-2 text-sm text-white/60">
                Showing results for "
                <span className="text-purple-400">{globalSearch}</span>"
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
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

            <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10">
              <div className="text-white/70 text-xs">Total Classes</div>
              <div className="text-white font-medium">
                {Object.keys(studentsByClass).length}
              </div>
            </div>

            <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10">
              <div className="text-white/70 text-xs">Total Students</div>
              <div className="text-white font-medium">
                {Object.values(filteredStudentsByClass).flat().length}
              </div>
            </div>
          </div>

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

        <div className="space-y-4 md:space-y-6">
          {sortedClassNames.length > 0 ? (
            sortedClassNames.map((cls) => (
              <ClassBlock
                key={cls}
                className={cls}
                students={filteredStudentsByClass[cls]}
              />
            ))
          ) : (
            <div className="text-center py-12">
              <FaFolderOpen className="mx-auto text-5xl text-white/20 mb-4" />
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
            termLabel={activeTermInfo.termName}
            session={activeTermInfo.academicYear}
            existing={editorExisting}
            classSubjects={classSubjects[editorStudent.className] || []}
            onSaved={onResultSaved}
          />
        )}
      </div>
    </motion.div>
  );
}
