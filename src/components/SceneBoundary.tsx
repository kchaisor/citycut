import { Component, type ReactNode } from "react";
import {
  classifySceneFailure,
  readWebGlRendererLabel,
  sceneFallbackMessage,
  type SceneFallbackDetail,
} from "../lib/scene3dFallback";

type Props = { children: ReactNode; resetKey?: string };

type State = { failed: boolean; detail: SceneFallbackDetail | null; resetKey?: string };

export class SceneBoundary extends Component<Props, State> {
  state: State = { failed: false, detail: null, resetKey: undefined };

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === undefined || props.resetKey === state.resetKey) return null;
    return { failed: false, detail: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failed: true, detail: classifySceneFailure(error) };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    const detail = classifySceneFailure(error);
    const renderer = readWebGlRendererLabel();
    console.error("[CityCut 3D]", detail, error, {
      componentStack: info.componentStack,
      webglRenderer: renderer,
    });
  }

  render() {
    if (this.state.failed) {
      const detail = this.state.detail ?? classifySceneFailure(new Error("unknown"));
      const { lead, hint } = sceneFallbackMessage(detail);
      return (
        <div className="scene-fallback">
          <p>{lead}</p>
          {hint ? <p className="scene-fallback-hint">{hint}</p> : null}
        </div>
      );
    }
    return this.props.children;
  }
}
