import { Client, type Room } from "@colyseus/sdk";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { getColyseusServerUrl } from "../utils/colyseusServerUrl";
import type { Route } from "./+types/home";

type PlayerSnapshot = {
    id: string;
    name: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    health: number;
    ammo: number;
    handgunAmmo: number;
    sniperAmmo: number;
    score: number;
    deaths: number;
    activeWeapon: WeaponId;
    isAlive: boolean;
    isCrouching: boolean;
    isReloading: boolean;
    respawnAt: number;
};

type ChatSnapshot = {
    id: string;
    playerId: string;
    playerName: string;
    text: string;
    sentAt: number;
};

type PlainGameState = {
    players?: Record<string, PlayerSnapshot>;
    chat?: ChatSnapshot[];
};

type SchemaState = {
    toJSON: () => PlainGameState;
};

type GameRoom = Room<unknown, SchemaState>;

type InputState = {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    run: boolean;
    crouch: boolean;
};

type LocalVisualState = {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    verticalVelocity: number;
    isCrouching: boolean;
    playerId: string;
};

type LookState = {
    yaw: number;
    pitch: number;
};

type HitEvent = {
    damage: number;
    targetId: string;
    targetName: string;
    killed: boolean;
};

type DamageEvent = {
    damage: number;
    attackerId: string;
    attackerName: string;
};

type WeaponId = "handgun" | "sniper";

type Building = {
    id: string;
    x: number;
    z: number;
    width: number;
    depth: number;
    height: number;
    color: string;
    jumpable?: boolean;
};

const SERVER_URL = getColyseusServerUrl(import.meta.env.VITE_COLYSEUS_URL);

const GAME_CONFIG = {
    ammoCapacity: 6,
    sniperAmmoCapacity: 2,
    gravity: 24,
    jumpVelocity: 8.5,
    mapHalfSize: 36,
    playerRadius: 0.45,
    runSpeed: 8.4,
    walkSpeed: 5.2,
    crouchSpeed: 3.1,
    standingHeight: 1.8,
    crouchingHeight: 1.1,
};

const WEAPON_ZOOM_FOV: Record<WeaponId, number> = {
    handgun: 50,
    sniper: 22,
};

const DEFAULT_FOV = 74;

const MAP_BUILDINGS: Building[] = [
    {
        id: "warehouse",
        x: -14,
        z: -4,
        width: 9,
        depth: 14,
        height: 5.5,
        color: "#8b5e34",
    },
    {
        id: "office",
        x: 12,
        z: 10,
        width: 11,
        depth: 8,
        height: 6.5,
        color: "#60738a",
    },
    {
        id: "garage",
        x: 22,
        z: -15,
        width: 8,
        depth: 10,
        height: 4.5,
        color: "#7d7f78",
    },
    {
        id: "apartments",
        x: -22,
        z: 18,
        width: 10,
        depth: 8,
        height: 7,
        color: "#9b6b62",
    },
    {
        id: "market",
        x: 1,
        z: 0,
        width: 7,
        depth: 7,
        height: 4,
        color: "#677b4d",
    },
    {
        id: "tower",
        x: 28,
        z: 8,
        width: 5,
        depth: 5,
        height: 10,
        color: "#536473",
    },
    {
        id: "clinic",
        x: -7,
        z: 23,
        width: 8,
        depth: 7,
        height: 5,
        color: "#8c8172",
    },
    {
        id: "storage",
        x: 7,
        z: -26,
        width: 9,
        depth: 5,
        height: 4,
        color: "#6d6a57",
    },
    {
        id: "north-wall",
        x: -4,
        z: -17,
        width: 18,
        depth: 1.1,
        height: 2.4,
        color: "#4f5960",
    },
    {
        id: "east-wall",
        x: 18,
        z: 0,
        width: 1.1,
        depth: 18,
        height: 2.4,
        color: "#4f5960",
    },
    {
        id: "south-wall",
        x: -16,
        z: 9,
        width: 16,
        depth: 1.1,
        height: 2.2,
        color: "#4f5960",
    },
    {
        id: "container-a",
        x: 29,
        z: -27,
        width: 6,
        depth: 2.4,
        height: 2.5,
        color: "#2f6f8f",
    },
    {
        id: "container-b",
        x: -30,
        z: 4,
        width: 2.4,
        depth: 7,
        height: 2.5,
        color: "#8e3d32",
    },
    {
        id: "crate-a",
        x: 8,
        z: -7,
        width: 2.2,
        depth: 2.2,
        height: 1.4,
        color: "#7a5536",
    },
    {
        id: "crate-b",
        x: -2,
        z: 15,
        width: 2.6,
        depth: 2.6,
        height: 1.5,
        color: "#7a5536",
    },
    {
        id: "crate-c",
        x: 31,
        z: 23,
        width: 2.4,
        depth: 2.4,
        height: 1.5,
        color: "#7a5536",
    },
    {
        id: "barrier-a",
        x: -27,
        z: -13,
        width: 7,
        depth: 1,
        height: 1.5,
        color: "#5f665d",
    },
    {
        id: "barrier-b",
        x: 3,
        z: 28,
        width: 1,
        depth: 8,
        height: 1.5,
        color: "#5f665d",
    },
    {
        id: "long-wall-a",
        x: 11,
        z: 21,
        width: 18,
        depth: 1,
        height: 2.2,
        color: "#4c565b",
    },
    {
        id: "long-wall-b",
        x: -27,
        z: 29,
        width: 1,
        depth: 12,
        height: 2.2,
        color: "#4c565b",
    },
    {
        id: "corner-wall-a",
        x: 30,
        z: -3,
        width: 9,
        depth: 1,
        height: 2,
        color: "#4c565b",
    },
    {
        id: "corner-wall-b",
        x: 26,
        z: -7,
        width: 1,
        depth: 8,
        height: 2,
        color: "#4c565b",
    },
    {
        id: "checkpoint",
        x: -31,
        z: -28,
        width: 6,
        depth: 5,
        height: 3.4,
        color: "#725f4d",
    },
    {
        id: "kiosk",
        x: 16,
        z: 27,
        width: 5,
        depth: 4,
        height: 3.2,
        color: "#697271",
    },
    {
        id: "jump-box-a",
        x: -8,
        z: -29,
        width: 3.2,
        depth: 3.2,
        height: 0.9,
        color: "#8b6d42",
        jumpable: true,
    },
    {
        id: "jump-box-b",
        x: 17,
        z: -6,
        width: 3,
        depth: 3,
        height: 1,
        color: "#8b6d42",
        jumpable: true,
    },
    {
        id: "jump-box-c",
        x: -18,
        z: -22,
        width: 3.8,
        depth: 2.8,
        height: 0.85,
        color: "#8b6d42",
        jumpable: true,
    },
    {
        id: "jump-platform",
        x: 24,
        z: 18,
        width: 5,
        depth: 5,
        height: 1.15,
        color: "#75694e",
        jumpable: true,
    },
];

