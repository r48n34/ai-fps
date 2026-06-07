import { Client, Room } from "colyseus";

import {
    ChatMessageState,
    GAME_CONFIG,
    MAP_BUILDINGS,
    MyRoomState,
    PlayerState,
    SPAWN_POINTS,
    WEAPON_CONFIG,
    type WeaponId,
    type Building,
} from "./schema/MyRoomState.js";

type PlayerInput = {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    run: boolean;
    crouch: boolean;
};

type LookMessage = {
    yaw?: number;
    pitch?: number;
};

type WeaponMessage = {
    weapon?: WeaponId;
};

type ChatMessage = {
    text?: string;
};

type JoinOptions = {
    name?: string;
};

const DEFAULT_INPUT: PlayerInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    run: false,
    crouch: false,
};

const MAX_NAME_LENGTH = 18;
const MAX_CHAT_LENGTH = 140;
const MAX_CHAT_MESSAGES = 30;
const MAX_PITCH = Math.PI / 2 - 0.08;
const MIN_PITCH = -MAX_PITCH;
const PATCH_RATE_MS = 1000 / 45;

export class MyRoom extends Room {
    maxClients = GAME_CONFIG.maxClients;

    private readonly inputs = new Map<string, PlayerInput>();
    private readonly lastShotAt = new Map<string, number>();
    private spawnCursor = 0;

    private get gameState() {
        return this.state as MyRoomState;
    }

    onCreate() {
        this.setState(new MyRoomState());
        this.setPatchRate(PATCH_RATE_MS);

        this.setSimulationInterval(
            (deltaTime) => this.update(deltaTime),
            1000 / GAME_CONFIG.tickRate,
        );

        this.onMessage("input", (client, message: Partial<PlayerInput>) => {
            const input = this.inputs.get(client.sessionId);

            if (input) {
                input.forward = message.forward === true;
                input.backward = message.backward === true;
                input.left = message.left === true;
                input.right = message.right === true;
                input.jump = message.jump === true;
                input.run = message.run === true;
                input.crouch = message.crouch === true;
            }
        });

        this.onMessage("look", (client, message: LookMessage) => {
            const player = this.gameState.players.get(client.sessionId);

            if (!player) {
                return;
            }

            if (
                typeof message.yaw === "number" &&
                Number.isFinite(message.yaw)
            ) {
                player.yaw = normalizeAngle(message.yaw);
            }

            if (
                typeof message.pitch === "number" &&
                Number.isFinite(message.pitch)
            ) {
                player.pitch = clamp(message.pitch, MIN_PITCH, MAX_PITCH);
            }
        });

        this.onMessage("shoot", (client, message: LookMessage) => {
            this.tryShoot(client.sessionId, message);
        });

        this.onMessage("reload", (client) => {
            this.tryReload(client.sessionId);
        });

        this.onMessage("weapon", (client, message: WeaponMessage) => {
            this.trySwitchWeapon(client.sessionId, message.weapon);
        });

        this.onMessage("chat", (client, message: ChatMessage) => {
            this.addChatMessage(client.sessionId, message.text);
        });
    }

    onJoin(client: Client, options: JoinOptions) {
        const player = new PlayerState();
        const spawn = this.nextSpawn();

        player.id = client.sessionId;
        player.name = sanitizeName(options.name);
        player.x = spawn.x;
        player.y = 0;
        player.z = spawn.z;
        player.yaw = spawn.yaw;
        player.pitch = 0;
        syncActiveAmmo(player);

        this.gameState.players.set(client.sessionId, player);
        this.inputs.set(client.sessionId, { ...DEFAULT_INPUT });
        this.lastShotAt.set(client.sessionId, 0);
    }

    onLeave(client: Client) {
        this.gameState.players.delete(client.sessionId);
        this.inputs.delete(client.sessionId);
        this.lastShotAt.delete(client.sessionId);
    }

    private update(deltaTime: number) {
        const deltaSeconds = deltaTime / 1000;
        const now = this.clock.currentTime;

        this.gameState.players.forEach((player, sessionId) => {
            if (!player.isAlive) {
                if (player.respawnAt > 0 && now >= player.respawnAt) {
                    this.respawn(player);
                }

                return;
            }

            if (player.isReloading && now >= player.reloadEndsAt) {
                player.isReloading = false;
                player.reloadEndsAt = 0;
                setActiveAmmo(player, getWeaponConfig(player).ammoCapacity);
            }

            this.applyMovement(
                player,
                this.inputs.get(sessionId),
                deltaSeconds,
            );
        });
    }

