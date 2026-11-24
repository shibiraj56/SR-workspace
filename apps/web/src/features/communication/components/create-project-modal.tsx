import React, { useState, useEffect } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import { extractItems } from '@/lib/normalize';
import { communicationApi } from '../api/communication-api';
import type { Project, ProjectListResponse } from '@/types/project';
import type { Conversation } from '@/types/communication';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, FolderKanban, AlertCircle, Loader2 } from 'lucide-react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (conversation: Conversation) => void;
}

export function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedProjectId('');
      setName('');
      setDescription('');
      setErrorMessage(null);
      setIsLoading(true);

      api
        .get<ProjectListResponse>('/api/v1/projects?pageSize=100')
        .then((res) => {
          const items = extractItems<Project>(res);
          setProjects(items);
          if (items.length > 0) {
            setSelectedProjectId(items[0].id);
            setName(`${items[0].name} Discussion`);
          }
        })
        .catch((err) => {
          setErrorMessage(err.message || 'Failed to load projects.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    const proj = projects.find((p) => p.id === projectId);
    if (proj && (!name || name.endsWith('Discussion'))) {
      setName(`${proj.name} Discussion`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      setErrorMessage('Please select a project.');
      return;
    }
    if (!name.trim()) {
      setErrorMessage('Discussion name is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const conv = await communicationApi.createConversation({
        type: 'PROJECT',
        projectId: selectedProjectId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onSuccess(conv);
      onClose();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to create project discussion.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <FolderKanban className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 text-sm">Project Discussion</h3>
              <p className="text-xs text-neutral-500">Connect a conversation to an existing project</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
              Select Project <span className="text-red-500">*</span>
            </label>
            {isLoading ? (
              <div className="flex items-center gap-2 py-2 text-xs text-neutral-400">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <p className="text-xs text-neutral-500 py-2">
                No active projects found in this workspace.
              </p>
            ) : (
              <select
                value={selectedProjectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-neutral-300 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
                required
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.projectCode}] {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
              Discussion Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. Website Redesign Discussion"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
              Topic / Purpose (Optional)
            </label>
            <Input
              type="text"
              placeholder="Key objectives for this project discussion..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting} size="sm">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim() || !selectedProjectId}
              size="sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  Creating...
                </>
              ) : (
                'Create Discussion'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