const EMPTY_INPUT: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    run: false,
    crouch: false,
};

export function meta(_args: Route.MetaArgs) {
    return [
        { title: "GameU PVP FPS" },
        {
            name: "description",
            content:
                "A simple browser PVP FPS powered by Colyseus and Three.js",
        },
    ];
}

export default function Home() {
    const [name, setName] = useState("");
    const [status, setStatus] = useState("Enter your name to join the arena.");
    const [room, setRoom] = useState<GameRoom | null>(null);
    const [players, setPlayers] = useState<Record<string, PlayerSnapshot>>({});
    const [chatMessages, setChatMessages] = useState<ChatSnapshot[]>([]);
    const [chatDraft, setChatDraft] = useState("");
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [localSessionId, setLocalSessionId] = useState("");
    const [pointerLocked, setPointerLocked] = useState(false);
    const [hitMarker, setHitMarker] = useState<HitEvent | null>(null);
    const [damageFlash, setDamageFlash] = useState<DamageEvent | null>(null);
    const [isZooming, setIsZooming] = useState(false);
    const [ammoNotice, setAmmoNotice] = useState("");
    const inputRef = useRef<InputState>({ ...EMPTY_INPUT });
    const chatInputRef = useRef<HTMLInputElement>(null);
    const localVisualRef = useRef<LocalVisualState | null>(null);
    const localPlayerRef = useRef<PlayerSnapshot | undefined>(undefined);
    const roomRef = useRef<GameRoom | null>(null);
    const lookRef = useRef<LookState>({ yaw: 0, pitch: 0 });
    const recoilUntilRef = useRef(0);
    const ammoNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const lastInputJsonRef = useRef("");
    const hitMarkerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const damageFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );

    const localPlayer = localSessionId ? players[localSessionId] : undefined;
    const sortedPlayers = useMemo(
        () =>
            Object.values(players).sort((first, second) => {
                if (second.score !== first.score) {
                    return second.score - first.score;
                }

                return first.name.localeCompare(second.name);
            }),
        [players],
    );

    useEffect(() => {
        roomRef.current = room;

        return () => {
            roomRef.current = null;
        };
    }, [room]);

    useEffect(
        () => () => {
            if (hitMarkerTimerRef.current) {
                clearTimeout(hitMarkerTimerRef.current);
            }

            if (damageFlashTimerRef.current) {
                clearTimeout(damageFlashTimerRef.current);
            }

            if (ammoNoticeTimerRef.current) {
                clearTimeout(ammoNoticeTimerRef.current);
            }
        },
        [],
    );

    useEffect(() => {
        localPlayerRef.current = localPlayer;
    }, [localPlayer]);

    useEffect(() => {
        if (isChatOpen) {
            chatInputRef.current?.focus();
        }
    }, [isChatOpen]);

    useEffect(() => {
        const onPointerLockChange = () => {
            setPointerLocked(document.pointerLockElement !== null);
        };

        document.addEventListener("pointerlockchange", onPointerLockChange);

        return () => {
            document.removeEventListener(
                "pointerlockchange",
                onPointerLockChange,
            );
        };
    }, []);

    useEffect(() => {
        const onMouseMove = (event: MouseEvent) => {
            if (document.pointerLockElement === null || !localPlayer?.isAlive) {
                return;
            }

            const current = lookRef.current;
            const next = {
                yaw: normalizeAngle(current.yaw - event.movementX * 0.0024),
                pitch: clamp(
                    current.pitch - event.movementY * 0.002,
                    -Math.PI / 2 + 0.08,
                    Math.PI / 2 - 0.08,
                ),
            };

            lookRef.current = next;
            sendLook(roomRef.current, next);
        };

        document.addEventListener("mousemove", onMouseMove);

        return () => {
            document.removeEventListener("mousemove", onMouseMove);
        };
    }, [localPlayer?.isAlive]);

    const sendInput = useCallback(() => {
        const nextJson = JSON.stringify(inputRef.current);

        if (nextJson === lastInputJsonRef.current) {
            return;
        }

        lastInputJsonRef.current = nextJson;
        roomRef.current?.send("input", inputRef.current);
    }, []);

    const clearMovementInput = useCallback(() => {
        inputRef.current = { ...EMPTY_INPUT };
        lastInputJsonRef.current = "";
        sendInput();
    }, [sendInput]);

    const openChat = useCallback(() => {
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        clearMovementInput();
        setIsChatOpen(true);
    }, [clearMovementInput]);

    const closeChat = useCallback(() => {
        setIsChatOpen(false);
        setChatDraft("");
    }, []);

    const sendChat = useCallback(() => {
        const text = chatDraft.trim();

        if (text) {
            roomRef.current?.send("chat", { text });
        }

        closeChat();
    }, [chatDraft, closeChat]);

    const showAmmoNotice = useCallback((message: string) => {
        if (ammoNoticeTimerRef.current) {
            clearTimeout(ammoNoticeTimerRef.current);
        }

        setAmmoNotice(message);
        ammoNoticeTimerRef.current = setTimeout(() => setAmmoNotice(""), 1200);
    }, []);

    const applyAimRecoil = useCallback((weapon: WeaponId) => {
        const pitchKick = weapon === "sniper" ? 0.085 : 0.04;
        const yawKick = weapon === "sniper" ? 0.012 : 0.006;
        const current = lookRef.current;
        const next = {
            yaw: normalizeAngle(current.yaw + (Math.random() - 0.5) * yawKick),
            pitch: clamp(
                current.pitch + pitchKick,
                -Math.PI / 2 + 0.08,
                Math.PI / 2 - 0.08,
            ),
        };

        lookRef.current = next;
        sendLook(roomRef.current, next);
    }, []);

    useEffect(() => {
        const onKeyChange = (event: KeyboardEvent, isDown: boolean) => {
            if (!roomRef.current) {
                return;
            }

            if (isChatOpen) {
                if (isDown && event.key === "Escape") {
                    event.preventDefault();
                    closeChat();
                }

                return;
            }

            if (isDown && event.key === "Enter") {
                event.preventDefault();
                openChat();
                return;
            }

            const key = event.key.toLowerCase();
            const input = inputRef.current;
            let handled = true;

            if (key === "w") {
                input.forward = isDown;
            } else if (key === "s") {
                input.backward = isDown;
            } else if (key === "a") {
                input.left = isDown;
            } else if (key === "d") {
                input.right = isDown;
            } else if (event.code === "Space") {
                input.jump = isDown;
            } else if (key === "shift") {
                input.run = isDown;
            } else if (key === "c" || key === "control") {
                input.crouch = isDown;
            } else {
                handled = false;
            }

            if (handled) {
                event.preventDefault();
                sendInput();
            }

            if (isDown && key === "r") {
                roomRef.current.send("reload");
            } else if (isDown && key === "1") {
                roomRef.current.send("weapon", { weapon: "handgun" });
            } else if (isDown && key === "2") {
                roomRef.current.send("weapon", { weapon: "sniper" });
            }
        };
        const keyDown = (event: KeyboardEvent) => onKeyChange(event, true);
        const keyUp = (event: KeyboardEvent) => onKeyChange(event, false);

        window.addEventListener("keydown", keyDown);
        window.addEventListener("keyup", keyUp);

        return () => {
            window.removeEventListener("keydown", keyDown);
            window.removeEventListener("keyup", keyUp);
        };
    }, [closeChat, isChatOpen, openChat, sendInput]);

    useEffect(() => {
        const onContextMenu = (event: MouseEvent) => {
            if (roomRef.current) {
                event.preventDefault();
            }
        };
        const onMouseDown = (event: MouseEvent) => {
            if (
                isChatOpen ||
                !roomRef.current ||
                document.pointerLockElement === null
            ) {
                return;
            }

            if (event.button === 0) {
                const player = localPlayerRef.current;

                if (!player?.isAlive) {
                    return;
                }

                if (player.isReloading) {
                    showAmmoNotice("Reloading...");
                    return;
                }

                if (player.ammo <= 0) {
                    showAmmoNotice("Out of ammo - press R to reload");
                    return;
                }

                roomRef.current.send("shoot", lookRef.current);
                recoilUntilRef.current =
                    performance.now() +
                    (player.activeWeapon === "sniper" ? 260 : 190);
                applyAimRecoil(player.activeWeapon);
            } else if (event.button === 2) {
                event.preventDefault();
                setIsZooming(true);
            }
        };
        const onMouseUp = (event: MouseEvent) => {
            if (event.button === 2) {
                setIsZooming(false);
            }
        };

        window.addEventListener("contextmenu", onContextMenu);
        window.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mouseup", onMouseUp);

        return () => {
            window.removeEventListener("contextmenu", onContextMenu);
            window.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [applyAimRecoil, isChatOpen, showAmmoNotice]);

    useEffect(() => {
        if (!localPlayer) {
            return;
        }

        if (pointerLocked && localPlayer.isAlive) {
            return;
        }

        lookRef.current = {
            yaw: localPlayer.yaw,
            pitch: localPlayer.pitch,
        };
    }, [
        localPlayer?.isAlive,
        localPlayer?.pitch,
        localPlayer?.yaw,
        pointerLocked,
    ]);

    const joinGame = useCallback(async () => {
        const displayName = name.trim() || "Player";

        setStatus("Connecting to arena...");

        try {
            const client = new Client(SERVER_URL);
            const joinedRoom = await client.joinOrCreate<SchemaState>(
                "my_room",
                {
                    name: displayName,
                },
            );

            joinedRoom.onStateChange((state) => {
                const snapshot = state.toJSON();

                setPlayers(snapshot.players ?? {});
                setChatMessages(snapshot.chat ?? []);
            });
            joinedRoom.onMessage("hit", (message: HitEvent) => {
                if (hitMarkerTimerRef.current) {
                    clearTimeout(hitMarkerTimerRef.current);
                }

                setHitMarker(message);
                hitMarkerTimerRef.current = setTimeout(
                    () => setHitMarker(null),
                    180,
                );
            });
            joinedRoom.onMessage("damage", (message: DamageEvent) => {
                if (damageFlashTimerRef.current) {
                    clearTimeout(damageFlashTimerRef.current);
                }

                setDamageFlash(message);
                damageFlashTimerRef.current = setTimeout(
                    () => setDamageFlash(null),
                    320,
                );
            });
            joinedRoom.onLeave((code) => {
                setStatus(`Disconnected from arena (${code}).`);
                setRoom(null);
                setPlayers({});
                setChatMessages([]);
                setIsChatOpen(false);
                setChatDraft("");
                setHitMarker(null);
                setDamageFlash(null);
                setAmmoNotice("");
                localVisualRef.current = null;
            });

            setRoom(joinedRoom);
            setLocalSessionId(joinedRoom.sessionId);
            setStatus("Connected. Click the game to lock your aim.");
        } catch (error) {
            setStatus(
                error instanceof Error
                    ? `Unable to join: ${error.message}`
                    : "Unable to join the arena.",
            );
        }
    }, [name]);

    const lockPointer = useCallback((element: HTMLElement | null) => {
        if (!element || !roomRef.current || document.pointerLockElement) {
            return;
        }

        void element.requestPointerLock();
    }, []);

    return (
        <main className="game-shell">
            {!room ? (
                <section className="join-panel" aria-label="Join game">
                    <div>
                        <p className="eyebrow">GameU Arena</p>
                        <h1>PVP FPS</h1>
                        <p className="join-copy">
                            Enter a name and jump into the shared handgun arena.
                        </p>
                    </div>
                    <form
                        className="join-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void joinGame();
                        }}
                    >
                        <label htmlFor="player-name">Player name</label>
                        <input
                            id="player-name"
                            maxLength={18}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Player"
                            value={name}
                        />
                        <button type="submit">Join Arena</button>
                    </form>
                    <p className="status-line">{status}</p>
                </section>
            ) : (
                <section
                    className={`game-stage ${
                        localPlayer?.isAlive === false ? "is-dead" : ""
                    }`}
                    onClick={(event) => lockPointer(event.currentTarget)}
                >
                    <Canvas
                        camera={{
                            fov: 74,
                            near: 0.1,
                            far: 180,
                            position: [0, 1.7, 8],
                        }}
                        shadows
                    >
                        <GameScene
                            inputRef={inputRef}
                            isZooming={isZooming}
                            localPlayer={localPlayer}
                            localSessionId={localSessionId}
                            localVisualRef={localVisualRef}
                            lookRef={lookRef}
                            players={players}
                            recoilUntilRef={recoilUntilRef}
                        />
                    </Canvas>
                    <GameHud
                        chatDraft={chatDraft}
                        chatInputRef={chatInputRef}
                        chatMessages={chatMessages}
                        damageFlash={damageFlash}
                        hitMarker={hitMarker}
                        ammoNotice={ammoNotice}
                        isChatOpen={isChatOpen}
                        isZooming={isZooming}
                        localPlayer={localPlayer}
                        pointerLocked={pointerLocked}
                        players={sortedPlayers}
                        onChatDraftChange={setChatDraft}
                        onChatSubmit={sendChat}
                        onCloseChat={closeChat}
                        status={status}
                    />
                </section>
            )}
        </main>
    );
}

