'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';
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
import { ArrowUpRight, Menu, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

const navItems = [
  { href: '/', label: 'Progress', match: '/' },
  { href: '/space/active', label: 'Space & Study', match: '/space/active' },
  { href: '/library', label: 'Library', match: '/library' },
  { href: '/space/revision', label: 'Revision', match: '/space/revision' },
];

const isActiveRoute = (pathname: string, match: string) =>
  match === '/' ? pathname === '/' : pathname.startsWith(match);

// Tabs that require an account; guests get the sign-in modal instead
const authRequired = new Set(['/space/active', '/space/revision']);

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
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="relative mx-auto flex w-full max-w-[1680px] items-center justify-between gap-3">
        {/* Brand cluster — separate pill at the start */}
        <Link
          href="/"
          className={cn(
            'flex h-13 shrink-0 items-center gap-2.5 rounded-full py-2 pl-3.5 pr-5 transition-transform active:scale-[0.98]',
            clusterClass,
          )}
        >
          <Image
            src="/assets/logo.png"
            alt="Bookify logo"
            width={30}
            height={30}
            className="size-7"
          />
          <span className="display pt-0.5 text-[19px] leading-none text-[color:var(--ink)] sm:text-[21px]">
            Bookify
          </span>
        </Link>

        {/* Center nav — separate rounded container in the middle */}
        <nav
          aria-label="Primary"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--ink)] p-1.5 shadow-nav-deep md:flex"
        >
          {navItems.map((item) => {
            const active = isActiveRoute(pathname, item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => guardClick(e, item.href)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] whitespace-nowrap transition-colors lg:px-5',
                  active
                    ? 'bg-[color:var(--orange)] text-[color:var(--ink)]'
                    : 'text-[#f4efe6]/80 hover:bg-white/10 hover:text-white',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster — profile circle kept separate at the end */}
        <div className="flex shrink-0 items-center gap-2">
          <SignedIn>
            <div
              className={cn('rounded-full p-[5px]', clusterClass)}
              title="Account"
            >
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'w-8 h-8 rounded-full',
                  },
                }}
              />
            </div>
          </SignedIn>

          <SignedOut>
            <SignInButton mode="modal">
              <button
                className={cn(
                  'hidden h-13 cursor-pointer items-center rounded-full px-5 text-[12px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] transition-transform hover:-translate-y-0.5 sm:flex',
                  'border-2 border-[color:var(--ink)] bg-[color:var(--orange)] shadow-nav-deep',
                )}
              >
                Sign in
              </button>
            </SignInButton>
          </SignedOut>

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={cn(
              'flex size-13 cursor-pointer items-center justify-center rounded-full text-[color:var(--ink)] transition-transform active:scale-95 md:hidden',
              clusterClass,
            )}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {open && (
        <div className="mx-auto mt-3 max-w-[440px] animate-in fade-in slide-in-from-top-2 rounded-[26px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-2 shadow-nav-deep duration-200 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            {navItems.map((item) => {
              const active = isActiveRoute(pathname, item.match);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(e) => {
                    guardClick(e, item.href);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-2xl px-4 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] transition-colors',
                    active
                      ? 'bg-[color:var(--orange)]'
                      : 'hover:bg-black/5',
                  )}
                >
                  {item.label}
                  <ArrowUpRight className="size-4" />
                </Link>
              );
            })}
          </nav>

          <SignedOut>
            <SignInButton mode="modal">
              <button
                onClick={() => setOpen(false)}
                className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-4 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[color:var(--cream)]"
              >
                Sign in
                <ArrowUpRight className="size-4" />
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      )}
    </header>
  );
};

export default Navbar;
