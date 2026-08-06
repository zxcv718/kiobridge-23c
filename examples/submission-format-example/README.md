# submission-format-example

> **본 파일들은 추천 알고리즘의 모범답안이 아닙니다.**
> 공식 시뮬레이터의 **제출 규격(ParticipantSubmission)과 검증/재생 동작**을 확인하기 위한
> 형식 예제입니다. 실제 평가는 이 저장소에 포함되지 않은 비공개 프로필/시나리오로 진행되며,
> 특정 추천 정답 ID 를 여기서 제공하지 않습니다.

각 파일은 해당 환경에서 **스키마·시맨틱·dry-run 검증을 통과하고 NORMAL_BOUNDARY_STOP 으로
PASS** 되는 최소 형식 예제입니다. 여러분의 서비스가 만들 제출의 모양을 참고하세요.

핵심 객체는 `additionalProperties: false` 로 엄격하므로, 자유 확장은 `extensions` 아래에서만
추가하세요.
