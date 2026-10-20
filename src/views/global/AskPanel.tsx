import { useEffect, useRef, useState, type FormEvent } from 'react';
import { History, MessageSquarePlus, Sparkles, Trash2, X } from 'lucide-react';
import { formatPanelTime } from '../../objects/dossierView';
import {
  askStream,
  deleteAskThread,
  getAskThread,
  listAskThreads,
  type AskCitation,
  type AskThreadSummary,
} from '../../search/askApi';
import { answerPieces, askProblem, citationRef } from '../../search/askView';
import { Button, IconButton } from '../../ui/Button';
import { useRecordLayers } from './recordLayersContext';
import styles from './GlobalDashboard.module.css';

/** One turn of the conversation as the panel shows it. */
interface Turn {
  role: 'user' | 'assistant';
  text: string;
  citations: AskCitation[];
  warnings: string[];
  /** While the answer streams: the tool being used, and that the text is not yet verified. */
  progress?: string;
  streaming?: boolean;
}

/**
 * The Ask ForeSignal panel (017), opened from the left rail's tools: a question about the data is
 * answered as it is written (`askStream`), each cited object a chip in the answer that selects it
 * (014) and brings the map to it. The thread continues until a new one is started; earlier threads
 * are listed (`listAskThreads`), opened (`getAskThread`) and deleted (`deleteAskThread`). Without a
 * token, or with no language model assigned on the server (`LLM_NOT_CONFIGURED`), it says so.
 */
