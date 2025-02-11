// 수정부분
// 1. 스네이크케이스 -> 카멜케이스 변경
//   (1) initializeBasicData 메소드 (185 ~ 209)
//   (2) processBusinessIncome 메소드 (228)
//   (3) processDeductions 메소드 (244)
//   (4) processTaxCreditsAndReductions 메소드 (260, 265)
//   (5) calculateIncludedTaxes 메소드 (279 ~ 285)
// 2. processHometaxData 메소드 수정 (140 ~) 및 69, 70 번 줄 및 120 ~ 134번 줄 주석처리
import { getRectificationPeriod } from 'src/common/util/rectificationPeriod'
import {
  HometaxFillingPerson,
  ReportPerson,
  COMMON_FILLING_TYPE,
  EXPENSE_RATE_FILLING_TYPE,
  TAX_CODES,
  TAX_REDUCTION_CODES,
  ValidationError,
} from './hometax-filling.type'

export class ProcessHometaxFilling {
  private static toNumber(value: string | number): number {
    return typeof value === 'string' ? Number(value) : value
  }

  private static filterAndSumByCode(
    rows: Array<{ Amount?: string; ereCd?: string; ereAmt?: string }>,
    codes: Record<string, boolean>,
  ): number {
    return rows
      .filter(row => codes[row.ereCd])
      .reduce((acc, row) => acc + this.toNumber(row.ereAmt), 0)
  }

  private static getReportByName(
    reports: ReportPerson[],
    reportName: string,
  ): ReportPerson | undefined {
    console.log('searching for:', reportName)

    reports.forEach(report => {
      console.log('checking:', report.ReportName)
      console.log('includes?:', report.ReportName?.includes(reportName))
      report.ReportName?.includes(reportName)
    })

    // console.log('get report name', reportName)
    // console.log('reports', reports)
    if (!reports) {
      console.log('get report name error')
      return undefined
    }

    return reports.find(report => report.ReportName?.includes(reportName))
  }

  private static validateFillingType(
    rptFirstPage: ReportPerson,
  ): string | ValidationError {
    const fillingType = rptFirstPage.ttirndm001DVO.inctxRtnTypeCd
    if (COMMON_FILLING_TYPE[fillingType]) return 'COMMON_REPORT'
    else if (EXPENSE_RATE_FILLING_TYPE[fillingType])
      return 'EXPENSE_RATE_REPORT'
    else return { message: '사업자가 아닙니다', code: 'NOT_BUSINESS' }
  }

  private static validateReports(
    reports: ReportPerson[],
    yearIdx: number,
  ): ValidationError | null {
    const requiredReports = {
      납부계산서: true,
      사업소득명세서: yearIdx > 0,
      종합소득금액및결손금이월결손금공제명세서: yearIdx > 0,
      // 소득공제명세서: yearIdx > 0,
      // 세액공제명세서: yearIdx > 0,
    }

    for (const [reportName, isRequired] of Object.entries(requiredReports)) {
      if (isRequired && !this.getReportByName(reports, reportName)) {
        return {
          message: `전자신고결과조회 데이터에 오류가 있습니다.\n오류내용: ${reportName} 페이지가 조회되지 않습니다.`,
          code: 'MISSING_REPORT',
        }
      }
    }

    if (yearIdx > 0) {
      const structureError = this.validateReportStructures(reports)
      if (structureError) return structureError
    }

    return null
  }

