import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { AiAccount, AiAccountProvider, AiAccountsState } from "../../../shared/ipc";
import { t } from "../i18n";

const AI_NAME: Record<AiAccountProvider, string> = { codex: "ChatGPT", claude: "Claude" };

/**
 * Saved ChatGPT or Claude accounts, under that AI's row in Settings. Sahkarmi has no login of its
 * own: these are the AI sign-ins. When one account's limit is used up, coworkers move to the next
 * saved account by themselves and carry on in the same chat.
 */
export function AiAccounts(props: { provider: AiAccountProvider; busy: boolean }) {
  const [state, setState] = createSignal<{ accounts: AiAccount[]; adding: boolean }>({
    accounts: [],
    adding: false,
  });
  const [working, setWorking] = createSignal(false);
  const [error, setError] = createSignal("");
  const api = () => window.sahkarmi.aiAccounts;

  async function run(action: () => Promise<AiAccountsState>) {
    setError("");
    setWorking(true);
    try {
      setState((await action()).providers[props.provider]);
    } catch (cause) {
      setError(
        (cause instanceof Error ? cause.message : String(cause)).replace(
          /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
          "",
        ),
      );
    } finally {
      setWorking(false);
    }
  }

  onMount(() => {
    const accountsApi = api();
    if (!accountsApi) return;
    void run(() => accountsApi.list());
    // A finished sign-in adds or names an account.
    const stop = window.sahkarmi.providerSetup?.onEvent((setup) => {
      if (setup.provider !== props.provider) return;
      if (setup.phase === "connected" || setup.phase === "idle") void run(() => accountsApi.list());
    });
    if (stop) onCleanup(stop);
  });

  const name = (account: AiAccount, index: number) =>
    account.email ?? t("aiAccountsNumber", { n: String(index + 1) });
  const time = (iso: string) =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
      new Date(iso),
    );

  return (
    <Show when={api() && state().accounts.length > 0}>
      <div class="ai-accounts">
        <p class="settings-meta">{t("aiAccountsHelp", { ai: AI_NAME[props.provider] })}</p>
        <ul class="ai-account-list">
          <For each={state().accounts}>
            {(account, index) => (
              <li class="ai-account-row" classList={{ "ai-account-active": account.active }}>
                <span class="ai-account-name">
                  {name(account, index())}
                  <Show when={account.restingUntil}>
                    {(until) => <small>{t("aiAccountsResting", { time: time(until()) })}</small>}
                  </Show>
                </span>
                <Show
                  when={!account.active}
                  fallback={<span class="ai-account-badge">{t("aiAccountsInUse")}</span>}
                >
                  <button
                    type="button"
                    class="link-button"
                    disabled={props.busy || working()}
                    onClick={() => void run(() => api().use(props.provider, account.id))}
                  >
                    {t("aiAccountsUse")}
                  </button>
                  <button
                    type="button"
                    class="link-button ai-account-remove"
                    disabled={props.busy || working()}
                    onClick={() => {
                      if (
                        !window.confirm(
                          t("aiAccountsRemoveConfirm", { name: name(account, index()) }),
                        )
                      )
                        return;
                      void run(() => api().remove(props.provider, account.id));
                    }}
                  >
                    {t("aiAccountsRemove")}
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
        <Show
          when={!state().adding}
          fallback={<p class="settings-meta ai-account-adding">{t("aiAccountsAdding")}</p>}
        >
          <button
            type="button"
            class="link-button ai-account-add"
            disabled={props.busy || working()}
            onClick={() => {
              const note =
                props.provider === "codex"
                  ? t("aiAccountsAddConfirmCodex")
                  : t("aiAccountsAddConfirmClaude");
              if (!window.confirm(note)) return;
              void run(() => api().add(props.provider));
            }}
          >
            {t("aiAccountsAdd")}
          </button>
        </Show>
        <Show when={error()}>
          <p class="center-view-error" role="alert">
            {error()}
          </p>
        </Show>
      </div>
    </Show>
  );
}
