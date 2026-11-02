'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useAuth,
  useClerk,
} from '@clerk/nextjs';
import { Menu, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { AscleonLogo } from '@/components/ui/AscleonLogo';

const navItems = [
  { href: '/', label: 'Progress', match: '/' },
  { href: '/space/active', label: 'Study Space', match: '/space/active', extraMatch: '/books' },
  { href: '/library', label: 'Library', match: '/library' },
  { href: '/space/revision', label: 'Revision', match: '/space/revision' },

];

const isActiveRoute = (pathname: string, match: string, extraMatch?: string) =>
  match === '/'
    ? pathname === '/'
    : pathname.startsWith(match) ||
      (!!extraMatch && pathname.startsWith(extraMatch));

// Tabs that require an account; guests get the sign-in modal instead
const authRequired = new Set(['/space/active', '/space/revision', '/library']);

const Navbar = () => {
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useAuth();
  const clerk = useClerk();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Collapse marketing navbar inside the dedicated Study Space to maximize vertical viewing canvas
  const isStudySpace = pathname?.startsWith('/books/') || pathname === '/space/active';
  if (isStudySpace) {
    return null;
  }

  // Auth-gated tabs open the Clerk sign-in modal for guests; public tabs navigate
  const guardClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!isLoaded) {
      e.preventDefault();
      return;
    }
    if (!isSignedIn && authRequired.has(href)) {
      e.preventDefault();
      clerk.openSignIn();
    }
  };

  const clusterClass =
    'shadow-nav-deep border-2 border-[color:var(--ink)] bg-[color:var(--cream)]';

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3.5 pt-3 sm:px-6 md:px-8 lg:px-10 xl:px-12 sm:pt-4">
      <div className="relative mx-auto flex w-full max-w-[1840px] 2xl:max-w-[2160px] items-center justify-between gap-3">
        {/* Left: Brand Identity */}
        <Link
          href="/"
          className={cn(
            'group flex items-center gap-3 rounded-[1.35rem] px-4.5 py-2.5 sm:py-3 transition-transform active:scale-[0.98]',
            clusterClass
          )}
        >
          <AscleonLogo size={34} className="transition-transform duration-200 group-hover:scale-105" />
          <span className="font-serif text-xl sm:text-[21px] font-bold tracking-tight text-[color:var(--ink)]">
            Ascleon
          </span>
        </Link>

        {/* Center: Primary Navigation (Desktop) */}
        <nav
          aria-label="Primary"
          className={cn(
            'hidden items-center gap-1.5 rounded-full p-2 md:flex',
            'shadow-nav-deep border-2 border-[color:var(--ink)] bg-[color:var(--ink)]'
          )}
        >
          {navItems.map((item) => {
            const active = isActiveRoute(pathname, item.match, item.extraMatch);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => guardClick(e, item.href)}
                className={cn(
                  'rounded-full px-5 py-2.5 text-xs sm:text-[13px] font-bold tracking-wider transition-all uppercase flex items-center gap-2',
                  active
                    ? 'bg-[color:var(--cream)] text-[color:var(--ink)] shadow-xs'
                    : 'text-[color:var(--cream)]/75 hover:text-[color:var(--cream)] hover:bg-white/10'
                )}
              >
                <span>{item.label}</span>
                {item.href === '/space/revision' && (
                  <span className="rounded-full bg-[color:var(--orange)] px-2 py-0.5 text-[9.5px] font-black uppercase text-[color:var(--ink)]">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: Auth & CTAs (Desktop) */}
        <div className="hidden items-center gap-2.5 md:flex">
          <SignedOut>
            <SignInButton mode="modal">
              <button
                type="button"
                className={cn(
                  'cursor-pointer rounded-[1.35rem] px-5 py-2.5 sm:py-3 font-serif text-xs sm:text-[13px] font-bold uppercase tracking-wider text-[color:var(--ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0',
                  clusterClass
                )}
              >
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <div
              className={cn(
                'flex items-center rounded-full p-1.5',
                clusterClass
              )}
            >
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: 'h-9 w-9 sm:h-10 sm:w-10',
                  },
                }}
              />
            </div>
          </SignedIn>
        </div>

        {/* Mobile menu toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-label="Toggle navigation menu"
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-[1.15rem] text-[color:var(--ink)]',
              clusterClass
            )}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div className="mt-2 md:hidden">
          <div
            className={cn(
              'flex flex-col gap-2 rounded-2xl p-3 shadow-xl',
              clusterClass
            )}
          >
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const active = isActiveRoute(pathname, item.match, item.extraMatch);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => {
                      guardClick(e, item.href);
                      setOpen(false);
                    }}
                    className={cn(
                      'rounded-xl px-3 py-2 text-sm font-semibold uppercase tracking-wider transition-colors flex items-center justify-between',
                      active
                        ? 'bg-[color:var(--ink)] text-[color:var(--cream)]'
                        : 'text-[color:var(--ink)] hover:bg-black/5'
                    )}
                  >
                    <span>{item.label}</span>
                    {item.href === '/space/revision' && (
                      <span className="rounded-full bg-[color:var(--orange)] px-2 py-0.5 text-[10px] font-black uppercase text-[color:var(--ink)]">
                        Soon
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-2 border-t border-[color:var(--ink)]/15 pt-2">
              <SignedOut>
                <SignInButton mode="modal">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="w-full cursor-pointer rounded-xl bg-[color:var(--ink)] py-2 text-center font-serif text-sm font-bold uppercase tracking-wider text-[color:var(--cream)]"
                  >
                    Sign in
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-semibold text-[color:var(--ink)]">
                    Account
                  </span>
                  <UserButton />
                </div>
              </SignedIn>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
