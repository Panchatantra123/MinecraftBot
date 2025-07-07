const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const Vec3 = require('vec3');
const config = require('./settings.json');
const express = require('express');

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

    const home = bot.entity.position.clone(); // Set home on spawn

    bot.on('chat', async (username, message) => {
      if (username === bot.username) return;

      if (message.toLowerCase() === 'sleep') {
        if (!bot.time.isNight) {
          bot.chat('It’s not night time!');
          return;
        }

        let bed = bot.findBlock({
          matching: block => bot.isABed(block),
          maxDistance: 20
        });

        if (!bed) {
          const bedItem = bot.inventory.items().find(item => item.name.includes('bed'));
          if (!bedItem) {
            bot.chat('No bed nearby or in inventory!');
            return;
          }

          const placePos = bot.entity.position.offset(0, -1, 0);
          try {
            await bot.equip(bedItem, 'hand');
            await bot.placeBlock(bot.blockAt(placePos), new Vec3(0, 1, 0));
            bot.chat('Placed a bed.');
            bed = bot.findBlock({
              matching: block => bot.isABed(block),
              maxDistance: 5
            });
            if (!bed) throw new Error("Placed bed not detected");
          } catch (err) {
            bot.chat(`Failed to place bed: ${err.message}`);
            return;
          }
        }

        try {
          bot.chat('Going to bed...');
          bot.pathfinder.setMovements(defaultMove);
          bot.pathfinder.setGoal(new GoalBlock(bed.position.x, bed.position.y, bed.position.z));
          await bot.waitForTicks(20);
          await bot.sleep(bed);
        } catch (err) {
          bot.chat('Could not sleep: ' + err.message);
        }
      }
    });

    bot.on('wake', () => {
      bot.chat('Good morning! Returning home...');
      bot.pathfinder.setGoal(new GoalBlock(
        Math.floor(home.x),
        Math.floor(home.y),
        Math.floor(home.z)
      ));
    });
  });

  bot.on('chat', (username, message) => {
    if (config.utils["chat-log"]) {
      console.log(`[CHAT] <${username}> ${message}`);
    }
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
