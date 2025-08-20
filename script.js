// Socket.IO 기반 실시간 멀티플레이어 매니저
class RealTimeMultiplayerManager {
    constructor() {
        this.socket = null;
        this.roomCode = null;
        this.playerId = null;
        this.room = null;
        this.isConnected = false;
        this.isMyTurn = false;
        
        this.initializeSocket();
    }

    initializeSocket() {
        // Socket.IO 클라이언트 초기화
        this.socket = io();
        
        // 연결 이벤트
        this.socket.on('connect', () => {
            console.log('서버에 연결되었습니다.');
            this.isConnected = true;
            this.playerId = this.socket.id;
        });

        this.socket.on('disconnect', () => {
            console.log('서버 연결이 끊어졌습니다.');
            this.isConnected = false;
        });

        // 방 생성 성공
        this.socket.on('roomCreated', (data) => {
            this.roomCode = data.roomCode;
            this.room = data.room;
            this.updateRoomDisplay();
            this.showModal('방 생성 완료', `방 코드: ${this.roomCode}\n친구에게 이 코드를 알려주세요!`);
        });

        // 방 입장 성공
        this.socket.on('roomUpdated', (data) => {
            this.room = data.room;
            this.updateRoomDisplay();
        });

        // 방 입장 실패
        this.socket.on('joinError', (data) => {
            this.showModal('입장 실패', data.message);
        });

        // 게임 시작
        this.socket.on('gameStarted', (data) => {
            console.log('게임 시작 이벤트 수신:', data);
            this.room = data.room;
            this.startRealTimeGame(data);
        });
        
        // 턴 업데이트
        this.socket.on('turnUpdate', (data) => {
            console.log('턴 업데이트 이벤트 수신:', data);
            this.handleTurnUpdate(data);
        });
        
        // 게임 상태 변경
        this.socket.on('gameStateChanged', (data) => {
            console.log('게임 상태 변경 이벤트 수신:', data);
            this.handleGameStateChange(data);
        });

        // 게임 에러
        this.socket.on('gameError', (data) => {
            this.showModal('게임 에러', data.message);
        });

        // 베팅 완료
        this.socket.on('betPlaced', (data) => {
            console.log('베팅 완료 이벤트:', data);
            this.room = data.room;
            this.updateRoomDisplay();
            this.showBettingInfo(data);
        });
        
        // 베팅 에러
        this.socket.on('betError', (data) => {
            this.showModal('베팅 오류', data.message);
        });
        
        // 모든 플레이어 베팅 완료
        this.socket.on('allPlayersBet', (data) => {
            console.log('모든 플레이어 베팅 완료:', data);
            this.room = data.room;
            this.updateRoomDisplay();
            this.showModal('베팅 완료', data.message);
        });
        
        // 베팅 미완료 (방장은 바로 강제 시작 가능)
        this.socket.on('bettingIncomplete', (data) => {
            console.log('베팅 미완료:', data);
            if (data.canForceStart && this.isHost()) {
                // 방장은 바로 강제 시작
                this.forceStartGame();
            } else {
                this.showModal('베팅 미완료', data.message);
            }
        });

        // 카드 뽑기
        this.socket.on('cardDrawn', (data) => {
            this.room = data.room;
            this.updateGameDisplay();
        });

        // 플레이어 Stand
        this.socket.on('playerStood', (data) => {
            this.room = data.room;
            this.updateGameDisplay();
        });

        // 더블 다운
        this.socket.on('doubleDown', (data) => {
            this.room = data.room;
            this.updateGameDisplay();
        });

        // 게임 종료
        this.socket.on('gameEnded', (data) => {
            this.room = data.room;
            this.showGameResults(data.results);
        });
    }

    createRoom(playerName) {
        if (!this.isConnected) {
            this.showModal('연결 오류', '서버에 연결되지 않았습니다.');
            return;
        }
        
        this.socket.emit('createRoom', { playerName });
    }

    joinRoom(roomCode, playerName) {
        if (!this.isConnected) {
            this.showModal('연결 오류', '서버에 연결되지 않았습니다.');
            return;
        }
        
        this.socket.emit('joinRoom', { roomCode, playerName });
    }

    startGame() {
        if (!this.room || !this.room.players.find(p => p.id === this.playerId)?.isHost) {
            this.showModal('권한 없음', '방장만 게임을 시작할 수 있습니다.');
            return;
        }
        
        // 방장이 게임 시작 버튼을 누르면 바로 강제 시작
        console.log('방장이 게임 시작 요청 - 강제 시작');
        this.socket.emit('forceStartGame');
    }

