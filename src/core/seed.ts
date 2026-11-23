import type { ThoughtNode } from './types';

/**
 * First-run seed data: three nodes per brain region so every filter has content.
 * Ids are stable strings so `links` can reference them deterministically.
 */
export const SEED_THOUGHTS: ThoughtNode[] = [
  {
    id: 'seed-prefrontal-weekly-review',
    title: 'Weekly review ritual',
    content:
      'Every Sunday evening: empty the inbox, re-read the week, pick three priorities for the next seven days, and write one sentence about what actually mattered.',
    type: 'thought',
    region: 'prefrontal',
    tags: ['routine', 'focus'],
    attachments: [],
    moodScore: null,
    createdAt: '2026-11-16T18:30:00.000Z',
    links: ['seed-prefrontal-portfolio-goal'],
  },
  {
    id: 'seed-prefrontal-portfolio-goal',
    title: 'Ship the portfolio site by December',
    content:
      'Goal: a single-page portfolio with three case studies, deployed on the free tier. Work in 25-minute blocks after class; no new features until the case studies are written.',
    type: 'thought',
    region: 'prefrontal',
    tags: ['goal', 'career', 'deadline'],
    attachments: [],
    moodScore: null,
    createdAt: '2026-11-15T09:05:00.000Z',
    links: ['seed-parietal-mindspace-plan'],
  },
  {
    id: 'seed-prefrontal-early-wake',
    title: 'Why I want to wake at 6:30',
    content:
      'The first hour is the only quiet hour. Waking early is not about discipline for its own sake — it is about protecting the deep work block before notifications start.',
    type: 'thought',
    region: 'prefrontal',
    tags: ['motivation', 'routine'],
    attachments: [],
    moodScore: null,
    createdAt: '2026-11-13T21:40:00.000Z',
    links: [],
  },
  {
    id: 'seed-hippocampus-graph-notes',
    title: 'CS 340 — graph algorithms notes',
    content:
      'BFS gives shortest paths in unweighted graphs. Dijkstra needs non-negative weights and a priority queue; relax edges by tentative distance. Bellman-Ford tolerates negative edges but costs O(V·E).',
    type: 'note',
    region: 'hippocampus',
    tags: ['school', 'algorithms'],
    attachments: [],
    moodScore: null,
    createdAt: '2026-11-19T14:10:00.000Z',
    links: ['seed-hippocampus-dijkstra'],
  },
  {
    id: 'seed-hippocampus-dijkstra',
    title: 'Lecture 9 — Dijkstra complexity',
    content:
      'With a binary heap the running time is O((V + E) log V). Practice: trace the algorithm on the six-node example from the problem set before Thursday.',
    type: 'note',
    region: 'hippocampus',
    tags: ['school', 'exam'],
    attachments: [],
    moodScore: null,
    createdAt: '2026-11-19T15:45:00.000Z',
    links: ['seed-hippocampus-graph-notes'],
  },
  {
    id: 'seed-hippocampus-reading-list',
    title: 'Winter break reading list',
    content:
      '1. The Design of Everyday Things\n2. A Philosophy of Software Design\n3. Two fiction books that are not about productivity.',
    type: 'note',
    region: 'hippocampus',
    tags: ['reading', 'personal'],
    attachments: [],
    moodScore: null,
    createdAt: '2026-11-12T08:20:00.000Z',
    links: [],
  },
  {
    id: 'seed-limbic-scattered',
    title: 'Scattered after three back-to-back meetings',
    content:
      'Head is noisy and I keep re-reading the same paragraph. A ten minute walk without headphones usually resets this. Not a failure — just too many context switches.',
    type: 'feeling',
    region: 'limbic',
    tags: ['overwhelm', 'focus'],
    attachments: [],
    moodScore: -2,
    createdAt: '2026-11-21T16:25:00.000Z',
    links: [],
  },
  {
    id: 'seed-limbic-calm-walk',
    title: 'Calm after the long walk',
    content:
      'Forty minutes by the river and the whole afternoon felt lighter. Remember this when I think I have no time to go outside.',
    type: 'feeling',
    region: 'limbic',
    tags: ['calm', 'movement'],
    attachments: [],
    moodScore: 3,
    createdAt: '2026-11-20T17:50:00.000Z',
    links: ['seed-limbic-scattered'],
  },
  {
    id: 'seed-limbic-weekly-reflection',
    title: 'What drained me this week',
    content:
      'Notification-heavy mornings, skipping lunch, and saying yes to two extra review meetings. The pattern is always the same: no protected block, no quiet food, no boundaries.',
    type: 'feeling',
    region: 'limbic',
    tags: ['reflection', 'boundaries'],
    attachments: [],
    moodScore: -1,
    createdAt: '2026-11-18T22:05:00.000Z',
    links: ['seed-prefrontal-weekly-review'],
  },
  {
    id: 'seed-parietal-mindspace-plan',
    title: 'MindSpace — offline-first spatial second brain',
    content:
      'A local-first 3D garden of thoughts. Core data layer is pure TypeScript over IndexedDB; worlds are separate renderers; the HUD is just an overlay. No cloud requirement, ever.',
    type: 'thought',
    region: 'parietal',
    tags: ['project', 'idea', 'typescript'],
    attachments: [],
    moodScore: null,
    createdAt: '2026-11-22T11:15:00.000Z',
    links: ['seed-prefrontal-portfolio-goal'],
  },
  {
    id: 'seed-parietal-flashcards',
    title: 'Idea: offline flashcard deck that syncs later',
    content:
      'Reuse the same repository pattern as MindSpace: local store first, a thin SyncAdapter later. Cards are just nodes with a question/answer shape.',
    type: 'thought',
    region: 'parietal',
    tags: ['idea', 'learning'],
    attachments: [],
    moodScore: null,
    createdAt: '2026-11-17T12:00:00.000Z',
    links: [],
  },
  {
    id: 'seed-parietal-resume-generator',
    title: 'Project: rebuilt resume generator',
    content:
      'Markdown in, tailored PDF out. Keep the layout engine boring and the content model strict. Finished the parsing step; templates are still rough.',
    type: 'thought',
    region: 'parietal',
    tags: ['project', 'shipped'],
    attachments: [],
    moodScore: null,
    createdAt: '2026-11-10T20:35:00.000Z',
    links: [],
  },
];
