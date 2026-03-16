import { useState } from "react";
import { tenants } from "../utils/mockData";
import { Eye, Edit, Trash2, Search } from "lucide-react";

export function Tenants() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTenants = tenants.filter((tenant) =>
    tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.room.includes(searchTerm)
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Tenants</h1>
          <p className="text-sm text-neutral-600">Manage tenant profiles</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700">
          Add New Tenant
        </button>
      </div>

      {/* Search */}
      <div className="bg-white border border-neutral-300 p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by name or room number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-300">
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-300">
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Tenant Name</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Room</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Phone</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">LINE Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Contract Start</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Contract End</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTenants.map((tenant) => (
              <tr key={tenant.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{tenant.name}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{tenant.room}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{tenant.phone}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    tenant.lineStatus === "connected"
                      ? "bg-green-100 text-green-800"
                      : "bg-neutral-100 text-neutral-800"
                  }`}>
                    {tenant.lineStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-neutral-700">{tenant.contractStart}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{tenant.contractEnd}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <button className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="View">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-neutral-600 hover:bg-neutral-100 rounded" title="Edit">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-red-600 hover:bg-red-50 rounded" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
