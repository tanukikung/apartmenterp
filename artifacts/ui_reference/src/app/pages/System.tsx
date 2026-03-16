import { Database, Activity, HardDrive, Clock, CheckCircle2, AlertCircle, Play } from "lucide-react";

const systemStatus = [
  { component: "Database", status: "healthy", uptime: "99.98%", lastCheck: "2026-03-14 15:30" },
  { component: "Queue Service", status: "healthy", uptime: "99.95%", lastCheck: "2026-03-14 15:30" },
  { component: "Worker Service", status: "healthy", uptime: "99.92%", lastCheck: "2026-03-14 15:30" },
  { component: "Backup Service", status: "warning", uptime: "99.80%", lastCheck: "2026-03-14 15:30" },
];

const backupHistory = [
  { id: 1, date: "2026-03-14 02:00", size: "2.4 GB", status: "completed", duration: "12m 34s" },
  { id: 2, date: "2026-03-13 02:00", size: "2.3 GB", status: "completed", duration: "11m 52s" },
  { id: 3, date: "2026-03-12 02:00", size: "2.3 GB", status: "completed", duration: "12m 08s" },
  { id: 4, date: "2026-03-11 02:00", size: "2.2 GB", status: "completed", duration: "11m 45s" },
  { id: 5, date: "2026-03-10 02:00", size: "2.2 GB", status: "completed", duration: "12m 15s" },
];

export function System() {
  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">System</h1>
          <p className="text-sm text-neutral-600">System health and maintenance</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700 flex items-center gap-2">
          <Play className="w-4 h-4" />
          Run Backup Now
        </button>
      </div>

      {/* System Status Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {systemStatus.map((sys) => (
          <div key={sys.component} className="bg-white border border-neutral-300 p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="text-sm font-medium text-neutral-900">{sys.component}</div>
              {sys.status === "healthy" ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-orange-600" />
              )}
            </div>
            <div className="space-y-1">
              <div className="text-xs text-neutral-600">Uptime</div>
              <div className="text-lg font-semibold text-neutral-900">{sys.uptime}</div>
              <div className="text-xs text-neutral-500">Last check: {sys.lastCheck}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Database Health */}
        <div className="bg-white border border-neutral-300">
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Database Health
            </h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Connections</span>
              <span className="text-sm font-medium text-neutral-900">12 / 100</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Database Size</span>
              <span className="text-sm font-medium text-neutral-900">2.4 GB</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Tables</span>
              <span className="text-sm font-medium text-neutral-900">24</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-neutral-600">Last Optimization</span>
              <span className="text-sm font-medium text-neutral-900">2026-03-13</span>
            </div>
          </div>
        </div>

        {/* Queue Status */}
        <div className="bg-white border border-neutral-300">
          <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Queue Status
            </h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Pending Jobs</span>
              <span className="text-sm font-medium text-neutral-900">3</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Processing</span>
              <span className="text-sm font-medium text-neutral-900">1</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Failed Jobs</span>
              <span className="text-sm font-medium text-neutral-900">0</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-neutral-600">Completed Today</span>
              <span className="text-sm font-medium text-neutral-900">127</span>
            </div>
          </div>
        </div>
      </div>

      {/* Backup History */}
      <div className="mt-6 bg-white border border-neutral-300">
        <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Backup History
          </h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-300">
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Date & Time</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Size</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Duration</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Status</th>
            </tr>
          </thead>
          <tbody>
            {backupHistory.map((backup) => (
              <tr key={backup.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700">{backup.date}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{backup.size}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{backup.duration}</td>
                <td className="px-4 py-3 text-sm">
                  <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">
                    {backup.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
