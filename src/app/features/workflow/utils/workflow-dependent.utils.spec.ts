import { buildDependentFromParsedPayload } from './workflow-dependent.utils';

describe('buildDependentFromParsedPayload', () => {
  it('builds a dependent record from workflow payload fields', () => {
    const dependent = buildDependentFromParsedPayload({
      lastName: '山田',
      firstName: '太郎',
      lastNameKana: 'ヤマダ',
      firstNameKana: 'タロウ',
      birthDate: '2010-04-01',
      relationship: 'child',
      livingArrangement: 'cohabiting',
      dependencyStartDate: '2026-04-01',
      hasDisability: false,
      occupation: 'student',
      currentSituation: 'student_over_16',
      documentUrls: ['https://example.com/doc.jpg'],
    });

    expect(dependent).toEqual({
      lastName: '山田',
      firstName: '太郎',
      lastNameKana: 'ヤマダ',
      firstNameKana: 'タロウ',
      romanName: '',
      birthDate: '2010-04-01',
      relationship: 'child',
      livingArrangement: 'cohabiting',
      dependencyStartDate: '2026-04-01',
      hasDisability: false,
      occupation: 'student',
      currentSituation: 'student_over_16',
      documentUrls: ['https://example.com/doc.jpg'],
    });
  });

  it('returns null when required fields are missing', () => {
    expect(
      buildDependentFromParsedPayload({
        lastName: '',
        firstName: '太郎',
        lastNameKana: '',
        firstNameKana: '',
        birthDate: '2010-04-01',
        relationship: 'child',
        livingArrangement: 'cohabiting',
        dependencyStartDate: '2026-04-01',
        hasDisability: false,
        occupation: 'student',
        currentSituation: 'student_over_16',
        documentUrls: [],
      })
    ).toBeNull();
  });
});
