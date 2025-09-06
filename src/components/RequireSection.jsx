import { Navigate } from "react-router-dom";
import { usePermission } from "../hooks/usePermission";

export default function RequireSection({ section, children }) {
  const { perm, isAdmin, hasSection } = usePermission();

  if (perm.loading) return null; // or a spinner/placeholder
  if (isAdmin() || hasSection(section)) return children;

  // fallback: push unauthorized users (e.g., students-only teachers) to Students
  return <Navigate to="/students" replace />;
}
