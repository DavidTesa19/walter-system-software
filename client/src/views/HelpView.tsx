// Ostatní › Nápověda: every keyboard shortcut and a guide to each screen the
// user can open (their role and sections decide which), with a filter.

import { useMemo, useState } from 'react';
import { isViewAllowedForRole, isViewAllowedForScope, useAuth } from '../auth/AuthContext';
import { HELP_TOPICS, JARVIS_TOPIC, type HelpTopic } from '../help/helpContent';
import { ShortcutTable, TopicBlock } from '../help/HelpParts';
import '../help/Help.css';

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const matches = (topic: HelpTopic, query: string) =>
  !query || normalize([topic.title, topic.summary, ...topic.points].join(' ')).includes(query);

export default function HelpView() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('');
  const query = normalize(filter.trim());

  const topics = useMemo(() => {
    const visible = HELP_TOPICS.filter((topic) =>
      topic.views.some((view) => isViewAllowedForRole(user?.role, view) && isViewAllowedForScope(user?.accessScope, view)),
    );
    return [JARVIS_TOPIC, ...visible];
  }, [user?.role, user?.accessScope]);

  const shown = topics.filter((topic) => matches(topic, query));

  return (
    <div className="help-page">
      <header className="help-page-header">
        <h1>Nápověda</h1>
        <p>
          Nápovědu k obrazovce, na které právě jste, otevřete odkudkoli klávesou <kbd>?</kbd> nebo tlačítkem
          {' '}<strong>?</strong> v menu vedle vašeho účtu.
        </p>
        <input
          type="search"
          className="help-filter"
          placeholder="Hledat v nápovědě…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Hledat v nápovědě"
        />
      </header>

      {!query && (
        <nav className="help-toc" aria-label="Obsah">
          {topics.map((topic) => (
            <a key={topic.id} href={`#help-${topic.id}`}>
              {topic.title}
            </a>
          ))}
          <a href="#help-shortcuts">Klávesové zkratky</a>
        </nav>
      )}

      <div className="help-page-topics">
        {shown.map((topic) => (
          <TopicBlock key={topic.id} topic={topic} headingLevel={2} />
        ))}
        {query && shown.length === 0 && <p className="help-empty">Nic nenalezeno.</p>}
      </div>

      {!query && (
        <section className="help-topic" id="help-shortcuts">
          <h2 className="help-topic-title">Klávesové zkratky</h2>
          <ShortcutTable />
        </section>
      )}
    </div>
  );
}
