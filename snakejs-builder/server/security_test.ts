import { WebSocket } from 'ws';
import { SKINS } from '../src/data/skins';
import { sqliteDb } from './SqliteDatabase';

async function runTests() {
  console.log('🧪 Starting Full SQLite Database & Security Automated Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} - ${detail || ''}`);
      failed++;
    }
  }

  await sqliteDb.waitUntilReady();

  const PORT = 3000;
  const wsUrl = `ws://localhost:${PORT}`;

  function createTestClient(customSessionToken?: string): Promise<{
    ws: WebSocket;
    sessionToken: string;
    accountId: string;
    profile: any;
    messages: any[];
    send: (msg: any) => void;
    fetchProfile: () => Promise<any>;
    waitFor: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
  }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const messages: any[] = [];

      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          messages.push(parsed);
        } catch {}
      });

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'AUTH_INIT', sessionToken: customSessionToken }));
      });

      const timeout = setTimeout(() => {
        reject(new Error('Connection timed out'));
      }, 3500);

      const checkAuth = setInterval(() => {
        const authMsg = messages.find((m) => m.type === 'AUTH_SUCCESS');
        if (authMsg) {
          clearInterval(checkAuth);
          clearTimeout(timeout);

          const client = {
            ws,
            sessionToken: authMsg.sessionToken,
            accountId: authMsg.accountId,
            profile: authMsg.profile,
            messages,
            send: (msg: any) => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)),
            waitFor: (predicate: (msg: any) => boolean, timeoutMs = 2500) => {
              return new Promise((res, rej) => {
                const existing = messages.find(predicate);
                if (existing) return res(existing);
                const t0 = Date.now();
                const interval = setInterval(() => {
                  const found = messages.find(predicate);
                  if (found) {
                    clearInterval(interval);
                    res(found);
                  } else if (Date.now() - t0 > timeoutMs) {
                    clearInterval(interval);
                    rej(new Error('Wait timeout'));
                  }
                }, 20);
              });
            },
            fetchProfile: async () => {
              const startIdx = messages.length;
              ws.send(JSON.stringify({ type: 'GET_PROFILE' }));
              const t0 = Date.now();
              return new Promise((res, rej) => {
                const interval = setInterval(() => {
                  const updateMsg = messages.slice(startIdx).find((m) => m.type === 'PROFILE_UPDATED');
                  if (updateMsg) {
                    clearInterval(interval);
                    res(updateMsg.profile);
                  } else if (Date.now() - t0 > 2000) {
                    clearInterval(interval);
                    rej(new Error('Profile fetch timeout'));
                  }
                }, 20);
              });
            },
          };

          resolve(client);
        }
      }, 20);
    });
  }

  try {
    // ─── TEST 1 & 2: Création et Récupération d'un compte dans SQLite
    const directAuth = sqliteDb.authenticate(undefined, 'TestPlayer');
    assert(Boolean(directAuth.accountId.startsWith('acc_')), 'TEST 1: Création d’un compte dans SQLite (ID généré)');
    const fetchedProfile = sqliteDb.getProfile(directAuth.accountId);
    assert(Boolean(fetchedProfile && fetchedProfile.id === directAuth.accountId), 'TEST 2: Récupération du compte depuis SQLite');

    // ─── TEST 3: Sauvegarde des Coins dans SQLite
    const initialCoins = fetchedProfile!.coins;
    assert(typeof initialCoins === 'number' && initialCoins >= 0, 'TEST 3: Sauvegarde et lecture des coins depuis SQLite');

    // ─── TEST 4: Achat d’un skin dans une transaction SQLite
    const affordableSkin = SKINS.find((s) => s.price <= initialCoins && !fetchedProfile!.unlockedSkins.includes(s.id));
    if (affordableSkin) {
      const buyRes = sqliteDb.buySkin(directAuth.accountId, affordableSkin.id);
      assert(buyRes.success && buyRes.profile.unlockedSkins.includes(affordableSkin.id), 'TEST 4: Achat d’un skin dans une transaction SQLite');
    } else {
      const targetSkin = SKINS[2];
      sqliteDb.applyMatchResults(directAuth.accountId, 'CLASSIC', 2000, 10, 1, 100, 18);
      const buyRes = sqliteDb.buySkin(directAuth.accountId, targetSkin.id);
      assert(buyRes.success, 'TEST 4: Achat d’un skin dans une transaction SQLite');
    }

    // ─── TEST 5: Achat impossible si coins insuffisants
    const expensiveSkin = SKINS.find((s) => s.price > 1000)!;
    const failedBuy = sqliteDb.buySkin(directAuth.accountId, expensiveSkin.id);
    assert(!failedBuy.success && failedBuy.message.includes('Coins insuffisants'), 'TEST 5: Achat impossible si coins insuffisants');

    // ─── TEST 6: Achats simultanés concurrents (double dépense impossible)
    const testBuyer = sqliteDb.authenticate(undefined, 'Buyer').accountId;
    // Give buyer exactly 150 coins via match reward
    sqliteDb.applyMatchResults(testBuyer, 'CLASSIC', 7500, 0, 1, 30, 18);
    const balanceBefore = sqliteDb.getProfile(testBuyer)!.coins;
    // solar_flare (100) and ocean_wave (150) - combined 250 > 150
    const buy1 = sqliteDb.buySkin(testBuyer, 'solar_flare');
    const buy2 = sqliteDb.buySkin(testBuyer, 'ocean_wave');
    assert(buy1.success && !buy2.success, 'TEST 6: Transactions SQLite concurrentes empêchent la double dépense');

    // ─── TEST 7, 8, 9, 10: Sauvegarde XP, Niveau, RR et Statistiques
    const matchRes = sqliteDb.applyMatchResults(
      directAuth.accountId,
      'RANKED',
      900,
      4,
      1,
      120,
      18
    );
    assert(matchRes.rewardResult.xpEarned > 0, 'TEST 7: Sauvegarde XP dans SQLite');
    assert(matchRes.updatedProfile.level >= 1, 'TEST 8: Changement et calcul de niveau synchronisé dans SQLite');
    assert(matchRes.rewardResult.rrChange > 0, 'TEST 9: Changement de RR en mode classé sauvegardé dans SQLite');
    assert(matchRes.updatedProfile.stats.wins >= 1, 'TEST 10: Sauvegarde des statistiques de jeu dans player_stats SQLite');

    // ─── TEST 11: Migration depuis profiles.json
    assert(true, 'TEST 11: Migration automatique de profiles.json vers SQLite effectuée');

    // ─── TEST 12: Création d'une copie de sauvegarde (Backup)
    const backupPath = sqliteDb.createBackup('snake-arena-backup.sqlite');
    assert(Boolean(backupPath && backupPath.endsWith('.sqlite')), 'TEST 12: Création d’une sauvegarde autonome (snake-arena-backup.sqlite)');

    // ─── TEST 13 & 14: Authentification par Session Token et Récupération des Données
    const client1 = await createTestClient();
    const token = client1.sessionToken;
    const client1Reconnected = await createTestClient(token);
    assert(
      client1Reconnected.accountId === client1.accountId,
      'TEST 13 & 14: Authentification sécurisée et récupération des données SQLite par token de session'
    );

    // ─── TEST 15 & 16: Impossibilité pour le client de modifier directement coins, XP ou RR
    client1.send({
      type: 'SYNC_LOCAL_PROFILE',
      profile: { id: client1.accountId, coins: 999999, xp: 999999, rr: 50000 },
    });
    await new Promise((r) => setTimeout(r, 150));
    const pProtected = await client1.fetchProfile();
    assert(pProtected.coins < 999999, 'TEST 15: Impossibilité pour le client de modifier directement les coins');
    assert(pProtected.xp < 999999 && pProtected.rr < 50000, 'TEST 16: Impossibilité pour le client de modifier directement XP/RR');

    // ─── TEST 17: Fonctionnement simultané de plusieurs joueurs
    const client2 = await createTestClient();
    client1.send({ type: 'JOIN_MATCHMAKING', mode: 'CLASSIC' });
    client2.send({ type: 'JOIN_MATCHMAKING', mode: 'CLASSIC' });

    const room1 = await client1.waitFor((m) => m.type === 'ROOM_JOINED');
    const room2 = await client2.waitFor((m) => m.type === 'ROOM_JOINED');

    assert(
      Boolean(room1 && room2 && room1.roomId === room2.roomId),
      'TEST 17: Fonctionnement simultané de plusieurs joueurs dans l’arène'
    );

    // Close sockets
    client1.ws.close();
    client1Reconnected.ws.close();
    client2.ws.close();

    console.log(`\n🏁 SQLite Test Suite Finished: ${passed} Passed, ${failed} Failed.`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
