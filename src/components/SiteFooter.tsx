import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/Logo';
import { SUPPORT, telegramUrl } from '@/lib/legal';
import { TIERS_ENABLED } from '@/lib/tiers';
import { FEATURED_TOOLS, TOOLS_HUB, toolPage } from '@/lib/toolPages';

/** The site colours of the public pages and the calculators (`.site-page`, index.css): light or dark for the visit. */
const T = {
  footer: 'border-site-line bg-site-bg text-site-fg',
  link: 'text-site-muted hover:text-site-fg',
  title: 'text-site-fg',
  text: 'text-site-muted',
  faint: 'text-site-faint',
  line: 'border-site-line',
} as const;

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  const className = `${T.link} transition-colors`;
  return (
    <li>
      {/^(https?:|mailto:)/.test(to) ? (
        <a href={to} className={className} target={to.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
          {children}
        </a>
      ) : (
        <Link to={to} className={className}>
          {children}
        </Link>
      )}
    </li>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title}>
      <p className={`font-medium ${T.title}`}>{title}</p>
      <ul className="mt-4 space-y-3">{children}</ul>
    </nav>
  );
}

/** The footer of the public pages (landing, calculators, documents): sections, calculators, account, documents, support. */
export function SiteFooter() {
  const t = T;
  return (
    <footer className={`border-t font-geist text-sm ${t.footer}`}>
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-2 gap-x-6 gap-y-12 px-5 pt-16 pb-10 sm:px-6 md:grid-cols-3 lg:grid-cols-[1.6fr_repeat(5,minmax(0,1fr))]">
        <div className="col-span-2 md:col-span-3 lg:col-span-1">
          <Logo className={t.title} />
          <p className={`mt-5 max-w-xs leading-relaxed ${t.text}`}>
            3D-планирование загрузки фуры и контейнера: раскладка, вес, центр тяжести и PDF-схема для водителя.
          </p>
        </div>
        <Column title="Продукт">
          <FooterLink to="/#features">Возможности</FooterLink>
          <FooterLink to="/#how">Как это работает</FooterLink>
          {TIERS_ENABLED && <FooterLink to="/#pricing">Тарифы</FooterLink>}
          <FooterLink to="/#faq">Вопросы</FooterLink>
        </Column>
        <Column title="Калькуляторы">
          {FEATURED_TOOLS.map((id) => (
            <FooterLink key={id} to={toolPage(id).path}>
              {toolPage(id).name}
            </FooterLink>
          ))}
          <FooterLink to={TOOLS_HUB.path}>Все калькуляторы</FooterLink>
        </Column>
        <Column title="Аккаунт">
          <FooterLink to="/login">Войти</FooterLink>
          <FooterLink to="/register">Регистрация</FooterLink>
          <FooterLink to="/#contact">Оставить заявку</FooterLink>
        </Column>
        <Column title="Документы">
          <FooterLink to="/terms">Пользовательское соглашение</FooterLink>
          <FooterLink to="/privacy">Политика конфиденциальности</FooterLink>
        </Column>
        <Column title="Поддержка">
          <FooterLink to={telegramUrl}>Telegram @{SUPPORT.telegram}</FooterLink>
          <FooterLink to={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</FooterLink>
          <li className={`first-letter:uppercase ${t.faint}`}>{SUPPORT.hours}</li>
        </Column>
        <div
          className={`col-span-2 flex flex-col gap-2 border-t pt-8 sm:flex-row sm:justify-between md:col-span-3 lg:col-span-6 ${t.line} ${t.faint}`}
        >
          <span>© {new Date().getFullYear()} Loader3D</span>
          <span>Сделано для логистов и складов</span>
        </div>
      </div>
    </footer>
  );
}
