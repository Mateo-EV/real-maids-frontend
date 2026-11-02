export class WebForm {
  private constructor(
    public id: number,
    public leadId: number | null,
    public name: string,
    public email: string | null,
    public phone: string | null,
    public message: string | null,
    public originIp: string | null,
    public isProcessed: boolean,
    public submittedAt: Date
  ) {}

  static create(
    id: number,
    leadId: number | null,
    name: string,
    email: string | null,
    phone: string | null,
    message: string | null,
    originIp: string | null,
    isProcessed: boolean,
    submittedAt: Date
  ): WebForm {
    return new WebForm(id, leadId, name, email, phone, message, originIp, isProcessed, submittedAt)
  }
}
