import assert from "assert";

import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import { GAME_CONFIG, MyRoomState } from "../src/rooms/schema/MyRoomState.js";

describe("pvp fps room", () => {
    let colyseus: ColyseusTestServer<typeof appConfig>;

    before(async () => (colyseus = await boot(appConfig)));
    after(async () => colyseus.shutdown());

    beforeEach(async () => await colyseus.cleanup());

    it("joins the shared room with a named synchronized player", async () => {
        const room = await colyseus.createRoom<MyRoomState>("my_room", {});
        const client = await colyseus.connectTo(room, { name: "Ada" });

        await room.waitForNextPatch();

        const player = room.state.players.get(client.sessionId);

        assert.strictEqual(client.sessionId, room.clients[0].sessionId);
        assert.strictEqual(player?.name, "Ada");
        assert.strictEqual(player?.health, 100);
        assert.strictEqual(player?.ammo, GAME_CONFIG.ammoCapacity);
        assert.strictEqual(player?.handgunAmmo, GAME_CONFIG.ammoCapacity);
        assert.strictEqual(player?.sniperAmmo, 2);
        assert.strictEqual(player?.activeWeapon, "handgun");
        assert.strictEqual(player?.isAlive, true);
    });

    it("spends handgun ammo and reloads back to full", async () => {
        const room = await colyseus.createRoom<MyRoomState>("my_room", {});
        const client = await colyseus.connectTo(room, { name: "Reloader" });

        await room.waitForNextPatch();
        client.send("shoot", { yaw: 0, pitch: 0 });
        await room.waitForNextPatch();

        let player = room.state.players.get(client.sessionId);

        assert.strictEqual(player?.ammo, GAME_CONFIG.ammoCapacity - 1);

        client.send("reload");
        await waitFor(() => {
            player = room.state.players.get(client.sessionId);
            return (
                player?.ammo === GAME_CONFIG.ammoCapacity && !player.isReloading
            );
        });

        assert.strictEqual(player?.ammo, GAME_CONFIG.ammoCapacity);
        assert.strictEqual(player?.isReloading, false);
    });

    it("switches to sniper with its own two-round ammo pool", async () => {
        const room = await colyseus.createRoom<MyRoomState>("my_room", {});
        const client = await colyseus.connectTo(room, { name: "Sniper" });

        await room.waitForNextPatch();
        client.send("weapon", { weapon: "sniper" });
        await room.waitForNextPatch();

        let player = room.state.players.get(client.sessionId);

        assert.strictEqual(player?.activeWeapon, "sniper");
        assert.strictEqual(player?.ammo, 2);

        client.send("shoot", { yaw: 0, pitch: 0 });
        await wait(GAME_CONFIG.fireCooldownMs + 850);

        player = room.state.players.get(client.sessionId);

        assert.strictEqual(player?.sniperAmmo, 1);
        assert.strictEqual(player?.ammo, 1);

        client.send("reload");
        await waitFor(() => {
            player = room.state.players.get(client.sessionId);
            return player?.sniperAmmo === 2 && !player.isReloading;
        });

        client.send("weapon", { weapon: "handgun" });
        await room.waitForNextPatch();

        assert.strictEqual(player?.activeWeapon, "handgun");
        assert.strictEqual(player?.ammo, GAME_CONFIG.ammoCapacity);
        assert.strictEqual(player?.sniperAmmo, 2);
    });

    it("syncs sanitized chat messages to all players", async () => {
        const room = await colyseus.createRoom<MyRoomState>("my_room", {});
        const client = await colyseus.connectTo(room, { name: "Speaker" });

        await room.waitForNextPatch();
        client.send("chat", { text: "   hello     arena   " });
        await waitFor(() => room.state.chat.length === 1);

        const message = room.state.chat.at(0);

        assert.strictEqual(message?.playerId, client.sessionId);
        assert.strictEqual(message?.playerName, "Speaker");
        assert.strictEqual(message?.text, "hello arena");

        for (let index = 0; index < 35; index += 1) {
            client.send("chat", { text: `message ${index}` });
        }

        await waitFor(() => room.state.chat.length === 30);

        assert.strictEqual(room.state.chat.length, 30);
        assert.strictEqual(room.state.chat.at(-1)?.text, "message 34");
    });

    it("damages, kills, scores, and respawns players", async () => {
        const room = await colyseus.createRoom<MyRoomState>("my_room", {});
        const attacker = await colyseus.connectTo(room, { name: "Attacker" });
        const victim = await colyseus.connectTo(room, { name: "Victim" });

        await room.waitForNextPatch();

        const attackerState = room.state.players.get(attacker.sessionId);
        const victimState = room.state.players.get(victim.sessionId);

        assert(attackerState);
        assert(victimState);

        attackerState.x = 0;
        attackerState.y = 0;
        attackerState.z = 31;
        attackerState.yaw = 0;
        attackerState.pitch = -0.14;
        victimState.x = 0;
        victimState.y = 0;
        victimState.z = 26;

        const hitEvents: Array<{ killed: boolean; targetName: string }> = [];
        const damageEvents: Array<{ attackerName: string; damage: number }> =
            [];

        attacker.onMessage("hit", (message) => {
            hitEvents.push(message);
        });
        victim.onMessage("damage", (message) => {
            damageEvents.push(message);
        });

        for (let shot = 0; shot < 3; shot += 1) {
            attacker.send("shoot", { yaw: 0, pitch: -0.14 });
            await wait(GAME_CONFIG.fireCooldownMs + 50);
        }

        assert.strictEqual(hitEvents.length, 3);
        assert.strictEqual(hitEvents.at(-1)?.killed, true);
        assert.strictEqual(hitEvents.at(-1)?.targetName, "Victim");
        assert.strictEqual(damageEvents.length, 3);
        assert.strictEqual(damageEvents[0]?.attackerName, "Attacker");
        assert.strictEqual(damageEvents[0]?.damage, GAME_CONFIG.bulletDamage);
        assert.strictEqual(victimState.isAlive, false);
        assert.strictEqual(victimState.health, 0);
        assert.strictEqual(victimState.deaths, 1);
        assert.strictEqual(attackerState.score, 1);

        await waitFor(() => victimState.isAlive);

        assert.strictEqual(victimState.health, 100);
        assert.strictEqual(victimState.ammo, GAME_CONFIG.ammoCapacity);
        assert.strictEqual(victimState.handgunAmmo, GAME_CONFIG.ammoCapacity);
        assert.strictEqual(victimState.sniperAmmo, 2);
        assert.strictEqual(victimState.activeWeapon, "handgun");
        assert.strictEqual(victimState.respawnAt, 0);
    });
});

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000) {
    const startedAt = Date.now();

    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error("Timed out waiting for condition");
        }

        await wait(25);
    }
}
