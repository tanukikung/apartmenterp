import { createBrowserRouter } from "react-router";
import { Layout } from "./components/layout/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Rooms } from "./pages/Rooms";
import { RoomDetail } from "./pages/RoomDetail";
import { Tenants } from "./pages/Tenants";
import { Billing } from "./pages/Billing";
import { Invoices } from "./pages/Invoices";
import { Payments } from "./pages/Payments";
import { Chat } from "./pages/Chat";
import { Maintenance } from "./pages/Maintenance";
import { Analytics } from "./pages/Analytics";
import { AuditLogs } from "./pages/AuditLogs";
import { System } from "./pages/System";
import { Settings } from "./pages/Settings";
import { Templates } from "./pages/Templates";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: "rooms", Component: Rooms },
      { path: "rooms/:roomId", Component: RoomDetail },
      { path: "tenants", Component: Tenants },
      { path: "billing", Component: Billing },
      { path: "invoices", Component: Invoices },
      { path: "payments", Component: Payments },
      { path: "chat", Component: Chat },
      { path: "maintenance", Component: Maintenance },
      { path: "analytics", Component: Analytics },
      { path: "audit-logs", Component: AuditLogs },
      { path: "system", Component: System },
      { path: "templates", Component: Templates },
      { path: "settings", Component: Settings },
    ],
  },
]);