function GameScene({
    inputRef,
    isZooming,
    localPlayer,
    localSessionId,
    localVisualRef,
    lookRef,
    players,
    recoilUntilRef,
}: {
    inputRef: RefObject<InputState>;
    isZooming: boolean;
    localPlayer: PlayerSnapshot | undefined;
    localSessionId: string;
    localVisualRef: RefObject<LocalVisualState | null>;
    lookRef: RefObject<LookState>;
    players: Record<string, PlayerSnapshot>;
    recoilUntilRef: RefObject<number>;
}) {
    const { camera } = useThree();

    useFrame((_, delta) => {
        if (!localPlayer) {
            return;
        }

        const targetFov =
            isZooming && localPlayer.isAlive
                ? WEAPON_ZOOM_FOV[localPlayer.activeWeapon]
                : DEFAULT_FOV;

        const visual = updateLocalPrediction(
            localVisualRef,
            localPlayer,
            inputRef.current,
            lookRef.current,
            delta,
        );
        const height = visual.isCrouching
            ? GAME_CONFIG.crouchingHeight
            : GAME_CONFIG.standingHeight;

        camera.position.set(visual.x, visual.y + height * 0.88, visual.z);
        camera.rotation.set(
            lookRef.current.pitch,
            lookRef.current.yaw,
            0,
            "YXZ",
        );

        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = THREE.MathUtils.lerp(
                camera.fov,
                targetFov,
                1 - Math.exp(-16 * delta),
            );
            camera.updateProjectionMatrix();
        }
    });

    return (
        <>
            <color attach="background" args={["#b8d6e8"]} />
            <fog attach="fog" args={["#b8d6e8", 45, 118]} />
            <ambientLight intensity={0.45} />
            <directionalLight
                castShadow
                intensity={1.6}
                position={[16, 28, 10]}
                shadow-mapSize={[2048, 2048]}
            />
            <Arena />
            {Object.values(players)
                .filter((player) => player.id !== localSessionId)
                .map((player) => (
                    <RemotePlayer key={player.id} player={player} />
                ))}
            <WeaponModel
                activeWeapon={localPlayer?.activeWeapon ?? "handgun"}
                isZooming={isZooming}
                recoilUntilRef={recoilUntilRef}
                visible={localPlayer?.isAlive === true}
            />
        </>
    );
}

