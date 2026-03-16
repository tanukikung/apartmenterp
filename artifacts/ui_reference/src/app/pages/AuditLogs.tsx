import { useState } from "react";
import { auditLogs } from "../utils/mockData";
import { Filter } from "lucide-react";

export function AuditLogs() {
  const [actionFilter, setActionFilter] = useState<string | null>(null);

  const filteredLogs = actionFilter
    ? auditLogs.filter((log) => log.action === actionFilter)
    : auditLogs;

  const getActionColor = (action: string) => {
    switch (action) {
      case "CREATE":
        return "bg-green-100 text-green-800";
      case "UPDATE":
        return "bg-blue-100 text-blue-800";
      case "DELETE":
        return "bg-red-100 text-red-800";
      default:
        return "bg-neutral-100 text-neutral-800";
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Audit Logs</h1>
          <p className="text-sm text-neutral-600">Track system actions and changes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-neutral-300 p-4 mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-neutral-600" />
          <span className="text-sm text-neutral-600">Filter by action:</span>
          <button
            onClick={() => setActionFilter(null)}
            className={`px-3 py-1 text-sm border ${
              actionFilter === null
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            All
          </button>
          {["CREATE", "UPDATE", "DELETE"].map((action) => (
            <button
              key={action}
              onClick={() => setActionFilter(action)}
              className={`px-3 py-1 text-sm border ${
                actionFilter === action
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-300">
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-300">
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Timestamp</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">User</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Action</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Entity</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700">{log.timestamp}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{log.user}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getActionColor(log.action)}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{log.entity}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
