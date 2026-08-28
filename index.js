require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType
} = require('discord.js');

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const STAFF_DISCORD_INVITE = 'https://discord.gg/qVtySCFwkE';
const STAFF_TEAM_ROLE_IDS = new Set(['1542399313202643007', '1530291059240992771']);
const STAFF_TEAM_ROLE_NAME = 'WCRP | Staff Team';
const SENIOR_STAFF_ROLE_IDS = new Set(['1542399306500149329', '1530291059261968436']);
const SENIOR_STAFF_ROLE_NAME = 'WCRP | Senior Staff';
const ADMIN_PLUS_RANKS = new Set(['WCRP | Junior Administrator', 'WCRP | Administrator', 'WCRP | Senior Administrator']);
const HARD_CODED_RANKS = [
  'WCRP | Trial Moderator',
  'WCRP | Moderator',
  'WCRP | Senior Staff Team',
  'WCRP | Senior Moderator',
  'WCRP | Junior Staff',
  'WCRP | Junior Administrator',
  'WCRP | Administrator',
  'WCRP | Senior Administrator'
];
const TMOD_PROMOTION_HOURS = 2;
const TMOD_RANK = 'WCRP | Trial Moderator';
const MODERATOR_RANK = 'WCRP | Moderator';
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadStore() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { guilds: {}, users: {}, roleShares: {}, approvals: {} }; }
}
let store = loadStore();
function saveStore() { fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2)); }
function gid(id) { return store.guilds[id] ??= { settings: {}, users: {}, staff: {}, logs: {}, counters: {} }; }
function uid(userId, guildId) { const g=gid(guildId); return g.users[userId] ??= { hours:0, rank:'', strikes:[], punishments:[], flags:[], praise:[], blacklist:null, removals:[], notes:[], evaluation:null, bonuses:[], deaths:0, lastSeen:null }; }
function ownerIds() { return (process.env.OWNER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean); }
function configuredRoleIds(kind) { return (process.env[kind]||'').split(',').map(s=>s.trim()).filter(Boolean); }
function rtoRoleIds() { return (process.env.RTO_ROLE_IDS||'').split(',').map(s=>s.trim()).filter(Boolean); }
function hasRole(member, ids) { return !!member && ids.some(id=>member.roles.cache.has(id)); }
function isOwner(member) { return !!member && ownerIds().includes(member.id); }
function isStaff(member) { return !!member && (isOwner(member) || member.permissions.has(PermissionFlagsBits.ManageGuild)); }
function isAdmin(member) { return !!member && (isOwner(member) || member.permissions.has(PermissionFlagsBits.Administrator)); }
function ensureGuild(interaction) { return gid(interaction.guildId); }
function fmtHours(n) { return `${Number(n||0).toFixed(2)}h`; }
function parseDuration(input) {
  const m = /^(\d+(?:\.\d+)?)\s*(m|min|h|hr|d|day|w|wk)$/i.exec(String(input||'').trim());
  if (!m) return null;
  const n=Number(m[1]), u=m[2].toLowerCase();
  return n * ({m:1/60,min:1/60,h:1,hr:1,d:24,day:24,w:168,wk:168}[u]);
}
function ts(ms) { return `<t:${Math.floor(ms/1000)}:R>`; }
function embed(title, description, color=0x8b5cf6) { return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp(); }
function audit(guildId, text) { const g=gid(guildId); (g.logs.audit ??= []).push({ at:new Date().toISOString(), text }); g.logs.audit=g.logs.audit.slice(-300); saveStore(); }
async function reply(interaction, payload) { if (interaction.deferred || interaction.replied) return interaction.editReply(payload).catch(()=>null); return interaction.reply(payload).catch(()=>null); }
function ok(title, description, fields=[]) { const e=embed(title,description,0x22c55e); if(fields.length)e.addFields(fields); return e; }
function err(title, description) { return embed(title,description,0xef4444); }

const commands = [];
const add = c => commands.push(c);

add(new SlashCommandBuilder().setName('activestaff').setDescription('Show currently on-duty staff and their idle time'));
add(new SlashCommandBuilder().setName('addhours').setDescription("Add hours to a user's current week").addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addNumberOption(o=>o.setName('hours').setDescription('Hours to add').setRequired(true).setMinValue(0.01)));
add(new SlashCommandBuilder().setName('removehours').setDescription("Remove hours from a user's current week").addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addNumberOption(o=>o.setName('hours').setDescription('Hours to remove').setRequired(true).setMinValue(0.01)));
add(new SlashCommandBuilder().setName('requesthours').setDescription('Request additional hours for yourself').addNumberOption(o=>o.setName('hours').setDescription('Hours requested').setRequired(true).setMinValue(0.01)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)));
add(new SlashCommandBuilder().setName('staff').setDescription('Manage staff membership and ranks').addSubcommand(sc=>sc.setName('add').setDescription('Add a user to the staff team at a selected rank').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(o=>o.setName('rank').setDescription('Staff rank').setRequired(true).setAutocomplete(true))).addSubcommand(sc=>sc.setName('remove').setDescription('Remove a user from the staff team').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Optional reason'))));
add(new SlashCommandBuilder().setName('rank').setDescription('Manage staff ranks').addSubcommand(sc=>sc.setName('add').setDescription('Assign a staff rank').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(o=>o.setName('rank').setDescription('Rank').setRequired(true).setAutocomplete(true))).addSubcommand(sc=>sc.setName('remove').setDescription('Remove a staff rank').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true))));
add(new SlashCommandBuilder().setName('promote').setDescription('Promote a staff member, assign the matching rank role, and DM them').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(o=>o.setName('rank').setDescription('New rank').setRequired(true).setAutocomplete(true)).addStringOption(o=>o.setName('reason').setDescription('Optional promotion reason')));
add(new SlashCommandBuilder().setName('bancount').setDescription('Show how many Discord users are banned in this guild'));
add(new SlashCommandBuilder().setName('clockrepair').setDescription('Repair a staff clock session').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)));
add(new SlashCommandBuilder().setName('deaths').setDescription('View recent death or kill log summary'));
add(new SlashCommandBuilder().setName('dms').setDescription('Manage DM proof workflow').addSubcommand(sc=>sc.setName('status').setDescription('View DM proof setting')).addSubcommand(sc=>sc.setName('set').setDescription('Enable/disable DM proof').addBooleanOption(o=>o.setName('enabled').setDescription('Enabled').setRequired(true))));
add(new SlashCommandBuilder().setName('evaluate').setDescription('View or record evaluation status').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(o=>o.setName('status').setDescription('Optional status to set')));
add(new SlashCommandBuilder().setName('hourmultiplier').setDescription('Start a 1.5x hour multiplier').addStringOption(o=>o.setName('duration').setDescription('Duration e.g. 2h').setRequired(true)));
add(new SlashCommandBuilder().setName('stophourmulti').setDescription('Stop the active hour multiplier'));
add(new SlashCommandBuilder().setName('logbonus').setDescription('Submit a bonus request for approval').addNumberOption(o=>o.setName('amount').setDescription('Bonus value/hours').setRequired(true).setMinValue(0.01)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)));
add(new SlashCommandBuilder().setName('passivehours').setDescription('View passive hour status and breakdown for a user').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)));
add(new SlashCommandBuilder().setName('praise').setDescription('Player-fed feedback leaderboard for staff').addUserOption(o=>o.setName('user').setDescription('Optional staff member')).addStringOption(o=>o.setName('message').setDescription('Praise text')));
add(new SlashCommandBuilder().setName('promotions').setDescription('List staff eligible for promotion based on config'));
add(new SlashCommandBuilder().setName('promotioninterview').setDescription('Log a promotion interview').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(o=>o.setName('result').setDescription('Result').setRequired(true)).addStringOption(o=>o.setName('notes').setDescription('Notes')));
add(new SlashCommandBuilder().setName('punishmenthistory').setDescription("View a user's in-game punishment history").addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)));
add(new SlashCommandBuilder().setName('removepunishment').setDescription("Remove a punishment from a user's history").addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)).addIntegerOption(o=>o.setName('index').setDescription('Punishment number').setRequired(true).setMinValue(1)));
add(new SlashCommandBuilder().setName('removeblacklist').setDescription('Remove a staff blacklist from a user').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)));
add(new SlashCommandBuilder().setName('removestaffremoval').setDescription('Remove an active staff removal so the user can rejoin').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)));
add(new SlashCommandBuilder().setName('removestrike').setDescription('Remove a staff strike from a user').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)).addIntegerOption(o=>o.setName('index').setDescription('Strike number').setRequired(true).setMinValue(1)));
add(new SlashCommandBuilder().setName('staffblacklist').setDescription('Blacklist a user from staff').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)));
add(new SlashCommandBuilder().setName('staffnextweek').setDescription('Advance staff week tracking to next week').addUserOption(o=>o.setName('user').setDescription('Optional staff member')));
add(new SlashCommandBuilder().setName('staffremoval').setDescription('Remove a user from staff (temporary role + kick)').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)));
add(new SlashCommandBuilder().setName('staffstrike').setDescription('Issue a staff strike (7-day temporary role)').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)));
add(new SlashCommandBuilder().setName('supportteam').setDescription('List all members in the Support Team'));
add(new SlashCommandBuilder().setName('tmodpromos').setDescription('View Trial Moderator promotion eligibility').addUserOption(o=>o.setName('user').setDescription('Optional staff member')));
add(new SlashCommandBuilder().setName('promote-all-tmods').setDescription('Start interview workflows for every eligible Trial Moderator'));
add(new SlashCommandBuilder().setName('unban').setDescription('Unban a player by their ban ID').addStringOption(o=>o.setName('user-id').setDescription('User ID').setRequired(true)));
add(new SlashCommandBuilder().setName('unjoin').setDescription("Release a user's active staff join and remove its punishment history").addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)));
add(new SlashCommandBuilder().setName('rtosuspension').setDescription('Suspend a user from RTO and voice channels for a set duration').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)).addStringOption(o=>o.setName('duration').setDescription('Duration e.g. 30m, 2h, 7d').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false));
add(new SlashCommandBuilder().setName('removertosuspension').setDescription('Remove RTO suspension and restore suspended roles').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false));