  private static validateReportStructures(
    reports: ReportPerson[],
  ): ValidationError | null {
    const thirdPage = this.getReportByName(
      reports,
      '종합소득금액및결손금이월결손금공제명세서',
    )

    if (thirdPage) {
      if (!thirdPage.ttirndl012DVOList?.rows) {
        return {
          message:
            '종합소득금액및결손금이월결손금공제명세서의 데이터 구조가 올바르지 않습니다.',
          code: 'INVALID_STRUCTURE',
        }
      }

      const hasBusinessIncome = thirdPage.ttirndl012DVOList.rows.some(
        row => row.incClCd === '40' && row.incAmt,
      )

      if (!hasBusinessIncome) {
        return {
          message:
            '종합소득금액및결손금이월결손금공제명세서에서 사업소득 데이터를 찾을 수 없습니다.',
          code: 'NO_BUSINESS_INCOME',
        }
      }
    }

    // const fifthPage = this.getReportByName(reports, '세액공제명세서')
    // if (fifthPage && !fifthPage.txamtDdcReSpecBrkdDVOList?.rows) {
    //   return {
    //     message: '세액공제명세서의 데이터 구조가 올바르지 않습니다.',
    //     code: 'INVALID_STRUCTURE',
    //   }
    // }

    // const fourthPage = this.getReportByName(reports, '소득공제명세서')
    // if (fourthPage && !fourthPage.Items) {
    //   return {
    //     message: '소득공제명세서의 데이터 구조가 올바르지 않습니다.',
    //     code: 'INVALID_STRUCTURE',
    //   }
    // }

    return null
  }

  public static processHometaxFillingData(reports: ReportPerson[]): {
    data: HometaxFillingPerson | null
    error: ValidationError | null
  } {
    try {
      const rptFirstPage = this.getReportByName(reports, '납부계산서')
      if (!rptFirstPage) {
        return {
          data: null,
          error: {
            message: '납부계산서를 찾을 수 없습니다.',
            code: 'MISSING_REPORT',
          },
        }
      }

      const reportYear = Number(
        rptFirstPage.ttirnam101DVO.txnrmStrtDt.slice(0, 4),
      )
      const { startYear } = getRectificationPeriod(false) // 추후 공인인증 가능하게 바뀌면 companyType에 따라 분기타게 수정 필요
      const yearIdx = reportYear - startYear + 1

      // 일반신고, 간편장부 인지 추계신고인지 확인
      const reportType = this.validateFillingType(rptFirstPage)

      // 일반신고 및 간편장부 인 경우 -> 정상 처리
      if (reportType === 'COMMON_REPORT') {
        const validationError = this.validateReports(reports, yearIdx)
        if (validationError) {
          console.log(
            `${reportYear}년도 전자신고내역 관련 오류 : ${validationError.message}`,
          )
          return { data: null, error: null }
        }

        const result = this.initializeBasicData(rptFirstPage, yearIdx)

        if (yearIdx > 0) {
          this.processBusinessIncome(reports, result, yearIdx)
          this.processDeductions(reports, result, yearIdx)
          this.processTaxCreditsAndReductions(reports, result, yearIdx)
        }

        return { data: result, error: null }

        // 추계신고 인 경우 : 해당연도 경정청구 계산 제외 (대상 아님)
      } else if (reportType === 'EXPENSE_RATE_REPORT') {
        console.log(`${reportYear}년 : 추계신고로 인해 해당 연도는 계산 제외`)
        return { data: null, error: null }

        // 비사업자 인 경우 : 해당연도 경정청구 계산 제외 (대상 아님)
      } else {
        console.log(
          `${reportYear}년 : 경정청구 대상 사업자가 아님. 해당 연도는 계산 제외`,
        )
        return { data: null, error: null }
      }
    } catch (error) {
      return {
        data: null,
        error: {
          message:
            error instanceof Error
              ? error.message
              : '데이터 처리 중 오류가 발생했습니다.',
          code: 'PROCESSING_ERROR',
        },
      }
    }
  }

