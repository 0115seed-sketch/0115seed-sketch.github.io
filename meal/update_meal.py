import os
import glob
import requests
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageDraw, ImageFont

# 1. 고정 설정값 (사용자 정보 반영)
ATPT_CODE = "N10"
SCHUL_CODE = "8140253"
API_KEY = "2af6977132b24eba82c8f17c111a605c"
USER_ID = "0115seed-sketch" # GitHub 사용자 ID

# 2. 한국 시간(KST) 기준 날짜 구하기
KST = timezone(timedelta(hours=9))
today_dt = datetime.now(KST)
today = today_dt.strftime('%Y%m%d')
today_formatted = today_dt.strftime('%Y-%m-%d')

# 3. 나이스 API 호출 및 파싱
url = f"https://open.neis.go.kr/hub/mealServiceDietInfo?KEY={API_KEY}&Type=json&ATPT_OFCDC_SC_CODE={ATPT_CODE}&SD_SCHUL_CODE={SCHUL_CODE}&MLSV_YMD={today}&MMEAL_SC_CODE=2"

meal_lines = []
try:
    res = requests.get(url).json()
    if "mealServiceDietInfo" in res:
        raw_text = res["mealServiceDietInfo"][1]["row"][0]["DDISH_NM"]
        meal_lines = raw_text.split("<br/>")
    else:
        meal_lines = ["오늘의 중식 정보가 없습니다."]
except Exception as e:
    meal_lines = [f"데이터 로드 실패: {str(e)}"]

meal_text = "\n".join(meal_lines)
# 카카오톡 말풍선 설명란에 들어갈 요약 텍스트 구성 (알레르기 번호 제외한 메뉴명만 추출하여 축약)
meal_summary = ", ".join([line.split(" ")[0] for line in meal_lines if line])[:50] + "..."

# 4. 기존 생성된 오래된 이미지 파일 삭제 (저장소 용량 관리)
os.makedirs("meal/images", exist_ok=True)
for old_img in glob.glob("meal/images/meal_*.png"):
    try:
        os.remove(old_img)
    except Exception as e:
        print(f"이전 이미지 삭제 실패: {e}")

# 5. 썸네일 이미지 동적 생성 (800x400)
img = Image.new('RGB', (800, 400), color=(250, 252, 255))
d = ImageDraw.Draw(img)

# 테두리 디자인 및 카카오 포인트 컬러 바 추가
d.rectangle([(0, 0), (800, 400)], outline=(220, 224, 230), width=4)
d.rectangle([(0, 0), (800, 15)], fill=(255, 212, 0))

# 폰트 지정 (GitHub Runner 내에 설치할 나눔고딕 로드)
try:
    font_title = ImageFont.truetype("NanumGothic.ttf", 28)
    font_content = ImageFont.truetype("NanumGothic.ttf", 20)
except Exception:
    font_title = ImageFont.load_default()
    font_content = ImageFont.load_default()

# 텍스트 쓰기
d.text((40, 45), f"오늘의 중식 ({today_formatted})", fill=(30, 30, 30), font=font_title)

y_offset = 110
for line in meal_lines:
    if y_offset > 350:
        d.text((40, y_offset), "...", fill=(120, 120, 120), font=font_content)
        break
    d.text((40, y_offset), f"• {line}", fill=(70, 72, 75), font=font_content)
    y_offset += 32

# 새로운 고유 이미지 저장
new_image_name = f"meal_{today}.png"
new_image_path = f"meal/images/{new_image_name}"
img.save(new_image_path)

# 6. HTML 생성 (template.html 기반 대입 작업)
og_image_url = f"https://{USER_ID}.github.io/meal/images/{new_image_name}"

with open("template.html", "r", encoding="utf-8") as f:
    template_content = f.read()

html_content = template_content\
    .replace("{{DATE}}", today_formatted)\
    .replace("{{MEAL_TEXT}}", meal_text)\
    .replace("{{MEAL_SUMMARY}}", meal_summary)\
    .replace("{{OG_IMAGE_URL}}", og_image_url)

# 최종 index.html 파일 저장
with open("meal/index.html", "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"배포 준비 완료: {new_image_name} 생성 및 meal/index.html 갱신 완료.")
