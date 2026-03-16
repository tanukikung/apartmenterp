import { useState } from "react";
import { Link } from "react-router";
import { rooms } from "../utils/mockData";
import { Eye, Edit, Trash2 } from "lucide-react";
import { motion } from "motion/react";

export function Rooms() {
  const [floorFilter, setFloorFilter] = useState<number | null>(null);

  const filteredRooms = floorFilter
    ? rooms.filter((room) => room.floor === floorFilter)
    : rooms;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "occupied":
        return "bg-green-100 text-green-800";
      case "vacant":
        return "bg-neutral-100 text-neutral-800";
      case "maintenance":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-neutral-100 text-neutral-800";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6"
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex justify-between items-center"
      >
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Rooms</h1>
          <p className="text-sm text-neutral-600">Manage all apartment rooms</p>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white border border-neutral-300 p-4 mb-4"
      >
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setFloorFilter(null)}
            className={`px-4 py-2 text-sm border transition-colors ${
              floorFilter === null
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            All Floors
          </motion.button>
          {[1, 2, 3, 4].map((floor, index) => (
            <motion.button
              key={floor}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + index * 0.05 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFloorFilter(floor)}
              className={`px-4 py-2 text-sm border transition-colors ${
                floorFilter === floor
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              Floor {floor}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white border border-neutral-300"
      >
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-300">
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Room Number</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Floor</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Tenant</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Rent</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Last Payment</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRooms.map((room, index) => (
              <motion.tr
                key={room.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + index * 0.03 }}
                whileHover={{ backgroundColor: "#fafafa", x: 5 }}
                className="border-b border-neutral-200"
              >
                <td className="px-4 py-3 text-sm font-medium text-neutral-900">{room.id}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{room.floor}</td>
                <td className="px-4 py-3 text-sm">
                  <motion.span
                    whileHover={{ scale: 1.05 }}
                    className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(room.status)}`}
                  >
                    {room.status}
                  </motion.span>
                </td>
                <td className="px-4 py-3 text-sm text-neutral-700">{room.tenant}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">¥{room.rent.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{room.lastPayment}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Link to={`/rooms/${room.id}`}>
                      <motion.div
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </motion.div>
                    </Link>
                    <motion.button
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className="p-1 text-neutral-600 hover:bg-neutral-100 rounded"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </motion.div>
  );
}