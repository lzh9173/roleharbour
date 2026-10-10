/** The message of a thrown Error (already localised where we raise it), else the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
