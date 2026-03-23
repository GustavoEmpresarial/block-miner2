require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'blockminer.db');
console.log(`Opening DB at: ${dbPath}\n`);

const db = new sqlite3.Database(dbPath, async (err) => {
  if (err) {
    console.error('Error opening DB:', err.message);
    process.exit(1);
  }

  function run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  function get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  async function main() {
    try {
      const GH = 1_000_000_000;
      const rewardsData = [
        {
          name: 'GPU 1 GHS',
          slug: 'gpu-1-ghs',
          gpu_hash_rate: 1 * GH,
          description: 'Distribui apenas uma GPU de 1 GHS para cada usuário a cada 5 minutos',
          image_url: '/assets/machines/reward2.png'
        }
      ];

      // Mark all existing rewards as inactive
      await run('UPDATE auto_mining_rewards SET is_active = 0');

      console.log('Seeding auto_mining_rewards table...\n');

      for (const reward of rewardsData) {
        const existing = await get('SELECT id FROM auto_mining_rewards WHERE slug = ?', [reward.slug]);

        if (existing) {
          // Atualiza para is_active = 1 e atualiza campos
          const now = Date.now();
          await run(
            `UPDATE auto_mining_rewards SET is_active = 1, gpu_hash_rate = ?, description = ?, image_url = ?, updated_at = ? WHERE id = ?`,
            [reward.gpu_hash_rate, reward.description, reward.image_url, now, existing.id]
          );
          console.log(`✓ Reactivated and updated "${reward.name}" (ID: ${existing.id}, ${reward.gpu_hash_rate} H/s)`);
        } else {
          const now = Date.now();
          const result = await run(
            `INSERT INTO auto_mining_rewards (name, slug, gpu_hash_rate, description, image_url, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [reward.name, reward.slug, reward.gpu_hash_rate, reward.description, reward.image_url, 1, now, now]
          );
          console.log(`✓ Created "${reward.name}" (ID: ${result.lastID}, ${reward.gpu_hash_rate} H/s)`);
        }
      }

      // Show final count
      const countRow = await get('SELECT COUNT(*) as count FROM auto_mining_rewards WHERE is_active = 1');
      console.log(`\n✓ Done! Total active rewards: ${countRow.count}`);
    } catch (err) {
      console.error('\nError while seeding:', err && (err.stack || err.message || err));
      process.exit(1);
    } finally {
      db.close();
    }
  }

  main();
});
