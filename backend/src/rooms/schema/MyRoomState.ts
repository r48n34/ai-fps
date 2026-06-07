import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export const GAME_CONFIG = {
    ammoCapacity: 6,
    bulletDamage: 34,
    fireCooldownMs: 360,
    gravity: 24,
    jumpVelocity: 8.5,
    mapHalfSize: 36,
    maxClients: 24,
    playerRadius: 0.45,
    reloadMs: 1400,
    respawnMs: 2500,
    runSpeed: 8.4,
    walkSpeed: 5.2,
    crouchSpeed: 3.1,
    standingHeight: 1.8,
    crouchingHeight: 1.1,
    tickRate: 30,
};

export type WeaponId = "handgun" | "sniper";

export const WEAPON_CONFIG: Record<
    WeaponId,
    {
        ammoCapacity: number;
        damage: number;
        fireCooldownMs: number;
        reloadMs: number;
    }
> = {
    handgun: {
        ammoCapacity: 6,
        damage: 34,
        fireCooldownMs: 360,
        reloadMs: 1400,
    },
    sniper: {
        ammoCapacity: 2,
        damage: 100,
        fireCooldownMs: 1150,
        reloadMs: 2200,
    },
};

export type SpawnPoint = {
    x: number;
    z: number;
    yaw: number;
};

export type Building = {
    id: string;
    x: number;
    z: number;
    width: number;
    depth: number;
    height: number;
    jumpable?: boolean;
};

export const SPAWN_POINTS: SpawnPoint[] = [
    { x: -28, z: -28, yaw: -0.75 },
    { x: 28, z: 28, yaw: 2.4 },
    { x: -28, z: 24, yaw: -2.35 },
    { x: 24, z: -26, yaw: 0.8 },
    { x: -3, z: -31, yaw: 0 },
    { x: 6, z: 30, yaw: Math.PI },
];

export const MAP_BUILDINGS: Building[] = [
    { id: "warehouse", x: -14, z: -4, width: 9, depth: 14, height: 5.5 },
    { id: "office", x: 12, z: 10, width: 11, depth: 8, height: 6.5 },
    { id: "garage", x: 22, z: -15, width: 8, depth: 10, height: 4.5 },
    { id: "apartments", x: -22, z: 18, width: 10, depth: 8, height: 7 },
    { id: "market", x: 1, z: 0, width: 7, depth: 7, height: 4 },
    { id: "tower", x: 28, z: 8, width: 5, depth: 5, height: 10 },
    { id: "clinic", x: -7, z: 23, width: 8, depth: 7, height: 5 },
    { id: "storage", x: 7, z: -26, width: 9, depth: 5, height: 4 },
    { id: "north-wall", x: -4, z: -17, width: 18, depth: 1.1, height: 2.4 },
    { id: "east-wall", x: 18, z: 0, width: 1.1, depth: 18, height: 2.4 },
    { id: "south-wall", x: -16, z: 9, width: 16, depth: 1.1, height: 2.2 },
    { id: "container-a", x: 29, z: -27, width: 6, depth: 2.4, height: 2.5 },
    { id: "container-b", x: -30, z: 4, width: 2.4, depth: 7, height: 2.5 },
    { id: "crate-a", x: 8, z: -7, width: 2.2, depth: 2.2, height: 1.4 },
    { id: "crate-b", x: -2, z: 15, width: 2.6, depth: 2.6, height: 1.5 },
    { id: "crate-c", x: 31, z: 23, width: 2.4, depth: 2.4, height: 1.5 },
    { id: "barrier-a", x: -27, z: -13, width: 7, depth: 1, height: 1.5 },
    { id: "barrier-b", x: 3, z: 28, width: 1, depth: 8, height: 1.5 },
    { id: "long-wall-a", x: 11, z: 21, width: 18, depth: 1, height: 2.2 },
    { id: "long-wall-b", x: -27, z: 29, width: 1, depth: 12, height: 2.2 },
    { id: "corner-wall-a", x: 30, z: -3, width: 9, depth: 1, height: 2 },
    { id: "corner-wall-b", x: 26, z: -7, width: 1, depth: 8, height: 2 },
    { id: "checkpoint", x: -31, z: -28, width: 6, depth: 5, height: 3.4 },
    { id: "kiosk", x: 16, z: 27, width: 5, depth: 4, height: 3.2 },
    {
        id: "jump-box-a",
        x: -8,
        z: -29,
        width: 3.2,
        depth: 3.2,
        height: 0.9,
        jumpable: true,
    },
    {
        id: "jump-box-b",
        x: 17,
        z: -6,
        width: 3,
        depth: 3,
        height: 1,
        jumpable: true,
    },
    {
        id: "jump-box-c",
        x: -18,
        z: -22,
        width: 3.8,
        depth: 2.8,
        height: 0.85,
        jumpable: true,
    },
    {
        id: "jump-platform",
        x: 24,
        z: 18,
        width: 5,
        depth: 5,
        height: 1.15,
        jumpable: true,
    },
];

export class PlayerState extends Schema {
    @type("string") id = "";
    @type("string") name = "Player";

    @type("number") x = 0;
    @type("number") y = 0;
    @type("number") z = 0;
    @type("number") yaw = 0;
    @type("number") pitch = 0;

    @type("number") health = 100;
    @type("number") ammo = GAME_CONFIG.ammoCapacity;
    @type("number") handgunAmmo = WEAPON_CONFIG.handgun.ammoCapacity;
    @type("number") sniperAmmo = WEAPON_CONFIG.sniper.ammoCapacity;
    @type("number") score = 0;
    @type("number") deaths = 0;
    @type("string") activeWeapon: WeaponId = "handgun";

    @type("boolean") isAlive = true;
    @type("boolean") isCrouching = false;
    @type("boolean") isReloading = false;
    @type("number") reloadEndsAt = 0;
    @type("number") respawnAt = 0;
}

export class ChatMessageState extends Schema {
    @type("string") id = "";
    @type("string") playerId = "";
    @type("string") playerName = "Player";
    @type("string") text = "";
    @type("number") sentAt = 0;
}

export class MyRoomState extends Schema {
    @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
    @type([ChatMessageState]) chat = new ArraySchema<ChatMessageState>();

    @type("number") mapHalfSize = GAME_CONFIG.mapHalfSize;
}