const pf = new SlashCommandBuilder().setName('passiveflags').setDescription('Manage unresolved passive flags')
  .addSubcommand(sc=>sc.setName('list').setDescription('View all unresolved flags'))
  .addSubcommand(sc=>sc.setName('resolve').setDescription('Mark a flag as resolved').addIntegerOption(o=>o.setName('index').setDescription('Flag number').setRequired(true).setMinValue(1)))
  .addSubcommand(sc=>sc.setName('user').setDescription('View flags for a specific user').addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)));
add(pf);

const cfg = new SlashCommandBuilder().setName('config').setDescription('Configure this guild')
  .addSubcommand(sc=>sc.setName('log-channel').setDescription('Set audit/log channel').addChannelOption(o=>o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(sc=>sc.setName('staff-role').setDescription('Set a local staff role').addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)))
  .addSubcommand(sc=>sc.setName('support-role').setDescription('Set a local support role').addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)))
  .addSubcommand(sc=>sc.setName('promotion-hours').setDescription('Set weekly promotion hour threshold').addNumberOption(o=>o.setName('hours').setDescription('Threshold').setRequired(true).setMinValue(0)))
  .addSubcommand(sc=>sc.setName('status').setDescription('View configuration'));
add(cfg);

const guild = new SlashCommandBuilder().setName('guild').setDescription('Cross-guild utilities').addSubcommandGroup(g=>g.setName('share-roles').setDescription('Share rank roles by name across guilds')
  .addSubcommand(sc=>sc.setName('setup').setDescription('Configure this guild as the source for the hard-coded WCRP staff ranks'))
  .addSubcommand(sc=>sc.setName('sync').setDescription('Sync shared rank roles across all guilds'))
  .addSubcommand(sc=>sc.setName('status').setDescription('View shared rank-role configuration'))
  .addSubcommand(sc=>sc.setName('disable').setDescription('Disable shared rank-role sync')));
add(guild);

const promotion = new SlashCommandBuilder().setName('promotion').setDescription('Promotion configuration')
  .addSubcommand(sc=>sc.setName('logs').setDescription('Choose promotion and interview log channels')
    .addChannelOption(o=>o.setName('promotions-channel').setDescription('Channel for promotion announcements').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addChannelOption(o=>o.setName('interviews-channel').setDescription('Channel for promotion interview logs').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(sc=>sc.setName('status').setDescription('View promotion log configuration'));
add(promotion);

const tmodPromotionsConfig = new SlashCommandBuilder().setName('tmodpromotions').setDescription('Configure Trial Moderator promotion interviews')
  .addSubcommand(sc=>sc.setName('channel').setDescription('Set the Trial Moderator promotion/interview channel').addChannelOption(o=>o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(sc=>sc.setName('status').setDescription('View Trial Moderator promotion settings'));
add(tmodPromotionsConfig);

// RTO suspension helpers
async function ensureRtoSuspendedRole(guild) {
  return guild.roles.cache.find(r => r.name.toLowerCase() === 'rto suspended') || null;
}

async function blockVoiceForRtoRole(guild, role) {
  if (!role) return;
  for (const channel of guild.channels.cache.values()) {
    if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) continue;
    await channel.permissionOverwrites.edit(role, { Connect: false }, { reason: 'RTO suspension voice restriction' }).catch(() => null);
  }
}

async function kickFromVoice(member) {
  if (!member?.voice?.channel) return false;
  return member.voice.disconnect('RTO suspension').then(() => true).catch(() => false);
}

async function applyRtoSuspension(guild, member, durationMs, reason, moderatorId) {
  const g = gid(guild.id);
  const role = await ensureRtoSuspendedRole(guild);
  if (!role) throw new Error('The **RTO Suspended** role must already exist in this server. The bot will not create roles automatically.');
  await blockVoiceForRtoRole(guild, role);

  const record = {
    at: Date.now(),
    expires: Date.now() + durationMs,
    reason,
    by: moderatorId,
    roleId: role.id,
    removedRoles: []
  };
  const targetRoleIds = rtoRoleIds().length ? rtoRoleIds() : guild.roles.cache
    .filter(r => r.name.toLowerCase().includes('rto'))
    .map(r => r.id)
    .filter(id => id !== role.id);
  const target = member;
  for (const roleId of targetRoleIds) {
    if (!target.roles.cache.has(roleId)) continue;
    const r = guild.roles.cache.get(roleId);
    if (!r || !r.editable || r.id === guild.id) continue;
    const removed = await target.roles.remove(r, 'RTO suspension').then(() => true).catch(() => false);
    if (removed) record.removedRoles.push(roleId);
  }
  if (!target.roles.cache.has(role.id)) await target.roles.add(role, 'RTO suspension').catch(() => null);
  await kickFromVoice(target);
  g.rtoSuspensions ??= {};
  const existing = g.rtoSuspensions[member.id];
  if (existing?.removedRoles?.length) record.removedRoles = [...new Set([...existing.removedRoles, ...record.removedRoles])];
  g.rtoSuspensions[member.id] = record;
  saveStore();
  return { role, record };
}

async function removeRtoSuspension(guild, memberId, reason='RTO suspension removed') {
  const g = gid(guild.id);
  const record = g.rtoSuspensions?.[memberId];
  const member = await guild.members.fetch(memberId).catch(() => null);
  if (!member) return { ok: false, reason: 'Member is not in this guild.', record };
  const role = record?.roleId ? guild.roles.cache.get(record.roleId) : guild.roles.cache.find(r => r.name.toLowerCase() === 'rto suspended');
  if (role && member.roles.cache.has(role.id)) await member.roles.remove(role, reason).catch(() => null);
  for (const roleId of (record?.removedRoles || [])) {
    const r = guild.roles.cache.get(roleId);
    if (r && r.editable) await member.roles.add(r, 'Restore roles after RTO suspension').catch(() => null);
  }
  if (g.rtoSuspensions) delete g.rtoSuspensions[memberId];
  saveStore();
  return { ok: true, restored: record?.removedRoles?.length || 0 };
}

async function enforceRtoSuspensions(client) {
  for (const guild of client.guilds.cache.values()) {
    const g = gid(guild.id);
    for (const [memberId, record] of Object.entries(g.rtoSuspensions || {})) {
      if (Date.now() >= Number(record.expires)) {
        await removeRtoSuspension(guild, memberId, 'RTO suspension expired');
        continue;
      }
      const member = guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);
      if (member) await kickFromVoice(member);
    }
  }
}

const data = commands.map(c=>c.toJSON());

async function sendLog(guild, message) {
  const chId = gid(guild.id).settings.logChannelId;
  if (!chId) return;
  const ch = await guild.channels.fetch(chId).catch(()=>null);
  if (ch?.isTextBased()) await ch.send({ embeds:[embed('PSRP Staff Utilities', message, 0x5865f2)] }).catch(()=>null);
}

async function syncSharedRoles(client) {
  for (const cfg of Object.values(store.roleShares || {})) {
    if (!cfg?.enabled || !cfg.sourceGuildId || !Array.isArray(cfg.roleNames) || cfg.roleNames.length === 0) continue;
    const sourceGuild = client.guilds.cache.get(cfg.sourceGuildId);
    if (!sourceGuild) continue;
    const sourceMembers = await sourceGuild.members.fetch().catch(() => null);
    if (!sourceMembers) continue;

    for (const destGuild of client.guilds.cache.values()) {
      if (destGuild.id === sourceGuild.id) continue;
      const roleMap = new Map();
      for (const roleName of cfg.roleNames) {
        let destRole = destGuild.roles.cache.find(r => r.name === roleName);
        if (destRole) roleMap.set(roleName, destRole);
      }

      for (const sourceMember of sourceMembers.values()) {
        const matchingNames = cfg.roleNames.filter(name => sourceMember.roles.cache.some(r => r.name === name));
        if (!matchingNames.length) continue;
        const destMember = await destGuild.members.fetch(sourceMember.id).catch(() => null);
        if (!destMember) continue;
        for (const name of matchingNames) {
          const role = roleMap.get(name);
          if (role && !destMember.roles.cache.has(role.id) && role.editable) {
            await destMember.roles.add(role, 'PSRP shared rank-role sync').catch(() => null);
          }
        }
      }
    }
  }
}

async function syncMemberSharedRoles(client, member) {
  for (const cfg of Object.values(store.roleShares || {})) {
    if (!cfg?.enabled || !cfg.sourceGuildId || !Array.isArray(cfg.roleNames) || !cfg.roleNames.length) continue;
    if (member.guild.id === cfg.sourceGuildId) continue;
    const sourceGuild = client.guilds.cache.get(cfg.sourceGuildId);
    if (!sourceGuild) continue;
    const sourceMember = await sourceGuild.members.fetch(member.id).catch(() => null);
    if (!sourceMember) continue;
    for (const roleName of cfg.roleNames) {
      if (!sourceMember.roles.cache.some(r => r.name === roleName)) continue;
      let destRole = member.guild.roles.cache.find(r => r.name === roleName);
      if (destRole?.editable && !member.roles.cache.has(destRole.id)) {
        await member.roles.add(destRole, 'PSRP shared rank-role sync').catch(() => null);
      }
    }
  }
}

async function sendStaffPromotionNotification({ guild, target, oldRank, newRank, by, reason, action='promotion' }) {
  const g = gid(guild.id);
  const channelId = g.settings.promotionLogChannelId;
  const isAdded = action === 'added';
  const isPromotion = action === 'promotion';

  // Regular promotions intentionally use a compact plain-text announcement,
  // matching the requested WCRP style instead of a large embed.
  if (isPromotion) {
    const promotionText = `🎉 Congratulations ${target}! You've been promoted to **${newRank}** 🎉`;
    if (channelId) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({ content: promotionText }).catch(() => null);
      }
    }
    const dmText = `🎉 Congratulations ${target}! You've been promoted to **${newRank}** 🎉

**Previous Rank:** ${oldRank || 'Unranked'}
**Issued By:** <@${by}>${reason ? `
**Reason:** ${reason}` : ''}

Join the staff team: ${STAFF_DISCORD_INVITE}`;
    await target.send({ content: dmText }).catch(() => null);
    return;
  }

  const buildAppointmentEmbed = () => new EmbedBuilder()
    .setAuthor({ name: 'WCRP Staff Utilities • STAFF APPOINTMENT', iconURL: guild.client.user.displayAvatarURL() })
    .setTitle('Welcome to the WCRP Staff Team')
    .setDescription(`You have officially joined the **WCRP Staff Team** in **${guild.name}**.`)
    .setColor(0x22c55e)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Staff Member', value: `${target}`, inline: true },
      { name: 'New Rank', value: `**${newRank}**`, inline: true },
      { name: 'Issued By', value: `<@${by}>`, inline: true },
      { name: 'Previous Rank', value: oldRank || 'Unranked', inline: true },
      { name: 'Reason', value: reason || 'No reason provided.', inline: true },
      { name: 'Status', value: 'Staff access granted', inline: true },
      { name: 'Staff Discord', value: `[Join the staff team](${STAFF_DISCORD_INVITE})`, inline: false }
    )
    .setFooter({ text: `WCRP Staff Team • ${guild.name}` })
    .setTimestamp();

  if (channelId) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [buildAppointmentEmbed()] }).catch(() => null);
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Join Staff Discord').setStyle(ButtonStyle.Link).setURL(STAFF_DISCORD_INVITE)
  );
  await target.send({
    embeds: [buildAppointmentEmbed().setDescription(`Welcome to the **WCRP Staff Team**. Your staff appointment in **${guild.name}** has been confirmed.`)],
    components: [row]
  }).catch(() => null);
}

