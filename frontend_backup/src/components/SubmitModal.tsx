'use client';
import { useState } from 'react';

interface SubmitModalProps {
  onClose: () => void;
}

export default function SubmitModal({ onClose }: SubmitModalProps) {
  const [teamId, setTeamId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !file) return;

    setStatus('uploading');
    setErrorMsg('');

    const formData = new FormData();
    formData.append('submission_id', teamId);
    formData.append('binary', file);

    try {
      const res = await fetch('http://localhost:8000/api/submit', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }

      setStatus('success');
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'An unknown error occurred');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0b0c10] border border-cyan-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_0_40px_rgba(6,182,212,0.15)] animate-slide-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-900/40 to-transparent flex justify-between items-center">
          <h2 className="text-xl font-semibold text-cyan-50">Submit Engine</h2>
          <button 
            onClick={onClose}
            className="text-cyan-500/50 hover:text-cyan-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-cyan-100/70 mb-2">
              Contestant / Team ID
            </label>
            <input
              type="text"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder="e.g. team-alpha"
              className="w-full bg-cyan-950/30 border border-cyan-500/30 rounded-lg px-4 py-2.5 text-cyan-50 placeholder-cyan-500/40 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-cyan-100/70 mb-2">
              Engine Source Code (.cpp)
            </label>
            <div className="relative">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                required
              />
              <div className={`w-full border-2 border-dashed rounded-lg px-4 py-6 text-center transition-colors ${
                file ? 'border-cyan-500 bg-cyan-950/40' : 'border-cyan-500/30 bg-cyan-950/20 hover:border-cyan-500/60'
              }`}>
                {file ? (
                  <span className="text-cyan-300 font-medium">{file.name}</span>
                ) : (
                  <span className="text-cyan-500/70">Click to browse or drag and drop</span>
                )}
              </div>
            </div>
          </div>

          {status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {errorMsg}
            </div>
          )}

          {status === 'success' && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm">
              Successfully uploaded! Engine is booting...
            </div>
          )}

          {/* Footer */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={status === 'uploading' || !file || !teamId}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-cyan-950 font-bold py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]"
            >
              {status === 'uploading' ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-cyan-950" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploading...
                </>
              ) : (
                'Deploy to Sandbox 🚀'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
