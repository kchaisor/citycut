import { useState } from "react";
import App from "./App";
import { AppFatalBoundary } from "./components/AppFatalBoundary";

export function AppRoot() {
  const [appKey, setAppKey] = useState(0);
  return (
    <AppFatalBoundary onBackToMap={() => setAppKey((value) => value + 1)}>
      <App key={appKey} />
    </AppFatalBoundary>
  );
}