    placeBet(amount) {
        if (!this.room || this.room.gameState !== 'playing') return;
        
        this.socket.emit('placeBet', { amount });
    }

    hit() {
        if (!this.room || this.room.gameState !== 'playing') return;
        
        const currentPlayer = this.room.players[this.room.currentPlayerIndex];
        if (currentPlayer.id !== this.playerId) {
            // 턴 대기 메시지 제거 - 조용히 무시
            return;
        }
        
        this.socket.emit('hit');
    }

    stand() {
        if (!this.room || this.room.gameState !== 'playing') return;
        
        const currentPlayer = this.room.players[this.room.currentPlayerIndex];
        if (currentPlayer.id !== this.playerId) {
            // 턴 대기 메시지 제거 - 조용히 무시
            return;
        }
        
        this.socket.emit('stand');
    }

    double() {
        if (!this.room || this.room.gameState !== 'playing') return;
        
        const currentPlayer = this.room.players[this.room.currentPlayerIndex];
        if (currentPlayer.id !== this.playerId) {
            // 턴 대기 메시지 제거 - 조용히 무시
            return;
        }
        
        this.socket.emit('double');
    }

    updateRoomDisplay() {
        const playerList = document.getElementById('player-list');
        const currentPlayer = document.getElementById('current-player');
        
        if (playerList && currentPlayer && this.room) {
            playerList.innerHTML = '';
            this.room.players.forEach((player, index) => {
                const playerItem = document.createElement('div');
                playerItem.className = `player-item ${index === this.room.currentPlayerIndex ? 'active' : ''}`;
                playerItem.textContent = `${player.name} (${player.isHost ? '방장' : '플레이어'})`;
                playerList.appendChild(playerItem);
            });
            
            const currentPlayerObj = this.room.players[this.room.currentPlayerIndex];
            currentPlayer.textContent = `현재 플레이어: ${currentPlayerObj?.name || '대기중'}`;
        }
    }

    updateGameDisplay() {
        if (!this.room) return;
        
        // 게임 상태에 따라 UI 업데이트
        this.updateRoomDisplay();
        this.updateGameControls();
    }

    updateGameControls() {
        if (!this.room) return;
        
        const currentPlayer = this.room.players[this.room.currentPlayerIndex];
        this.isMyTurn = currentPlayer.id === this.playerId;
        
        // 게임 컨트롤 활성화/비활성화
        const hitBtn = document.getElementById('hit-btn');
        const standBtn = document.getElementById('stand-btn');
        const doubleBtn = document.getElementById('double-btn');
        
        if (hitBtn) hitBtn.disabled = !this.isMyTurn;
        if (standBtn) standBtn.disabled = !this.isMyTurn;
        if (doubleBtn) standBtn.disabled = !this.isMyTurn || this.room.players.length !== 2;
    }

    startRealTimeGame(data) {
        console.log('실시간 게임 시작:', data);
        
        // 게임 상태 업데이트
        this.room = data.room;
        this.isMyTurn = (data.currentPlayerId === this.playerId);
        
        // UI 업데이트
        this.updateGameDisplay();
        
        // 턴 정보 표시
        if (this.isMyTurn) {
            this.showModal('게임 시작', `${data.currentPlayerName}의 턴입니다! (당신의 턴)`);
        } else {
            this.showModal('게임 시작', `${data.currentPlayerName}의 턴입니다!`);
        }
        
        // 게임 진행 상태 업데이트
        this.updateGameProgress();
    }
    
    handleTurnUpdate(data) {
        console.log('턴 업데이트 처리:', data);
        
        // 현재 턴 플레이어 확인
        this.isMyTurn = (data.currentPlayerId === this.playerId);
        
        // 턴 정보 업데이트
        this.updateTurnDisplay(data);
        
        // 게임 진행 상태 업데이트
        this.updateGameProgress();
    }
    
    handleGameStateChange(data) {
        console.log('게임 상태 변경 처리:', data);
        
        // 게임 상태 업데이트
        if (data.gameState === 'playing') {
            this.room.gameState = 'playing';
            this.isMyTurn = (data.currentPlayerId === this.playerId);
            
            // UI 완전 새로고침
            this.updateGameDisplay();
            this.updateTurnDisplay(data);
            this.updateGameProgress();
        }
    }
    
