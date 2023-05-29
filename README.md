# API 문서 파싱

## 사용 방법

### api 토큰 발급 받기 

[api 토큰 링크](https://id.atlassian.com/manage-profile/security/api-tokens)

### .env 파일 생성 후 필요한 정보 저장

```
API_TOKEN='발급받은 토큰'
USER_EMAIL='로그인한 이메일'
API_DOMAIN='api 문서 /wiki 앞에 있는 도메인 명'
```

## 투두

- [ ] error code
- [ ] `content[].` 패턴