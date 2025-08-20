# 🚀 Railway 배포 가이드

## 📋 **사전 준비사항**

### 1. **GitHub 계정**
- GitHub 계정이 필요합니다
- 프로젝트를 GitHub 저장소에 업로드해야 합니다

### 2. **Railway 계정**
- [Railway.app](https://railway.app)에서 계정 생성
- GitHub 계정으로 로그인 권장

## 🚀 **배포 단계**

### **1단계: GitHub에 코드 업로드**

```bash
# 프로젝트 폴더에서
git init
git add .
git commit -m "Initial commit: Blackjack multiplayer game"
git branch -M main
git remote add origin https://github.com/yourusername/blackjack-game.git
git push -u origin main
```

### **2단계: Railway에서 새 프로젝트 생성**

1. **Railway 대시보드** 접속
2. **"New Project"** 클릭
3. **"Deploy from GitHub repo"** 선택
4. **GitHub 저장소** 선택
5. **프로젝트 이름** 입력 (예: `blackjack-game`)

### **3단계: 배포 설정**

1. **Root Directory** 설정
   - `server` 폴더를 루트로 설정
   - 또는 프로젝트 루트에서 `server` 폴더 내용을 메인으로 이동

2. **Environment Variables** 설정 (필요시)
   - `PORT`: Railway가 자동으로 설정
   - `NODE_ENV`: `production`

### **4단계: 배포 실행**

1. **"Deploy Now"** 클릭
2. **빌드 로그** 확인
3. **배포 완료** 대기

## 🔧 **배포 후 설정**

### **1. 도메인 확인**
- Railway가 자동으로 도메인 생성
- 예: `https://blackjack-game-production-1234.up.railway.app`

### **2. 프론트엔드 URL 업데이트**
- `script.js`에서 Socket.IO 연결 URL 업데이트
- 또는 환경변수로 설정

### **3. 테스트**
- 방 생성/입장 테스트
- 실시간 게임 플레이 테스트

## 📱 **친구와 공유 방법**

### **1. 게임 URL 공유**
```
https://your-railway-domain.up.railway.app
```

### **2. 방 코드 공유**
- 방 생성 후 생성된 6자리 코드
- 예: `ABC123`

### **3. 게임 플레이**
1. 친구가 URL로 접속
2. 방 코드 입력해서 입장
3. 실시간으로 함께 게임 플레이

## 🛠️ **문제 해결**

### **배포 실패 시**
1. **빌드 로그** 확인
2. **package.json** 의존성 확인
3. **Node.js 버전** 호환성 확인

### **연결 문제**
1. **CORS 설정** 확인
2. **Socket.IO 버전** 호환성 확인
3. **방화벽/프록시** 설정 확인

## 🔒 **보안 고려사항**

### **프로덕션 환경**
- **HTTPS** 자동 적용 (Railway)
- **환경변수**로 민감한 정보 관리
- **Rate Limiting** 고려

### **게임 보안**
- **입력 검증** 강화
- **치팅 방지** 로직 추가
- **세션 관리** 개선

## 📊 **모니터링**

### **Railway 대시보드**
- **실시간 로그** 확인
- **리소스 사용량** 모니터링
- **에러 알림** 설정

### **게임 통계**
- **동시 접속자 수**
- **게임 완료율**
- **에러 발생률**

## 🎯 **성능 최적화**

### **서버 최적화**
- **메모리 사용량** 최적화
- **연결 풀링** 구현
- **캐싱** 전략

### **클라이언트 최적화**
- **이미지 압축**
- **코드 분할**
- **지연 로딩**

---

## 🎉 **배포 완료!**

이제 친구들과 **실시간으로** 블랙잭 게임을 즐길 수 있습니다!

**URL + 방 코드**만 공유하면 바로 게임 시작! 🎮✨
