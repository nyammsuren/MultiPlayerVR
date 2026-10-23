import { joinRoom, selfId } from "trystero";

// Энэ апп-ын давтагдашгүй ID — өөр Trystero апп-уудтай холилдохгүй
const APP_ID = "nyammsuren-multiplayer-vr";

export { selfId };

// ======================
// P2P ХОЛБОЛТ
// Сервергүй: Nostr relay-ээр бие биеэ олж, дараа нь WebRTC-ээр шууд холбогдоно.
// Байрлал ба дуу хэрэглэгчдийн хооронд шууд (peer-to-peer) дамжина.
// ======================
export function connect({ roomId, getInfo, localStream, handlers }) {
    const room = joinRoom({ appId: APP_ID }, roomId, {
        onJoinError: (d) => handlers.onError?.(d.error),
    });

    const pose = room.makeAction("pose");
    const info = room.makeAction("info");

    // Шинэ хэрэглэгч орж ирэхэд — өөрийн мэдээлэл ба дууг илгээнэ
    room.onPeerJoin = (peerId) => {
        info.send(getInfo(), { target: peerId });
        if (localStream) room.addStream(localStream, { target: peerId });
        handlers.onPeerJoin?.(peerId);
    };
    room.onPeerLeave = (peerId) => handlers.onPeerLeave?.(peerId);
    room.onPeerStream = (stream, peerId) => handlers.onStream?.(peerId, stream);

    pose.onMessage = (data, { peerId }) => handlers.onPose?.(peerId, data);
    info.onMessage = (data, { peerId }) => handlers.onInfo?.(peerId, data);

    if (localStream) room.addStream(localStream);

    // Мэдээллийг үе үе дахин илгээх — алдагдсан тохиолдолд нөхнө
    const infoTimer = setInterval(() => info.send(getInfo()), 5000);

    return {
        sendPose: (arr) => pose.send(arr),
        sendInfo: () => info.send(getInfo()),
        peerCount: () => Object.keys(room.getPeers()).length,
        leave: () => { clearInterval(infoTimer); room.leave(); },
    };
}
