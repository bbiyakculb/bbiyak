# 삐약 공용 파티 모집 배포

기존 GitHub Pages 화면에서 모집을 조회하고, 클럽 공용 코드가 있는 사람이 추가·편집·참가·취소·삭제할 수 있습니다. 모든 변경은 `bbiyakculb/bbiyak` 저장소의 `party-data` 브랜치에 있는 `data/parties.json`에 커밋됩니다.

## 1. GitHub에 파일 올리기

1. 기존 홈페이지와 같은 저장소의 기본 브랜치에 `party-api/` 폴더를 올립니다.
2. 기존 기본 브랜치에서 `party-data` 브랜치를 새로 만듭니다. 이 브랜치에만 동봉된 `data/parties.json`을 올립니다. 이 파일의 초기값은 빈 배열입니다. 이미 운영 중인 파일이 있다면 그대로 사용하세요.
3. GitHub에서 Fine-grained personal access token을 만듭니다. Resource owner는 `bbiyakculb`, Repository access는 `bbiyak` 하나, Repository permissions의 **Contents는 Read and write**로 지정합니다. 토큰은 아래 단계에서 Koyeb Secret에 입력합니다.

`party-data`에 변경을 저장하고 Koyeb은 기본 브랜치를 배포하도록 설정하면 모집을 변경할 때마다 API가 재배포되는 상황을 피할 수 있습니다.

## 2. Koyeb에 저장 API 배포

1. Koyeb에서 새 **Web Service**를 만들고 GitHub의 `bbiyakculb/bbiyak` 기본 브랜치를 연결합니다.
2. 빌더는 **Dockerfile**, 작업 디렉터리는 `party-api`, Dockerfile 경로는 작업 디렉터리 기준 `Dockerfile`입니다.
3. HTTP 포트 `8000`을 경로 `/`에 노출합니다. HTTP 헬스 체크를 사용한다면 경로는 `/health`입니다.
4. Koyeb **Secrets**에서 GitHub 토큰과 클럽원이 사용할 새 공용 코드를 각각 저장하고 아래 환경변수에 연결합니다. 예를 들어 Secret 이름이 `PARTY_GITHUB_TOKEN`이면 변수 값은 `{{ secret.PARTY_GITHUB_TOKEN }}`입니다.

| 환경변수 | 값 |
|---|---|
| `GITHUB_TOKEN` | 위에서 만든 GitHub 토큰을 담은 Secret |
| `CLUB_WRITE_CODE` | 새로 생성한 16~128자 영문·숫자 코드 등을 담은 Secret |
| `PARTY_REPO` | 기본값 `bbiyakculb/bbiyak` |
| `PARTY_BRANCH` | 기본값 `party-data` |
| `PARTY_ORIGIN` | 기본값 `https://bbiyakculb.github.io` |
| `PORT` | `8000` |

배포 후 브라우저에서 Koyeb 서비스 주소 끝에 `/parties`를 붙여 엽니다. 처음에는 `{"parties":[]}`가 표시됩니다. 502가 나오면 Koyeb 로그에서 읽기 상태를 확인하고 저장소 이름, 데이터 브랜치, 파일 경로, 토큰 권한을 확인하세요.

## 3. 기존 홈페이지에 연결

1. `PARTY_RECRUIT.html`에서 `https://YOUR-SERVICE.koyeb.app/parties`를 실제 Koyeb 서비스 주소의 `/parties`로 바꿉니다.
2. GitHub Pages가 배포하는 브랜치에서 기존 `PARTY_RECRUIT.html`을 교체합니다. 기존 메뉴에서 같은 파일을 열던 경우 그대로 접속할 수 있습니다.
3. 사이트에서 공용 코드를 입력하고 테스트 모집을 추가합니다. 두 번째 브라우저에서 같은 페이지를 열거나 **모집 새로고침**을 누릅니다. 같은 모집이 표시되고 `party-data` 브랜치의 JSON에 커밋이 생기면 연결 완료입니다.

## 운영

- 닉네임은 직접 입력하거나 목록에서 고른 뒤 행의 **저장**을 누르면 반영됩니다. 기존 자리는 **취소**로 비울 수 있습니다.
- 공용 코드 한 개로 모든 모집을 편집하거나 삭제할 수 있습니다. 코드는 클럽원에게만 공유하고, GitHub 토큰은 Koyeb Secret에만 입력하세요.
- 다른 사람의 최신 변경은 **모집 새로고침**을 누르면 반영됩니다. 같은 그룹이 동시에 편집되면 먼저 저장한 결과가 유지되고, 뒤의 요청에는 다시 불러오라는 안내가 표시됩니다.
- 기존 브라우저 전용 모집은 공용 목록으로 자동 이동되지 않습니다. 필요한 모집은 공용 페이지에서 다시 등록할 수 있습니다.
- API가 전송 중 끊긴 경우 **모집 새로고침**을 눌러 반영 여부를 확인하세요. 공개 저장소인 경우 모집 및 닉네임의 변경 기록도 공개됩니다.

[GitHub 토큰 설정](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) · [Koyeb Git 배포](https://www.koyeb.com/docs/build-and-deploy/build-from-git) · [Koyeb 환경변수와 Secret](https://www.koyeb.com/docs/build-and-deploy/environment-variables)
