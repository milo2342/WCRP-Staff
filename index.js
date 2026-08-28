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
const STAFF_TEAM_ROLE_NAME = 'WCRP | Staff team';
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
add(new SlashCommandBuilder().setName('addrank').setDescription('Assign a staff rank').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(o=>o.setName('rank').setDescription('Rank').setRequired(true)));
add(new SlashCommandBuilder().setName('rank').setDescription('Manage staff ranks').addSubcommand(sc=>sc.setName('add').setDescription('Assign a staff rank').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(o=>o.setName('rank').setDescription('Rank').setRequired(true))).addSubcommand(sc=>sc.setName('remove').setDescription('Remove a staff rank').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true))));
add(new SlashCommandBuilder().setName('promote').setDescription('Promote a staff member, assign the matching rank role, and DM them').addUserOption(o=>o.setName('user').setDescription('Staff member').setRequired(true)).addStringOption(o=>o.setName('rank').setDescription('New rank').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Optional promotion reason')));
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
  .addSubcommand(sc=>sc.setName('setup').setDescription('Set the source guild and rank role names to share').addStringOption(o=>o.setName('roles').setDescription('Comma-separated role names from this server').setRequired(true)))
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

// RTO suspension helpers
async function ensureRtoSuspendedRole(guild) {
  let role = guild.roles.cache.find(r => r.name.toLowerCase() === 'rto suspended');
  if (role) return role;
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) return null;
  return guild.roles.create({ name: 'RTO Suspended', color: 0xef4444, reason: 'Create RTO suspension role' }).catch(() => null);
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
  if (!role) throw new Error('Could not create or find the RTO Suspended role. Ensure Manage Roles is granted and the bot role is high enough.');
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
        if (!destRole && destGuild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
          const src = sourceGuild.roles.cache.find(r => r.name === roleName);
          destRole = await destGuild.roles.create({
            name: roleName,
            color: src?.color ?? 0x5865f2,
            reason: 'PSRP shared rank-role sync'
          }).catch(() => null);
        }
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
      if (!destRole && member.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        const srcRole = sourceGuild.roles.cache.find(r => r.name === roleName);
        destRole = await member.guild.roles.create({ name: roleName, color: srcRole?.color ?? 0x5865f2, reason: 'PSRP shared rank-role sync' }).catch(() => null);
      }
      if (destRole?.editable && !member.roles.cache.has(destRole.id)) {
        await member.roles.add(destRole, 'PSRP shared rank-role sync').catch(() => null);
      }
    }
  }
}

