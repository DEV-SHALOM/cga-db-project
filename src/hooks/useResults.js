// src/hooks/useResults.js
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
        snap.docs.forEach((d) => m[d.id] = { id: d.id, ...d.data() });
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

// save or update results document
export async function saveStudentResult(termId, studentId, className, payload) {
  // payload should include subjects array [{name, test, exam, total, grade, point}, ...], total, percentage, promoted
  const docId = `${termId}_${studentId}`;
  const ref = doc(db, "results", docId);
  const data = {
    termId,
    studentId,
    className,
    ...payload,
    updatedAt: Timestamp.now(),
  };
  // Use setDoc merge to create/update
  await setDoc(ref, data, { merge: true });
  return { id: docId, ...data };
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
