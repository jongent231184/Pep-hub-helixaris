import React from 'react';
import ResourcesManager from '../../components/coaching/ResourcesManager';

const CoachResources = () => (
  <div className="space-y-4" data-testid="coach-resources">
    <div>
      <h1 className="text-2xl font-black">Resources</h1>
      <p className="text-sm text-slate-600">Guides, videos and FAQs your Gold clients see under Resources in their portal.</p>
    </div>
    <ResourcesManager />
  </div>
);

export default CoachResources;
