import { Injectable, inject } from '@angular/core';
import { Dependent } from '@features/dependents/models/dependent.model';
import { Employee } from '@features/employees/models/employee.model';
import {
  Company,
  ChildcareLeaveData,
  EgovCsvExportOptions,
  EgovShikakuShutokuExportOptions,
  GeppenData,
  MaternityLeaveData,
  SanteiData,
  SyouyoData,
} from '@features/statutory-reports/models/egov-export.model';
import { GeppenDataService } from '@features/statutory-reports/services/geppen-data.service';
import { ChildcareLeaveDataService } from '@features/statutory-reports/services/childcare-leave-data.service';
import { MaternityLeaveDataService } from '@features/statutory-reports/services/maternity-leave-data.service';
import { SanteiDataService } from '@features/statutory-reports/services/santei-data.service';
import { SyouyoDataService } from '@features/statutory-reports/services/syouyo-data.service';
import {
  formatEgovCreationDate,
  generateEgovHeader,
  generateGeppenData as buildGeppenDataRecord,
  generateSanteiKisoData as buildSanteiKisoDataRecord,
  generateShikakuShutokuData,
  generateShikakuSoshitsuData as buildShikakuSoshitsuDataRecord,
  generateSyouyoData as buildSyouyoDataRecord,
  joinEgovCsvLines,
} from '@features/statutory-reports/utils/egov-csv.utils';
import {
  buildFuyouIdouExportTargetsWithAgeLoss,
  FuyouIdouExportTarget,
} from '@features/statutory-reports/utils/fuyou-idou-data.utils';
import { generateFuyouIdouData as buildFuyouIdouDataRecord } from '@features/statutory-reports/utils/fuyou-idou-csv.utils';
import { generateSanzenSangoData as buildSanzenSangoDataRecord } from '@features/statutory-reports/utils/sanzen-sango-csv.utils';
import { generateIkujiKyugyoData as buildIkujiKyugyoDataRecord } from '@features/statutory-reports/utils/ikuji-kyugyo-csv.utils';
import { downloadShiftJisTextFile } from '@features/statutory-reports/utils/shift-jis-download.utils';

const DEFAULT_MEDIA_SEQ = '001';
const DEFAULT_FILENAME = 'SHFD0006.csv';

export interface EgovSanteiKisoExportOptions extends EgovCsvExportOptions {}
export interface EgovGeppenExportOptions extends EgovCsvExportOptions {}
export interface EgovSyouyoExportOptions extends EgovCsvExportOptions {}
export interface EgovFuyouIdouExportOptions extends EgovCsvExportOptions {}
export interface EgovSanzenSangoExportOptions extends EgovCsvExportOptions {}
export interface EgovIkujiKyugyoExportOptions extends EgovCsvExportOptions {}

@Injectable({
  providedIn: 'root',
})
export class EgovExportService {
  private readonly santeiDataService = inject(SanteiDataService);
  private readonly geppenDataService = inject(GeppenDataService);
  private readonly syouyoDataService = inject(SyouyoDataService);
  private readonly maternityLeaveDataService = inject(MaternityLeaveDataService);
  private readonly childcareLeaveDataService = inject(ChildcareLeaveDataService);
  /**
   * 被保険者資格喪失届（様式コード 2221700）のデータレコード 1 行を生成する。
   */
  generateShikakuSoshitsuData(employee: Employee, company: Company): string {
    return buildShikakuSoshitsuDataRecord(employee, company);
  }

  /**
   * 被保険者標準報酬月額算定基礎届（様式コード 2222700）のデータレコード 1 行を生成する。
   */
  generateSanteiKisoData(employee: Employee, company: Company, santeiData: SanteiData): string {
    return buildSanteiKisoDataRecord(employee, company, santeiData);
  }

  /**
   * 被保険者報酬月額変更届（様式コード 2221703）のデータレコード 1 行を生成する。
   */
  generateGeppenData(employee: Employee, company: Company, geppenData: GeppenData): string {
    return buildGeppenDataRecord(employee, company, geppenData);
  }

  /**
   * 被保険者賞与支払届（様式コード 2227700）のデータレコード 1 行を生成する。
   */
  generateSyouyoData(employee: Employee, company: Company, syouyoData: SyouyoData): string {
    return buildSyouyoDataRecord(employee, company, syouyoData);
  }

