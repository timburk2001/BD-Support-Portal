import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function LandingPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 bg-background">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            BD Support Portal
          </h1>
          <p className="text-muted-foreground text-lg">
            Submit and track your support requests in one place.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Link href="/login" className={cn(buttonVariants({ variant: 'default' }))}>
            Sign in
          </Link>
          <Link href="/signup" className={cn(buttonVariants({ variant: 'outline' }))}>
            Create account
          </Link>
        </div>
      </div>
    </main>
  )
}
