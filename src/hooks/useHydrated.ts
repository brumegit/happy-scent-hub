import { useEffect, useState } from "react";

/** True once the client has mounted and persisted stores have been read. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
