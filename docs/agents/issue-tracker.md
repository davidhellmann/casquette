# Issue tracker: local Markdown

Issues for this repo are local Markdown files in `.scratch/issues/`. That folder is gitignored, so issues never reach the public repository. Do not create GitHub issues or pull requests for planning; GitHub Issues of the public repo stay reserved for outside reports.

## Layout

One file per issue: `.scratch/issues/NNNN-kebab-title.md`, numbered upwards from the highest existing number (start at `0001`). Create the folder lazily.

```markdown
---
title: Short imperative title
status: needs-triage # a label from docs/agents/triage-labels.md, or `done`
created: 2026-01-31
---

## What

…

## Why

…

## Notes

- 2026-02-01: progress, decisions, links to commits
```

## Operations

- **Create:** write a new file with the next number and `status: needs-triage` (or a more specific label when the issue is already clear).
- **Read / list:** read the files; filter by the `status` line (`rg -l '^status: ready-for-agent' .scratch/issues`).
- **Comment:** append a dated bullet under `## Notes`.
- **Label:** change the `status` line.
- **Close:** set `status: done` (or `wontfix`) and add a closing note with the commit that resolved it.

## Conventions

- One issue per independently shippable unit of work.
- Reference issues in commit messages by file name (e.g. `issue 0007`), not by `#<number>` – there are no GitHub numbers.
- Issue files may describe the rider's own data; that is why they stay local. Never copy personal data from them into tracked files.

## PRs as a request surface

- `prs_as_requests: false`

Pull requests are not pulled into triage.
