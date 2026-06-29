import { resolveRequiredDependentDocuments } from './dependent-required-documents.utils';

describe('resolveRequiredDependentDocuments', () => {
  const birthDate16Plus = '2000-01-01';
  const birthDateUnder60 = '1970-01-01';
  const birthDate60Plus = '1960-01-01';

  it('returns rule ① documents for unemployed with recently unemployed situation', () => {
    const documents = resolveRequiredDependentDocuments(
      {
        birthDate: birthDateUnder60,
        occupation: 'unemployed',
        currentSituation: 'recently_unemployed',
        livingArrangement: 'cohabiting',
      },
      new Date('2026-06-01')
    );

    expect(documents).toContain('退職証明書または離職票（１・２）のコピー');
    expect(documents).not.toContain('最新の非課税証明書（または課税証明書）');
  });

  it('returns rule ② documents for student aged 16+ living together', () => {
    const documents = resolveRequiredDependentDocuments(
      {
        birthDate: birthDate16Plus,
        occupation: 'student',
        currentSituation: 'student_over_16',
        livingArrangement: 'cohabiting',
      },
      new Date('2026-06-01')
    );

    expect(documents).toContain('学生証のコピーまたは、在学証明書');
  });

  it('returns rule ③ documents for unemployed/part-time cohabiting excluding rule ①', () => {
    const documents = resolveRequiredDependentDocuments(
      {
        birthDate: birthDateUnder60,
        occupation: 'part_time',
        currentSituation: 'ongoing_unemployed_or_part_time',
        livingArrangement: 'cohabiting',
      },
      new Date('2026-06-01')
    );

    expect(documents).toContain('最新の非課税証明書（または課税証明書）');
  });

  it('returns rule ④ documents for student living separately', () => {
    const documents = resolveRequiredDependentDocuments(
      {
        birthDate: birthDate16Plus,
        occupation: 'student',
        currentSituation: 'student_over_16',
        livingArrangement: 'separate',
      },
      new Date('2026-06-01')
    );

    expect(documents).toEqual(['学生証のコピー', '仕送りしている通帳のコピー']);
  });

  it('returns rule ⑤ documents for unemployed/part-time under 60 living separately', () => {
    const documents = resolveRequiredDependentDocuments(
      {
        birthDate: birthDateUnder60,
        occupation: 'unemployed',
        currentSituation: 'ongoing_unemployed_or_part_time',
        livingArrangement: 'separate',
      },
      new Date('2026-06-01')
    );

    expect(documents).toContain('最新の非課税証明書（6月に毎年更新）');
    expect(documents).toContain('仕送りしている通帳のコピー');
  });

  it('returns rule ⑥ documents for recently unemployed living separately', () => {
    const documents = resolveRequiredDependentDocuments(
      {
        birthDate: birthDateUnder60,
        occupation: 'employee',
        currentSituation: 'recently_unemployed',
        livingArrangement: 'separate',
      },
      new Date('2026-06-01')
    );

    expect(documents).toContain('退職証明書または離職票');
    expect(documents).toContain('仕送りしている通帳のコピー');
  });

  it('returns rule ⑦ documents for pension recipient aged 60+', () => {
    const documents = resolveRequiredDependentDocuments(
      {
        birthDate: birthDate60Plus,
        occupation: 'unemployed',
        currentSituation: 'pension_recipient',
        livingArrangement: 'cohabiting',
      },
      new Date('2026-06-01')
    );

    expect(documents).toEqual(['年金振込通知書', '年金額改定通知書']);
  });
});
