// src/components/ResultEditorModal.jsx
import { useEffect, useState } from "react";
import { gradeFromScore, saveStudentResult } from "../hooks/useResults";
import { Timestamp, doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Props:
 * - open, onClose
 * - student: { id, name, className, studentId?, admissionNo?, gender?, dob?, house? }
 * - termId
 * - termLabel: "First Term", "Second Term", "Third Term"
 * - session: e.g., "2024/2025"
 * - existing (optional) result doc (from useResultsForTerm)
 * - classSubjects: array of subjects (strings)
 * - onSaved callback
 */
export default function ResultEditorModal({
  open,
  onClose,
  student,
  termId,
  termLabel = "First Term",
  session = "",
  existing,
  classSubjects = [],
  onSaved,
}) {
  const defaultSubjects = classSubjects.length
    ? classSubjects
    : ["English", "Mathematics"];

  // Get current session if not provided (e.g., 2024/2025)
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  const defaultSession = session || `${currentYear}/${nextYear}`;

  // Initialize subjects with the new structure
  const initialSubjects =
    existing && existing.subjects
      ? existing.subjects.map((s) => ({
          name: s.name,
          firstCA: s.firstCA || s.ca1 || "",
          secondCA: s.secondCA || s.ca2 || "",
          exam: s.exam || "",
          total: s.total || 0,
          grade: s.grade || "",
          point: s.point || 0,
          remark: s.remark || "",
        }))
      : defaultSubjects.map((name) => ({
          name,
          firstCA: "",
          secondCA: "",
          exam: "",
          total: 0,
          grade: "",
          point: 0,
          remark: "",
        }));

  // Initialize behavioral traits with 1-5 rating
  const initialBehavioralTraits = [
    { name: "Attendance", grade: "" },
    { name: "Attentive", grade: "" },
    { name: "Honesty", grade: "" },
    { name: "Politeness", grade: "" },
    { name: "Self Control", grade: "" },
    { name: "Handwriting", grade: "" },
    { name: "Sport", grade: "" },
    { name: "Drama", grade: "" },
    { name: "Reliability", grade: "" },
    { name: "Initiative", grade: "" },
  ];

  // Initialize state
  const [subjects, setSubjects] = useState(initialSubjects);
  const [loading, setLoading] = useState(false);
  const [promote, setPromote] = useState(existing?.promoted ?? null);
  const [behavioralTraits, setBehavioralTraits] = useState(
    initialBehavioralTraits
  );
  const [formTeacherReport, setFormTeacherReport] = useState(
    existing?.formTeacherReport || ""
  );
  const [formTeacherName, setFormTeacherName] = useState(
    existing?.formTeacherName || ""
  );
  const [principalReport, setPrincipalReport] = useState(
    existing?.principalReport || ""
  );
  const [classPosition, setClassPosition] = useState(
    existing?.classPosition || ""
  );
  const [noInClass, setNoInClass] = useState(""); // Will be fetched from Firebase
  const [totalSchoolDays, setTotalSchoolDays] = useState(
    existing?.totalSchoolDays || ""
  );
  const [daysPresent, setDaysPresent] = useState(""); // Will be fetched from Firebase
  const [daysAbsent, setDaysAbsent] = useState(""); // Will be calculated
  
  // For fetching data
  const [isFetchingData, setIsFetchingData] = useState(false);

  // Validate if a string is a valid number within range
  const validateNumberInput = (value, max) => {
    if (value === "") return { isValid: true, numValue: 0 };

    // Remove any non-numeric characters except decimal point
    const cleaned = value.replace(/[^0-9.]/g, "");
    const numValue = parseFloat(cleaned);

    if (isNaN(numValue)) {
      return { isValid: false, numValue: 0 };
    }

    // Check if within range
    if (numValue < 0) {
      return { isValid: false, numValue: 0 };
    }

    if (numValue > max) {
      return { isValid: false, numValue: max };
    }

    return { isValid: true, numValue };
  };

  // Fetch all required data from Firebase
  const fetchStudentData = async () => {
    if (!student?.id || !student?.className) return;
    
    setIsFetchingData(true);
    try {
      // 1. Fetch student attendance data
      const studentRef = doc(db, "students", student.id);
      const studentSnap = await getDoc(studentRef);
      
      if (studentSnap.exists()) {
        const studentData = studentSnap.data();
        
        // Get term-specific attendance data
        if (studentData.lastAttendanceTermId === termId) {
          const presentDays = studentData.termTimesPresent || 0;
          setDaysPresent(presentDays.toString());
          
          // Calculate absent days if total school days is set
          if (totalSchoolDays) {
            const absent = parseInt(totalSchoolDays) - presentDays;
            setDaysAbsent(Math.max(0, absent).toString());
          }
        }
      }

      // 2. Fetch number of students in the same class
      const studentsQuery = query(
        collection(db, "students"),
        where("className", "==", student.className)
      );
      const studentsSnapshot = await getDocs(studentsQuery);
      const classCount = studentsSnapshot.size;
      setNoInClass(classCount.toString());

    } catch (error) {
      console.error("Error fetching student data:", error);
    } finally {
      setIsFetchingData(false);
    }
  };

  useEffect(() => {
    if (open && student?.id) {
      setSubjects(initialSubjects);
      setPromote(existing?.promoted ?? null);

      // Initialize behavioral traits from existing data if available
      if (existing && existing.behavioralTraits) {
        setBehavioralTraits(existing.behavioralTraits);
      }

      if (existing && existing.formTeacherReport) {
        setFormTeacherReport(existing.formTeacherReport);
      }

      if (existing && existing.formTeacherName) {
        setFormTeacherName(existing.formTeacherName);
      }

      if (existing && existing.principalReport) {
        setPrincipalReport(existing.principalReport);
      }

      if (existing && existing.classPosition) {
        setClassPosition(existing.classPosition);
      }

      if (existing && existing.totalSchoolDays) {
        setTotalSchoolDays(existing.totalSchoolDays);
      }

      if (existing && existing.daysPresent) {
        setDaysPresent(existing.daysPresent);
      }

      if (existing && existing.daysAbsent) {
        setDaysAbsent(existing.daysAbsent);
      } else if (existing?.totalSchoolDays && existing?.daysPresent) {
        // Calculate absent days from existing data
        const total = parseInt(existing.totalSchoolDays) || 0;
        const present = parseInt(existing.daysPresent) || 0;
        const absent = Math.max(0, total - present);
        setDaysAbsent(absent.toString());
      }

      // Fetch live data from Firebase
      fetchStudentData();
    }
    // eslint-disable-next-line
  }, [open, existing, student?.id]);

  // Calculate absent days when total school days changes
  useEffect(() => {
    if (totalSchoolDays && daysPresent) {
      const total = parseInt(totalSchoolDays) || 0;
      const present = parseInt(daysPresent) || 0;
      if (total > 0 && present >= 0) {
        const absent = total - present;
        setDaysAbsent(Math.max(0, absent).toString());
      }
    }
  }, [totalSchoolDays, daysPresent]);

  function updateSubject(index, field, value) {
    setSubjects((prev) => {
      const next = prev.slice();
      next[index] = { ...next[index], [field]: value };

      // Recompute totals and grade based on all three components
      const firstCAValidation = validateNumberInput(
        next[index].firstCA || "",
        15
      );
      const secondCAValidation = validateNumberInput(
        next[index].secondCA || "",
        15
      );
      const examValidation = validateNumberInput(next[index].exam || "", 70);

      const firstCA = firstCAValidation.isValid
        ? firstCAValidation.numValue
        : 0;
      const secondCA = secondCAValidation.isValid
        ? secondCAValidation.numValue
        : 0;
      const exam = examValidation.isValid ? examValidation.numValue : 0;

      const tot = firstCA + secondCA + exam;
      const g = gradeFromScore(tot);
      next[index].total = tot;
      next[index].grade = g.grade;
      next[index].point = g.point;
      return next;
    });
  }

  function updateBehavioralTrait(index, grade) {
    setBehavioralTraits((prev) => {
      const next = prev.slice();
      next[index] = { ...next[index], grade };
      return next;
    });
  }

  function computeSummary() {
    const totalPossible = subjects.length * 100; // assuming each subject max 100
    const totalObtained = subjects.reduce(
      (s, x) => s + Number(x.total || 0),
      0
    );
    const percentage =
      totalPossible > 0 ? (totalObtained / totalPossible) * 100 : 0;
    const avgPoint = subjects.length
      ? subjects.reduce((s, x) => s + Number(x.point || 0), 0) / subjects.length
      : 0;
    const passed =
      subjects.length > 0
        ? subjects.every((s) => Number(s.total || 0) >= 40)
        : false;
    
    // Calculate grade based on percentage
    let overallGrade = "F";
    if (percentage >= 75) overallGrade = "A";
    else if (percentage >= 70) overallGrade = "AB";
    else if (percentage >= 65) overallGrade = "B";
    else if (percentage >= 60) overallGrade = "BC";
    else if (percentage >= 55) overallGrade = "C";
    else if (percentage >= 50) overallGrade = "CD";
    else if (percentage >= 45) overallGrade = "D";
    else if (percentage >= 40) overallGrade = "E";

    return {
      totalObtained,
      percentage: Number(percentage.toFixed(2)),
      avgPoint: Number(avgPoint.toFixed(2)),
      passed,
      overallGrade,
    };
  }

  // Check if any subject has incomplete scores
  function hasIncompleteScores() {
    return subjects.some((s) => {
      const firstCA = s.firstCA.trim();
      const secondCA = s.secondCA.trim();
      const exam = s.exam.trim();
      return firstCA === "" || secondCA === "" || exam === "";
    });
  }

  // Handle total school days change - recalculate absent days
  const handleTotalSchoolDaysChange = (value) => {
    setTotalSchoolDays(value);
    if (value && daysPresent) {
      const total = parseInt(value) || 0;
      const present = parseInt(daysPresent) || 0;
      if (total > 0 && present >= 0) {
        const absent = total - present;
        setDaysAbsent(Math.max(0, absent).toString());
      }
    }
  };

  async function handleSave() {
    if (!termId || !student) return;

    // Check for incomplete scores
    if (hasIncompleteScores()) {
      if (
        !window.confirm("Some subjects have incomplete scores. Save anyway?")
      ) {
        return;
      }
    }

    setLoading(true);
    try {
      const summary = computeSummary();
      const payload = {
        subjects,
        behavioralTraits,
        formTeacherReport,
        formTeacherName,
        principalReport,
        classPosition,
        noInClass,
        daysPresent,
        daysAbsent,
        totalSchoolDays,
        session: defaultSession,
        term: termLabel,
        total: summary.totalObtained,
        percentage: summary.percentage,
        overallGrade: summary.overallGrade,
        avgPoint: summary.avgPoint,
        passed: summary.passed,
        promoted: promote === null ? summary.passed : promote,
        preparedBy: "Bursar / Admin",
        updatedAt: Timestamp.now(),
      };
      await saveStudentResult(
        termId,
        student.id,
        student.className || student.class,
        payload
      );
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to save result: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 md:p-4">
      <div className="w-full max-w-6xl bg-gradient-to-tr from-[#1a1038] via-[#241a44] to-[#1b1740] p-4 md:p-6 rounded-2xl border border-purple-500/30 shadow-2xl shadow-purple-900/30 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-[#1a1038] py-2 z-10">
          <h3 className="text-white font-bold text-lg md:text-xl">
            Edit Result — {student?.name || "Student"}
          </h3>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-lg md:text-xl"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* Student Information Section */}
          <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
            <h4 className="text-white font-bold mb-4 text-lg">Student Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <label className="text-xs text-white/90 mb-1 block">Name</label>
                <div className="w-full px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white">
                  {student?.name || "—"}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">Class</label>
                <div className="w-full px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white">
                  {student?.className || student?.class || "—"}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">Admission No</label>
                <div className="w-full px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white">
                  {student?.admissionNo || student?.studentId || "—"}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">Term</label>
                <div className="w-full px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white">
                  {termLabel}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">Session</label>
                <div className="w-full px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white">
                  {defaultSession}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">Gender</label>
                <div className="w-full px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white">
                  {student?.gender || "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Academic Performance Summary */}
          <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
            <h4 className="text-white font-bold mb-4 text-lg">Academic Performance</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-white/90 mb-1 block">No. in Class</label>
                <input
                  type="text"
                  value={noInClass}
                  readOnly
                  className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white opacity-90 cursor-not-allowed"
                />
                {isFetchingData && (
                  <div className="text-xs text-white/60 mt-1">Loading from system...</div>
                )}
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">Total School Days</label>
                <input
                  type="text"
                  value={totalSchoolDays}
                  onChange={(e) => handleTotalSchoolDaysChange(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                  placeholder="e.g., 90"
                />
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">Days Present</label>
                <input
                  type="text"
                  value={daysPresent}
                  readOnly
                  className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white opacity-90 cursor-not-allowed"
                />
                {isFetchingData && (
                  <div className="text-xs text-white/60 mt-1">Loading from attendance...</div>
                )}
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">Days Absent</label>
                <input
                  type="text"
                  value={daysAbsent}
                  readOnly
                  className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white opacity-80 cursor-not-allowed"
                />
                {totalSchoolDays && daysPresent && (
                  <div className="text-xs text-white/60 mt-1">
                    Calculated: {totalSchoolDays} - {daysPresent} = {daysAbsent}
                  </div>
                )}
              </div>
            </div>
            
            {/* Attendance Help Text */}
            <div className="mt-4 text-sm text-white/70">
              <p className="mb-2">
                <strong>Note:</strong> 
                <span className="ml-1">Days Present is loaded from the attendance system.</span>
              </p>
              <p>
                <span className="text-green-400">✓ Days Absent is automatically calculated.</span>
              </p>
            </div>
          </div>

          {/* Academic Subjects Section */}
          <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
            <h4 className="text-white font-bold mb-4 text-lg">
              Academic Subjects
            </h4>
            <div className="space-y-3">
              {subjects.map((s, i) => (
                <div
                  key={`subject-${i}`}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-end p-3 bg-[#362b68]/40 rounded border border-white/10"
                >
                  <div className="lg:col-span-3">
                    <label className="text-xs text-white/90 mb-1 block">
                      Subject
                    </label>
                    <div className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white opacity-90">
                      {s.name}
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-xs text-white/90 mb-1 block">
                      First CA
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={s.firstCA}
                      onChange={(e) =>
                        updateSubject(i, "firstCA", e.target.value)
                      }
                      className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                      placeholder="0-15"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-xs text-white/90 mb-1 block">
                      Second CA
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={s.secondCA}
                      onChange={(e) =>
                        updateSubject(i, "secondCA", e.target.value)
                      }
                      className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                      placeholder="0-15"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-xs text-white/90 mb-1 block">
                      Exam
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={s.exam}
                      onChange={(e) => updateSubject(i, "exam", e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                      placeholder="0-70"
                    />
                  </div>

                  <div className="lg:col-span-2 text-center p-2 bg-[#362b68]/60 rounded">
                    <div className="text-xs text-white/80">Total</div>
                    <div className="font-bold text-white text-sm md:text-base mt-1">
                      {s.total || "0"}
                    </div>
                  </div>

                  <div className="lg:col-span-1 text-center p-2 bg-[#362b68]/60 rounded">
                    <div className="text-xs text-white/80">Grade</div>
                    <div className="font-bold text-white text-sm md:text-base mt-1">
                      {s.grade || "?"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Behavioral Traits Section */}
          <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
            <h4 className="text-white font-bold mb-4 text-lg">
              Behavioral Assessment (1-5 Rating)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {behavioralTraits.map((trait, index) => (
                <div
                  key={trait.name}
                  className="p-3 bg-[#362b68]/40 rounded border border-white/10"
                >
                  <label className="text-xs text-white/90 mb-2 block">
                    {trait.name}
                  </label>
                  <select
                    value={trait.grade}
                    onChange={(e) =>
                      updateBehavioralTrait(index, e.target.value)
                    }
                    className="w-full text-sm px-2 py-1 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="">Select rating</option>
                    <option value="5">5 — Excellent</option>
                    <option value="4">4 — Very Good</option>
                    <option value="3">3 — Good</option>
                    <option value="2">2 — Fair</option>
                    <option value="1">1 — Poor</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Class Position Section */}
          <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
            <h4 className="text-white font-bold mb-4 text-lg">Class Position</h4>
            <div className="w-full md:w-1/3">
              <label className="text-xs text-white/90 mb-2 block">
                Enter the student's position in class:
              </label>
              <input
                type="text"
                value={classPosition}
                onChange={(e) => setClassPosition(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                placeholder="e.g., 5th (out of 45)"
              />
              <div className="text-xs text-white/60 mt-2">
                This is determined after all academic calculations are complete.
              </div>
            </div>
          </div>

          {/* Reports Section - Simplified */}
          <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
            <h4 className="text-white font-bold mb-4 text-lg">Reports</h4>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/90 mb-2 block">
                  FORM TEACHER'S REPORT:
                </label>
                <textarea
                  value={formTeacherReport}
                  onChange={(e) => setFormTeacherReport(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                  rows={3}
                  placeholder="Enter form teacher's report here..."
                />
              </div>

              <div>
                <label className="text-xs text-white/90 mb-2 block">
                  FORM TEACHER'S NAME:
                </label>
                <input
                  type="text"
                  value={formTeacherName}
                  onChange={(e) => setFormTeacherName(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                  placeholder="Enter form teacher's name"
                />
              </div>

              <div>
                <label className="text-xs text-white/90 mb-2 block">
                  PRINCIPAL'S REPORT:
                </label>
                <textarea
                  value={principalReport}
                  onChange={(e) => setPrincipalReport(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                  rows={3}
                  placeholder="Enter principal's report here..."
                />
              </div>
            </div>
          </div>

          {/* Summary and Action Section */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 p-4 bg-[#2a2250] rounded-lg border border-white/10">
            <div className="text-white/90 space-y-3 flex-1">
              <h4 className="text-white font-bold text-lg">Academic Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col p-3 bg-[#362b68]/40 rounded">
                  <span className="text-white/70 text-sm">Total Score</span>
                  <strong className="text-lg text-white">
                    {computeSummary().totalObtained}
                  </strong>
                </div>
                <div className="flex flex-col p-3 bg-[#362b68]/40 rounded">
                  <span className="text-white/70 text-sm">Percentage</span>
                  <strong className="text-lg text-white">
                    {computeSummary().percentage}%
                  </strong>
                </div>
                <div className="flex flex-col p-3 bg-[#362b68]/40 rounded">
                  <span className="text-white/70 text-sm">Overall Grade</span>
                  <strong className="text-lg text-white">
                    {computeSummary().overallGrade}
                  </strong>
                </div>
                <div className="flex flex-col p-3 bg-[#362b68]/40 rounded">
                  <span className="text-white/70 text-sm">Average Point</span>
                  <strong className="text-lg text-white">
                    {computeSummary().avgPoint}
                  </strong>
                </div>
              </div>
              {hasIncompleteScores() && (
                <div className="text-amber-400 text-sm mt-2">
                  ⚠️ Some subjects have incomplete scores
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <label className="text-white/90 whitespace-nowrap">
                  Promote?
                </label>
                <select
                  value={
                    promote === null
                      ? computeSummary().passed
                        ? "auto-pass"
                        : "auto-fail"
                      : promote
                      ? "yes"
                      : "no"
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "yes") setPromote(true);
                    else if (v === "no") setPromote(false);
                    else setPromote(null);
                  }}
                  className="bg-[#362b68]/70 text-white px-3 py-2 rounded border border-white/10 focus:outline-none focus:border-purple-500/50"
                >
                  <option value="auto-pass">Auto (based on pass)</option>
                  <option value="yes">Yes (force promotion)</option>
                  <option value="no">No (repeat class)</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#6C4AB6] to-[#8D72E1] rounded-lg text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 min-w-[120px] justify-center"
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    "Save Result"
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-[#362b68] rounded-lg text-white font-medium hover:bg-[#3a2d70] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}