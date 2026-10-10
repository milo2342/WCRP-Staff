# WCRP Staff Utilities v1.2.0

## Staff onboarding
- Replaced `/staff add` with `/staff onboard`.
- Onboarding no longer fails just because the user has not joined the Staff Discord yet.
- The user is saved as onboarded immediately and receives a DM headed `Staff Onboarded` when DMs are available.
- A permanent Staff Discord record is posted before role assignment is attempted.
- When the onboarded member later joins the configured Staff Discord, their stored rank/Staff Team role is restored and a joined-after-onboarding record is posted.
- `/promotion logs` now also marks the current guild as the permanent Staff Discord log hub.
- Optional `STAFF_GUILD_ID` + `STAFF_LOG_CHANNEL_ID` can hard-lock the permanent log destination.

## Promotions and demotions
- `/promote user rank reason` is retained and now rejects same/lower-rank selections.
- Added `/demote user rank reason`; it only accepts a lower rank.
- Promotion/demotion records are sent to the permanent Staff Discord log and the user is DMed.
- Rank changes propagate across guilds where the member is present.

## Data safety
- `DATA_DIR` is supported; use `/data` with a Railway persistent volume.
- Added owner-only `/data backup` and `/data status`.
- Automatic backups are created every 6 hours and on startup.
- The latest 10 automatic JSON backups are retained.
- No runtime `store.json` is bundled in this update ZIP, so deploying it does not overwrite existing staff data.
