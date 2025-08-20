const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// 헬스체크용 경로 (Railway 헬스체크용)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Blackjack Game Server is running',
        timestamp: new Date().toISOString()
    });
});

// 게임 방 관리
const rooms = new Map();

// Socket.IO 연결 처리
io.on('connection', (socket) => {
    console.log(`사용자 연결: ${socket.id}`);

    // 방 생성
    socket.on('createRoom', (data) => {
        const { playerName } = data;
        const roomCode = generateRoomCode();
        
        const room = {
            id: roomCode,
            players: [{
                id: socket.id,
                name: playerName,
                isHost: true,
                cards: [],
                score: 0,
                bet: 0
            }],
            currentPlayerIndex: 0,
            gameState: 'waiting', // waiting, playing, finished
            deck: [],
            dealerCards: [],
            dealerScore: 0,
            currentBet: 0
        };

        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        
        console.log(`방 생성: ${roomCode} by ${playerName}`);
        socket.emit('roomCreated', { roomCode, room });
    });

    // 방 입장
    socket.on('joinRoom', (data) => {
        const { roomCode, playerName } = data;
        const room = rooms.get(roomCode);
        
        if (!room) {
            socket.emit('joinError', { message: '존재하지 않는 방입니다.' });
            return;
        }
        
        if (room.players.length >= 4) {
            socket.emit('joinError', { message: '방이 가득 찼습니다.' });
            return;
        }
        
        if (room.gameState === 'playing') {
            socket.emit('joinError', { message: '게임이 진행 중입니다.' });
            return;
        }
        
        // 플레이어 추가
        room.players.push({
            id: socket.id,
            name: playerName,
            isHost: false,
            cards: [],
            score: 0,
            bet: 0
        });
        
        socket.join(roomCode);
        socket.roomCode = roomCode;
        
        console.log(`${playerName}이 방 ${roomCode}에 입장`);
        
        // 모든 플레이어에게 방 정보 업데이트
        io.to(roomCode).emit('roomUpdated', { room });
    });

    // 게임 시작
    socket.on('startGame', () => {
        const roomCode = socket.roomCode;
        const room = rooms.get(roomCode);
        
        console.log(`게임 시작 요청: ${roomCode}, 플레이어 수: ${room?.players?.length}`);
        
        if (!room || room.players.length < 2) {
            console.log(`게임 시작 실패: 방이 없거나 플레이어 부족`);
            socket.emit('gameError', { message: '최소 2명의 플레이어가 필요합니다.' });
            return;
        }
        
        // 방장 권한 확인
        const requestingPlayer = room.players.find(p => p.id === socket.id);
        if (!requestingPlayer || !requestingPlayer.isHost) {
            console.log(`게임 시작 실패: 방장이 아닌 플레이어의 요청`);
            socket.emit('gameError', { message: '방장만 게임을 시작할 수 있습니다.' });
            return;
        }
        
        console.log(`방장 ${requestingPlayer.name}이 게임 시작 요청`);
        
        // 게임 초기화
        room.gameState = 'playing';
        room.deck = createDeck();
        room.dealerCards = [];
        room.dealerScore = 0;
        room.currentPlayerIndex = 0;
        
        console.log(`덱 생성 완료: ${room.deck.length}장의 카드`);
        
        // 모든 플레이어 초기화
        room.players.forEach(player => {
            player.cards = [];
            player.score = 0;
            player.bet = 0;
        });
        
        // 카드 배분
        dealInitialCards(room);
        
        // 첫 번째 플레이어 턴 시작
        room.currentPlayerIndex = 0;
        const currentPlayer = room.players[0];
        
        console.log(`게임 시작 완료: ${roomCode}`);
        console.log(`플레이어 카드:`, room.players.map(p => ({ name: p.name, cards: p.cards, score: p.score })));
        console.log(`딜러 카드:`, room.dealerCards);
        console.log(`현재 턴: ${currentPlayer.name} (${currentPlayer.id})`);
        
        // 게임 시작 이벤트와 함께 현재 턴 정보 전송 (강력한 이벤트)
        io.to(roomCode).emit('gameStarted', { 
            room, 
            currentPlayerId: currentPlayer.id,
            currentPlayerName: currentPlayer.name,
            message: `${currentPlayer.name}의 턴입니다!`,
            gameState: 'playing',
            forceUpdate: true  // 강제 업데이트 플래그
        });
        
        // 즉시 턴 업데이트 이벤트 전송
        io.to(roomCode).emit('turnUpdate', {
            currentPlayerId: currentPlayer.id,
            currentPlayerName: currentPlayer.name,
            message: `${currentPlayer.name}의 턴입니다!`,
            forceUpdate: true
        });
        
        // 게임 상태 강제 업데이트
        io.to(roomCode).emit('gameStateChanged', {
            gameState: 'playing',
            currentPlayerId: currentPlayer.id,
            currentPlayerName: currentPlayer.name,
            message: `게임이 시작되었습니다! ${currentPlayer.name}의 턴입니다!`
        });
    });

    // 베팅
    socket.on('placeBet', (data) => {
        const { amount } = data;
        const roomCode = socket.roomCode;
        const room = rooms.get(roomCode);
        
        if (!room || room.gameState !== 'playing') return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.bet = amount;
            room.currentBet = amount;
            
            io.to(roomCode).emit('betPlaced', { room, playerId: socket.id, amount });
        }
    });

    // Hit (카드 추가)
    socket.on('hit', () => {
        const roomCode = socket.roomCode;
        const room = rooms.get(roomCode);
        
        if (!room || room.gameState !== 'playing') return;
        
        const currentPlayer = room.players[room.currentPlayerIndex];
        if (currentPlayer.id !== socket.id) return;
        
        // 카드 뽑기
        const card = room.deck.pop();
        currentPlayer.cards.push(card);
        currentPlayer.score = calculateScore(currentPlayer.cards);
        
        if (currentPlayer.score > 21) {
            // 버스트
            nextTurn(room);
        } else if (currentPlayer.score === 21) {
            // 21점 도달
            nextTurn(room);
        }
        
        io.to(roomCode).emit('cardDrawn', { room, playerId: socket.id, card, score: currentPlayer.score });
    });

    // Stand (멈춤)
    socket.on('stand', () => {
        const roomCode = socket.roomCode;
        const room = rooms.get(roomCode);
        
        if (!room || room.gameState !== 'playing') return;
        
        const currentPlayer = room.players[room.currentPlayerIndex];
        if (currentPlayer.id !== socket.id) return;
        
        nextTurn(room);
        io.to(roomCode).emit('playerStood', { room, playerId: socket.id });
    });

    // Double (더블 다운)
    socket.on('double', () => {
        const roomCode = socket.roomCode;
        const room = rooms.get(roomCode);
        
        if (!room || room.gameState !== 'playing') return;
        
        const currentPlayer = room.players[room.currentPlayerIndex];
        if (currentPlayer.id !== socket.id) return;
        
        if (currentPlayer.cards.length === 2) {
            // 베팅 2배
            currentPlayer.bet *= 2;
            room.currentBet = currentPlayer.bet;
            
            // 카드 1장만 뽑기
            const card = room.deck.pop();
            currentPlayer.cards.push(card);
            currentPlayer.score = calculateScore(currentPlayer.cards);
            
            nextTurn(room);
            
            io.to(roomCode).emit('doubleDown', { room, playerId: socket.id, card, score: currentPlayer.score });
        }
    });

    // 연결 해제
    socket.on('disconnect', () => {
        console.log(`사용자 연결 해제: ${socket.id}`);
        
        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            if (room) {
                // 플레이어 제거
                room.players = room.players.filter(p => p.id !== socket.id);
                
                if (room.players.length === 0) {
                    // 방 삭제
                    rooms.delete(socket.roomCode);
                    console.log(`방 삭제: ${socket.roomCode}`);
                } else {
                    // 방장 변경
                    if (room.players.length > 0) {
                        room.players[0].isHost = true;
                    }
                    
                    // 게임 상태 리셋
                    if (room.gameState === 'playing') {
                        room.gameState = 'waiting';
                    }
                    
                    io.to(socket.roomCode).emit('roomUpdated', { room });
                }
            }
        }
    });
});

