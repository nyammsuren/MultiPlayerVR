import * as THREE from "three";
import { VRButton }                  from "three/addons/webxr/VRButton.js";
import { createRoom, RW, RD }        from "./room.js";
import { createAvatar, audioLevel }  from "./avatar.js";
import { connect, selfId }           from "./network.js";

// ======================
// SCENE
// ======================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202533);

// ======================
// CAMERA + AUDIO LISTENER
// ======================
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, 1.6, 0);
const listener = new THREE.AudioListener();
camera.add(listener);

// ======================
// RENDERER
// ======================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();

// ======================
// ӨРӨӨ
// ======================
const room = createRoom(scene);

// ======================
// PLAYER RIG — төвийг тойрсон санамсаргүй цэгт гарч ирнэ
// ======================
const playerRig = new THREE.Group();
playerRig.add(camera);
scene.add(playerRig);

const spawnAngle = Math.random() * Math.PI * 2;
playerRig.position.set(Math.sin(spawnAngle) * 2.5, 0, Math.cos(spawnAngle) * 2.5);
playerRig.rotation.y = spawnAngle; // төв рүү харна

// ======================
// ӨӨРИЙН МЭДЭЭЛЭЛ
// ======================
function colorFromId(id) {
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return "#" + new THREE.Color().setHSL((h % 360) / 360, 0.65, 0.55).getHexString();
}

const myColor = colorFromId(selfId);
let myName    = "";
let myMuted   = false;
let roomId    = "";
let localStream = null;
let network     = null;

const getInfo = () => ({ name: myName, color: myColor, muted: myMuted });

// ======================
// БУСАД ХЭРЭГЛЭГЧИД
// ======================
const avatars = {}; // peerId → avatar
window.mpDebug = { avatars, listener }; // консолоос шалгахад

function ensureAvatar(peerId) {
    if (!avatars[peerId]) avatars[peerId] = createAvatar(scene, { name: "...", color: "#888888" });
    return avatars[peerId];
}

const handlers = {
    onPeerJoin: (id) => { ensureAvatar(id); },
    onPeerLeave: (id) => {
        avatars[id]?.dispose();
        delete avatars[id];
    },
    onInfo:  (id, info) => ensureAvatar(id).setInfo(info),
    onPose:  (id, pose) => ensureAvatar(id).setPose(pose),
    onStream: (id, stream) => ensureAvatar(id).attachAudio(stream, listener),
    onError: (err) => setStatus("Холболтын алдаа: " + err),
};

// ======================
// НЭВТРЭХ
// ======================
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

function loadSaved(key) {
    try { return localStorage.getItem(key) || ""; } catch { return ""; }
}
function save(key, val) {
    try { localStorage.setItem(key, val); } catch { /* хадгалах боломжгүй */ }
}

$("nameInput").value = loadSaved("mpvr-name") || "Хэрэглэгч " + Math.floor(10 + Math.random() * 90);
$("roomInput").value = params.get("room") || "main";

$("joinBtn").addEventListener("click", async () => {
    myName = $("nameInput").value.trim() || "Хэрэглэгч";
    roomId = $("roomInput").value.trim().toLowerCase().replace(/\s+/g, "-") || "main";
    save("mpvr-name", myName);

    $("joinBtn").disabled = true;
    $("joinMsg").textContent = "Микрофон асааж байна…";

    // Хэрэглэгч товч дарсан үед AudioContext-ийг идэвхжүүлнэ (browser шаардлага)
    listener.context.resume();

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
        });
    } catch (e) {
        console.warn("Микрофон авч чадсангүй:", e);
        localStream = null;
    }

    // Өрөөний кодыг URL-д оруулна — холбоосоор урих боломжтой
    const url = new URL(location.href);
    url.searchParams.set("room", roomId);
    history.replaceState(null, "", url);

    network = connect({ roomId, getInfo, localStream, handlers });

    if (localStream) setupMicMeter(localStream);

    $("join").style.display = "none";
    $("hud").style.display = "block";
    $("hudRoom").textContent = "Өрөө: " + roomId;
    document.body.appendChild(VRButton.createButton(renderer));

    setStatus(localStream ? "Бусад хэрэглэгчийг хүлээж байна…"
                          : "Микрофон олдсонгүй — зөвхөн сонсох горим. Бусдыг хүлээж байна…");
    if (!localStream) $("muteBtn").disabled = true;
});

function setStatus(text) { $("status").textContent = text; }

// ======================
// МИКРОФОН
// ======================
let micAnalyser = null;
const micBuf = new Uint8Array(256);

