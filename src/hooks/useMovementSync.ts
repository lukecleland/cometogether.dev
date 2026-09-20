import { useEffect, useLayoutEffect, useState } from "react";
import { latestThrottle } from "../utils/latestThrottle";

export function useMovementSync<T>(send: (value: T) => void) {
  const [sender] = useState(() => latestThrottle<T>(send));
  useLayoutEffect(() => { sender.setSend(send); }, [send, sender]);
  useEffect(() => () => sender.cancel(), [sender]);
  return sender;
}
