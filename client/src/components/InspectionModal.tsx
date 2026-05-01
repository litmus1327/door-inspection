import { useState } from 'react';
import { X, Camera } from 'lucide-react';
import { DoorPin, DoorStatus } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface InspectionModalProps {
  pin: DoorPin | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (pin: DoorPin) => void;
  onStatusChange: (pinId: string, status: DoorStatus) => void;
  onRemove: (pinId: string) => void;
  allPins?: DoorPin[];
}

export default function InspectionModal({
  pin,
  isOpen,
  onClose,
  onSave,
  onStatusChange,
  onRemove,
  allPins = [],
}: InspectionModalProps) {
  const [editingPin, setEditingPin] = useState<DoorPin | null>(pin);
  const [photos, setPhotos] = useState<string[]>([]);

  if (!pin || !editingPin) return null;

  const statusColors: Record<DoorStatus, string> = {
    pass: 'bg-green-500 hover:bg-green-600',
    fail: 'bg-red-500 hover:bg-red-600',
    inaccessible: 'bg-orange-500 hover:bg-orange-600',
    not_inspected: 'bg-gray-400 hover:bg-gray-500',
  };

  const statusLabels: Record<DoorStatus, string> = {
    pass: 'Pass',
    fail: 'Fail',
    inaccessible: 'Inaccessible',
    not_inspected: 'Not Inspected',
  };

  const handleStatusChange = (status: DoorStatus) => {
    setEditingPin({ ...editingPin, status });
    onStatusChange(pin.id, status);
  };

  const handleIconNoChange = (value: string) => {
    const isDuplicate = allPins.some(p => p.id !== pin.id && p.iconNo === value);
    if (isDuplicate) {
      alert(`Icon No. ${value} is already in use.`);
      return;
    }
    setEditingPin({ ...editingPin, iconNo: value });
  };

  const handleAssetIdChange = (value: string) => {
    const isDuplicate = allPins.some(p => p.id !== pin.id && p.assetId && p.assetId === value);
    if (isDuplicate) {
      alert(`Asset ID ${value} is already assigned to another door.`);
      return;
    }
    setEditingPin({ ...editingPin, assetId: value || null });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      // For now, just store file names. In Phase 2, integrate with Supabase
      const newPhotos = Array.from(files).map((f) => f.name);
      setPhotos([...photos, ...newPhotos]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(editingPin);
    onClose();
  };

  const handleDelete = () => {
    if (confirm('Delete this pin?')) {
      onRemove(pin.id);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Door Inspection - Icon #{editingPin.iconNo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Selection */}
          <div>
            <label className="codify-label">Inspection Status</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(statusLabels) as DoorStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className={`py-2 px-3 rounded-sm font-semibold text-white text-sm transition-all ${
                    statusColors[status]
                  } ${editingPin.status === status ? 'ring-2 ring-offset-2 ring-foreground' : ''}`}
                >
                  {statusLabels[status]}
                </button>
              ))}
            </div>
          </div>

          {/* Pin Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="codify-label">Icon Number</label>
              <input
                type="text"
                value={editingPin.iconNo}
                onChange={(e) => handleIconNoChange(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-sm bg-background text-foreground"
              />
            </div>
            <div>
              <label className="codify-label">Asset ID</label>
              <input
                type="text"
                value={editingPin.assetId || ''}
                onChange={(e) => handleAssetIdChange(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-sm bg-background text-foreground"
              />
            </div>
          </div>

          {/* Grid Block */}
          {editingPin.gridBlock && (
            <div>
              <label className="codify-label">Grid Block</label>
              <div className="px-3 py-2 bg-muted text-muted-foreground rounded-sm">
                {editingPin.gridBlock}
              </div>
            </div>
          )}

          {/* Photo Section */}
          <div>
            <label className="codify-label mb-2 block">Photos</label>
            <div className="flex gap-2 mb-3">
              <label className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-sm cursor-pointer hover:bg-muted transition-all">
                <Camera size={16} />
                <span className="text-sm font-semibold">Add Photo</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, idx) => (
                  <div
                    key={idx}
                    className="relative bg-muted rounded-sm p-2 text-xs text-muted-foreground line-clamp-2"
                  >
                    {photo}
                    <button
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes Section */}
          <div>
            <label className="codify-label">Inspection Notes</label>
            <textarea
              placeholder="Add any notes about this door..."
              className="w-full px-3 py-2 border border-border rounded-sm bg-background text-foreground min-h-24 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 justify-between">
          <Button
            variant="destructive"
            onClick={handleDelete}
            className="mr-auto"
          >
            Delete Pin
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
