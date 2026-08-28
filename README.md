# WCRP Staff Utilities — Existing Roles Only

This build never creates staff/rank roles or the RTO Suspended role automatically.

The bot expects the following roles to already exist in each server:
- The hard-coded WCRP staff rank names
- `WCRP | Staff Team`
- `WCRP | Senior Staff`
- `RTO Suspended` if using RTO suspension

Shared-role syncing is by exact role name. When a member is synced into another guild, the bot searches for the existing role with that name and assigns it if the role is editable. If the role is missing, it reports/skips it instead of creating a new role.

The bot requires the usual Discord permissions for the role actions you use, including Manage Roles.