function Arena() {
    const groundSize = GAME_CONFIG.mapHalfSize * 2;

    return (
        <group>
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[groundSize, groundSize]} />
                <meshStandardMaterial color="#8ba36e" roughness={0.95} />
            </mesh>
            <gridHelper args={[groundSize, 24, "#45613d", "#6f875d"]} />
            <MapBoundary />
            {MAP_BUILDINGS.map((building) => (
                <BuildingMesh building={building} key={building.id} />
            ))}
            <mesh castShadow position={[0, 0.18, -20]}>
                <boxGeometry args={[14, 0.36, 1.1]} />
                <meshStandardMaterial color="#596063" />
            </mesh>
            <mesh castShadow position={[-9, 0.45, 26]}>
                <boxGeometry args={[1.2, 0.9, 8]} />
                <meshStandardMaterial color="#56694f" />
            </mesh>
            <mesh castShadow position={[15, 0.45, -28]}>
                <boxGeometry args={[8, 0.9, 1.2]} />
                <meshStandardMaterial color="#56694f" />
            </mesh>
        </group>
    );
}

function MapBoundary() {
    const size = GAME_CONFIG.mapHalfSize * 2;
    const half = GAME_CONFIG.mapHalfSize;

    return (
        <group>
            <mesh position={[0, 1, -half]}>
                <boxGeometry args={[size, 2, 0.35]} />
                <meshStandardMaterial color="#38444a" />
            </mesh>
            <mesh position={[0, 1, half]}>
                <boxGeometry args={[size, 2, 0.35]} />
                <meshStandardMaterial color="#38444a" />
            </mesh>
            <mesh position={[-half, 1, 0]}>
                <boxGeometry args={[0.35, 2, size]} />
                <meshStandardMaterial color="#38444a" />
            </mesh>
            <mesh position={[half, 1, 0]}>
                <boxGeometry args={[0.35, 2, size]} />
                <meshStandardMaterial color="#38444a" />
            </mesh>
        </group>
    );
}

