import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onBackToMap: () => void;
};

type State = {
  failed: boolean;
  message: string;
};

export class AppFatalBoundary extends Component<Props, State> {
  state: State = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { failed: true, message };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    console.error("[CityCut] fatal", error, { componentStack: info.componentStack });
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.failed) {
      return (
        <div className="app-fatal" role="alert">
          <h1>Something went wrong</h1>
          <p className="app-fatal-lead">CityCut hit an unexpected error and could not keep running.</p>
          <p className="app-fatal-detail">{this.state.message}</p>
          <div className="app-fatal-actions">
            <button type="button" className="primary" onClick={this.reload}>
              Reload
            </button>
            <button type="button" className="ghost" onClick={this.props.onBackToMap}>
              Back to map
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
