import { maintenanceTickets } from "../utils/mockData";
import { Eye, Edit, CheckCircle2, Plus } from "lucide-react";

export function Maintenance() {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800";
      case "medium":
        return "bg-orange-100 text-orange-800";
      case "low":
        return "bg-neutral-100 text-neutral-800";
      default:
        return "bg-neutral-100 text-neutral-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in-progress":
        return "bg-blue-100 text-blue-800";
      case "pending":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-neutral-100 text-neutral-800";
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Maintenance</h1>
          <p className="text-sm text-neutral-600">Manage repair tickets</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Ticket
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-neutral-300 p-4">
          <div className="text-sm text-neutral-600 mb-1">Total Tickets</div>
          <div className="text-2xl font-semibold text-neutral-900">{maintenanceTickets.length}</div>
        </div>
        <div className="bg-white border border-neutral-300 p-4">
          <div className="text-sm text-neutral-600 mb-1">Pending</div>
          <div className="text-2xl font-semibold text-orange-600">
            {maintenanceTickets.filter((t) => t.status === "pending").length}
          </div>
        </div>
        <div className="bg-white border border-neutral-300 p-4">
          <div className="text-sm text-neutral-600 mb-1">In Progress</div>
          <div className="text-2xl font-semibold text-blue-600">
            {maintenanceTickets.filter((t) => t.status === "in-progress").length}
          </div>
        </div>
        <div className="bg-white border border-neutral-300 p-4">
          <div className="text-sm text-neutral-600 mb-1">Completed</div>
          <div className="text-2xl font-semibold text-green-600">
            {maintenanceTickets.filter((t) => t.status === "completed").length}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-300">
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-300">
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Ticket ID</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Room</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Issue</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Priority</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Assigned Staff</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Created Date</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {maintenanceTickets.map((ticket) => (
              <tr key={ticket.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{ticket.id}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{ticket.room}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{ticket.issue}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getPriorityColor(ticket.priority)}`}>
                    {ticket.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(ticket.status)}`}>
                    {ticket.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-neutral-700">{ticket.assignedStaff}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{ticket.createdDate}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <button className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="View">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-neutral-600 hover:bg-neutral-100 rounded" title="Edit">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-green-600 hover:bg-green-50 rounded" title="Complete">
                      <CheckCircle2 className="w-4 h-4" />
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
