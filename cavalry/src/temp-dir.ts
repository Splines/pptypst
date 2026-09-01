/**
 * Cavalry's `api.writeToFile` does not create missing parent directories (it
 * silently fails and logs "Saving File [Failed]" in the app), so every place
 * that writes into a `pptypst/` subfolder of the temp directory must ensure it
 * exists first.
 */
export function pptypstTempDir(): string {
  const dir = `${api.getTempFolder()}/pptypst`;
  if (!api.isDirectory(dir)) {
    api.makeFolder(dir);
  }
  return dir;
}
