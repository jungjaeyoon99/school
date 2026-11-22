
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from pycomcigan import TimeTable, get_school_code


app = FastAPI(
    title="JJY School Timetable API",
    description="pycomcigan을 이용한 학교 검색, 시간표 및 담임 조회 API",
    version="2.0.0"
)


# ==================================================
# CORS 설정
# ==================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://school.jjy0205.site"
    ],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ==================================================
# 공통 함수
# ==================================================

def create_timetable(school_name: str, week: int):
    """
    학교 이름과 주차를 이용해 시간표 객체를 생성합니다.

    week = 0: 이번 주
    week = 1: 다음 주
    """

    try:
        return TimeTable(
            school_name,
            week_num=week
        )

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"시간표 조회 실패: {str(e)}"
        )


def validate_week(week: int):
    if week not in (0, 1):
        raise HTTPException(
            status_code=400,
            detail="week는 0 또는 1이어야 합니다."
        )


def validate_class(grade: int, class_num: int):
    if grade < 1 or class_num < 1:
        raise HTTPException(
            status_code=400,
            detail="학년과 반은 1 이상의 정수여야 합니다."
        )


# ==================================================
# 기본 및 상태 확인
# ==================================================

@app.get("/")
def root():
    return {
        "name": "JJY School Timetable API",
        "version": "2.0.0",
        "status": "running"
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy"
    }


# ==================================================
# 학교 이름 검색
# ==================================================

@app.get("/api/schools")
async def search_schools(
    query: str = Query(
        ...,
        min_length=1,
        description="검색할 학교 이름 또는 이름 일부"
    )
):
    """
    학교 이름으로 학교를 검색합니다.

    예시:
    /api/schools?query=중계중
    """

    query = query.strip()

    if not query:
        raise HTTPException(
            status_code=400,
            detail="학교 이름을 입력해 주세요."
        )

    try:
        results = await run_in_threadpool(
            get_school_code,
            query
        )

        if not results:
            return {
                "query": query,
                "count": 0,
                "schools": []
            }

        schools = []

        for item in results:
            if len(item) < 4:
                continue

            local_code, region, school_name, school_code = item

            # 학교 이름에 검색어가 포함된 결과만 반환
            if query not in school_name:
                continue

            schools.append({
                "local_code": local_code,
                "region": region,
                "school_name": school_name,
                "school_code": school_code
            })

        return {
            "query": query,
            "count": len(schools),
            "schools": schools
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"학교 검색 실패: {str(e)}"
        )


# ==================================================
# 시간표 조회
# ==================================================

@app.get("/api/timetable")
async def get_timetable(
    school_name: str = Query(
        ...,
        min_length=1,
        description="학교 이름"
    ),
    grade: int = Query(
        ...,
        ge=1,
        description="학년"
    ),
    class_num: int = Query(
        ...,
        ge=1,
        description="반"
    ),
    week: int = Query(
        0,
        description="0: 이번 주, 1: 다음 주"
    )
):
    """
    학교의 특정 학년과 반의 주간 시간표를 조회합니다.

    예시:
    /api/timetable?school_name=중계중학교&grade=1&class_num=2&week=0
    """

    school_name = school_name.strip()

    if not school_name:
        raise HTTPException(
            status_code=400,
            detail="학교 이름을 입력해 주세요."
        )

    validate_class(grade, class_num)
    validate_week(week)

    timetable = await run_in_threadpool(
        create_timetable,
        school_name,
        week
    )

    try:
        # pycomcigan 시간표 구조:
        # timetable[학년][반][요일][교시]
        class_timetable = (
            timetable.timetable[grade][class_num]
        )

        weekdays = [
            "월요일",
            "화요일",
            "수요일",
            "목요일",
            "금요일"
        ]

        schedule = []

        for day_index, day_name in enumerate(weekdays):
            periods = []

            # 해당 요일의 교시별 시간표
            day_schedule = (
                class_timetable[day_index]
                if day_index < len(class_timetable)
                else []
            )

            for period_index, period_data in enumerate(day_schedule):
                lesson = str(period_data).strip()

                # 수업이 없는 교시
                if lesson == "()":
                    lesson = None

                periods.append({
                    "period": period_index + 1,
                    "lesson": lesson
                })

            schedule.append({
                "day": day_name,
                "periods": periods
            })

        return {
            "school_name": school_name,
            "grade": grade,
            "class_num": class_num,
            "week": week,
            "schedule": schedule
        }

    except (IndexError, TypeError):
        raise HTTPException(
            status_code=404,
            detail="해당 학년 또는 반의 시간표를 찾을 수 없습니다."
        )

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"시간표 데이터 처리 실패: {str(e)}"
        )


# ==================================================
# 담임 선생님 조회
# ==================================================

@app.get("/api/homeroom")
async def get_homeroom(
    school_name: str = Query(
        ...,
        min_length=1,
        description="학교 이름"
    ),
    grade: int = Query(
        ...,
        ge=1,
        description="학년"
    ),
    class_num: int = Query(
        ...,
        ge=1,
        description="반"
    ),
    week: int = Query(
        0,
        description="0: 이번 주, 1: 다음 주"
    )
):
    """
    특정 학년과 반의 담임 선생님을 조회합니다.

    예시:
    /api/homeroom?school_name=중계중학교&grade=1&class_num=2&week=0
    """

    school_name = school_name.strip()

    if not school_name:
        raise HTTPException(
            status_code=400,
            detail="학교 이름을 입력해 주세요."
        )

    validate_class(grade, class_num)
    validate_week(week)

    timetable = await run_in_threadpool(
        create_timetable,
        school_name,
        week
    )

    try:
        # 보내주신 pycomcigan 예제와 동일한 방식
        teacher = timetable.homeroom(
            grade,
            class_num
        )

        return {
            "school_name": school_name,
            "grade": grade,
            "class_num": class_num,
            "week": week,
            "homeroom": teacher
        }

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"담임 조회 실패: {str(e)}"
        )
