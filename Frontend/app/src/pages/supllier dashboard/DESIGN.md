---
name: Supply Chain Design System
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#3f4945'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#707975'
  outline-variant: '#bfc9c4'
  surface-tint: '#29695b'
  primary: '#00342b'
  on-primary: '#ffffff'
  primary-container: '#004d40'
  on-primary-container: '#7ebdac'
  inverse-primary: '#94d3c1'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#2a2e2e'
  on-tertiary: '#ffffff'
  tertiary-container: '#404444'
  on-tertiary-container: '#adb1b0'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#afefdd'
  primary-fixed-dim: '#94d3c1'
  on-primary-fixed: '#00201a'
  on-primary-fixed-variant: '#065043'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#e0e3e2'
  tertiary-fixed-dim: '#c4c7c6'
  on-tertiary-fixed: '#181c1c'
  on-tertiary-fixed-variant: '#434847'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-xl:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-bold:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '700'
    lineHeight: '1.4'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-page: 48px
  card-padding: 32px
  bento-gap: 16px
---

## Brand & Style

The brand personality of the design system is authoritative, precise, and high-velocity. It is built for a B2B logistics audience that requires institutional-grade reliability but expects a modern, editorial-quality interface. 

The design style is a hybrid of **Minimalism** and **Modern Corporate**, utilizing a high-contrast typographic hierarchy to drive focus. It avoids the cluttered "control room" aesthetic of legacy logistics software in favor of a clean, structured environment. Visual interest is generated through architectural layouts—specifically asymmetric split-screens and bento-box groupings—that organize complex data into digestible, tactile containers.

## Colors

The palette is anchored by **Deep Teal**, providing a sophisticated and stable foundation that differentiates the product from the ubiquitous blues of the SaaS industry. 

- **Primary (Deep Teal):** Used for navigation, primary actions, and key brand moments.
- **Secondary (Emerald):** Used sparingly for success states, trend indicators, and subtle gradients in status badges.
- **Neutral/Background:** A refined off-white with a slight cool tint is used for the base layer, creating a "gallery" effect for cards and data modules.
- **Data Visualization:** Use a monochromatic scale of the primary teal, supplemented by high-contrast neutrals to maintain legibility.

## Typography

The design system employs a dual-font strategy to balance character with utility. **Space Grotesk** is used for headlines to provide a technical, geometric edge that resonates with the logistics and supply chain industry. **Manrope** is used for all body text and UI labels to ensure maximum legibility in data-heavy environments.

High contrast is achieved by pairing large, bold display headings with significantly smaller, well-spaced body text. Letter spacing is tightened on large headings for an editorial feel and opened up on small labels to improve scanning.

## Layout & Spacing

The layout moves away from traditional 12-column grids toward a dynamic **Bento-box** system and **Asymmetric Splits**.

- **Bento-Box Grids:** Used for dashboard summaries. Containers should have varying aspect ratios (e.g., a 2x2 square next to a 1x2 vertical rectangle) to create a visual hierarchy of importance.
- **Asymmetric Split Screens:** For detail views, use a 70/30 split. The larger area contains the primary data (tables/charts), while the smaller sidebar contains metadata and secondary actions.
- **Overlapping Cards:** In specific editorial sections, cards should slightly overlap (using negative margins of 16-24px) to create a sense of physical depth and "stacked" logistics.
- **Whitespace:** Emphasize "luxury of space." Table rows and card containers utilize 32px internal padding to reduce cognitive load.

## Elevation & Depth

This design system uses **Soft, Layered Shadows** to define hierarchy. Shadows should not be a single drop shadow; instead, use 2-3 stacked layers with very low opacity (2-4%) to mimic natural ambient occlusion.

- **Level 1 (Base):** Subtle 1px border in a slightly darker neutral for flat elements.
- **Level 2 (Standard Cards):** A soft, diffused shadow with a large blur radius (20px+) to make cards appear to float slightly above the surface.
- **Level 3 (Overlapping/Active):** Increased shadow density and a slight vertical offset (Y-axis) to indicate the card is on top of the stack.
- **Glassmorphism:** Use a 20px backdrop blur with 80% opacity on modal overlays and floating navigation bars to maintain context of the underlying data.

## Shapes

The shape language is consistently **Rounded**, using a 0.5rem (8px) base radius. This softens the technical nature of the typography and makes the interface feel more approachable. 

Large containers (Bento-boxes and primary cards) should use `rounded-xl` (24px) to emphasize their role as distinct "modules" of information. Status badges and action buttons should maintain a consistent corner radius to ensure they feel like part of the same tactile family.

## Components

### Data Tables
Tables are the heart of the system. Remove vertical borders entirely. Use horizontal dividers with a weight of 1px in a very light neutral. Increase row height to 64px minimum to provide ample whitespace. Headers must use the `label-bold` typographic style.

### Status Badges
Move away from solid color blocks. Use a subtle linear gradient (Top-Left to Bottom-Right) using the accent color and a slightly lighter tint. Text inside badges should be high-contrast (e.g., Deep Teal text on a Mint gradient).

### Custom Charts
Charts should be stripped of non-essential axes and gridlines. Line charts use a 3px stroke width with a "smoothing" bezier curve. Area charts use a vertical gradient that fades to 0% opacity at the baseline.

### Buttons
Primary buttons use the Deep Teal background with white text. Secondary buttons utilize a "Ghost" style with a 1.5px border. All buttons include a subtle 2px scale-down transform on click to provide tactile feedback.

### Input Fields
Inputs are large (48px height) with a subtle background fill. The focus state is indicated by a 2px Deep Teal border and a very soft outer glow.