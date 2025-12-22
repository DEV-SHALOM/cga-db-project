// src/components/ClassSubjectsManager.jsx
import { useState, useEffect } from "react";
import { setSubjectsForClass } from "../hooks/useResults";

// List of all possible subjects for different classes
const ALL_SUBJECTS = [
  // Core Subjects
  "English Language/Lit",
  "Mathematics",
  "English Studies",
  "Quantitative Reasoning",
  "Verbal Reasoning",
  
  // Sciences
  "Basic Science",
  "Physics",
  "Chemistry",
  "Biology",
  "Agricultural Science",
  "Agric Science",
  
  // Social Sciences
  "Social Studies",
  "Literature",
  "Lit-English",
  "Civic Education",
  "Government",
  "History",
  "Geography",
  
   // Arts and Humanities
  "Creative Arts",
  "Cultural/Creative Arts",
  
  // Business and Technology
  "Business Studies",
  "Computer Studies",
  "Computer",
  
  // Religious Studies
  "Christian Religious Stud.",
   "C. R. S",
   "CRS",
  
  // Others
  "Home Economics",
  "Economics",
  "Marketing",
  "Physical / Health Edu.",
  "Handwriting",
  
  // Pre-School Subjects
  
];

/**
 * Props:
 * - className
 * - subjects (array) current
 * - availableSubjects (array) - optional custom list for this class
 * - onSaved callback
 */
export default function ClassSubjectsManager({ 
  className, 
  subjects = [], 
  availableSubjects = ALL_SUBJECTS,
  onSaved 
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(subjects.slice());
  const [saving, setSaving] = useState(false);
  const [availableList, setAvailableList] = useState(availableSubjects);
  const [customSubject, setCustomSubject] = useState("");

  useEffect(() => {
    setList(subjects.slice());
  }, [subjects]);

  function addSubject(subject = "") {
    if (!subject.trim()) return;
    if (list.includes(subject.trim())) {
      alert("Subject already exists in the list");
      return;
    }
    setList(prev => [...prev, subject.trim()]);
    setCustomSubject("");
  }

  function updateAt(i, v) {
    setList(prev => {
      const n = prev.slice();
      n[i] = v;
      return n;
    });
  }

  function removeAt(i) {
    setList(prev => prev.filter((_, idx) => idx !== i));
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && customSubject.trim()) {
      e.preventDefault();
      addSubject(customSubject);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const cleaned = list.map(s => String(s || "").trim()).filter(Boolean);
      await setSubjectsForClass(className, cleaned);
      onSaved && onSaved(cleaned);
      setOpen(false);
    } catch (e) {
      console.error(e);
      alert("Failed to save subjects: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  // Get filtered available subjects (remove already selected ones)
  const filteredAvailableSubjects = availableList.filter(
    subject => !list.includes(subject)
  );

  return (
    <>
      <button 
        onClick={() => { 
          setOpen(true); 
          setList(subjects.slice()); 
        }} 
        className="px-4 py-2 bg-gradient-to-r from-[#6C4AB6]/80 to-[#8D72E1]/80 text-white rounded-lg hover:opacity-90 transition-opacity"
      >
        Manage Subjects
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-gradient-to-tr from-[#1a1038] via-[#241a44] to-[#1b1740] p-6 rounded-2xl border border-purple-500/30 shadow-2xl shadow-purple-900/30 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="text-white font-bold text-xl">Manage Subjects</h4>
                <p className="text-white/70 text-sm mt-1">Class: {className}</p>
              </div>
              <button 
                onClick={() => setOpen(false)} 
                className="text-white/80 hover:text-white text-xl transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Add Subject Section */}
            <div className="mb-6 p-4 bg-[#2a2250] rounded-lg border border-white/10">
              <h5 className="text-white font-bold mb-3">Add New Subject</h5>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="text-xs text-white/90 mb-2 block">Select from existing subjects:</label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        addSubject(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="">Choose a subject...</option>
                    {filteredAvailableSubjects.map((subject, idx) => (
                      <option key={idx} value={subject}>{subject}</option>
                    ))}
                  </select>
                </div>
                <div className="text-white/60 text-sm text-center my-2 sm:my-0 sm:flex items-center">
                  <span className="hidden sm:inline">OR</span>
                  <span className="sm:hidden">- OR -</span>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-white/90 mb-2 block">Add custom subject:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="flex-1 px-3 py-2 rounded bg-[#362b68]/70 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                      placeholder="Enter custom subject name"
                    />
                    <button
                      onClick={() => addSubject(customSubject)}
                      disabled={!customSubject.trim()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Subject List */}
            <div className="mb-6">
              <h5 className="text-white font-bold mb-3">Current Subjects ({list.length})</h5>
              {list.length === 0 ? (
                <div className="text-center py-8 text-white/60 bg-[#2a2250]/50 rounded-lg border border-white/10">
                  No subjects added yet. Add subjects using the form above.
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {list.map((subject, i) => (
                    <div 
                      key={i} 
                      className="flex items-center gap-3 p-3 bg-[#362b68]/40 rounded-lg border border-white/10 hover:bg-[#362b68]/60 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="text-white/90 text-sm font-medium">{i + 1}.</span>
                          <div>
                            <span className="text-white font-medium">{subject}</span>
                            <div className="text-xs text-white/60 mt-1">
                              {availableList.includes(subject) ? 
                                "Predefined subject" : 
                                "Custom subject"}
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeAt(i)}
                        className="px-3 py-1.5 bg-red-600/80 hover:bg-red-700 text-red-500 text-sm rounded transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
              <div className="text-white/70 text-sm">
                {list.length} subject{list.length !== 1 ? 's' : ''} selected
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOpen(false)}
                  className="px-5 py-2.5 bg-[#362b68] hover:bg-[#3a2d70] text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#6C4AB6] to-[#8D72E1] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : "Save Subjects"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}