import { targetKindLabel, type SolarTarget } from '../lib/solar';
import type { AiBinding } from './types';

function compact(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Turn a selection into the text/status context the chat pipeline expects.
 * Moons send their real extracted note/slide text; folders send a grounded
 * overview of their moons' titles, summaries and extracted excerpts.
 */
export function describeTarget(target: SolarTarget): Omit<AiBinding, 'token'> {
  const count = target.items.length;

  if (target.kind === 'moon') {
    const moon = target.items[0];
    return {
      label: `☾ ${target.title} · ${target.star} › ${target.planet ?? 'General'}`,
      title: target.title,
      text: moon?.extractedText || moon?.summary || moon?.content || '',
      status: moon?.extractionStatus ?? 'ok',
      note: moon?.extractionNote,
    };
  }

  const overview = target.items.slice(0, 40).map((moon) => {
    const excerpt = compact(moon.extractedText || moon.summary || moon.content || '', 500);
    return `- ${moon.title}${moon.unit ? ` (${moon.unit})` : ''}${
      excerpt ? `: ${excerpt}` : ': no extracted text'
    }`;
  });

  const planetCount = new Set(target.items.map((moon) => moon.unit || 'General')).size;
  const header =
    target.kind === 'star'
      ? `Star (topic) "${target.star}" contains ${count} moon document(s) across ${planetCount} planet(s).`
      : `Planet (unit) "${target.planet}" under star "${target.star}" contains ${count} moon document(s).`;

  return {
    label:
      target.kind === 'star'
        ? `★ ${target.star} · ${count} moon${count === 1 ? '' : 's'}`
        : `◍ ${target.planet} · ${target.star}`,
    title: target.kind === 'star' ? target.star : target.planet ?? target.star,
    text: [header, ...overview].join('\n'),
    status: count > 0 ? 'ok' : 'empty',
    note: 'Overview built from titles, summaries and extracted note/slide text.',
  };
}

/** Plain-language warning shown in the manual move picker. */
export function moveExplanation(target: SolarTarget): string {
  const count = target.items.length;
  if (target.kind === 'moon') {
    return 'This moon moves to the selected planet. Its file stays attached.';
  }
  if (target.kind === 'planet') {
    return `All ${count} moon${count === 1 ? '' : 's'} in this planet move to the destination; the emptied planet folder is removed.`;
  }
  return `All ${count} moon${count === 1 ? '' : 's'} in this ${targetKindLabel(
    target.kind,
  ).toLowerCase()} move to the destination; the emptied star folder and its planets are removed.`;
}
