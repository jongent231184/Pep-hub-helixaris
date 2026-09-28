import React, { useState } from 'react';
import { Sparkles, Loader2, ChevronDown, Plus, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Products } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';

const EMPTY_PROFILE = {
  overview: '',
  molecular_class: '',
  molecular_formula: '',
  molecular_weight: '',
  sequence: '',
  receptor_target: '',
  signalling: '',
  study_systems: [],
  areas_of_research: [],
  key_finding: '',
  mechanism: '',
  limitations: '',
  open_questions: '',
  storage_handling: '',
  references: [],
  pubmed_query: '',
};

const asCsv = (arr) => (Array.isArray(arr) ? arr.join(', ') : '');
const fromCsv = (s) =>
  (s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Peptiology-style Research Profile editor for the admin product form.
 * Fully collapsible; ships an "AI generate" button that calls the backend.
 */
const ResearchProfileEditor = ({ productId, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const rp = value || EMPTY_PROFILE;
  const set = (patch) => onChange({ ...rp, ...patch });

  const generateWithAI = async () => {
    if (!productId) {
      toast({
        title: 'Save the product first',
        description: 'AI-generate needs an existing product to look up the name.',
        variant: 'destructive',
      });
      return;
    }
    setGenerating(true);
    try {
      const data = await Products.generateResearchProfile(productId);
      if (data?.research_profile) {
        onChange({ ...EMPTY_PROFILE, ...data.research_profile });
        setOpen(true);
        toast({ title: 'Research profile generated', description: 'Review the fields, edit as needed, then Save.' });
      } else {
        throw new Error(data?.error || 'Empty response');
      }
    } catch (e) {
      toast({
        title: 'AI generation failed',
        description: String(e.response?.data?.detail || e.message || e),
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const hasContent = (rp.overview || rp.mechanism || (rp.references || []).length > 0);

  return (
    <div className="border rounded-lg mt-4" data-testid="research-profile-editor">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
        data-testid="research-profile-toggle"
      >
        <div>
          <p className="font-bold text-sm uppercase tracking-wider">Research Profile</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Peptiology-style scientific content shown on the public product page.{' '}
            {hasContent ? <span className="text-emerald-600 font-semibold">✓ Populated</span> : <span className="text-amber-600 font-semibold">Empty</span>}
          </p>
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t p-4 space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={generateWithAI}
              disabled={generating}
              className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
              data-testid="research-profile-ai-generate"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Generating…' : 'AI-generate (Claude)'}
            </Button>
          </div>

          <div>
            <Label>Overview (3-4 sentences)</Label>
            <Textarea
              rows={3}
              value={rp.overview || ''}
              onChange={(e) => set({ overview: e.target.value })}
              className="mt-1"
              data-testid="rp-overview"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Molecular class</Label>
              <Input value={rp.molecular_class || ''} onChange={(e) => set({ molecular_class: e.target.value })} className="mt-1" data-testid="rp-molecular-class" />
            </div>
            <div>
              <Label>Molecular formula</Label>
              <Input value={rp.molecular_formula || ''} onChange={(e) => set({ molecular_formula: e.target.value })} className="mt-1" data-testid="rp-molecular-formula" />
            </div>
            <div>
              <Label>Molecular weight</Label>
              <Input value={rp.molecular_weight || ''} onChange={(e) => set({ molecular_weight: e.target.value })} className="mt-1" data-testid="rp-molecular-weight" />
            </div>
            <div>
              <Label>Receptor / molecular target</Label>
              <Input value={rp.receptor_target || ''} onChange={(e) => set({ receptor_target: e.target.value })} className="mt-1" data-testid="rp-receptor-target" />
            </div>
          </div>

          <div>
            <Label>Amino-acid sequence</Label>
            <Input value={rp.sequence || ''} onChange={(e) => set({ sequence: e.target.value })} className="mt-1 font-mono text-sm" placeholder="e.g. Aib-His-D-2-Nal-D-Phe-Lys-NH2" data-testid="rp-sequence" />
          </div>

          <div>
            <Label>Signalling / mechanism (short)</Label>
            <Textarea rows={2} value={rp.signalling || ''} onChange={(e) => set({ signalling: e.target.value })} className="mt-1" data-testid="rp-signalling" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Study systems <span className="text-xs text-slate-500">(comma-separated)</span></Label>
              <Textarea rows={2} value={asCsv(rp.study_systems)} onChange={(e) => set({ study_systems: fromCsv(e.target.value) })} className="mt-1" placeholder="Primary pituitary cells, Rat models, GH3 cell line" data-testid="rp-study-systems" />
            </div>
            <div>
              <Label>Areas of research <span className="text-xs text-slate-500">(comma-separated)</span></Label>
              <Textarea rows={2} value={asCsv(rp.areas_of_research)} onChange={(e) => set({ areas_of_research: fromCsv(e.target.value) })} className="mt-1" placeholder="GHS-R1a pharmacology, GH release, Neuroendocrine axis" data-testid="rp-areas" />
            </div>
          </div>

          <div>
            <Label>Key finding</Label>
            <Textarea rows={3} value={rp.key_finding || ''} onChange={(e) => set({ key_finding: e.target.value })} className="mt-1" data-testid="rp-key-finding" />
          </div>

          <div>
            <Label>Mechanism (detailed paragraph)</Label>
            <Textarea rows={4} value={rp.mechanism || ''} onChange={(e) => set({ mechanism: e.target.value })} className="mt-1" data-testid="rp-mechanism" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Important limitations</Label>
              <Textarea rows={2} value={rp.limitations || ''} onChange={(e) => set({ limitations: e.target.value })} className="mt-1" data-testid="rp-limitations" />
            </div>
            <div>
              <Label>Open research questions</Label>
              <Textarea rows={2} value={rp.open_questions || ''} onChange={(e) => set({ open_questions: e.target.value })} className="mt-1" data-testid="rp-open-questions" />
            </div>
          </div>

          <div>
            <Label>Storage & handling</Label>
            <Textarea rows={2} value={rp.storage_handling || ''} onChange={(e) => set({ storage_handling: e.target.value })} className="mt-1" data-testid="rp-storage" />
          </div>

          <div>
            <Label>PubMed search phrase</Label>
            <Input value={rp.pubmed_query || ''} onChange={(e) => set({ pubmed_query: e.target.value })} className="mt-1 font-mono text-sm" placeholder='"Ipamorelin"' data-testid="rp-pubmed-query" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>References</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => set({ references: [...(rp.references || []), { citation: '', url: '' }] })}
                className="gap-1 h-7"
                data-testid="rp-add-reference"
              >
                <Plus className="h-3 w-3" /> Add reference
              </Button>
            </div>
            <div className="space-y-2">
              {(rp.references || []).map((ref, i) => (
                <div key={i} className="flex gap-2 items-start" data-testid={`rp-reference-${i}`}>
                  <div className="flex-1 space-y-1">
                    <Input
                      value={ref.citation || ''}
                      onChange={(e) => set({
                        references: (rp.references || []).map((r, ix) => ix === i ? { ...r, citation: e.target.value } : r),
                      })}
                      placeholder="Author et al. Title. Journal Year."
                      className="text-sm"
                    />
                    <Input
                      value={ref.url || ''}
                      onChange={(e) => set({
                        references: (rp.references || []).map((r, ix) => ix === i ? { ...r, url: e.target.value } : r),
                      })}
                      placeholder="https://pubmed.ncbi.nlm.nih.gov/... (optional)"
                      className="text-xs text-slate-600"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => set({ references: (rp.references || []).filter((_, ix) => ix !== i) })}
                    className="h-8 w-8 text-red-500"
                    data-testid={`rp-remove-reference-${i}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(rp.references || []).length === 0 && (
                <p className="text-xs text-slate-500 italic">No references yet. Use "Add reference" or "AI-generate".</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResearchProfileEditor;
export { EMPTY_PROFILE };