  /**
   * 被扶養者（異動）届（様式コード 2222701）のデータレコード 1 行を生成する。
   */
  generateFuyouIdouData(employee: Employee, company: Company, dependents: Dependent[]): string {
    return buildFuyouIdouDataRecord(employee, company, dependents);
  }

  /**
   * 産前産後休業取得者申出書／変更（終了）届（様式コード 2227708）のデータレコード 1 行を生成する。
   */
  generateSanzenSangoData(
    employee: Employee,
    company: Company,
    maternityData: MaternityLeaveData
  ): string {
    return buildSanzenSangoDataRecord(employee, company, maternityData);
  }

  /**
   * 育児休業等取得者申出書（新規・延長）／終了届（様式コード 2227709）のデータレコード 1 行を生成する。
   */
  generateIkujiKyugyoData(
    employee: Employee,
    company: Company,
    childcareData: ChildcareLeaveData
  ): string {
    return buildIkujiKyugyoDataRecord(employee, company, childcareData);
  }

  /**
   * 被保険者資格取得届を含む e-Gov CSV 全文（CRLF 改行）を生成する。
   */
  buildShikakuShutokuCsv(
    company: Company,
    employees: Employee[],
    options: EgovShikakuShutokuExportOptions = {}
  ): string {
    const creationDate = options.creationDate ?? formatEgovCreationDate();
    const mediaSeq = options.mediaSeq ?? DEFAULT_MEDIA_SEQ;
    const header = generateEgovHeader(company, creationDate, mediaSeq);
    const dataRecords = employees.map((employee) => generateShikakuShutokuData(employee, company));

    return joinEgovCsvLines(header, ...dataRecords);
  }

  /**
   * 被保険者資格喪失届を含む e-Gov CSV 全文（CRLF 改行）を生成する。
   */
  buildShikakuSoshitsuCsv(
    company: Company,
    employees: Employee[],
    options: EgovCsvExportOptions = {}
  ): string {
    const creationDate = options.creationDate ?? formatEgovCreationDate();
    const mediaSeq = options.mediaSeq ?? DEFAULT_MEDIA_SEQ;
    const header = generateEgovHeader(company, creationDate, mediaSeq);
    const dataRecords = employees.map((employee) => this.generateShikakuSoshitsuData(employee, company));

    return joinEgovCsvLines(header, ...dataRecords);
  }

  /**
   * 算定基礎届を含む e-Gov CSV 全文（CRLF 改行）を生成する。
   */
  buildSanteiKisoCsv(
    company: Company,
    employees: Employee[],
    santeiDataByEmployeeId: Map<string, SanteiData>,
    options: EgovSanteiKisoExportOptions = {}
  ): string {
    const creationDate = options.creationDate ?? formatEgovCreationDate();
    const mediaSeq = options.mediaSeq ?? DEFAULT_MEDIA_SEQ;
    const header = generateEgovHeader(company, creationDate, mediaSeq);
    const dataRecords = employees.map((employee) => {
      const santeiData = santeiDataByEmployeeId.get(employee.id);
      if (!santeiData) {
        throw new Error(`算定基礎データが見つかりません: ${employee.lastName}${employee.firstName}`);
      }

      return this.generateSanteiKisoData(employee, company, santeiData);
    });

    return joinEgovCsvLines(header, ...dataRecords);
  }

  /**
   * 月額変更届を含む e-Gov CSV 全文（CRLF 改行）を生成する。
   */
  buildGeppenCsv(
    company: Company,
    employees: Employee[],
    geppenDataByEmployeeId: Map<string, GeppenData>,
    options: EgovGeppenExportOptions = {}
  ): string {
    const creationDate = options.creationDate ?? formatEgovCreationDate();
    const mediaSeq = options.mediaSeq ?? DEFAULT_MEDIA_SEQ;
    const header = generateEgovHeader(company, creationDate, mediaSeq);
    const dataRecords = employees.map((employee) => {
      const geppenData = geppenDataByEmployeeId.get(employee.id);
      if (!geppenData) {
        throw new Error(`月額変更届データが見つかりません: ${employee.lastName}${employee.firstName}`);
      }

      return this.generateGeppenData(employee, company, geppenData);
    });

    return joinEgovCsvLines(header, ...dataRecords);
  }

