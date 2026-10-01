import { useState } from 'react';
import type { ChangeEntry } from './safetyApi';
import { NOISY_FIELDS, fieldLabel, formatValue } from './format';

const SNAPSHOT_PREVIEW = 8;

// What one change did: before/after for an edit, the record's values for a
// creation or deletion.
export default function ChangeDiff({ entry }: { entry: ChangeEntry }) {
  const [showAll, setShowAll] = useState(false);

  if (entry.op === 'U') {
    const fields = entry.changedFields.filter((field) => !NOISY_FIELDS.has(field));
    if (fields.length === 0) return <p className="safety-muted">Jen technické údaje.</p>;
    return (
      <table className="safety-diff">
        <thead>
          <tr>
            <th>Pole</th>
            <th>Před</th>
            <th>Po</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field}>
              <td className="safety-diff-field">{fieldLabel(field)}</td>
              <td className="safety-diff-old">{formatValue(entry.oldData?.[field])}</td>
              <td className="safety-diff-new">{formatValue(entry.newData?.[field])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const snapshot = (entry.op === 'I' ? entry.newData : entry.oldData) ?? {};
  const fields = Object.keys(snapshot).filter(
    (field) => field !== 'id' && !NOISY_FIELDS.has(field) && formatValue(snapshot[field]) !== '—'
  );
  const shown = showAll ? fields : fields.slice(0, SNAPSHOT_PREVIEW);

  return (
    <div>
      <table className={`safety-diff safety-diff--${entry.op === 'I' ? 'created' : 'deleted'}`}>
        <thead>
          <tr>
            <th>Pole</th>
            <th>{entry.op === 'I' ? 'Vytvořeno s hodnotou' : 'Hodnota před smazáním'}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((field) => (
            <tr key={field}>
              <td className="safety-diff-field">{fieldLabel(field)}</td>
              <td>{formatValue(snapshot[field])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fields.length > SNAPSHOT_PREVIEW && (
        <button type="button" className="safety-link-button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Zobrazit méně' : `Zobrazit všech ${fields.length} polí`}
        </button>
      )}
    </div>
  );
}
