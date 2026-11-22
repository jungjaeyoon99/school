
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from pycomcigan import TimeTable, get_school_code

app = FastAPI(
    title="JJY School Timetable API",
    description="JJY 학교 시간표 조회 API",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://school.jjy0205.site",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "status": "ok",
        "message": "JJY Timetable API is running"
    }


@app.get("/api/health")
def health():
    return {"status": "healthy"}


# 학교 검색
@app.get("/api/schools")
def search_schools(
    region: str = Query(default="서울", min_length=1)
):
    try:
        schools = get_school_code(region)

        return {
            "success": True,
            "schools": schools
        }

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"학교 검색 실패: {str(e)}"
        )


# 시간표 조회
@app.get("/api/timetable")
def get_timetable(
    school: str,
    grade: int = Query(ge=1, le=3),
    class_num: int = Query(ge=1, le=10),
    week: int = Query(default=0, ge=0, le=1)
):
    try:
        timetable = TimeTable(
            school,
            week_num=week
        )

        # 해당 학년 및 반의 시간표
        data = timetable.timetable[grade][class_num]

        # JSON으로 반환할 수 있도록 변환
        result = []

        for day in data:
            result.append(list(day))

        return {
            "success": True,
            "school": school,
            "grade": grade,
            "class": class_num,
            "week": week,
            "timetable": result
        }

    except (IndexError, KeyError):
        raise HTTPException(
            status_code=404,
            detail="해당 학급의 시간표를 찾을 수 없습니다."
        )

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"시간표 조회 실패: {str(e)}"
        )
