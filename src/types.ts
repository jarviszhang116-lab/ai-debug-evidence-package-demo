/**
 * AI Debug Evidence Package - Core Collector
 * 第一版：专注表单提交失败时生成 AI-ready Debug Package
 */

export interface ActionStep {
  type: 'navigation' | 'input' | 'click' | 'submit';
  timestamp: number;
  detail: string;
  selector?: string;
  value?: string;
}

export interface NetworkFailure {
  url: string;
  method: string;
  status: number;
  statusText: string;
  duration: number;
  responseSnippet?: string;
}

export interface ConsoleError {
  message: string;
  stack?: string;
  timestamp: number;
}

export interface DomSnapshot {
  formSelector?: string;
  submitButton?: {
    selector: string;
    text: string;
  };
  relevantFields?: Array<{
    name: string;
    selector: string;
    valueLength: number;
    type: string;
  }>;
}

export interface EnvironmentInfo {
  browser: string;
  os: string;
  viewport: string;
  url: string;
  userAgent: string;
}

export interface DebugEvidencePackage {
  id: string;
  timestamp: string;
  failureType: string;
  url: string;
  actionSequence: ActionStep[];
  consoleErrors: ConsoleError[];
  networkFailures: NetworkFailure[];
  domSnapshot: DomSnapshot;
  environment: EnvironmentInfo;
  summary: string;
}

const SENSITIVE_FIELD_NAMES = [
  'password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey',
  'credit_card', 'card_number', 'cvv', 'cvc', 'ssn', 'authorization',
  'auth', 'session', 'cookie', 'pin', 'otp'
];

export function isSensitiveField(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_FIELD_NAMES.some(s => lower.includes(s));
}

export function redactValue(value: string, fieldName?: string): string {
  if (!value) return '';
  if (fieldName && isSensitiveField(fieldName)) {
    return '[REDACTED]';
  }
  if (value.length > 100) {
    return value.slice(0, 50) + '...[truncated]';
  }
  return value;
}

export function generatePackageId(): string {
  return `fail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function detectFailureType(networkFailures: NetworkFailure[], consoleErrors: ConsoleError[]): string {
  if (networkFailures.some(n => n.status >= 500)) return 'Server Error (5xx)';
  if (networkFailures.some(n => n.status === 401 || n.status === 403)) return 'Authorization Error';
  if (networkFailures.some(n => n.status === 400 || n.status === 422)) return 'Validation Error';
  if (networkFailures.some(n => n.status === 404)) return 'Not Found (404)';
  if (networkFailures.length > 0) return 'Network Error';
  if (consoleErrors.length > 0) return 'JavaScript Error';
  return 'Unknown Failure';
}
