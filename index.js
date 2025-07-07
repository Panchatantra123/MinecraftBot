const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');
const Vec3 = require('vec3');

const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(8000, () => console.log('[WEB] Express server started on port 8000'));

function createBot() {
  const bot = mineflayer.createBot({
    username: config["bot-account"].username,
    password: config["bot-account"].password || undefined,
    auth: config["bot-account"].type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log('[BOT] Spawned into the server.');
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);

    const home = config.home || { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z };

    // Auto-auth
    if (config.utils["auto-auth"].enabled) {
      const pass = config.utils["auto-auth"].password;
      setTimeout(() => {
        bot.chat(`/register ${pass} ${pass}`);
        bot.chat(`/login ${pass}`);
      }, 500);
    }

    // Chat messages
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

    // Go to start position
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

    // Sleep
    bot.on('chat', async (username, message) => {
      if (username === bot.username) return;

      if (message.toLowerCase() === 'sleep') {
        const bed = bot.findBlock({
          matching: block => mcData.blocks[block.type]?.name?.includes('bed'),
          maxDistance: 30
        });

        if (!bed) {
          bot.chat('No bed nearby!');
          return;
        }

        try {
          bot.chat('Heading to bed...');
          bot.pathfinder.setMovements(defaultMove);
          bot.pathfinder.setGoal(new GoalBlock(bed.position.x, bed.position.y, bed.position.z));
          await bot.waitForTicks(40);
          await bot.sleep(bed);
        } catch (err) {
          bot.chat('Could not sleep: ' + err.message);
        }
      }
    });

    bot.on('wake', () => {
      bot.chat('Good morning!');
    });

    // Auto-eat
    bot.on('physicsTick', () => {
      if (bot.food < 16) {
        const foodItem = bot.inventory.items().find(item => item.name.includes('bread') || item.name.includes('apple') || item.name.includes('cooked'));
        if (foodItem) {
          bot.equip(foodItem, 'hand').then(() => bot.consume()).catch(err => console.log('[EAT ERROR]', err.message));
        } else if (!bot._askedForFood) {
          bot.chat('I need food!');
          bot._askedForFood = true;
          setTimeout(() => { bot._askedForFood = false }, 60000); // don't spam
        }
      }
    });

    // Respawn handler
    bot.on('respawn', () => {
      bot.chat('I respawned! Returning to home base...');
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(home.x, home.y, home.z));
    });
  });

  bot.on('chat', (username, message) => {
    if (config.utils["chat-log"]) {
      console.log(`[CHAT] <${username}> ${message}`);
    }
  });

  bot.on('goal_reached', () => {
    console.log('[BOT] Reached goal.');
  });

  bot.on('death', () => {
    console.log('[BOT] Died and will respawn...');
  });

  bot.on('kicked', reason => {
    console.log('[BOT] Kicked from server:', reason);
  });

  bot.on('error', err => {
    console.log('[ERROR]', err.message);
  });

  if (config.utils["auto-reconnect"]) {
    bot.on('end', () => {
      console.log('[BOT] Disconnected. Reconnecting...');
      setTimeout(() => createBot(), config.utils["auto-recconect-delay"]);
    });
  }
}

createBot();
