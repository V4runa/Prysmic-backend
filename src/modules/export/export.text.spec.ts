import { spawnSync } from 'child_process';
import { noteHtmlToText } from './export.text';
import { toDateOnly, toTime } from './export.serialize';

describe('export text and date-only values', () => {
  it('decodes character references once, including numeric forms', () => {
    expect(noteHtmlToText('&amp;amp;')).toBe('&amp;');
    expect(noteHtmlToText('&amp;lt;')).toBe('&lt;');
    expect(noteHtmlToText('&amp;#60;')).toBe('&#60;');
    expect(noteHtmlToText('&#60;')).toBe('<');
    expect(noteHtmlToText('&#x1F30D;')).toBe('🌍');
    expect(noteHtmlToText('&#39;quote&#39;')).toBe("'quote'");
    expect(noteHtmlToText('&nbsp;')).toBe('');
    expect(noteHtmlToText('&#xD800;')).toBe('&#xD800;');
    expect(
      noteHtmlToText('<p>Hello <strong>世界</strong> &amp; café</p>'),
    ).toBe('Hello 世界 & café');
    expect(
      noteHtmlToText('<script>secret-script-token</script><p>kept</p>'),
    ).toBe('kept');
  });

  it('passes a civil date string through and formats Date as a local calendar day', () => {
    expect(toDateOnly('2026-03-08')).toBe('2026-03-08');
    expect(toDateOnly('2026-11-01')).toBe('2026-11-01');
    expect(toDateOnly('2026-03-08T00:00:00.000Z')).toBeNull();
    const local = new Date(2026, 2, 8);
    const month = String(local.getMonth() + 1).padStart(2, '0');
    const day = String(local.getDate()).padStart(2, '0');
    expect(toDateOnly(local)).toBe(`${local.getFullYear()}-${month}-${day}`);
    expect(toTime('09:30:00')).toBe('09:30:00');
    expect(toTime('09:30')).toBe('09:30:00');
  });

  it('does not move a date-only local midnight onto the previous UTC day', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        '-e',
        `
          const { toDateOnly } = require('./src/modules/export/export.serialize.ts');
          const local = new Date(2026, 2, 8);
          process.stdout.write(JSON.stringify({
            kept: toDateOnly(local),
            shifted: local.toISOString().slice(0, 10),
            pure: toDateOnly('2026-11-01'),
          }));
        `,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, TZ: 'Pacific/Kiritimati' },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      kept: string;
      shifted: string;
      pure: string;
    };
    expect(parsed.pure).toBe('2026-11-01');
    expect(parsed.kept).toBe('2026-03-08');
    expect(parsed.shifted).toBe('2026-03-07');
    expect(parsed.kept).not.toBe(parsed.shifted);
  });
});
