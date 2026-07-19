// ============================================================
// countries.js - 국가 목록(이름/국가 입력 + 국가 순위용). (shared)
// 큐레이션 목록 — 주요 국가 위주. 필요시 자유롭게 확장.
// code: ISO 3166-1 alpha-2. name: 선택 UI용 한국어 표기.
// ============================================================

export const COUNTRIES = [
  { code: 'KR', name: '한국' },
  { code: 'US', name: '미국' },
  { code: 'JP', name: '일본' },
  { code: 'CN', name: '중국' },
  { code: 'TW', name: '대만' },
  { code: 'HK', name: '홍콩' },
  { code: 'TH', name: '태국' },
  { code: 'VN', name: '베트남' },
  { code: 'PH', name: '필리핀' },
  { code: 'ID', name: '인도네시아' },
  { code: 'MY', name: '말레이시아' },
  { code: 'SG', name: '싱가포르' },
  { code: 'IN', name: '인도' },
  { code: 'AU', name: '호주' },
  { code: 'NZ', name: '뉴질랜드' },
  { code: 'CA', name: '캐나다' },
  { code: 'MX', name: '멕시코' },
  { code: 'BR', name: '브라질' },
  { code: 'AR', name: '아르헨티나' },
  { code: 'CL', name: '칠레' },
  { code: 'GB', name: '영국' },
  { code: 'IE', name: '아일랜드' },
  { code: 'FR', name: '프랑스' },
  { code: 'DE', name: '독일' },
  { code: 'IT', name: '이탈리아' },
  { code: 'ES', name: '스페인' },
  { code: 'PT', name: '포르투갈' },
  { code: 'NL', name: '네덜란드' },
  { code: 'BE', name: '벨기에' },
  { code: 'CH', name: '스위스' },
  { code: 'AT', name: '오스트리아' },
  { code: 'SE', name: '스웨덴' },
  { code: 'NO', name: '노르웨이' },
  { code: 'FI', name: '핀란드' },
  { code: 'DK', name: '덴마크' },
  { code: 'PL', name: '폴란드' },
  { code: 'RU', name: '러시아' },
  { code: 'UA', name: '우크라이나' },
  { code: 'TR', name: '튀르키예' },
  { code: 'GR', name: '그리스' },
  { code: 'CZ', name: '체코' },
  { code: 'HU', name: '헝가리' },
  { code: 'RO', name: '루마니아' },
  { code: 'IL', name: '이스라엘' },
  { code: 'SA', name: '사우디아라비아' },
  { code: 'AE', name: '아랍에미리트' },
  { code: 'EG', name: '이집트' },
  { code: 'ZA', name: '남아프리카공화국' },
  { code: 'NG', name: '나이지리아' },
  { code: 'KE', name: '케냐' },
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
