import React, { useState } from 'react';
import { X, Music, AlertCircle } from 'lucide-react';

interface CreateSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    primaryArtist: string;
    releaseDate?: string;
    genre?: string;
    isrc?: string;
    catalogueReference?: string;
    notes?: string;
  }) => Promise<void>;
}

export const CreateSongModal: React.FC<CreateSongModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [primaryArtist, setPrimaryArtist] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [genre, setGenre] = useState('Amapiano');
  const [isrc, setIsrc] = useState('');
  const [catalogueReference, setCatalogueReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !primaryArtist.trim()) {
      setError('Song title and primary artist are required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        primaryArtist: primaryArtist.trim(),
        releaseDate: releaseDate || undefined,
        genre: genre || undefined,
        isrc: isrc.trim() || undefined,
        catalogueReference: catalogueReference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create rights record.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded border border-[#232936] bg-[#0f1218] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1d222d] pb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Create Rights Record</h2>
            <p className="text-xs text-[#7f8897] mt-0.5">Start capturing structured rights for a musical work.</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#5e6675] hover:text-white transition-colors p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#c5cbd4] mb-1">
                Song Title <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Amapiano Nights"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white placeholder-[#525b6c] focus:border-[#ffffff] focus:outline-hidden"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#c5cbd4] mb-1">
                Primary Artist <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Hloni Deep feat. Queen Lerato"
                value={primaryArtist}
                onChange={(e) => setPrimaryArtist(e.target.value)}
                className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white placeholder-[#525b6c] focus:border-[#ffffff] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#c5cbd4] mb-1">
                Genre
              </label>
              <input
                type="text"
                placeholder="e.g. Amapiano, Afro House"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white placeholder-[#525b6c] focus:border-[#ffffff] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#c5cbd4] mb-1">
                Release Date (Optional)
              </label>
              <input
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white placeholder-[#525b6c] focus:border-[#ffffff] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#c5cbd4] mb-1">
                ISRC (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. ZA-XXX-26-XXXXX"
                value={isrc}
                onChange={(e) => setIsrc(e.target.value)}
                className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white placeholder-[#525b6c] focus:border-[#ffffff] focus:outline-hidden font-mono"
              />
              <span className="text-[10px] text-[#5e6675]">Can be added or updated later</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#c5cbd4] mb-1">
                Catalogue Reference
              </label>
              <input
                type="text"
                placeholder="e.g. SSW-2026-003"
                value={catalogueReference}
                onChange={(e) => setCatalogueReference(e.target.value)}
                className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white placeholder-[#525b6c] focus:border-[#ffffff] focus:outline-hidden font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#c5cbd4] mb-1">
                Internal Notes
              </label>
              <textarea
                rows={2}
                placeholder="Studio location, project background, or agreement context..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded border border-[#262c38] bg-[#141820] px-3 py-2 text-xs text-white placeholder-[#525b6c] focus:border-[#ffffff] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-[#1d222d]">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#282f3d] bg-transparent px-3.5 py-1.5 text-xs font-medium text-[#8c94a0] hover:text-white hover:border-[#384255] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-[#ffffff] hover:bg-[#e2e2e2] text-[#0c0e12] px-4 py-1.5 text-xs font-semibold tracking-tight transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Creating...' : 'Create Rights Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