  private static initializeBasicData(
    rptFirstPage: ReportPerson,
    yearIdx: number,
  ): HometaxFillingPerson {
    return {
      [`accountDutyYear${yearIdx}`]: rptFirstPage.ttirndm001DVO.bkpDutyClCd,
      [`fillingTypeYear${yearIdx}`]: rptFirstPage.ttirndm001DVO.inctxRtnTypeCd,
      [`totalIncomeYear${yearIdx}`]: this.toNumber(
        rptFirstPage.ttirndm001DVO.agiAmt,
      ),
      [`taxationStandardYear${yearIdx}`]: this.toNumber(
        rptFirstPage.ttirnam101DVO.stasAmt,
      ),
      [`calculatedTaxYear${yearIdx}`]: this.toNumber(
        rptFirstPage.ttirnam101DVO.cmptTxamt,
      ),
      [`taxReductionYear${yearIdx}`]: this.toNumber(
        rptFirstPage.ttirnam101DVO.reTxamt,
      ),
      [`taxCreditYear${yearIdx}`]: this.toNumber(
        rptFirstPage.ttirnam101DVO.ddcTxamt,
      ),
      [`determinedTaxYear${yearIdx}`]: this.toNumber(
        rptFirstPage.ttirnam101DVO.dcsTxamt,
      ),
      [`additionalTaxYear${yearIdx}`]: 0, // 수정 필요
      [`prePaidTaxYear${yearIdx}`]: this.toNumber(
        rptFirstPage.ttirnam101DVO.ppmTxamt,
      ),
      [`paidAgriculturalTaxYear${yearIdx}`]:
        rptFirstPage.ttirnam101DVO.fnftxSbtrScpmTxamt,
    }
  }

  private static processBusinessIncome(
    reports: ReportPerson[],
    result: HometaxFillingPerson,
    yearIdx: number,
  ): void {
    const rptThirdPage = this.getReportByName(
      reports,
      '종합소득금액및결손금이월결손금공제명세서',
    )
    const businessIncome = this.toNumber(
      rptThirdPage?.ttirndl012DVOList?.rows.find(row => row.incClCd === '40')
        ?.incAmt || '0',
    )

    result[`businessIncomeYear${yearIdx}`] = businessIncome
    // result[`business_income_rate_year${yearIdx}`] = this.calculateRate(
    //   businessIncome,
    //   result[`total_income_year${yearIdx}`] as number,
    // )
  }

  private static processDeductions(
    reports: ReportPerson[],
    result: HometaxFillingPerson,
    yearIdx: number,
  ): void {
    const rptFourthPage = this.getReportByName(reports, '소득공제명세서')
    if (rptFourthPage?.Items) {
      result[`incomeDeductionYear${yearIdx}`] =
        this.filterAndSumByCode(rptFourthPage.Items, TAX_REDUCTION_CODES) ?? 0
    }
  }

  private static processTaxCreditsAndReductions(
    reports: ReportPerson[],
    result: HometaxFillingPerson,
    yearIdx: number,
  ): void {
    const rptFifthPage = this.getReportByName(reports, '세액공제명세서')
    if (rptFifthPage?.txamtDdcReSpecBrkdDVOList?.rows) {
      const rows = rptFifthPage.txamtDdcReSpecBrkdDVOList.rows

      result[`taxReductionExcludedYear${yearIdx}`] =
        this.filterAndSumByCode(rows, TAX_CODES.REDUCTION) ?? 0

      result[`taxCreditExcludedYear${yearIdx}`] =
        this.filterAndSumByCode(rows, TAX_CODES.CREDIT) ?? 0

      this.calculateIncludedTaxes(result, yearIdx)
    }
  }

  private static calculateIncludedTaxes(
    result: HometaxFillingPerson,
    yearIdx: number,
  ): void {
    result[`taxReductionIncludedYear${yearIdx}`] =
      (result[`taxReductionYear${yearIdx}`] as number) -
      (result[`taxReductionExcludedYear${yearIdx}`] as number)

    result[`taxCreditIncludedYear${yearIdx}`] =
      (result[`taxCreditYear${yearIdx}`] as number) -
      (result[`taxCreditExcludedYear${yearIdx}`] as number)
  }
}
