"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Poll<T> = { data: T | undefined; error: string | null; loading: boolean; refresh: () => Promise<void> };

type State<T> = { key: string | null; data?: T; error: string | null; done: boolean };

/**
 * Runs `fn` now and every `intervalMs`, keeping the last good value while refreshing.
 * Pass `key = null` to pause (e.g. until a wallet connects). Changing the key starts over.
 */
export function usePoll<T>(key: string | null, fn: () => Promise<T>, intervalMs: number): Poll<T> {
  const [state, setState] = useState<State<T>>({ key, error: null, done: key === null });
  const fnRef = useRef(fn);
  const keyRef = useRef(key);
  useEffect(() => {
    fnRef.current = fn;
    keyRef.current = key;
  });

  const load = useCallback(async (k: string) => {
    try {
      const data = await fnRef.current();
      if (keyRef.current === k) setState({ key: k, data, error: null, done: true });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (keyRef.current === k) setState((s) => ({ key: k, data: s.key === k ? s.data : undefined, error, done: true }));
    }
  }, []);

  useEffect(() => {
    if (key === null) return;
    load(key);
    // Background tabs don't poll; they refresh as soon as they're visible again.
    const id = setInterval(() => {
      if (!document.hidden) load(key);
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) load(key);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, intervalMs, load]);

  const refresh = useCallback(async () => {
    if (keyRef.current !== null) await load(keyRef.current);
  }, [load]);

  // Results from a previous key are never shown for the current one.
  const current = state.key === key ? state : { data: undefined, error: null, done: key === null };
  return { data: current.data, error: current.error, loading: !current.done, refresh };
}
