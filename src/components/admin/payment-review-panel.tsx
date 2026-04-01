'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface PaymentTransaction {
  id: string;
  amount: number;
  transactionDate: string;
  description?: string;
  reference?: string;
  confidenceScore?: number;
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number;
    room: {
      roomNumber: string;
      roomTenants: Array<{
        tenant: {
          firstName: string;
          lastName: string;
        };
      }>;
    };
  };
}

export function PaymentReviewPanel() {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 10;

  const formatCurrency = (amt: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amt);

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch(`/api/payments/review?limit=${limit}&offset=${offset}`);
        const data = await response.json();
        if (data.success) {
          setTransactions(data.data.transactions);
        }
      } catch (error) {
        console.error('ไม่สามารถดึงรายการธุรกรรม:', error);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [offset]);

  const confirmMatch = async (transactionId: string, invoiceId: string) => {
    setProcessing(transactionId);
    try {
      const response = await fetch('/api/payments/match/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, invoiceId }),
      });

      if (response.ok) {
        setTransactions(transactions.filter(t => t.id !== transactionId));
      }
    } catch (error) {
      console.error('ไม่สามารถยืนยันการจับคู่:', error);
    } finally {
      setProcessing(null);
    }
  };

  const rejectMatch = async (transactionId: string) => {
    setProcessing(transactionId);
    try {
      const response = await fetch('/api/payments/match/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
      });

      if (response.ok) {
        setTransactions(transactions.filter(t => t.id !== transactionId));
      }
    } catch (error) {
      console.error('ไม่สามารถปฏิเสธการจับคู่:', error);
    } finally {
      setProcessing(null);
    }
  };

  const getConfidenceColor = (score?: number) => {
    if (!score) return 'bg-gray-100 text-gray-800';
    if (score >= 0.9) return 'bg-green-100 text-green-800';
    if (score >= 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (loading) {
    return (
      <div className="border rounded p-4">
        <div className="text-lg font-semibold mb-2">แผงตรวจสอบการชำระ</div>
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="border rounded p-4">
        <div className="text-lg font-semibold mb-2">แผงตรวจสอบการชำระ</div>
        <p className="text-gray-500 text-center py-8">ไม่มีรายการที่ต้องตรวจสอบ</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border rounded p-4">
        <div className="text-lg font-semibold mb-4">แผงตรวจสอบการชำระ</div>
          <div className="space-y-4">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-lg font-semibold">
                      {formatCurrency(transaction.amount)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {format(new Date(transaction.transactionDate), 'PPP', { locale: th })}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${getConfidenceColor(transaction.confidenceScore)}`}>
                    {transaction.confidenceScore ? `${Math.round(transaction.confidenceScore * 100)}%` : 'ไม่ทราบ'}
                  </span>
                </div>

                {transaction.reference && (
                  <div className="text-sm text-gray-600 mb-2">
                    <strong>อ้างอิง:</strong> {transaction.reference}
                  </div>
                )}

                {transaction.description && (
                  <div className="text-sm text-gray-600 mb-3">
                    <strong>รายละเอียด:</strong> {transaction.description}
                  </div>
                )}

                {transaction.invoice && (
                  <div className="bg-blue-50 p-3 rounded-md mb-3">
                    <div className="text-sm font-medium mb-1">ใบแจ้งหนี้ที่จับคู่</div>
                    <div className="text-sm text-gray-700">
                      <div>ใบแจ้งหนี้: {transaction.invoice.invoiceNumber}</div>
                      <div>ห้อง: {transaction.invoice.room.roomNumber}</div>
                      <div>จำนวน: {formatCurrency(transaction.invoice.total)}</div>
                      {transaction.invoice.room.roomTenants[0] && (
                        <div>ผู้เช่า: {transaction.invoice.room.roomTenants[0].tenant.firstName} {transaction.invoice.room.roomTenants[0].tenant.lastName}</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => confirmMatch(transaction.id, transaction.invoice!.id)}
                    disabled={processing === transaction.id}
                    className="px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {processing === transaction.id ? 'กำลังดำเนินการ...' : 'ยืนยันการจับคู่'}
                  </button>
                  <button
                    onClick={() => rejectMatch(transaction.id)}
                    disabled={processing === transaction.id}
                    className="px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {processing === transaction.id ? 'กำลังดำเนินการ...' : 'ปฏิเสธ'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center mt-6">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-3 py-1.5 rounded border disabled:opacity-50"
            >
              ก่อนหน้า
            </button>
            <span className="text-sm text-gray-600">
              แสดง {offset + 1} - {Math.min(offset + limit, transactions.length + offset)} จาก {transactions.length}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={transactions.length < limit}
              className="px-3 py-1.5 rounded border disabled:opacity-50"
            >
              ถัดไป
            </button>
          </div>
      </div>
    </div>
  );
}
