import { useEffect, useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { getObject, type ObjectAction } from '../objects/objectApi';
import { AnnotationsPanel } from './AnnotationsPanel';

/** Props for {@link ObjectNotes}. */
export interface ObjectNotesProps {
  api: ForesignalClient | undefined;
  objectRef: string;
  heading?: string;
}

/**
 * The notes on an object whose envelope the caller has not read yet (a situation or an
 * investigation): its envelope is read (`getObject`) for the actions the caller may take, and the
 * {@link AnnotationsPanel} shown. Until it is read, or when it cannot be, nothing is offered but the
 * list.
 */
export function ObjectNotes({ api, objectRef, heading }: ObjectNotesProps) {
  const [actions, setActions] = useState<{ ref: string; list: ObjectAction[] }>();
  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    getObject(api, objectRef, undefined, controller.signal).then(
      (envelope) =>
        !controller.signal.aborted && setActions({ ref: objectRef, list: envelope.actions ?? [] }),
      () => undefined,
    );
    return () => controller.abort();
  }, [api, objectRef]);
  return (
    <AnnotationsPanel
      api={api}
      objectRef={objectRef}
      actions={actions?.ref === objectRef ? actions.list : undefined}
      {...(heading !== undefined && { heading })}
    />
  );
}