async function sendStaffRemovalNotification({ guild, target, oldRank, by, reason, source='staff removal' }) {
  const g = gid(guild.id);
  const channelId = g.settings.promotionLogChannelId;

  const buildRemovalEmbed = () => new EmbedBuilder()
    .setAuthor({ name: 'WCRP Staff Utilities • STAFF STATUS', iconURL: guild.client.user.displayAvatarURL() })
    .setTitle('Staff Access Removed')
    .setDescription(`Your staff access in **${guild.name}** has been removed.`)
    .setColor(0xef4444)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Staff Member', value: `${target}`, inline: true },
      { name: 'Previous Rank', value: oldRank || 'Unranked', inline: true },
      { name: 'Removed By', value: `<@${by}>`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided.', inline: false },
      { name: 'Action', value: source, inline: true },
      { name: 'Status', value: 'Staff access revoked', inline: true },
      { name: 'What Happens Next', value: 'Your staff rank and staff-team access have been removed. Contact management if you believe this was done in error.', inline: false },
      { name: 'Staff Discord', value: `[Open staff Discord](${STAFF_DISCORD_INVITE})`, inline: false }
    )
    .setFooter({ text: `WCRP Staff Team • ${guild.name}` })
    .setTimestamp();

  if (channelId) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [buildRemovalEmbed()] }).catch(() => null);
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Staff Discord').setStyle(ButtonStyle.Link).setURL(STAFF_DISCORD_INVITE)
  );
  await target.send({ embeds: [buildRemovalEmbed()], components: [row] }).catch(() => null);
}

async function getStaffTeamRole(guild) {
  return guild.roles.cache.find(r => STAFF_TEAM_ROLE_IDS.has(r.id)) || guild.roles.cache.find(r => r.name === STAFF_TEAM_ROLE_NAME) || null;
}

async function ensureStaffTeamRole(guild, member, shouldHave=true) {
  const role = await getStaffTeamRole(guild);
  if (!role || !member) return false;
  if (!role.editable) return false;
  if (shouldHave) {
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Staff team role assigned with staff rank').catch(() => null);
    }
    return true;
  }
  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, 'Staff team role removed with staff removal').catch(() => null);
  }
  return true;
}

function sharedRankNames() {
  return [...HARD_CODED_RANKS];
}

async function getSeniorStaffRole(guild) {
  return guild.roles.cache.find(r => SENIOR_STAFF_ROLE_IDS.has(r.id))
    || guild.roles.cache.find(r => r.name === SENIOR_STAFF_ROLE_NAME)
    || null;
}

async function ensureSeniorStaffRole(guild, member, rank) {
  if (!member) return false;
  const role = await getSeniorStaffRole(guild);
  if (!role || !role.editable) return false;
  const shouldHave = ADMIN_PLUS_RANKS.has(rank);
  const has = member.roles.cache.has(role.id);
  if (shouldHave && !has) {
    await member.roles.add(role, 'Senior Staff permission role granted for Junior Administrator+').catch(() => null);
  } else if (!shouldHave && has) {
    await member.roles.remove(role, 'Senior Staff permission role removed below Junior Administrator').catch(() => null);
  }
  return true;
}

async function ensureRankRoleInGuild(guild, rank) {
  if (!rank) return null;
  if (!HARD_CODED_RANKS.some(n => n.toLowerCase() === rank.toLowerCase())) return null;
  return guild.roles.cache.find(r => r.name.toLowerCase() === rank.toLowerCase()) || null;
}


async function syncRankRoleInGuild(guild, member, rank) {
  if (!rank) return null;
  const role = await ensureRankRoleInGuild(guild, rank);
  if (role?.editable && !member.roles.cache.has(role.id)) {
    await member.roles.add(role, 'Assign staff rank role').catch(() => null);
  }
  await ensureStaffTeamRole(guild, member, true);
  await ensureSeniorStaffRole(guild, member, rank);
  return role || null;
}


function activeStrikeCount(userRecord) {
  const now = Date.now();
  return (userRecord?.strikes || []).filter(s => !s.expires || Number(s.expires) > now).length;
}

