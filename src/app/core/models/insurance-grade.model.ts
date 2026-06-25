export interface InsuranceGrade {
  grade: number;
  monthlyAmount: number;
  minRange: number;
  maxRange: number;
}

/** 健康保険の標準報酬月額 等級表（全50等級） */
export const HEALTH_INSURANCE_GRADES: readonly InsuranceGrade[] = [
  { grade: 1, monthlyAmount: 58_000, minRange: 0, maxRange: 63_000 },
  { grade: 2, monthlyAmount: 68_000, minRange: 63_000, maxRange: 73_000 },
  { grade: 3, monthlyAmount: 78_000, minRange: 73_000, maxRange: 83_000 },
  { grade: 4, monthlyAmount: 88_000, minRange: 83_000, maxRange: 93_000 },
  { grade: 5, monthlyAmount: 98_000, minRange: 93_000, maxRange: 101_000 },
  { grade: 6, monthlyAmount: 104_000, minRange: 101_000, maxRange: 107_000 },
  { grade: 7, monthlyAmount: 110_000, minRange: 107_000, maxRange: 114_000 },
  { grade: 8, monthlyAmount: 118_000, minRange: 114_000, maxRange: 122_000 },
  { grade: 9, monthlyAmount: 126_000, minRange: 122_000, maxRange: 130_000 },
  { grade: 10, monthlyAmount: 134_000, minRange: 130_000, maxRange: 138_000 },
  { grade: 11, monthlyAmount: 142_000, minRange: 138_000, maxRange: 146_000 },
  { grade: 12, monthlyAmount: 150_000, minRange: 146_000, maxRange: 155_000 },
  { grade: 13, monthlyAmount: 160_000, minRange: 155_000, maxRange: 165_000 },
  { grade: 14, monthlyAmount: 170_000, minRange: 165_000, maxRange: 175_000 },
  { grade: 15, monthlyAmount: 180_000, minRange: 175_000, maxRange: 185_000 },
  { grade: 16, monthlyAmount: 190_000, minRange: 185_000, maxRange: 195_000 },
  { grade: 17, monthlyAmount: 200_000, minRange: 195_000, maxRange: 210_000 },
  { grade: 18, monthlyAmount: 220_000, minRange: 210_000, maxRange: 230_000 },
  { grade: 19, monthlyAmount: 240_000, minRange: 230_000, maxRange: 250_000 },
  { grade: 20, monthlyAmount: 260_000, minRange: 250_000, maxRange: 270_000 },
  { grade: 21, monthlyAmount: 280_000, minRange: 270_000, maxRange: 290_000 },
  { grade: 22, monthlyAmount: 300_000, minRange: 290_000, maxRange: 310_000 },
  { grade: 23, monthlyAmount: 320_000, minRange: 310_000, maxRange: 330_000 },
  { grade: 24, monthlyAmount: 340_000, minRange: 330_000, maxRange: 350_000 },
  { grade: 25, monthlyAmount: 360_000, minRange: 350_000, maxRange: 370_000 },
  { grade: 26, monthlyAmount: 380_000, minRange: 370_000, maxRange: 395_000 },
  { grade: 27, monthlyAmount: 410_000, minRange: 395_000, maxRange: 425_000 },
  { grade: 28, monthlyAmount: 440_000, minRange: 425_000, maxRange: 455_000 },
  { grade: 29, monthlyAmount: 470_000, minRange: 455_000, maxRange: 485_000 },
  { grade: 30, monthlyAmount: 500_000, minRange: 485_000, maxRange: 515_000 },
  { grade: 31, monthlyAmount: 530_000, minRange: 515_000, maxRange: 545_000 },
  { grade: 32, monthlyAmount: 560_000, minRange: 545_000, maxRange: 575_000 },
  { grade: 33, monthlyAmount: 590_000, minRange: 575_000, maxRange: 605_000 },
  { grade: 34, monthlyAmount: 620_000, minRange: 605_000, maxRange: 635_000 },
  { grade: 35, monthlyAmount: 650_000, minRange: 635_000, maxRange: 665_000 },
  { grade: 36, monthlyAmount: 680_000, minRange: 665_000, maxRange: 695_000 },
  { grade: 37, monthlyAmount: 710_000, minRange: 695_000, maxRange: 730_000 },
  { grade: 38, monthlyAmount: 750_000, minRange: 730_000, maxRange: 770_000 },
  { grade: 39, monthlyAmount: 790_000, minRange: 770_000, maxRange: 810_000 },
  { grade: 40, monthlyAmount: 830_000, minRange: 810_000, maxRange: 855_000 },
  { grade: 41, monthlyAmount: 880_000, minRange: 855_000, maxRange: 905_000 },
  { grade: 42, monthlyAmount: 930_000, minRange: 905_000, maxRange: 955_000 },
  { grade: 43, monthlyAmount: 980_000, minRange: 955_000, maxRange: 1_005_000 },
  { grade: 44, monthlyAmount: 1_030_000, minRange: 1_005_000, maxRange: 1_055_000 },
  { grade: 45, monthlyAmount: 1_090_000, minRange: 1_055_000, maxRange: 1_115_000 },
  { grade: 46, monthlyAmount: 1_150_000, minRange: 1_115_000, maxRange: 1_175_000 },
  { grade: 47, monthlyAmount: 1_210_000, minRange: 1_175_000, maxRange: 1_235_000 },
  { grade: 48, monthlyAmount: 1_270_000, minRange: 1_235_000, maxRange: 1_295_000 },
  { grade: 49, monthlyAmount: 1_330_000, minRange: 1_295_000, maxRange: 1_355_000 },
  { grade: 50, monthlyAmount: 1_390_000, minRange: 1_355_000, maxRange: Infinity },
];

