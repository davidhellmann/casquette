# Issue tracker: GitHub

Issues for this repo live in **GitHub Issues** of `davidhellmann/casquette`.
Use the `gh` CLI for all issue operations; it infers the repo from the `origin` remote.

## Operations

- **Create:** `gh issue create --title "<title>" --body-file <file>` (add `--label <label>` as needed)
- **Read:** `gh issue view <number> --comments`
- **List:** `gh issue list --state open [--label <label>] [--search "<query>"]`
- **Comment:** `gh issue comment <number> --body-file <file>`
- **Label:** `gh issue edit <number> --add-label <label>` / `--remove-label <label>`
- **Close:** `gh issue close <number> [--comment "<reason>"]`

Write issue bodies to a temp file and pass `--body-file` rather than inlining long Markdown.

## Conventions

- One issue per independently shippable unit of work.
- Reference issues in commits/PRs with `#<number>`; use `Closes #<number>` in the PR body to auto-close.
- Creating, editing, labelling or closing issues alters remote state: confirm with the user before doing it.

## PRs as a request surface

- `prs_as_requests: false`

When `false`, only issues are treated as incoming requests; pull requests are not pulled into triage.
Flip to `true` if external PRs should be treated like issues.