function inferRankFromMember(member) {
  if (!member) return '';
  for (const rank of HARD_CODED_RANKS) {
    if (member.roles.cache.some(r => r.name.toLowerCase() === rank.toLowerCase())) return rank;
  }
  return '';
}

function isEligibleTmod(userRecord, member=null) {
  const rank = String(userRecord?.rank || inferRankFromMember(member)).trim().toLowerCase();
  return rank === TMOD_RANK.toLowerCase()
    && Number(userRecord?.hours || 0) >= TMOD_PROMOTION_HOURS
    && activeStrikeCount(userRecord) === 0;
}

async function setStaffRankAcrossGuilds(client, userId, rank, reason='Staff rank update') {
  const results=[];
  for (const guild of client.guilds.cache.values()) {
    const target = await guild.members.fetch(userId).catch(()=>null);
    if (!target) continue;
    for (const roleName of HARD_CODED_RANKS) {
      if (roleName === rank) continue;
      const oldRole = guild.roles.cache.find(r=>r.name===roleName);
      if (oldRole?.editable && target.roles.cache.has(oldRole.id)) {
        await target.roles.remove(oldRole, reason).catch(()=>null);
      }
    }
    const newRole = guild.roles.cache.find(r=>r.name===rank) || null;
    if (newRole?.editable && !target.roles.cache.has(newRole.id)) {
      await target.roles.add(newRole, reason).catch(()=>null);
    }
    await ensureStaffTeamRole(guild, target, true);
    await ensureSeniorStaffRole(guild, target, rank);
    results.push({ guildId:guild.id, guildName:guild.name, ok:!!newRole });
  }
  return results;
}

function buildTmodEligibilityEmbed(guild, target, userRecord, member=null, statusText=null, interviewBy=null) {
  const strikes=activeStrikeCount(userRecord);
  const eligible=isEligibleTmod(userRecord, member);
  const hours=Number(userRecord?.hours || 0);
  const rank=inferRankFromMember(member) || userRecord?.rank || 'Unranked';
  const passed = Boolean(statusText?.includes('INTERVIEW PASSED') || statusText?.includes('PROMOTED'));
  const status = statusText || (eligible ? '⏳ **PENDING INTERVIEW**' : '❌ **NOT ELIGIBLE**');
  const e = new EmbedBuilder()
    .setAuthor({ name:'PSRP Staff Utilities', iconURL:guild.client.user.displayAvatarURL() })
    .setTitle(passed ? '✅ Trial Moderator Promoted!' : '🎯 Trial Mod Promotion')
    .setDescription(passed
      ? `**${target.username}** has passed the Trial Moderator interview and is now **${MODERATOR_RANK}**.`
      : `A Trial Moderator is eligible for promotion!`)
    .setColor(passed ? 0x22c55e : (eligible ? 0xf59e0b : 0x64748b))
    .addFields(
      { name:'👤 Candidate', value:`${target}\n\`${target.id}\``, inline:true },
      { name:'⏱️ Hours Completed', value:`**${hours.toFixed(2)}h** / **${TMOD_PROMOTION_HOURS.toFixed(2)}h**`, inline:true },
      { name:'🏷️ Current Rank', value:`**${passed ? MODERATOR_RANK : rank}**`, inline:true },
      { name:'📋 Status', value:status, inline:false },
      { name:'⚠️ Strike Check', value:strikes===0 ? '✅ No active strikes' : `❌ ${strikes} active strike${strikes===1?'':'s'}`, inline:true },
      { name:'📌 Requirement', value:`**2+ hours** • **No active strikes** • **Administrator+ interview required**`, inline:true }
    )
    .setFooter({ text:`PSRP Staff Utilities • ${guild.name}` })
    .setTimestamp();
  if (passed && interviewBy) {
    e.addFields({ name:'👨‍💼 Interview Completed By', value:`<@${interviewBy}>`, inline:true });
  }
  return e;
}

