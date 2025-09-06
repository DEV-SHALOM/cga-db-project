// src/hooks/usePermission.js
import { useEffect, useState, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";

export function usePermission() {
  const [user, setUser] = useState(null);
  const [perm, setPerm] = useState({ loading: true, role: null, sections: [] });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!alive.current) return;
      setUser(u);

      // No user → no perms
      if (!u) {
        setPerm({ loading: false, role: null, sections: [] });
        return;
      }

      const ref = doc(db, "permissions", u.uid);

      // Subscribe to the permissions doc
      const unsubPerm = onSnapshot(
        ref,
        (snap) => {
          if (!alive.current) return;

          const raw = snap.data() || {};

          // Support both shapes:
          //   { sections: { students:true, fees:true } }  OR
          //   { sections: ["students","fees"] }
          let sections = [];
          const s = raw.sections;

          if (Array.isArray(s)) {
            sections = s.filter(Boolean);
          } else if (s && typeof s === "object") {
            sections = Object.entries(s)
              .filter(([, v]) => v === true)
              .map(([k]) => k);
          }

          setPerm({
            loading: false,
            role: raw.role || null,
            sections,
          });
        },
        // On error, fail safe with no sections
        () => {
          if (!alive.current) return;
          setPerm({ loading: false, role: null, sections: [] });
        }
      );

      // Clean up the perms listener when auth user changes
      return () => unsubPerm && unsubPerm();
    });

    // Clean up auth listener on unmount
    return () => {
      alive.current = false;
      unsubAuth && unsubAuth();
    };
  }, []);

  const hasSection = (section) => perm.sections?.includes(section);
  const isAdmin = () => perm.role === "admin";
  const ready = !perm.loading;

  return { user, perm, hasSection, isAdmin, ready };
}
