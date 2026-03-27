import { useState, useEffect } from "react";
import { collection, query, onSnapshot, where } from "firebase/firestore";
import { db } from "../firebase";
import { usePermission } from "../hooks/usePermission";
import { 
  MessageSquare, 
  Send, 
  Search, 
  User, 
  Phone, 
  FileText,
  ExternalLink,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Toast from "../components/Toast";

export default function ParentsPage() {
  const { user, isAdmin } = usePermission();
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("Hello, the student results for Chosen Generation Academy are now ready. You can access and print your child's result using this link: [LINK]");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, "students"), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(data);
    });
    return () => unsub();
  }, [user]);

  // Group students by parent phone
  const parentGroups = students.reduce((acc, student) => {
    const phone = student.parentPhone || "No Phone";
    if (!acc[phone]) acc[phone] = { phone, students: [] };
    acc[phone].students.push(student);
    return acc;
  }, {});

  const filteredGroups = Object.values(parentGroups).filter(group => 
    group.phone.includes(searchTerm) || 
    group.students.some(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getResultLink = (student) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/result-view?id=${student.studentId}&phone=${student.parentPhone}`;
  };

  const handleSendAutomatic = async (group) => {
    setSending(true);
    // In a real implementation, this would call your SMS API (e.g., Twilio)
    console.log(`Sending SMS to ${group.phone}...`);
    
    const studentLinks = group.students.map(s => `${s.name}: ${getResultLink(s)}`).join("\n");
    const fullMessage = message.replace("[LINK]", studentLinks);
    
    // Automation simulation
    setSending(false);
    showNotification(`Notification prepared for ${group.phone}!`, 'success');
  };

  const showNotification = (msg, type = 'success') => {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), 2500);
  };

  if (!isAdmin()) return <div className="p-8 text-white">Access Denied</div>;

  return (
    <div className="min-h-screen py-8 px-4 md:px-8 font-[Poppins]">
      <AnimatePresence>
        {status && (
          <Toast 
            message={status.msg} 
            type={status.type} 
            onClose={() => setStatus(null)} 
            duration={2500}
          />
        )}
      </AnimatePresence>
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Parent Communications</h1>
          <p className="text-white/60">Manage parent contacts and automate result notifications.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Message Template Section */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <MessageSquare size={20} />
                SMS Template
              </h2>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full h-40 bg-white/5 border border-white/10 rounded-xl p-4 text-white text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="Write your message here..."
              />
              <p className="text-xs text-white/40 mt-2">
                Use <code className="text-purple-400">[LINK]</code> as a placeholder for the result link.
              </p>
            </div>

            <div className="bg-purple-600/20 border border-purple-500/30 rounded-2xl p-6">
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                <CheckCircle size={18} />
                Bulk Automation
              </h3>
              <p className="text-sm text-white/70 mb-4">
                Send result notification to ALL {filteredGroups.length} unique parent contacts.
              </p>
              <button 
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                onClick={() => alert("Bulk sending feature coming soon!")}
              >
                <Send size={18} />
                Send All Notifications
              </button>
            </div>
          </div>

          {/* Parents List Section */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={20} />
              <input
                type="text"
                placeholder="Search parents or students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 pl-12 pr-4 text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="space-y-4">
              {filteredGroups.map(group => (
                <motion.div 
                  key={group.phone}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                        <Phone size={24} />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-lg">{group.phone}</h3>
                        <p className="text-white/50 text-sm">
                          {group.students.length} Student{group.students.length > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleSendAutomatic(group)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                      >
                        <Send size={16} />
                        Auto-Notify
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {group.students.map(student => (
                        <div key={student.id} className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5">
                          <div className="flex items-center gap-2">
                            <User size={14} className="text-purple-400" />
                            <span className="text-white text-sm font-medium">{student.name}</span>
                          </div>
                          <a 
                            href={getResultLink(student)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                            title="View Result Page"
                          >
                            <ExternalLink size={16} />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
