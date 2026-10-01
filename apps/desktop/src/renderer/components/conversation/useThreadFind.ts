import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ThreadDetail } from '../../types';
import { eventSearchText, workGroupIdFor } from './conversationModel';

/**
 * Find in this thread: which rows match the query, which match is current, and bringing it
 * into view (opening its work group first when the match is a folded step).
 */
export function useThreadFind(
  thread: ThreadDetail | undefined,
  findOpen: boolean,
  openWorkGroups: ReadonlySet<string>,
  setOpenWorkGroups: Dispatch<SetStateAction<ReadonlySet<string>>>,
  eventRefs: MutableRefObject<Map<string, HTMLDivElement>>,
) {
  const [findQuery, setFindQuery] = useState('');
  const [findIndex, setFindIndex] = useState(0);

  const findNeedle = findQuery.trim().toLocaleLowerCase();
  const matchingEventIds = findNeedle
    ? (thread?.events ?? [])
        .filter((event) => eventSearchText(event).includes(findNeedle))
        .map(({ id }) => id)
    : [];

  useEffect(() => {
    setFindIndex(0);
  }, [findQuery, thread?.id]);

  useEffect(() => {
    if (!findOpen || !findQuery || matchingEventIds.length === 0) return;
    const groupId = workGroupIdFor(thread?.events ?? [], matchingEventIds[findIndex]!);
    if (groupId && !openWorkGroups.has(groupId)) {
      setOpenWorkGroups((current) => new Set(current).add(groupId));
      return;
    }
    eventRefs.current.get(matchingEventIds[findIndex]!)?.scrollIntoView({
      block: 'center',
      behavior: 'instant',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll only when the matches change, not on every new event.
  }, [findIndex, findOpen, findQuery, matchingEventIds.join(':'), openWorkGroups]);
  const matchingEventIdSet = useMemo(
    () => new Set(matchingEventIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keep the set's identity while the matches are unchanged.
    [matchingEventIds.join(':')],
  );

  return {
    findQuery,
    setFindQuery,
    findIndex,
    setFindIndex,
    matchingEventIds,
    matchingEventIdSet,
  };
}
