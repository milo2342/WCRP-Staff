# PSRP Staff Utilities — Advanced v2

Railway-safe staff management bot.

## Staff team role
When a member is assigned a staff rank via `/rank add`, `/addrank`, or `/promote`, the bot also automatically assigns:
- Role name: `WCRP | Staff team`
- Preferred role ID: `1542399313202643007`

When a staff rank is removed with `/rank remove` or the member is processed through `/staffremoval`, the bot removes the staff-team role as well.

The role ID is used when present in the current guild; the exact role name is used as a fallback because Discord role IDs are guild-specific.

## Railway
Required:
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `OWNER_IDS`

No staff/admin role IDs are required in Railway.