  /**
   * 賞与支払届を含む e-Gov CSV 全文（CRLF 改行）を生成する。
   */
  buildSyouyoCsv(
    company: Company,
    employees: Employee[],
    syouyoDataByEmployeeId: Map<string, SyouyoData>,
    options: EgovSyouyoExportOptions = {}
  ): string {
    const creationDate = options.creationDate ?? formatEgovCreationDate();
    const mediaSeq = options.mediaSeq ?? DEFAULT_MEDIA_SEQ;
    const header = generateEgovHeader(company, creationDate, mediaSeq);
    const dataRecords = employees.map((employee) => {
      const syouyoData = syouyoDataByEmployeeId.get(employee.id);
      if (!syouyoData) {
        throw new Error(`賞与支払届データが見つかりません: ${employee.lastName}${employee.firstName}`);
      }

      return this.generateSyouyoData(employee, company, syouyoData);
    });

    return joinEgovCsvLines(header, ...dataRecords);
  }

  /**
   * 被扶養者（異動）届を含む e-Gov CSV 全文（CRLF 改行）を生成する。
   */
  buildFuyouIdouCsv(
    company: Company,
    targets: FuyouIdouExportTarget[],
    options: EgovFuyouIdouExportOptions = {}
  ): string {
    const creationDate = options.creationDate ?? formatEgovCreationDate();
    const mediaSeq = options.mediaSeq ?? DEFAULT_MEDIA_SEQ;
    const header = generateEgovHeader(company, creationDate, mediaSeq);
    const dataRecords = targets.map((target) =>
      this.generateFuyouIdouData(target.employee, company, target.dependents)
    );

    return joinEgovCsvLines(header, ...dataRecords);
  }

  /**
   * 産前産後休業取得者申出書を含む e-Gov CSV 全文（CRLF 改行）を生成する。
   */
  buildSanzenSangoCsv(
    company: Company,
    employees: Employee[],
    maternityDataByEmployeeId: Map<string, MaternityLeaveData>,
    options: EgovSanzenSangoExportOptions = {}
  ): string {
    const creationDate = options.creationDate ?? formatEgovCreationDate();
    const mediaSeq = options.mediaSeq ?? DEFAULT_MEDIA_SEQ;
    const header = generateEgovHeader(company, creationDate, mediaSeq);
    const dataRecords = employees.map((employee) => {
      const maternityData = maternityDataByEmployeeId.get(employee.id);
      if (!maternityData) {
        throw new Error(
          `産前産後休業データが見つかりません: ${employee.lastName}${employee.firstName}`
        );
      }

      return this.generateSanzenSangoData(employee, company, maternityData);
    });

    return joinEgovCsvLines(header, ...dataRecords);
  }

  /**
   * 育児休業等取得者申出書を含む e-Gov CSV 全文（CRLF 改行）を生成する。
   */
  buildIkujiKyugyoCsv(
    company: Company,
    employees: Employee[],
    childcareDataByEmployeeId: Map<string, ChildcareLeaveData>,
    options: EgovIkujiKyugyoExportOptions = {}
  ): string {
    const creationDate = options.creationDate ?? formatEgovCreationDate();
    const mediaSeq = options.mediaSeq ?? DEFAULT_MEDIA_SEQ;
    const header = generateEgovHeader(company, creationDate, mediaSeq);
    const dataRecords = employees.map((employee) => {
      const childcareData = childcareDataByEmployeeId.get(employee.id);
      if (!childcareData) {
        throw new Error(
          `育児休業データが見つかりません: ${employee.lastName}${employee.firstName}`
        );
      }

      return this.generateIkujiKyugyoData(employee, company, childcareData);
    });

    return joinEgovCsvLines(header, ...dataRecords);
  }

  /**
   * 被保険者資格取得届 CSV を Shift_JIS でダウンロードする。
   */
  downloadShikakuShutokuCsv(
    company: Company,
    employees: Employee[],
    options: EgovShikakuShutokuExportOptions = {}
  ): void {
    const csvContent = this.buildShikakuShutokuCsv(company, employees, options);
    const filename = options.filename ?? DEFAULT_FILENAME;
    downloadShiftJisTextFile(csvContent, filename);
  }

