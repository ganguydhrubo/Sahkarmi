import type { TurnPlan } from "../../shared/ipc";

/**
 * One plain line for a coworker's row while it works through its own plan:
 * "Step 2 of 4: Checking the GST numbers". Null when there is no plan or it is finished,
 * so the row shows its usual last message.
 */
export function planStatusLine(
  plan: TurnPlan | null | undefined,
  template = "Step {step} of {total}: {text}",
): string | null {
  const steps = plan?.steps ?? [];
  if (steps.length === 0) return null;
  if (steps.every((step) => step.status === "completed")) return null;
  let index = steps.findIndex((step) => step.status === "in_progress");
  if (index < 0) index = steps.findIndex((step) => step.status === "pending");
  if (index < 0) return null;
  const text = steps[index].text.trim().replace(/\s+/g, " ");
  return template
    .replace("{step}", String(index + 1))
    .replace("{total}", String(steps.length))
    .replace("{text}", text.length > 80 ? `${text.slice(0, 79)}…` : text);
}
