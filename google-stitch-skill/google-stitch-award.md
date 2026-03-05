---
name: google-stitch-award
description: Use this skill whenever a user wants to design a website, app UI, or digital interface — especially when they want it to look exceptional, award-winning, or professional. Trigger for ANY mention of: Google Stitch, designing a website, creating a UI or app screen, building a prototype or mockup, text-to-UI, wireframe-to-code, "make it look amazing", "award-winning design", "Awwwards style", "world-class website", "I want it to stand out", or any request to go from idea to visual interface. This skill combines the full Google Stitch workflow with award-winning web design principles from Awwwards, Webby Awards, and CSS Design Awards — use it aggressively whenever design quality matters.
---

# Google Stitch + Award-Winning Website Design

This skill combines two things:
1. **How to use Google Stitch** — Google Labs' AI tool that turns prompts and images into UI designs and frontend code
2. **Award-winning design principles** — what separates Awwwards/Webby winners from ordinary sites

Use both together: Stitch to generate fast, award-winning principles to guide every design decision.

---

## Part 1: What Makes a Website Award-Worthy

Award judges (Awwwards, Webby Awards, CSS Design Awards, FWA) score on four pillars:

### 1. Visual Design
- **Bold, purposeful typography** — oversized display fonts dominate hero sections; variable fonts animate with scroll or cursor. Mix serif + sans-serif with contrast
- **Intentional color** — either restrained (monochrome + one accent) or dramatically bold (dark + neon glows). Avoid generic gradient soup
- **Whitespace as a design element** — negative space creates breathing room and focuses attention
- **Every element earns its place** — remove anything that doesn't serve the story or action

### 2. Interaction & Motion
- **Scroll-driven storytelling** — content reveals, scene transitions, and video playback triggered by scroll position
- **Micro-interactions** — hover states, cursor effects, button feedback. These signal quality
- **Kinetic typography** — letters that scatter, reform, or react to cursor movement
- **Parallax depth** — layered elements at different scroll speeds create immersion
- **3D / WebGL** — product configurators, immersive environments, physics-based interactions (high bar; optimize aggressively for mobile)
- **Rule**: Motion must enhance clarity or emotion — never add animation just to impress

### 3. User Experience
- **The 5-second rule**: visitors know exactly what the site is and what to do within 5 seconds
- **Intuitive navigation** even in creative/experimental layouts
- **Content-first hierarchy**: every visual choice amplifies the message, never drowns it
- **Mobile-first and touch-polished**: judges test on phones. Sites that feel clunky on mobile are rejected
- **Performance**: LCP < 2.5s, CLS < 0.1. Stunning design cannot compensate for slow load

### 4. Originality
- **Judges see hundreds of template-based sites** — something genuinely new gets attention
- Winning concepts include: playable 3D environments (Bruno Simon portfolio), immersive AR (1917 film site), scroll-controlled cinematic narratives, typography-only designs that tell the full story
- **Strong concept > polished execution of a generic idea**

---

## Part 2: Award-Winning Design Patterns (What Winners Actually Do)

| Pattern | How to Apply |
|---|---|
| **Cinematic hero** | Full-bleed video/image + oversized plain typography on top |
| **Scrollytelling** | Narrative unfolds section by section as user scrolls |
| **Dark + glow** | Dark background, neon/gradient glowing accents, high-tech feel |
| **Typography-only** | Bold sans-serif headlines carry the entire design with minimal imagery |
| **Immersive 3D** | WebGL scenes, product explorers, physics interactions |
| **Emotional journey** | Audio + motion + visual touchpoints guide users through a story |
| **Minimalism with purpose** | Strip to essentials — every remaining element is perfect |
| **Custom cursor** | Cursor becomes part of the experience, reacts to elements |

**What's falling out of favor (avoid):**
- Bento grid layouts (oversaturated)
- Complex animations that hurt performance
- Generic gradients as dominant elements
- Brutalism for non-niche brands

---

## Part 3: Google Stitch — The Rapid Prototyping Engine

**Access**: stitch.withgoogle.com (free, Google account required)

Stitch turns text prompts or uploaded images into mobile/web UI designs + frontend code, powered by Gemini 2.5.

### Two Modes

| | Standard Mode | Experimental Mode |
|---|---|---|
| **Model** | Gemini 2.5 Flash | Gemini 2.5 Pro |
| **Input** | Text only | Text + image uploads |
| **Figma Export** | ✅ Yes | ❌ No |
| **Monthly limit** | 350 generations | 50 generations |
| **Best for** | Speed, iteration, Figma handoff | Sketch/wireframe → digital UI |

---

## Part 4: The Combined Workflow — From Idea to Award-Worthy Design

### Step 1: Define the Design Concept (Before Opening Stitch)
Answer these before prompting:
- **What is the one thing this site/screen must communicate?**
- **What emotion should users feel?** (inspired, calm, excited, trusted)
- **Who is the user and what do they do first?**
- **What visual treatment fits the brand?** (cinematic, minimal, typographic, immersive)

### Step 2: Write an Award-Guided Stitch Prompt

Use the **Concept → Context → Screen → Design** framework:

```
Concept: [The feeling or story this design should evoke]
Context: [Product type] for [target user] that [core value]
Screen: [Specific screen] with [key elements and hierarchy]
Design: [Visual treatment], [color palette], [typography style], 
        [motion/interaction intent], [platform]
```

**Ordinary prompt:**
> "A dark mobile finance app dashboard."

**Award-guided prompt:**
> "Concept: Calm confidence — money management that feels effortless.
> Context: Mobile personal finance app for young professionals.
> Screen: Main dashboard showing balance hero number, weekly spending trend line, and 3 recent transactions.
> Design: Deep navy background, electric teal accents, oversized bold balance number as hero element, cards with subtle glow borders, bottom nav with active state animation. Generous whitespace. Mobile."