  /**
   * 被保険者資格喪失届 CSV を Shift_JIS でダウンロードする。
   */
  downloadShikakuSoshitsuCsv(
    company: Company,
    employees: Employee[],
    options: EgovCsvExportOptions = {}
  ): void {
    const csvContent = this.buildShikakuSoshitsuCsv(company, employees, options);
    const filename = options.filename ?? DEFAULT_FILENAME;
    downloadShiftJisTextFile(csvContent, filename);
  }

  /**
   * 算定基礎届 CSV を Shift_JIS でダウンロードする。
   * 給与データ（4〜6月）を取得して SanteiData を組み立て、53項目のデータレコードを出力する。
   */
  async downloadSanteiKisoCsv(
    company: Company,
    employees: Employee[],
    targetYear: number,
    options: EgovSanteiKisoExportOptions = {}
  ): Promise<void> {
    const santeiDataByEmployeeId = await this.santeiDataService.buildSanteiDataForEmployees(
      employees,
      targetYear
    );
    const csvContent = this.buildSanteiKisoCsv(company, employees, santeiDataByEmployeeId, options);
    const filename = options.filename ?? DEFAULT_FILENAME;
    downloadShiftJisTextFile(csvContent, filename);
  }

  /**
   * 月額変更届 CSV を Shift_JIS でダウンロードする。
   */
  async downloadGeppenCsv(
    company: Company,
    employees: Employee[],
    revisionYearMonth: string,
    options: EgovGeppenExportOptions = {}
  ): Promise<void> {
    const geppenDataByEmployeeId = await this.geppenDataService.buildGeppenDataForEmployees(
      employees,
      revisionYearMonth
    );
    const csvContent = this.buildGeppenCsv(company, employees, geppenDataByEmployeeId, options);
    const filename = options.filename ?? DEFAULT_FILENAME;
    downloadShiftJisTextFile(csvContent, filename);
  }

  /**
   * 賞与支払届 CSV を Shift_JIS でダウンロードする。
   */
  async downloadSyouyoCsv(
    company: Company,
    employees: Employee[],
    paymentDate: string,
    options: EgovSyouyoExportOptions = {}
  ): Promise<void> {
    const syouyoDataByEmployeeId = await this.syouyoDataService.buildSyouyoDataForEmployees(
      employees,
      paymentDate
    );
    const csvContent = this.buildSyouyoCsv(company, employees, syouyoDataByEmployeeId, options);
    const filename = options.filename ?? DEFAULT_FILENAME;
    downloadShiftJisTextFile(csvContent, filename);
  }

  /**
   * 被扶養者（異動）届 CSV を Shift_JIS でダウンロードする。
   */
  downloadFuyouIdouCsv(
    company: Company,
    employees: Employee[],
    options: EgovFuyouIdouExportOptions = {}
  ): void {
    const targets = buildFuyouIdouExportTargetsWithAgeLoss(employees);
    const csvContent = this.buildFuyouIdouCsv(company, targets, options);
    const filename = options.filename ?? DEFAULT_FILENAME;
    downloadShiftJisTextFile(csvContent, filename);
  }

  /**
   * 産前産後休業取得者申出書 CSV を Shift_JIS でダウンロードする。
   */
  downloadSanzenSangoCsv(
    company: Company,
    employees: Employee[],
    options: EgovSanzenSangoExportOptions = {}
  ): void {
    const maternityDataByEmployeeId =
      this.maternityLeaveDataService.buildMaternityLeaveDataForEmployees(employees);
    const csvContent = this.buildSanzenSangoCsv(company, employees, maternityDataByEmployeeId, options);
    const filename = options.filename ?? DEFAULT_FILENAME;
    downloadShiftJisTextFile(csvContent, filename);
  }

  /**
   * 育児休業等取得者申出書 CSV を Shift_JIS でダウンロードする。
   */
  downloadIkujiKyugyoCsv(
    company: Company,
    employees: Employee[],
    options: EgovIkujiKyugyoExportOptions = {}
  ): void {
    const childcareDataByEmployeeId =
      this.childcareLeaveDataService.buildChildcareLeaveDataForEmployees(employees);
    const csvContent = this.buildIkujiKyugyoCsv(company, employees, childcareDataByEmployeeId, options);
    const filename = options.filename ?? DEFAULT_FILENAME;
    downloadShiftJisTextFile(csvContent, filename);
  }
}
