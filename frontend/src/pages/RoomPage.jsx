import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const GRID_SIZE = 10;
const CELL_SIZE = 48;
const INIT_POS = { x: 0, y: 0 };
const PROXIMITY_THRESHOLD = 2; // Manhattan distance

const RoomPage = ({ user, avatar, token }) => {
    const [users, setUsers] = useState([]);
    const [position, setPosition] = useState(INIT_POS);
    const [proximity, setProximity] = useState({}); // { socketId: true/false }
    const [audioStreams, setAudioStreams] = useState({}); // { socketId: MediaStream }
    const [micEnabled, setMicEnabled] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef(null);
    const peersRef = useRef({}); // { socketId: RTCPeerConnection }
    const localStreamRef = useRef(null);

    // Connect to WebSocket and handle events
    useEffect(() => {
        const socket = io('https://twod-room-voicechat.onrender.com', { transports: ['websocket'] });
        socketRef.current = socket;
        
        socket.on('connect', () => setIsConnected(true));
        socket.on('disconnect', () => setIsConnected(false));
        
        socket.emit('join', {
            token,
            avatarId: avatar.id,
            position: INIT_POS
        });
        socket.on('roomUsers', setUsers);
        
        // WebRTC signaling
        socket.on('signal', async ({ from, signal }) => {
            if (!peersRef.current[from]) {
                await createPeerConnection(from, false);
            }
            const peer = peersRef.current[from];
            if (signal.sdp) {
                await peer.setRemoteDescription(new window.RTCSessionDescription(signal.sdp));
                if (signal.sdp.type === 'offer') {
                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);
                    socket.emit('signal', { to: from, signal: { sdp: peer.localDescription } });
                }
            } else if (signal.candidate) {
                await peer.addIceCandidate(new window.RTCIceCandidate(signal.candidate));
            }
        });
        
        return () => {
            socket.disconnect();
            Object.values(peersRef.current).forEach(pc => pc.close());
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            setAudioStreams({});
        };
    }, [token, avatar]);

    // Handle movement
    useEffect(() => {
        const handleKey = (e) => {
            let { x, y } = position;
            if (e.key === 'ArrowUp' || e.key === 'w') y = Math.max(0, y - 1);
            if (e.key === 'ArrowDown' || e.key === 's') y = Math.min(GRID_SIZE - 1, y + 1);
            if (e.key === 'ArrowLeft' || e.key === 'a') x = Math.max(0, x - 1);
            if (e.key === 'ArrowRight' || e.key === 'd') x = Math.min(GRID_SIZE - 1, x + 1);
            if (x !== position.x || y !== position.y) {
                setPosition({ x, y });
                socketRef.current.emit('move', { position: { x, y } });
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [position]);

    // Proximity detection and WebRTC: manage connections based on proximity
    useEffect(() => {
        const me = users.find(u => u.email === user.email);
        if (!me) return;
        const prox = {};
        users.forEach(u => {
            if (u.email === user.email) return;
            const dist = Math.abs((u.position?.x ?? 0) - (me.position?.x ?? 0)) + Math.abs((u.position?.y ?? 0) - (me.position?.y ?? 0));
            prox[u.socketId] = dist <= PROXIMITY_THRESHOLD;
        });
        setProximity(prox);

        // WebRTC connection/disconnection logic
        if (!localStreamRef.current) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                localStreamRef.current = stream;
            }).catch(() => { });
        }
        Object.entries(prox).forEach(async ([socketId, inProx]) => {
            if (inProx && !peersRef.current[socketId]) {
                // Only initiate if my socketId is less than theirs
                if (me.socketId < socketId) {
                    await createPeerConnection(socketId, true);
                }
            } else if (!inProx && peersRef.current[socketId]) {
                peersRef.current[socketId].close();
                delete peersRef.current[socketId];
                setAudioStreams(s => {
                    const copy = { ...s };
                    delete copy[socketId];
                    return copy;
                });
            }
        });
    }, [users, user.email]);

    // Create peer connection
    async function createPeerConnection(socketId, isInitiator) {
        const pc = new window.RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peersRef.current[socketId] = pc;
        
        // Add local audio
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        }
        
        // ICE candidates
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socketRef.current.emit('signal', { to: socketId, signal: { candidate: e.candidate } });
            }
        };
        
        // Remote stream
        pc.ontrack = (e) => {
            setAudioStreams(s => ({ ...s, [socketId]: e.streams[0] }));
        };
        
        // Offer/Answer
        if (isInitiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current.emit('signal', { to: socketId, signal: { sdp: pc.localDescription } });
        }
        
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                pc.close();
                delete peersRef.current[socketId];
                setAudioStreams(s => {
                    const copy = { ...s };
                    delete copy[socketId];
                    return copy;
                });
            }
        };
    }

    // Toggle microphone
    const toggleMic = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setMicEnabled(audioTrack.enabled);
            }
        }
    };

    // Handle grid click
    const handleGridClick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
        const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
            setPosition({ x, y });
            socketRef.current.emit('move', { position: { x, y } });
        }
    };

    // Handle grid touch (for mobile)
    const handleGridTouch = (e) => {
        const touch = e.changedTouches[0];
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.floor((touch.clientX - rect.left) / CELL_SIZE);
        const y = Math.floor((touch.clientY - rect.top) / CELL_SIZE);
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
            setPosition({ x, y });
            socketRef.current.emit('move', { position: { x, y } });
        }
    };

    // Render grid and avatars
    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 py-8 px-4">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-6">
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">Voice Chat Room</h2>
                    <div className="flex items-center justify-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className="text-gray-600">{isConnected ? 'Connected' : 'Disconnected'}</span>
                        </div>
                        <div className="text-gray-400">|</div>
                        <div className="text-gray-600">{users.length} user{users.length !== 1 ? 's' : ''} online</div>
                    </div>
                </div>

                {/* Main content */}
                <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
                    {/* Game Grid */}
                    <div className="bg-white rounded-2xl shadow-xl p-6 relative">
                        <div 
                            className="relative bg-gradient-to-br from-gray-50 to-gray-100 border-4 border-gray-300 rounded-xl overflow-hidden cursor-pointer"
                            style={{ width: GRID_SIZE * CELL_SIZE, height: GRID_SIZE * CELL_SIZE }}
                            onClick={handleGridClick}
                            onTouchEnd={handleGridTouch}
                        >
                            {/* Grid lines */}
                            <svg className="absolute inset-0 pointer-events-none" style={{ width: GRID_SIZE * CELL_SIZE, height: GRID_SIZE * CELL_SIZE }}>
                                {[...Array(GRID_SIZE + 1)].map((_, i) => (
                                    <React.Fragment key={i}>
                                        <line x1={i * CELL_SIZE} y1="0" x2={i * CELL_SIZE} y2={GRID_SIZE * CELL_SIZE} stroke="#e5e7eb" strokeWidth="1" />
                                        <line x1="0" y1={i * CELL_SIZE} x2={GRID_SIZE * CELL_SIZE} y2={i * CELL_SIZE} stroke="#e5e7eb" strokeWidth="1" />
                                    </React.Fragment>
                                ))}
                            </svg>

                            {/* Render all users */}
                            {users.map(u => {
                                const isMe = u.email === user.email;
                                const pos = u.position || INIT_POS;
                                const imgSrc = `https://twod-room-voicechat.onrender.com/avatars/${['cat', 'dog', 'robot', 'alien'][u.avatar - 1]}.png`;
                                const inProx = proximity[u.socketId];
                                
                                return (
                                    <div 
                                        key={u.socketId}
                                        className={`absolute transition-all duration-200 ${isMe ? 'z-20' : 'z-10'}`}
                                        style={{
                                            left: pos.x * CELL_SIZE,
                                            top: pos.y * CELL_SIZE,
                                            width: CELL_SIZE,
                                            height: CELL_SIZE,
                                        }}
                                    >
                                        <div className="relative w-full h-full flex flex-col items-center justify-center">
                                            {/* Proximity glow */}
                                            {inProx && (
                                                <div className="absolute inset-0 bg-green-400 rounded-xl opacity-20 animate-pulse"></div>
                                            )}
                                            
                                            {/* Current user highlight */}
                                            {isMe && (
                                                <div className="absolute inset-0 bg-indigo-400 rounded-xl opacity-10 ring-2 ring-indigo-500"></div>
                                            )}
                                            
                                            {/* Avatar image */}
                                            <img 
                                                src={imgSrc} 
                                                alt={u.name} 
                                                className={`w-10 h-10 rounded-lg bg-white transition-all ${
                                                    isMe ? 'border-2 border-indigo-500 shadow-lg' : 'border border-gray-300 shadow-md'
                                                } ${inProx ? 'ring-2 ring-green-400' : ''}`}
                                            />
                                            
                                            {/* Name tag */}
                                            <div className={`text-xs font-medium mt-1 px-1 rounded ${
                                                isMe ? 'text-indigo-700' : 'text-gray-700'
                                            }`}>
                                                {u.name}
                                            </div>
                                            
                                            {/* Proximity indicator */}
                                            {inProx && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                                    <span className="text-xs text-green-600 font-medium">Voice</span>
                                                </div>
                                            )}
                                            
                                            {/* Audio element for voice chat */}
                                            {audioStreams[u.socketId] && (
                                                <audio autoPlay ref={el => { if (el) el.srcObject = audioStreams[u.socketId]; }} />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Controls */}
                        <div className="mt-4 flex items-center justify-center gap-4">
                            <button
                                onClick={toggleMic}
                                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                                    micEnabled 
                                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white' 
                                        : 'bg-red-500 hover:bg-red-600 text-white'
                                }`}
                            >
                                {micEnabled ? (
                                    <>
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                                        </svg>
                                        Mic On
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                                        </svg>
                                        Mic Off
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* User list sidebar */}
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-full lg:w-72">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                            </svg>
                            Users in Room
                        </h3>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {users.map(u => {
                                const isMe = u.email === user.email;
                                const inProx = proximity[u.socketId];
                                
                                return (
                                    <div 
                                        key={u.socketId} 
                                        className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                                            isMe 
                                                ? 'bg-indigo-50 border border-indigo-200' 
                                                : 'bg-gray-50 hover:bg-gray-100'
                                        }`}
                                    >
                                        <div className="relative">
                                            <img 
                                                src={`https://twod-room-voicechat.onrender.com/avatars/${['cat', 'dog', 'robot', 'alien'][u.avatar - 1]}.png`} 
                                                alt={u.name} 
                                                className={`w-10 h-10 rounded-lg ${
                                                    isMe ? 'ring-2 ring-indigo-500' : ''
                                                }`}
                                            />
                                            {inProx && (
                                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className={`font-medium truncate ${
                                                isMe ? 'text-indigo-900' : 'text-gray-900'
                                            }`}>
                                                {u.name} {isMe && <span className="text-xs text-indigo-600">(You)</span>}
                                            </div>
                                            {inProx && (
                                                <div className="text-xs text-green-600 flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                                    In voice range
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Instructions */}
                <div className="mt-6 bg-white rounded-xl shadow-md p-4 max-w-2xl mx-auto">
                    <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="text-sm text-gray-600">
                            <p className="font-medium text-gray-900 mb-1">How to play:</p>
                            <ul className="space-y-1">
                                <li>• Use <span className="font-semibold text-gray-900">arrow keys</span> or <span className="font-semibold text-gray-900">WASD</span> to move your avatar</li>
                                <li>• Click or tap on the grid to move instantly</li>
                                <li>• Get close to other users to start <span className="font-semibold text-green-600">voice chat</span></li>
                                <li>• Toggle your microphone using the button below the grid</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoomPage;