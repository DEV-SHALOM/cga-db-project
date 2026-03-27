// src/components/Sidebar.jsx
import { useRef, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  User2,
  BookOpen,
  BarChart2,
  Wallet,
  LogOut,
  Users,
  FileText,
  Menu,
  Pencil,
  Check,
  X,
  Box,
  GraduationCap, // teachers icon
  Receipt,       // ✅ Expenses icon
} from "lucide-react";

import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { usePermission } from "../hooks/usePermission";

// Order matters: Teachers above Students
const sidebarLinks = [
  { name: "Dashboard",         icon: <BarChart2 size={20} />,   key: "dashboard",  path: "/dashboard"  },
  { name: "Teachers",          icon: <GraduationCap size={20} />,key: "teachers",   path: "/teachers"   },
  { name: "Students",          icon: <User2 size={20} />,        key: "students",   path: "/students"   },
  { name: "Results",           icon: <BookOpen size={20} />,     key: "results",    path: "/results"    },
  { name: "Attendance",        icon: <Users size={20} />,        key: "attendance", path: "/attendance" },
  { name: "Document Storage",  icon: <FileText size={20} />,     key: "documents",  path: "/documents"  },
  { name: "Fees",              icon: <Wallet size={20} />,       key: "fees",       path: "/fees"       },
  { name: "Inventory",         icon: <Box size={20} />,          key: "inventory",  path: "/inventory"  },
  // ✅ New Expenses link (placed right after Inventory)
  { name: "Expenses",          icon: <Receipt size={20} />,      key: "expenses",   path: "/expenses"   },
  { name: "Parents Portal",    icon: <Users size={20} />,        key: "parents",    path: "/parents"    },
];

