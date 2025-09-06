import { Navigate } from "react-router-dom";
import { usePermission } from "../hooks/usePermission";

export default function Protected({ section, children }) {
  const { user, perm, hasSection, isAdmin } = usePermission();

  if (perm.loading) return null; // you could put a loader here
  if (!user) return <Navigate to="/login" replace />;

  const allowed = isAdmin() || (section ? hasSection(section) : false);
  return allowed ? children : <Navigate to="/unauthorized" replace />;
}
