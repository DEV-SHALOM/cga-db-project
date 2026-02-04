import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { FileText, Download, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { generateStudentResultPDF } from "../reports/generateStudentResultPDF";

export default function ResultView() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [student, setStudent] = useState(null);
  const [results, setResults] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);

  const studentId = searchParams.get("id");
  const phone = searchParams.get("phone");

  useEffect(() => {
    async function verifyAndFetch() {
      if (!studentId || !phone) {
        setError("Invalid link. Please use the link sent to your phone.");
        setLoading(false);
        return;
      }

      try {
        // 1. Verify student and phone
        const qStudent = query(
          collection(db, "students"), 
          where("studentId", "==", studentId),
          where("parentPhone", "==", phone)
        );
        const studentSnap = await getDocs(qStudent);

        if (studentSnap.empty) {
          setError("Student not found or phone number does not match our records.");
          setLoading(false);
          return;
        }

        const studentData = { id: studentSnap.docs[0].id, ...studentSnap.docs[0].data() };
        setStudent(studentData);

        // 2. Fetch active term
        const qTerm = query(collection(db, "terms"), where("isActive", "==", true));
        const termSnap = await getDocs(qTerm);
        if (!termSnap.empty) {
          setActiveTerm({ id: termSnap.docs[0].id, ...termSnap.docs[0].data() });
          
          // 3. Fetch results for this student and term
          const qResults = query(
            collection(db, "results"),
            where("studentId", "==", studentData.id),
            where("termId", "==", termSnap.docs[0].id)
          );
          const resultsSnap = await getDocs(qResults);
          setResults(resultsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }

      } catch (err) {
        console.error(err);
        setError("An error occurred while fetching the results.");
      } finally {
        setLoading(false);
      }
    }

    verifyAndFetch();
  }, [studentId, phone]);

  const handleDownload = async () => {
    if (!student || !activeTerm || results.length === 0) return;
    try {
      // Map results for the PDF generator
      const formattedResults = results.map(r => ({
        subject: r.subjectId, // Assuming subjectId is the name or we'd need a lookup
        test: r.testScore || 0,
        exam: r.examScore || 0,
        total: (r.testScore || 0) + (r.examScore || 0)
      }));

      generateStudentResultPDF(student, formattedResults, activeTerm);
    } catch (err) {
      alert("Failed to generate PDF. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f042e] flex flex-col items-center justify-center text-white p-6">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="text-xl font-medium">Verifying Credentials...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0f042e] flex flex-col items-center justify-center text-white p-6 text-center">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 mb-6">
          <AlertCircle size={40} />
        </div>
        <h1 className="text-2xl font-bold mb-2">Authentication Failed</h1>
        <p className="text-white/60 max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f042e] text-white p-6 font-[Poppins]">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-10">
          <div className="w-24 h-24 bg-purple-600 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-2xl shadow-purple-500/20">
            <ShieldCheck size={48} />
          </div>
          <h1 className="text-3xl font-extrabold mb-2">Result Portal</h1>
          <p className="text-white/40">Secure verification successful</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl mb-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                <FileText className="text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Student Name</p>
                <p className="text-xl font-bold">{student.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                <ShieldCheck className="text-green-400" size={20} />
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Academic Term</p>
                <p className="text-lg font-bold">{activeTerm?.termName} {activeTerm?.academicYear}</p>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-8 border-t border-white/10">
            <button 
              onClick={handleDownload}
              disabled={results.length === 0}
              className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-white/10 disabled:text-white/20 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-xl shadow-purple-600/20 active:scale-95"
            >
              <Download size={24} />
              Download Result (PDF)
            </button>
            {results.length === 0 && (
              <p className="text-center text-rose-400 text-sm mt-4">
                Results have not been uploaded for this term yet.
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-white/20 text-xs">
          © 2026 Chosen Generation Academy. Secure Portal.
        </p>
      </div>
    </div>
  );
}
