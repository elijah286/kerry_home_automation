// ---------------------------------------------------------------------------
// Primitive cards: pure presentation or simple interaction, no entity binding
// beyond an optional target for the button.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { cardBaseShape } from '../base.js';
import { actionSchema } from '../actions.js';

// -- Heading ----------------------------------------------------------------

export const headingCardSchema = z.object({
  type: z.literal('heading'),
  ...cardBaseShape,
  text: z.string(),
  /** Visual weight. `title` is a section title; `subtitle` is a sub-heading. */
  style: z.enum(['title', 'subtitle', 'caption']).default('title'),
  /** Optional Material icon id (e.g. "mdi:piano"). */
  icon: z.string().optional(),
}).describe('Static heading text used to label a section or group.');

export type HeadingCard = z.infer<typeof headingCardSchema>;

// -- Markdown ---------------------------------------------------------------

export const markdownCardSchema = z.object({
  type: z.literal('markdown'),
  ...cardBaseShape,
  /** CommonMark; rendered via a sanitizer. No raw HTML passes through. */
  content: z.string(),
  /** Optional title displayed above the rendered content. */
  title: z.string().optional(),
}).describe('Rich text block. Sanitized Markdown — no raw HTML or script.');

export type MarkdownCard = z.infer<typeof markdownCardSchema>;

// -- Button -----------------------------------------------------------------

export const buttonCardSchema = z.object({
  type: z.literal('button'),
  ...cardBaseShape,
  /** Primary entity; rendered state drives the button's on/off appearance. */
  entity: z.string().optional(),
  /** Override label; defaults to entity display name. */
  name: z.string().optional(),
  /** Material icon id; defaults to entity's default icon. */
  icon: z.string().optional(),
  /** Render the entity's current state under the name. */
  showState: z.boolean().default(false),
  tapAction: actionSchema.default({ type: 'toggle' }),
  holdAction: actionSchema.optional(),
  doubleTapAction: actionSchema.optional(),
}).describe('Icon+label button bound to an entity or a free-form action.');

export type ButtonCard = z.infer<typeof buttonCardSchema>;

// -- Iframe (sandboxed) -----------------------------------------------------

export const iframeSandboxCardSchema = z.object({
  type: z.literal('iframe-sandbox'),
  ...cardBaseShape,
  /** https-only URL. Renderer enforces sandbox attributes; no script access to host. */
  url: z.string().url(),
  title: z.string().optional(),
  /** Aspect ratio hint (e.g. "16:9"). */
  aspectRatio: z.string().regex(/^\d+:\d+$/).optional(),
}).describe('Embed an external page in a tightly sandboxed iframe. Admin-only by convention.');

export type IframeSandboxCard = z.infer<typeof iframeSandboxCardSchema>;