### Step 3: Generate in Stitch
- Use **Standard mode** for Figma export workflow
- Use **Experimental mode** for image/sketch input or maximum fidelity
- Review multiple variants — look for which has the strongest visual hierarchy
- ~90 seconds per generation

### Step 4: Evaluate Against Award Criteria
Before iterating, score the output:
- [ ] **5-second test**: Is the purpose immediately clear?
- [ ] **Hierarchy**: Does the eye flow naturally to the most important element?
- [ ] **Originality**: Does anything here feel genuinely distinctive?
- [ ] **Whitespace**: Is there room to breathe?
- [ ] **Typography**: Is type doing meaningful work, or is it just labels?
- [ ] **Motion potential**: Where would a micro-interaction or scroll animation add emotion?

### Step 5: Iterate with Precision Prompts
Target specific weaknesses:
- "Make the hero number much larger — it should be the first thing the eye goes to"
- "Add more whitespace between the cards — it feels cluttered"
- "Change nav to use pill-shaped active states with a glow effect"
- "The typography feels generic — use a bold geometric sans-serif for headings"
- Use multi-select to apply style changes across all screens simultaneously

### Step 6: Export and Elevate
- **→ Figma** (Standard mode): Paste directly; then apply brand tokens, refine spacing, add real content
- **→ Code** (both modes): HTML + Tailwind CSS as a base; add GSAP for scroll animations, Lottie for micro-interactions
- **→ Prototype**: Link screens for stakeholder demos

**Post-export elevation checklist:**
- Add scroll-triggered animation (GSAP ScrollTrigger)
- Implement hover micro-interactions on interactive elements
- Optimize all images to WebP/AVIF
- Test on real mobile devices (not just browser emulation)
- Run Lighthouse audit — target 90+ performance score
- Test keyboard navigation and screen reader compatibility

---

## Part 5: Award-Winning Prompt Library

### Startup / SaaS Product
```
Concept: Confident simplicity — powerful software that feels effortless.
Context: B2B project management SaaS for remote teams.
Screen: Hero homepage section with bold headline, product screenshot, and single CTA.
Design: White background, deep indigo accent, oversized bold headline as anchor, 
        subtle product UI mockup floating with soft shadow, generous padding. 
        Clean sans-serif. Desktop web.
```

### Creative Agency / Portfolio
```
Concept: Striking first impression — this studio is not like the others.
Context: Digital design studio portfolio.
Screen: Homepage hero — studio name, tagline, and featured project thumbnail.
Design: Black background, white oversized display serif typography, 
        single high-contrast project image, cursor dot that follows mouse.
        Minimal — only 3 elements visible on load. Desktop.
```

### E-commerce / Product
```
Concept: Luxury editorial — buying this feels like reading Vogue.
Context: Premium skincare brand product page.
Screen: Product hero showing product image, name, price, and add-to-cart.
Design: Warm cream background, deep forest green accents, editorial 
        full-bleed product photography, elegant serif font for product name,
        minimal UI elements. Lots of breathing room. Mobile.
```

### Restaurant / Hospitality
```
Concept: Appetite before they arrive — design that makes you hungry.
Context: Fine dining restaurant website.
Screen: Homepage with hero food image, restaurant name, and reservation CTA.
Design: Dark moody background, warm amber accents, cinematic full-bleed food 
        photography, italic serif restaurant name, single prominent booking button.
        Scroll hint at bottom. Mobile.
```

---

## Part 6: Technical Excellence Checklist (For Award Submission Readiness)

**Performance**
- [ ] LCP < 2.5 seconds (test with PageSpeed Insights)
- [ ] CLS < 0.1 (no layout shift)
- [ ] Images in WebP/AVIF format with lazy loading
- [ ] Code splitting for JS bundles

**Interaction**
- [ ] All hover states defined (buttons, links, cards, nav items)
- [ ] Scroll animations implemented (GSAP, CSS scroll-driven animations)
- [ ] Touch interactions match cursor interactions in quality
- [ ] Custom cursor (if brand-appropriate)

**Accessibility**
- [ ] WCAG 2.1 AA contrast ratios
- [ ] Alt text on all images
- [ ] Keyboard navigable (Tab order logical)
- [ ] Screen reader tested

**Mobile**
- [ ] Tested on real iOS + Android devices
- [ ] Touch targets minimum 44×44px
- [ ] No horizontal scroll
- [ ] Font sizes readable without zooming

---

## Part 7: Stitch Limitations & How to Overcome Them

| Limitation | Workaround |
|---|---|
| Web design quality inconsistent | Use mobile mode first, adapt for web in Figma |
| Max 2–3 screens effectively | Plan screen flow before prompting; do one section at a time |
| No motion/animation output | Mark animation intent in Figma notes; implement with GSAP post-export |
| HTML + Tailwind CSS only | Use as structural base; layer animation libraries on top |
| No brand token auto-apply | Create a Figma design system first; apply tokens after export |
| Generic layout defaults | Front-load visual concept in prompt; be very specific about hierarchy |

---

## When Helping a User Design Something

1. **Ask for the concept first** — what feeling or story should the design tell?
2. **Help craft an award-guided prompt** using the Concept → Context → Screen → Design framework
3. **Recommend Stitch mode** based on their workflow (Figma handoff vs code vs image input)
4. **After generation, evaluate against the award criteria checklist**
5. **Write precision follow-up prompts** targeting specific weaknesses
6. **Advise on post-export elevation**: what animations, interactions, and performance optimizations to add
7. **Remind them**: Stitch is the ideation accelerator — human craft and post-export polish are what cross the finish line to award-worthy
