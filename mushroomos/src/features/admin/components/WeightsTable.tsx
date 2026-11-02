import { PREBATCH_WEIGHT_MATERIALS, weightCode } from '../api/prebatch';

/**
 * Pre-H0 material weights (0129): Dry and Fresh weight per material, typed in TONS and saved in kg as readings on the
 * batch's pre-H0 sample (owner, 25 Sep 2026).
 * One table for both doors — a new batch (Prepare) and a batch already running (Onboard).
 */
export function WeightsTable({
  weights,
  onChange,
}: {
  weights: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <>
      <h3 className="mb-1 mt-5 font-head text-[13px] font-800 uppercase tracking-wider text-ink">Weights</h3>
      <p className="mb-2 max-w-[60ch] text-[13px] text-muted">
        Dry and fresh weight of each material, in tons (e.g. 14.4). Bagasse is for the whole batch — all three parts. Leave blank what is not used or not known.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-muted">
              <th className="py-1 pr-2 font-700">Material</th>
              <th className="py-1 pr-2 font-700">Dry weight (t)</th>
              <th className="py-1 font-700">Fresh weight (t)</th>
            </tr>
          </thead>
          <tbody>
            {PREBATCH_WEIGHT_MATERIALS.map((m) => (
              <tr key={m.key} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <th scope="row" className="py-1.5 pr-2 text-left font-head font-700">{m.label}</th>
                {(['dry', 'fresh'] as const).map((kind) => {
                  const code = weightCode(m.key, kind);
                  return (
                    <td key={kind} className={kind === 'dry' ? 'py-1.5 pr-2' : 'py-1.5'}>
                      <input
                        id={`pb-${code}`}
                        aria-label={`${m.label} ${kind} weight (tons)`}
                        inputMode="decimal"
                        value={weights[code] ?? ''}
                        onChange={(e) => onChange({ ...weights, [code]: e.target.value })}
                        placeholder="t"
                        className="mono w-full min-w-0 rounded-md border bg-surface px-2 text-[16px]"
                        style={{ minHeight: 44, borderColor: 'var(--line-2)' }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
