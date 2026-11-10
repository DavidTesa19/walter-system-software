// Pieces shared by the "?" panel and the Nápověda page.

import { SHORTCUTS, type HelpTopic } from './helpContent';

export function ShortcutTable({ compact = false }: { compact?: boolean }) {
  return (
    <table className={`help-shortcuts${compact ? ' help-shortcuts--compact' : ''}`}>
      <tbody>
        {SHORTCUTS.map((shortcut) => (
          <tr key={shortcut.keys.join('|')}>
            <th scope="row">
              {shortcut.keys.map((key, index) => (
                <span key={key}>
                  {index > 0 && <span className="help-or"> / </span>}
                  <kbd>{key}</kbd>
                </span>
              ))}
            </th>
            <td>
              {shortcut.action}
              {shortcut.where && <span className="help-where"> ({shortcut.where})</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TopicBlock({ topic, headingLevel = 3 }: { topic: HelpTopic; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className="help-topic" id={`help-${topic.id}`}>
      <Heading className="help-topic-title">{topic.title}</Heading>
      <p className="help-topic-summary">{topic.summary}</p>
      {topic.points.length > 0 && (
        <ul className="help-topic-points">
          {topic.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
