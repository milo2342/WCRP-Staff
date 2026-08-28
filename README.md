# PSRP Staff Utilities – Advanced Rank Edition

This build uses hard-coded WCRP staff rank names and does not require staff/admin role IDs in Railway.

## Hard-coded staff ranks
- WCRP | Trial Moderator
- WCRP | Moderator
- WCRP | Senior Staff (permission role, not a rank) Team
- WCRP | Senior Moderator
- WCRP | Junior Staff
- WCRP | Senior Staff (permission role, not a rank)
- WCRP | Junior Administrator
- WCRP | Administrator
- WCRP | Senior Administrator

The parent staff role is `WCRP | Staff Team`.

## Staff commands
- `/staff add` – add a member to staff at a hard-coded rank, assign the rank role and WCRP | Staff Team, DM the member, and log the action.
- `/staff remove` – remove the member's stored staff rank and WCRP | Staff Team role.
- `/rank add` / `/rank remove` – retained for compatibility; rank selection is restricted to the same hard-coded ranks.
- `/promote` – uses the same hard-coded rank list.

## Cross-guild role sync
`/guild share-roles setup` now uses the hard-coded rank names rather than a free-form rank list. Matching roles are found/created by name in other guilds where the bot has Manage Roles.

## Staff invite
Promotion/staff DMs include https://discord.gg/qVtySCFwkE

## Railway
Required environment variables:
- DISCORD_BOT_TOKEN
- DISCORD_CLIENT_ID
- OWNER_IDS (optional for owner-only actions)

No STAFF_ROLE_IDS or ADMIN_ROLE_IDS variables are required by this build.
