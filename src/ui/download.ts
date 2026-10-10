/** Saves a local JSON file as `<basename>-YYYY-MM-DD.json` through a short-lived Blob URL. */
export function downloadJson(basename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${basename}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
