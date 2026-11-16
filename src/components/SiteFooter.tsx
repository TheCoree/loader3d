import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/Logo';
import { SUPPORT, telegramUrl } from '@/lib/legal';
import { TIERS_ENABLED } from '@/lib/tiers';

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  const className = 'text-white/55 transition-colors hover:text-white';
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
    <nav aria-label={title} className="lg:col-span-2">
      <p className="font-medium text-white">{title}</p>
      <ul className="mt-4 space-y-3">{children}</ul>
    </nav>
  );
}

/** The footer of the public pages (landing, documents): sections, account, documents and support. */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.07] bg-ink text-sm text-white">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-x-6 gap-y-12 px-5 pt-16 pb-10 sm:px-8 lg:grid-cols-12">
        <div className="col-span-2 lg:col-span-4">
          <Logo />
          <p className="mt-5 max-w-xs leading-relaxed text-white/45">
            3D-планирование загрузки фуры и контейнера: раскладка, вес, центр тяжести и PDF-схема для водителя.
          </p>
        </div>
        <Column title="Продукт">
          <FooterLink to="/#features">Возможности</FooterLink>
          <FooterLink to="/#how">Как это работает</FooterLink>
          {TIERS_ENABLED && <FooterLink to="/#pricing">Тарифы</FooterLink>}
          <FooterLink to="/#faq">Вопросы</FooterLink>
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
          <li className="text-white/40 first-letter:uppercase">{SUPPORT.hours}</li>
        </Column>
        <div className="col-span-2 flex flex-col gap-2 border-t border-white/[0.07] pt-8 text-white/40 sm:flex-row sm:justify-between lg:col-span-12">
          <span>© {new Date().getFullYear()} Loader3D</span>
          <span>Сделано для логистов и складов</span>
        </div>
      </div>
    </footer>
  );
}
