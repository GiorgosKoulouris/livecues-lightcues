import { useState } from 'react';
import type { UnsupportedFeature } from '../../../shared/fixture-profile';
import type { FixtureImportResult } from '../../../shared/protocol';
import { Button } from '../ui/Button';
import { useConfirm } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { FieldFrame, InlineInput, parseName, useInlineEdit } from '../ui/fields';
import styles from './FixtureImportDialog.module.css';

type ImportOfl = (
  json: unknown,
  manufacturer: string,
  overwrite?: boolean,
) => Promise<FixtureImportResult>;
type ImportGdtf = (bytes: Uint8Array, overwrite?: boolean) => Promise<FixtureImportResult>;

interface FixtureImportDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  importOfl: ImportOfl;
  importGdtf: ImportGdtf;
  // After a Profile was imported, by id and name.
  onImported(id: string, name: string): void;
}

// Imports an Open Fixture Library .json or a GDTF .gdtf fixture file, told
// apart by extension. GDTF names its manufacturer; OFL files do not, so the
// user gives it. Overwriting a hand-edited Profile asks first. Unsupported
// features are listed before the dialog closes.
export function FixtureImportDialog({ open, onOpenChange, ...rest }: FixtureImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Import fixture file">
      {/* Mounted while open, so each opening starts afresh. */}
      {open && <FixtureImportForm {...rest} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

// Imports the chosen file, overwriting a hand-edited Profile or not.
type ImportFile = (overwrite: boolean) => Promise<FixtureImportResult>;

// What the last attempt left to say: a problem, or what was imported.
type Report = { error: string } | { imported: string; unsupported: string[] } | { kept: string };

// The engine checks this again.
const MAX_GDTF_BYTES = 256 * 1024 * 1024;

function FixtureImportForm({
  importOfl,
  importGdtf,
  onImported,
  onClose,
}: Omit<FixtureImportDialogProps, 'open' | 'onOpenChange'> & { onClose(): void }) {
  const confirm = useConfirm();
  const [file, setFile] = useState<File>();
  const [typedManufacturer, setTypedManufacturer] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report>();
  const manufacturer = useInlineEdit({
    value: typedManufacturer,
    format: String,
    parse: parseName,
    onCommit: setTypedManufacturer,
  });
  // Undefined until the user types one.
  const manufacturerName = manufacturer.parsed || undefined;
  const isGdtf = file?.name.toLowerCase().endsWith('.gdtf') ?? false;
  const ready = file !== undefined && (isGdtf || manufacturerName !== undefined);

  if (report && 'imported' in report) {
    return (
      <div className={styles.form}>
        <div className={`${styles.panel} ${styles.ok}`}>
          <p className={styles.verdict}>
            <Mark kind="check" />
            <span>Imported {report.imported}. These features are not supported:</span>
          </p>
          <ul className={styles.unsupported}>
            {report.unsupported.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
        <footer className={styles.footer}>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </footer>
      </div>
    );
  }

  // Reads the file and returns how to import it, or undefined after
  // reporting why it cannot be read.
  async function readFile(chosen: File): Promise<ImportFile | undefined> {
    if (isGdtf) {
      if (chosen.size > MAX_GDTF_BYTES) {
        setReport({ error: `${chosen.name} is too large (over 256 MB).` });
        return;
      }
      const bytes = new Uint8Array(await chosen.arrayBuffer());
      return (overwrite) => importGdtf(bytes, overwrite);
    }
    let json: unknown;
    try {
      json = JSON.parse(await chosen.text());
    } catch {
      setReport({ error: `${chosen.name} is not valid JSON.` });
      return;
    }
    return (overwrite) => importOfl(json, manufacturerName!, overwrite);
  }

  async function importFile(chosen: File) {
    const run = await readFile(chosen);
    if (!run) return;
    let result = await run(false);
    if (
      result.status === 'conflict' &&
      (await confirm({
        title: 'Overwrite the hand-edited Profile?',
        message: `${result.name} was edited by hand. Overwrite it with the imported version?`,
        confirmLabel: 'Overwrite',
        cancelLabel: 'Keep it',
        destructive: true,
      }))
    ) {
      result = await run(true);
    }
    switch (result.status) {
      case 'imported':
        onImported(result.profileId, result.name);
        if (result.unsupported.length === 0) onClose();
        else setReport({ imported: result.name, unsupported: result.unsupported.map(describe) });
        break;
      case 'conflict':
        setReport({ kept: result.name });
        break;
      case 'failed':
        setReport({ error: `Import failed: ${result.error}` });
        break;
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        setBusy(true);
        void importFile(file)
          .catch((error: Error) => setReport({ error: `Import failed: ${error.message}` }))
          .finally(() => setBusy(false));
      }}
    >
      <FieldFrame label="Fixture file" hint="An OFL .json or GDTF .gdtf fixture file">
        {({ inputId, describedBy }) => (
          <input
            id={inputId}
            type="file"
            accept=".json,.gdtf"
            aria-describedby={describedBy}
            className={styles.file}
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        )}
      </FieldFrame>
      {!isGdtf && <InlineInput label="Manufacturer" edit={manufacturer} />}
      {report && 'error' in report && (
        <div role="alert" className={`${styles.panel} ${styles.warn}`}>
          <p className={styles.verdict}>
            <Mark kind="cross" />
            <span>{report.error}</span>
          </p>
        </div>
      )}
      {report && 'kept' in report && (
        <div className={`${styles.panel} ${styles.warn}`}>
          <p className={styles.verdict}>
            <Mark kind="cross" />
            <span>Kept the hand-edited {report.kept}.</span>
          </p>
        </div>
      )}
      <footer className={styles.footer}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!ready || busy}>
          Import
        </Button>
      </footer>
    </form>
  );
}

// A drawn verdict mark. The words beside it carry the meaning.
function Mark({ kind }: { kind: 'check' | 'cross' }) {
  return (
    <svg className={styles.mark} viewBox="0 0 16 16" aria-hidden="true">
      <path d={kind === 'check' ? 'M2 8.5 6 12.5 14 3.5' : 'M3 3 13 13M13 3 3 13'} />
    </svg>
  );
}

function describe({ feature, mode, channel, held }: UnsupportedFeature): string {
  const heldAt = held === undefined ? '' : `, held at ${held}`;
  return (
    feature + (mode ? ` (mode ${mode})` : '') + (channel ? ` (channel ${channel}${heldAt})` : '')
  );
}
