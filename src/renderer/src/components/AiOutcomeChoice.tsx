import { createMemo, For } from "solid-js";
import {
  type AgentModelId,
  type AgentModelOption,
  type AgentProviderId,
  type AgentStatus,
  providerForModel,
} from "../../../shared/ipc";
import { type MessageKey, t } from "../i18n";
import { PAID_PROVIDERS, PROFILE_MODELS } from "../model-profiles";

export type AiOutcome = "quick" | "careful" | "free";

const FREE_MODELS: AgentModelId[] = ["opencode-free", "antigravity-default"];

/**
 * The model behind each plain choice, from the AIs that are connected: Quick and Careful use
 * the owner's paid plan, Free uses a free AI. Null when nothing connected can serve a choice.
 */
export function outcomeModels(
  available: AgentProviderId[],
  modelOptions: Pick<AgentModelOption, "id">[],
): Record<AiOutcome, AgentModelId | null> {
  const offered = (model: AgentModelId) =>
    available.includes(providerForModel(model)) &&
    (modelOptions.length === 0 || modelOptions.some((option) => option.id === model));
  const paid = (model: AgentModelId) => PAID_PROVIDERS.includes(providerForModel(model));
  return {
    quick: PROFILE_MODELS.quick.find((model) => paid(model) && offered(model)) ?? null,
    careful: PROFILE_MODELS.analysis.find((model) => paid(model) && offered(model)) ?? null,
    free: FREE_MODELS.find(offered) ?? null,
  };
}

const CHOICES: Array<{ id: AiOutcome; label: MessageKey; hint: MessageKey }> = [
  { id: "quick", label: "aiQuick", hint: "aiQuickHint" },
  { id: "careful", label: "aiCareful", hint: "aiCarefulHint" },
  { id: "free", label: "aiFree", hint: "aiFreeHint" },
];

/**
 * "How should it work?": Quick, Careful or Free. Owners choose by result; the exact model names
 * stay in the picker beside it. A choice with no connected AI behind it says what to connect.
 */
export function AiOutcomeChoice(props: {
  value: AgentModelId;
  modelOptions: AgentModelOption[];
  agentStatus: AgentStatus;
  disabled?: boolean;
  onChange: (model: AgentModelId) => void;
}) {
  const models = createMemo(() =>
    outcomeModels(
      (props.agentStatus.providers ?? [])
        .filter((provider) => provider.state === "available")
        .map((provider) => provider.id),
      props.modelOptions,
    ),
  );
  return (
    <fieldset class="ai-outcome" aria-label={t("aiChoiceLabel")}>
      <For each={CHOICES}>
        {(choice) => {
          const model = () => models()[choice.id];
          const on = () => model() !== null && model() === props.value;
          return (
            <button
              type="button"
              class="ai-outcome-choice"
              classList={{ "ai-outcome-on": on() }}
              aria-pressed={on()}
              disabled={props.disabled || model() === null}
              title={model() === null ? t("aiChoiceNeedsPaid") : t(choice.hint)}
              onClick={() => {
                const next = model();
                if (next && next !== props.value) props.onChange(next);
              }}
            >
              {t(choice.label)}
            </button>
          );
        }}
      </For>
    </fieldset>
  );
}