    private applyMovement(
        player: PlayerState,
        input: PlayerInput | undefined,
        deltaSeconds: number,
    ) {
        if (!input) {
            return;
        }

        player.isCrouching = input.crouch;

        const moveX =
            (input.left ? -Math.cos(player.yaw) : 0) +
            (input.right ? Math.cos(player.yaw) : 0) +
            (input.forward ? -Math.sin(player.yaw) : 0) +
            (input.backward ? Math.sin(player.yaw) : 0);
        const moveZ =
            (input.left ? Math.sin(player.yaw) : 0) +
            (input.right ? -Math.sin(player.yaw) : 0) +
            (input.forward ? -Math.cos(player.yaw) : 0) +
            (input.backward ? Math.cos(player.yaw) : 0);
        const magnitude = Math.hypot(moveX, moveZ);
        const speed = player.isCrouching
            ? GAME_CONFIG.crouchSpeed
            : input.run
              ? GAME_CONFIG.runSpeed
              : GAME_CONFIG.walkSpeed;

        if (magnitude > 0) {
            player.x += (moveX / magnitude) * speed * deltaSeconds;
            player.z += (moveZ / magnitude) * speed * deltaSeconds;
        }

        if (input.jump && player.y <= 0.001 && !player.isCrouching) {
            player.y = GAME_CONFIG.jumpVelocity * deltaSeconds;
            Reflect.set(player, "_verticalVelocity", GAME_CONFIG.jumpVelocity);
        }

        const currentVelocity =
            (Reflect.get(player, "_verticalVelocity") as number | undefined) ??
            0;
        const nextVelocity =
            currentVelocity - GAME_CONFIG.gravity * deltaSeconds;

        if (player.y > 0 || nextVelocity > 0) {
            player.y = Math.max(0, player.y + nextVelocity * deltaSeconds);
            Reflect.set(
                player,
                "_verticalVelocity",
                player.y <= 0 ? 0 : nextVelocity,
            );
        }

        player.x = clamp(
            player.x,
            -GAME_CONFIG.mapHalfSize + GAME_CONFIG.playerRadius,
            GAME_CONFIG.mapHalfSize - GAME_CONFIG.playerRadius,
        );
        player.z = clamp(
            player.z,
            -GAME_CONFIG.mapHalfSize + GAME_CONFIG.playerRadius,
            GAME_CONFIG.mapHalfSize - GAME_CONFIG.playerRadius,
        );

        this.resolveBuildingCollision(player);
    }

    private tryShoot(sessionId: string, message: LookMessage) {
        const shooter = this.gameState.players.get(sessionId);
        const now = this.clock.currentTime;

        if (
            !shooter?.isAlive ||
            shooter.isReloading ||
            shooter.ammo <= 0 ||
            now - (this.lastShotAt.get(sessionId) ?? 0) <
                getWeaponConfig(shooter).fireCooldownMs
        ) {
            return;
        }

        if (typeof message.yaw === "number" && Number.isFinite(message.yaw)) {
            shooter.yaw = normalizeAngle(message.yaw);
        }

        if (
            typeof message.pitch === "number" &&
            Number.isFinite(message.pitch)
        ) {
            shooter.pitch = clamp(message.pitch, MIN_PITCH, MAX_PITCH);
        }

        setActiveAmmo(shooter, shooter.ammo - 1);
        this.lastShotAt.set(sessionId, now);

        const hit = this.findShotHit(shooter);

        if (!hit) {
            return;
        }

        const weapon = getWeaponConfig(shooter);

        hit.health = Math.max(0, hit.health - weapon.damage);

        if (hit.health <= 0) {
            this.killPlayer(hit, shooter);
        }

        this.sendCombatEvents(shooter, hit, weapon.damage);
    }

    private tryReload(sessionId: string) {
        const player = this.gameState.players.get(sessionId);

        if (
            !player?.isAlive ||
            player.isReloading ||
            player.ammo >= getWeaponConfig(player).ammoCapacity
        ) {
            return;
        }

        player.isReloading = true;
        player.reloadEndsAt =
            this.clock.currentTime + getWeaponConfig(player).reloadMs;
    }

