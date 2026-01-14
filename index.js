import 'dotenv/config';
import { Client, GatewayIntentBits, ActivityType, Events } from 'discord.js';
import { initStore } from './lib/store.js';
import useTelegramDetector from './detectors/telegram.js';

const {
  DISCORD_TOKEN, CHANNEL_ID, PING_ROLE_ID,
  TG_API_ID, TG_API_HASH, TG_SESSION, TG_CHANNELS
} = process.env;

// Circuit breaker Discord - prévient les boucles de reconnexion infinies
let discordReconnectCount = 0;
const DISCORD_MAX_RECONNECTS = 10;
const DISCORD_RECONNECT_WINDOW = 60000; // 1 minute

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages  // Requis pour envoyer des messages
  ]
});

// ═══════════════════════════════════════════════════════════════════════════
// Event Listeners Discord - Gestion des déconnexions et erreurs
// ═══════════════════════════════════════════════════════════════════════════

client.on(Events.ShardDisconnect, (event, shardId) => {
  console.warn(`[discord] ⚠ Shard ${shardId} déconnecté (code: ${event?.code || 'unknown'})`);
});

client.on(Events.ShardReconnecting, (shardId) => {
  discordReconnectCount++;
  console.log(`[discord] ⟳ Shard ${shardId} reconnexion en cours (${discordReconnectCount}/${DISCORD_MAX_RECONNECTS})...`);

  if (discordReconnectCount >= DISCORD_MAX_RECONNECTS) {
    console.error('[discord] ✗ ERREUR CRITIQUE: Nombre maximum de reconnexions atteint');
    console.error('[discord] Vérifiez DISCORD_TOKEN et la connexion réseau');
    process.exit(1);
  }
});

client.on(Events.ShardResume, (shardId, replayedEvents) => {
  console.log(`[discord] ✓ Shard ${shardId} reconnecté (${replayedEvents} events rejoués)`);
  // Reset counter on successful reconnection
  discordReconnectCount = Math.max(0, discordReconnectCount - 1);
});

client.on(Events.ShardError, (error, shardId) => {
  console.error(`[discord] ✗ Erreur shard ${shardId}:`, error.message);
});

client.on(Events.Error, (error) => {
  console.error('[discord] ✗ Erreur client:', error.message);
});

client.on(Events.Warn, (message) => {
  console.warn('[discord] ⚠ Warning:', message);
});

// Reset counter every minute (prevents permanent shutdown from transient issues)
setInterval(() => {
  if (discordReconnectCount > 0) {
    discordReconnectCount = Math.max(0, discordReconnectCount - 2);
  }
}, DISCORD_RECONNECT_WINDOW);

// ═══════════════════════════════════════════════════════════════════════════
// Démarrage du bot
// ═══════════════════════════════════════════════════════════════════════════

// ⬇️ Utilise 'clientReady' via Events.ClientReady (compatible v14 et prêt pour v15)
client.once(Events.ClientReady, async (c) => {
  console.log(`🚀 Connecté en tant que ${c.user.tag}`);

  try {
    await c.user.setPresence({
      status: 'online',
      activities: [{ name: 'Écoute et poste des bonus !', type: ActivityType.Playing }]
    });
  } catch (e) {
    console.error('Presence error:', e);
  }

  await initStore();

  // Valider la connexion Discord et les permissions
  try {
    const targetChannel = await client.channels.fetch(CHANNEL_ID);
    if (!targetChannel) {
      console.error('[discord] ✗ ERREUR CRITIQUE: Canal introuvable (ID:', CHANNEL_ID, ')');
      process.exit(1);
    }
    if (!targetChannel.isTextBased()) {
      console.error('[discord] ✗ ERREUR CRITIQUE: Le canal n\'est pas un canal textuel');
      process.exit(1);
    }
    console.log(`[discord] ✓ Canal validé: #${targetChannel.name}`);
  } catch (e) {
    console.error('[discord] ✗ ERREUR CRITIQUE: Impossible d\'accéder au canal:', e.message);
    console.error('[discord] Vérifiez CHANNEL_ID et les permissions du bot');
    process.exit(1);
  }

  if (TG_API_ID && TG_API_HASH) {
    await useTelegramDetector(client, CHANNEL_ID, PING_ROLE_ID, {
      apiId: TG_API_ID, apiHash: TG_API_HASH, session: TG_SESSION, channels: TG_CHANNELS
    });
    console.log('[telegram] détecteur chargé');
  } else {
    console.log('[telegram] non configuré (ajoute TG_API_ID/TG_API_HASH)');
  }
});

process.on('unhandledRejection', (err) => console.error('UnhandledRejection:', err));
process.on('uncaughtException', (err) => console.error('UncaughtException:', err));

client.login(DISCORD_TOKEN);