function setupMicMeter(stream) {
    const src = listener.context.createMediaStreamSource(stream);
    micAnalyser = listener.context.createAnalyser();
    micAnalyser.fftSize = 256;
    src.connect(micAnalyser); // destination-д холбохгүй — өөрийгөө сонсохгүй
}

function toggleMute() {
    if (!localStream) return;
    myMuted = !myMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !myMuted; });
    $("muteBtn").classList.toggle("off", myMuted);
    $("muteBtn").textContent = myMuted ? "🔇 Хаалттай" : "🎤 Микрофон";
    network?.sendInfo();
}

$("muteBtn").addEventListener("click", toggleMute);
$("copyBtn").addEventListener("click", () => {
    navigator.clipboard?.writeText(location.href).then(
        () => setStatus("Холбоос хуулагдлаа — бусдад илгээгээрэй"),
        () => setStatus(location.href)
    );
});

// ======================
// HUD + САМБАР ШИНЭЧЛЭХ
// ======================
let lastBoardKey = "";
let myLastLoud = -Infinity;

function refreshPeopleUI() {
    if (!network) return;
    const myLevel = micAnalyser && !myMuted ? audioLevel(micAnalyser, micBuf) : 0;
    $("micBar").firstElementChild.style.width = Math.round(myLevel * 100) + "%";
    if (myLevel > 0.08) myLastLoud = performance.now();
    const mySpeaking = performance.now() - myLastLoud < 500;

    const people = [
        { name: myName, color: myColor, muted: myMuted, speaking: mySpeaking, self: true },
        ...Object.values(avatars).map(a => ({
            name: a.name, color: a.color, muted: a.muted, speaking: a.speaking, self: false,
        })),
    ];

    $("hudCount").textContent = people.length + " хүн";
    const list = $("hudList");
    list.replaceChildren(...people.map(p => {
        const li  = document.createElement("li");
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = p.color;
        const nm = document.createElement("span");
        nm.textContent = p.name + (p.self ? " (та)" : "");
        const st = document.createElement("span");
        if (p.muted) { st.className = "mic-off"; st.textContent = "🔇"; }
        else         { st.className = "spk" + (p.speaking ? " on" : ""); st.textContent = "● ярьж байна"; }
        li.append(dot, nm, st);
        return li;
    }));

    if (people.length > 1 && $("status").textContent.startsWith("Бусад")) setStatus("");
    if (people.length > 8) setStatus("Анхаар: 8-аас олон хүн байвал дуу саатаж болно");

    // Самбарыг зөвхөн өөрчлөгдсөн үед дахин зурна
    const key = JSON.stringify([roomId, myMuted, people]);
    if (key !== lastBoardKey) {
        lastBoardKey = key;
        room.userData.updateBoard({ roomId, people, myMuted });
    }
}
setInterval(refreshPeopleUI, 200);

// ======================
// КОМПЬЮТЕР — ХУЛГАНА, ГАР
// ======================
let yaw = 0, pitch = 0;
let dragging = false, lastX = 0, lastY = 0;
const keys = {};

renderer.domElement.addEventListener("pointerdown", (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener("pointerup", () => { dragging = false; });
window.addEventListener("pointermove", (e) => {
    if (!dragging || renderer.xr.isPresenting) return;
    yaw   -= (e.clientX - lastX) * 0.004;
    pitch -= (e.clientY - lastY) * 0.004;
    pitch = Math.max(-1.3, Math.min(1.3, pitch));
    lastX = e.clientX; lastY = e.clientY;
});

window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    keys[e.code] = true;
    if (e.code === "KeyM") toggleMute();
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

// ======================
// ХӨДӨЛГӨӨН
// ======================
const UP       = new THREE.Vector3(0, 1, 0);
const forward  = new THREE.Vector3();
const right    = new THREE.Vector3();
const headPos  = new THREE.Vector3();
const LIMIT_X  = RW / 2 - 0.4;
const LIMIT_Z  = RD / 2 - 0.4;

// fx: баруун(+)/зүүн(-), fz: урагш(+)/хойш(-), м/с
function moveRig(fx, fz, dt) {
    if (!fx && !fz) return;
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, UP);
    const SPEED = 2.0;
    playerRig.position.addScaledVector(right,   fx * SPEED * dt);
    playerRig.position.addScaledVector(forward, fz * SPEED * dt);
    clampToRoom();
}

// Толгой хананаас гарахгүй байхаар rig-ийг засна
function clampToRoom() {
    camera.getWorldPosition(headPos);
    const cx = Math.max(-LIMIT_X, Math.min(LIMIT_X, headPos.x));
    const cz = Math.max(-LIMIT_Z, Math.min(LIMIT_Z, headPos.z));
    playerRig.position.x += cx - headPos.x;
    playerRig.position.z += cz - headPos.z;
}

// Толгойг тойруулан rig-ийг эргүүлэх (VR snap turn)
function turnRig(angle) {
    camera.getWorldPosition(headPos);
    playerRig.position.sub(headPos).applyAxisAngle(UP, angle).add(headPos);
    playerRig.rotation.y += angle;
}

function handleDesktopInput(dt) {
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    let fx = 0, fz = 0;
    if (keys.KeyW || keys.ArrowUp)    fz += 1;
    if (keys.KeyS || keys.ArrowDown)  fz -= 1;
    if (keys.KeyD || keys.ArrowRight) fx += 1;
    if (keys.KeyA || keys.ArrowLeft)  fx -= 1;
    moveRig(fx, fz, dt);
}

// ======================
// VR CONTROLLER
// ======================
const controllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
const handMat = new THREE.MeshStandardMaterial({ color: myColor, roughness: 0.6 });

controllers.forEach((ctrl) => {
    playerRig.add(ctrl);
    ctrl.addEventListener("connected", (e) => {
        ctrl.userData.handedness = e.data.handedness;
        ctrl.userData.connected  = true;
        if (!ctrl.getObjectByName("hand")) {
            const hand = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), handMat);
            hand.name = "hand";
            ctrl.add(hand);
        }
    });
    ctrl.addEventListener("disconnected", () => {
        ctrl.userData.connected = false;
        const hand = ctrl.getObjectByName("hand");
        if (hand) ctrl.remove(hand);
    });
});