// Simple initials from display name
function getInitials(name = "Admin") {
  const words = name.trim().split(" ");
  if (words.length === 1) return words[0][0]?.toUpperCase() || "A";
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function Sidebar({ sidebarOpen, setSidebarOpen }) {
  const sidebarRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // 🔐 Permissions
  const { isAdmin, hasSection, perm } = usePermission();

  // Gate by section (keeps Dashboard visible to all authenticated users)
  const can = (key) => (key === "dashboard" ? true : isAdmin() || hasSection(key));

  // Profile name edit state
  const [name, setName] = useState(() => localStorage.getItem("adminName") || "Admin");
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState(name);

  // Logout modal
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Click-outside to close on mobile
  useEffect(() => {
    if (!sidebarOpen) return;
    function handleClick(event) {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        setSidebarOpen(false);
        setEditMode(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sidebarOpen, setSidebarOpen]);

  const handleSaveEdit = () => {
    const cleanName = editValue.trim() || "Admin";
    setName(cleanName);
    localStorage.setItem("adminName", cleanName);
    setEditMode(false);
  };
  const handleCancelEdit = () => {
    setEditValue(name);
    setEditMode(false);
  };

  const handleSidebarLinkClick = (path) => {
    setSidebarOpen(false);
    setEditMode(false);
    navigate(path);
  };

  async function handleLogout() {
    try {
      setShowLogoutModal(false);
      await signOut(auth);
    } finally {
      localStorage.removeItem("userToken");
      navigate("/login");
    }
  }

  const currentPath = location.pathname;

  // Wait for perms before rendering (prevents flash of links)
  if (perm.loading) return null;

  // ✅ Permissions-aware filtering (merged logic)
  // Admin: sees everything. Non-admin: sees only sections enabled in their perms.
  // Special-case "dashboard" allowed for all logged-in users.
  const visibleLinks = sidebarLinks.filter((link) => can(link.key));

  const roleLabel = (perm.role || "user").replace(/^\w/, (c) => c.toUpperCase());

  return (
    <>
      {/* Mobile hamburger */}
      {!sidebarOpen && (
        <button
          className="fixed top-3 left-3 z-30 bg-[#6C4AB6]/80 p-1.5 rounded-lg shadow-md text-white md:hidden transition-all opacity-80 hover:opacity-100"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <Menu size={22} />
        </button>
      )}

      {/* Dim overlay on mobile */}
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/40 backdrop-blur-[2px] md:hidden" />}

      <aside
        ref={sidebarRef}
        className={`fixed md:static z-30 top-0 left-0 h-full w-64 transition-transform duration-300
          bg-white/10 border-r border-white/20 backdrop-blur-lg shadow-lg
          rounded-none md:rounded-r-2xl flex flex-col
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{ minWidth: "240px" }}
      >
        {/* Profile block */}
        <div className="px-4 pt-6 pb-4 border-b border-white/10">
          <div className="flex flex-col items-center">
            {/* Avatar */}
            <div className="w-16 h-16 flex items-center justify-center rounded-full shadow border-2 border-[#8055f7]/60 bg-[#8055f7] text-white font-extrabold text-2xl select-none">
              {getInitials(name)}
            </div>

            {/* Name + Edit */}
            <div className="relative w-full mt-3">
              {editMode ? (
                <div className="flex items-center gap-2 justify-center">
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                    maxLength={40}
                    placeholder="Display name"
                    className="px-3 py-1 rounded-lg bg-white/10 text-white placeholder-white/60 border border-white/25
                               focus:border-[#A88BFF] outline-none transition w-[70%] text-center"
                  />
                  <button
                    title="Save"
                    onClick={handleSaveEdit}
                    className="p-1.5 rounded-md border border-[#53e3a6] bg-transparent hover:bg-[#53e3a6]/10 transition"
                  >
                    <Check size={16} className="text-[#53e3a6]" />
                  </button>
                  <button
                    title="Cancel"
                    onClick={handleCancelEdit}
                    className="p-1.5 rounded-md border border-[#ff497a] bg-transparent hover:bg-[#ff497a]/10 transition"
                  >
                    <X size={16} className="text-[#ff497a]" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-white font-bold text-lg text-center">{name}</div>
                  {/* Floating pencil aligned to the right but NOT overlapping avatar/name */}
                  <button
                    onClick={() => {
                      setEditMode(true);
                      setEditValue(name);
                    }}
                    title="Edit name"
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-transparent
                               border border-white/20 hover:bg-white/10 transition"
                  >
                    <Pencil size={16} className="text-white/90" />
                  </button>
                </>
              )}
            </div>

            <div className="text-[#e0e7ff] text-xs opacity-80 mt-1">{roleLabel}</div>
          </div>
        </div>

        {/* Scrollable nav */}
        <nav className="flex-1 overflow-y-auto custom-scroll px-3 py-3">
          <div className="flex flex-col gap-2">
            {visibleLinks.map((link) => (
              <button
                key={link.key}
                onClick={() => handleSidebarLinkClick(link.path)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition
                  w-full h-11 overflow-hidden whitespace-nowrap text-ellipsis
                  ${
                    currentPath === link.path
                      ? "bg-[#6C4AB6]/70 text-white shadow font-semibold border border-white/30 backdrop-blur-sm"
                      : "hover:bg-[#8055f7]/30 text-[#e0e7ff]/85 border border-transparent"
                  }`}
              >
                {link.icon}
                <span>{link.name}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Bottom area: divider + logout pinned */}
        <div className="px-3 pb-4 pt-2 border-t border-white/10">
          <button
            className="w-full flex items-center justify-center gap-2 px-4 h-11 rounded-xl
                       text-[#ff497a] hover:bg-white/10 border border-white/15 backdrop-blur-sm
                       font-semibold transition"
            onClick={() => setShowLogoutModal(true)}
          >
            <LogOut size={20} /> <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white/20 border border-white/30 backdrop-blur-lg rounded-2xl p-6 min-w-[320px] flex flex-col items-center shadow-2xl">
            <div className="text-lg font-semibold text-[#f75555] mb-3">Confirm Logout</div>
            <div className="text-white mb-6 text-center">Are you sure you want to log out?</div>
            <div className="flex gap-3 w-full justify-center">
              <button
                className="flex-1 px-5 py-2 rounded-xl bg-[#ff497a]/90 text-white font-bold shadow hover:bg-[#ff497a] transition"
                onClick={handleLogout}
              >
                Yes, Logout
              </button>
              <button
                className="flex-1 px-5 py-2 rounded-xl bg-white/10 border border-white/20 text-[#8055f7] font-bold shadow hover:bg-white/30 transition"
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar scrollbar theme */}
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
        /* Firefox */
        .custom-scroll { scrollbar-width: thin; scrollbar-color: rgba(128,85,247,0.55) transparent; }
      `}</style>
    </>
  );
}
