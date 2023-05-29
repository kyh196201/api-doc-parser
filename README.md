# API 문서 파싱

## 사용 방법

### 1. api 토큰 발급 받기 

[api 토큰 링크](https://id.atlassian.com/manage-profile/security/api-tokens)

### 2. .env 파일 생성 후 필요한 정보 저장

**.env 파일 템플릿**

```
API_TOKEN='발급받은 토큰'
USER_EMAIL='로그인한 이메일'
API_DOMAIN='api 문서 /wiki 앞에 있는 도메인 명'
```

### 3. 프로젝트 설치

```
npm i
```

### 4. 프로젝트 실행

```
node src/index.js

또는

cd src
node index.js
```

### 5. pageId, filename 입력 후 types 디렉토리에 생성되는 파일 확인

- pageId: api 문서 url에서 `pages/` 뒤에 있는 숫자
- filename: `.types.ts` 앞에 들어갈 파일 이름

---

## 투두

- [ ] error code
- [ ] `content[].` 패턴
