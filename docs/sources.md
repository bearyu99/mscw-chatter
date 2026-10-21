# 확인한 출처

2026-10-21에 아래 1차 자료와 사용자 지정 용어집을 확인하고 구현에 참고했습니다. API 모델 수명 주기와 프레임워크 요구 사항은 이후 변경될 수 있습니다. 코드에 고정한 의존성 버전은 package-lock.json에 기록합니다.

- [사용자 지정 게임 용어집](https://gall.dcinside.com/mgallery/board/view/?id=mapleclassic&no=4152): 약자·용어의 의미, 다의어와 콘텐츠 범위 주의 사항. 약자와 의미만 주요 사실 매핑으로 참고했습니다.
- [Electron clipboard](https://www.electronjs.org/docs/latest/api/clipboard): 시스템 클립보드 읽기·쓰기. 설치한 Electron 45.0.0의 타입 정의에서 readText/writeText가 Promise를 반환하는 점도 확인했습니다.
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage): OS별 암호화 저장 의미 및 macOS 코드 서명과 키체인 접근 관계.
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security): contextIsolation, sandbox, nodeIntegration 비활성화 및 제한된 IPC 경계.
- [Electron 플랫폼 지원](https://github.com/electron/electron/blob/main/README.md#platform-support): Windows 10 이상, macOS Ventura 이상. Electron 44부터 macOS 12 지원이 제거된 점을 확인해 앱의 최소 macOS 버전을 13.0으로 맞췄습니다.
- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create): chat completions 경로, messages, max_completion_tokens, 응답 choices.
- [Anthropic Create a Message](https://platform.claude.com/docs/en/api/messages/create): messages 경로, x-api-key 및 anthropic-version 헤더, system, max_tokens, content 텍스트 블록.
- [Claude Haiku 4.5](https://platform.claude.com/docs/en/models/haiku-4-5/overview): 모델 별칭 참고.
- [Google GenerateContent](https://ai.google.dev/api/generate-content): systemInstruction, contents, generationConfig, candidates/content/parts.
- [Google text generation](https://ai.google.dev/gemini-api/docs/text-generation): 텍스트 생성 및 모델 ID 예시 참고. 구현은 stateless generateContent 어댑터를 사용합니다.
- [Ollama chat](https://docs.ollama.com/api/chat): 로컬 /api/chat, messages, 비스트리밍 응답의 message/content, done.
- [Pretendard](https://github.com/orioncactus/pretendard): 폰트 배포 원본. npm pretendard 1.3.9의 Variable woff2를 앱 번들 안에 포함하며 SIL Open Font License는 별도로 동봉합니다.

라이브 제공자 API 키는 사용하지 않았습니다. 모델별 실제 번역 품질·지연 시간과 모델 접근 권한은 이 자료 조회만으로 확인한 사실이 아닙니다.
