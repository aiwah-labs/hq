import { useRef, useCallback } from 'react';
import type { MessageData } from './messaging-workspace';

type Setter = React.Dispatch<React.SetStateAction<MessageData[]>>;

/**
 * Shared streaming delta buffer for message lists.
 * Accumulates text/reasoning deltas between ticks so we batch React re-renders
 * (~20/sec) instead of one per SSE event. Used by both MessagePanel and ThreadView.
 */
export function useStreamingBuffer(setItems: Setter) {
  const textDeltaBufRef = useRef<Map<string, string>>(new Map());
  const reasoningDeltaBufRef = useRef<Map<string, string>>(new Map());
  const flushScheduledRef = useRef(false);

  /** Apply accumulated text/reasoning deltas to a list of messages (pure). */
  const applyDeltas = useCallback((
    items: MessageData[],
    textDeltas: Map<string, string>,
    reasoningDeltas: Map<string, string>,
  ): MessageData[] => {
    return items.map((m) => {
      const td = textDeltas.get(m.id);
      const rd = reasoningDeltas.get(m.id);
      if (!td && !rd) return m;
      const blocks = [...(m.blocks as Array<Record<string, unknown>>)];
      if (rd) {
        const last = blocks[blocks.length - 1];
        if (last?.type === 'thinking') blocks[blocks.length - 1] = { ...last, text: (last.text as string) + rd };
        else blocks.push({ type: 'thinking', text: rd });
      }
      if (td) {
        const last = blocks[blocks.length - 1];
        if (last?.type === 'text') blocks[blocks.length - 1] = { ...last, text: (last.text as string) + td };
        else blocks.push({ type: 'text', text: td });
      }
      return { ...m, blocks, streamingStatus: 'streaming' };
    });
  }, []);

  /** Schedule a batched flush ~50ms from now (debounced). */
  const scheduleFlush = useCallback(() => {
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    setTimeout(() => {
      flushScheduledRef.current = false;
      const textDeltas = new Map(textDeltaBufRef.current);
      const reasoningDeltas = new Map(reasoningDeltaBufRef.current);
      textDeltaBufRef.current.clear();
      reasoningDeltaBufRef.current.clear();
      if (textDeltas.size === 0 && reasoningDeltas.size === 0) return;
      setItems((prev) => applyDeltas(prev, textDeltas, reasoningDeltas));
    }, 50);
  }, [setItems, applyDeltas]);

  /**
   * Immediately drain the buffer and return the drained deltas.
   * Use this before applying discrete events (tool-call, tool-result) so the
   * buffered text is included in the same React state update.
   */
  const flushNow = useCallback((): { textDeltas: Map<string, string>; reasoningDeltas: Map<string, string> } => {
    const textDeltas = new Map(textDeltaBufRef.current);
    const reasoningDeltas = new Map(reasoningDeltaBufRef.current);
    textDeltaBufRef.current.clear();
    reasoningDeltaBufRef.current.clear();
    flushScheduledRef.current = false;
    return { textDeltas, reasoningDeltas };
  }, []);

  return { textDeltaBufRef, reasoningDeltaBufRef, scheduleFlush, flushNow, applyDeltas };
}