    updateTurnDisplay(data) {
        // 턴 표시 업데이트
        const turnInfo = document.getElementById('turnInfo');
        if (turnInfo) {
            if (this.isMyTurn) {
                turnInfo.textContent = `당신의 턴입니다!`;
                turnInfo.className = 'turn-info my-turn';
            } else {
                turnInfo.textContent = `${data.currentPlayerName}의 턴입니다!`;
                turnInfo.className = 'turn-info other-turn';
            }
        }
    }
    
    updateGameProgress() {
        // 게임 진행 상태 업데이트
        const gameStatus = document.getElementById('gameStatus');
        if (gameStatus) {
            if (this.room.gameState === 'playing') {
                gameStatus.textContent = '게임 진행 중';
                gameStatus.className = 'game-status playing';
            } else if (this.room.gameState === 'readyToStart') {
                gameStatus.textContent = '게임 시작 준비 완료';
                gameStatus.className = 'game-status ready';
            } else {
                gameStatus.textContent = '대기 중';
                gameStatus.className = 'game-status waiting';
            }
        }
    }
    
    showBettingInfo(data) {
        // 베팅 정보 표시
        const bettingInfo = document.getElementById('bettingInfo');
        if (bettingInfo) {
            bettingInfo.innerHTML = `
                <div class="betting-notification">
                    <strong>${data.playerName}</strong>님이 <strong>${data.amount}</strong> 베팅했습니다.
                </div>
            `;
            
            // 3초 후 자동으로 숨기기
            setTimeout(() => {
                bettingInfo.innerHTML = '';
            }, 3000);
        }
    }
    
    // 베팅 UI 표시/숨기기
    toggleBettingUI(show) {
        const bettingSection = document.getElementById('bettingSection');
        if (bettingSection) {
            bettingSection.style.display = show ? 'block' : 'none';
        }
    }
    
    // 방장 여부 확인
    isHost() {
        if (!this.room || !this.playerId) return false;
        const player = this.room.players.find(p => p.id === this.playerId);
        return player && player.isHost;
    }
    
    // 강제 게임 시작 옵션 표시 (더 이상 사용하지 않음)
    showForceStartOption(data) {
        // 방장은 바로 강제 시작하므로 이 함수는 사용하지 않음
        this.forceStartGame();
    }
    
    // 강제 게임 시작
    forceStartGame() {
        if (!this.isHost()) {
            this.showModal('권한 없음', '방장만 강제로 게임을 시작할 수 있습니다.');
            return;
        }
        
        this.socket.emit('forceStartGame');
    }

    showGameResults(data) {
        const { results, gameStats } = data;
        
        let resultText = '🎮 게임 결과 🎮\n\n';
        
        // 각 플레이어 결과
        results.forEach(result => {
            const emoji = result.result === 'win' ? '🎉' : 
                         result.result === 'tie' ? '🤝' : '💔';
            resultText += `${emoji} ${result.playerName}: ${result.result.toUpperCase()}\n`;
            resultText += `   점수: ${result.score} vs 딜러 ${result.dealerScore}\n`;
            resultText += `   베팅: ${result.bet}, 상금: ${result.winnings}\n`;
            resultText += `   사유: ${result.reason}\n\n`;
        });
        
        // 게임 통계
        if (gameStats) {
            resultText += `📊 게임 통계 📊\n`;
            resultText += `총 베팅: ${gameStats.totalBets}\n`;
            resultText += `총 상금: ${gameStats.totalWinnings}\n`;
            resultText += `딜러 최종 점수: ${gameStats.dealerScore}\n`;
        }
        
        this.showModal('게임 종료', resultText);
        
        // 게임 결과를 화면에 표시
        this.displayGameResults(data);
    }
    
