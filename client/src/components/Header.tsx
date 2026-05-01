import { Menu } from 'lucide-react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [inspectorName] = useLocalStorage('inspectorName', '');
  const [activeProject] = useLocalStorage('activeProject', '');
  const [syncStatus] = useLocalStorage('syncStatus', 'offline');

  return (
    <header className="codify-header">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="p-1 hover:bg-muted rounded transition-colors"
        >
          <Menu size={20} />
        </button>
        <div className="codify-logo">
          CODIFY<span className="codify-logo-accent">.</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {activeProject && (
          <div className="text-xs text-muted-foreground">
            <span className="font-mono tracking-widest uppercase">Project:</span> {activeProject}
          </div>
        )}
        <div
          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono tracking-widest uppercase ${
            syncStatus === 'online'
              ? 'bg-green-500/20 text-green-500'
              : 'bg-yellow-500/20 text-yellow-500'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          {syncStatus === 'online' ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>
    </header>
  );
}
