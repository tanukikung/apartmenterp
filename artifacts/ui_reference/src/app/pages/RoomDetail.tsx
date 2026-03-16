import { useParams } from "react-router";
import { rooms, invoices, payments, maintenanceTickets } from "../utils/mockData";
import { ArrowLeft, User, Receipt, CreditCard, Wrench, MessageSquare } from "lucide-react";
import { Link } from "react-router";

export function RoomDetail() {
  const { roomId } = useParams();
  const room = rooms.find((r) => r.id === roomId);

  if (!room) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Room not found</h1>
      </div>
    );
  }

  const roomInvoices = invoices.filter((inv) => inv.room === roomId);
  const roomPayments = payments.filter((pay) => pay.room === roomId);
  const roomTickets = maintenanceTickets.filter((ticket) => ticket.room === roomId);

  return (
    <div className="p-6">
      <Link to="/rooms" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4">
        <ArrowLeft className="w-4 h-4" />
        Back to Rooms
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Room {roomId}</h1>
        <p className="text-sm text-neutral-600">Room details and activity</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Room & Tenant Info */}
        <div className="space-y-4">
          {/* Room Info */}
          <div className="bg-white border border-neutral-300">
            <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
              <h2 className="font-semibold text-neutral-900">Room Information</h2>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-neutral-600">Room Number</label>
                <div className="text-sm font-medium text-neutral-900">{room.id}</div>
              </div>
              <div>
                <label className="text-xs text-neutral-600">Floor</label>
                <div className="text-sm text-neutral-900">{room.floor}</div>
              </div>
              <div>
                <label className="text-xs text-neutral-600">Status</label>
                <div className="text-sm">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    room.status === "occupied" ? "bg-green-100 text-green-800" :
                    room.status === "vacant" ? "bg-neutral-100 text-neutral-800" :
                    "bg-orange-100 text-orange-800"
                  }`}>
                    {room.status}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-600">Monthly Rent</label>
                <div className="text-sm text-neutral-900">¥{room.rent.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Tenant Info */}
          {room.status === "occupied" && (
            <div className="bg-white border border-neutral-300">
              <div className="px-4 py-3 border-b border-neutral-300 bg-neutral-50">
                <h2 className="font-semibold text-neutral-900">Tenant Information</h2>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs text-neutral-600">Name</label>
                  <div className="text-sm font-medium text-neutral-900">{room.tenant}</div>
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Last Payment</label>
                  <div className="text-sm text-neutral-900">{room.lastPayment}</div>
                </div>
                <button className="w-full px-4 py-2 bg-blue-600 text-white text-sm hover:bg-blue-700">
                  View Tenant Profile
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Tabs */}
        <div className="col-span-2 bg-white border border-neutral-300">
          <div className="border-b border-neutral-300">
            <div className="flex">
              <button className="px-4 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
                <Receipt className="w-4 h-4 inline mr-2" />
                Invoices
              </button>
              <button className="px-4 py-3 text-sm font-medium text-neutral-600 hover:text-neutral-900">
                <CreditCard className="w-4 h-4 inline mr-2" />
                Payments
              </button>
              <button className="px-4 py-3 text-sm font-medium text-neutral-600 hover:text-neutral-900">
                <Wrench className="w-4 h-4 inline mr-2" />
                Maintenance
              </button>
              <button className="px-4 py-3 text-sm font-medium text-neutral-600 hover:text-neutral-900">
                <MessageSquare className="w-4 h-4 inline mr-2" />
                Chat
              </button>
            </div>
          </div>

          {/* Invoice Tab Content */}
          <div className="p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-600 border-b border-neutral-200">
                  <th className="pb-2">Invoice ID</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Due Date</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {roomInvoices.length > 0 ? (
                  roomInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-neutral-100">
                      <td className="py-3 text-neutral-900">{invoice.id}</td>
                      <td className="py-3 text-neutral-900">¥{invoice.amount.toLocaleString()}</td>
                      <td className="py-3 text-neutral-700">{invoice.dueDate}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          invoice.status === "paid" ? "bg-green-100 text-green-800" :
                          invoice.status === "overdue" ? "bg-red-100 text-red-800" :
                          "bg-orange-100 text-orange-800"
                        }`}>
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-neutral-500">No invoices found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
