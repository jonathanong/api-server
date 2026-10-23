import Router from "find-my-way";
import { getRoutePath } from "./request-path.mts";

export interface MatchedRoute {
  /** The registered path pattern selected by the router. */
  template: string;
  params: Record<string, string | undefined>;
}

export function matchRegisteredRoute(
  router: Router.Instance<Router.HTTPVersion.V1>,
  method: string,
  path: string,
): MatchedRoute | null {
  const found = router.find(method as Router.HTTPMethod, getRoutePath(path));
  if (!found) return null;
  return { template: (found.store as { template: string }).template, params: found.params };
}
