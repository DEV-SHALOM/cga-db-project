// src/pages/Students.jsx
// ✅ COMPLETE VERSION - Base64 passport photos + Full table with Edit/Delete buttons
import { useEffect, useMemo, useState } from "react";
import { FaChevronDown, FaPlus, FaEdit, FaTrash, FaCamera } from "react-icons/fa";
import { Listbox } from "@headlessui/react";
import { motion } from "framer-motion";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  doc,
  query,
  where,
  Timestamp,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

import { usePermission } from "../hooks/usePermission";

/* =========================================================
   Static options & helpers
   ========================================================= */

const genderOptions = [
  { id: "M", name: "Male" },
  { id: "F", name: "Female" },
];

const ENTRY_PERF_OPTIONS = [
  { id: "excellent", name: "Excellent" },
  { id: "good", name: "Good" },
  { id: "fair", name: "Fair" },
  { id: "poor", name: "Poor" },
];

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
const classOptions = allClasses.map((c) => ({ id: c, name: c }));

function formatDateStr(ts) {
  if (!ts) return "";
  if (ts === "nil") return "nil";
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB");
}
function toInputDateString(ts) {
  if (!ts) return "";
  if (ts === "nil") return "";
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
  return d.toISOString().substring(0, 10);
}
function displayEntryPerf(val) {
  if (!val) return "-";
  const opt = ENTRY_PERF_OPTIONS.find((o) => o.id === val);
  return opt ? opt.name : val;
}

/* =========================================================
   UI bits
   ========================================================= */

function Notification({ message }) {
  return (
    <div
      className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-8 py-3 rounded-xl shadow-2xl z-[9999] animate-pop-in"
      style={{
        animation:
          "pop-in 0.22s cubic-bezier(0.65,0,0.35,1), fade-out 0.8s 2.2s forwards",
      }}
    >
      {message}
      <style>{`
        @keyframes pop-in {
          0% { opacity: 0; transform: scale(0.8) translateX(-50%);}
          100% { opacity: 1; transform: scale(1) translateX(-50%);}
        }
        @keyframes fade-out {
          to { opacity: 0; transform: scale(0.96) translateX(-50%) translateY(-40px);}
        }
      `}</style>
    </div>
  );
}

