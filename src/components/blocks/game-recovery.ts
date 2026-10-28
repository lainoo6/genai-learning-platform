export function isGameSubmission(answer: Record<string, unknown>): boolean {
  return answer.kind !== "hint" && answer.kind !== "replay";
}
