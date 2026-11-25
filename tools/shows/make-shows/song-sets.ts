// The Song sets table of a generated Show's Cue Sheet: each song's Set roles.
// The Show lint scores it and the Plan generator cues from it.

/** A song's Colour Set roles, as set names. */
export interface SongRoles {
  song: string;
  main: string;
  break: string;
  swap: string;
}

/** The Song sets table of the Cue Sheet beside `file` (`<name> cue sheet.md`), if there is one. */
export function parseSongSets(markdown: string): SongRoles[] | undefined {
  const lines = markdown.split('\n');
  const at = lines.findIndex((l) => /^#+\s*Song sets\s*$/i.test(l));
  if (at < 0) return undefined;
  const label = (cell: string): string => cell.replace(/\s*\([A-G][#b]?-?\d+\)\s*$/, '').trim();
  const rows: SongRoles[] = [];
  for (const line of lines.slice(at + 1)) {
    if (/^#/.test(line)) break;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    // The header row; a song may be called "Song" too.
    const header = cells[0] === 'Song' && cells[1] === 'Main';
    if (cells.length !== 4 || /^-+$/.test(cells[0]!) || header) continue;
    rows.push({
      song: cells[0]!,
      main: label(cells[1]!),
      break: label(cells[2]!),
      swap: label(cells[3]!),
    });
  }
  return rows;
}

/** Where the Cue Sheet of the Show `file` is: `<name> cue sheet.md` beside it. */
export const cueSheetPath = (file: string): string =>
  `${file.replace(/\.lcshow$/, '')} cue sheet.md`;

/** `parseSongSets` of the Cue Sheet beside the Show `file`, if there is one. */
export function songRolesBeside(
  file: string,
  read: (path: string) => string,
): SongRoles[] | undefined {
  try {
    return parseSongSets(read(cueSheetPath(file)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
