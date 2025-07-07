const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const Vec3 = require('vec3');
const config = require('./settings.json');

// Acceptable typos for "sleep"
const sleepVariants = [
  'sleep', 'slep', 'sllep', 'slepp', 'slp', 'sleap', 'sleeep', 'sllep', 'sleeeep'
];

function isSleepCommand(msg) {
  const normalized = msg.trim().toLowerCase();
  return sleepVariants.includes(normalized);
}

function createBot() {
  let reconnecting = false;
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
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);

    bot.on('chat', async (username, message) => {
      if (username === bot.username) return;

      if (!isSleepCommand(message)) return;

      try {
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
          bot.chat('Sleeping...');
        } catch (err) {
          // Mineflayer throws if not night, or if bed is occupied, etc.
          bot.chat('Could not sleep: ' + err.message);
        }
      } catch (err) {
        bot.chat('Unexpected error: ' + err.message);
      }
    });
  });

  bot.on('kicked', (reason) => {
    // Detect duplicate login or other kick reasons
    let msg = '';
    try {
      msg = typeof reason === 'string' ? reason : JSON.stringify(reason);
    } catch { msg = String(reason); }
    if (msg.toLowerCase().includes('already connected') || msg.toLowerCase().includes('duplicate')) {
      console.log('[BOT] Disconnected due to duplicate login. Not reconnecting.');
      reconnecting = true;
    } else {
      console.log('[BOT] Kicked from server. Reason:', msg);
    }
  });

  bot.on('end', () => {
    if (reconnecting) return;
    if (config.utils && config.utils["auto-reconnect"]) {
      console.log('[BOT] Disconnected. Reconnecting...');
      setTimeout(() => createBot(), config.utils["auto-reconnect-delay"] || 5000);
    }
  });

  bot.on('error', err => {
    if (err.code === 'EPIPE') {
      if (!reconnecting) {
        console.log('[ERROR] write EPIPE');
        reconnecting = true;
      }
    } else {
      console.log(`[ERROR] ${err.message}`);
    }
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
  });
}

createBot();
