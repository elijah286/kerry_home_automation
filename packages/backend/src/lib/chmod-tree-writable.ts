import { chmod, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * xorriso / ISO trees often create read-only bits. `fs.rm` can fail with EACCES on unlink;
 * chmod u+rwx first (recursively) so temp trees under e.g. /tmp can always be removed.
 */
export async function chmodTreeWritable(root: string): Promise<void> {
  try {
    await chmod(root, 0o777);
  } catch {
    return;
  }
  let st;
  try {
    st = await stat(root);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;
  const names = await readdir(root);
  for (const name of names) {
    await chmodTreeWritable(join(root, name));
  }
}
