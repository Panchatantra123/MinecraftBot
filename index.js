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

    // --- Human-like idle behavior ---
    setInterval(() => {
      // Randomly look around
      if (Math.random() < 0.5) {
        const yaw = Math.random() * Math.PI * 2;
        const pitch = (Math.random() - 0.5) * 0.5;
        bot.look(yaw, pitch, true);
      }
      // Occasionally jump
      if (Math.random() < 0.1 && bot.entity.onGround) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 400 + Math.random() * 300);
      }
      // Occasionally sneak
      if (Math.random() < 0.05) {
        bot.setControlState('sneak', true);
        setTimeout(() => bot.setControlState('sneak', false), 1000 + Math.random() * 2000);
      }
    }, 4000);

    // --- Human-like random chat ---
    const randomChats = [
      "Nice day in Minecraft!",
      "Anyone need help?",
      "Just chilling.",
      "What's up?",
      "I love mining!",
      "Let's build something cool.",
      "Who's online?"
    ];
    setInterval(() => {
      if (Math.random() < 0.03) {
        bot.chat(randomChats[Math.floor(Math.random() * randomChats.length)]);
      }
    }, 20000);

    bot.on('chat', async (username, message) => {
      if (username === bot.username) return;

      // --- Human-like chat responses ---
      const lower = message.toLowerCase();
      if (["hi", "hello", "hey"].includes(lower)) {
        setTimeout(() => bot.chat(`Hello, ${username}!`), 800 + Math.random() * 1200);
        return;
      }
      if (lower.includes("how are you")) {
        setTimeout(() => bot.chat("I'm good! How about you?"), 1000 + Math.random() * 1000);
        return;
      }
      if (lower.includes("who are you")) {
        setTimeout(() => bot.chat("I'm just a regular player!"), 1000 + Math.random() * 1000);
        return;
      }

      // Add a small delay before responding to commands
      const respondDelay = 600 + Math.random() * 800;
      await new Promise(res => setTimeout(res, respondDelay));

      const args = message.trim().split(/\s+/);
      const cmd = args[0].toLowerCase();

      if (cmd === 'sleep') {
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

          // Find a valid place to put the bed (not on another bed)
          let placePos = bot.entity.position.offset(0, -1, 0);
          let blockBelow = bot.blockAt(placePos);
          if (!blockBelow || bot.isABed(blockBelow)) {
            // Try to find a nearby solid block to place the bed
            const offsets = [
              [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]
            ];
            for (const [dx, dy, dz] of offsets) {
              const candidate = bot.blockAt(bot.entity.position.offset(dx, dy, dz));
              if (candidate && !bot.isABed(candidate) && candidate.boundingBox === 'block') {
                placePos = bot.entity.position.offset(dx, dy, dz);
                break;
              }
            }
          }

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
          // Move next to the bed before sleeping
          const bedPos = bed.position;
          // Find a position next to the bed to stand on
          const adjacentOffsets = [
            [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]
          ];
          let standPos = null;
          for (const [dx, dy, dz] of adjacentOffsets) {
            const pos = bedPos.offset(dx, dy, dz);
            const block = bot.blockAt(pos);
            if (block && block.boundingBox === 'block' && !bot.isABed(block)) {
              standPos = pos;
              break;
            }
          }
          if (standPos) {
            bot.pathfinder.setGoal(new GoalBlock(standPos.x, standPos.y, standPos.z));
            await bot.waitForTicks(20);
          }
          // Face the bed before sleeping
          await bot.lookAt(bed.position.offset(0.5, 0.5, 0.5));
          await bot.sleep(bed);
        } catch (err) {
          bot.chat('Could not sleep: ' + err.message);
        }
      }

      // --- Mining Command ---
      else if (cmd === 'mine' && args[1]) {
        const blockName = args[1].toLowerCase();
        const mcData = require('minecraft-data')(bot.version);
        const blockId = mcData.blocksByName[blockName]?.id;
        if (!blockId) {
          bot.chat(`I don't know the block "${blockName}".`);
          return;
        }
        const block = bot.findBlock({
          matching: blockId,
          maxDistance: 32
        });
        if (!block) {
          bot.chat(`No ${blockName} nearby!`);
          return;
        }
        // Determine required tool
        const blockInfo = mcData.blocksByName[blockName];
        let toolType = null;
        if (blockInfo.diggable && blockInfo.harvestTools) {
          // Pick the first required tool
          const toolIds = Object.keys(blockInfo.harvestTools);
          if (toolIds.length > 0) {
            const toolItem = mcData.items[toolIds[0]];
            if (toolItem) toolType = toolItem.name;
          }
        }
        // Find tool in inventory
        let tool = null;
        if (toolType) {
          tool = bot.inventory.items().find(item => item.name.includes(toolType));
        }
        if (toolType && !tool) {
          bot.chat(`I need a ${toolType} to mine ${blockName}. Please give me one!`);
          return;
        }
        try {
          if (tool) await bot.equip(tool, 'hand');
          bot.chat(`Mining ${blockName}...`);
          await bot.pathfinder.goto(new bot.pathfinder.GoalBlock(block.position.x, block.position.y, block.position.z));
          await bot.dig(block);
          bot.chat(`Finished mining ${blockName}.`);
        } catch (err) {
          if (err.message && err.message.includes('Cannot dig block')) {
            bot.chat(`Can't mine ${blockName}: ${err.message}`);
          } else {
            bot.chat(`Error mining: ${err.message}`);
          }
        }
      }
      // --- Collect/Gather Command ---
      else if ((cmd === 'collect' || cmd === 'gather') && args.length >= 3) {
        const count = parseInt(args[1]);
        const itemName = args.slice(2).join(' ').toLowerCase();
        const mcData = require('minecraft-data')(bot.version);
        const item = mcData.itemsByName[itemName];
        if (!item || isNaN(count) || count < 1) {
          bot.chat("Usage: collect <count> <item>");
          return;
        }
        let collected = bot.inventory.count(item.id);
        if (collected >= count) {
          bot.chat(`I already have ${count} ${itemName}(s)!`);
          return;
        }
        bot.chat(`Trying to collect ${count} ${itemName}(s)...`);

        // 1. Search nearby chests for the item
        let needed = count - collected;
        let foundInChests = 0;
        const chestBlocks = [];
        for (let x = -200; x <= 200; x += 1) {
          for (let z = -200; z <= 200; z += 1) {
            const pos = bot.entity.position.offset(x, 0, z);
            const block = bot.blockAt(pos);
            if (block && block.name === 'chest') chestBlocks.push(block);
          }
        }
        for (const chestBlock of chestBlocks) {
          try {
            const chest = await bot.openChest(chestBlock);
            const chestItem = chest.containerItems().find(i => i.name === itemName);
            if (chestItem) {
              const takeCount = Math.min(needed, chestItem.count);
              await chest.withdraw(item.id, null, takeCount);
              foundInChests += takeCount;
              needed -= takeCount;
              bot.chat(`Took ${takeCount} ${itemName}(s) from a chest.`);
            }
            chest.close();
            if (needed <= 0) break;
          } catch (e) { /* ignore errors */ }
        }
        collected = bot.inventory.count(item.id);
        if (collected >= count) {
          bot.chat(`Collected ${count} ${itemName}(s)!`);
          return;
        }

        // 2. Try to craft the item if recipe exists
        const recipe = bot.recipesFor(item.id, null, 1, null)[0];
        if (recipe) {
          try {
            await bot.craft(recipe, count - collected, null);
            bot.chat(`Crafted ${count - collected} ${itemName}(s)!`);
          } catch (e) {
            bot.chat(`Couldn't craft ${itemName}: ${e.message}`);
            return;
          }
        } else {
          bot.chat(`No recipe found for ${itemName}, and not enough in chests.`);
          return;
        }

        // 3. Final check
        collected = bot.inventory.count(item.id);
        if (collected >= count) {
          bot.chat(`Collected ${count} ${itemName}(s)!`);
        } else {
          bot.chat(`Could only collect ${collected} ${itemName}(s).`);
        }
      }
    });

    // Auto-eat when hungry
    bot.on('health', async () => {
      if (bot.food !== undefined && bot.food < 16) {
        const foodItem = bot.inventory.items().find(item =>
          item.name.includes('bread') ||
          item.name.includes('apple') ||
          item.name.includes('cooked')
        );
        if (foodItem) {
          try {
            await bot.equip(foodItem, 'hand');
            await bot.consume();
            bot.chat("Ate some food automatically.");
          } catch (err) {
            bot.chat("Couldn't eat: " + err.message);
          }
        } else {
          bot.chat("I'm hungry! Please give me food.");
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
      setTimeout(() => createBot(), config.utils["auto-reconnect-delay"]);
    });
  }
}

createBot();

// Add global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
