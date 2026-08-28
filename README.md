# PSRP Staff Utilities – Advanced

Advanced multi-guild PSRP staff utility bot.

## RTO suspension

`/rtosuspension` suspends a member from RTO/voice activity for a chosen duration. The bot:

- creates/uses a role named **RTO Suspended**
- removes configured RTO roles listed in `RTO_ROLE_IDS` (comma-separated)
- if `RTO_ROLE_IDS` is not set, it detects removable roles whose names contain `rto`
- immediately disconnects the member from their current voice/stage channel
- denies **Connect** for the `RTO Suspended` role on all existing voice/stage channels
- applies the voice restriction to newly-created voice/stage channels while a suspension is active
- automatically expires the suspension
- restores the roles removed when the suspension began

Use `/removertosuspension` to end a suspension early and restore saved roles.

### Optional Railway variable

```env
RTO_ROLE_IDS=ROLE_ID_1,ROLE_ID_2
```

This is recommended when your RTO roles have names that do not contain `RTO` or when you want an exact allow-list.

The bot needs **Manage Roles**, **Manage Channels/permissions**, and member moderation permissions as appropriate. The bot's highest role must be above roles it needs to remove or restore.

## Rank role sharing
Run `/guild share-roles setup` in the home/source guild with comma-separated role names, for example `RTO,Moderator,Senior Moderator`. The bot stores the names (not role IDs). When a member joins another guild containing the bot, matching role names are found or created and assigned. This requires Manage Roles in destination guilds.

## Promotion notifications
Use `/promotion logs` to select the promotion announcement channel and promotion-interview log channel. `/promote` updates the stored rank, assigns a matching same-named role when available, sends a DM to the promoted member, and posts a promotion log. `/promotioninterview` records and logs the interview.

## Permissions and configuration
No `STAFF_ROLE_IDS` or `ADMIN_ROLE_IDS` Railway variables are required. Staff utility commands use Manage Server (Manage Guild) or Administrator permissions, with `OWNER_IDS` as an optional owner bypass. Local support-role configuration remains available via `/config support-role`.

`/promotion logs` is an admin command: select one channel for promotion announcements and one channel for promotion-interview logs. `/promote` and `/addrank` store the rank, assign a same-named role in the current guild when available, send the promoted staff member a DM describing the promotion, and post a promotion log when configured.

For cross-guild rank roles, run `/guild share-roles setup` in your home/source guild and enter the exact role names separated by commas. The bot stores names only. On a member joining another guild, it checks the source guild for those same role names and finds or creates matching destination roles, then assigns them.
