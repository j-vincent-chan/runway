/**
 * Hand the browser a text file to save. Browser-only: creates an object URL,
 * clicks a detached anchor carrying the filename, and releases the URL once
 * the click has been dispatched.
 */
export function downloadTextFile(
  filename: string,
  text: string,
  mime = "text/csv;charset=utf-8"
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
