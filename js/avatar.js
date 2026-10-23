import * as THREE from "three";

// Analyser-аас дууны түвшин (0..1) гаргах
export function audioLevel(analyser, buf) {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 4);
}

function makeNameSprite(name, color) {
    const cvs = document.createElement("canvas");
    cvs.width = 512; cvs.height = 128;
    const ctx = cvs.getContext("2d");
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
    sprite.scale.set(0.8, 0.2, 1);

    sprite.userData.draw = (text, muted, dotColor = color) => {
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = "rgba(20, 24, 36, 0.75)";
        ctx.beginPath();
        ctx.roundRect(16, 20, 480, 88, 44);
        ctx.fill();
        ctx.fillStyle = dotColor;
        ctx.beginPath(); ctx.arc(70, 64, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 46px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        let label = text.length > 12 ? text.slice(0, 11) + "…" : text;
        if (muted) label += " 🔇";
        ctx.fillText(label, 104, 66);
        tex.needsUpdate = true;
    };
    sprite.userData.draw(name, false);
    return sprite;
}

// ======================
// БУСАД ХЭРЭГЛЭГЧИЙН АВАТАР
// ======================
export function createAvatar(scene, { name, color }) {
    const root = new THREE.Group();
    root.visible = false; // анхны байрлал ирэх хүртэл нууна
    scene.add(root);

    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });

    // Толгой — нүүрний хаалт (visor) нь харж буй чигийг харуулна
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), bodyMat);
    head.add(skull);
    const visorMat = new THREE.MeshStandardMaterial({
        color: 0x111522, roughness: 0.2, metalness: 0.5,
        emissive: 0x5ce08a, emissiveIntensity: 0,
    });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), visorMat);
    visor.position.set(0, 0.01, -0.11);
    head.add(visor);
    root.add(head);

    // Бие — зөвхөн хэвтээ чиглэлд эргэнэ
    const body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 8, 16), bodyMat);
    body.add(torso);
    root.add(body);

    // Гар (VR контроллер)
    const handGeo = new THREE.SphereGeometry(0.045, 16, 12);
    const hands = [new THREE.Mesh(handGeo, bodyMat), new THREE.Mesh(handGeo, bodyMat)];
    hands.forEach(h => { h.visible = false; root.add(h); });

    // Нэр
    const label = makeNameSprite(name, color);
    root.add(label);

    // Хүлээн авсан байрлал (target) ба одоогийн байрлал
    const tHead = new THREE.Vector3(0, 1.6, 0);
    const tQuat = new THREE.Quaternion();
    const tHands = [new THREE.Vector3(), new THREE.Vector3()];
    let hasPose = false;

    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const buf = new Uint8Array(256);

    const avatar = {
        root,
        name,
        color,
        muted: false,
        speaking: false,
        analyser: null,
        audioEl: null,
        sound: null,

        setInfo(info) {
            if (info.name) avatar.name = info.name;
            if (info.color && info.color !== avatar.color) {
                avatar.color = info.color;
                bodyMat.color.set(info.color);
            }
            avatar.muted = !!info.muted;
            label.userData.draw(avatar.name, avatar.muted, avatar.color);
        },

        // pose: [hx,hy,hz, qx,qy,qz,qw, lx,ly,lz, rx,ry,rz, handsMask]
        setPose(p) {
            tHead.set(p[0], p[1], p[2]);
            tQuat.set(p[3], p[4], p[5], p[6]);
            tHands[0].set(p[7], p[8], p[9]);
            tHands[1].set(p[10], p[11], p[12]);
            hands[0].visible = !!(p[13] & 1);
            hands[1].visible = !!(p[13] & 2);
            if (!hasPose) {
                // Анхны байрлал — шууд тавина
                head.position.copy(tHead);
                head.quaternion.copy(tQuat);
                hands[0].position.copy(tHands[0]);
                hands[1].position.copy(tHands[1]);
                hasPose = true;
                root.visible = true;
            }
        },

        // Дуут урсгалыг 3D дуу болгож толгойд холбоно
        attachAudio(stream, listener) {
            avatar.detachAudio();
            // Chrome-д WebRTC урсгалыг WebAudio-д ашиглахын тулд
            // дуугүй <audio> элементэд холбох шаардлагатай
            const el = new Audio();
            el.srcObject = stream;
            el.muted = true;
            el.play().catch(() => {});
            avatar.audioEl = el;

            const sound = new THREE.PositionalAudio(listener);
            sound.setMediaStreamSource(stream);
            sound.setRefDistance(1.5);
            sound.setRolloffFactor(0.6);
            head.add(sound);
            avatar.sound = sound;

            const analyser = listener.context.createAnalyser();
            analyser.fftSize = 256;
            sound.source.connect(analyser);
            avatar.analyser = analyser;
        },

        detachAudio() {
            if (avatar.sound) {
                avatar.sound.disconnect();
                head.remove(avatar.sound);
                avatar.sound = null;
            }
            if (avatar.audioEl) {
                avatar.audioEl.srcObject = null;
                avatar.audioEl = null;
            }
            avatar.analyser = null;
        },

        update(dt) {
            const k = 1 - Math.exp(-dt * 12);
            head.position.lerp(tHead, k);
            head.quaternion.slerp(tQuat, k);
            hands[0].position.lerp(tHands[0], k);
            hands[1].position.lerp(tHands[1], k);

            euler.setFromQuaternion(head.quaternion);
            body.position.set(head.position.x, Math.max(0.4, head.position.y - 0.55), head.position.z);
            body.rotation.y = euler.y;
            label.position.set(head.position.x, head.position.y + 0.32, head.position.z);

            // Ярьж байгаа эсэх — нүүрний хаалт гэрэлтэнэ
            const lvl = avatar.analyser ? audioLevel(avatar.analyser, buf) : 0;
            avatar.speaking = lvl > 0.08;
            visorMat.emissiveIntensity += ((avatar.speaking ? 0.4 + lvl * 2 : 0) - visorMat.emissiveIntensity) * k;
        },

        dispose() {
            avatar.detachAudio();
            scene.remove(root);
            root.traverse(o => {
                o.geometry?.dispose();
                if (o.material) {
                    o.material.map?.dispose();
                    o.material.dispose();
                }
            });
        },
    };

    return avatar;
}
