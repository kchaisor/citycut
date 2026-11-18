import { useModelPage, type ModelPageProps } from "./useModelPage";
import { ModelPageView } from "./ModelPageView";

export function ModelPage(props: ModelPageProps) {
  const vm = useModelPage(props);
  return <ModelPageView vm={vm} />;
}

export type { ModelPageProps };
