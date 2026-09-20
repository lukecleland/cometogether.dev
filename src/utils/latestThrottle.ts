/** Coalesce movement into a bounded stream, retaining the last pending value. */
export function latestThrottle<T>(send: (value: T) => void, interval = 16) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return {
    setSend(next: (value: T) => void) { send = next; },
    schedule(value: T) {
      pending = { value };
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        const next = pending;
        pending = null;
        if (next) send(next.value);
      }, interval);
    },
    flush(value: T) { cancel(); send(value); },
    cancel,
  };
}
