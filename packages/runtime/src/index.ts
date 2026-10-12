type Failure = { ok: false; error: string };
export interface RuntimeHealth {
  sqlite: { ok: true; value: string } | Failure;
  sharp: { ok: true; width: number; height: number } | Failure;
  node: string;
  electron?: string;
  processType: string;
}

export async function probeRuntime(): Promise<RuntimeHealth> {
  let sqlite: RuntimeHealth['sqlite'];
  let sharpResult: RuntimeHealth['sharp'];
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE health (value TEXT NOT NULL)');
      db.prepare('INSERT INTO health (value) VALUES (?)').run('commercecanvas');
      const row = db.prepare('SELECT value FROM health').get();
      if (row?.value !== 'commercecanvas') throw new Error('SQLite round trip failed');
      sqlite = { ok: true, value: row.value };
    } finally { db.close(); }
  } catch (error) { sqlite = { ok: false, error: String(error) }; }
  try {
    const { default: sharp } = await import('sharp');
    const pixels = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#3659df' } }).png().toBuffer();
    const metadata = await sharp(pixels).metadata();
    if (metadata.width !== 2 || metadata.height !== 2) throw new Error('Sharp round trip failed');
    sharpResult = { ok: true, width: metadata.width, height: metadata.height };
  } catch (error) { sharpResult = { ok: false, error: String(error) }; }
  return { sqlite, sharp: sharpResult, node: process.versions.node, electron: process.versions.electron, processType: process.type ?? 'node' };
}
