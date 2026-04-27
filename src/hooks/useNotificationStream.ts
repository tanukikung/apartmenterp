import { useEffect, useRef } from 'react';

export function useNotificationStream(
  onNotification: (n: {
    id: string;
    type: string;
    roomNo: string;
    status: string;
    content: string;
    createdAt: string;
    tenantId: string | null;
    adminId: string | null;
    contractId: string | null;
    scheduledAt: string | null;
    sentAt: string | null;
    lineMessageId: string | null;
    errorMessage: string | null;
  }) => void,
) {
  const onRef = useRef(onNotification);
  onRef.current = onNotification;

  useEffect(() => {
    const es = new EventSource('/api/notifications/stream', {
      withCredentials: true,
    });

    es.addEventListener('notification', (e) => {
      try {
        const data = JSON.parse(e.data);
        onRef.current(data);
      } catch {
        // ignore
      }
    });

    es.addEventListener('connected', () => {
      // connected
    });

    return () => {
      es.close();
    };
  }, []);
}