/** 厚生年金保険の標準報酬月額 等級表（全32等級） */
export const PENSION_INSURANCE_GRADES: readonly InsuranceGrade[] = [
  { grade: 1, monthlyAmount: 88_000, minRange: 0, maxRange: 93_000 },
  { grade: 2, monthlyAmount: 98_000, minRange: 93_000, maxRange: 101_000 },
  { grade: 3, monthlyAmount: 104_000, minRange: 101_000, maxRange: 107_000 },
  { grade: 4, monthlyAmount: 110_000, minRange: 107_000, maxRange: 114_000 },
  { grade: 5, monthlyAmount: 118_000, minRange: 114_000, maxRange: 122_000 },
  { grade: 6, monthlyAmount: 126_000, minRange: 122_000, maxRange: 130_000 },
  { grade: 7, monthlyAmount: 134_000, minRange: 130_000, maxRange: 138_000 },
  { grade: 8, monthlyAmount: 142_000, minRange: 138_000, maxRange: 146_000 },
  { grade: 9, monthlyAmount: 150_000, minRange: 146_000, maxRange: 155_000 },
  { grade: 10, monthlyAmount: 160_000, minRange: 155_000, maxRange: 165_000 },
  { grade: 11, monthlyAmount: 170_000, minRange: 165_000, maxRange: 175_000 },
  { grade: 12, monthlyAmount: 180_000, minRange: 175_000, maxRange: 185_000 },
  { grade: 13, monthlyAmount: 190_000, minRange: 185_000, maxRange: 195_000 },
  { grade: 14, monthlyAmount: 200_000, minRange: 195_000, maxRange: 210_000 },
  { grade: 15, monthlyAmount: 220_000, minRange: 210_000, maxRange: 230_000 },
  { grade: 16, monthlyAmount: 240_000, minRange: 230_000, maxRange: 250_000 },
  { grade: 17, monthlyAmount: 260_000, minRange: 250_000, maxRange: 270_000 },
  { grade: 18, monthlyAmount: 280_000, minRange: 270_000, maxRange: 290_000 },
  { grade: 19, monthlyAmount: 300_000, minRange: 290_000, maxRange: 310_000 },
  { grade: 20, monthlyAmount: 320_000, minRange: 310_000, maxRange: 330_000 },
  { grade: 21, monthlyAmount: 340_000, minRange: 330_000, maxRange: 350_000 },
  { grade: 22, monthlyAmount: 360_000, minRange: 350_000, maxRange: 370_000 },
  { grade: 23, monthlyAmount: 380_000, minRange: 370_000, maxRange: 395_000 },
  { grade: 24, monthlyAmount: 410_000, minRange: 395_000, maxRange: 425_000 },
  { grade: 25, monthlyAmount: 440_000, minRange: 425_000, maxRange: 455_000 },
  { grade: 26, monthlyAmount: 470_000, minRange: 455_000, maxRange: 485_000 },
  { grade: 27, monthlyAmount: 500_000, minRange: 485_000, maxRange: 515_000 },
  { grade: 28, monthlyAmount: 530_000, minRange: 515_000, maxRange: 545_000 },
  { grade: 29, monthlyAmount: 560_000, minRange: 545_000, maxRange: 575_000 },
  { grade: 30, monthlyAmount: 590_000, minRange: 575_000, maxRange: 605_000 },
  { grade: 31, monthlyAmount: 620_000, minRange: 605_000, maxRange: 635_000 },
  { grade: 32, monthlyAmount: 650_000, minRange: 635_000, maxRange: Infinity },
];

export function matchInsuranceGrade(
  grades: readonly InsuranceGrade[],
  baseSalary: number
): InsuranceGrade | null {
  return (
    grades.find((row) => baseSalary >= row.minRange && baseSalary < row.maxRange) ?? null
  );
}

export function findInsuranceGradeByAmount(
  grades: readonly InsuranceGrade[],
  monthlyAmount: number
): InsuranceGrade | null {
  return grades.find((row) => row.monthlyAmount === monthlyAmount) ?? null;
}