    private trySwitchWeapon(sessionId: string, weapon: WeaponId | undefined) {
        const player = this.gameState.players.get(sessionId);

        if (
            !player?.isAlive ||
            (weapon !== "handgun" && weapon !== "sniper") ||
            player.activeWeapon === weapon
        ) {
            return;
        }

        player.activeWeapon = weapon;
        player.isReloading = false;
        player.reloadEndsAt = 0;
        syncActiveAmmo(player);
    }

    private addChatMessage(sessionId: string, text: string | undefined) {
        const player = this.gameState.players.get(sessionId);
        const cleanText = sanitizeChatText(text);

        if (!player || !cleanText) {
            return;
        }

        const message = new ChatMessageState();

        message.id = `${this.clock.currentTime}-${sessionId}`;
        message.playerId = sessionId;
        message.playerName = player.name;
        message.text = cleanText;
        message.sentAt = this.clock.currentTime;

        this.gameState.chat.push(message);

        while (this.gameState.chat.length > MAX_CHAT_MESSAGES) {
            this.gameState.chat.shift();
        }
    }

    private findShotHit(shooter: PlayerState) {
        const origin = {
            x: shooter.x,
            y:
                shooter.y +
                (shooter.isCrouching
                    ? GAME_CONFIG.crouchingHeight
                    : GAME_CONFIG.standingHeight) *
                    0.88,
            z: shooter.z,
        };
        const direction = getLookDirection(shooter.yaw, shooter.pitch);
        let bestHit: { player: PlayerState; distance: number } | undefined;

        this.gameState.players.forEach((target) => {
            if (!target.isAlive || target.id === shooter.id) {
                return;
            }

            const targetHeight = target.isCrouching
                ? GAME_CONFIG.crouchingHeight
                : GAME_CONFIG.standingHeight;
            const targetCenter = {
                x: target.x,
                y: target.y + targetHeight / 2,
                z: target.z,
            };
            const distance = intersectRaySphere(
                origin,
                direction,
                targetCenter,
                GAME_CONFIG.playerRadius + 0.2,
            );

            if (
                distance === undefined ||
                isShotBlocked(origin, direction, distance)
            ) {
                return;
            }

            if (!bestHit || distance < bestHit.distance) {
                bestHit = { player: target, distance };
            }
        });

        return bestHit?.player;
    }

    private killPlayer(victim: PlayerState, killer: PlayerState) {
        victim.isAlive = false;
        victim.isReloading = false;
        victim.reloadEndsAt = 0;
        victim.respawnAt = this.clock.currentTime + GAME_CONFIG.respawnMs;
        victim.deaths += 1;
        victim.health = 0;
        killer.score += 1;
    }

    private sendCombatEvents(
        shooter: PlayerState,
        victim: PlayerState,
        damage: number,
    ) {
        const shooterClient = this.clients.find(
            (client) => client.sessionId === shooter.id,
        );
        const victimClient = this.clients.find(
            (client) => client.sessionId === victim.id,
        );
        const payload = {
            damage,
            weapon: shooter.activeWeapon,
            targetId: victim.id,
            targetName: victim.name,
            killed: !victim.isAlive,
        };

        shooterClient?.send("hit", payload);
        victimClient?.send("damage", {
            ...payload,
            attackerId: shooter.id,
            attackerName: shooter.name,
        });
    }

    private respawn(player: PlayerState) {
        const spawn = this.nextSpawn();

        player.x = spawn.x;
        player.y = 0;
        player.z = spawn.z;
        player.yaw = spawn.yaw;
        player.pitch = 0;
        player.health = 100;
        player.activeWeapon = "handgun";
        player.handgunAmmo = WEAPON_CONFIG.handgun.ammoCapacity;
        player.sniperAmmo = WEAPON_CONFIG.sniper.ammoCapacity;
        syncActiveAmmo(player);
        player.isAlive = true;
        player.isCrouching = false;
        player.isReloading = false;
        player.reloadEndsAt = 0;
        player.respawnAt = 0;
        Reflect.set(player, "_verticalVelocity", 0);
    }

    private nextSpawn() {
        const spawn = SPAWN_POINTS[this.spawnCursor % SPAWN_POINTS.length];

        this.spawnCursor += 1;

        return spawn;
    }

