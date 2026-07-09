import { MapPin, FileText, Settings, ChevronRight, FolderOpen } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOpen: boolean;
  onClose?: () => void;
  activeProject?: string;
  onSwitchProject?: () => void;
}

const tabs = [
  { id: 'plans', label: 'Plans', icon: MapPin },
  { id: 'records', label: 'Inspection Records', icon: FileText },
  { id: 'config', label: 'Project Settings', icon: Settings },
];

export default function Sidebar({ activeTab, onTabChange, isOpen, onClose, activeProject, onSwitchProject }: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => onClose?.()}
        />
      )}
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border
        transform transition-transform duration-200
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:flex lg:flex-col
        ${!isOpen ? 'lg:hidden' : ''}
      `}>
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto pt-6 px-3">
        <div className="space-y-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-sm transition-all ${
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                }`}
              >
                <Icon size={18} />
                <span className="text-sm font-medium">{tab.label}</span>
                {isActive && <ChevronRight size={16} className="ml-auto" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        {onSwitchProject && (
          <button
            onClick={onSwitchProject}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-sm text-sidebar-foreground hover:bg-sidebar-accent transition-all"
          >
            <FolderOpen size={18} />
            <span className="text-sm font-medium truncate">
              {activeProject ? `Project: ${activeProject}` : 'Choose Project'}
            </span>
          </button>
        )}
        <p className="font-mono text-xs text-sidebar-foreground/60 px-1">v1.0.0</p>
      </div>
      </aside>
    </>
  );
}
