declare module 'promptpay' {
  export interface PromptPayOptions {
    merchantName?: string;
    countryCode?: string;
  }
  export default class PromptPay {
    constructor(id: string);
    generatePayload(amount: number, options?: PromptPayOptions): string;
  }
}