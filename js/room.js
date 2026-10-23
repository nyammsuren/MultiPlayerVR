import * as THREE from "three";

// Өрөөний хэмжээ — main.js хөдөлгөөний хязгаарт ашиглана
export const RW = 14, RH = 5, RD = 14;

// ======================
// ХООСОН ӨРӨӨ
// ======================
export function createRoom(scene) {
    const room = new THREE.Group();
    scene.add(room);

    function mat(color, rough = 0.8, metal = 0) {
        return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    }

    room.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(4, 10, 6);
    room.add(dir);

    // ШАЛ
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), mat(0xdedad2, 0.3, 0.05));
    floor.rotation.x = -Math.PI / 2;
    room.add(floor);

    // Шалны тор — зай мэдрэхэд тусална
    const grid = new THREE.GridHelper(RW, RW, 0xb8b4ac, 0xb8b4ac);
    grid.position.y = 0.002;
    room.add(grid);

    // Төвийн дугуй тэмдэг
    const centerRing = new THREE.Mesh(
        new THREE.RingGeometry(1.4, 1.5, 64),
        new THREE.MeshBasicMaterial({ color: 0x2f7cf6, side: THREE.DoubleSide })
    );
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.y = 0.004;
    room.add(centerRing);

    // ХАНУУД
    const wallMat = mat(0xf2eee8, 0.9);
    [
        [RW, RH, [0, RH / 2, -RD / 2], 0],
        [RW, RH, [0, RH / 2,  RD / 2], Math.PI],
        [RD, RH, [-RW / 2, RH / 2, 0],  Math.PI / 2],
        [RD, RH, [ RW / 2, RH / 2, 0], -Math.PI / 2],
    ].forEach(([w, h, pos, ry]) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
        m.position.set(...pos);
        m.rotation.y = ry;
        room.add(m);
    });

    // Хананы доод хүрээ
    const skirtMat = mat(0x3a4460, 0.6);
    [
        [RW, [0, 0.06, -RD / 2 + 0.02], 0],
        [RW, [0, 0.06,  RD / 2 - 0.02], 0],
        [RD, [-RW / 2 + 0.02, 0.06, 0], Math.PI / 2],
        [RD, [ RW / 2 - 0.02, 0.06, 0], Math.PI / 2],
    ].forEach(([w, pos, ry]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.04), skirtMat);
        m.position.set(...pos);
        m.rotation.y = ry;
        room.add(m);
    });

    // ТААЗ
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), mat(0xffffff, 0.9));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, RH, 0);
    room.add(ceil);

    // Таазны гэрэл
    for (const [x, z] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
        const lamp = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32),
            new THREE.MeshBasicMaterial({ color: 0xfffbe8 })
        );
        lamp.position.set(x, RH - 0.03, z);
        room.add(lamp);
    }

    // ======================
    // ОРОЛЦОГЧДЫН САМБАР — урд ханан дээр
    // ======================
    const cvs = document.createElement("canvas");
    cvs.width = 1024; cvs.height = 640;
    const ctx = cvs.getContext("2d");
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;

    const board = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 2.0),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    board.position.set(0, 2.3, -RD / 2 + 0.03);
    room.add(board);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.35, 2.15, 0.04), mat(0x2b3247, 0.5));
    frame.position.set(0, 2.3, -RD / 2 + 0.01);
    room.add(frame);

    // people: [{ name, color, muted, speaking, self }]
    room.userData.updateBoard = ({ roomId, people, myMuted }) => {
        ctx.fillStyle = "#1d2233";
        ctx.fillRect(0, 0, cvs.width, cvs.height);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 54px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`Өрөө: ${roomId}`, 50, 60);

        ctx.fillStyle = "#aab3c8";
        ctx.font = "34px Arial";
        ctx.textAlign = "right";
        ctx.fillText(`${people.length} хүн`, 974, 60);

        ctx.strokeStyle = "#2f7cf6";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(50, 108); ctx.lineTo(974, 108); ctx.stroke();

        // Нэрсийн жагсаалт — 2 багана, хамгийн ихдээ 12
        ctx.textAlign = "left";
        ctx.font = "38px Arial";
        people.slice(0, 12).forEach((p, i) => {
            const col = Math.floor(i / 6), row = i % 6;
            const x = 60 + col * 470, y = 150 + row * 64;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(x + 14, y, 14, 0, Math.PI * 2); ctx.fill();
            if (p.speaking) {
                ctx.strokeStyle = "#5ce08a"; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(x + 14, y, 22, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.fillStyle = "#ffffff";
            let label = p.name + (p.self ? " (та)" : "");
            if (label.length > 16) label = label.slice(0, 15) + "…";
            ctx.fillText(label, x + 44, y);
            if (p.muted) {
                ctx.fillStyle = "#ff6b6b";
                ctx.font = "28px Arial";
                ctx.fillText("🔇", x + 400, y);
                ctx.font = "38px Arial";
            }
        });

        // Доод мөр — өөрийн микрофоны төлөв
        ctx.fillStyle = myMuted ? "#ff6b6b" : "#5ce08a";
        ctx.font = "bold 32px Arial";
        ctx.textAlign = "center";
        ctx.fillText(myMuted ? "Таны микрофон: ХААЛТТАЙ (X товч)" : "Таны микрофон: НЭЭЛТТЭЙ (X товч)", 512, 600);

        tex.needsUpdate = true;
    };

    room.userData.updateBoard({ roomId: "-", people: [], myMuted: false });
    return room;
}