function BuildingMesh({ building }: { building: Building }) {
    return (
        <group position={[building.x, building.height / 2, building.z]}>
            <mesh castShadow receiveShadow>
                <boxGeometry
                    args={[building.width, building.height, building.depth]}
                />
                <meshStandardMaterial color={building.color} roughness={0.8} />
            </mesh>
            <mesh position={[0, building.height / 2 + 0.08, 0]}>
                <boxGeometry
                    args={[building.width + 0.7, 0.16, building.depth + 0.7]}
                />
                <meshStandardMaterial color="#30383d" />
            </mesh>
        </group>
    );
}

function RemotePlayer({ player }: { player: PlayerSnapshot }) {
    const groupRef = useRef<THREE.Group>(null);
    const targetPositionRef = useRef(new THREE.Vector3());
    const height = player.isCrouching
        ? GAME_CONFIG.crouchingHeight
        : GAME_CONFIG.standingHeight;
    const color = player.isAlive ? "#d9473f" : "#3f4652";

    useEffect(() => {
        groupRef.current?.position.set(player.x, player.y, player.z);
        groupRef.current?.rotation.set(0, player.yaw, 0);
    }, [player.id]);

    useFrame((_, delta) => {
        const group = groupRef.current;

        if (!group) {
            return;
        }

        const smoothing = 1 - Math.exp(-18 * delta);

        group.position.lerp(
            targetPositionRef.current.set(player.x, player.y, player.z),
            smoothing,
        );
        group.rotation.y = THREE.MathUtils.lerp(
            group.rotation.y,
            player.yaw,
            smoothing,
        );
    });

    return (
        <group ref={groupRef}>
            <mesh castShadow position={[0, height * 0.5, 0]}>
                <capsuleGeometry
                    args={[GAME_CONFIG.playerRadius, height * 0.55, 8, 16]}
                />
                <meshStandardMaterial color={color} roughness={0.65} />
            </mesh>
            <mesh castShadow position={[0, height + 0.16, 0]}>
                <sphereGeometry args={[0.28, 16, 12]} />
                <meshStandardMaterial color="#f0c39f" roughness={0.7} />
            </mesh>
            <mesh castShadow position={[0.28, height * 0.62, -0.42]}>
                <boxGeometry args={[0.18, 0.18, 0.78]} />
                <meshStandardMaterial color="#20252b" />
            </mesh>
            <PlayerLabel player={player} y={height + 0.72} />
        </group>
    );
}

function PlayerLabel({ player, y }: { player: PlayerSnapshot; y: number }) {
    const texture = useMemo(
        () => makeLabelTexture(player.name, player.health),
        [player.health, player.name],
    );

    useEffect(() => () => texture.dispose(), [texture]);

    return (
        <sprite position={[0, y, 0]} scale={[2.6, 0.58, 1]}>
            <spriteMaterial map={texture} transparent />
        </sprite>
    );
}