// 유틸리티 함수들
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value });
        }
    }
    
    // 셔플
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
}

function dealInitialCards(room) {
    // 각 플레이어에게 2장씩 카드 배분
    for (let i = 0; i < 2; i++) {
        for (let player of room.players) {
            const card = room.deck.pop();
            player.cards.push(card);
            player.score = calculateScore(player.cards);
        }
    }
    
    // 딜러에게 2장 배분
    for (let i = 0; i < 2; i++) {
        const card = room.deck.pop();
        room.dealerCards.push(card);
        room.dealerScore = calculateScore(room.dealerCards);
    }
}

function calculateScore(cards) {
    let score = 0;
    let aces = 0;
    
    for (let card of cards) {
        if (card.value === 'A') {
            aces += 1;
        } else if (['K', 'Q', 'J'].includes(card.value)) {
            score += 10;
        } else {
            score += parseInt(card.value);
        }
    }
    
    // 에이스 처리
    for (let i = 0; i < aces; i++) {
        if (score + 11 <= 21) {
            score += 11;
        } else {
            score += 1;
        }
    }
    
    return score;
}

function nextTurn(room) {
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    
    // 모든 플레이어가 턴을 마쳤는지 확인
    if (room.currentPlayerIndex === 0) {
        // 딜러 턴
        playDealerTurn(room);
        endGame(room);
    }
}

function playDealerTurn(room) {
    // 딜러가 17점 이상이 될 때까지 카드 뽑기
    while (room.dealerScore < 17) {
        const card = room.deck.pop();
        room.dealerCards.push(card);
        room.dealerScore = calculateScore(room.dealerCards);
    }
}

function endGame(room) {
    room.gameState = 'finished';
    
    // 승자 결정 및 상금 계산
    const results = room.players.map(player => {
        let result = 'lose';
        let winnings = 0;
        
        if (player.score > 21) {
            result = 'bust';
        } else if (room.dealerScore > 21) {
            result = 'win';
            winnings = player.bet * 2;
        } else if (player.score > room.dealerScore) {
            result = 'win';
            winnings = player.bet * 2;
        } else if (player.score === room.dealerScore) {
            result = 'tie';
            winnings = player.bet;
        }
        
        return {
            playerId: player.id,
            result,
            winnings,
            score: player.score,
            dealerScore: room.dealerScore
        };
    });
    
    io.to(room.id).emit('gameEnded', { room, results });
}

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`http://localhost:${PORT}`);
});
