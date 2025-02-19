import { BaseSimpleHometaxReqeust } from './base-simple-hometax-request.interface'

export interface SimpleHometaxBusinessCertificateApiReqData
  extends BaseSimpleHometaxReqeust {
  BusinessNumber: string
  EnglCvaAplnYn: string
  ResnoOpYn: string
  IssueType: string
  Organization: string
}
