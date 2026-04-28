---
name: Operational Driver System
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
  on-surface-variant: '#434653'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#737685'
  outline-variant: '#c3c6d6'
  surface-tint: '#2156ca'
  primary: '#00328a'
  on-primary: '#ffffff'
  primary-container: '#0047bb'
  on-primary-container: '#afc1ff'
  inverse-primary: '#b3c5ff'
  secondary: '#006c4a'
  on-secondary: '#ffffff'
  secondary-container: '#82f5c1'
  on-secondary-container: '#00714e'
  tertiary: '#5a2e00'
  on-tertiary: '#ffffff'
  tertiary-container: '#7c4100'
  on-tertiary-container: '#ffb273'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#00174a'
  on-primary-fixed-variant: '#003ea6'
  secondary-fixed: '#85f8c4'
  secondary-fixed-dim: '#68dba9'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Public Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Public Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  label-caps:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  touch-target-min: 48px
  gutter: 1rem
  margin-safe: 1.5rem
  stack-sm: 0.5rem
  stack-md: 1rem
---

## Brand & Style

The core personality of this design system is **Utilitarian Precision**. It is designed for drivers who operate in high-stakes, fast-paced environments where glanceability and cognitive load reduction are paramount. The brand evokes a sense of reliability, professional competence, and safety.

The design style is **Corporate / Modern** with a heavy influence from **Minimalism**. By stripping away decorative elements, we prioritize the "data-first" hierarchy. The interface utilizes high-contrast ratios and a structured layout to ensure that critical delivery information—such as ETAs and route changes—is digestible in under two seconds. The aesthetic is clean and robust, moving away from "app-like" fluff toward an "instrument-panel" level of efficiency.

## Colors

This design system utilizes a high-contrast palette optimized for varying light conditions inside a vehicle cabin. 

- **Primary Blue (#0047BB):** A deep, professional blue used for primary actions and navigational branding. It provides a stable anchor for the UI.
- **Success Green (#059669):** Reserved strictly for "Completed," "On Time," or "Delivered" statuses. It is balanced to be highly visible against light backgrounds.
- **Alert Orange (#D97706):** Used sparingly for "Delayed" or "Re-routing" updates to catch the driver's eye without causing panic.
- **Neutral Grays:** We use a Slate-based scale. `#1E293B` serves as the primary text color for maximum legibility against white or light gray surfaces.

The default mode is **Light**, providing maximum contrast under direct sunlight. However, all colors are mapped to maintain a contrast ratio of at least 4.5:1 to meet accessibility standards for professional drivers.

## Typography

We have selected **Public Sans** for this design system due to its institutional clarity and exceptional legibility at various distances. It is a neutral, rhythmic typeface that excels in tabular data and short, instructional strings.

- **Scale:** Large display sizes are used for ETAs and distances to ensure they are readable from an arm's length (mobile mount).
- **Weight:** We lean on Semi-Bold and Bold weights for data points (e.g., House Numbers, Customer Names) and Regular for labels.
- **Letter Spacing:** Headlines use slight negative tracking for tighter visual grouping, while small labels use increased tracking to prevent character "blurring" during high-vibration driving scenarios.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model with a "safe-zone" priority. Because the driver may be interacting with the device while mounted, we avoid placing critical interactive elements in the extreme corners.

- **Grid:** A standard 12-column system is used for tablet views, collapsing to a single column for mobile. 
- **Touch Targets:** A strict minimum of 48px is enforced for all interactive elements to accommodate gloved hands or shaky environments.
- **Visual Rhythm:** We use an 8px base unit. Vertical stacks prioritize "Information Density" at the top (Current Task) and "List Visibility" at the bottom (Queue).

## Elevation & Depth

To maintain a clean and distraction-free environment, this design system avoids heavy shadows. Instead, it utilizes **Tonal Layers** and **Low-contrast Outlines** to define hierarchy.

- **Surface Tiers:** The base background is slightly off-white (#F8FAFC). Primary content cards use a pure white surface with a 1px border (#E2E8F0).
- **Active State:** Elements that require immediate attention (like the "Current Delivery" card) use a subtle Primary Blue glow or a thicker 3px left-border accent.
- **Z-Index:** Modals and bottom sheets use a soft, 15% opacity ambient shadow to separate them from the map layer, ensuring the driver understands the temporary nature of the overlay.

## Shapes

The shape language is **Rounded (Level 2)**. This strikes a balance between the rigid, professional nature of logistics and the modern, user-friendly feel of a contemporary SaaS tool.

- **Cards/Buttons:** 0.5rem (8px) corner radius. This provides enough softness to be approachable but remains structured enough to align with high-density data grids.
- **Large Containers:** `rounded-xl` (24px) is reserved for bottom sheets and major dashboard panels to signify a change in context or a primary container.

## Components

### Buttons
Primary buttons are high-contrast (Blue background, White text) and always span the full width of their container on mobile to maximize the strike zone. Secondary actions use the ghost-style (Outline only).

### Status Chips
Used for "Urgent," "Pending," and "On-time." Chips use a high-saturation background with white text. For example, a "Late" status uses a bold red-orange background to immediately signal a break in the operational flow.

### Lists & Delivery Cards
Cards are the primary vehicle for delivery data. They must group the Address, Package Count, and ETA. The ETA should always be the largest typographic element on the card, positioned in the top-right corner.

### Inputs
Search bars for finding addresses and numerical inputs for package counts must feature large, clear placeholder text. Backgrounds for inputs should be slightly darker than the card surface to indicate "interactability."

### Icons
Icons must be **Linear** and **Monochromatic**. Use a consistent 2px stroke weight. Map pins, package boxes, and clock faces are the primary glyphs. Avoid filled icons unless they represent an "Active" or "Selected" state.