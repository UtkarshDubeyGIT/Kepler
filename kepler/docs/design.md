# Design Direction

## Color Scheme

Use **Modern Neutral + Indigo** (with support for both light and dark themes).

### Light Theme
| Role | Color | Hex Code |
| --- | --- | --- |
| Background | Neutral Slate | `#F8FAFC` |
| Surface | White | `#FFFFFF` |
| Primary | Indigo | `#4F46E5` |
| Accent | Cyan | `#06B6D4` |
| Text | Dark Slate | `#0F172A` |

### Dark Theme
| Role | Color | Hex Code |
| --- | --- | --- |
| Background | Deep Navy | `#0B0F19` |
| Surface | Slate Grey | `#1E293B` |
| Primary | Light Indigo | `#6366F1` |
| Accent | Light Cyan | `#22D3EE` |
| Text | White/Slate | `#F8FAFC` |

## Visual Style

Create a clean, modern SaaS-style interface that feels trustworthy, polished, and easy to scan. The interface MUST support a dark/light mode toggle as a necessity for the MVP.

- Use neutral backgrounds with clean surfaces.
- Use indigo for primary buttons, active navigation, selected states, and key actions.
- Use cyan sparingly for secondary highlights, charts, badges, or subtle emphasis.
- Ensure high text contrast and readability in both light and dark themes.
- Avoid heavy gradients, oversized decorative elements, or marketing-style layouts unless required.

## Layout

- Prioritize clear hierarchy and simple navigation.
- Use generous spacing without making the UI feel empty.
- Keep content organized into practical sections, panels, tables, forms, and workflows.
- Design for both desktop and mobile responsiveness.
- Use consistent alignment, spacing, and component sizing.

## Components

Recommended components:

- Top navigation or sidebar navigation (must include the Theme Toggle switch)
- Primary and secondary buttons
- Cards for grouped content
- Forms with clear labels and validation states
- Tables or lists for structured information
- Status badges
- Empty, loading, error, and success states

## Stitch Prompt Add-On

```text
Use a Modern Neutral + Indigo color scheme supporting both light and dark modes: Light theme (#F8FAFC background, #FFFFFF surfaces, #4F46E5 primary actions, #06B6D4 accents, and #0F172A text); Dark theme (#0B0F19 background, #1E293B surfaces, #6366F1 primary actions, #22D3EE accents, and #F8FAFC text). Keep the interface clean, accessible, responsive, and production-ready. Ensure a responsive layout with a header containing a theme toggle switch.
```
