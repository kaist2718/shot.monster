// ============================================================
// countries.js - 국가 목록(이름/국가 입력 + 국가 순위용). (shared)
// 큐레이션 목록 — 주요 국가 위주. 필요시 자유롭게 확장.
// code: ISO 3166-1 alpha-2. name: 한국어 표기. nameEn: 영문 표기.
// ============================================================

export const COUNTRIES = [
  { code: 'KR', name: '한국', nameEn: 'South Korea' },
  { code: 'US', name: '미국', nameEn: 'United States' },
  { code: 'JP', name: '일본', nameEn: 'Japan' },
  { code: 'CN', name: '중국', nameEn: 'China' },
  { code: 'TW', name: '대만', nameEn: 'Taiwan' },
  { code: 'HK', name: '홍콩', nameEn: 'Hong Kong' },
  { code: 'TH', name: '태국', nameEn: 'Thailand' },
  { code: 'VN', name: '베트남', nameEn: 'Vietnam' },
  { code: 'PH', name: '필리핀', nameEn: 'Philippines' },
  { code: 'ID', name: '인도네시아', nameEn: 'Indonesia' },
  { code: 'MY', name: '말레이시아', nameEn: 'Malaysia' },
  { code: 'SG', name: '싱가포르', nameEn: 'Singapore' },
  { code: 'IN', name: '인도', nameEn: 'India' },
  { code: 'AU', name: '호주', nameEn: 'Australia' },
  { code: 'NZ', name: '뉴질랜드', nameEn: 'New Zealand' },
  { code: 'CA', name: '캐나다', nameEn: 'Canada' },
  { code: 'MX', name: '멕시코', nameEn: 'Mexico' },
  { code: 'BR', name: '브라질', nameEn: 'Brazil' },
  { code: 'AR', name: '아르헨티나', nameEn: 'Argentina' },
  { code: 'CL', name: '칠레', nameEn: 'Chile' },
  { code: 'GB', name: '영국', nameEn: 'United Kingdom' },
  { code: 'IE', name: '아일랜드', nameEn: 'Ireland' },
  { code: 'FR', name: '프랑스', nameEn: 'France' },
  { code: 'DE', name: '독일', nameEn: 'Germany' },
  { code: 'IT', name: '이탈리아', nameEn: 'Italy' },
  { code: 'ES', name: '스페인', nameEn: 'Spain' },
  { code: 'PT', name: '포르투갈', nameEn: 'Portugal' },
  { code: 'NL', name: '네덜란드', nameEn: 'Netherlands' },
  { code: 'BE', name: '벨기에', nameEn: 'Belgium' },
  { code: 'CH', name: '스위스', nameEn: 'Switzerland' },
  { code: 'AT', name: '오스트리아', nameEn: 'Austria' },
  { code: 'SE', name: '스웨덴', nameEn: 'Sweden' },
  { code: 'NO', name: '노르웨이', nameEn: 'Norway' },
  { code: 'FI', name: '핀란드', nameEn: 'Finland' },
  { code: 'DK', name: '덴마크', nameEn: 'Denmark' },
  { code: 'PL', name: '폴란드', nameEn: 'Poland' },
  { code: 'RU', name: '러시아', nameEn: 'Russia' },
  { code: 'UA', name: '우크라이나', nameEn: 'Ukraine' },
  { code: 'TR', name: '튀르키예', nameEn: 'Turkey' },
  { code: 'GR', name: '그리스', nameEn: 'Greece' },
  { code: 'CZ', name: '체코', nameEn: 'Czech Republic' },
  { code: 'HU', name: '헝가리', nameEn: 'Hungary' },
  { code: 'RO', name: '루마니아', nameEn: 'Romania' },
  { code: 'IL', name: '이스라엘', nameEn: 'Israel' },
  { code: 'SA', name: '사우디아라비아', nameEn: 'Saudi Arabia' },
  { code: 'AE', name: '아랍에미리트', nameEn: 'United Arab Emirates' },
  { code: 'EG', name: '이집트', nameEn: 'Egypt' },
  { code: 'ZA', name: '남아프리카공화국', nameEn: 'South Africa' },
  { code: 'NG', name: '나이지리아', nameEn: 'Nigeria' },
  { code: 'KE', name: '케냐', nameEn: 'Kenya' },
];

// 서버 화이트리스트 검증용 코드 배열.
export const COUNTRY_CODES = COUNTRIES.map((c) => c.code);

// 일간 보드 엔트리(values)를 국가별로 집계 → 킬 합산 내림차순 top 10.
// entry 형태: { country, kills }. country 없는 엔트리는 제외. (shared → 서버/테스트 공용 순수 함수)
export function aggregateCountryBoard(values) {
  const m = new Map();
  for (const v of values) {
    if (!v.country) continue;
    const c = m.get(v.country) || { country: v.country, kills: 0, players: 0 };
    c.kills += v.kills; c.players += 1;
    m.set(v.country, c);
  }
  return [...m.values()].sort((a, b) => b.kills - a.kills).slice(0, 10);
}