function GlassListbox({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  disabled = false,
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${className}`}>
        <Listbox.Button
          className={`w-full bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 border border-[#e7e2f8] rounded-lg px-4 py-2 text-white font-medium flex justify-between items-center focus:outline-none ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {selected ? selected.name : placeholder || "Select..."}
          <FaChevronDown className="ml-2 text-white" />
        </Listbox.Button>
        <Listbox.Options className="absolute mt-1 w-full max-h-72 overflow-y-auto rounded-xl shadow-2xl bg-gradient-to-tr from-[#1e0447]/80 via-[#372772]/90 to-[#181A2A]/90 backdrop-blur-2xl border border-white/30 z-50">
          {options.map((option) => (
            <Listbox.Option
              key={option.id}
              value={option.id}
              className={({ active }) =>
                `cursor-pointer select-none px-6 py-3 text-base font-bold text-white drop-shadow ${
                  active ? "bg-[#8055f7]/40" : ""
                }`
              }
            >
              {option.name}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  );
}

/* =========================================================
   IDs helper
   ========================================================= */

async function generateStudentId() {
  const studentsSnap = await getDocs(collection(db, "students"));
  const usedNumbers = [];

  studentsSnap.forEach((d) => {
    const data = d.data();
    if (data.studentId && /^CGA\d{6}$/.test(data.studentId)) {
      const num = parseInt(data.studentId.slice(3), 10);
      usedNumbers.push(num);
    }
  });

  usedNumbers.sort((a, b) => a - b);

  let idNum = 1;
  for (let i = 0; i < usedNumbers.length; i++) {
    if (usedNumbers[i] > idNum) break;
    if (usedNumbers[i] === idNum) idNum++;
  }

  const newId = `CGA${String(idNum).padStart(6, "0")}`;
  return newId;
}

/* =========================================================
   Main Page
   ========================================================= */

export default function StudentsPage() {
  const { user, perm, hasSection, isAdmin } = usePermission();
  const canStudents = isAdmin() || hasSection("students");

  const [openSection, setOpenSection] = useState("");
  const [students, setStudents] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [activeClass, setActiveClass] = useState("");

  const [form, setForm] = useState({
    studentId: "",
    name: "",
    age: "",
    gender: "M",
    dateOfEntrance: "",
    dateOfLeaving: "",
    reasonForLeaving: "",
    parentPhone: "",
    entryPerformance: "",
    medicalHistoryOrFitness: "",
    passportPhotoBase64: "",
  });

  const [passportFile, setPassportFile] = useState(null);
  const [passportPreview, setPassportPreview] = useState(null);
  const [isUploadingPassport, setIsUploadingPassport] = useState(false);

  const [editId, setEditId] = useState(null);
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingIds, setDeletingIds] = useState({});
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    show: false,
    student: null,
  });

  useEffect(() => {
    if (!canStudents) return;

    const unsubscribes = [];
    allClasses.forEach((className) => {
      const qy = query(
        collection(db, "students"),
        where("className", "==", className)
      );
      const unsub = onSnapshot(qy, (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) => a.name.localeCompare(b.name));
        setStudents((prev) => ({
          ...prev,
          [className]: arr,
        }));
      });
      unsubscribes.push(unsub);
    });
    return () => {
      unsubscribes.forEach((unsub) => unsub && unsub());
    };
  }, [canStudents]);

  if (perm.loading) return null;
  if (!user)
    return (
      <div className="min-h-screen w-full py-6 px-2 sm:px-8 pb-24 text-white flex items-center justify-center">
        Please log in
      </div>
    );
  if (!canStudents)
    return (
      <div className="min-h-screen w-full py-6 px-2 sm:px-8 pb-24 text-white flex items-center justify-center">
        Unauthorized
      </div>
    );

  const resetForm = () => {
    setForm({
      studentId: "",
      name: "",
      age: "",
      gender: "M",
      dateOfEntrance: "",
      dateOfLeaving: "",
      reasonForLeaving: "",
      parentPhone: "",
      entryPerformance: "",
      medicalHistoryOrFitness: "",
      passportPhotoBase64: "",
    });
    setPassportFile(null);
    setPassportPreview(null);
  };

  const convertImageToBase64 = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onloadend = () => {
        const base64String = reader.result;
        const sizeInMB = (base64String.length * 0.75) / 1024 / 1024;
        if (sizeInMB > 0.9) {
          reject(new Error("Image too large. Please compress it or use a smaller image (max ~800KB)."));
          return;
        }
        resolve(base64String);
      };
      
      reader.onerror = () => {
        reject(new Error("Failed to read image file."));
      };
      
      reader.readAsDataURL(file);
    });
  };

  const handlePassportFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setNotification("Please select an image file (JPG, PNG, etc.)");
      setTimeout(() => setNotification(null), 2500);
      return;
    }

    if (file.size > 1.5 * 1024 * 1024) {
      setNotification("Image must be less than 1.5MB. Please compress it first.");
      setTimeout(() => setNotification(null), 2500);
      return;
    }

    setPassportFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPassportPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (
      !form.name ||
      !form.age ||
      !form.gender ||
      !activeClass ||
      !form.dateOfEntrance ||
      !form.entryPerformance
    ) {
      setNotification(
        "All fields except leaving date/reason are required. Don't forget entry performance."
      );
      setTimeout(() => setNotification(null), 2500);
      return;
    }

    setIsSubmitting(true);

    try {
      let newStudentId = form.studentId;
      if (!editId) {
        newStudentId = await generateStudentId();
      }

      let passportBase64 = form.passportPhotoBase64;
      if (passportFile) {
        try {
          setIsUploadingPassport(true);
          passportBase64 = await convertImageToBase64(passportFile);
        } catch (error) {
          setNotification(error.message);
          setTimeout(() => setNotification(null), 3500);
          setIsSubmitting(false);
          setIsUploadingPassport(false);
          return;
        } finally {
          setIsUploadingPassport(false);
        }
      }

      const payload = {
        studentId: newStudentId,
        name: form.name,
        age: form.age,
        gender: form.gender,
        className: activeClass,
        dateOfEntrance: Timestamp.fromDate(new Date(form.dateOfEntrance)),
        dateOfLeaving: form.dateOfLeaving
          ? Timestamp.fromDate(new Date(form.dateOfLeaving))
          : "nil",
        reasonForLeaving: form.reasonForLeaving || "nil",
        parentPhone: form.parentPhone || "nil",
        monthlyAttendance: 0,
        totalAttendance: 0,
        academicPerformanceAtEntryPoint: form.entryPerformance,
        medicalHistoryOrFitness: (form.medicalHistoryOrFitness || "").trim(),
        passportPhotoBase64: passportBase64 || "",
      };

      if (editId) {
        await updateDoc(doc(db, "students", editId), payload);
      } else {
        await addDoc(collection(db, "students"), payload);
      }

      setShowModal(false);
      setEditId(null);
      resetForm();
    } catch (err) {
      setNotification("Error saving student: " + err.message);
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (student) => {
    setShowModal(true);
    setActiveClass(student.className);
    setEditId(student.id);
    setForm({
      studentId: student.studentId || "",
      name: student.name || "",
      age: student.age || "",
      gender: student.gender || "M",
      dateOfEntrance: toInputDateString(student.dateOfEntrance),
      dateOfLeaving:
        student.dateOfLeaving && student.dateOfLeaving !== "nil"
          ? toInputDateString(student.dateOfLeaving)
          : "",
      reasonForLeaving:
        student.reasonForLeaving && student.reasonForLeaving !== "nil"
          ? student.reasonForLeaving
          : "",
      parentPhone:
        student.parentPhone && student.parentPhone !== "nil"
          ? student.parentPhone
          : "",
      entryPerformance: student.academicPerformanceAtEntryPoint || "",
      medicalHistoryOrFitness: student.medicalHistoryOrFitness || "",
      passportPhotoBase64: student.passportPhotoBase64 || "",
    });
    if (student.passportPhotoBase64) {
      setPassportPreview(student.passportPhotoBase64);
    }
  };

  const showDeleteConfirmation = (student) => {
    setDeleteConfirmation({
      show: true,
      student,
    });
  };

  const hideDeleteConfirmation = () => {
    setDeleteConfirmation({
      show: false,
      student: null,
    });
  };

  const handleDelete = async (id, studentId) => {
    if (deletingIds[id]) return;

    try {
      setDeletingIds((prev) => ({ ...prev, [id]: true }));
      hideDeleteConfirmation();

      const batch = writeBatch(db);
      batch.delete(doc(db, "students", id));

      const feesQuery = query(
        collection(db, "payments"),
        where("studentId", "==", studentId)
      );
      const feesSnapshot = await getDocs(feesQuery);
      feesSnapshot.forEach((d) => {
        batch.delete(d.ref);
      });

      const attendanceQuery = query(collection(db, "dailyAttendance"));
      const attendanceSnapshot = await getDocs(attendanceQuery);

      let attendanceBatch = writeBatch(db);
      let batchCount = 0;

      for (const d of attendanceSnapshot.docs) {
        const records = d.data().records || {};
        if (records[id]) {
          const docRef = d.ref;
          delete records[id];

          if (Object.keys(records).length === 0) {
            attendanceBatch.delete(docRef);
          } else {
            attendanceBatch.update(docRef, { records });
          }

          batchCount++;

          if (batchCount === 500) {
            await attendanceBatch.commit();
            batchCount = 0;
            attendanceBatch = writeBatch(db);
          }
        }
      }

      if (batchCount > 0) {
        await attendanceBatch.commit();
      }

      await batch.commit();
    } catch (err) {
      console.error("Error deleting student and related records:", err);
      setNotification(
        "Error deleting student and related records: " + err.message
      );
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setDeletingIds((prev) => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen w-full py-6 px-2 sm:px-8 pb-24"
    >
      {notification && <Notification message={notification} />}

      <div className="max-w-7xl mx-auto font-[Poppins]">
        <motion.h2
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="font-extrabold text-4xl sm:text-5xl text-white mb-6 text-center drop-shadow-lg tracking-wide"
        >
          Student Management
        </motion.h2>

        <div className="space-y-8">
          {classStructure.map((section) => {
            const sectionStudents = section.classes.reduce(
              (total, className) => {
                return total + (students[className]?.length || 0);
              },
              0
            );

            return (
              <motion.div
                key={section.section}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="rounded-2xl bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl shadow-2xl border border-white/30 p-6 transition-all"
              >
                <button
                  className={`flex items-center w-full justify-between px-4 py-3 rounded-xl text-2xl font-bold text-white
                    ${
                      openSection === section.section
                        ? "bg-[#1e007273] backdrop-blur-lg shadow-xl"
                        : ""
                    }
                    hover:bg-white/20 hover:backdrop-blur-lg focus:outline-none transition mb-2`}
                  onClick={() =>
                    setOpenSection(
                      openSection === section.section ? "" : section.section
                    )
                  }
                  style={{
                    boxShadow:
                      openSection === section.section
                        ? "0 6px 32px 0 rgba(56, 26, 112, 0.16)"
                        : undefined,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="tracking-wide">{section.section}</span>
                    <span className="text-sm bg-[#6C4AB6] text-white px-2 py-1 rounded-full">
                      {sectionStudents}{" "}
                      {sectionStudents === 1 ? "student" : "students"}
                    </span>
                  </div>
                  <FaChevronDown
                    className={`ml-2 transition-transform ${
                      openSection === section.section ? "rotate-180" : ""
                    }`}
                  />
                </button>

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
                    {section.classes.map((className) => (
                      <StudentSectionTable
                        key={className}
                        className={className}
                        students={students[className] || []}
                        onAdd={
                          canStudents
                            ? () => {
                                setShowModal(true);
                                setActiveClass(className);
                                setEditId(null);
                                resetForm();
                              }
                            : null
                        }
                        onEdit={canStudents ? handleEdit : null}
                        onDelete={canStudents ? showDeleteConfirmation : null}
                        deletingIds={deletingIds}
                      />
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto custom-scroll"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-[95vw] sm:max-w-md bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl p-6 rounded-2xl shadow-2xl border border-white/30"
            >
              <h3 className="font-bold text-xl mb-4 text-[#ffffff]">
                {editId ? "Edit" : "Add"} Student
              </h3>
              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-2 custom-scroll"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white mb-1">
                      Student ID
                    </label>
                    <input
                      type="text"
                      value={form.studentId}
                      readOnly
                      disabled
                      className="border border-[#e7e2f8] rounded-lg px-4 py-2 bg-white/20 text-white w-full font-semibold cursor-not-allowed text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white mb-1">
                      Class
                    </label>
                    <GlassListbox
                      value={activeClass}
                      onChange={setActiveClass}
                      options={classOptions}
                      placeholder="Select class"
                      className="text-sm"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="border border-[#e7e2f8] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#8055f7] bg-white/10 text-white w-full text-sm"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-xs text-white mb-1">
                    Passport Photo (max 1MB)
                  </label>
                  <div className="flex flex-col gap-2">
                    {passportPreview && (
                      <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-[#8055f7]">
                        <img
                          src={passportPreview}
                          alt="Passport preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    
                    <label className="cursor-pointer">
                      <div className="flex items-center gap-2 border border-[#e7e2f8] rounded-lg px-4 py-2 bg-white/10 text-white hover:bg-white/20 transition text-sm">
                        <FaCamera className="text-[#8055f7]" />
                        <span>
                          {passportPreview ? "Change Photo" : "Upload Photo"}
                        </span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePassportFileChange}
                        className="hidden"
                        disabled={isSubmitting || isUploadingPassport}
                      />
                    </label>
                    
                    {passportFile && (
                      <p className="text-xs text-white/70">
                        Selected: {passportFile.name}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white mb-1">Age</label>
                    <input
                      type="number"
                      placeholder="Age"
                      value={form.age}
                      min={1}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, age: e.target.value }))
                      }
                      className="border border-[#e7e2f8] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#8055f7] bg-white/10 text-white w-full text-sm"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white mb-1">
                      Gender
                    </label>
                    <GlassListbox
                      value={form.gender}
                      onChange={(val) =>
                        setForm((f) => ({ ...f, gender: val }))
                      }
                      options={genderOptions}
                      placeholder="Select Gender"
                      className="text-sm"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white mb-1">
                    Academic performance at entry point
                  </label>
                  <GlassListbox
                    value={form.entryPerformance}
                    onChange={(val) =>
                      setForm((f) => ({ ...f, entryPerformance: val }))
                    }
                    options={ENTRY_PERF_OPTIONS}
                    placeholder="Select performance"
                    className="text-sm"
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-xs text-white mb-1">
                    Medical history / fitness
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g., asthma (inhaler), no known allergies, cleared for sports..."
                    value={form.medicalHistoryOrFitness}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        medicalHistoryOrFitness: e.target.value,
                      }))
                    }
                    className="border border-[#e7e2f8] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#8055f7] bg-white/10 text-white w-full text-sm"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white mb-1">
                      Date of Entrance
                    </label>
                    <input
                      type="date"
                      value={form.dateOfEntrance}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dateOfEntrance: e.target.value,
                        }))
                      }
                      className="border border-[#e7e2f8] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#8055f7] bg-white/10 text-white w-full text-sm"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white mb-1">
                      Parent/Guardian Nō
                    </label>
                    <input
                      type="tel"
                      placeholder="Phone number"
                      value={form.parentPhone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, parentPhone: e.target.value }))
                      }
                      className="border border-[#e7e2f8] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#8055f7] bg-white/10 text-white w-full text-sm"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white mb-1">
                      Date of Leaving
                    </label>
                    <input
                      type="date"
                      value={form.dateOfLeaving}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dateOfLeaving: e.target.value,
                        }))
                      }
                      className="border border-[#e7e2f8] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#8055f7] bg-white/10 text-white w-full text-sm"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white mb-1">
                      Reason for Leaving
                    </label>
                    <input
                      type="text"
                      placeholder="Reason"
                      value={form.reasonForLeaving}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          reasonForLeaving: e.target.value,
                        }))
                      }
                      className="border border-[#e7e2f8] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#8055f7] bg-white/10 text-white w-full text-sm"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="flex gap-3 justify-end mt-4">
                  <button
                    type="button"
                    className="px-4 py-1.5 bg-gray-100 text-red-500 rounded-lg hover:bg-gray-200 transition text-sm disabled:opacity-50"
                    onClick={() => {
                      setShowModal(false);
                      setEditId(null);
                      resetForm();
                    }}
                    disabled={isSubmitting || isUploadingPassport}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-1.5 bg-[#6C4AB6] text-white font-semibold rounded-lg hover:bg-[#8055f7] transition text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"
                    disabled={isSubmitting || isUploadingPassport}
                  >
                    {isSubmitting || isUploadingPassport ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                        {isUploadingPassport
                          ? "Processing..."
                          : editId
                          ? "Updating..."
                          : "Adding..."}
                      </>
                    ) : editId ? (
                      "Update"
                    ) : (
                      "Add"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {deleteConfirmation.show && (
          <DeleteConfirmationModal
            student={deleteConfirmation.student}
            onConfirm={() =>
              handleDelete(
                deleteConfirmation.student.id,
                deleteConfirmation.student.studentId
              )
            }
            onCancel={hideDeleteConfirmation}
            isDeleting={deletingIds[deleteConfirmation.student.id]}
          />
        )}
      </div>

      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 8px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(128, 85, 247, 0.35);
          border-radius: 9999px;
          border: 2px solid rgba(255,255,255,0.15);
        }
        .custom-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(128, 85, 247, 0.55);
        }
        .custom-scroll { scrollbar-width: thin; scrollbar-color: rgba(128,85,247,0.55) transparent; }
      `}</style>
    </motion.div>
  );
}

function DeleteConfirmationModal({ student, onConfirm, onCancel, isDeleting }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[999] p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[95vw] sm:max-w-md bg-gradient-to-tr from-white/10 via-[#3e1c7c]/20 to-[#372772]/20 backdrop-blur-2xl p-6 rounded-2xl shadow-2xl border border-white/30"
      >
        <div className="mb-6">
          <p className="text-white">
            Are you sure you want to delete{" "}
            <span className="font-semibold">{student?.name}</span> (ID:{" "}
            {student?.studentId})?
          </p>
          <p className="text-red-300 mt-2 text-sm">
            This will permanently delete all student records including
            attendance, payments, and passport photo.
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            className="px-4 py-1.5 bg-gray-100 text-white rounded-lg hover:bg-gray-200 transition text-sm disabled:opacity-50"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-5 py-1.5 bg-red-600 text-red-500 font-semibold rounded-lg hover:bg-red-700 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ✅ COMPLETE TABLE COMPONENT - Shows all students with Edit/Delete buttons
function StudentSectionTable({
  className,
  students,
  onAdd,
  onEdit,
  onDelete,
  deletingIds,
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students || [];
    return (students || []).filter((s) => {
      const name = String(s.name || "").toLowerCase();
      const id = String(s.studentId || "").toLowerCase();
      const phone = String(s.parentPhone || "").toLowerCase();
      return (
        name.includes(q) ||
        id.includes(q) ||
        (phone && phone.includes(q))
      );
    });
  }, [students, search]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl backdrop-blur-2xl shadow-xl border border-white/20 p-4 sm:p-6 flex flex-col min-h-[250px] transition hover:shadow-2xl mb-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg sm:text-xl font-bold text-white tracking-wide">
            {className}
          </span>
          <span className="text-sm bg-[#6C4AB6] text-white px-2 py-1 rounded-full">
            {filtered.length} / {students.length}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students (name, ID, phone)"
              className="w-full sm:w-72 border border-[#e7e2f8] rounded-lg px-3 py-2 bg-white/10 text-white text-sm placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-[#8055f7]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-xs"
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>

          {onAdd && (
            <button
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[#6C4AB6] text-white font-semibold hover:bg-[#8055f7] shadow-lg whitespace-nowrap"
              onClick={onAdd}
            >
              <FaPlus /> Add Student
            </button>
          )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block w-full overflow-x-auto custom-scroll">
        <div className="min-w-full rounded-xl shadow-inner backdrop-blur-sm">
          <table className="w-full text-sm rounded-xl">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gradient-to-r from-[#1e0447]/90 to-[#372772]/90 backdrop-blur-sm">
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  ID
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left">
                  Name
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  Age
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  Gender
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  Parent/Guardian Nō
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  Entrance
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  Entry Perf.
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left">
                  Medical / Fitness
                </th>
                <th className="px-3 py-2 font-semibold text-[#cfcfcf] text-left whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {(filtered || []).map((s) => (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="even:bg-white/10"
                >
                  <td className="px-3 py-2 text-[#ffffff] whitespace-nowrap text-sm">
                    {s.studentId}
                  </td>
                  <td className="px-3 py-2 text-[#ffffff] max-w-[150px] truncate text-sm">
                    {s.name}
                  </td>
                  <td className="px-3 py-2 text-[#ffffff] whitespace-nowrap text-sm">
                    {s.age}
                  </td>
                  <td className="px-3 py-2 text-[#ffffff] whitespace-nowrap text-sm">
                    {s.gender === "M" ? "Male" : "Female"}
                  </td>
                  <td className="px-3 py-2 text-[#ffffff] whitespace-nowrap text-sm">
                    {s.parentPhone && s.parentPhone !== "nil"
                      ? s.parentPhone
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-[#ffffff] whitespace-nowrap text-sm">
                    {formatDateStr(s.dateOfEntrance)}
                  </td>
                  <td className="px-3 py-2 text-[#ffffff] whitespace-nowrap text-sm capitalize">
                    {displayEntryPerf(s.academicPerformanceAtEntryPoint)}
                  </td>
                  <td
                    className="px-3 py-2 text-[#ffffff] text-sm max-w-[280px] truncate"
                    title={s.medicalHistoryOrFitness || ""}
                  >
                    {s.medicalHistoryOrFitness || "-"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {onEdit || onDelete ? (
                      <div className="flex gap-2">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(s)}
                            className="p-1.5 rounded-lg hover:bg-[#8055f7]/10 text-white disabled:opacity-50"
                            title="Edit"
                            disabled={deletingIds[s.id]}
                          >
                            <FaEdit size={14} />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(s)}
                            className="flex items-center justify-center p-1.5 rounded-lg hover:bg-red-100 text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete"
                            disabled={deletingIds[s.id]}
                          >
                            <FaTrash size={14} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-white/50 text-xs">—</span>
                    )}
                  </td>
                </motion.tr>
              ))}
              {(filtered || []).length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center py-8 text-[#ffffff] font-semibold text-sm"
                  >
                    {students.length === 0
                      ? "No students yet"
                      : "No matches for your search"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {(filtered || []).map((s) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white/5 rounded-lg p-4 border border-white/10"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-white text-sm">{s.name}</h3>
                <p className="text-xs text-white/80">{s.studentId}</p>
              </div>
              <div className="flex gap-2">
                {onEdit && (
                  <button
                    onClick={() => onEdit(s)}
                    className="p-1.5 rounded-lg hover:bg-[#8055f7]/10 text-white disabled:opacity-50"
                    title="Edit"
                    disabled={deletingIds[s.id]}
                  >
                    <FaEdit size={12} />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(s)}
                    className="flex items-center justify-center p-1.5 rounded-lg hover:bg-red-100 text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete"
                    disabled={deletingIds[s.id]}
                  >
                    <FaTrash size={12} />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-white/60">Age</p>
                <p className="text-white">{s.age}</p>
              </div>
              <div>
                <p className="text-white/60">Gender</p>
                <p className="text-white">
                  {s.gender === "M" ? "Male" : "Female"}
                </p>
              </div>
              <div>
                <p className="text-white/60">Parent Phone</p>
                <p className="text-white">
                  {s.parentPhone && s.parentPhone !== "nil"
                    ? s.parentPhone
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-white/60">Entrance</p>
                <p className="text-white">{formatDateStr(s.dateOfEntrance)}</p>
              </div>
              <div>
                <p className="text-white/60">Entry Perf.</p>
                <p className="text-white">
                  {displayEntryPerf(s.academicPerformanceAtEntryPoint)}
                </p>
              </div>
            </div>
            {s.medicalHistoryOrFitness && (
              <div className="mt-2">
                <p className="text-white/60 text-xs">Medical / Fitness</p>
                <p className="text-white text-xs">
                  {s.medicalHistoryOrFitness}
                </p>
              </div>
            )}
            {s.dateOfLeaving && s.dateOfLeaving !== "nil" && (
              <div className="mt-2">
                <p className="text-white/60 text-xs">Left</p>
                <p className="text-white">{formatDateStr(s.dateOfLeaving)}</p>
              </div>
            )}
            {s.reasonForLeaving && s.reasonForLeaving !== "nil" && (
              <div className="mt-2">
                <p className="text-white/60 text-xs">Reason for Leaving</p>
                <p className="text-white text-xs">{s.reasonForLeaving}</p>
              </div>
            )}
          </motion.div>
        ))}
        {(filtered || []).length === 0 && (
          <div className="text-center py-8 text-[#ffffff] font-semibold text-sm">
            {students.length === 0 ? "No students yet" : "No matches for your search"}
          </div>
        )}
      </div>
    </motion.div>
  );
}