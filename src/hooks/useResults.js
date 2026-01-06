// src/hooks/useResults.js
// ✅ UPDATED WITH SIGNATURE PERSISTENCE (Base64)
import { useEffect, useState, useMemo } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  setDoc,
  addDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Hook responsibilities:
 * - load students grouped by class
 * - load class subjects (classSubjects collection)
 * - load results for active term
 * - provide helpers to save results and compute attendance
 * - ✅ NEW: Save and load signatures (Base64)
 */

export function useStudentsByClass() {
  const [studentsByClass, setStudentsByClass] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "students"), (snap) => {
      const byClass = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        const cls = data.className || "Unassigned";
        if (!byClass[cls]) byClass[cls] = [];
        byClass[cls].push({ id: d.id, ...data });
      });
      // sort names in each class
      Object.keys(byClass).forEach((k) =>
        byClass[k].sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      );
      setStudentsByClass(byClass);
    });
    return () => unsub();
  }, []);
  return studentsByClass;
}

export function useClassSubjects() {
  // classSubjects collection, doc id = className (safe)
  const [classSubjects, setClassSubjects] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "classSubjects"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[d.id] = data.subjects || [];
      });
      setClassSubjects(map);
    });
    return () => unsub();
  }, []);
  return classSubjects;
}

export function useResultsForTerm(termId) {
  const [resultsMap, setResultsMap] = useState({});
  useEffect(() => {
    if (!termId) {
      setResultsMap({});
      return;
    }
    const q = query(collection(db, "results"), where("termId", "==", termId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const m = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          m[d.id] = { id: d.id, ...data };
          
          // ✅ Log signature presence for debugging
          if (data.formTeacherSignature || data.principalSignature) {
            console.log(`📋 Result ${d.id}:`, {
              hasFormTeacherSig: !!data.formTeacherSignature,
              hasPrincipalSig: !!data.principalSignature,
            });
          }
        });
        setResultsMap(m);
      },
      (err) => {
        console.error("results listen failed", err);
        setResultsMap({});
      }
    );
    return () => unsub();
  }, [termId]);
  return resultsMap;
}

// get attendance days for a student across dailyAttendance collection
export async function getStudentPresentDays(studentId, startKey=null, endKey=null) {
  // This function will read all dailyAttendance docs and count 'present' entries for the student
  // If you want a date range, you can pass startKey/endKey (YYYY-M-D format)
  const snap = await getDocs(collection(db, "dailyAttendance"));
  let count = 0;
  snap.forEach((d) => {
    const id = d.id;
    if (startKey && id < startKey) return;
    if (endKey && id > endKey) return;
    const data = d.data() || {};
    const records = data.records || {};
    const rec = records[studentId];
    if (rec && rec.status === "present") count += 1;
  });
  return count;
}

