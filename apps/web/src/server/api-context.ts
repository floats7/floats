import "server-only";

import { createApiContext, type ApiContext } from "@floats/api/context.ts";

let context: ApiContext | undefined;

export function getApiContext(): ApiContext {
  context ??= createApiContext(process.env);
  return context;
}