    displayGameResults(data) {
        const resultsContainer = document.getElementById('gameResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="game-results">
                    <h3>🎮 게임 결과</h3>
                    ${data.results.map(result => `
                        <div class="player-result ${result.result}">
                            <div class="player-name">${result.playerName}</div>
                            <div class="result-details">
                                <span class="result">${result.result.toUpperCase()}</span>
                                <span class="score">${result.score} vs ${result.dealerScore}</span>
                                <span class="betting">베팅: ${result.bet} | 상금: ${result.winnings}</span>
                                <span class="reason">${result.reason}</span>
                            </div>
                        </div>
                    `).join('')}
                    ${data.gameStats ? `
                        <div class="game-stats">
                            <h4>📊 게임 통계</h4>
                            <p>총 베팅: ${data.gameStats.totalBets}</p>
                            <p>총 상금: ${data.gameStats.totalWinnings}</p>
                            <p>딜러 점수: ${data.gameStats.dealerScore}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        }
    }

    showModal(title, message) {
        // 기존 모달 표시 로직 사용
        if (window.blackjackGame && window.blackjackGame.showModal) {
            window.blackjackGame.showModal(title, message);
        } else {
            alert(`${title}\n${message}`);
        }
    }

    isInRoom() {
        return this.room !== null;
    }

    getCurrentPlayer() {
        if (!this.room) return null;
        return this.room.players.find(p => p.id === this.playerId);
    }
}

// 기존 멀티플레이어 매니저를 실시간 버전으로 교체
class MultiplayerManager extends RealTimeMultiplayerManager {
    // 기존 인터페이스 호환성을 위한 래퍼
}

// 블랙잭 게임 클래스
class BlackjackGame {
    constructor() {
        this.deck = [];
        this.dealerCards = [];
        this.playerCards = [];
        this.dealerScore = 0;
        this.playerScore = 0;
        this.betAmount = 1000;
        this.balance = 10000;
        this.gameInProgress = false;
        this.gameHistory = [];
        this.multiplayer = new MultiplayerManager();
        this.isMultiplayerMode = false;
        this.settings = {
            startingBalance: 10000,
            minBet: 100,
            maxBet: 10000,
            soundEnabled: true,
            soundVolume: 50,
            cardAnimation: true,
            autoSave: true
        };
        
        this.initializeGame();
        this.loadSettings();
        this.loadHistory();
        this.setupEventListeners();
        this.updateUI();
    }

    // 게임 초기화
    initializeGame() {
        this.createDeck();
        this.shuffleDeck();
    }

    // 덱 생성
    createDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        
        this.deck = [];
        for (let suit of suits) {
            for (let value of values) {
                this.deck.push({ suit, value });
            }
        }
    }

    // 덱 셔플
    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    // 카드 뽑기
    drawCard() {
        if (this.deck.length === 0) {
            this.createDeck();
            this.shuffleDeck();
        }
        return this.deck.pop();
    }

    // 카드 값 계산
    calculateScore(cards) {
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

    // 게임 시작
    async startGame() {
        if (this.betAmount > this.balance) {
            this.showModal('잔액이 부족합니다!', '베팅 금액을 줄이거나 잔액을 충전해주세요.');
            return;
        }

        // 멀티플레이어 모드 체크
        if (this.isMultiplayerMode && !this.multiplayer.isMyTurn) {
            this.showModal('턴 대기', '다른 플레이어의 턴을 기다려주세요.');
            return;
        }

        this.gameInProgress = true;
        this.dealerCards = [];
        this.playerCards = [];
        this.dealerScore = 0;
        this.playerScore = 0;

        this.updateGameStatus('카드를 배분하고 있습니다...');
        
        // 카드 배분 애니메이션
        await this.dealCardsWithAnimation();

        this.playerScore = this.calculateScore(this.playerCards);
        this.dealerScore = this.calculateScore(this.dealerCards);

        // 블랙잭 체크
        if (this.playerScore === 21) {
            this.endGame('blackjack');
            return;
        }

        this.updateUI();
        this.updateGameStatus('게임이 시작되었습니다! Hit, Stand, 또는 Double을 선택하세요.');
        this.enableGameControls();
    }

    // 카드 배분 애니메이션
    async dealCardsWithAnimation() {
        // 딜러 첫 번째 카드
        this.dealerCards.push(this.drawCard());
        this.updateUI();
        await this.sleep(300);

        // 플레이어 첫 번째 카드
        this.playerCards.push(this.drawCard());
        this.updateUI();
        await this.sleep(300);

        // 딜러 두 번째 카드
        this.dealerCards.push(this.drawCard());
        this.updateUI();
        await this.sleep(300);

        // 플레이어 두 번째 카드
        this.playerCards.push(this.drawCard());
        this.updateUI();
        await this.sleep(300);
    }

    // 지연 함수
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Hit (카드 추가)
    async hit() {
        if (!this.gameInProgress) return;

        this.updateGameStatus('카드를 뽑고 있습니다...');
        
        // 카드 뽑기 애니메이션
        await this.sleep(200);
        this.playerCards.push(this.drawCard());
        this.playerScore = this.calculateScore(this.playerCards);

        if (this.playerScore > 21) {
            this.endGame('bust');
        } else if (this.playerScore === 21) {
            this.stand();
        } else {
            this.updateUI();
            this.updateGameStatus(`카드를 뽑았습니다. 현재 점수: ${this.playerScore}`);
        }
    }

    // Stand (멈춤)
    stand() {
        if (!this.gameInProgress) return;

        this.updateGameStatus('딜러가 카드를 뽑고 있습니다...');
        
        // 딜러가 17점 이상이 될 때까지 카드 뽑기
        while (this.dealerScore < 17) {
            this.dealerCards.push(this.drawCard());
            this.dealerScore = this.calculateScore(this.dealerCards);
        }

        this.updateUI();
        this.determineWinner();
    }

    // Double (더블 다운)
    double() {
        if (!this.gameInProgress || this.playerCards.length !== 2) return;
        if (this.betAmount * 2 > this.balance) {
            this.showModal('잔액 부족', '더블 다운을 위한 잔액이 부족합니다.');
            return;
        }

        this.betAmount *= 2;
        this.hit();
        if (this.gameInProgress) {
            this.stand();
        }
    }

    // 승자 결정
    determineWinner() {
        let result;
        let message;

        if (this.dealerScore > 21) {
            result = 'win';
            message = '딜러 버스트! 플레이어 승리!';
        } else if (this.playerScore > this.dealerScore) {
            result = 'win';
            message = '플레이어 승리!';
        } else if (this.playerScore < this.dealerScore) {
            result = 'lose';
            message = '딜러 승리!';
        } else {
            result = 'tie';
            message = '무승부!';
        }

        this.endGame(result, message);
    }

    // 게임 종료
    endGame(result, message = '') {
        this.gameInProgress = false;
        
        let finalMessage = message;
        let winnings = 0;

        switch (result) {
            case 'blackjack':
                winnings = Math.floor(this.betAmount * 2.5);
                finalMessage = '블랙잭! 2.5배 상금!';
                break;
            case 'win':
                winnings = this.betAmount * 2;
                finalMessage = message || '플레이어 승리!';
                break;
            case 'lose':
            case 'bust':
                winnings = 0;
                finalMessage = message || '플레이어 패배!';
                break;
            case 'tie':
                winnings = this.betAmount;
                finalMessage = '무승부! 베팅 금액 반환';
                break;
        }

        this.balance += winnings - this.betAmount;
        this.betAmount = Math.min(1000, this.balance);

        // 게임 기록 저장
        this.saveGameHistory(result, winnings - this.betAmount);

        this.updateUI();
        this.updateGameStatus(finalMessage);
        this.showGameResult(result, finalMessage);
        this.disableGameControls();
        this.saveGame();

        // 멀티플레이어 모드에서 다음 턴으로
        if (this.isMultiplayerMode && this.multiplayer.players.length > 1) {
            setTimeout(() => {
                this.multiplayer.nextTurn();
                this.updateGameStatus(`${this.multiplayer.getCurrentPlayer().name}의 턴입니다!`);
                this.resetForNextTurn();
            }, 2000);
        }
    }

    // 게임 결과 표시
    showGameResult(result, message) {
        const gameResult = document.getElementById('game-result');
        gameResult.textContent = message;
        gameResult.className = `game-result ${result}`;
        gameResult.style.display = 'block';

        // 3초 후 결과 숨기기
        setTimeout(() => {
            gameResult.style.display = 'none';
        }, 3000);
    }

    // UI 업데이트
    updateUI() {
        this.updateBalance();
        this.updateCards();
        this.updateScores();
        this.updateBetAmount();
    }

    // 잔액 업데이트
    updateBalance() {
        document.getElementById('balance').textContent = `₩${this.balance.toLocaleString()}`;
    }

    // 카드 업데이트
    updateCards() {
        // 딜러 카드
        const dealerCards = document.getElementById('dealer-cards');
        dealerCards.innerHTML = '';
        
        this.dealerCards.forEach((card, index) => {
            const cardElement = this.createCardElement(card, index === 0 && this.gameInProgress);
            dealerCards.appendChild(cardElement);
        });

        // 플레이어 카드
        const playerCards = document.getElementById('player-cards');
        playerCards.innerHTML = '';
        
        this.playerCards.forEach(card => {
            const cardElement = this.createCardElement(card, false);
            playerCards.appendChild(cardElement);
        });
    }

    // 카드 요소 생성
    createCardElement(card, isHidden) {
        const cardElement = document.createElement('div');
        cardElement.className = `card ${card.suit}`;
        
        // 카드 데이터 속성 설정
        cardElement.setAttribute('data-value', card.value);
        cardElement.setAttribute('data-suit', this.getSuitSymbol(card.suit));
        
        if (isHidden) {
            cardElement.className = 'card back';
        } else {
            // 카드 중앙에 큰 값 표시
            const centerValue = document.createElement('div');
            centerValue.className = 'card-center-value';
            centerValue.textContent = card.value;
                           centerValue.style.cssText = `
                   font-size: 1.5rem;
                   font-weight: 700;
                   color: ${['hearts', 'diamonds'].includes(card.suit) ? '#e74c3c' : '#2c3e50'};
               `;
            cardElement.appendChild(centerValue);
        }

        return cardElement;
    }

    // 무늬 심볼 반환
    getSuitSymbol(suit) {
        const symbols = {
            'hearts': '♥',
            'diamonds': '♦',
            'clubs': '♣',
            'spades': '♠'
        };
        return symbols[suit] || '♠';
    }

    // 점수 업데이트
    updateScores() {
        document.getElementById('player-score').textContent = `점수: ${this.playerScore}`;
        
        if (this.gameInProgress) {
            document.getElementById('dealer-score').textContent = `점수: ${this.dealerCards[0] ? this.calculateScore([this.dealerCards[0]]) : 0}`;
        } else {
            document.getElementById('dealer-score').textContent = `점수: ${this.dealerScore}`;
        }
    }

    // 베팅 금액 업데이트
    updateBetAmount() {
        document.getElementById('bet-amount').value = this.betAmount;
        // 테이블의 베팅 금액 표시도 업데이트
        const betDisplay = document.getElementById('bet-amount-display');
        if (betDisplay) {
            betDisplay.textContent = `₩${this.betAmount.toLocaleString()}`;
        }
        // 오른쪽 패널의 현재 베팅 정보도 업데이트
        const currentBet = document.getElementById('current-bet');
        if (currentBet) {
            currentBet.textContent = `₩${this.betAmount.toLocaleString()}`;
        }
    }

    // 게임 상태 업데이트
    updateGameStatus(message) {
        const gameStatus = document.getElementById('game-status');
        gameStatus.innerHTML = `<h2>${message}</h2>`;
        
        // 오른쪽 패널의 게임 상태 정보도 업데이트
        const gameState = document.getElementById('game-state');
        if (gameState) {
            if (this.gameInProgress) {
                gameState.textContent = '진행중';
                gameState.style.color = '#e74c3c';
            } else {
                gameState.textContent = '대기중';
                gameState.style.color = '#27ae60';
            }
        }
    }

    // 게임 컨트롤 활성화/비활성화
    enableGameControls() {
        document.getElementById('start-btn').disabled = true;
        document.getElementById('hit-btn').disabled = false;
        document.getElementById('stand-btn').disabled = false;
        document.getElementById('double-btn').disabled = this.playerCards.length !== 2;
    }

    disableGameControls() {
        document.getElementById('start-btn').disabled = false;
        document.getElementById('hit-btn').disabled = true;
        document.getElementById('stand-btn').disabled = true;
        document.getElementById('double-btn').disabled = true;
    }

    // 게임 기록 저장
    saveGameHistory(result, profit) {
        const gameRecord = {
            date: new Date().toLocaleString('ko-KR'),
            result: result,
            bet: this.betAmount,
            profit: profit,
            playerScore: this.playerScore,
            dealerScore: this.dealerScore
        };

        this.gameHistory.unshift(gameRecord);
        
        // 최근 50개 기록만 유지
        if (this.gameHistory.length > 50) {
            this.gameHistory = this.gameHistory.slice(0, 50);
        }

        this.updateHistoryUI();
        this.saveGame();
    }

    // 기록 UI 업데이트
    updateHistoryUI() {
        // 통계 업데이트
        const totalGames = this.gameHistory.length;
        const wins = this.gameHistory.filter(record => record.result === 'win' || record.result === 'blackjack').length;
        const losses = this.gameHistory.filter(record => record.result === 'lose' || record.result === 'bust').length;
        const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

        document.getElementById('total-games').textContent = totalGames;
        document.getElementById('wins').textContent = wins;
        document.getElementById('losses').textContent = losses;
        document.getElementById('win-rate').textContent = `${winRate}%`;

        // 기록 목록 업데이트
        const historyItems = document.getElementById('history-items');
        historyItems.innerHTML = '';

        this.gameHistory.forEach(record => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            const resultText = {
                'win': '승리',
                'lose': '패배',
                'tie': '무승부',
                'bust': '버스트',
                'blackjack': '블랙잭'
            };

            historyItem.innerHTML = `
                <span>${record.date}</span>
                <span>${resultText[record.result] || record.result}</span>
                <span>₩${record.bet.toLocaleString()}</span>
                <span>${record.profit >= 0 ? '+' : ''}₩${record.profit.toLocaleString()}</span>
                <span>${record.playerScore} vs ${record.dealerScore}</span>
            `;

            historyItems.appendChild(historyItem);
        });
    }

    // 설정 저장
    saveSettings() {
        this.settings.startingBalance = parseInt(document.getElementById('starting-balance').value);
        this.settings.minBet = parseInt(document.getElementById('min-bet').value);
        this.settings.maxBet = parseInt(document.getElementById('max-bet').value);
        this.settings.soundEnabled = document.getElementById('sound-enabled').checked;
        this.settings.soundVolume = parseInt(document.getElementById('sound-volume').value);
        this.settings.cardAnimation = document.getElementById('card-animation').checked;
        this.settings.autoSave = document.getElementById('auto-save').checked;

        localStorage.setItem('blackjackSettings', JSON.stringify(this.settings));
        this.showModal('설정 저장', '설정이 저장되었습니다.');
    }

    // 설정 로드
    loadSettings() {
        const savedSettings = localStorage.getItem('blackjackSettings');
        if (savedSettings) {
            this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
        }

        // UI에 설정 값 적용
        document.getElementById('starting-balance').value = this.settings.startingBalance;
        document.getElementById('min-bet').value = this.settings.minBet;
        document.getElementById('max-bet').value = this.settings.maxBet;
        document.getElementById('sound-enabled').checked = this.settings.soundEnabled;
        document.getElementById('sound-volume').value = this.settings.soundVolume;
        document.getElementById('card-animation').checked = this.settings.cardAnimation;
        document.getElementById('auto-save').checked = this.settings.autoSave;

        // 베팅 제한 적용
        document.getElementById('bet-amount').min = this.settings.minBet;
        document.getElementById('bet-amount').max = this.settings.maxBet;
    }

    // 게임 데이터 저장
    saveGame() {
        if (this.settings.autoSave) {
            const gameData = {
                balance: this.balance,
                gameHistory: this.gameHistory,
                settings: this.settings
            };
            localStorage.setItem('blackjackGameData', JSON.stringify(gameData));
        }
    }

    // 게임 데이터 로드
    loadGame() {
        const savedData = localStorage.getItem('blackjackGameData');
        if (savedData) {
            const gameData = JSON.parse(savedData);
            this.balance = gameData.balance || this.settings.startingBalance;
            this.gameHistory = gameData.gameHistory || [];
            if (gameData.settings) {
                this.settings = { ...this.settings, ...gameData.settings };
            }
        }
    }

    // 기록 로드
    loadHistory() {
        this.loadGame();
        this.updateHistoryUI();
    }

    // 기록 초기화
    clearHistory() {
        if (confirm('모든 게임 기록을 삭제하시겠습니까?')) {
            this.gameHistory = [];
            this.updateHistoryUI();
            this.saveGame();
            this.showModal('기록 초기화', '모든 게임 기록이 삭제되었습니다.');
        }
    }

    // 기록 내보내기
    exportHistory() {
        const csvContent = this.convertToCSV();
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `blackjack_history_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // CSV 변환
    convertToCSV() {
        const headers = ['날짜', '결과', '베팅', '수익', '플레이어점수', '딜러점수'];
        const rows = this.gameHistory.map(record => [
            record.date,
            record.result,
            record.bet,
            record.profit,
            record.playerScore,
            record.dealerScore
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    // 모달 표시
    showModal(title, message) {
        const modal = document.getElementById('modal');
        const modalBody = document.getElementById('modal-body');
        
        modalBody.innerHTML = `
            <h3>${title}</h3>
            <p>${message}</p>
        `;
        
        modal.style.display = 'block';
    }

    // 이벤트 리스너 설정
    setupEventListeners() {
        // 탭 전환
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        // 게임 컨트롤
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('hit-btn').addEventListener('click', () => this.hit());
        document.getElementById('stand-btn').addEventListener('click', () => this.stand());
        document.getElementById('double-btn').addEventListener('click', () => this.double());

        // 베팅 컨트롤
        document.getElementById('bet-amount').addEventListener('input', (e) => {
            this.betAmount = parseInt(e.target.value) || 0;
        });

        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.betAmount = parseInt(btn.dataset.amount);
                this.updateBetAmount();
            });
        });

        // 설정
        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());
        document.getElementById('reset-settings').addEventListener('click', () => this.resetSettings());

        // 멀티플레이어 컨트롤
        document.getElementById('create-room-btn').addEventListener('click', () => this.createMultiplayerRoom());
        document.getElementById('join-room-btn').addEventListener('click', () => this.joinMultiplayerRoom());
        document.getElementById('invite-friend-btn').addEventListener('click', () => this.inviteFriend());

        // 기록
        document.getElementById('clear-history').addEventListener('click', () => this.clearHistory());
        document.getElementById('export-history').addEventListener('click', () => this.exportHistory());

        // 모달 닫기
        document.querySelector('.close').addEventListener('click', () => {
            document.getElementById('modal').style.display = 'none';
        });

        window.addEventListener('click', (e) => {
            const modal = document.getElementById('modal');
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // 탭 전환
    switchTab(tabName) {
        // 모든 탭 비활성화
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        // 선택된 탭 활성화
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName).classList.add('active');
    }

    // 멀티플레이어 방 생성
    createMultiplayerRoom() {
        const playerName = prompt('플레이어 이름을 입력하세요:', '플레이어1');
        if (playerName) {
            this.multiplayer.createRoom(playerName);
            this.isMultiplayerMode = true;
            this.showMultiplayerStatus();
            this.updateMultiplayerControls();
        }
    }

    // 멀티플레이어 방 입장
    joinMultiplayerRoom() {
        const roomCode = prompt('방 코드를 입력하세요:');
        const playerName = prompt('플레이어 이름을 입력하세요:', '플레이어2');
        
        if (roomCode && playerName) {
            this.multiplayer.joinRoom(roomCode, playerName);
            this.isMultiplayerMode = true;
            this.showMultiplayerStatus();
            this.updateMultiplayerControls();
        }
    }

    // 친구 초대
    inviteFriend() {
        const roomCode = this.multiplayer.roomCode;
        const shareText = `블랙잭 게임에 초대합니다!\n방 코드: ${roomCode}\nURL: ${window.location.href}`;
        
        if (navigator.share) {
            navigator.share({
                title: '블랙잭 게임 초대',
                text: shareText
            });
        } else {
            navigator.clipboard.writeText(shareText).then(() => {
                this.showModal('초대 링크 복사', '초대 링크가 클립보드에 복사되었습니다!');
            });
        }
    }

    // 멀티플레이어 상태 표시
    showMultiplayerStatus() {
        const multiplayerStatus = document.getElementById('multiplayer-status');
        if (multiplayerStatus) {
            multiplayerStatus.style.display = 'block';
        }
    }

    // 멀티플레이어 컨트롤 업데이트
    updateMultiplayerControls() {
        const createRoomBtn = document.getElementById('create-room-btn');
        const joinRoomBtn = document.getElementById('join-room-btn');
        const inviteFriendBtn = document.getElementById('invite-friend-btn');
        
        if (this.isMultiplayerMode) {
            createRoomBtn.style.display = 'none';
            joinRoomBtn.style.display = 'none';
            inviteFriendBtn.style.display = 'inline-flex';
        } else {
            createRoomBtn.style.display = 'inline-flex';
            joinRoomBtn.style.display = 'inline-flex';
            inviteFriendBtn.style.display = 'none';
        }
    }

    // 다음 턴을 위한 리셋
    resetForNextTurn() {
        this.dealerCards = [];
        this.playerCards = [];
        this.dealerScore = 0;
        this.playerScore = 0;
        this.gameInProgress = false;
        this.updateUI();
        this.disableGameControls();
    }

    // 설정 초기화
    resetSettings() {
        if (confirm('모든 설정을 기본값으로 되돌리시겠습니까?')) {
            this.settings = {
                startingBalance: 10000,
                minBet: 100,
                maxBet: 10000,
                soundEnabled: true,
                soundVolume: 50,
                cardAnimation: true,
                autoSave: true
            };
            this.loadSettings();
            this.showModal('설정 초기화', '모든 설정이 기본값으로 되돌아갔습니다.');
        }
    }
}

// 게임 시작
document.addEventListener('DOMContentLoaded', () => {
    window.blackjackGame = new BlackjackGame();
});
