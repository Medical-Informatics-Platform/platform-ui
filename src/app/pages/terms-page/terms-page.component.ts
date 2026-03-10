import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TermsService } from '../../services/terms.service';

@Component({
  selector: 'app-terms-page',
  imports: [FormsModule],
  templateUrl: './terms-page.component.html',
  styleUrls: ['./terms-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TermsPageComponent implements OnInit {
  private http = inject(HttpClient);
  private termsService = inject(TermsService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  tosHtml: string | null = null;
  accepted = false;
  loading = true;
  loadError = false;
  acceptError = false;
  submitting = false;

  constructor() { }

  ngOnInit(): void {
    this.accepted = Boolean(this.authService.currentUser?.agreeNDA);
    this.http.get('assets/tos.md', { responseType: 'text' }).subscribe({
      next: (markdown) => {
        const cleaned = this.stripIntro(this.stripGeneralTermsHeading(markdown));
        const html = this.markdownToHtml(cleaned);
        this.tosHtml = html;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
        this.cdr.markForCheck();
      }
    });
  }

  onProceed(): void {
    if (!this.accepted || this.submitting) {
      return;
    }

    const navigateToDashboard = () => {
      const redirect = this.termsService.consumeRedirectUrl() || '/experiments-dashboard';
      this.router.navigateByUrl(redirect).then((navigated) => {
        if (!navigated) {
          this.submitting = false;
          this.cdr.markForCheck();
        }
      }).catch(() => {
        this.submitting = false;
        this.cdr.markForCheck();
      });
    };

    if (this.authService.currentUser?.agreeNDA) {
      navigateToDashboard();
      return;
    }

    this.acceptError = false;
    this.submitting = true;
    this.cdr.markForCheck();

    this.http.post('/services/activeUser/agreeNDA', {}).subscribe({
      next: () => {
        this.authService.markTermsAccepted();
        navigateToDashboard();
      },
      error: () => {
        this.submitting = false;
        this.acceptError = true;
        this.cdr.markForCheck();
      }
    });
  }

  private markdownToHtml(markdown: string): string {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const html: string[] = [];
    const listStack: Array<{ type: 'ol' | 'ul'; openItem: boolean }> = [];
    let paragraph: string[] = [];

    const flushParagraph = () => {
      if (paragraph.length === 0) {
        return;
      }
      const text = this.formatInline(paragraph.join(' '));
      html.push(`<p>${text}</p>`);
      paragraph = [];
    };

    const closeLists = (targetDepth = 0) => {
      while (listStack.length > targetDepth) {
        const list = listStack.pop();
        if (list?.openItem) {
          html.push('</li>');
        }
        if (list) {
          html.push(`</${list.type}>`);
        }
      }
    };

    const closeOpenItemAtDepth = (depth: number) => {
      const list = listStack[depth - 1];
      if (list?.openItem) {
        html.push('</li>');
        list.openItem = false;
      }
    };

    const openList = (type: 'ol' | 'ul', depth: number) => {
      while (listStack.length < depth) {
        html.push(`<${type}>`);
        listStack.push({ type, openItem: false });
      }
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '&nbsp;') {
        flushParagraph();
        closeLists();
        html.push('<div class="tos-spacer"></div>');
        continue;
      }

      const next = lines[i + 1]?.trim() ?? '';
      if (trimmed && next && /^=+$/.test(next)) {
        flushParagraph();
        closeLists();
        html.push(`<h1>${this.formatInline(trimmed)}</h1>`);
        i += 1;
        continue;
      }
      if (trimmed && next && /^-+$/.test(next)) {
        flushParagraph();
        closeLists();
        html.push(`<h2>${this.formatInline(trimmed)}</h2>`);
        i += 1;
        continue;
      }

      if (!trimmed) {
        flushParagraph();
        continue;
      }

      const listMatch = line.match(/^(\s*)(\d+\.|[-*])\s+(.+)$/);
      if (listMatch) {
        flushParagraph();
        const indent = listMatch[1].length;
        const depth = Math.floor(indent / 4) + 1;
        const marker = listMatch[2];
        const content = listMatch[3];
        const type: 'ol' | 'ul' = marker.endsWith('.') ? 'ol' : 'ul';
        if (depth > listStack.length) {
          openList(type, depth);
        } else {
          closeLists(depth);
          if (listStack[depth - 1]?.type !== type) {
            closeLists(depth - 1);
            openList(type, depth);
          }
        }
        closeOpenItemAtDepth(depth);
        html.push(`<li>${this.formatInline(content)}`);
        listStack[depth - 1].openItem = true;
        continue;
      }

      if (listStack.length > 0 && /^\s{4,}/.test(line)) {
        html.push(`<p>${this.formatInline(trimmed)}</p>`);
        continue;
      }

      closeLists();
      paragraph.push(trimmed);
    }

    flushParagraph();
    closeLists();
    return html.join('\n');
  }

  private stripIntro(markdown: string): string {
    const normalized = markdown.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const titleIndex = lines.findIndex((line) => line.trim() === 'EBRAINS Medical Informatics Platform (MIP)');
    if (titleIndex === -1 || lines.length < titleIndex + 2) {
      return normalized;
    }
    const underlineIndex = titleIndex + 1;
    const spacerIndex = titleIndex + 3;
    if (!/^=+$/.test(lines[underlineIndex]?.trim() ?? '')) {
      return normalized;
    }
    if (lines[titleIndex + 2]?.trim() === '' && lines[spacerIndex]?.trim() === '&nbsp;') {
      return lines.slice(spacerIndex + 1).join('\n');
    }
    if (lines[titleIndex + 2]?.trim() === '&nbsp;') {
      return lines.slice(titleIndex + 3).join('\n');
    }
    return lines.slice(titleIndex + 2).join('\n');
  }

  private stripGeneralTermsHeading(markdown: string): string {
    const normalized = markdown.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const titleIndex = lines.findIndex((line) => line.trim() === 'General Terms and Conditions');
    if (titleIndex === -1 || lines.length < titleIndex + 2) {
      return normalized;
    }
    const underlineIndex = titleIndex + 1;
    if (!/^-+$/.test(lines[underlineIndex]?.trim() ?? '')) {
      return normalized;
    }
    if (lines[titleIndex + 2]?.trim() === '' && lines[titleIndex + 3]?.trim() === '&nbsp;') {
      return lines.slice(titleIndex + 4).join('\n');
    }
    if (lines[titleIndex + 2]?.trim() === '&nbsp;') {
      return lines.slice(titleIndex + 3).join('\n');
    }
    return lines.slice(titleIndex + 2).join('\n');
  }

  private formatInline(text: string): string {
    const escaped = this.escapeHtml(text);
    return escaped
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\[([^\]]+)\]\((mailto:[^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/&lt;u&gt;/gi, '<u>')
      .replace(/&lt;\/u&gt;/gi, '</u>');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&(?!#?[a-zA-Z0-9]+;)/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
