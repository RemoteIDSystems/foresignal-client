import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '../ui/Button';
import styles from './ErrorBoundary.module.css';

/** Props for {@link ErrorBoundary}. */
export interface ErrorBoundaryProps {
  /** Names the area that failed, shown in the fallback ("Global view"). */
  label: string;
  /** The protected subtree. */
  children: ReactNode;
  /** A second way out (036): leaves for the Global dashboard, when this is not it. */
  onHome?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in one view or panel so the rest of the app keeps working, and offers a
 * retry that re-renders the subtree and, for a whole view, a way back to the Global dashboard.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  /** No error until a descendant throws. */
  state: State = { error: null };

  /** Records the error so the fallback renders. */
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  /** Logs the error with its component stack. */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`ForeSignal: ${this.props.label} failed to render.`, error, info.componentStack);
  }

  /** Renders the subtree, or the fallback after an error. */
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className={styles.fallback}>
        <TriangleAlert size={22} />
        <div>
          <div className={styles.title}>{this.props.label} hit an error</div>
          <div className={styles.detail}>{error.message}</div>
        </div>
        <div className={styles.actions}>
          <Button onClick={() => this.setState({ error: null })}>Retry</Button>
          {this.props.onHome && (
            <Button variant="ghost" onClick={this.props.onHome}>
              Go to Global
            </Button>
          )}
        </div>
      </div>
    );
  }
}
