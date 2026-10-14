/**
 * AI Debug Evidence Package - Browser Collector
 * 嵌入网站后，自动监听表单提交失败并生成证据包
 */

import { buildPackage, generateMarkdownPackage } from './generator';
import { ActionStep, ConsoleError, NetworkFailure, DomSnapshot, EnvironmentInfo, redactValue, isSensitiveField } from './types';

class FormFailureCollector {
  private actions: ActionStep[] = [];
  private consoleErrors: ConsoleError[] = [];
  private networkFailures: NetworkFailure[] = [];
  private endpoint?: string;

  constructor(endpoint?: string) {
    this.endpoint = endpoint;
    this.setupListeners();
  }

  private setupListeners() {
    document.addEventListener('submit', this.handleSubmit.bind(this), true);
    document.addEventListener('input', this.handleInput.bind(this), true);
    this.interceptConsole();
    this.interceptNetwork();
  }

  private handleInput(e: Event) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target.name && !target.id) return;
    const fieldName = target.name || target.id;
    if (isSensitiveField(fieldName)) return;

    const selector = this.getSelector(target);
    const value = redactValue(target.value, fieldName);

    const last = this.actions[this.actions.length - 1];
    if (last && last.type === 'input' && last.selector === selector && Date.now() - last.timestamp < 800) {
      last.value = value;
      last.timestamp = Date.now();
      return;
    }

    this.actions.push({
      type: 'input',
      timestamp: Date.now(),
      detail: `输入字段 ${fieldName}`,
      selector,
      value
    });
  }

  private async handleSubmit(e: Event) {
    const form = e.target as HTMLFormElement;
    if (!form || form.tagName !== 'FORM') return;

    this.actions.push({
      type: 'submit',
      timestamp: Date.now(),
      detail: '点击提交表单',
      selector: this.getSelector(form)
    });

    setTimeout(() => this.checkAndReport(form), 3000);
  }

  private checkAndReport(form: HTMLFormElement) {
    const hasFailure = this.networkFailures.length > 0 || this.consoleErrors.length > 0;
    if (!hasFailure) return;

    const pkg = buildPackage({
      url: window.location.href,
      actionSequence: this.actions.slice(-15),
      consoleErrors: this.consoleErrors.slice(-5),
      networkFailures: this.networkFailures.slice(-3),
      domSnapshot: this.captureDomSnapshot(form),
      environment: this.captureEnvironment()
    });

    const markdown = generateMarkdownPackage(pkg);
    console.log('[AI Debug Evidence Package]', markdown);

    if (this.endpoint) this.sendReport(pkg, markdown);

    this.networkFailures = [];
    this.consoleErrors = [];
  }

  private captureDomSnapshot(form: HTMLFormElement): DomSnapshot {
    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement | null;
    const fields = Array.from(form.querySelectorAll('input, textarea, select')).map(el => {
      const input = el as HTMLInputElement;
      const name = input.name || input.id || 'unknown';
      return {
        name,
        selector: this.getSelector(input),
        valueLength: isSensitiveField(name) ? 0 : (input.value?.length || 0),
        type: input.type || el.tagName.toLowerCase()
      };
    });

    return {
      formSelector: this.getSelector(form),
      submitButton: submitBtn ? {
        selector: this.getSelector(submitBtn),
        text: submitBtn.textContent?.trim() || (submitBtn as HTMLInputElement).value || ''
      } : undefined,
      relevantFields: fields
    };
  }

  private captureEnvironment(): EnvironmentInfo {
    return {
      browser: this.getBrowserName(),
      os: this.getOS(),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      url: window.location.href,
      userAgent: navigator.userAgent
    };
  }

  private getSelector(el: Element): string {
    if (el.id) return `#${el.id}`;
    if ((el as HTMLInputElement).name) return `[name="${(el as HTMLInputElement).name}"]`;
    return el.tagName.toLowerCase();
  }

  private getBrowserName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private getOS(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return 'Unknown';
  }

  private interceptConsole() {
    const originalError = console.error;
    console.error = (...args: any[]) => {
      this.consoleErrors.push({
        message: args.map(a => String(a)).join(' '),
        timestamp: Date.now()
      });
      originalError.apply(console, args);
    };
  }

  private interceptNetwork() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const start = Date.now();
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      const method = ((args[1]?.method) || 'GET').toUpperCase();

      try {
        const response = await originalFetch(...args);
        if (!response.ok && response.status >= 400) {
          let snippet = '';
          try {
            const text = await response.clone().text();
            snippet = text.slice(0, 300);
          } catch {}
          this.networkFailures.push({
            url, method, status: response.status,
            statusText: response.statusText,
            duration: Date.now() - start,
            responseSnippet: snippet
          });
        }
        return response;
      } catch (err) {
        this.networkFailures.push({
          url, method, status: 0,
          statusText: 'Network Error',
          duration: Date.now() - start
        });
        throw err;
      }
    };

    const OriginalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new OriginalXHR();
      const start = Date.now();
      let method = 'GET';
      let url = '';

      const originalOpen = xhr.open;
      xhr.open = function(m: string, u: string) {
        method = m.toUpperCase();
        url = u;
        return originalOpen.apply(xhr, arguments as any);
      };

      xhr.addEventListener('loadend', () => {
        if (xhr.status >= 400 || xhr.status === 0) {
          this.networkFailures.push({
            url, method,
            status: xhr.status,
            statusText: xhr.statusText || 'Error',
            duration: Date.now() - start,
            responseSnippet: (xhr.responseText || '').slice(0, 300)
          });
        }
      });

      return xhr;
    } as any;
  }

  private async sendReport(pkg: any, markdown: string) {
    if (!this.endpoint) return;
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: pkg, markdown })
      });
    } catch (e) {
      console.warn('[AI Debug Evidence Package] Failed to send report', e);
    }
  }
}

function init() {
  const script = document.currentScript as HTMLScriptElement | null;
  const endpoint = script?.dataset.endpoint;
  new FormFailureCollector(endpoint);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { FormFailureCollector };
