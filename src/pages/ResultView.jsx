import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { FileText, Download, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { generateStudentResultPDF } from "../reports/generateStudentResultPDF";
import { motion, AnimatePresence } from "framer-motion";

function FloatingShapes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        className="absolute left-10 top-1/4 w-24 h-24 opacity-20 animate-float"
        viewBox="0 0 200 200"
      >
        <path
          d="M50,100 Q100,50 150,100 T250,100"
          fill="none"
          stroke="#D6C7FF"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>
      <svg
        className="absolute right-8 bottom-1/3 w-20 h-20 opacity-20 animate-float-delay"
        viewBox="0 0 200 200"
      >
        <circle cx="100" cy="100" r="40" fill="#6C4AB6" fillOpacity="0.3" />
      </svg>
      <svg
        className="absolute left-0 top-0 w-32 h-32 opacity-10"
        viewBox="0 0 100 100"
      >
        <path d="M0,0 L100,0 L0,100 Z" fill="#D6C7FF" />
      </svg>
    </div>
  );
}

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

        const qTerm = query(collection(db, "terms"), where("isActive", "==", true));
        const termSnap = await getDocs(qTerm);
        if (!termSnap.empty) {
          setActiveTerm({ id: termSnap.docs[0].id, ...termSnap.docs[0].data() });
          
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
      const formattedResults = results.map(r => ({
        subject: r.subjectId, 
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
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1c0450] via-[#8055f7] to-[#2a0c6e] text-white p-6">
        <Loader2 className="animate-spin mb-4 text-[#D6C7FF]" size={48} />
        <p className="text-xl font-medium tracking-wide">Verifying Credentials...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1c0450] via-[#8055f7] to-[#2a0c6e] text-white p-6 text-center">
        <FloatingShapes />
        <div className="relative z-10 w-full max-w-md p-8 rounded-3xl bg-[#030a3354] border border-white/50 backdrop-blur-lg shadow-2xl">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center text-red-400 mx-auto mb-6 border border-red-500/30">
            <AlertCircle size={40} />
          </div>
          <h1 className="text-2xl font-extrabold mb-4 tracking-tight">Authentication Failed</h1>
          <p className="text-white/70 leading-relaxed mb-6">{error}</p>
          <div className="text-xs text-white/30 uppercase tracking-[0.2em] font-bold">Chosen Generation Academy</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center min-h-screen w-screen bg-gradient-to-br from-[#1c0450] via-[#8055f7] to-[#2a0c6e] px-4 sm:px-8 overflow-y-auto font-[Poppins]">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes float-delay {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(-5deg); }
        }
      `}</style>

      <FloatingShapes />

      <div className="relative flex flex-col md:flex-row items-center justify-center w-full max-w-4xl min-h-[600px] md:min-h-[550px] rounded-3xl bg-[#030a334d] border border-white/30 shadow-2xl backdrop-blur-2xl mx-2 my-6 sm:my-10 p-6 sm:p-10 gap-8 md:gap-0 overflow-hidden">
        
        {/* Left Side - Branding (Matches Login) */}
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center md:justify-end mb-6 md:mb-0 pr-0 md:pr-10 relative z-10">
          <div className="w-32 h-32 mb-6 rounded-full flex items-center justify-center bg-[#030a33c0] border-2 border-[#6C4AB6] shadow-lg">
            <img
              className="w-28 h-28 rounded-full object-cover"
              src="https://static.vecteezy.com/system/resources/thumbnails/008/040/410/small_2x/school-logo-design-template-free-vector.jpg"
              alt="School Logo"
            />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl text-white font-extrabold text-center md:text-left leading-tight">
            Chosen <br /> Generation <br /> Academy
          </h1>
        </div>

        {/* Right Side - Portal Content (Matches Login Card Style) */}
        <div className="relative z-10 w-full md:w-1/2 max-w-md mx-auto p-6 sm:p-8 rounded-2xl shadow-2xl bg-[#030a3354] border border-white/50 backdrop-blur-lg">
          <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full bg-gradient-to-r from-[#6C4AB6] to-[#D6C7FF] flex items-center justify-center shadow-lg">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>

          <h2 className="text-center text-white font-bold text-xl mb-8 tracking-wide">
            Result Portal
          </h2>

          <div className="space-y-6">
            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="w-12 h-12 rounded-xl bg-[#6C4AB6]/20 flex items-center justify-center border border-[#6C4AB6]/30">
                <FileText className="text-[#D6C7FF]" size={24} />
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold mb-0.5">Student Name</p>
                <p className="text-lg font-bold text-white leading-tight">{student.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center border border-green-500/20">
                <ShieldCheck className="text-green-400" size={24} />
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold mb-0.5">Academic Term</p>
                <p className="text-lg font-bold text-white leading-tight">{activeTerm?.termName} <span className="text-white/40 text-sm">{activeTerm?.academicYear}</span></p>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-white/20">
            <button 
              onClick={handleDownload}
              disabled={results.length === 0}
              className={`w-full py-4 rounded-xl bg-gradient-to-r from-[#6C4AB6] to-[#9D79EE] text-white font-bold text-lg hover:opacity-90 shadow-xl shadow-[#6C4AB6]/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98] ${
                results.length === 0 ? "opacity-50 grayscale cursor-not-allowed" : ""
              }`}
            >
              <Download size={22} />
              Download Result
            </button>
            
            {results.length === 0 && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-xs justify-center">
                <AlertCircle size={14} />
                <span>Results not yet uploaded for this term.</span>
              </div>
            )}
          </div>
          
          <div className="mt-8 text-center">
            <p className="text-[10px] text-white/30 uppercase tracking-[0.15em] font-medium">
              Securely Generated by CGA Portal
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
