import type { AgentProvider } from "./agent-client";

/**
 * The order the quick AIs start in when Sahkarmi opens. Only a few start at a time, so the
 * owner's default AI goes first, then the AIs the most coworkers use: the chat is ready as soon
 * as the AI the owner is about to talk to is up, not after a rarely used one. Providers no one
 * uses keep their usual order.
 */
export function startFirst(
  providers: readonly AgentProvider[],
  preferred: AgentProvider,
  coworkerProviders: readonly AgentProvider[],
): AgentProvider[] {
  const uses = new Map<AgentProvider, number>();
  for (const provider of coworkerProviders) uses.set(provider, (uses.get(provider) ?? 0) + 1);
  const rank = (provider: AgentProvider) =>
    provider === preferred ? Number.POSITIVE_INFINITY : (uses.get(provider) ?? 0);
  return providers
    .map((provider, index) => ({ provider, index }))
    .sort((left, right) => rank(right.provider) - rank(left.provider) || left.index - right.index)
    .map(({ provider }) => provider);
}
