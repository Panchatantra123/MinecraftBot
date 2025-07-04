const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(8000, () => console.log('[WEB] Express server started on port 8000'));

function createBot() {
  const bot = mineflayer.createBot({
    username: config["bot-account"].username,
    password: config["bot-account"].password || undefined,
    auth: config["bot-account"].type, // "microsoft", "mojang", or "offline"
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log('[BOT] Spawned into the server.');

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);

    // Auto-Auth
    if (config.utils["auto-auth"].enabled) {
      const pass = config.utils["auto-auth"].password;
      setTimeout(() => {
        bot.chat(`/register ${pass} ${pass}`);
        bot.chat(`/login ${pass}`);
      }, 500);
      console.log('[BOT] Sent /register and /login commands.');
    }

    // Chat Messages
    if (config.utils["chat-messages"].enabled) {
      const msgs = config.utils["chat-messages"].messages;
      if (config.utils["chat-messages"].repeat) {
        let i = 0;
        setInterval(() => {
          bot.chat(msgs[i]);
          i = (i + 1) % msgs.length;
        }, config.utils["chat-messages"]["repeat-delay"] * 1000);
      } else {
        msgs.forEach(msg => bot.chat(msg));
      }
    }

    // Move to position
    if (config.position.enabled) {
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
    }

    // Anti-AFK
    if (config.utils["anti-afk"].enabled) {
      bot.setControlState('jump', true);
      if (config.utils["anti-afk"].sneak) {
        bot.setControlState('sneak', true);
      }
    }
  });

  bot.on('chat', (username, message) => {
    if (config.utils["chat-log"]) {
      console.log(`[CHAT] <${username}> ${message}`);
    }
  });

  bot.on('goal_reached', () => {
    console.log('[BOT] Reached target location.');
  });

  bot.on('death', () => {
    console.log('[BOT] Died and respawned.');
  });

  bot.on('kicked', reason => {
    console.log(`[BOT] Kicked from server. Reason: ${reason}`);
  });

  bot.on('error', err => {
    console.log(`[ERROR] ${err.message}`);
  });

  if (config.utils["auto-reconnect"]) {
    bot.on('end', () => {
      console.log('[BOT] Disconnected. Reconnecting...');
      setTimeout(() => createBot(), config.utils["auto-recconect-delay"]);
    });
  }
}

createBot();