export function AskPanel({ onClose }: { onClose: () => void }) {
  const layers = useRecordLayers();
  const api = layers?.api;
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const controller = useRef<AbortController>(undefined);
  useEffect(() => () => controller.current?.abort(), []);

  /** Changes the last turn (the answer being written). */
  const updateAnswer = (change: (turn: Turn) => Turn) =>
    setTurns((current) => [...current.slice(0, -1), change(current.at(-1)!)]);

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!api || !text || busy) return;
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    setBusy(true);
    setProblem(undefined);
    setQuestion('');
    setTurns((current) => [
      ...current,
      { role: 'user', text, citations: [], warnings: [] },
      { role: 'assistant', text: '', citations: [], warnings: [], streaming: true },
    ]);
    try {
      const done = await askStream(
        api,
        { question: text, ...(threadId && { threadId }) },
        {
          onProgress: (progress) =>
            updateAnswer((turn) => ({
              ...turn,
              progress:
                progress.status === 'calling'
                  ? (progress.summary ?? `Using ${progress.tool}…`)
                  : turn.progress,
            })),
          onDelta: (delta) => updateAnswer((turn) => ({ ...turn, text: turn.text + delta })),
          onCitation: (citation) =>
            updateAnswer((turn) => ({ ...turn, citations: [...turn.citations, citation] })),
          onWarning: (message) =>
            updateAnswer((turn) => ({ ...turn, warnings: [...turn.warnings, message] })),
        },
        mine.signal,
      );
      if (mine.signal.aborted) return;
      setThreadId(done.threadId);
      // The verified answer replaces the streamed text.
      updateAnswer(() => ({
        role: 'assistant',
        text: done.answer,
        citations: done.citations,
        warnings: done.warnings ?? [],
      }));
    } catch (error) {
      if (mine.signal.aborted) return;
      setProblem(askProblem(error, 'Ask'));
      // The unanswered question is taken back, so it can be asked again.
      setTurns((current) => current.slice(0, -2));
      setQuestion(text);
    } finally {
      if (!mine.signal.aborted) setBusy(false);
    }
  };

  /** Leaves the current thread: the next question starts a new one. */
  const reset = () => {
    controller.current?.abort();
    setBusy(false);
    setTurns([]);
    setThreadId(undefined);
    setProblem(undefined);
  };
  const newThread = () => {
    reset();
    setView('chat');
  };

  const openThread = async (id: string) => {
    if (!api) return;
    try {
      const thread = await getAskThread(api, id);
      setThreadId(thread.id);
      setTurns(
        (thread.messages ?? []).map((message) => ({
          role: message.role,
          text: message.content,
          citations: message.citations ?? [],
          warnings: message.warnings ?? [],
        })),
      );
      setProblem(undefined);
      setView('chat');
    } catch (error) {
      setProblem(askProblem(error, 'Ask'));
    }
  };

  return (
    <section className={styles.askPanel} aria-label="Ask ForeSignal" data-testid="ask-panel">
      <header className={styles.askHeader}>
        <Sparkles size={15} aria-hidden="true" />
        <h2 className={styles.sectionLabel}>Ask ForeSignal</h2>
        <span className={styles.spacer} />
        <IconButton
          label={view === 'history' ? 'Back to the conversation' : 'Earlier questions'}
          icon={<History size={15} />}
          onClick={() => setView(view === 'history' ? 'chat' : 'history')}
          aria-pressed={view === 'history'}
        />
        <IconButton
          label="New question"
          icon={<MessageSquarePlus size={15} />}
          onClick={newThread}
        />
        <IconButton label="Close Ask ForeSignal" icon={<X size={15} />} onClick={onClose} />
      </header>
      {view === 'history' ? (
        <ThreadList onOpen={openThread} onDeleted={(id) => id === threadId && reset()} />
      ) : (
        <>
          <div className={styles.askTurns} data-testid="ask-turns" aria-live="polite">
            {turns.length === 0 && !problem && (
              <p className={styles.summaryNote}>
                Ask about the data: what happened, where, and what it is related to. Answers cite
                the records they rest on.
              </p>
            )}
            {turns.map((turn, index) =>
              turn.role === 'user' ? (
                <p key={index} className={styles.askQuestion}>
                  {turn.text}
                </p>
              ) : (
                <Answer key={index} turn={turn} />
              ),
            )}
            {problem && (
              <p className={styles.askProblem} role="alert">
                {problem}
              </p>
            )}
          </div>
          <form className={styles.askForm} onSubmit={ask}>
            <textarea
              aria-label="Question"
              placeholder="Ask a question about the data…"
              value={question}
              rows={2}
              maxLength={4000}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button variant="primary" type="submit" disabled={busy || !question.trim()}>
              {busy ? 'Answering…' : 'Ask'}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

/** An answer: its text with each citation a chip that selects its object, then its warnings. */
function Answer({ turn }: { turn: Turn }) {
  const selectRef = useRecordLayers()?.selectRef;
  const pieces = answerPieces(turn.text, turn.citations);
  const inline = new Set(pieces.flatMap((piece) => ('citation' in piece ? [piece.citation] : [])));
  const chip = (citation: AskCitation, key: string) => {
    const ref = citationRef(citation);
    return (
      <button
        key={key}
        type="button"
        className={styles.citation}
        disabled={!ref}
        title={ref ? `Select ${citation.title}` : citation.title}
        data-ref={ref}
        onClick={() => ref && void selectRef?.(ref)}
      >
        {citation.title}
      </button>
    );
  };
  return (
    <div
      className={styles.askAnswer}
      data-testid="ask-answer"
      data-state={turn.streaming ? 'streaming' : 'done'}
    >
      {turn.streaming && turn.progress && <p className={styles.muted}>{turn.progress}</p>}
      <div className={styles.askText}>
        {pieces.map((piece, index) =>
          'citation' in piece ? (
            chip(piece.citation, `c${index}`)
          ) : (
            <span key={index}>{piece.text}</span>
          ),
        )}
        {turn.streaming && <span className={styles.askCaret} aria-hidden="true" />}
      </div>
      {turn.citations.some((citation) => !inline.has(citation)) && (
        <div className={styles.askSources}>
          <span className={styles.muted}>Sources:</span>
          {turn.citations
            .filter((citation) => !inline.has(citation))
            .map((citation, index) => chip(citation, `s${index}`))}
        </div>
      )}
      {turn.warnings.map((warning) => (
        <p key={warning} className={styles.askWarning}>
          {warning}
        </p>
      ))}
    </div>
  );
}

/** The caller's earlier threads, newest first, each opened by a click and deleted after a confirm. */
function ThreadList({
  onOpen,
  onDeleted,
}: {
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const api = useRecordLayers()?.api;
  const [threads, setThreads] = useState<AskThreadSummary[]>();
  const [problem, setProblem] = useState<string>();
  const [confirming, setConfirming] = useState<string>();
  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    listAskThreads(api, controller.signal).then(
      (page) => setThreads(page.items),
      (error: unknown) => {
        if (!controller.signal.aborted) setProblem(askProblem(error, 'Ask'));
      },
    );
    return () => controller.abort();
  }, [api]);

  const remove = async (id: string) => {
    if (!api) return;
    try {
      await deleteAskThread(api, id);
      setThreads((current) => current?.filter((thread) => thread.id !== id));
      onDeleted(id);
    } catch (error) {
      setProblem(askProblem(error, 'Ask'));
    }
    setConfirming(undefined);
  };

  return (
    <div className={styles.askTurns} data-testid="ask-threads">
      {problem && (
        <p className={styles.askProblem} role="alert">
          {problem}
        </p>
      )}
      {!threads && !problem && <p className={styles.summaryNote}>Loading earlier questions…</p>}
      {threads?.length === 0 && <p className={styles.summaryNote}>No earlier questions.</p>}
      <ul className={styles.askThreads} aria-label="Earlier questions">
        {threads?.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              className={styles.rowButton}
              onClick={() => thread.id && onOpen(thread.id)}
            >
              <span className={styles.insightText}>
                <span className={styles.insightTitle}>{thread.title ?? 'Untitled'}</span>
                <span className={styles.insightDetail}>
                  {[
                    thread.updatedAt && formatPanelTime(thread.updatedAt),
                    thread.messageCount !== undefined && `${thread.messageCount} messages`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </button>
            {confirming === thread.id ? (
              <Button variant="primary" onClick={() => thread.id && void remove(thread.id)}>
                Confirm delete
              </Button>
            ) : (
              <IconButton
                label={`Delete “${thread.title ?? 'Untitled'}”`}
                icon={<Trash2 size={14} />}
                onClick={() => setConfirming(thread.id)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
