import { Outlet, NavLink } from "react-router";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  Receipt,
  CreditCard,
  MessageSquare,
  Wrench,
  BarChart3,
  ScrollText,
  Server,
  Settings,
  FileEdit,
} from "lucide-react";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/rooms", label: "Rooms", icon: Building2 },
  { path: "/tenants", label: "Tenants", icon: Users },
  { path: "/billing", label: "Billing", icon: FileText },
  { path: "/invoices", label: "Invoices", icon: Receipt },
  { path: "/payments", label: "Payments", icon: CreditCard },
  { path: "/chat", label: "Chat", icon: MessageSquare },
  { path: "/maintenance", label: "Maintenance", icon: Wrench },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/audit-logs", label: "Audit Logs", icon: ScrollText },
  { path: "/system", label: "System", icon: Server },
  { path: "/templates", label: "Templates", icon: FileEdit },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  return (
    <div className="flex h-screen bg-neutral-100">
      {/* Sidebar */}
      <aside className="w-60 bg-neutral-800 text-white flex flex-col">
        <div className="p-4 border-b border-neutral-700">
          <h1 className="text-xl font-semibold">Apartment ERP</h1>
          <p className="text-sm text-neutral-400">Admin Portal</p>
        </div>
        <nav className="flex-1 overflow-y-auto">
          <ul className="py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.exact}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        isActive
                          ? "bg-blue-600 text-white"
                          : "text-neutral-300 hover:bg-neutral-700 hover:text-white"
                      }`
                    }
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}