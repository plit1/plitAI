'use client';
const listeners = new Set<() => void>();
export const onUnreadChanged = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const notifyUnreadChanged = () => listeners.forEach((f) => f());
