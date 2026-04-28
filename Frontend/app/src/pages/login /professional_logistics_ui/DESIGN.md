---
name: Professional Logistics UI
colors:
  surface: '#f9f9fe'
  surface-dim: '#d9dadf'
  surface-bright: '#f9f9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f8'
  surface-container: '#ededf3'
  surface-container-high: '#e7e8ed'
  surface-container-highest: '#e2e2e7'
  on-surface: '#191c1f'
  on-surface-variant: '#42474f'
  inverse-surface: '#2e3034'
  inverse-on-surface: '#f0f0f5'
  outline: '#727780'
  outline-variant: '#c2c7d1'
  surface-tint: '#2d6197'
  primary: '#00355f'
  on-primary: '#ffffff'
  primary-container: '#0f4c81'
  on-primary-container: '#8ebdf9'
  inverse-primary: '#a0c9ff'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#532800'
  on-tertiary: '#ffffff'
  tertiary-container: '#743b00'
  on-tertiary-container: '#f9a767'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e4ff'
  primary-fixed-dim: '#a0c9ff'
  on-primary-fixed: '#001c37'
  on-primary-fixed-variant: '#07497d'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#ffdcc4'
  tertiary-fixed-dim: '#ffb780'
  on-tertiary-fixed: '#2f1400'
  on-tertiary-fixed-variant: '#6f3800'
  background: '#f9f9fe'
  on-background: '#191c1f'
  surface-variant: '#e2e2e7'
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  title-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  data-tabular:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  container_max_width: 1280px
  gutter: 24px
---

## Brand & Style

This design system is engineered for high-stakes operational environments where clarity and data density must coexist with visual comfort. The brand personality is rooted in **Precision, Reliability, and Transparency**. It utilizes a **Modern Minimalist** style that prioritizes content over container, ensuring that logistics managers can identify supply chain bottlenecks at a glance. 

The aesthetic is intentionally quiet to allow the data—the "signal"—to stand out against the "noise" of traditional, cluttered enterprise dashboards. By utilizing a centered card layout, the design system directs the user's focus toward the core analytical engine of the application.

## Colors

The palette is anchored by a deep **Maritime Blue** (Primary), symbolizing stability and global reach, complemented by a **Teal** (Secondary) for interactive highlights. The foundation of the UI uses "Soft Whites" and "Light Grays" to reduce eye strain during long-form monitoring. 

Semantic colors for success, warning, and error states are calibrated for high legibility against the light neutral backgrounds. Use the neutral palette to create a clear visual hierarchy between the page background and the floating card containers.

## Typography

This design system utilizes **Inter** for its exceptional legibility and systematic performance in data-heavy environments. The hierarchy is structured to guide the eye from high-level KPIs to granular line items.

- **Headlines:** Use Semi-Bold weights with tighter letter spacing for a modern, compact look.
- **Data Display:** For supply chain metrics and tracking numbers, utilize `data-tabular` settings to ensure vertical alignment of digits across lists.
- **Labels:** Use uppercase labels for metadata and section headers to provide a distinct visual break from body text.

## Layout & Spacing

The layout follows a **Fixed-Grid philosophy** centered on the viewport. The maximum container width is capped to prevent data from becoming disconnected on ultra-wide monitors. 

A strict **8px linear scale** governs all margins and padding. White space is treated as a functional tool to group related data points within cards. Use `md` (24px) for internal card padding and `lg` (48px) for vertical section spacing to maintain a clean, breathable interface that feels premium and organized.

## Elevation & Depth

Visual depth is achieved through **Ambient Shadows** and subtle borders. The design system rejects heavy shadows in favor of light, multi-layered blurs that create a sense of the UI "floating" slightly above the surface.

- **Level 0 (Surface):** The neutral-base background.
- **Level 1 (Cards):** Standard container state. 1px border (#E2E8F0) with a soft shadow (0px 4px 20px rgba(0,0,0,0.04)).
- **Level 2 (Interaction):** Hover states for cards. The shadow becomes slightly more diffused, and the border color shifts to the primary-light tint to indicate selectability.
- **Level 3 (Modals):** High-contrast shadow to isolate the component from the background dashboard.

## Shapes

The design system employs a **Rounded** shape language (Level 2). This softened geometry counteracts the "coldness" of logistics data, making the dashboard feel more accessible.

- **Standard Buttons & Inputs:** 0.5rem (8px) radius.
- **Cards & Major Containers:** 1rem (16px) radius.
- **Status Tags/Chips:** Full pill-shape for immediate visual distinction from buttons.
- **Selection States:** Use a 4px "accent bar" on the left side of cards or list items to denote active selection without cluttering the shape with heavy fills.

## Components

### Buttons
Primary buttons use the Maritime Blue fill with white text. Secondary buttons use a ghost style with a subtle border. All buttons must have a clear transition on hover, shifting the background color by 5-10% to provide tactile feedback.

### Cards
Cards are the primary structural unit. Every card should have a header area with a `title-sm` and an optional "Action" slot for icons or menu triggers. Use plenty of internal padding (`md`) to avoid crowding information.

### Form Inputs
Inputs should be minimal with a 1px border. On focus, the border transitions to Primary Blue with a soft 2px outer glow. Labels always sit above the input field in `label-caps` style.

### High-Quality Icons
Use a consistent stroke-based icon set (2px weight). Icons should be paired with text whenever possible in navigation to ensure the UI remains intuitive.

### Data Visualization
Charts should use a refined version of the primary and secondary colors, with status colors (Green/Amber/Red) reserved strictly for performance indicators. Background grid lines on charts should be extremely subtle (#F1F5F9).