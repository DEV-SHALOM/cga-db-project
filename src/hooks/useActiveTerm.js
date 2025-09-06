import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export function useActiveTerm() {
  const [termId, setTermId] = useState(null);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "app"), (snap) => {
      setTermId(snap.data()?.activeTermId || null);
    });
    return () => unsub();
  }, []);
  return termId;
}