function WeaponModel({
    activeWeapon,
    isZooming,
    recoilUntilRef,
    visible,
}: {
    activeWeapon: WeaponId;
    isZooming: boolean;
    recoilUntilRef: RefObject<number>;
    visible: boolean;
}) {
    if (activeWeapon === "sniper") {
        return (
            <Sniper
                isZooming={isZooming}
                recoilUntilRef={recoilUntilRef}
                visible={visible}
            />
        );
    }

    return (
        <Handgun
            isZooming={isZooming}
            recoilUntilRef={recoilUntilRef}
            visible={visible}
        />
    );
}

function Handgun({
    isZooming,
    recoilUntilRef,
    visible,
}: {
    isZooming: boolean;
    recoilUntilRef: RefObject<number>;
    visible: boolean;
}) {
    const groupRef = useRef<THREE.Group>(null);

    useFrame(() => {
        applyWeaponRecoil(
            groupRef.current,
            isZooming ? [0.18, -0.24, -0.82] : [0.38, -0.32, -0.72],
            recoilUntilRef.current,
            190,
            0.14,
        );
    });

    return (
        <group
            ref={groupRef}
            position={isZooming ? [0.18, -0.24, -0.82] : [0.38, -0.32, -0.72]}
            visible={visible}
        >
            <mesh castShadow rotation={[0, -0.08, 0]}>
                <boxGeometry args={[0.24, 0.22, 0.78]} />
                <meshStandardMaterial
                    color="#20242a"
                    metalness={0.25}
                    roughness={0.5}
                />
            </mesh>
            <mesh castShadow position={[0, -0.22, 0.18]}>
                <boxGeometry args={[0.18, 0.42, 0.2]} />
                <meshStandardMaterial color="#171a1f" roughness={0.55} />
            </mesh>
            <mesh castShadow position={[0, 0.02, -0.48]}>
                <boxGeometry args={[0.16, 0.12, 0.36]} />
                <meshStandardMaterial
                    color="#2e343b"
                    metalness={0.3}
                    roughness={0.42}
                />
            </mesh>
        </group>
    );
}

function Sniper({
    isZooming,
    recoilUntilRef,
    visible,
}: {
    isZooming: boolean;
    recoilUntilRef: RefObject<number>;
    visible: boolean;
}) {
    const groupRef = useRef<THREE.Group>(null);

    useFrame(() => {
        applyWeaponRecoil(
            groupRef.current,
            isZooming ? [0.08, -0.18, -1.08] : [0.34, -0.34, -0.88],
            recoilUntilRef.current,
            260,
            0.26,
        );
    });

    return (
        <group
            ref={groupRef}
            position={isZooming ? [0.08, -0.18, -1.08] : [0.34, -0.34, -0.88]}
            visible={visible}
        >
            <mesh castShadow rotation={[0, -0.04, 0]}>
                <boxGeometry args={[0.2, 0.18, 1.35]} />
                <meshStandardMaterial
                    color="#1d2328"
                    metalness={0.32}
                    roughness={0.45}
                />
            </mesh>
            <mesh castShadow position={[0, 0.13, -0.16]}>
                <cylinderGeometry args={[0.12, 0.12, 0.48, 18]} />
                <meshStandardMaterial color="#101418" metalness={0.4} />
            </mesh>
            <mesh castShadow position={[0, -0.2, 0.14]}>
                <boxGeometry args={[0.16, 0.46, 0.2]} />
                <meshStandardMaterial color="#171a1f" roughness={0.55} />
            </mesh>
            <mesh castShadow position={[0, 0, -0.86]}>
                <boxGeometry args={[0.12, 0.12, 0.46]} />
                <meshStandardMaterial color="#333d45" metalness={0.35} />
            </mesh>
        </group>
    );
}

