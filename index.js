import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AutoModerationActionType,
  AutoModerationRuleTriggerType,
} from "discord.js";

// ─── Config ────────────────────────────────────────────────────────────────
const TOKEN            = process.env.DISCORD_BOT_TOKEN;
const STAFF_ROLE_ID    = process.env.DISCORD_STAFF_ROLE_ID;
const ALERT_CHANNEL_ID = process.env.DISCORD_ALERT_CHANNEL_ID;

if (!TOKEN)            throw new Error("Missing DISCORD_BOT_TOKEN");
if (!STAFF_ROLE_ID)    throw new Error("Missing DISCORD_STAFF_ROLE_ID");
if (!ALERT_CHANNEL_ID) throw new Error("Missing DISCORD_ALERT_CHANNEL_ID");
// ───────────────────────────────────────────────────────────────────────────

const TRIGGER_LABELS = {
  [AutoModerationRuleTriggerType.Keyword]:       "Keyword Filter",
  [AutoModerationRuleTriggerType.Spam]:          "Spam Detection",
  [AutoModerationRuleTriggerType.KeywordPreset]: "Built-in Keyword Preset",
  [AutoModerationRuleTriggerType.MentionSpam]:   "Mention Spam",
  [AutoModerationRuleTriggerType.MemberProfile]: "Member Profile",
};

const ACTION_LABELS = {
  [AutoModerationActionType.BlockMessage]:           "Message Blocked",
  [AutoModerationActionType.SendAlertMessage]:       "Alert Sent",
  [AutoModerationActionType.Timeout]:                "User Timed Out",
  [AutoModerationActionType.BlockMemberInteraction]: "Interaction Blocked",
};

// ─── Deduplication ─────────────────────────────────────────────────────────
// AutoMod fires one event per action (block + timeout + alert = up to 3 events).
// We only send one alert per (user + rule) within a 10-second window.
const DEDUP_TTL = 10_000;
const seen = new Map();

function isDuplicate(userId, ruleId) {
  const key = `${userId}:${ruleId}`;
  const now = Date.now();
  if (seen.has(key) && now - seen.get(key) < DEDUP_TTL) return true;
  seen.set(key, now);
  for (const [k, t] of seen) if (now - t >= DEDUP_TTL) seen.delete(k);
  return false;
}
// ───────────────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.AutoModerationExecution,
  ],
});

client.once("clientReady", (c) => {
  console.log(`[AutoMod Bot] Online as ${c.user.tag}`);
  console.log(`[AutoMod Bot] Watching for AutoMod actions...`);
});

client.on("autoModerationActionExecution", async (execution) => {
  const { action, ruleId, ruleTriggerType, userId, channelId, messageId,
          matchedContent, matchedKeyword, guild } = execution;

  if (isDuplicate(userId, ruleId)) return;

  try {
    const alertChannel = await guild.channels.fetch(ALERT_CHANNEL_ID).catch(() => null);
    if (!alertChannel?.isTextBased()) {
      console.error(`[AutoMod Bot] Alert channel ${ALERT_CHANNEL_ID} not found or not text-based`);
      return;
    }

    const triggerLabel = TRIGGER_LABELS[ruleTriggerType] ?? `Unknown (${ruleTriggerType})`;
    const actionLabel  = ACTION_LABELS[action.type]      ?? `Unknown (${action.type})`;

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🛡️ AutoMod Action Triggered")
      .setTimestamp()
      .addFields(
        { name: "Action",  value: actionLabel,                 inline: true },
        { name: "Trigger", value: triggerLabel,                inline: true },
        { name: "User",    value: `<@${userId}> (${userId})`,  inline: true },
      );

    if (channelId)      embed.addFields({ name: "Channel",        value: `<#${channelId}>`,        inline: true });
    if (matchedKeyword) embed.addFields({ name: "Matched Keyword", value: `\`${matchedKeyword}\``, inline: true });
    if (matchedContent) {
      const text = matchedContent.length > 1024 ? matchedContent.slice(0, 1021) + "..." : matchedContent;
      embed.addFields({ name: "Matched Content", value: "```" + text + "```" });
    }

    embed.setFooter({ text: messageId
      ? `Rule ID: ${ruleId} • Message ID: ${messageId}`
      : `Rule ID: ${ruleId}` });

    await alertChannel.send({
      content: `<@&${STAFF_ROLE_ID}> Bạn iu ơi, có người vừa vi phạm nek :3`,
      embeds: [embed],
    });

    console.log(`[AutoMod Bot] Alert sent — user ${userId} | ${actionLabel} | ${triggerLabel}`);
  } catch (err) {
    console.error("[AutoMod Bot] Error:", err);
  }
});

client.on("error", (err) => console.error("[AutoMod Bot] Client error:", err));

client.login(TOKEN);
