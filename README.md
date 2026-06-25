# DACON Mosquito Trajectory Prediction

월간 데이콘 "모기 비행 궤적 예측 AI 경진대회"용 새 프로젝트입니다.

목표는 공식 지표 `R-Hit@1cm`를 높이는 것입니다. 모델 크기나 리소스 제약은 두지 않고, 물리 기반 외삽과 고용량 tabular ensemble을 모두 비교합니다.

## Setup

```bash
cd ~/git/dacon-mosquito-trajectory
python3 -m venv .venv
.venv/bin/python -m pip install -U pip setuptools wheel
.venv/bin/python -m pip install -r requirements.txt
```

`/home/hjw/open.zip`이 있으면 실행 시 `data/open`으로 자동 압축 해제됩니다.

## Recommended Run

공식 지표에 직접 튜닝한 물리식 제출:

```bash
.venv/bin/python run_pipeline.py --profile physics
```

부스팅/앙상블까지 포함한 강한 실험:

```bash
.venv/bin/python run_pipeline.py --profile strong --gpu
```

빠른 sanity check:

```bash
.venv/bin/python run_pipeline.py --profile quick
```

출력은 `outputs/`에 저장됩니다.

## How / Why

이 문제는 40ms 간격으로 관측된 11개 좌표를 이용해 마지막 관측 시점 기준 80ms 뒤 위치를 예측하는 문제입니다. 80ms는 데이터 간격 기준으로 정확히 2 step 뒤이므로, 먼저 복잡한 모델을 쓰기보다 최근 운동량을 이용한 외삽이 강한 기준선이 됩니다.

초기 기준선은 마지막 좌표에 최근 속도를 2 step만큼 더하는 방식입니다.

```text
prediction = p[0ms] + 2 * (p[0ms] - p[-40ms])
```

하지만 모기 궤적에는 짧은 구간에서도 방향 변화가 있으므로, 최근 가속도 항을 함께 사용했습니다. 다만 가속도를 물리식 그대로 크게 반영하면 노이즈까지 증폭되기 때문에, train label에서 공식 지표 `R-Hit@1cm`가 가장 높아지는 계수를 직접 탐색했습니다.

최종 물리 기반식은 다음과 같습니다.

```text
prediction = last + 1.9890 * velocity + 0.5225 * acceleration
velocity = p[0ms] - p[-40ms]
acceleration = p[0ms] - 2 * p[-40ms] + p[-80ms]
```

이후 모델은 전체 좌표를 처음부터 다시 예측하지 않고, 위 물리식의 잔차만 학습하도록 구성했습니다. 이렇게 한 이유는 다음과 같습니다.

- 11개 시점, 3개 좌표만 주어지는 짧은 시계열이라 기본 운동 패턴은 물리 외삽이 이미 잘 설명합니다.
- 모델이 절대 좌표를 직접 외우는 것을 줄이고, 예측 실패분인 잔차에 집중하게 만들 수 있습니다.
- 학습/평가 환경이 다르므로 공간 구조 암기보다 sensor-local 운동 패턴 일반화가 중요합니다.
- 공식 지표가 평균 거리 오차가 아니라 `1cm 이내 명중률`이므로, 잔차 보정 후에도 별도 scale을 탐색해 hit rate를 직접 최적화했습니다.

특성은 좌표 원본, 마지막 좌표 기준 상대 위치, 1차 차분(속도), 2차 차분(가속도), 3차 차분, window별 통계량, 다항 외삽 결과를 tabular feature로 만들었습니다. 데이터 크기가 10,000개이고 각 샘플의 시계열 길이가 11로 짧기 때문에, 대형 딥러닝 시퀀스 모델보다 gradient boosting/tree ensemble이 더 안정적으로 검증 성능을 냈습니다.

최종 선택은 5-fold OOF 검증에서 `R-Hit@1cm`가 가장 높은 후보를 기준으로 했습니다. 현재 가장 좋은 후보는 물리식 예측에 XGBoost 잔차 보정을 `0.425`배 적용한 `xgboost_scaled`입니다.

```text
physics baseline:   R-Hit@1cm=0.6016
ridge residual:     R-Hit@1cm=0.6047
extra trees:        R-Hit@1cm=0.6151
xgboost residual:   R-Hit@1cm=0.6169
weighted ensemble:  R-Hit@1cm=0.6167
```

## Presentation Figures

아래 그림은 발표 자료에 바로 넣을 수 있도록 `docs/figures/`에 PNG로 저장했습니다. 새 실험 결과가 생기면 다음 명령으로 다시 생성할 수 있습니다.

```bash
.venv/bin/python scripts/make_figures.py
```

### Model Performance

검증 기준 성능과 DACON public leaderboard 점수를 함께 비교한 그래프입니다.

![Model performance comparison](docs/figures/performance_comparison.png)

### Hit Rate Curve

반경이 커질 때 모델별 hit rate가 어떻게 변하는지 보여줍니다. 빨간 점선은 공식 평가 반경인 1cm입니다.

![Hit rate curve](docs/figures/hit_curve.png)

### Example Trajectory

관측된 11개 좌표와 +80ms 실제 좌표, 물리식 예측, XGBoost 보정 예측을 한 샘플에서 비교했습니다.

![Trajectory example](docs/figures/trajectory_example.png)

### Pipeline Overview

전체 접근 흐름을 발표용 도식으로 정리했습니다.

![Pipeline overview](docs/figures/pipeline_overview.png)

## Current Result

현재 `--profile strong --gpu` 실행 결과, 최종 제출 파일은 `outputs/submission_best.csv`입니다. 선택된 모델은 `xgboost_scaled`이며, 물리 기반 예측값에 XGBoost 잔차 예측을 scale `0.425`로 반영합니다.

```text
constant velocity: R-Hit@1cm=0.5788
tuned physics:     R-Hit@1cm=0.6016
best xgboost:      R-Hit@1cm=0.6169
```

## Leaderboard

DACON 제출 리더보드 기록입니다.

- URL: https://dacon.io/competitions/official/236716/leaderboard?tab=submit
- Rank: 347등
- User: 한정우1917
- Public score: 0.638