function GameHud({
    ammoNotice,
    chatDraft,
    chatInputRef,
    chatMessages,
    damageFlash,
    hitMarker,
    isChatOpen,
    isZooming,
    localPlayer,
    onChatDraftChange,
    onChatSubmit,
    onCloseChat,
    pointerLocked,
    players,
    status,
}: {
    ammoNotice: string;
    chatDraft: string;
    chatInputRef: RefObject<HTMLInputElement | null>;
    chatMessages: ChatSnapshot[];
    damageFlash: DamageEvent | null;
    hitMarker: HitEvent | null;
    isChatOpen: boolean;
    isZooming: boolean;
    localPlayer: PlayerSnapshot | undefined;
    onChatDraftChange: (value: string) => void;
    onChatSubmit: () => void;
    onCloseChat: () => void;
    pointerLocked: boolean;
    players: PlayerSnapshot[];
    status: string;
}) {
    return (
        <div className="hud">
            <div className="top-bar">
                <div className="hud-panel player-panel">
                    <strong>{localPlayer?.name ?? "Player"}</strong>
                    <span>{localPlayer?.isAlive ? "Alive" : "Respawning"}</span>
                </div>
                <div className="hud-panel scoreboard">
                    {players.map((player) => (
                        <div className="score-row" key={player.id}>
                            <span>{player.name}</span>
                            <strong>{player.score}</strong>
                        </div>
                    ))}
                </div>
            </div>
            <div className="crosshair" aria-hidden="true">
                <span />
                <span />
            </div>
            {isZooming && localPlayer?.activeWeapon === "sniper" && (
                <div className="scope-overlay" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                </div>
            )}
            {hitMarker && (
                <div
                    className={`hit-marker ${
                        hitMarker.killed ? "is-kill" : ""
                    }`}
                    aria-hidden="true"
                >
                    <span />
                    <span />
                    <strong>{hitMarker.killed ? "KILL" : "HIT"}</strong>
                </div>
            )}
            {damageFlash && (
                <div className="damage-flash" aria-hidden="true">
                    <span>{damageFlash.attackerName}</span>
                </div>
            )}
            {ammoNotice && <div className="ammo-notice">{ammoNotice}</div>}
            {!pointerLocked && (
                <div className="lock-message">
                    Click the arena to capture aim
                </div>
            )}
            {localPlayer?.isAlive === false && (
                <div className="respawn-message">Respawning...</div>
            )}
            <ChatPanel
                chatDraft={chatDraft}
                chatInputRef={chatInputRef}
                isChatOpen={isChatOpen}
                messages={chatMessages}
                onChatDraftChange={onChatDraftChange}
                onChatSubmit={onChatSubmit}
                onCloseChat={onCloseChat}
            />
            <div className="bottom-bar">
                <div className="combat-panel-group">
                    <div className="hud-panel stat">
                        <span>Health</span>
                        <strong>{localPlayer?.health ?? 0}</strong>
                    </div>
                    <div className="hud-panel stat">
                        <span>
                            {localPlayer?.activeWeapon === "sniper"
                                ? "Sniper"
                                : "Handgun"}
                        </span>
                        <strong>
                            {localPlayer?.ammo ?? 0}/
                            {localPlayer?.activeWeapon === "sniper"
                                ? GAME_CONFIG.sniperAmmoCapacity
                                : GAME_CONFIG.ammoCapacity}
                        </strong>
                        {localPlayer?.isReloading && <em>Reloading</em>}
                    </div>
                    <div className="hud-panel stat weapon-list">
                        <span>Weapons</span>
                        <strong
                            className={
                                localPlayer?.activeWeapon === "handgun"
                                    ? "is-selected"
                                    : ""
                            }
                        >
                            1 Handgun {localPlayer?.handgunAmmo ?? 0}/
                            {GAME_CONFIG.ammoCapacity}
                        </strong>
                        <strong
                            className={
                                localPlayer?.activeWeapon === "sniper"
                                    ? "is-selected"
                                    : ""
                            }
                        >
                            2 Sniper {localPlayer?.sniperAmmo ?? 0}/
                            {GAME_CONFIG.sniperAmmoCapacity}
                        </strong>
                    </div>
                </div>
                <div className="hud-panel stat">
                    <span>Status</span>
                    <strong>{status}</strong>
                </div>
            </div>
        </div>
    );
}

function ChatPanel({
    chatDraft,
    chatInputRef,
    isChatOpen,
    messages,
    onChatDraftChange,
    onChatSubmit,
    onCloseChat,
}: {
    chatDraft: string;
    chatInputRef: RefObject<HTMLInputElement | null>;
    isChatOpen: boolean;
    messages: ChatSnapshot[];
    onChatDraftChange: (value: string) => void;
    onChatSubmit: () => void;
    onCloseChat: () => void;
}) {
    return (
        <div className={`chat-panel ${isChatOpen ? "is-open" : ""}`}>
            <div className="chat-messages">
                {messages.slice(-8).map((message) => (
                    <div className="chat-message" key={message.id}>
                        <strong>{message.playerName}</strong>
                        <span>{message.text}</span>
                    </div>
                ))}
            </div>
            {isChatOpen ? (
                <form
                    className="chat-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onChatSubmit();
                    }}
                >
                    <input
                        maxLength={140}
                        onChange={(event) =>
                            onChatDraftChange(event.target.value)
                        }
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                event.preventDefault();
                                onCloseChat();
                            }
                        }}
                        placeholder="Message all players"
                        ref={chatInputRef}
                        value={chatDraft}
                    />
                </form>
            ) : (
                <div className="chat-hint">Enter to chat</div>
            )}
        </div>
    );
}

function applyWeaponRecoil(
    group: THREE.Group | null,
    basePosition: [number, number, number],
    recoilUntil: number,
    duration: number,
    strength: number,
) {
    if (!group) {
        return;
    }

    const remaining = Math.max(0, recoilUntil - performance.now());
    const progress = remaining / duration;
    const kick = Math.sin(progress * Math.PI) * strength;

    group.position.set(
        basePosition[0],
        basePosition[1] + kick * 0.18,
        basePosition[2] + kick,
    );
    group.rotation.x = -kick * 0.45;
}

function sendLook(room: GameRoom | null, look: { yaw: number; pitch: number }) {
    if (!room) {
        return;
    }

    const now = performance.now();

    if (now - lastSentLookAt < 45) {
        return;
    }

    lastSentLookAt = now;
    room.send("look", look);
}

let lastSentLookAt = 0;

function updateLocalPrediction(
    localVisualRef: RefObject<LocalVisualState | null>,
    serverPlayer: PlayerSnapshot,
    input: InputState,
    look: { yaw: number; pitch: number },
    delta: number,
) {
    const current = localVisualRef.current;

    if (
        !current ||
        current.playerId !== serverPlayer.id ||
        !serverPlayer.isAlive
    ) {
        const next = makeLocalVisualState(serverPlayer, look);

        localVisualRef.current = next;

        return next;
    }

    current.yaw = look.yaw;
    current.pitch = look.pitch;
    current.isCrouching = input.crouch;

    predictMovement(current, input, Math.min(delta, 0.05));
    reconcileLocalVisual(current, serverPlayer);

    return current;
}

