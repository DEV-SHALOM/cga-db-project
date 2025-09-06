// src/components/Layout.jsx

import { useState } from "react";
import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen bg-gradient-to-br from-[#1c0450] via-[#203280] to-[#3c236e] overflow-hidden">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <main className="flex-1 h-full min-h-0 overflow-auto flex flex-col p-3 sm:p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
