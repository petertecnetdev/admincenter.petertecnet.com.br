export function createLatestAsyncGuard() {
  let sequence = 0;
  let controller = null;

  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const requestId = ++sequence;

      return {
        requestId,
        signal: controller.signal,
        isCurrent: () => requestId === sequence && !controller.signal.aborted,
        cancel: () => controller.abort(),
      };
    },
    cancel() {
      controller?.abort();
    },
  };
}