const prevBtn = {};
let snapReady = true;

function handleVRInput(dt) {
    const session = renderer.xr.getSession();
    if (!session) return;
    const DEAD = 0.15;

    for (const src of session.inputSources) {
        const gp = src.gamepad;
        if (!gp) continue;
        const ax = gp.axes[2] ?? 0, ay = gp.axes[3] ?? 0;

        if (src.handedness === "left") {
            // Зүүн жойстик — хөдлөх
            moveRig(Math.abs(ax) > DEAD ? ax : 0, Math.abs(ay) > DEAD ? -ay : 0, dt);
            // X товч (index 4) — микрофон
            const pressed = !!gp.buttons[4]?.pressed;
            if (pressed && !prevBtn.leftX) toggleMute();
            prevBtn.leftX = pressed;
        }

        if (src.handedness === "right") {
            // Баруун жойстик — 30° snap turn
            if (snapReady && Math.abs(ax) > 0.7) {
                turnRig(ax > 0 ? -Math.PI / 6 : Math.PI / 6);
                snapReady = false;
            } else if (Math.abs(ax) < 0.3) {
                snapReady = true;
            }
        }
    }
}

renderer.xr.addEventListener("sessionend", () => {
    camera.position.set(0, 1.6, 0);
});

// ======================
// БАЙРЛАЛ ИЛГЭЭХ — секундэд 15 удаа
// ======================
const SEND_INTERVAL = 1 / 15;
let sendTimer = 0;
const wPos  = new THREE.Vector3();
const wQuat = new THREE.Quaternion();
const r3 = (v) => Math.round(v * 1000) / 1000;

function buildPose() {
    camera.getWorldPosition(wPos);
    camera.getWorldQuaternion(wQuat);
    const pose = [r3(wPos.x), r3(wPos.y), r3(wPos.z), r3(wQuat.x), r3(wQuat.y), r3(wQuat.z), r3(wQuat.w)];

    // Гар: [зүүн, баруун]
    let mask = 0;
    const handPos = [[0, 0, 0], [0, 0, 0]];
    if (renderer.xr.isPresenting) {
        controllers.forEach((c) => {
            if (!c.userData.connected) return;
            const idx = c.userData.handedness === "left" ? 0 : 1;
            c.getWorldPosition(wPos);
            handPos[idx] = [r3(wPos.x), r3(wPos.y), r3(wPos.z)];
            mask |= 1 << idx;
        });
    }
    return [...pose, ...handPos[0], ...handPos[1], mask];
}

// ======================
// RESIZE
// ======================
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("beforeunload", () => network?.leave());

// ======================
// ANIMATION LOOP
// ======================
renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);

    if (renderer.xr.isPresenting) handleVRInput(dt);
    else handleDesktopInput(dt);

    for (const a of Object.values(avatars)) a.update(dt);

    if (network) {
        sendTimer += dt;
        if (sendTimer >= SEND_INTERVAL) {
            sendTimer = 0;
            network.sendPose(buildPose());
        }
    }

    renderer.render(scene, camera);
});