    private resolveBuildingCollision(player: PlayerState) {
        for (const building of MAP_BUILDINGS) {
            const minX =
                building.x - building.width / 2 - GAME_CONFIG.playerRadius;
            const maxX =
                building.x + building.width / 2 + GAME_CONFIG.playerRadius;
            const minZ =
                building.z - building.depth / 2 - GAME_CONFIG.playerRadius;
            const maxZ =
                building.z + building.depth / 2 + GAME_CONFIG.playerRadius;

            if (
                player.x < minX ||
                player.x > maxX ||
                player.z < minZ ||
                player.z > maxZ
            ) {
                continue;
            }

            if (building.jumpable && player.y >= building.height - 0.5) {
                player.y = building.height;
                Reflect.set(player, "_verticalVelocity", 0);
                continue;
            }

            const pushLeft = Math.abs(player.x - minX);
            const pushRight = Math.abs(maxX - player.x);
            const pushBack = Math.abs(player.z - minZ);
            const pushForward = Math.abs(maxZ - player.z);
            const smallestPush = Math.min(
                pushLeft,
                pushRight,
                pushBack,
                pushForward,
            );

            if (smallestPush === pushLeft) {
                player.x = minX;
            } else if (smallestPush === pushRight) {
                player.x = maxX;
            } else if (smallestPush === pushBack) {
                player.z = minZ;
            } else {
                player.z = maxZ;
            }
        }
    }
}

function sanitizeName(name: string | undefined) {
    const trimmed = name?.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);

    return trimmed || "Player";
}

function sanitizeChatText(text: string | undefined) {
    return text?.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LENGTH) ?? "";
}

function getWeaponConfig(player: PlayerState) {
    return WEAPON_CONFIG[player.activeWeapon];
}

function setActiveAmmo(player: PlayerState, ammo: number) {
    const nextAmmo = Math.max(
        0,
        Math.min(ammo, getWeaponConfig(player).ammoCapacity),
    );

    player.ammo = nextAmmo;

    if (player.activeWeapon === "sniper") {
        player.sniperAmmo = nextAmmo;
    } else {
        player.handgunAmmo = nextAmmo;
    }
}

function syncActiveAmmo(player: PlayerState) {
    player.ammo =
        player.activeWeapon === "sniper"
            ? player.sniperAmmo
            : player.handgunAmmo;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function normalizeAngle(value: number) {
    const twoPi = Math.PI * 2;

    return ((((value + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

function getLookDirection(yaw: number, pitch: number) {
    const cosPitch = Math.cos(pitch);

    return {
        x: -Math.sin(yaw) * cosPitch,
        y: Math.sin(pitch),
        z: -Math.cos(yaw) * cosPitch,
    };
}

function intersectRaySphere(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    center: { x: number; y: number; z: number },
    radius: number,
) {
    const toCenter = {
        x: center.x - origin.x,
        y: center.y - origin.y,
        z: center.z - origin.z,
    };
    const projection =
        toCenter.x * direction.x +
        toCenter.y * direction.y +
        toCenter.z * direction.z;

    if (projection < 0) {
        return undefined;
    }

    const distanceSquared =
        toCenter.x ** 2 + toCenter.y ** 2 + toCenter.z ** 2 - projection ** 2;

    if (distanceSquared > radius ** 2) {
        return undefined;
    }

    return projection - Math.sqrt(radius ** 2 - distanceSquared);
}

function isShotBlocked(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number,
) {
    return MAP_BUILDINGS.some((building) =>
        rayIntersectsBuilding(origin, direction, maxDistance, building),
    );
}

function rayIntersectsBuilding(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number,
    building: Building,
) {
    const min = {
        x: building.x - building.width / 2,
        y: 0,
        z: building.z - building.depth / 2,
    };
    const max = {
        x: building.x + building.width / 2,
        y: building.height,
        z: building.z + building.depth / 2,
    };
    let near = 0;
    let far = maxDistance;

    for (const axis of ["x", "y", "z"] as const) {
        const originAxis = origin[axis];
        const directionAxis = direction[axis];

        if (Math.abs(directionAxis) < 0.0001) {
            if (originAxis < min[axis] || originAxis > max[axis]) {
                return false;
            }

            continue;
        }

        const first = (min[axis] - originAxis) / directionAxis;
        const second = (max[axis] - originAxis) / directionAxis;
        const axisNear = Math.min(first, second);
        const axisFar = Math.max(first, second);

        near = Math.max(near, axisNear);
        far = Math.min(far, axisFar);

        if (near > far) {
            return false;
        }
    }

    return near >= 0 && near <= maxDistance;
}
