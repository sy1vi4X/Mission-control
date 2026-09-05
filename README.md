# Mission Control

A personal task dashboard and installable static PWA. The deployed application is `index.html`; the older `app/` and Vinext scaffold are not the production entrypoint.

## Run and test

- `npm run dev` serves the app locally on port 4173.
- `npm run build` copies static assets into `dist/`.
- `npm test` builds, checks PWA assets/HTML/JavaScript, and runs deterministic task workflow regressions. No dependency installation is needed for these scripts.

Vercel uses `vercel.json`: no framework, `npm run build`, output `dist`. Production is https://mission-control-eight-flax.vercel.app/ . A push to the configured production branch is a release action and must follow verification and required checks.

Tasks and settings stay in the current browser and origin. Keys remain `mission-control.tasks.v1`, `mission-control.initialized.v1`, and `mission-control.settings.v1`; switching origin does not transfer tasks. Existing data is not migrated.

Search appears below priority filters and combines with the selected task view. Deadline chips show overdue, today, the next seven days (today plus six), or undated tasks. The Add & keep open action clears only the title and retains the chosen priority/deadline for the next task. Completion, restore and confirmed deletion offer Undo at the bottom; up to 20 actions are retained until page refresh or dismissal. Saved tasks persist independently of this temporary undo history.

See `UPDATE-2026-09-05.md` for reproduction evidence, exact verification coverage, outstanding release gates and rollback instructions. This checkout's update is not yet published.
