---
name: human-writing-style
description: Write prose that doesn't read as AI-generated. Use whenever producing standalone written content meant to be read as human writing — articles, wiki pages, blog posts, reports, essays, README/doc prose, PR descriptions, emails, bios, summaries. Not for code or terse chat replies. Based on Wikipedia's "Signs of AI writing" (WP:AIWRITING), which catalogs the vocabulary, sentence patterns, structure, and tone that give away LLM output.
license: Complete terms in LICENSE.txt
---

# Human Writing Style

Produces prose without the tells that mark it as machine-generated. Source: Wikipedia's community-maintained catalog of AI writing signs (`WP:AIWRITING`), distilled into rules and a self-check pass.

## When to use

Any standalone prose deliverable: articles, documentation prose, blog posts, reports, essays, bios/summaries, PR/commit descriptions, emails, README narrative sections.

Skip for: code itself, terse chat replies, structured data, and anywhere the user has already set an explicit style (a house style guide, a caveman/compressed mode, matching an existing document's voice — match that instead).

## Core rules

### 1. Cut the vocabulary tells

Never use these words/phrases — they cluster in AI output and readers now recognize them on sight:

`delve`, `crucial`, `pivotal`, `robust`, `intricate`, `landscape` (as in "the X landscape"), `tapestry`, `testament to`, `underscore(s)`, `bolster(s)`, `foster(s)`, `garner(s)`, `showcase(s)`, `align with`, `enhance`, `elevate`, `leverage` (as a verb for "use"), `unlock`, `unleash`, `navigate` (metaphorical), `journey` (metaphorical), `realm`, `game-changer`, `cutting-edge`, `state-of-the-art`, `seamless(ly)`, `holistic`, `synergy`, `paradigm shift`, `at the end of the day`, `it's important to note/remember that`, `in today's world/fast-paced world`, `in the ever-evolving`, `plays a vital/significant role`, `stands as a`, `serves as a`, `boasts`, `nestled`, `vibrant`, `rich history/tapestry`, `profound`, `groundbreaking`, `meticulous(ly)`, `comprehensive`, `multifaceted`, `nuanced`.

If a sentence needs one of these to make its point, the point is underspecified — replace it with the concrete fact.

### 2. Use plain verbs, not marketing verbs

Say "is," "has," "does," "shows." Don't dress up a copula:
- Not: "The tool serves as a solution for X" → "The tool does X."
- Not: "This feature functions as a way to enhance Y" → "This feature improves Y."
- Not: "The report offers insights into Z" → "The report covers Z" or just state the insight.

### 3. Kill these sentence patterns

- **Negative parallelism**: "not just X, but Y" / "not X, but Y" / "X, not Y" — used to sound insightful while saying little. State the fact plainly instead.
- **Rule of three**: reflexive triplets ("fast, reliable, and scalable") padding a claim instead of arguing it. Use exactly as many items as are true and relevant — one, two, five, whatever it is.
- **Undue-significance framing**: "marks a pivotal moment," "represents a significant shift," "underscores the importance of." Either cite what specifically changed, or cut the sentence.
- **Outline-conclusion template**: "Despite its [positives], X faces [challenges]..." as a rote closer. Don't manufacture a balanced-conclusion paragraph if the source material doesn't call for one.
- **Weasel attribution**: "industry reports suggest," "many experts believe," "observers note." Name the source or drop the claim.
- **Throat-clearing openers**: "It's worth noting that," "In conclusion," "Overall," "In summary" as a reflex rather than because a summary is actually needed.

### 4. Formatting discipline

- Sentence case in headings, not Title Case ("Setting up the database", not "Setting Up The Database") — unless the surrounding doc already uses Title Case throughout.
- Bold is for genuine emphasis, not a mechanical tag on every key term. If everything is bold, nothing is.
- Don't default to bullet lists of `**Bolded label:** description` for content that's actually prose. If the ideas connect causally or narratively, write sentences and paragraphs — bullets are for genuinely parallel, independent items.
- Straight quotes and apostrophes (`'`, `"`), not curly/smart-quote unicode, unless the target format expects it.
- Use em dashes sparingly — one or two per document, not one per paragraph. A comma, period, or parenthetical usually works.
- Don't invent extra heading levels or horizontal rules to impose structure a short document doesn't need.

### 5. Tone

- No promotional or travel-brochure language for ordinary subjects ("nestled in the heart of," "boasts a rich history," "a vibrant hub of"). Describe what's actually there.
- No unearned emphasis on legacy/significance/impact. State what happened; let the reader judge importance.
- Don't address the reader as a collaborator ("let's dive into," "we'll explore together") unless the piece is genuinely conversational/instructional in that register.
- Match confidence to evidence — don't launder speculation into "highlights the growing importance of X."
- Vary sentence length and structure naturally. Don't over-correct with synonym-swapping (elegant variation) just to avoid repeating a word — repeating the right word is clearer than reaching for a thesaurus synonym.

## Self-check pass

Before delivering prose, reread it once specifically hunting for these tells and fix what you find:

1. Any word from the banned list in `references/banned-words.md`?
2. Any sentence that could lose "not just... but" / rule-of-three padding with no loss of meaning?
3. Any heading in Title Case, any bullet list that's secretly a paragraph, any bold on every other phrase?
4. Any claim attributed to "experts"/"observers"/"reports" with no actual named source?
5. Does the ending manufacture a "despite challenges, the future looks promising" wrap-up nobody asked for?
6. Read it aloud in your head — does a sentence sound like something a person would actually say, or like a press release?

If the piece still sounds like AI output after this pass, the fix is usually to cut — remove the hedge, the summary sentence, the triplet, the significance claim — not to rephrase.

## Reference

`references/banned-words.md` — full word/phrase list, grouped, for a quick scan or grep pass over a draft.