async function sendPromotionNotification({ guild, target, oldRank, newRank, promotedBy, reason }) {
  const g = gid(guild.id);
  const channelId = g.settings.promotionLogChannelId;
  if (channelId) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const e = new EmbedBuilder()
        .setTitle('Staff Promotion')
        .setDescription(`${target} has been promoted.`)
        .setColor(0x22c55e)
        .addFields(
          { name: 'Staff Member', value: `${target} (${target.tag})`, inline: true },
          { name: 'Previous Rank', value: oldRank || 'Unranked', inline: true },
          { name: 'New Rank', value: newRank, inline: true },
          { name: 'Promoted By', value: `<@${promotedBy}>`, inline: true },
          { name: 'Reason', value: reason || 'No reason provided.' }
        ).setTimestamp();
      await channel.send({ embeds: [e] }).catch(() => null);
    }
  }
  const dm = new EmbedBuilder()
    .setTitle('Congratulations — You Were Promoted')
    .setDescription(`Your staff rank in **${guild.name}** has been updated.`)
    .setColor(0x22c55e)
    .addFields(
      { name: 'Previous Rank', value: oldRank || 'Unranked', inline: true },
      { name: 'New Rank', value: newRank, inline: true },
      { name: 'Promoted By', value: `<@${promotedBy}>`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided.' }
    ).setTimestamp();
  await target.send({
    content: `Staff Discord: ${STAFF_DISCORD_INVITE}`,
    embeds: [dm]
  }).catch(() => null);
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

async function syncRankRoleInGuild(guild, member, rank) {
  if (!rank) return null;
  const role = guild.roles.cache.find(r => r.name === rank);
  if (role?.editable && !member.roles.cache.has(role.id)) {
    await member.roles.add(role, 'Assign staff rank role').catch(() => null);
  }
  await ensureStaffTeamRole(guild, member, true);
  return role || null;
}

async function handle(interaction) {
  if (!interaction.inGuild()) return reply(interaction,{content:'This bot only works inside servers.',ephemeral:true});
  const guildData = ensureGuild(interaction);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
  const name = interaction.commandName;

  const staffOnly = ['activestaff','addhours','removehours','addrank','rank','promote','promotion','bancount','clockrepair','deaths','dms','evaluate','hourmultiplier','stophourmulti','logbonus','passivehours','praise','promotions','promotioninterview','punishmenthistory','removepunishment','removeblacklist','removestaffremoval','removestrike','requesthours','staffblacklist','staffnextweek','staffremoval','staffstrike','supportteam','tmodpromos','unban','unjoin','passiveflags'];
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
    u.hours=Math.max(0,name==='addhours'?u.hours+hours:u.hours-hours); u.lastSeen=Date.now(); saveStore(); audit(interaction.guildId,`${name} ${fmtHours(hours)} for ${target.tag} by ${interaction.user.tag}`); await sendLog(interaction.guild,`${interaction.user} ${name} **${fmtHours(hours)}** ${name==='addhours'?'to':'from'} <@${target.id}>.`);
    return reply(interaction,{embeds:[ok(name==='addhours'?'Hours Added':'Hours Removed',`${target} now has **${fmtHours(u.hours)}** this week.`)]});
  }
  if (name==='requesthours') { const h=interaction.options.getNumber('hours',true), reason=interaction.options.getString('reason',true); (guildData.logs.hourRequests??=[]).push({user:interaction.user.id,hours:h,reason,at:Date.now(),status:'pending'}); saveStore(); return reply(interaction,{embeds:[ok('Hours Request Submitted',`Requested **${fmtHours(h)}**.\nReason: ${reason}`)]}); }
  if (name==='rank') {
    const sub=interaction.options.getSubcommand();
    const target=interaction.options.getUser('user',true);
    if (sub==='remove') {
      const u=uid(target.id,interaction.guildId);
      const oldRank=u.rank||'';
      u.rank='';
      const memberTarget=await interaction.guild.members.fetch(target.id).catch(()=>null);
      if (memberTarget && oldRank) {
        const role=interaction.guild.roles.cache.find(r=>r.name===oldRank);
        if (role?.editable && memberTarget.roles.cache.has(role.id)) await memberTarget.roles.remove(role,'Staff rank removed').catch(()=>null);
      }
      if (memberTarget) await ensureStaffTeamRole(interaction.guild, memberTarget, false);
      saveStore();
      return reply(interaction,{embeds:[ok('Rank Removed',`${target} no longer has a staff rank.

**Previous rank:** ${oldRank||'Unranked'}`)]});
    }
    const rank=interaction.options.getString('rank',true);
    const u=uid(target.id,interaction.guildId);
    const oldRank=u.rank||'';
    u.rank=rank;
    u.lastSeen=Date.now();
    saveStore();
    const memberTarget=await interaction.guild.members.fetch(target.id).catch(()=>null);
    if (memberTarget) await syncRankRoleInGuild(interaction.guild, memberTarget, rank);
    await sendPromotionNotification({guild:interaction.guild,target,oldRank,newRank:rank,promotedBy:interaction.user.id,reason:''});
    return reply(interaction,{embeds:[ok('Rank Added',`${target} is now **${rank}**.

**Previous rank:** ${oldRank||'Unranked'}
**Assigned by:** ${interaction.user}`)]});
  }
  if (name==='addrank' || name==='promote') {
    const target=interaction.options.getUser('user',true);
    const rank=interaction.options.getString('rank',true);
    const reason=name==='promote' ? (interaction.options.getString('reason')||'') : '';
    const u=uid(target.id,interaction.guildId);
    const oldRank=u.rank||'';
    u.rank=rank;
    u.lastSeen=Date.now();
    saveStore();
    const memberTarget=await interaction.guild.members.fetch(target.id).catch(()=>null);
    if (memberTarget) await syncRankRoleInGuild(interaction.guild, memberTarget, rank);
    await sendPromotionNotification({guild:interaction.guild,target,oldRank,newRank:rank,promotedBy:interaction.user.id,reason});
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
  if (name==='promotions' || name==='tmodpromos') { const threshold=guildData.settings.promotionHours??20; const list=Object.entries(guildData.users).filter(([_,u])=>u.hours>=threshold).map(([id,u])=>`<@${id}> — ${fmtHours(u.hours)} — ${u.rank||'Unranked'}`); return reply(interaction,{embeds:[embed(name==='promotions'?'Promotion Eligibility':'Trial Moderator Promotions',list.length?list.join('\n'):`No staff meet the current **${threshold}h** threshold.`,0xf59e0b)]}); }
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
  if (name==='staffremoval') { const t=interaction.options.getUser('user',true),reason=interaction.options.getString('reason',true),u=uid(t.id,interaction.guildId);u.removals.push({reason,by:interaction.user.id,at:Date.now(),active:true});saveStore();const m=await interaction.guild.members.fetch(t.id).catch(()=>null);if(m){ if(m.roles.cache.size){ const oldRank=u.rank||''; if(oldRank){ const oldRole=interaction.guild.roles.cache.find(r=>r.name===oldRank); if(oldRole?.editable && m.roles.cache.has(oldRole.id)) await m.roles.remove(oldRole,'Staff removal').catch(()=>null); } await ensureStaffTeamRole(interaction.guild,m,false); } if(m.kickable)await m.kick(`Staff removal: ${reason}`).catch(()=>null); } return reply(interaction,{embeds:[embed('Staff Removal',`${t} has been removed from staff.\n**Reason:** ${reason}`,0xef4444)]}); }
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
  if (name==='guild') {
    if(!isAdmin(member)) return reply(interaction,{embeds:[err('Access Denied','Administrator permissions are required.')],ephemeral:true});
    const sub=interaction.options.getSubcommand('share-roles');
    if(sub==='setup') {
      const rolesInput=interaction.options.getString('roles',true);
      const roleNames=[...new Set(rolesInput.split(',').map(v=>v.trim()).filter(Boolean))].slice(0,10);
      const validated=roleNames.filter(roleName=>interaction.guild.roles.cache.some(r=>r.name===roleName));
      if(!validated.length) return reply(interaction,{embeds:[err('No Matching Roles','None of the supplied role names exist in this guild.')],ephemeral:true});
      store.roleShares.default={enabled:true,sourceGuildId:interaction.guild.id,sourceGuildName:interaction.guild.name,roleNames:validated,configuredBy:interaction.user.id,configuredAt:Date.now()};
      saveStore();
      await syncSharedRoles(interaction.client);
      return reply(interaction,{embeds:[ok('Shared Rank Roles Configured',`**Source guild:** ${interaction.guild.name}\n\n**Role names to sync:**\n${validated.map(n=>`• ${n}`).join('\n')}\n\nWhen a member joins another guild containing this bot, it will look up these role names and assign matching roles there. Roles are matched by **name**, not role ID.`)]});
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
client.on('interactionCreate', async i=>{if(!i.isChatInputCommand())return;try{await handle(i);}catch(err){console.error(err);await reply(i,{embeds:[err('Command Error','Something went wrong while running this command.')],ephemeral:true});}});
client.login(process.env.DISCORD_BOT_TOKEN);
