import type { JobDraft } from '../../src/core/schema';

export const emptyDraft: JobDraft = {
  title: '',
  employer: '',
  location: '',
  body: '',
  sourceUrl: '',
  retainBody: false,
  salary: { min: null, max: null, currency: 'NZD', period: 'annual', hoursPerWeek: null },
};

export const legacySampleJob: JobDraft = {
  title: 'Senior DevOps Engineer',
  employer: 'Koru Labs · 合成示例',
  location: 'Auckland',
  sourceUrl: '',
  retainBody: false,
  salary: { min: '140000', max: '165000', currency: 'NZD', period: 'annual', hoursPerWeek: '40' },
  body: `This is a synthetic job advertisement created for testing SEEK FILTER. Koru Labs is a fictional employer.

We are looking for a Senior DevOps Engineer to join our platform team in Auckland. This is a permanent, full-time role, 40 hours per week. Base salary is NZD 140,000–165,000 per year.

You will design and maintain Linux infrastructure, automate deployment pipelines, and operate Kubernetes clusters. Build infrastructure as code with Terraform, improve monitoring and incident response, and work closely with software engineers to improve reliability.

You should have experience with cloud infrastructure, networking, CI/CD and scripting. The role includes maintaining system availability, troubleshooting production incidents and managing access controls.

Applicants must have existing New Zealand work rights. Visa sponsorship may be considered for exceptional candidates. No claim is made about employer accreditation.`,
};

// Test-only draft distinct from the retired, user-facing demo identity.
export const sampleJob: JobDraft = {
  ...legacySampleJob,
  employer: 'Test Platform Team',
};
