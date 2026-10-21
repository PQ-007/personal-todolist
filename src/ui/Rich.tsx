import { Fragment, type ReactNode } from 'react';

/** Renders a translated string, replacing `{name}` placeholders with elements from `parts`. */
export function Rich({ text, parts }: { text: string; parts: Record<string, ReactNode> }) {
  return text.split(/\{(\w+)\}/g).map((s, i) => <Fragment key={i}>{i % 2 ? (parts[s] ?? `{${s}}`) : s}</Fragment>);
}
