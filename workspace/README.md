# workspace

`npm run participant:init` 이 만든 팀 작업폴더가 여기에 생깁니다.

```bash
npm run participant:init -- --team TEAM-001 --env sandbox
```

```
workspace/TEAM-001/
├── participant.config.json
├── src/participant.ts        ← 여기부터 수정하세요
├── input/
├── output/
├── tests/
└── README.md
```

이 폴더는 여러분 것입니다. 공식 평가는 여기가 아니라
`submission-output/<팀ID>/participant-submission.json` 을 재실행합니다.
