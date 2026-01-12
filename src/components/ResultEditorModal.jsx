// src/components/ResultEditorModal.jsx
// ✅ WITH SIGNATURE UPLOADS (Base64) + IMPROVED CLOSE BUTTON
import { useEffect, useState } from "react";
import OpenAI from "openai";
import { gradeFromScore, saveStudentResult } from "../hooks/useResults";
import {
  Timestamp,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { FaTimes, FaCamera, FaMagic } from "react-icons/fa";

// Initialize OpenAI client for AI report generation
// Replit AI Integrations automatically configures these environment variables
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_AI_INTEGRATIONS_OPENAI_API_KEY || "dummy",
  baseURL: import.meta.env.VITE_AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
  dangerouslyAllowBrowser: true,
});

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
  // Get current session if not provided (e.g., 2024/2025)
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  const defaultSession = session || `${currentYear}/${nextYear}`;

  // Initialize subjects with the new structure
  // ✅ Only load existing subjects OR class subjects - NO default fallback
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
      : classSubjects.length > 0
      ? classSubjects.map((name) => ({
          name,
          firstCA: "",
          secondCA: "",
          exam: "",
          total: 0,
          grade: "",
          point: 0,
          remark: "",
        }))
      : [];

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
  const [noInClass, setNoInClass] = useState("");
  const [totalSchoolDays, setTotalSchoolDays] = useState(
    existing?.totalSchoolDays || ""
  );
  const [daysPresent, setDaysPresent] = useState("");
  const [daysAbsent, setDaysAbsent] = useState("");

  // ✅ NEW: Signature states
  const [formTeacherSignature, setFormTeacherSignature] = useState(
    existing?.formTeacherSignature || ""
  );
  const [principalSignature, setPrincipalSignature] = useState(
    existing?.principalSignature || ""
  );
  const [formTeacherSigPreview, setFormTeacherSigPreview] = useState(
    existing?.formTeacherSignature || ""
  );
  const [principalSigPreview, setPrincipalSigPreview] = useState(
    existing?.principalSignature || ""
  );
  const [isUploadingFormTeacherSig, setIsUploadingFormTeacherSig] =
    useState(false);
  const [isUploadingPrincipalSig, setIsUploadingPrincipalSig] = useState(false);
  const [isGeneratingFTReport, setIsGeneratingFTReport] = useState(false);
  const [isGeneratingPReport, setIsGeneratingPReport] = useState(false);

  const [isFetchingData, setIsFetchingData] = useState(false);

  // AI Generation Logic
  const generateAIReport = async (role) => {
    const isPrincipal = role === "principal";
    if (isPrincipal) setIsGeneratingPReport(true);
    else setIsGeneratingFTReport(true);

    try {
      const summary = computeSummary();
      const performance = `The student ${student.name} in ${student.className} achieved an overall score of ${summary.totalObtained} with a percentage of ${summary.percentage}% and an average point of ${summary.avgPoint}. Their overall grade is ${summary.overallGrade}. They ${summary.passed ? "passed all subjects" : "did not pass all subjects"}. Subjects taken: ${subjects.map(s => `${s.name} (${s.total}, ${s.grade})`).join(", ")}.`;
      
      const prompt = isPrincipal 
        ? `As the School Principal, write a professional, encouraging, and concise one-paragraph end-of-term comment for a student's report card based on this performance data: ${performance}. Focus on character, future prospects, and general school standard.`
        : `As the Form Teacher, write a professional, detailed, and encouraging one-paragraph end-of-term comment for a student's report card based on this performance data: ${performance}. Focus on academic progress, behavioral traits, and specific areas of improvement.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 150,
      });

      const aiComment = response.choices[0]?.message?.content?.trim();
      if (aiComment) {
        if (isPrincipal) setPrincipalReport(aiComment);
        else setFormTeacherReport(aiComment);
      }
    } catch (error) {
      console.error("AI Generation Error:", error);
      alert("Failed to generate AI report. Please check your connection or try again.");
    } finally {
      if (isPrincipal) setIsGeneratingPReport(false);
      else setIsGeneratingFTReport(false);
    }
  };

  // ✅ Base64 conversion function
  const convertImageToBase64 = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        const base64String = reader.result;
        const sizeInMB = (base64String.length * 0.75) / 1024 / 1024;
        if (sizeInMB > 0.5) {
          reject(
            new Error(
              "Signature image too large. Please use a smaller image (max ~400KB)."
            )
          );
          return;
        }
        resolve(base64String);
      };

      reader.onerror = () => {
        reject(new Error("Failed to read signature image."));
      };

      reader.readAsDataURL(file);
    });
  };

  // ✅ Form Teacher Signature Upload
  const handleFormTeacherSigChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file (JPG, PNG, etc.)");
      return;
    }

    if (file.size > 800 * 1024) {
      alert("Signature must be less than 800KB. Please compress it first.");
      return;
    }

    setIsUploadingFormTeacherSig(true);
    try {
      const base64 = await convertImageToBase64(file);
      setFormTeacherSignature(base64);
      setFormTeacherSigPreview(base64);
    } catch (error) {
      alert(error.message);
    } finally {
      setIsUploadingFormTeacherSig(false);
    }
  };

  // ✅ Principal Signature Upload
  const handlePrincipalSigChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file (JPG, PNG, etc.)");
      return;
    }

    if (file.size > 800 * 1024) {
      alert("Signature must be less than 800KB. Please compress it first.");
      return;
    }

    setIsUploadingPrincipalSig(true);
    try {
      const base64 = await convertImageToBase64(file);
      setPrincipalSignature(base64);
      setPrincipalSigPreview(base64);
    } catch (error) {
      alert(error.message);
    } finally {
      setIsUploadingPrincipalSig(false);
    }
  };

  // Validate if a string is a valid number within range
  const validateNumberInput = (value, max) => {
    if (value === "") return { isValid: true, numValue: 0 };

    const cleaned = value.replace(/[^0-9.]/g, "");
    const numValue = parseFloat(cleaned);

    if (isNaN(numValue)) {
      return { isValid: false, numValue: 0 };
    }

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
      const studentRef = doc(db, "students", student.id);
      const studentSnap = await getDoc(studentRef);

      if (studentSnap.exists()) {
        const studentData = studentSnap.data();

        if (studentData.lastAttendanceTermId === termId) {
          const presentDays = studentData.termTimesPresent || 0;
          setDaysPresent(presentDays.toString());

          if (totalSchoolDays) {
            const absent = parseInt(totalSchoolDays) - presentDays;
            setDaysAbsent(Math.max(0, absent).toString());
          }
        }
      }

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
      // ✅ Reset all fields first
      setSubjects(initialSubjects);
      setPromote(existing?.promoted ?? null);
      setBehavioralTraits(
        existing?.behavioralTraits || initialBehavioralTraits
      );
      setFormTeacherReport(existing?.formTeacherReport || "");
      setFormTeacherName(existing?.formTeacherName || "");
      setPrincipalReport(existing?.principalReport || "");
      setClassPosition(existing?.classPosition || "");
      setTotalSchoolDays(existing?.totalSchoolDays || "");
      setDaysPresent(existing?.daysPresent || "");
      setDaysAbsent(existing?.daysAbsent || "");

      // ✅ Load existing signatures
      setFormTeacherSignature(existing?.formTeacherSignature || "");
      setFormTeacherSigPreview(existing?.formTeacherSignature || "");
      setPrincipalSignature(existing?.principalSignature || "");
      setPrincipalSigPreview(existing?.principalSignature || "");

      // Calculate days absent if not provided
      if (
        !existing?.daysAbsent &&
        existing?.totalSchoolDays &&
        existing?.daysPresent
      ) {
        const total = parseInt(existing.totalSchoolDays) || 0;
        const present = parseInt(existing.daysPresent) || 0;
        const absent = Math.max(0, total - present);
        setDaysAbsent(absent.toString());
      }

      // Fetch attendance and class count
      fetchStudentData();

      // Log what was loaded
      console.log("📋 Loading existing result data:");
      console.log("- Subjects:", existing?.subjects?.length || 0);
      console.log(
        "- Behavioral Traits:",
        existing?.behavioralTraits?.length || 0
      );
      console.log(
        "- Form Teacher Report:",
        existing?.formTeacherReport ? "✅" : "❌"
      );
      console.log(
        "- Form Teacher Name:",
        existing?.formTeacherName || "Not set"
      );
      console.log(
        "- Form Teacher Signature:",
        existing?.formTeacherSignature ? "✅ Loaded" : "❌ Not found"
      );
      console.log(
        "- Principal Report:",
        existing?.principalReport ? "✅" : "❌"
      );
      console.log(
        "- Principal Signature:",
        existing?.principalSignature ? "✅ Loaded" : "❌ Not found"
      );
    }
    // eslint-disable-next-line
  }, [open, existing, student?.id]);

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
    const totalPossible = subjects.length * 100;
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

  function hasIncompleteScores() {
    return subjects.some((s) => {
      const firstCA = s.firstCA.trim();
      const secondCA = s.secondCA.trim();
      const exam = s.exam.trim();
      return firstCA === "" || secondCA === "" || exam === "";
    });
  }

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

    if (subjects.length === 0) {
      alert("Please add at least one subject before saving the result.");
      return;
    }

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
        formTeacherSignature, // ✅ Base64 signature
        principalReport,
        principalSignature, // ✅ Base64 signature
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

      // ✅ Log what's being saved
      console.log("💾 Saving result with data:");
      console.log("- Subjects:", payload.subjects.length);
      console.log("- Behavioral Traits:", payload.behavioralTraits.length);
      console.log(
        "- Form Teacher Report:",
        payload.formTeacherReport ? "✅" : "❌"
      );
      console.log("- Form Teacher Name:", payload.formTeacherName || "Not set");
      console.log(
        "- Form Teacher Signature:",
        payload.formTeacherSignature
          ? `✅ (${Math.round(payload.formTeacherSignature.length / 1024)}KB)`
          : "❌ Not set"
      );
      console.log("- Principal Report:", payload.principalReport ? "✅" : "❌");
      console.log(
        "- Principal Signature:",
        payload.principalSignature
          ? `✅ (${Math.round(payload.principalSignature.length / 1024)}KB)`
          : "❌ Not set"
      );
      console.log("- Class Position:", payload.classPosition || "Not set");
      console.log("- Attendance - Total Days:", payload.totalSchoolDays);
      console.log("- Attendance - Present:", payload.daysPresent);
      console.log("- Attendance - Absent:", payload.daysAbsent);

      await saveStudentResult(
        termId,
        student.id,
        student.className || student.class,
        payload
      );

      console.log("✅ Result saved successfully!");
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) {
      console.error("❌ Save failed:", e);
      alert("Failed to save result: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center pt-2 md:p-4">
      <div className="w-full max-w-6xl bg-gradient-to-tr from-[#1a1038] via-[#241a44] to-[#1b1740] p-4 md:p-6 rounded-2xl border border-purple-500/30 shadow-2xl shadow-purple-900/30 max-h-[95vh] overflow-y-auto">
        {/* ✅ IMPROVED CLOSE BUTTON - Sticky header with better UX */}
        <div className="sticky top-0 z-20 bg-gradient-to-r from-[#1a1038] to-[#241a44] -mx-4 md:-mx-6 -mt-4 md:-mt-6 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between border-b border-purple-500/20 mb-6">
          <h3 className="text-white font-bold text-lg md:text-xl">
            Edit Result — {student?.name || "Student"}
          </h3>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 transition-all duration-200 border border-red-500/30 hover:border-red-500/50 hover:scale-110"
            title="Close"
          >
            <FaTimes className="text-xl md:text-2xl" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Student Information Section */}
          <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
            <h4 className="text-white font-bold mb-4 text-lg">
              Student Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <label className="text-xs text-white/90 mb-1 block">Name</label>
                <div className="w-full px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white">
                  {student?.name || "—"}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">
                  Class
                </label>
                <div className="w-full px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white">
                  {student?.className || student?.class || "—"}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">
                  Admission No
                </label>
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
                <label className="text-xs text-white/90 mb-1 block">
                  Session
                </label>
                <div className="w-full px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white">
                  {defaultSession}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">
                  Gender
                </label>
                <div className="w-full px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white">
                  {student?.gender || "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Academic Performance Summary */}
          <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
            <h4 className="text-white font-bold mb-4 text-lg">
              Academic Performance
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-white/90 mb-1 block">
                  No. in Class
                </label>
                <input
                  type="text"
                  value={noInClass}
                  readOnly
                  className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white opacity-90 cursor-not-allowed"
                />
                {isFetchingData && (
                  <div className="text-xs text-white/60 mt-1">
                    Loading from system...
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">
                  Total School Days
                </label>
                <input
                  type="text"
                  value={totalSchoolDays}
                  onChange={(e) => handleTotalSchoolDaysChange(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                  placeholder="e.g., 90"
                />
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">
                  Days Present
                </label>
                <input
                  type="text"
                  value={daysPresent}
                  readOnly
                  className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/40 border border-white/10 text-white opacity-90 cursor-not-allowed"
                />
                {isFetchingData && (
                  <div className="text-xs text-white/60 mt-1">
                    Loading from attendance...
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-white/90 mb-1 block">
                  Days Absent
                </label>
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

            <div className="mt-4 text-sm text-white/70">
              <p className="mb-2">
                <strong>Note:</strong>
                <span className="ml-1">
                  Days Present is loaded from the attendance system.
                </span>
              </p>
              <p>
                <span className="text-green-400">
                  ✓ Days Absent is automatically calculated.
                </span>
              </p>
            </div>
          </div>

          {/* Academic Subjects Section */}
          <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
            <h4 className="text-white font-bold mb-4 text-lg">
              Academic Subjects
            </h4>

            {subjects.length === 0 ? (
              <div className="text-center py-8 text-white/70">
                <p className="mb-2">No subjects configured for this student.</p>
                <p className="text-sm">
                  Please configure class subjects in the system or add subjects
                  manually.
                </p>
              </div>
            ) : (
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
                        onChange={(e) =>
                          updateSubject(i, "exam", e.target.value)
                        }
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
            )}
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
            <h4 className="text-white font-bold mb-4 text-lg">
              Class Position
            </h4>
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

          {/* ✅ Reports Section WITH SIGNATURES */}
          <div className="bg-[#2a2250] rounded-lg border border-white/10 p-4">
            <h4 className="text-white font-bold mb-4 text-lg">
              Reports & Signatures
            </h4>
            <div className="space-y-6">
              {/* Form Teacher Section */}
              <div className="border border-white/10 rounded-lg p-4 bg-[#362b68]/20">
                <h5 className="text-white font-semibold mb-3 text-sm">
                  Form Teacher
                </h5>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-white/90">
                        FORM TEACHER'S REPORT:
                      </label>
                      <button
                        onClick={() => generateAIReport("teacher")}
                        disabled={isGeneratingFTReport}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 rounded border border-purple-500/30 transition-colors disabled:opacity-50"
                      >
                        <FaMagic className={isGeneratingFTReport ? "animate-spin" : ""} />
                        {isGeneratingFTReport ? "Generating..." : "Auto AI Generate"}
                      </button>
                    </div>
                    <textarea
                      value={formTeacherReport}
                      onChange={(e) => setFormTeacherReport(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                      rows={3}
                      placeholder="Enter form teacher's report here..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        FORM TEACHER'S SIGNATURE:
                      </label>
                      <div className="flex flex-col gap-2">
                        {formTeacherSigPreview && (
                          <div className="relative w-32 h-16 rounded-lg overflow-hidden border-2 border-[#8055f7] bg-white p-1">
                            <img
                              src={formTeacherSigPreview}
                              alt="Form Teacher Signature"
                              className="w-full h-full object-contain"
                            />
                          </div>
                        )}

                        <label className="cursor-pointer">
                          <div className="flex items-center gap-2 border border-[#e7e2f8] rounded-lg px-4 py-2 bg-white/10 text-white hover:bg-white/20 transition text-sm">
                            <FaCamera className="text-[#8055f7]" />
                            <span>
                              {formTeacherSigPreview
                                ? "Change Signature"
                                : "Upload Signature"}
                            </span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFormTeacherSigChange}
                            className="hidden"
                            disabled={loading || isUploadingFormTeacherSig}
                          />
                        </label>

                        {isUploadingFormTeacherSig && (
                          <p className="text-xs text-white/70">
                            Processing signature...
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Principal Section */}
              <div className="border border-white/10 rounded-lg p-4 bg-[#362b68]/20">
                <h5 className="text-white font-semibold mb-3 text-sm">
                  Principal
                </h5>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-white/90">
                        PRINCIPAL'S REPORT:
                      </label>
                      <button
                        onClick={() => generateAIReport("principal")}
                        disabled={isGeneratingPReport}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 rounded border border-purple-500/30 transition-colors disabled:opacity-50"
                      >
                        <FaMagic className={isGeneratingPReport ? "animate-spin" : ""} />
                        {isGeneratingPReport ? "Generating..." : "Auto AI Generate"}
                      </button>
                    </div>
                    <textarea
                      value={principalReport}
                      onChange={(e) => setPrincipalReport(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                      rows={3}
                      placeholder="Enter principal's report here..."
                    />
                  </div>

                  <div>
                    <label className="text-xs text-white/90 mb-2 block">
                      PRINCIPAL'S SIGNATURE:
                    </label>
                    <div className="flex flex-col gap-2">
                      {principalSigPreview && (
                        <div className="relative w-32 h-16 rounded-lg overflow-hidden border-2 border-[#8055f7] bg-white p-1">
                          <img
                            src={principalSigPreview}
                            alt="Principal Signature"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}

                      <label className="cursor-pointer w-full md:w-auto">
                        <div className="flex items-center gap-2 border border-[#e7e2f8] rounded-lg px-4 py-2 bg-white/10 text-white hover:bg-white/20 transition text-sm">
                          <FaCamera className="text-[#8055f7]" />
                          <span>
                            {principalSigPreview
                              ? "Change Signature"
                              : "Upload Signature"}
                          </span>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePrincipalSigChange}
                          className="hidden"
                          disabled={loading || isUploadingPrincipalSig}
                        />
                      </label>

                      {isUploadingPrincipalSig && (
                        <p className="text-xs text-white/70">
                          Processing signature...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
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
