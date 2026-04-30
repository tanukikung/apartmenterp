let bootstrapPromise: Promise<void> | null = null;

export async function bootstrapMessagingRuntime(options?: { allowInTest?: boolean }): Promise<void> {
  if (process.env.NODE_ENV === 'test' && !options?.allowInTest) {
    return;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    const [{ registerFileSendWorker }, _invoiceNotifier, _paymentNotifier, _reminderNotifier, _welcomeNotifier, _sequenceNotifier] = await Promise.all([
      import('./file-send.worker'),
      import('./invoice-notifier'),
      import('./payment-notifier'),
      import('./reminder-notifier'),
      import('./welcome-notifier'),
      import('./sequence-notifier'),
    ]);

    registerFileSendWorker(options);
  })().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });

  return bootstrapPromise;
}
