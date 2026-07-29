import { getStage, type StageKey } from "./runs";

const PREREQUISITES: Partial<Record<StageKey, StageKey>> = {
  sanitize: "analyze",
  match: "sanitize",
  enrich: "match",
  crm: "enrich",
  score: "crm",
  route: "score",
};

export async function checkStageDep(runId: string, stage: StageKey): Promise<string | null> {
  const prereq = PREREQUISITES[stage];
  if (!prereq) return null;
  const prev = await getStage(runId, prereq);
  if (!prev) return `Cannot run "${stage}" — prerequisite "${prereq}" not found.`;
  if (stage === "sanitize") {
    if (prev.status !== "awaiting_approval" && prev.status !== "completed") {
      return `Cannot run "${stage}" — analysis must be awaiting approval or completed (current: ${prev.status}).`;
    }
    return null;
  }
  if (prev.status !== "completed") {
    return `Cannot run "${stage}" — prerequisite "${prereq}" has not completed (current status: ${prev.status}).`;
  }
  return null;
}