function makeLocalVisualState(
    player: PlayerSnapshot,
    look: { yaw: number; pitch: number },
): LocalVisualState {
    return {
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: look.yaw,
        pitch: look.pitch,
        verticalVelocity: 0,
        isCrouching: player.isCrouching,
        playerId: player.id,
    };
}

function predictMovement(
    visual: LocalVisualState,
    input: InputState,
    delta: number,
) {
    const moveX =
        (input.left ? -Math.cos(visual.yaw) : 0) +
        (input.right ? Math.cos(visual.yaw) : 0) +
        (input.forward ? -Math.sin(visual.yaw) : 0) +
        (input.backward ? Math.sin(visual.yaw) : 0);
    const moveZ =
        (input.left ? Math.sin(visual.yaw) : 0) +
        (input.right ? -Math.sin(visual.yaw) : 0) +
        (input.forward ? -Math.cos(visual.yaw) : 0) +
        (input.backward ? Math.cos(visual.yaw) : 0);
    const magnitude = Math.hypot(moveX, moveZ);
    const speed = input.crouch
        ? GAME_CONFIG.crouchSpeed
        : input.run
          ? GAME_CONFIG.runSpeed
          : GAME_CONFIG.walkSpeed;

    if (magnitude > 0) {
        visual.x += (moveX / magnitude) * speed * delta;
        visual.z += (moveZ / magnitude) * speed * delta;
    }

    if (input.jump && visual.y <= 0.001 && !input.crouch) {
        visual.verticalVelocity = GAME_CONFIG.jumpVelocity;
    }

    if (visual.y > 0 || visual.verticalVelocity > 0) {
        visual.verticalVelocity -= GAME_CONFIG.gravity * delta;
        visual.y = Math.max(0, visual.y + visual.verticalVelocity * delta);

        if (visual.y <= 0) {
            visual.verticalVelocity = 0;
        }
    }

    visual.x = clamp(
        visual.x,
        -GAME_CONFIG.mapHalfSize + GAME_CONFIG.playerRadius,
        GAME_CONFIG.mapHalfSize - GAME_CONFIG.playerRadius,
    );
    visual.z = clamp(
        visual.z,
        -GAME_CONFIG.mapHalfSize + GAME_CONFIG.playerRadius,
        GAME_CONFIG.mapHalfSize - GAME_CONFIG.playerRadius,
    );

    resolveVisualBuildingCollision(visual);
}

function reconcileLocalVisual(
    visual: LocalVisualState,
    serverPlayer: PlayerSnapshot,
) {
    const distance = Math.hypot(
        visual.x - serverPlayer.x,
        visual.y - serverPlayer.y,
        visual.z - serverPlayer.z,
    );

    if (distance > 5) {
        visual.x = serverPlayer.x;
        visual.y = serverPlayer.y;
        visual.z = serverPlayer.z;
        visual.verticalVelocity = 0;
        return;
    }

    const reconcileFactor = distance > 0.35 ? 0.14 : 0.04;

    visual.x = THREE.MathUtils.lerp(visual.x, serverPlayer.x, reconcileFactor);
    visual.y = THREE.MathUtils.lerp(visual.y, serverPlayer.y, reconcileFactor);
    visual.z = THREE.MathUtils.lerp(visual.z, serverPlayer.z, reconcileFactor);
    visual.isCrouching = serverPlayer.isCrouching;
}

function resolveVisualBuildingCollision(visual: LocalVisualState) {
    for (const building of MAP_BUILDINGS) {
        const minX = building.x - building.width / 2 - GAME_CONFIG.playerRadius;
        const maxX = building.x + building.width / 2 + GAME_CONFIG.playerRadius;
        const minZ = building.z - building.depth / 2 - GAME_CONFIG.playerRadius;
        const maxZ = building.z + building.depth / 2 + GAME_CONFIG.playerRadius;

        if (
            visual.x < minX ||
            visual.x > maxX ||
            visual.z < minZ ||
            visual.z > maxZ
        ) {
            continue;
        }

        if (building.jumpable && visual.y >= building.height - 0.5) {
            visual.y = building.height;
            visual.verticalVelocity = 0;
            continue;
        }

        const pushLeft = Math.abs(visual.x - minX);
        const pushRight = Math.abs(maxX - visual.x);
        const pushBack = Math.abs(visual.z - minZ);
        const pushForward = Math.abs(maxZ - visual.z);
        const smallestPush = Math.min(
            pushLeft,
            pushRight,
            pushBack,
            pushForward,
        );

        if (smallestPush === pushLeft) {
            visual.x = minX;
        } else if (smallestPush === pushRight) {
            visual.x = maxX;
        } else if (smallestPush === pushBack) {
            visual.z = minZ;
        } else {
            visual.z = maxZ;
        }
    }
}

function normalizeAngle(value: number) {
    const twoPi = Math.PI * 2;

    return ((((value + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function makeLabelTexture(name: string, health: number) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = 256;
    canvas.height = 64;

    if (!context) {
        return new THREE.CanvasTexture(canvas);
    }

    context.fillStyle = "rgba(10, 14, 18, 0.72)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.font = "600 24px Inter, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText(name, 128, 28);
    context.fillStyle = "#d9473f";
    context.fillRect(28, 42, 200, 10);
    context.fillStyle = "#62d26f";
    context.fillRect(28, 42, Math.max(0, Math.min(200, health * 2)), 10);

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}
