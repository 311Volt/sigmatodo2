import { Link, useNavigate } from 'react-router-dom';
import { Moon, Sun, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDarkMode } from '@/lib/darkMode';

interface Breadcrumb {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface TopBarProps {
  breadcrumbs?: Breadcrumb[];
}

export default function TopBar({ breadcrumbs = [] }: TopBarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();

  return (
    <header className="h-12 border-b flex items-center px-4 gap-2 shrink-0">
      <nav className="flex items-center gap-1 flex-1 min-w-0 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}
            {crumb.href ? (
              <Link to={crumb.href} className="text-muted-foreground hover:text-foreground truncate">
                {crumb.label}
              </Link>
            ) : crumb.onClick ? (
              <button onClick={crumb.onClick} className="text-muted-foreground hover:text-foreground truncate cursor-pointer">
                {crumb.label}
              </button>
            ) : (
              <span className={`truncate ${i === breadcrumbs.length - 1 ? 'font-medium' : 'text-muted-foreground'}`}>
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      <Button variant="ghost" size="icon" onClick={toggle} className="shrink-0">
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="shrink-0">
              <Avatar className="size-7">
                <AvatarImage src={user.avatarPath ?? undefined} />
                <AvatarFallback className="text-xs">
                  {user.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate(`/profile/${user.handle}`)}>
              My Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/profile/${user.handle}/edit`)}>
              Edit Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