async function handleTmodCompleteButton(interaction) {
  const [, userId] = String(interaction.customId).split(':');
  const guild = interaction.guild;
  if (!guild) return;
  const actor = await guild.members.fetch(interaction.user.id).catch(()=>null);
  if (!isAdmin(actor)) {
    return interaction.reply({ embeds:[err('Access Denied','Only an Administrator or higher can pass a Trial Moderator interview.')], ephemeral:true });
  }
  const targetMember = await guild.members.fetch(userId).catch(()=>null);
  const target = await guild.client.users.fetch(userId).catch(()=>null);
  if (!targetMember || !target) return interaction.reply({ embeds:[err('Interview Failed','The candidate is no longer in this server.')], ephemeral:true });
  const record=uid(userId,guild.id);
  if (!isEligibleTmod(record, targetMember)) {
    return interaction.reply({ embeds:[err('No Longer Eligible',`This candidate no longer meets the **2 hour**, **no active strike**, and **Trial Moderator rank** requirements.`)], ephemeral:true });
  }

  await interaction.deferUpdate();
  const oldRank = inferRankFromMember(targetMember) || record.rank || TMOD_RANK;
  const results=await setStaffRankAcrossGuilds(guild.client,userId,MODERATOR_RANK,'Trial Moderator interview passed');
  record.rank=MODERATOR_RANK;
  record.lastSeen=Date.now();
  record.notes.push({type:'tmod-interview',result:'passed',by:interaction.user.id,at:Date.now()});
  saveStore();

  await sendStaffPromotionNotification({guild,target,oldRank,newRank:MODERATOR_RANK,by:interaction.user.id,reason:'Trial Moderator interview passed',action:'promotion'});
  await sendLog(guild,`**Trial Moderator Promoted**\nUser: ${target}\nPrevious rank: ${oldRank}\nNew rank: ${MODERATOR_RANK}\nInterview passed by: <@${interaction.user.id}>\nReason: Trial Moderator interview passed`);

  const updated = buildTmodEligibilityEmbed(
    guild, target, record, targetMember,
    '✅ **INTERVIEW PASSED • PROMOTED TO MODERATOR**',
    interaction.user.id
  ).setDescription(`**${target.username}** has passed the Trial Moderator interview and has now been promoted to **${MODERATOR_RANK}**.`);

  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tmod_completed:${userId}`)
      .setLabel(`✅ Interview Completed • ${interaction.user.username}`.slice(0,80))
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
  );
  await interaction.editReply({embeds:[updated],components:[row]});
}

async function handleAutocomplete(interaction) {
  const query = String(interaction.options.getString('rank') || '').toLowerCase();
  const names = HARD_CODED_RANKS.filter(n => n.toLowerCase().includes(query)).slice(0, 25);
  await interaction.respond(names.map(name => ({ name: name.slice(0, 100), value: name.slice(0, 100) }))).catch(() => null);
}

async function applyStaffChangeAcrossGuilds(client, userId, rank, mode='add') {
  for (const guild of client.guilds.cache.values()) {
    const target = await guild.members.fetch(userId).catch(()=>null);
    if (!target) continue;
    if (mode === 'add') {
      await syncRankRoleInGuild(guild, target, rank);
    } else {
      const roleNames = HARD_CODED_RANKS;
      for (const roleName of roleNames) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role?.editable && target.roles.cache.has(role.id)) await target.roles.remove(role, 'Staff member removed from staff').catch(()=>null);
      }
      await ensureStaffTeamRole(guild, target, false);
      await ensureSeniorStaffRole(guild, target, '');
    }
  }
}

async function handle(interaction) {
  if (!interaction.inGuild()) return reply(interaction,{content:'This bot only works inside servers.',ephemeral:true});
  const guildData = ensureGuild(interaction);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
  const name = interaction.commandName;

  const staffOnly = ['activestaff','addhours','removehours','staff','rank','promote','promotion','bancount','clockrepair','deaths','dms','evaluate','hourmultiplier','stophourmulti','logbonus','passivehours','praise','promotions','promotioninterview','punishmenthistory','removepunishment','removeblacklist','removestaffremoval','removestrike','requesthours','staffblacklist','staffnextweek','staffremoval','staffstrike','supportteam','tmodpromos','promote-all-tmods','unban','unjoin','passiveflags'];
  if (staffOnly.includes(name) && !isStaff(member)) return reply(interaction,{embeds:[err('Access Denied','This command is restricted to authorised staff.')],ephemeral:true});

  if (name==='activestaff') {
    const staff=[]; const now=Date.now();
    for (const [id,u] of Object.entries(guildData.users)) if (u.lastSeen) staff.push({id,last:u.lastSeen});
    staff.sort((a,b)=>b.last-a.last);
    const lines=staff.slice(0,20).map(x=>`<@${x.id}> — last activity ${ts(x.last)}${now-x.last>30*60000?' • idle':''}`);
    return reply(interaction,{embeds:[embed('Active Staff', lines.length?lines.join('\n'):'No staff activity recorded.',0x22c55e)]});
  }
  if (name==='addhours' || name==='removehours') {
    const target=interaction.options.getUser('user',true); const hours=interaction.options.getNumber('hours',true); const u=uid(target.id,interaction.guildId);
    const targetMember=await interaction.guild.members.fetch(target.id).catch(()=>null);
    if (!u.rank) { const inferred=inferRankFromMember(targetMember); if (inferred) u.rank=inferred; }
    u.hours=Math.max(0,name==='addhours'?u.hours+hours:u.hours-hours); u.lastSeen=Date.now(); saveStore(); audit(interaction.guildId,`${name} ${fmtHours(hours)} for ${target.tag} by ${interaction.user.tag}`); await sendLog(interaction.guild,`${interaction.user} ${name} **${fmtHours(hours)}** ${name==='addhours'?'to':'from'} <@${target.id}>.`);
    return reply(interaction,{embeds:[ok(name==='addhours'?'Hours Added':'Hours Removed',`${target} now has **${fmtHours(u.hours)}** this week.`)]});
  }
  if (name==='requesthours') { const h=interaction.options.getNumber('hours',true), reason=interaction.options.getString('reason',true); (guildData.logs.hourRequests??=[]).push({user:interaction.user.id,hours:h,reason,at:Date.now(),status:'pending'}); saveStore(); return reply(interaction,{embeds:[ok('Hours Request Submitted',`Requested **${fmtHours(h)}**.\nReason: ${reason}`)]}); }
  if (name==='staff') {
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user', true);
    const targetMember = await interaction.guild.members.fetch(target.id).catch(()=>null);
    if (!targetMember) return reply(interaction,{embeds:[err('Staff Action Failed','That user must be in this server.')],ephemeral:true});
    if (sub === 'remove') {
      const u = uid(target.id, interaction.guildId);
      const oldRank = u.rank || inferRankFromMember(targetMember);
      u.rank = '';
      await applyStaffChangeAcrossGuilds(interaction.client, target.id, '', 'remove');
      saveStore();
      await sendLog(interaction.guild, `**Staff Removed**\nUser: ${target}\nPrevious rank: ${oldRank || 'Unranked'}\nRemoved by: <@${interaction.user.id}>${interaction.options.getString('reason') ? `\nReason: ${interaction.options.getString('reason')}` : ''}`);
      await sendStaffRemovalNotification({guild:interaction.guild,target,oldRank,by:interaction.user.id,reason:interaction.options.getString('reason')||'',source:'staff remove'});
      return reply(interaction,{embeds:[ok('Staff Member Removed',`${target} has been removed from the staff team.\n\n**Previous rank:** ${oldRank||'Unranked'}\n**Removed by:** ${interaction.user}`)]});
    }
    const rank = interaction.options.getString('rank', true);
    if (!HARD_CODED_RANKS.includes(rank)) return reply(interaction,{embeds:[err('Invalid Rank','Select one of the hard-coded WCRP staff ranks.')],ephemeral:true});
    const u = uid(target.id, interaction.guildId);
    const oldRank = u.rank || inferRankFromMember(targetMember);
    u.rank = rank;
    u.lastSeen = Date.now();
    saveStore();
    await applyStaffChangeAcrossGuilds(interaction.client, target.id, rank, 'add');
    await sendStaffPromotionNotification({guild:interaction.guild,target,oldRank,newRank:rank,by:interaction.user.id,reason:'',action:'added'});
    await sendLog(interaction.guild, `**Staff Added / Rank Assigned**\nUser: ${target}\nRank: ${rank}\nAssigned by: <@${interaction.user.id}>`);
    return reply(interaction,{embeds:[ok('Staff Member Added',`${target} has been added to the staff team.\n\n**Rank:** ${rank}\n**Previous rank:** ${oldRank||'Unranked'}\n**Assigned by:** ${interaction.user}`)]});
  }
  if (name==='rank') {
    const sub=interaction.options.getSubcommand();
    const target=interaction.options.getUser('user',true);
    if (sub==='remove') {
      const u=uid(target.id,interaction.guildId);
      const memberTarget=await interaction.guild.members.fetch(target.id).catch(()=>null);
      const oldRank=u.rank||inferRankFromMember(memberTarget);
      u.rank='';
      if (memberTarget && oldRank) {
        const role=interaction.guild.roles.cache.find(r=>r.name===oldRank);
        if (role?.editable && memberTarget.roles.cache.has(role.id)) await memberTarget.roles.remove(role,'Staff rank removed').catch(()=>null);
      }
      if (memberTarget) {
        await ensureStaffTeamRole(interaction.guild, memberTarget, false);
        await ensureSeniorStaffRole(interaction.guild, memberTarget, '');
      }
      saveStore();
      await sendStaffRemovalNotification({guild:interaction.guild,target,oldRank,by:interaction.user.id,reason:'',source:'rank remove'});
      return reply(interaction,{embeds:[ok('Rank Removed',`${target} no longer has a staff rank.

**Previous rank:** ${oldRank||'Unranked'}`)]});
    }
    const rank=interaction.options.getString('rank',true);
    if (!HARD_CODED_RANKS.includes(rank)) return reply(interaction,{embeds:[err('Invalid Rank','Select one of the hard-coded WCRP staff ranks.')],ephemeral:true});
    const u=uid(target.id,interaction.guildId);
    const memberTarget=await interaction.guild.members.fetch(target.id).catch(()=>null);
    const oldRank=u.rank||inferRankFromMember(memberTarget);
    u.rank=rank;
    u.lastSeen=Date.now();
    saveStore();
    if (memberTarget) await applyStaffChangeAcrossGuilds(interaction.client, target.id, rank, 'add');
    await sendStaffPromotionNotification({guild:interaction.guild,target,oldRank,newRank:rank,by:interaction.user.id,reason:'',action:'added'});
    return reply(interaction,{embeds:[ok('Rank Added',`${target} is now **${rank}**.

**Previous rank:** ${oldRank||'Unranked'}
**Assigned by:** ${interaction.user}`)]});
  }
  if (name==='addrank' || name==='promote') {
    const target=interaction.options.getUser('user',true);
    const rank=interaction.options.getString('rank',true);
    if (!HARD_CODED_RANKS.includes(rank)) return reply(interaction,{embeds:[err('Invalid Rank','Select one of the hard-coded WCRP staff ranks.')],ephemeral:true});
    const reason=name==='promote' ? (interaction.options.getString('reason')||'') : '';
    const u=uid(target.id,interaction.guildId);
    const memberTarget=await interaction.guild.members.fetch(target.id).catch(()=>null);
    const oldRank=u.rank||inferRankFromMember(memberTarget);
    u.rank=rank;
    u.lastSeen=Date.now();
    saveStore();
    if (memberTarget) await applyStaffChangeAcrossGuilds(interaction.client, target.id, rank, 'add');
    await sendStaffPromotionNotification({guild:interaction.guild,target,oldRank,newRank:rank,by:interaction.user.id,reason,action:'promotion'});
    return reply(interaction,{embeds:[ok('Promotion Complete',`${target} is now **${rank}**.\n\n**Previous rank:** ${oldRank||'Unranked'}\n**Promoted by:** ${interaction.user}${reason?`\n**Reason:** ${reason}`:''}`)]});
  }
  if (name==='bancount') { const bans=await interaction.guild.bans.fetch().catch(()=>null); return reply(interaction,{embeds:[embed('Guild Ban Count',`This guild currently has **${bans?.size??0}** banned users.`,0xef4444)]}); }
  if (name==='clockrepair') { const target=interaction.options.getUser('user',true); uid(target.id,interaction.guildId).lastSeen=Date.now(); saveStore(); return reply(interaction,{embeds:[ok('Clock Repaired',`Repaired the staff clock session for ${target}.`)]}); }
  if (name==='deaths') return reply(interaction,{embeds:[embed('Deaths / Kills','No external game-log connector is configured. The bot is ready for a game-log webhook/database integration.',0x8b5cf6)]});
  if (name==='dms') { const sub=interaction.options.getSubcommand(); if(sub==='set'){guildData.settings.dmProof=interaction.options.getBoolean('enabled',true);saveStore();} return reply(interaction,{embeds:[ok('DM Proof',`DM proof is **${guildData.settings.dmProof?'enabled':'disabled'}**.`)]}); }
  if (name==='evaluate') { const target=interaction.options.getUser('user',true), status=interaction.options.getString('status'); const u=uid(target.id,interaction.guildId); if(status)u.evaluation=status; saveStore(); return reply(interaction,{embeds:[embed('Evaluation Status',`**${target}** — ${u.evaluation||'No evaluation recorded.'}`,0xf59e0b)]}); }
  if (name==='hourmultiplier') { const d=interaction.options.getString('duration',true), hours=parseDuration(d); if(hours===null)return reply(interaction,{embeds:[err('Invalid Duration','Use a duration such as `30m`, `2h`, or `1d`.')],ephemeral:true}); guildData.settings.multiplier={ends:Date.now()+hours*3600000}; saveStore(); return reply(interaction,{embeds:[ok('1.5× Hour Multiplier Started',`Active until ${ts(guildData.settings.multiplier.ends)}.`)]}); }
  if (name==='stophourmulti') { guildData.settings.multiplier=null; saveStore(); return reply(interaction,{embeds:[ok('Hour Multiplier Stopped','The active multiplier has been removed.') ]}); }
  if (name==='logbonus') { const amount=interaction.options.getNumber('amount',true), reason=interaction.options.getString('reason',true); (guildData.logs.bonusRequests??=[]).push({user:interaction.user.id,amount,reason,status:'pending',at:Date.now()}); saveStore(); return reply(interaction,{embeds:[ok('Bonus Request Submitted',`**Amount:** ${amount}\n**Reason:** ${reason}`)]}); }
  if (name==='passivehours') { const t=interaction.options.getUser('user',true),u=uid(t.id,interaction.guildId); return reply(interaction,{embeds:[embed('Passive Hours',`${t}\nCurrent week: **${fmtHours(u.hours)}**\nPassive flags: **${u.flags.length}**`,0x14b8a6)]}); }
  if (name==='praise') { const t=interaction.options.getUser('user'); if(t){const msg=interaction.options.getString('message')||'Positive feedback'; uid(t.id,interaction.guildId).praise.push({by:interaction.user.id,msg,at:Date.now()}); saveStore(); return reply(interaction,{embeds:[ok('Praise Recorded',`Praise recorded for ${t}.`)]}); } const entries=Object.entries(guildData.users).map(([id,u])=>({id,n:u.praise.length})).sort((a,b)=>b.n-a.n).slice(0,10); return reply(interaction,{embeds:[embed('Praise Leaderboard',entries.length?entries.map((x,i)=>`**${i+1}.** <@${x.id}> — ${x.n} praise`).join('\n'):'No praise recorded yet.',0x22c55e)]}); }
  if (name==='promotions') {
    const threshold=guildData.settings.promotionHours??20;
    const list=Object.entries(guildData.users).filter(([_,u])=>u.hours>=threshold).map(([id,u])=>`<@${id}> — ${fmtHours(u.hours)} — ${u.rank||'Unranked'}`);
    return reply(interaction,{embeds:[embed('Promotion Eligibility',list.length?list.join('\n'):`No staff meet the current **${threshold}h** threshold.`,0xf59e0b)]});
  }
  if (name==='tmodpromos') {
    await interaction.deferReply();
    const requested=interaction.options.getUser('user');
    const channelId=guildData.settings.tmodPromotionsChannelId;
    const outChannel=channelId ? await interaction.guild.channels.fetch(channelId).catch(()=>null) : interaction.channel;
    if(!outChannel || outChannel.type!==ChannelType.GuildText) {
      return interaction.editReply({embeds:[err('TMod Promotions Channel Not Set','Use `/tmodpromotions channel` to choose the channel where eligible Trial Moderator interview requests will be posted.')]});
    }
    const candidates=[];
    if(requested){
      const r=uid(requested.id,interaction.guildId);
      const m=await interaction.guild.members.fetch(requested.id).catch(()=>null);
      const inferred=inferRankFromMember(m);
      if(inferred) r.rank=inferred;
      if(m && isEligibleTmod(r,m)) candidates.push([requested.id,r,m]);
    } else {
      await interaction.guild.members.fetch().catch(()=>null);
      for(const m of interaction.guild.members.cache.values()){
        const r=uid(m.id,interaction.guildId);
        const inferred=inferRankFromMember(m);
        if(inferred) r.rank=inferred;
        if(isEligibleTmod(r,m)) candidates.push([m.id,r,m]);
      }
      saveStore();
    }
    if(!candidates.length) return interaction.editReply({embeds:[embed('Trial Moderator Promotion Check',`No Trial Moderators currently meet the **${TMOD_PROMOTION_HOURS} hour**, **no active strike**, and **Trial Moderator rank** requirements.`,0x64748b)]});

    let posted=0;
    for(const [id,r,m] of candidates.slice(0,25)){
      const target=m.user;
      const card=buildTmodEligibilityEmbed(interaction.guild,target,r,m);
      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`tmod_complete:${id}`).setLabel('📝 Interview Passed').setStyle(ButtonStyle.Primary));
      const msg=await outChannel.send({embeds:[card],components:[row]});
      try{
        const thread=await msg.startThread({name:`${target.username} - Trial Mod Interview`,autoArchiveDuration:1440,reason:'Trial Moderator promotion interview'});
        await thread.send({content:`${target} — **Interview required before promotion.** An **Administrator or higher** must conduct the interview. When the interview is successfully completed, click **Interview Passed** on the main message. The Moderator role will only be assigned after that approval.`});
      }catch{}
      try{ await target.send({embeds:[embed('🎓 Trial Moderator Promotion Interview',`Congratulations ${target}!\n\nYou have met the **${TMOD_PROMOTION_HOURS}+ hour** and **no active strike** requirements for promotion. An **Administrator or higher** must interview you before you can become **${MODERATOR_RANK}**.\n\nYour interview request has been posted in ${outChannel}.`,0xf59e0b)]}).catch(()=>null); }catch{}
      posted++;
    }
    return interaction.editReply({embeds:[ok('TMod Promotion Check Complete',`Found **${candidates.length}** eligible Trial Moderator${candidates.length===1?'':'s'} and posted **${posted}** interview request${posted===1?'':'s'} in ${outChannel}.\n\n**Note:** No one was promoted automatically. An Administrator or higher must pass each interview first.`)]});
  }
  if (name==='promote-all-tmods') {
    await interaction.deferReply();
    const channelId=guildData.settings.tmodPromotionsChannelId;
    const outChannel=channelId ? await interaction.guild.channels.fetch(channelId).catch(()=>null) : null;
    if(!outChannel || outChannel.type!==ChannelType.GuildText) return interaction.editReply({embeds:[err('TMod Promotions Channel Not Set','Use `/tmodpromotions channel` first.')]});
    await interaction.guild.members.fetch().catch(()=>null);
    const candidates=[];
    for(const m of interaction.guild.members.cache.values()){
      const r=uid(m.id,interaction.guildId);
      const inferred=inferRankFromMember(m);
      if(inferred) r.rank=inferred;
      if(isEligibleTmod(r,m)) candidates.push([m.id,r,m]);
    }
    saveStore();
    if(!candidates.length) return interaction.editReply({embeds:[embed('No Trial Moderators Ready','There are no Trial Moderators with at least **2 hours** and **no active strike**.',0x64748b)]});
    let posted=0;
    for(const [id,r,m] of candidates.slice(0,25)){
      const target=m.user;
      const card=buildTmodEligibilityEmbed(interaction.guild,target,r,m);
      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`tmod_complete:${id}`).setLabel('📝 Interview Passed').setStyle(ButtonStyle.Primary));
      const msg=await outChannel.send({embeds:[card],components:[row]});
      try{
        const thread=await msg.startThread({name:`${target.username} - Trial Mod Interview`,autoArchiveDuration:1440,reason:'Trial Moderator promotion interview'});
        await thread.send({content:`${target} — **Interview required before promotion.** An **Administrator or higher** must conduct the interview, then click **Interview Passed** on the main message. No role is assigned before the interview is passed.`});
      }catch{}
      try{ await target.send({embeds:[embed('🎓 Trial Moderator Promotion Interview',`You have been identified as eligible for a Trial Moderator promotion interview.\n\nYou have **${Number(r.hours||0).toFixed(2)}h** and **no active strikes**. An Administrator or higher must complete your interview before you are promoted.`,0xf59e0b)]}).catch(()=>null); }catch{}
      posted++;
    }
    return interaction.editReply({embeds:[ok('TMod Interview Workflows Started',`Found **${candidates.length}** eligible Trial Moderators and created **${posted}** interview workflows in ${outChannel}.\n\nNobody was promoted automatically.`)]});
  }
  if (name==='promotioninterview') { const t=interaction.options.getUser('user',true), result=interaction.options.getString('result',true), notes=interaction.options.getString('notes')||''; uid(t.id,interaction.guildId).notes.push({type:'promotion-interview',by:interaction.user.id,result,notes,at:Date.now()}); saveStore(); return reply(interaction,{embeds:[ok('Promotion Interview Logged',`${t}\n**Result:** ${result}\n**Notes:** ${notes||'None'}`)]}); }
  if (name==='promotion') {
    const sub=interaction.options.getSubcommand();
    if(sub==='logs') {
      guildData.settings.promotionLogChannelId=interaction.options.getChannel('promotions-channel',true).id;
      guildData.settings.interviewLogChannelId=interaction.options.getChannel('interviews-channel',true).id;
      saveStore();
      return reply(interaction,{embeds:[ok('Promotion Logs Configured',`Promotions: <#${guildData.settings.promotionLogChannelId}>\nInterviews: <#${guildData.settings.interviewLogChannelId}>`)]});
    }
    return reply(interaction,{embeds:[embed('Promotion Log Configuration',`Promotions: ${guildData.settings.promotionLogChannelId?`<#${guildData.settings.promotionLogChannelId}>`:'Not configured'}\nInterviews: ${guildData.settings.interviewLogChannelId?`<#${guildData.settings.interviewLogChannelId}>`:'Not configured'}`,0x5865f2)]});
  }
  if (name==='punishmenthistory') { const t=interaction.options.getUser('user',true),u=uid(t.id,interaction.guildId); const lines=u.punishments.map((p,i)=>`**${i+1}.** ${p.reason||'No reason'} — ${ts(p.at)}`); return reply(interaction,{embeds:[embed('Punishment History',lines.length?lines.join('\n'):'No punishments recorded.',0xef4444)]}); }
  if (name==='removepunishment') { const t=interaction.options.getUser('user',true), idx=interaction.options.getInteger('index',true)-1,u=uid(t.id,interaction.guildId); if(idx<0||idx>=u.punishments.length)return reply(interaction,{embeds:[err('Not Found','That punishment index does not exist.')],ephemeral:true});u.punishments.splice(idx,1);saveStore();return reply(interaction,{embeds:[ok('Punishment Removed',`Removed punishment **#${idx+1}** from ${t}.`)]}); }
  if (name==='removeblacklist') { const t=interaction.options.getUser('user',true);uid(t.id,interaction.guildId).blacklist=null;saveStore();return reply(interaction,{embeds:[ok('Blacklist Removed',`${t} has been removed from the staff blacklist.`)]}); }
  if (name==='removestaffremoval') { const t=interaction.options.getUser('user',true); const u=uid(t.id,interaction.guildId);u.removals=u.removals.filter(r=>r.active===false);saveStore();return reply(interaction,{embeds:[ok('Staff Removal Removed',`${t} can be processed back into staff.`)]}); }
  if (name==='removestrike') { const t=interaction.options.getUser('user',true),idx=interaction.options.getInteger('index',true)-1,u=uid(t.id,interaction.guildId);if(idx<0||idx>=u.strikes.length)return reply(interaction,{embeds:[err('Not Found','Strike not found.')],ephemeral:true});u.strikes.splice(idx,1);saveStore();return reply(interaction,{embeds:[ok('Strike Removed',`Removed strike **#${idx+1}** from ${t}.`)]}); }
  if (name==='staffblacklist') { const t=interaction.options.getUser('user',true),reason=interaction.options.getString('reason',true);uid(t.id,interaction.guildId).blacklist={reason,by:interaction.user.id,at:Date.now()};saveStore();return reply(interaction,{embeds:[embed('Staff Blacklist Applied',`${t}\n**Reason:** ${reason}`,0xef4444)]}); }
  if (name==='staffnextweek') { if(!isAdmin(member))return reply(interaction,{embeds:[err('Access Denied','Admin only.')],ephemeral:true});guildData.counters.week=(guildData.counters.week||0)+1;Object.values(guildData.users).forEach(u=>u.hours=0);saveStore();return reply(interaction,{embeds:[ok('Staff Week Advanced','Weekly tracking has been advanced and current-week hour totals reset.')]}); }
  if (name==='staffremoval') { const t=interaction.options.getUser('user',true),reason=interaction.options.getString('reason',true),u=uid(t.id,interaction.guildId); const oldRank=u.rank||''; u.rank=''; u.removals.push({reason,by:interaction.user.id,at:Date.now(),active:true});saveStore();const m=await interaction.guild.members.fetch(t.id).catch(()=>null);if(m){ if(m.roles.cache.size){ if(oldRank){ const oldRole=interaction.guild.roles.cache.find(r=>r.name===oldRank); if(oldRole?.editable && m.roles.cache.has(oldRole.id)) await m.roles.remove(oldRole,'Staff removal').catch(()=>null); } await ensureStaffTeamRole(interaction.guild,m,false); } if(m.kickable)await m.kick(`Staff removal: ${reason}`).catch(()=>null); } await sendStaffRemovalNotification({guild:interaction.guild,target:t,oldRank,by:interaction.user.id,reason,source:'staffremoval'}); return reply(interaction,{embeds:[embed('Staff Removal',`${t} has been removed from staff.\n**Previous rank:** ${oldRank||'Unranked'}\n**Reason:** ${reason}`,0xef4444)]}); }
  if (name==='staffstrike') { const t=interaction.options.getUser('user',true),reason=interaction.options.getString('reason',true),u=uid(t.id,interaction.guildId);u.strikes.push({reason,by:interaction.user.id,at:Date.now(),expires:Date.now()+7*86400000});saveStore();return reply(interaction,{embeds:[embed('Staff Strike Issued',`${t}\n**Reason:** ${reason}\nExpires ${ts(Date.now()+7*86400000)}.`,0xef4444)]}); }
  if (name==='supportteam') { const roleId=guildData.settings.supportRoleId; const role=roleId?await interaction.guild.roles.fetch(roleId).catch(()=>null):null; if(!role)return reply(interaction,{embeds:[err('Support Team Not Configured','Use `/config support-role` first.')],ephemeral:true});const members=role.members.map(m=>m.user.tag);return reply(interaction,{embeds:[embed('Support Team',members.length?members.join('\n'):'No members have the configured role.',0x14b8a6)]}); }
  if (name==='unban') { const id=interaction.options.getString('user-id',true);const okb=await interaction.guild.members.unban(id,'Staff utility unban').then(()=>true).catch(()=>false);return reply(interaction,{embeds:[okb?ok('Unban Successful',`Unbanned **${id}**.`):err('Unban Failed',`Could not unban **${id}**.`)]}); }
  if (name==='unjoin') { const t=interaction.options.getUser('user',true);const u=uid(t.id,interaction.guildId);u.removals=u.removals.map(r=>({...r,active:false}));u.punishments=[];saveStore();return reply(interaction,{embeds:[ok('Staff Join Released',`${t}'s active staff removal has been released and punishment history cleared.`)]}); }
  if (name==='passiveflags') { const sub=interaction.options.getSubcommand(); if(sub==='list'){const all=[];for(const [id,u] of Object.entries(guildData.users))u.flags.forEach(f=>{if(!f.resolved)all.push({id,f});});return reply(interaction,{embeds:[embed('Unresolved Passive Flags',all.length?all.map((x,i)=>`**${i+1}.** <@${x.id}> — ${x.f.reason||'No reason'} (${ts(x.f.at)})`).join('\n'):'No unresolved flags.',0xf59e0b)]});} if(sub==='resolve'){const idx=interaction.options.getInteger('index',true)-1;const all=[];for(const [id,u] of Object.entries(guildData.users))u.flags.forEach((f,fi)=>{if(!f.resolved)all.push({id,u,fi,f});});const item=all[idx];if(!item)return reply(interaction,{embeds:[err('Not Found','Flag not found.')],ephemeral:true});item.f.resolved=true;item.f.resolvedBy=interaction.user.id;saveStore();return reply(interaction,{embeds:[ok('Flag Resolved',`Resolved flag for <@${item.id}>.`)]});}const t=interaction.options.getUser('user',true),u=uid(t.id,interaction.guildId);return reply(interaction,{embeds:[embed(`Passive Flags — ${t}`,u.flags.length?u.flags.map((f,i)=>`**${i+1}.** ${f.resolved?'Resolved':'Unresolved'} — ${f.reason||'No reason'}`).join('\n'):'No flags recorded.',0xf59e0b)]}); }
  if (name==='rtosuspension') {
    if(!isStaff(member)) return reply(interaction,{embeds:[err('Access Denied','Staff permissions are required for RTO suspensions.')],ephemeral:true});
    const t=interaction.options.getUser('user',true);
    const duration=interaction.options.getString('duration',true);
    const reason=interaction.options.getString('reason',true);
    const member=await interaction.guild.members.fetch(t.id).catch(()=>null);
    const ms=(parseDuration(duration)||0)*3600000;
    if (!member) return reply(interaction,{embeds:[err('RTO Suspension Failed','That user is not currently in this server.')],ephemeral:true});
    if (!ms) return reply(interaction,{embeds:[err('Invalid Duration','Use a duration such as `30m`, `2h`, `7d`, or `1w`.')],ephemeral:true});
    if (member.id===interaction.user.id) return reply(interaction,{embeds:[err('RTO Suspension Failed','You cannot suspend yourself.')],ephemeral:true});
    try {
      const {record}=await applyRtoSuspension(interaction.guild, member, ms, reason, interaction.user.id);
      await sendLog(interaction.guild, `**RTO Suspension**\nUser: ${member}\nReason: ${reason}\nExpires: ${ts(record.expires)}\nActioned by: <@${interaction.user.id}>`);
      return reply(interaction,{embeds:[ok('RTO Suspension Applied',`${member} is now **RTO Suspended** and has been removed from voice channels.\n\n**Reason:** ${reason}\n**Duration:** ${duration}\n**Expires:** ${ts(record.expires)}`)]});
    } catch (e) {
      console.error(e);
      return reply(interaction,{embeds:[err('RTO Suspension Failed',e?.message||'Could not apply the suspension.')],ephemeral:true});
    }
  }
  if (name==='removertosuspension') {
    if(!isStaff(member)) return reply(interaction,{embeds:[err('Access Denied','Staff permissions are required to remove RTO suspensions.')],ephemeral:true});
    const t=interaction.options.getUser('user',true);
    const result=await removeRtoSuspension(interaction.guild,t.id,`RTO suspension removed by ${interaction.user.tag}`);
    if (!result.ok) return reply(interaction,{embeds:[err('Removal Failed',result.reason)],ephemeral:true});
    await sendLog(interaction.guild, `**RTO Suspension Removed**\nUser: ${t}\nRestored roles: ${result.restored}\nRemoved by: <@${interaction.user.id}>`);
    return reply(interaction,{embeds:[ok('RTO Suspension Removed',`${t} is no longer RTO Suspended.\n**Roles restored:** ${result.restored}`)]});
  }
  if (name==='config') { if(!isAdmin(member))return reply(interaction,{embeds:[err('Access Denied','Administrator permissions are required.')],ephemeral:true}); const sub=interaction.options.getSubcommand();if(sub==='log-channel')guildData.settings.logChannelId=interaction.options.getChannel('channel',true).id;if(sub==='staff-role')guildData.settings.staffRoleId=interaction.options.getRole('role',true).id;if(sub==='support-role')guildData.settings.supportRoleId=interaction.options.getRole('role',true).id;if(sub==='promotion-hours')guildData.settings.promotionHours=interaction.options.getNumber('hours',true);saveStore();if(sub==='status'){return reply(interaction,{embeds:[embed('Guild Configuration',`Log channel: ${guildData.settings.logChannelId?`<#${guildData.settings.logChannelId}>`:'Not set'}\nStaff role: ${guildData.settings.staffRoleId?`<@&${guildData.settings.staffRoleId}>`:'Not set'}\nSupport role: ${guildData.settings.supportRoleId?`<@&${guildData.settings.supportRoleId}>`:'Not set'}\nPromotion threshold: ${guildData.settings.promotionHours??20}h`,0x5865f2)]});}return reply(interaction,{embeds:[ok('Configuration Updated','The guild configuration has been saved.')]}); }
  if (name==='tmodpromotions') {
    if(!isAdmin(member)) return reply(interaction,{embeds:[err('Access Denied','Administrator permissions are required.')],ephemeral:true});
    await interaction.deferReply();
    const sub=interaction.options.getSubcommand();
    if(sub==='channel'){
      const channel=interaction.options.getChannel('channel',true);
      guildData.settings.tmodPromotionsChannelId=channel.id;
      saveStore();
      return interaction.editReply({embeds:[ok('TMod Promotions Channel Set',`Trial Moderator promotion interviews will now be posted in ${channel}.`)]});
    }
    const id=guildData.settings.tmodPromotionsChannelId;
    return interaction.editReply({embeds:[embed('TMod Promotion Configuration',id?`**Interview Channel:** <#${id}>\n**Requirement:** ${TMOD_PROMOTION_HOURS}+ hours and no active strikes\n**Final Approval:** Administrator or higher`:'No Trial Moderator promotion channel is configured yet.',0xf59e0b)]});
  }

  if (name==='guild') {
    if(!isAdmin(member)) return reply(interaction,{embeds:[err('Access Denied','Administrator permissions are required.')],ephemeral:true});
    const sub=interaction.options.getSubcommand('share-roles');
    if(sub==='setup') {
      const existing=HARD_CODED_RANKS.filter(roleName=>interaction.guild.roles.cache.some(r=>r.name===roleName));
      store.roleShares.default={enabled:true,sourceGuildId:interaction.guild.id,sourceGuildName:interaction.guild.name,roleNames:[...HARD_CODED_RANKS],configuredBy:interaction.user.id,configuredAt:Date.now()};
      saveStore();
      await syncSharedRoles(interaction.client);
      return reply(interaction,{embeds:[ok('Shared Rank Roles Configured',`**Source guild:** ${interaction.guild.name}\n\n**Hard-coded ranks:**\n${HARD_CODED_RANKS.map(n=>`• ${n}${existing.includes(n)?' ✓':' (missing here)'}`).join('\n')}\n\nWhen a member joins another guild containing this bot, it will look up these role names and assign matching roles there. Roles are matched by **name**, not role ID.`)]});
    }
    if(sub==='disable') {
      if(store.roleShares.default) store.roleShares.default.enabled=false;
      saveStore();
      return reply(interaction,{embeds:[ok('Shared Rank Roles Disabled','Cross-guild rank-role synchronisation has been disabled.')]});
    }
    if(sub==='status') {
      const cfg=store.roleShares.default;
      return reply(interaction,{embeds:[embed('Shared Rank Role Status',cfg?.enabled?`**Source guild:** ${cfg.sourceGuildName||cfg.sourceGuildId}\n\n**Roles:**\n${(cfg.roleNames||[]).map(n=>`• ${n}`).join('\n')||'None'}\n\n**Status:** Enabled`:'No shared rank-role configuration is enabled.',0x5865f2)]});
    }
    await interaction.deferReply();
    await syncSharedRoles(interaction.client);
    return interaction.editReply({embeds:[ok('Role Sync Complete','The bot finished the cross-guild rank-role sync pass.')]});
  }

  return reply(interaction,{embeds:[err('Unknown Command','This command is not implemented yet.')],ephemeral:true});
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildBans]
});
client.once('ready', async c=>{
  console.log(`Logged in as ${c.user.tag}`);
  for(const g of c.guilds.cache.values()) await g.commands.set(data).catch(err=>console.error(`Command registration failed in ${g.id}:`,err));
  console.log(`Registered ${data.length} commands in ${c.guilds.cache.size} guild(s).`);
  setInterval(()=>syncSharedRoles(c).catch(console.error), 10*60*1000);
  setInterval(()=>enforceRtoSuspensions(c).catch(console.error), 15*1000);
  await enforceRtoSuspensions(c).catch(console.error);
});
client.on('guildCreate', async g=>{await g.commands.set(data).catch(()=>null);});
client.on('guildMemberAdd', async member=>{ await syncMemberSharedRoles(client, member).catch(()=>null); });
client.on('guildMemberUpdate', async (_old, member)=>{ if (member.guild.id !== (store.roleShares?.default?.sourceGuildId||'')) await syncMemberSharedRoles(client, member).catch(()=>null); });
client.on('channelCreate', async channel=>{
  if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) return;
  const g = gid(channel.guild.id);
  const active = Object.values(g.rtoSuspensions || {}).some(r => Number(r.expires) > Date.now());
  if (!active) return;
  const role = channel.guild.roles.cache.find(r => r.name.toLowerCase() === 'rto suspended');
  if (role) await channel.permissionOverwrites.edit(role, { Connect: false }, { reason: 'RTO suspension voice restriction' }).catch(()=>null);
});
client.on('interactionCreate', async i=>{if(i.isAutocomplete()){try{await handleAutocomplete(i);}catch(e){console.error(e);try{await i.respond([]);}catch{}}return;}if(i.isButton() && i.customId.startsWith('tmod_complete:')){try{await handleTmodCompleteButton(i);}catch(error){console.error(error);if(!i.replied&&!i.deferred)await i.reply({embeds:[err('Promotion Error','Something went wrong while completing the interview.')],ephemeral:true}).catch(()=>null);}return;}if(!i.isChatInputCommand())return;try{await handle(i);}catch(error){console.error(error);await reply(i,{embeds:[err('Command Error','Something went wrong while running this command.')],ephemeral:true});}});
client.login(process.env.DISCORD_BOT_TOKEN);
