'use client'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs'
import React from 'react'

const navItems = [
    {href: '/', label: 'Library'},
    {href: '/books/new', label: 'Add new'},
    {href: '/subscriptions', label: 'Pricing'}
]

const Navbar = () => {
    const pathName = usePathname();

  return (
    <header className="sticky top-0 left-0 w-full z-40 bg-[#FAF7F2]/95 backdrop-blur-md border-b border-[#E7DECE] shadow-xs transition-all">
        <div className="max-w-7xl mx-auto px-5 w-full flex justify-between items-center py-3.5">
            <Link href="/" className="flex items-center gap-2.5">
                <Image src="/assets/logo.png" alt="Bookify Logo" width={32} height={32} />
                <h1 className="text-xl sm:text-2xl font-bold font-serif text-[#212A3B] tracking-tight">Bookify</h1>
            </Link>

            <nav className="flex items-center gap-6">
                <div className="flex items-center gap-6">
                    {navItems.map((item) => {
                        const isActive = pathName === item.href;
                        return (
                            <Link 
                                key={item.href} 
                                href={item.href} 
                                className={cn(
                                    "font-medium text-sm transition-colors",
                                    isActive 
                                        ? "text-[#8B3A2B] font-semibold" 
                                        : "text-[#6B5E50] hover:text-[#212A3B]"
                                )}
                            >
                                {item.label}
                            </Link>
                        )
                    })}
                </div>

                <div className="flex items-center gap-4">
                    <SignedOut>
                        <SignInButton mode="modal">
                            <button className="cursor-pointer text-sm font-semibold px-3 py-1.5 rounded-lg border border-[#DDD1C0] hover:bg-[#F0E6D8] text-[#212A3B] transition-colors">
                                Sign In
                            </button>
                        </SignInButton>
                    </SignedOut>

                    <SignedIn>
                        <UserButton 
                            appearance={{
                                elements: {
                                    avatarBox: "w-8 h-8",
                                    userButtonPopoverCard: "shadow-lg border border-[#E7DECE]",
                                }
                            }}
                        />
                    </SignedIn>
                </div>
            </nav>
        </div>
    </header>
  )
}

export default Navbar