// ✅ UPDATED: save or update results document WITH ALL FIELDS INCLUDING SIGNATURES
export async function saveStudentResult(termId, studentId, className, payload) {
  // payload should include subjects array [{name, test, exam, total, grade, point}, ...], 
  // total, percentage, promoted
  // ✅ NEW: Also includes formTeacherSignature, principalSignature (Base64)
  
  try {
    console.log("💾 Saving result to Firebase...");
    console.log("- Term ID:", termId);
    console.log("- Student ID:", studentId);
    console.log("- Class:", className);
    
    const docId = `${termId}_${studentId}`;
    const ref = doc(db, "results", docId);
    
    // ✅ Build complete data object with ALL fields
    const data = {
      termId,
      studentId,
      className,
      
      // Academic data
      subjects: payload.subjects || [],
      total: payload.total || 0,
      percentage: payload.percentage || 0,
      overallGrade: payload.overallGrade || "",
      avgPoint: payload.avgPoint || 0,
      passed: payload.passed || false,
      promoted: payload.promoted || false,
      
      // Behavioral traits
      behavioralTraits: payload.behavioralTraits || [],
      
      // Reports
      formTeacherReport: payload.formTeacherReport || "",
      formTeacherName: payload.formTeacherName || "",
      principalReport: payload.principalReport || "",
      
      // ✅ SIGNATURES (Base64 strings)
      formTeacherSignature: payload.formTeacherSignature || "",
      principalSignature: payload.principalSignature || "",
      
      // Attendance & Class Info
      classPosition: payload.classPosition || "",
      noInClass: payload.noInClass || "",
      totalSchoolDays: payload.totalSchoolDays || "",
      daysPresent: payload.daysPresent || "",
      daysAbsent: payload.daysAbsent || "",
      
      // Metadata
      session: payload.session || "",
      term: payload.term || "",
      preparedBy: payload.preparedBy || "Admin",
      updatedAt: payload.updatedAt || Timestamp.now(),
      createdAt: payload.createdAt || Timestamp.now(),
    };

    // ✅ Log what's being saved (for debugging)
    console.log("📝 Saving data:");
    console.log("  - Subjects:", data.subjects.length);
    console.log("  - Behavioral Traits:", data.behavioralTraits.length);
    console.log("  - Form Teacher Report:", data.formTeacherReport ? "✅" : "❌");
    console.log("  - Form Teacher Name:", data.formTeacherName || "Not set");
    console.log("  - Form Teacher Signature:", data.formTeacherSignature 
      ? `✅ (${Math.round(data.formTeacherSignature.length / 1024)}KB)` 
      : "❌ Not set");
    console.log("  - Principal Report:", data.principalReport ? "✅" : "❌");
    console.log("  - Principal Signature:", data.principalSignature 
      ? `✅ (${Math.round(data.principalSignature.length / 1024)}KB)` 
      : "❌ Not set");
    console.log("  - Class Position:", data.classPosition || "Not set");
    console.log("  - Attendance:", {
      total: data.totalSchoolDays,
      present: data.daysPresent,
      absent: data.daysAbsent
    });
    
    // Use setDoc merge to create/update
    await setDoc(ref, data, { merge: true });
    
    console.log("✅ Result saved successfully!");
    return { id: docId, ...data };
    
  } catch (error) {
    console.error("❌ Error saving result:", error);
    throw error;
  }
}

// ✅ NEW: Get a single student's result (useful for editing)
export async function getStudentResult(termId, studentId) {
  try {
    console.log("📖 Loading result from Firebase...");
    console.log("- Term ID:", termId);
    console.log("- Student ID:", studentId);
    
    const docId = `${termId}_${studentId}`;
    const ref = doc(db, "results", docId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      console.log("✅ Result found!");
      console.log("  - Subjects:", data.subjects?.length || 0);
      console.log("  - Form Teacher Signature:", data.formTeacherSignature ? "✅ Loaded" : "❌ Not found");
      console.log("  - Principal Signature:", data.principalSignature ? "✅ Loaded" : "❌ Not found");
      
      return {
        id: snap.id,
        ...data,
      };
    } else {
      console.log("⚠️ No result found for this student and term");
      return null;
    }
  } catch (error) {
    console.error("❌ Error loading result:", error);
    throw error;
  }
}

// create or update class subjects doc
export async function setSubjectsForClass(className, subjects = []) {
  if (!className) throw new Error("className required");
  const id = className;
  const ref = doc(db, "classSubjects", id);
  await setDoc(ref, { subjects }, { merge: true });
}

// helper: compute grade and point per your scale
export function gradeFromScore(score) {
  // your mapping:
  // A 70 - 100 -> 4
  // B 60 - 69 -> 3
  // C 50 - 59 -> 2
  // D 40 - 49 -> 1
  // F 0 - 39 -> 0 (fail)
  const s = Number(score || 0);
  if (s >= 70) return { grade: "A", point: 4, remark: "EXCELLENT" };
  if (s >= 60) return { grade: "B", point: 3, remark: "V.GOOD" };
  if (s >= 50) return { grade: "C", point: 2, remark: "GOOD" };
  if (s >= 40) return { grade: "D", point: 1, remark: "FAIR" };
  return { grade: "F", point: 0, remark: "FAIL" };
}