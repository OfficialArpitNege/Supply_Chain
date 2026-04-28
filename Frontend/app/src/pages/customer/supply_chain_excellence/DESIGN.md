---
name: Supply Chain Excellence
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#42474f'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#727780'
  outline-variant: '#c2c7d1'
  surface-tint: '#2d6197'
  primary: '#00355f'
  on-primary: '#ffffff'
  primary-container: '#0f4c81'
  on-primary-container: '#8ebdf9'
  inverse-primary: '#a0c9ff'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
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
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#ffdcc4'
  tertiary-fixed-dim: '#ffb780'
  on-tertiary-fixed: '#2f1400'
  on-tertiary-fixed-variant: '#6f3800'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  title-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-tabular:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 32px
  xl: 48px
  gutter: 24px
  margin: 32px
---

## Brand & Style

This design system is built upon a **Corporate Modern** aesthetic, tailored specifically for the complexities of global logistics and supply chain management. The primary objective is to instill a sense of absolute reliability and operational clarity. It balances "Enterprise-grade" robustness with a user-friendly layer that prioritizes information density without causing cognitive overload.

The style utilizes a "Functional Minimalism" approach: maximizing white space to separate complex data sets while employing subtle tonal shifts to define hierarchy. The emotional response should be one of control, precision, and trust—essential for users managing high-stakes shipments and inventory.

## Colors

The color palette centers on **Classic Blue**, a shade synonymous with stability and professional integrity. 

- **Primary Blue:** Used for critical actions, navigation anchors, and primary branding elements.
- **Professional Greys:** A scale of cool-toned slates and greys manages the background layers and secondary text, ensuring a sophisticated, non-distracting environment.
- **Semantic Status Colors:** These are high-chroma but professional. **Emerald Green** denotes completed shipments or healthy stock; **Amber** signifies pending actions or transit delays; **Rose Red** is reserved for critical disruptions or failed deliveries.
- **Surface Colors:** A crisp white (#FFFFFF) is used for content cards, set against a very light grey (#F8FAFC) application background to provide soft contrast.

## Typography

The typography system leverages **Inter** for its exceptional legibility in data-heavy environments. The tall x-height and neutral character make it ideal for reading long tables of tracking numbers and SKU data.

A strict hierarchy is maintained through weight and spacing. Titles use a tighter letter-spacing for a modern feel, while small labels use uppercase with increased tracking to ensure readability at small scales. For numerical data in tables, the system defaults to tabular (monospaced) figures to ensure that columns of numbers align perfectly for quick scanning.

## Layout & Spacing

This design system utilizes a **12-column fluid grid** for the main content area, allowing the dashboard to scale from laptop screens to large logistics monitors. 

The spacing rhythm is based on an **8px linear scale**, ensuring consistent alignment across components. 
- **Containers:** Dashboard widgets use 24px internal padding.
- **Sidebars:** A fixed-width left navigation (280px) provides a constant anchor for the user.
- **Data Tables:** Horizontal cell padding is set to 16px to allow for high information density without visual crowding.

## Elevation & Depth

To maintain an enterprise-grade feel, the design system avoids heavy shadows, instead using **Tonal Layers** and **Low-Contrast Outlines**.

- **Level 0 (Background):** Solid neutral grey (#F8FAFC).
- **Level 1 (Cards/Widgets):** Pure white background with a 1px solid border (#E2E8F0). No shadow.
- **Level 2 (Dropdowns/Popovers):** Pure white with a 1px border and a soft, diffused ambient shadow (0px 4px 20px rgba(0,0,0,0.05)) to suggest interaction.
- **Active State:** Elements being dragged or interacted with receive a subtle primary-colored glow or a thicker border to indicate focus.

## Shapes

The shape language is **Soft** and professional. A standard radius of 4px (0.25rem) is applied to all primary UI elements like input fields, buttons, and small cards. 

This subtle rounding provides a modern touch that feels approachable without losing the "architectural" precision required for a logistics platform. Large dashboard containers may use a slightly more pronounced 8px radius (rounded-lg) to soften the overall interface composition.

## Components

- **Input Fields:** Use a white background with a Slate-300 border. Labels are positioned above the field in `body-sm` bold. Focus states must use a 2px Primary Blue ring.
- **Data-Rich Tables:** Row heights are kept compact (48px). Headers use `label-caps` with a light grey background tint (#F1F5F9). Alternate row striping is optional, but 1px horizontal dividers are mandatory.
- **Progress Flows:** Horizontal steppers for tracking. Completed segments use Primary Blue; active segments use a Blue pulse; upcoming segments use Slate-200. Icons (e.g., Warehouse, Truck, Delivered) should be simple, 20px strokes.
- **Status Chips:** Small, pill-shaped indicators with a subtle background tint (10% opacity of the status color) and high-contrast text.
- **Primary Buttons:** Solid Primary Blue with white text. Hover states shift to a 10% darker shade. 
- **Tracking Timeline:** A vertical component for order history details, using a continuous 2px vertical line connecting status nodes.