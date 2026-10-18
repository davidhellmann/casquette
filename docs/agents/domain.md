# Domain docs

**Layout: single-context.** The whole repo is one bounded context.

- Glossary: `GLOSSARY.md` (repo root)
- Architecture Decision Records: `docs/adr/NNNN-kebab-title.md`
- Visual design system: `DESIGN.md` (repo root)
- Feature docs (rules and contracts of the domain modules): `docs/ride.md`, `docs/dashboard-period.md`

Glossary and ADRs are created lazily: if they don't exist yet, create them the first time a term or decision needs recording.

## Rules for consumers (agents & skills)

1. **Read before naming.** Before naming a module, type, function, or issue, check `GLOSSARY.md`. Use its terms exactly; don't invent synonyms.
2. **Domain language is English.** Terms come from the product (e.g. *Ride*, *Bike*, *Sync*, *Streams*, *Zones*, *Athlete history*, *Power curve*, *Goals*, *Segments*). Never introduce German names.
3. **Add terms when they appear.** When a new domain concept gets a name, or a fuzzy term is sharpened, update `GLOSSARY.md` in the same change.
4. **Respect ADRs.** Read `docs/adr/` in the area you touch. Don't propose changes that an ADR rules out unless the friction is real; then flag the conflict explicitly ("contradicts ADR-NNNN, because …").
5. **Record load-bearing decisions.** When a decision would be needed by a future reader to avoid re-litigating it, offer to write an ADR (context, decision, consequences). Skip ephemeral or self-evident ones.
6. **UI changes follow `DESIGN.md`.** Reuse its building blocks and recipes for new pages, cards, charts and tables; colours only via tokens and `SERIES` (pink by default, grey for the rest). When a new pattern is really needed, add it once as a component and a line in `DESIGN.md`.
